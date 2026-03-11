from __future__ import annotations

import time

from fastapi import APIRouter, File, HTTPException, UploadFile

from .memory_store import STORE
from .models import ApplyRequest, ResumeProfile
from .services.application_runner import start_application_run
from .services.file_extractor import UnsupportedFileTypeError, extract_text
from .services.resume_parser import ResumeParseError, parse_resume


router = APIRouter()


@router.post("/resume/upload")
async def resume_upload(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        text = extract_text(file.filename or "resume", content)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    profile = ResumeProfile(raw_text=text, source_filename=file.filename)
    profile_id = STORE.create_profile(profile)
    return {"profile_id": profile_id, "extracted_chars": len(text)}


@router.post("/resume/parse")
async def resume_parse(file: UploadFile = File(...)) -> dict:
    content = await file.read()
    try:
        text = extract_text(file.filename or "resume", content)
    except UnsupportedFileTypeError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    try:
        parsed = parse_resume(text)
    except ResumeParseError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e

    parsed.source_filename = file.filename
    profile_id = STORE.create_profile(parsed)
    return {"profile_id": profile_id, "profile": parsed.model_dump()}


@router.get("/profile/{profile_id}")
def get_profile(profile_id: str) -> dict:
    profile = STORE.get_profile(profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="profile not found")
    return {"profile_id": profile_id, "profile": profile.model_dump()}


@router.post("/apply")
def apply(req: ApplyRequest) -> dict:
    try:
        run = start_application_run(
            profile_id=req.profile_id, job_url=str(req.job_url), mode=req.mode
        )
    except KeyError:
        raise HTTPException(status_code=404, detail="profile not found")

    return {"run_id": run.run_id, "status": run.status, "created_at": run.created_at}


@router.get("/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = STORE.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="run not found")
    return {"run": run.model_dump(), "server_time": time.time()}

