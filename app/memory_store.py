from __future__ import annotations

import threading
import time
import uuid

from .models import ResumeProfile, RunLogEvent, RunRecord, RunStatus


class MemoryStore:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.profiles: dict[str, ResumeProfile] = {}
        self.runs: dict[str, RunRecord] = {}

    def create_profile(self, profile: ResumeProfile) -> str:
        with self._lock:
            profile_id = uuid.uuid4().hex[:12]
            self.profiles[profile_id] = profile
            return profile_id

    def get_profile(self, profile_id: str) -> ResumeProfile | None:
        with self._lock:
            return self.profiles.get(profile_id)

    def create_run(self, profile_id: str, job_url: str, mode: str) -> RunRecord:
        now = time.time()
        run = RunRecord(
            run_id=uuid.uuid4().hex[:12],
            profile_id=profile_id,
            job_url=job_url,
            created_at=now,
            updated_at=now,
            status=RunStatus.queued,
            mode=mode,  # type: ignore[arg-type]
        )
        with self._lock:
            self.runs[run.run_id] = run
        return run

    def get_run(self, run_id: str) -> RunRecord | None:
        with self._lock:
            return self.runs.get(run_id)

    def update_run_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        result: dict | None = None,
        error: str | None = None,
    ) -> None:
        with self._lock:
            run = self.runs.get(run_id)
            if not run:
                return
            run.status = status
            run.updated_at = time.time()
            if result is not None:
                run.result = result
            if error is not None:
                run.error = error

    def append_run_log(
        self,
        run_id: str,
        message: str,
        *,
        level: str = "info",
        data: dict | None = None,
    ) -> None:
        with self._lock:
            run = self.runs.get(run_id)
            if not run:
                return
            run.logs.append(
                RunLogEvent(ts=time.time(), level=level, message=message, data=data)
            )
            run.updated_at = time.time()


STORE = MemoryStore()

