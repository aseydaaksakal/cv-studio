"""Pytest configuration and shared fixtures."""

import json
import shutil
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import app
import session as session_module

# Sample CV data for testing
SAMPLE_CV = {
    "name": "Test User",
    "title": "Software Engineer",
    "sections": [
        {"heading": "Experience", "items": []},
        {"heading": "Skills", "items": []},
        {"heading": "Education", "items": []},
        {"heading": "Projects", "items": []},
        {"heading": "Languages", "items": []},
    ]
}


@pytest.fixture
def temp_session_dir():
    """Create temporary directory for session tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        old_kok = session_module.KOK
        session_module.KOK = Path(tmpdir)
        yield Path(tmpdir)
        session_module.KOK = old_kok


@pytest.fixture
def client():
    """FastAPI TestClient for API tests."""
    return TestClient(app)


@pytest.fixture
def new_session(temp_session_dir):
    """Create a new test session."""
    oid = session_module.yeni(ad="Test Session", kaynak="test.pdf")
    return oid


@pytest.fixture
def session_with_files(new_session, temp_session_dir):
    """Create session with dummy files."""
    oid = new_session
    session_dir = session_module.yol(oid)

    # Create dummy files
    for filename in ("cv_structured.json", "cv_layout.json", "cv_overrides.css", "cv_generated.html"):
        (session_dir / filename).write_text(f"dummy content for {filename}")

    return oid


# CV fixtures for commands/design/pipeline tests
@pytest.fixture
def cv0():
    """Sample CV for testing."""
    return SAMPLE_CV.copy()


@pytest.fixture
def cv1():
    """Another sample CV."""
    cv = SAMPLE_CV.copy()
    cv["name"] = "Different Name"
    return cv


@pytest.fixture
def cv_empty():
    """Empty CV for testing."""
    return {"name": "", "title": "", "sections": []}
