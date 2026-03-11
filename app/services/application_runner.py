from __future__ import annotations

import threading

from ..memory_store import STORE
from ..models import ResumeProfile, RunRecord
from .field_mapper import build_common_field_payload
from ..workers.nova_act_worker import run_autofill
from ..models import RunStatus


def start_application_run(*, profile_id: str, job_url: str, mode: str) -> RunRecord:
    profile: ResumeProfile | None = STORE.get_profile(profile_id)
    if profile is None:
        raise KeyError(f"Unknown profile_id: {profile_id}")

    run = STORE.create_run(profile_id=profile_id, job_url=job_url, mode=mode)
    field_payload = build_common_field_payload(profile)

    t = threading.Thread(
        target=_run_thread,
        kwargs={
            "run_id": run.run_id,
            "job_url": job_url,
            "field_payload": field_payload,
            "mode": mode,
        },
        daemon=True,
    )
    t.start()
    return run


def _run_thread(*, run_id: str, job_url: str, field_payload: dict, mode: str) -> None:
    try:
        run_autofill(
            run_id=run_id,
            job_url=job_url,
            field_payload=field_payload,
            mode=mode,
        )
    except Exception as e:  # noqa: BLE001
        STORE.update_run_status(run_id, status=RunStatus.failed, error=str(e))
        STORE.append_run_log(run_id, "Run failed", level="error", data={"error": str(e)})

