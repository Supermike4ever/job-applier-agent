from __future__ import annotations

from typing import Any

from ..models import ResumeProfile


def build_common_field_payload(profile: ResumeProfile) -> dict[str, Any]:
    """
    Normalized payload for typical application forms.

    The Nova Act worker (or dry-run) can translate this into site-specific actions.
    """
    payload: dict[str, Any] = {
        "full_name": profile.full_name,
        "email": profile.email,
        "phone": profile.phone,
        "location": profile.location,
        "linkedin": profile.linkedin,
        "github": profile.github,
        "skills": profile.skills,
        "work_authorization": profile.work_authorization.model_dump(),
    }

    # Keep the lists small in MVP; sites often want just most recent entry.
    if profile.education:
        payload["education"] = [profile.education[0].model_dump()]
    else:
        payload["education"] = []

    if profile.experience:
        payload["experience"] = [profile.experience[0].model_dump()]
    else:
        payload["experience"] = []

    return payload

