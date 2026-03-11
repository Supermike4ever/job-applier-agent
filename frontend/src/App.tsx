import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'

type ResumeProfile = Record<string, unknown>

type RunRecord = {
  run_id: string
  profile_id: string
  job_url: string
  status: 'queued' | 'running' | 'paused_for_review' | 'succeeded' | 'failed'
  created_at: number
  updated_at: number
  mode: 'dry_run' | 'nova_act'
  logs: Array<{ ts: number; level: string; message: string; data?: Record<string, unknown> | null }>
  result?: Record<string, unknown> | null
  error?: string | null
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000'

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, init)
  const contentType = res.headers.get('content-type') || ''
  const body = contentType.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const msg = typeof body === 'string' ? body : body?.detail || JSON.stringify(body)
    throw new ApiError(msg, res.status)
  }
  return body
}

function App() {
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [profileId, setProfileId] = useState<string>('')
  const [profile, setProfile] = useState<ResumeProfile | null>(null)
  const [jobUrl, setJobUrl] = useState<string>('')
  const [mode, setMode] = useState<'dry_run' | 'nova_act'>('dry_run')
  const [runId, setRunId] = useState<string>('')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollTimer = useRef<number | null>(null)

  const canParse = useMemo(() => !!resumeFile && !busy, [resumeFile, busy])
  const canApply = useMemo(() => !!profileId && !!jobUrl && !busy, [profileId, jobUrl, busy])

  useEffect(() => {
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
    }
  }, [])

  async function onParse() {
    if (!resumeFile) return
    setError(null)
    setBusy('Parsing resume…')
    try {
      const fd = new FormData()
      fd.append('file', resumeFile)
      const out = await apiFetch('/resume/parse', { method: 'POST', body: fd })
      setProfileId(out.profile_id)
      setProfile(out.profile)
      setRun(null)
      setRunId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onLoadProfile() {
    if (!profileId) return
    setError(null)
    setBusy('Loading profile…')
    try {
      const out = await apiFetch(`/profile/${encodeURIComponent(profileId)}`)
      setProfile(out.profile)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function onApply() {
    if (!profileId || !jobUrl) return
    setError(null)
    setBusy('Starting apply run…')
    try {
      const out = await apiFetch('/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile_id: profileId, job_url: jobUrl, mode }),
      })
      setRunId(out.run_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function refreshRun(id: string) {
    try {
      const out = await apiFetch(`/runs/${encodeURIComponent(id)}`)
      setRun(out.run as RunRecord)
    } catch (e) {
      // If the backend restarted, in-memory runs are gone; stop polling to avoid log spam.
      const status = e instanceof ApiError ? e.status : (e as any)?.status
      const message = e instanceof Error ? e.message : String(e)
      if (status === 404 || message.toLowerCase().includes('run not found')) {
        if (pollTimer.current) window.clearInterval(pollTimer.current)
        pollTimer.current = null
        setRun(null)
        setRunId('')
      }
      throw e
    }
  }

  useEffect(() => {
    if (!runId) return
    setError(null)
    refreshRun(runId).catch((e) => setError(e instanceof Error ? e.message : String(e)))

    if (pollTimer.current) window.clearInterval(pollTimer.current)
    pollTimer.current = window.setInterval(() => {
      refreshRun(runId).catch(() => {})
    }, 800)

    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current)
      pollTimer.current = null
    }
  }, [runId])

  const statusPill = run?.status
    ? `status ${run.status}${run.status === 'failed' ? ` (${run.error || 'error'})` : ''}`
    : 'status —'

  return (
    <div className="page">
      <header className="header">
        <div>
          <div className="title">Job Applier MVP</div>
          <div className="subtitle">
            Backend: <code>{API_BASE}</code>
          </div>
        </div>
        <div className="pill">{busy ? busy : statusPill}</div>
      </header>

      {error ? (
        <div className="alert" role="alert">
          <div className="alertTitle">Error</div>
          <div className="alertBody">{error}</div>
        </div>
      ) : null}

      <div className="grid">
        <section className="card">
          <div className="cardTitle">1) Upload & parse resume</div>
          <div className="row">
            <input
              type="file"
              accept=".pdf,.doc,.docx"
              onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
              disabled={!!busy}
            />
            <button onClick={onParse} disabled={!canParse}>
              Parse
            </button>
          </div>
          <div className="hint">
            Uses Groq if <code>GROQ_API_KEY</code> is set on the backend; otherwise a heuristic parser.
          </div>

          <div className="divider" />

          <div className="row">
            <label className="label">
              Profile ID
              <input
                value={profileId}
                onChange={(e) => setProfileId(e.target.value)}
                placeholder="e.g. abc123…"
                disabled={!!busy}
              />
            </label>
            <button onClick={onLoadProfile} disabled={!profileId || !!busy}>
              Load
            </button>
          </div>
        </section>

        <section className="card">
          <div className="cardTitle">2) Start application run (stops before submit)</div>
          <div className="row">
            <label className="label grow">
              Job URL
              <input
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                placeholder="https://…"
                disabled={!!busy}
              />
            </label>
          </div>
          <div className="row">
            <label className="label">
              Mode
              <select value={mode} onChange={(e) => setMode(e.target.value as any)} disabled={!!busy}>
                <option value="dry_run">dry_run (recommended)</option>
                <option value="nova_act">nova_act (real browser, best-effort)</option>
              </select>
            </label>
            <button onClick={onApply} disabled={!canApply}>
              Apply
            </button>
          </div>
          <div className="hint">
            <code>dry_run</code> simulates steps and pauses at <code>paused_for_review</code>.{' '}
            <code>nova_act</code> uses the Nova Act SDK (requires <code>NOVA_ACT_API_KEY</code> on the backend) and should
            still stop before final submit.
          </div>
        </section>

        <section className="card span2">
          <div className="cardTitle">Parsed profile JSON</div>
          <pre className="pre">{profile ? JSON.stringify(profile, null, 2) : '—'}</pre>
        </section>

        <section className="card span2">
          <div className="cardTitle">Run logs</div>
          <div className="row">
            <label className="label">
              Run ID
              <input value={runId} onChange={(e) => setRunId(e.target.value)} disabled={!!busy} />
            </label>
            <button
              onClick={() => runId && refreshRun(runId)}
              disabled={!runId || !!busy}
              title="Fetch once"
            >
              Refresh
            </button>
          </div>
          <div className="logs">
            {run?.logs?.length ? (
              run.logs
                .slice()
                .reverse()
                .map((ev, idx) => (
                  <div className="logRow" key={`${ev.ts}-${idx}`}>
                    <div className={`lvl lvl-${ev.level}`}>{ev.level}</div>
                    <div className="msg">
                      <div className="msgTop">
                        <span className="msgText">{ev.message}</span>
                        <span className="ts">{new Date(ev.ts * 1000).toLocaleTimeString()}</span>
                      </div>
                      {ev.data ? <pre className="preInline">{JSON.stringify(ev.data, null, 2)}</pre> : null}
                    </div>
                  </div>
                ))
            ) : (
              <div className="muted">—</div>
            )}
          </div>
          <div className="hint">
            Tip: a completed run pauses at <code>paused_for_review</code>. If Nova Act fails or isn’t configured, the
            backend will log a warning/error and fall back to <code>dry_run</code>.
          </div>
        </section>
      </div>
    </div>
  )
}

export default App
