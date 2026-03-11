from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

from .memory_store import STORE
from .services.application_runner import start_application_run
from .services.file_extractor import extract_text
from .services.resume_parser import parse_resume


def main(argv: list[str] | None = None) -> int:
    load_dotenv()

    p = argparse.ArgumentParser(prog="job-applier-agent")
    sub = p.add_subparsers(dest="cmd", required=True)

    parse_p = sub.add_parser("parse", help="Extract + parse a resume file")
    parse_p.add_argument("resume_path", type=Path)

    apply_p = sub.add_parser("apply", help="Parse resume and start a dry-run apply")
    apply_p.add_argument("resume_path", type=Path)
    apply_p.add_argument("job_url", type=str)
    apply_p.add_argument("--mode", choices=["dry_run", "nova_act"], default="dry_run")

    args = p.parse_args(argv)

    if args.cmd == "parse":
        content = args.resume_path.read_bytes()
        text = extract_text(args.resume_path.name, content)
        profile = parse_resume(text)
        print(json.dumps(profile.model_dump(), indent=2, ensure_ascii=False))
        return 0

    if args.cmd == "apply":
        content = args.resume_path.read_bytes()
        text = extract_text(args.resume_path.name, content)
        profile = parse_resume(text)
        profile.source_filename = args.resume_path.name
        profile_id = STORE.create_profile(profile)
        run = start_application_run(profile_id=profile_id, job_url=args.job_url, mode=args.mode)

        # Poll until paused/failed.
        while True:
            rr = STORE.get_run(run.run_id)
            if not rr:
                print("Run disappeared", file=sys.stderr)
                return 2
            if rr.status in {"paused_for_review", "failed", "succeeded"}:
                print(json.dumps(rr.model_dump(), indent=2, ensure_ascii=False))
                return 0 if rr.status != "failed" else 1
            time.sleep(0.1)

    return 2


if __name__ == "__main__":
    raise SystemExit(main())

