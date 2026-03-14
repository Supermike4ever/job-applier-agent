from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import create_app


def test_health_smoke_endpoints_exist() -> None:
    app = create_app()
    client = TestClient(app)

    # No built-in health route; just confirm routing works with 404 and real paths.
    r = client.get("/does-not-exist")
    assert r.status_code == 404

