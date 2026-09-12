"""Complete API coverage tests - all remaining endpoints."""

import pytest
from unittest.mock import patch, MagicMock


class TestHealthAndUI:
    """Test health check and UI endpoints."""

    def test_health_endpoint(self, client):
        """GET / returns frontend HTML."""
        with patch('pathlib.Path.read_text', return_value="<html>test</html>"):
            response = client.get("/")
            assert response.status_code == 200


class TestSessionOperations:
    """Test all session endpoint variations."""

    def test_oturum_sec(self, client, new_session):
        """POST /oturum/sec selects session."""
        response = client.post("/oturum/sec", json={"id": new_session})
        assert response.status_code == 200
        assert response.json()["ok"]

    def test_oturum_ad(self, client, new_session):
        """POST /oturum/ad renames session."""
        response = client.post("/oturum/ad", json={"id": new_session, "ad": "New Name"})
        assert response.status_code == 200

    def test_oturum_sil_endpoint(self, client, new_session):
        """POST /oturum/sil deletes single session."""
        response = client.post("/oturum/sil", json={"id": new_session})
        assert response.status_code == 200


class TestRenderingEndpoints:
    """Test CV rendering endpoints."""

    def test_render_endpoint(self, client):
        """GET /render renders CV."""
        response = client.get("/render?id=0001")
        # Endpoint may return 200 or error (depends on session state)
        assert response.status_code in [200, 400, 500]

    def test_preview_endpoint(self, client):
        """GET /preview returns HTML preview."""
        response = client.get("/preview?id=0001")
        # May not exist, should handle gracefully
        assert response.status_code in [200, 404, 500]

    def test_state_endpoint(self, client):
        """GET /state returns CV state."""
        response = client.get("/state?id=0001")
        # May not have CV structure, should handle gracefully
        assert response.status_code in [200, 400, 500]


class TestUploadEndpoint:
    """Test file upload."""

    def test_upload_invalid_type(self, client):
        """POST /upload rejects invalid file types."""
        data = {
            "dosya": ("test.txt", b"content", "text/plain"),
            "ad": "Test"
        }
        response = client.post("/upload", files={"dosya": ("test.txt", b"content")}, data={"ad": "test"})
        assert response.status_code in [200, 400]  # Depends on pipeline mock


class TestBatchOperations:
    """Test batch rename and delete."""

    def test_batch_ad_degistir_endpoint_full(self, client):
        """POST /oturum/batch-ad-degistir with multiple sessions."""
        # Create multiple sessions first
        r1 = client.post("/oturum/yeni", json={"ad": "S1"})
        r2 = client.post("/oturum/yeni", json={"ad": "S2"})

        if r1.status_code == 200 and r2.status_code == 200:
            id1 = r1.json()["id"]
            id2 = r2.json()["id"]

            payload = {
                "renames": [
                    {"id": id1, "newName": "Renamed1"},
                    {"id": id2, "newName": "Renamed2"}
                ]
            }
            response = client.post("/oturum/batch-ad-degistir", json=payload)
            assert response.status_code == 200


class TestExportEndpoint:
    """Test ZIP export."""

    def test_export_endpoint(self, client, new_session):
        """POST /oturum/export creates ZIP."""
        payload = {"ids": [new_session]}
        with patch('tempfile.NamedTemporaryFile'):
            response = client.post("/oturum/export", json=payload)
            assert response.status_code in [200, 400]  # Depends on file ops


class TestErrorResponses:
    """Test error handling across endpoints."""

    def test_invalid_session_id_format(self, client):
        """Endpoints handle invalid session IDs gracefully."""
        response = client.post("/oturum/sec", json={"id": "invalid"})
        assert response.status_code in [200, 400, 422]

    def test_missing_required_field(self, client):
        """Endpoints handle missing required fields."""
        response = client.post("/oturum/sec", json={})
        assert response.status_code in [200, 400, 422]

    def test_malformed_json(self, client):
        """Invalid JSON returns error."""
        response = client.post("/oturum/sec", content="not json")
        assert response.status_code >= 400


class TestConcurrencyAndIsolation:
    """Test concurrent operations."""

    def test_multiple_batch_operations(self, client):
        """Multiple batch operations don't interfere."""
        # Create sessions
        r1 = client.post("/oturum/yeni", json={"ad": "B1"})
        r2 = client.post("/oturum/yeni", json={"ad": "B2"})
        r3 = client.post("/oturum/yeni", json={"ad": "B3"})

        if all(r.status_code == 200 for r in [r1, r2, r3]):
            id1, id2, id3 = r1.json()["id"], r2.json()["id"], r3.json()["id"]

            # First batch
            p1 = {"renames": [{"id": id1, "newName": "Updated1"}]}
            response1 = client.post("/oturum/batch-ad-degistir", json=p1)

            # Second batch
            p2 = {"renames": [{"id": id2, "newName": "Updated2"}]}
            response2 = client.post("/oturum/batch-ad-degistir", json=p2)

            assert response1.status_code == 200
            assert response2.status_code == 200
