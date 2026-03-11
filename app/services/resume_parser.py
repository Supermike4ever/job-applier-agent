from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

from ..models import ResumeProfile, WorkAuthorization


EMAIL_RE = re.compile(r"([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)")
PHONE_RE = re.compile(
    r"(\+?\d{1,3}[\s.-]?)?(\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}"
)
LINKEDIN_RE = re.compile(r"(https?://(www\.)?linkedin\.com/[^\s)]+)", re.I)
GITHUB_RE = re.compile(r"(https?://(www\.)?github\.com/[^\s)]+)", re.I)


class ResumeParseError(RuntimeError):
    pass


def parse_resume(text: str) -> ResumeProfile:
    """
    Parse resume text into structured JSON.

    - If `GROQ_API_KEY` is present, uses Groq's OpenAI-compatible chat API directly.
    - Otherwise falls back to a heuristic parser (good enough for MVP plumbing).
    """
    api_key = os.getenv("GROQ_API_KEY")
    if api_key:
        try:
            data = _parse_with_groq(text, api_key)
            profile = ResumeProfile.model_validate(data)
        except Exception as e:  # noqa: BLE001
            raise ResumeParseError(f"Groq parse failed: {e}") from e
        profile.raw_text = text
        return profile

    profile = _parse_heuristic(text)
    profile.raw_text = text
    return profile


def _parse_with_groq(text: str, api_key: str) -> dict[str, Any]:
    # Groq is OpenAI-compatible; avoid extra deps.
    model = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    url = "https://api.groq.com/openai/v1/chat/completions"
    system = (
        "You are a resume parser. Return ONLY valid JSON that matches the schema. "
        "If a field is unknown, use null or empty list."
    )
    schema_hint = {
        "full_name": "",
        "email": "",
        "phone": "",
        "location": "",
        "linkedin": "",
        "github": "",
        "education": [],
        "experience": [],
        "projects": [],
        "skills": [],
        "work_authorization": {"authorized_us": None, "requires_sponsorship": None},
    }
    user = f"Resume text:\n{text}\n\nSchema example:\n{json.dumps(schema_hint)}"

    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.0,
    }

    headers = {"Authorization": f"Bearer {api_key}"}
    with httpx.Client(timeout=60.0) as client:
        # Attempt 1: request strict JSON object if the API supports it.
        out = _post_chat(
            client,
            url,
            headers=headers,
            payload={**payload, "response_format": {"type": "json_object"}},
        )
        if out is None:
            # Attempt 2: retry without response_format; then JSON-extract from content.
            out = _post_chat(client, url, headers=headers, payload=payload)
            if out is None:
                raise ResumeParseError("Groq request failed (no response body)")

    content = out["choices"][0]["message"]["content"]
    return _loads_json_from_text(content)


def _post_chat(
    client: httpx.Client,
    url: str,
    *,
    headers: dict[str, str],
    payload: dict[str, Any],
) -> dict[str, Any] | None:
    r = client.post(url, headers=headers, json=payload)
    if r.status_code >= 400:
        # Return None to allow retry strategies; include server error detail.
        detail = r.text.strip()
        if detail:
            raise ResumeParseError(f"Groq HTTP {r.status_code}: {detail}")
        raise ResumeParseError(f"Groq HTTP {r.status_code}")
    try:
        return r.json()
    except Exception:  # noqa: BLE001
        return None


def _loads_json_from_text(content: str) -> dict[str, Any]:
    """
    Parse a JSON object either from pure JSON content or from a response that
    contains JSON surrounded by extra text/markdown.
    """
    try:
        data = json.loads(content)
        if isinstance(data, dict):
            return data
    except Exception:  # noqa: BLE001
        pass

    m = re.search(r"\{[\s\S]*\}", content)
    if not m:
        raise ResumeParseError("Model did not return a JSON object")
    return json.loads(m.group(0))


def _parse_heuristic(text: str) -> ResumeProfile:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    first_line = lines[0] if lines else None

    email = _first_match(EMAIL_RE, text)
    phone = _first_match(PHONE_RE, text)
    linkedin = _first_match(LINKEDIN_RE, text)
    github = _first_match(GITHUB_RE, text)

    # Naive: treat first non-empty line as name if it doesn't look like an email/URL.
    full_name = None
    if first_line and not EMAIL_RE.search(first_line) and "http" not in first_line.lower():
        full_name = first_line[:120]

    skills = _extract_skills(lines)
    wa = WorkAuthorization(authorized_us=None, requires_sponsorship=None)

    return ResumeProfile(
        full_name=full_name,
        email=email,
        phone=phone,
        linkedin=linkedin,
        github=github,
        skills=skills,
        work_authorization=wa,
    )


def _first_match(rx: re.Pattern[str], text: str) -> str | None:
    m = rx.search(text)
    if not m:
        return None
    return m.group(0)


def _extract_skills(lines: list[str]) -> list[str]:
    skills: list[str] = []
    for ln in lines:
        if ln.lower().startswith("skills"):
            _, _, rest = ln.partition(":")
            if rest.strip():
                skills.extend([s.strip() for s in rest.split(",") if s.strip()])
    # de-dupe while preserving order
    seen: set[str] = set()
    out: list[str] = []
    for s in skills:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            out.append(s)
    return out

