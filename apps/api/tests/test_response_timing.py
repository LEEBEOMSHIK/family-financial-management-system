"""Synthetic DB profiling; no statements, identities or response bodies logged."""

import time

import psycopg
from test_auth import BASE, accounts, client, login  # noqa: F401
from test_postgres import database  # noqa: F401


def test_connection_profile(accounts, monkeypatch):  # noqa: F811 - pytest fixture
    browser = client(accounts)
    original = psycopg.connect
    samples = []

    def connect(*args, **kwargs):
        start = time.perf_counter()
        conn = original(*args, **kwargs)
        samples.append((time.perf_counter() - start) * 1000)
        return conn

    monkeypatch.setattr(psycopg, "connect", connect)
    calls = [
        ("login", lambda: login(browser)),
        ("session", lambda: browser.get("/api/v1/session")),
        ("dashboard", lambda: browser.get(BASE + "/dashboard")),
    ]
    for name, call in calls:
        samples.clear()
        start = time.perf_counter()
        response = call()
        assert response.status_code == 200
        assert len(samples) <= {"login": 7, "session": 4, "dashboard": 6}[name]
        print(
            {
                "endpoint": name,
                "connections": len(samples),
                "connect_ms": round(sum(samples)),
                "total_ms": round((time.perf_counter() - start) * 1000),
            }
        )
