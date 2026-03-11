from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass

from ..memory_store import STORE
from ..models import RunStatus


@dataclass(frozen=True)
class NovaActConfig:
    api_key: str | None


def get_config() -> NovaActConfig:
    return NovaActConfig(api_key=os.getenv("NOVA_ACT_API_KEY"))

#
# Keep Nova Act sessions alive so the browser stays open after a run finishes.
# Keyed by run_id.
#
ACTIVE_NOVA_SESSIONS: dict[str, object] = {}


def run_autofill(
    *,
    run_id: str,
    job_url: str,
    field_payload: dict,
    mode: str,
) -> None:
    """
    MVP worker.

    - `dry_run`: simulates a browser run and pauses before submit
    - `nova_act`: uses the Nova Act SDK to drive a real browser session (best-effort)
    """
    STORE.update_run_status(run_id, RunStatus.running)
    STORE.append_run_log(run_id, "Starting application run", data={"job_url": job_url})

    if mode == "nova_act":
        if not get_config().api_key:
            STORE.append_run_log(
                run_id,
                "NOVA_ACT_API_KEY missing; falling back to dry_run behavior",
                level="warning",
            )
        else:
            if _run_with_nova_act(run_id=run_id, job_url=job_url, field_payload=field_payload):
                STORE.update_run_status(
                    run_id,
                    RunStatus.paused_for_review,
                    result={"next": "review_in_browser_then_submit_manually"},
                )
                return

    # Simulated steps with useful logs (so `/runs/{id}` is meaningful).
    steps = [
        ("Open application page", {"url": job_url}),
        ("Detect form fields", {"strategy": "common_fields"}),
        ("Fill fields", {"filled_keys": [k for k, v in field_payload.items() if v]}),
        ("Stop before submit (review)", {"action": "pause"}),
    ]
    for msg, data in steps:
        STORE.append_run_log(run_id, msg, data=data)
        time.sleep(0.2)

    STORE.update_run_status(
        run_id,
        RunStatus.paused_for_review,
        result={"next": "user_review_and_submit_in_browser"},
    )


def _run_with_nova_act(*, run_id: str, job_url: str, field_payload: dict) -> bool:
    """
    Returns True if a Nova Act run was attempted and completed without raising.
    Returns False if Nova Act is unavailable and we should fall back.
    """
    try:
        from nova_act import NovaAct  # type: ignore
    except Exception as e:  # noqa: BLE001
        STORE.append_run_log(
            run_id,
            "Nova Act SDK not installed; falling back to dry_run behavior",
            level="warning",
            data={"error": str(e)},
        )
        return False

    STORE.append_run_log(run_id, "Launching Nova Act browser session", data={"starting_page": job_url})

    prompt = _build_prompt(field_payload)
    STORE.append_run_log(run_id, "Dispatching Nova Act instruction", data={"prompt_preview": prompt[:800]})

    try:
        # Do NOT use the context manager here: it closes Chrome on exit.
        # We keep the session alive in-memory so the browser/tab stays open for review.
        nova = NovaAct(starting_page=job_url)
        nova.start()
        nova.act(prompt)
        ACTIVE_NOVA_SESSIONS[run_id] = nova
    except Exception as e:  # noqa: BLE001
        STORE.append_run_log(
            run_id,
            "Nova Act run errored; falling back to dry_run behavior",
            level="error",
            data={"error": str(e)},
        )
        return False

    STORE.append_run_log(
        run_id,
        "Nova Act finished steps (stopped before submit). Browser left open for review.",
    )
    return True


def _build_prompt(field_payload: dict) -> str:
    # Keep prompt concise and deterministic; Nova Act tends to be more reliable
    # when workflows are broken into explicit requirements.
    filled = {k: v for k, v in field_payload.items() if v not in (None, "", [], {})}
    return (
        "You are filling out a job application form in a browser.\n"
        "Rules:\n"
        "- Fill as many relevant fields as you can using the provided candidate data.\n"
        "- Do NOT click any final Submit/Apply button that would submit the application.\n"
        "- Stop when the application looks ready for review (submit button visible is OK).\n"
        "- If a required field is missing from the data, leave it blank.\n"
        "- Prefer existing autofill suggestions if they match the data.\n"
        "\n"
        "Candidate data (JSON):\n"
        f"{json.dumps(filled, ensure_ascii=False)}\n"
        "\n"
        "Common mappings:\n"
        "- full_name → Name / Full name\n"
        "- email → Email\n"
        "- phone → Phone\n"
        "- location → City / Location\n"
        "- linkedin → LinkedIn URL\n"
        "- github → GitHub URL\n"
        "- work_authorization.authorized_us / requires_sponsorship → Work authorization questions\n"
    )
