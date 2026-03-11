from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class WorkAuthorization(BaseModel):
    authorized_us: bool | None = None
    requires_sponsorship: bool | None = None


class EducationItem(BaseModel):
    school: str | None = None
    degree: str | None = None
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    location: str | None = None


class ExperienceItem(BaseModel):
    company: str | None = None
    title: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    bullets: list[str] = Field(default_factory=list)


class ProjectItem(BaseModel):
    name: str | None = None
    description: str | None = None
    url: str | None = None
    bullets: list[str] = Field(default_factory=list)


class ResumeProfile(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    location: str | None = None
    linkedin: str | None = None
    github: str | None = None
    education: list[EducationItem] = Field(default_factory=list)
    experience: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    skills: list[str] = Field(default_factory=list)
    work_authorization: WorkAuthorization = Field(default_factory=WorkAuthorization)

    raw_text: str | None = None
    source_filename: str | None = None


class ApplyRequest(BaseModel):
    profile_id: str
    job_url: HttpUrl
    mode: Literal["dry_run", "nova_act"] = "dry_run"


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    paused_for_review = "paused_for_review"
    succeeded = "succeeded"
    failed = "failed"


class RunLogEvent(BaseModel):
    ts: float
    level: Literal["debug", "info", "warning", "error"] = "info"
    message: str
    data: dict[str, Any] | None = None


class RunRecord(BaseModel):
    run_id: str
    profile_id: str
    job_url: str
    status: RunStatus = RunStatus.queued
    created_at: float
    updated_at: float
    mode: Literal["dry_run", "nova_act"] = "dry_run"
    logs: list[RunLogEvent] = Field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None

