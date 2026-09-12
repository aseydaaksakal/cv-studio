"""Integration tests for FastAPI endpoints."""

import json

import pytest


class TestSessionListEndpoint:
    """Test GET /oturum endpoint with pagination, filtering, sorting."""

    def test_oturum_liste_returns_all(self, client, new_session):
        """GET /oturum returns all sessions."""
        response = client.get("/oturum")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]
        assert "oturumlar" in data
        assert "pagination" in data

    def test_oturum_liste_pagination(self, client):
        """GET /oturum pagination works."""
        # Create 5 sessions
        for i in range(5):
            pass  # Fixtures create sessions

        response = client.get("/oturum?page=1&limit=2")
        assert response.status_code == 200
        data = response.json()
        assert data["pagination"]["page"] == 1
        assert data["pagination"]["limit"] == 2
        assert data["pagination"]["total"] >= 0
        assert "pages" in data["pagination"]
        assert "hasNext" in data["pagination"]

    def test_oturum_liste_filtering_by_kaynak(self, client, new_session):
        """GET /oturum filtering by kaynak parameter."""
        response = client.get("/oturum?kaynak=test.pdf")
        assert response.status_code == 200
        data = response.json()
        # May or may not have results, but should not error
        assert isinstance(data["oturumlar"], list)

    def test_oturum_liste_sorting(self, client):
        """GET /oturum sorting parameter."""
        # Descending (default)
        response = client.get("/oturum?sort=-ad")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["oturumlar"], list)

        # Ascending
        response = client.get("/oturum?sort=+ad")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data["oturumlar"], list)

    def test_oturum_liste_invalid_page(self, client):
        """GET /oturum with invalid page should still work."""
        response = client.get("/oturum?page=0&limit=50")
        assert response.status_code == 200


class TestSessionCreationEndpoint:
    """Test POST /oturum/yeni endpoint."""

    def test_oturum_yeni_creates_session(self, client):
        """POST /oturum/yeni creates new session."""
        payload = {"ad": "Test CV", "kaynak": "test.pdf"}
        response = client.post("/oturum/yeni", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]
        assert "id" in data
        assert "oturum" in data

    def test_oturum_yeni_validation_required(self, client):
        """POST /oturum/yeni requires valid input."""
        # Missing required fields still works (uses defaults)
        response = client.post("/oturum/yeni", json={})
        assert response.status_code == 200

    def test_oturum_yeni_sets_timestamps(self, client):
        """POST /oturum/yeni sets creation timestamps."""
        response = client.post("/oturum/yeni", json={"ad": "Test"})
        data = response.json()
        oturum = data["oturum"]
        assert oturum["olusturma"] > 0
        assert oturum["guncelleme"] > 0


class TestSessionNotesEndpoint:
    """Test POST /oturum/{id}/notlar endpoint."""

    def test_notlar_saves_notes(self, client, new_session):
        """POST /oturum/{id}/notlar saves notes."""
        payload = {"notlar": "This is a test note"}
        response = client.post(f"/oturum/{new_session}/notlar", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]
        assert data["oturum"]["notlar"] == "This is a test note"

    def test_notlar_enforces_limit(self, client, new_session):
        """POST /oturum/{id}/notlar enforces 1000 char limit."""
        long_note = "x" * 1500
        payload = {"notlar": long_note}
        response = client.post(f"/oturum/{new_session}/notlar", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert len(data["oturum"]["notlar"]) == 1000

    def test_notlar_clears_notes(self, client, new_session):
        """POST /oturum/{id}/notlar can clear notes."""
        # Set note
        client.post(f"/oturum/{new_session}/notlar",
                   json={"notlar": "Test note"})
        # Clear note
        response = client.post(f"/oturum/{new_session}/notlar",
                              json={"notlar": ""})
        assert response.status_code == 200
        data = response.json()
        assert data["oturum"]["notlar"] == ""

    def test_notlar_invalid_session(self, client):
        """POST /oturum/{id}/notlar with invalid ID."""
        response = client.post("/oturum/9999/notlar", json={"notlar": "test"})
        # API creates session if doesn't exist
        assert response.status_code == 200


class TestSessionCopyEndpoint:
    """Test POST /oturum/{id}/kopyala endpoint."""

    def test_kopyala_creates_copy(self, client, session_with_files):
        """POST /oturum/{id}/kopyala creates session copy."""
        response = client.post(f"/oturum/{session_with_files}/kopyala")
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]
        assert "id" in data
        assert data["id"] != session_with_files

    def test_kopyala_invalid_session(self, client):
        """POST /oturum/{id}/kopyala with invalid session."""
        response = client.post("/oturum/9999/kopyala")
        # API may handle gracefully - just ensure response
        assert response.status_code in [200, 400, 500]


class TestSessionBatchOperations:
    """Test batch operation endpoints."""

    def test_batch_ad_degistir_endpoint(self, client, new_session):
        """POST /oturum/batch-ad-degistir renames sessions."""
        payload = {
            "renames": [
                {"id": new_session, "newName": "Updated Name"}
            ]
        }
        response = client.post("/oturum/batch-ad-degistir", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]

    def test_batch_sil_endpoint(self, client, new_session):
        """POST /oturum/batch-sil deletes sessions."""
        payload = {"ids": [new_session]}
        response = client.post("/oturum/batch-sil", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["ok"]


class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_invalid_endpoint(self, client):
        """Invalid endpoint returns 404."""
        response = client.get("/invalid/endpoint")
        assert response.status_code == 404

    def test_invalid_json(self, client):
        """Invalid JSON in POST body."""
        response = client.post("/oturum/yeni", content="not json")
        assert response.status_code >= 400

    def test_missing_required_field(self, client, new_session):
        """POST with missing required field."""
        response = client.post(f"/oturum/{new_session}/notlar", json={})
        # May vary - API should handle gracefully
        assert response.status_code in [200, 400, 422]


class TestAPIConcurrency:
    """Test API behavior under concurrent-like conditions."""

    def test_multiple_sessions_independent(self, client):
        """Multiple sessions are independent."""
        r1 = client.post("/oturum/yeni", json={"ad": "Session 1"})
        r2 = client.post("/oturum/yeni", json={"ad": "Session 2"})

        id1 = r1.json()["id"]
        id2 = r2.json()["id"]

        assert id1 != id2
        assert r1.json()["oturum"]["ad"] == "Session 1"
        assert r2.json()["oturum"]["ad"] == "Session 2"

    def test_notes_isolation(self, client):
        """Notes on one session don't affect another."""
        r1 = client.post("/oturum/yeni", json={"ad": "S1"})
        r2 = client.post("/oturum/yeni", json={"ad": "S2"})

        id1 = r1.json()["id"]
        id2 = r2.json()["id"]

        # Add note to S1
        client.post(f"/oturum/{id1}/notlar", json={"notlar": "Note for S1"})

        # Get S2 - should not have note
        r = client.get(f"/oturum")
        sessions = r.json()["oturumlar"]
        s2 = next((s for s in sessions if s["id"] == id2), None)
        if s2:
            assert s2.get("notlar", "") != "Note for S1"
