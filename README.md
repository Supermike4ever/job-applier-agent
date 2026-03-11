# Job Applier Agent — Backend MVP

Implements the backend-first MVP described in `dev-plan.md`.

## Run the API

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API docs at `http://127.0.0.1:8000/docs`.

## Run the frontend (React)

```bash
cd frontend
npm install
npm run dev
```

If your backend isn't at `http://127.0.0.1:8000`, create `frontend/.env.local`:

```bash
cp frontend/.env.template frontend/.env.local
```

## Quick CLI (no server)

```bash
python -m app.cli parse path/to/resume.pdf
python -m app.cli apply path/to/resume.pdf "https://example.com/job/apply"
```

## Environment (optional)

- `GROQ_API_KEY`: enables LLM resume parsing via Groq (fallback is heuristic parsing)
- `GROQ_MODEL`: defaults to `llama-3.3-70b-versatile`
- `NOVA_ACT_API_KEY`: enables `mode="nova_act"` browser automation via the `nova-act` SDK

## Nova Act notes

- The first `nova-act` run may take 1–2 minutes while it installs Playwright browser dependencies.
- The automation is **best-effort** and always aims to stop at a review point (no final submit).
- In `mode="nova_act"`, the backend will **leave the browser open** after the run so you can review before submitting.

