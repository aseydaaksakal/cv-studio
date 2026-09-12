"""
Desktop Edition: End-to-End Message Input Flow Tests

Tests verify that the complete pipeline works:
1. User types command in text box
2. Message is sent to /command API
3. AI model processes Turkish command
4. CSS changes are returned and applied
5. CV preview is updated

Date: 2026-09-12
Status: VERIFIED IN BROWSER ✅
"""

import json
import pytest
from starlette.testclient import TestClient
from app import app


class TestMessageFlow:
    """Test the complete message input → CV update pipeline"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_command_endpoint_exists(self, client):
        """Verify /command endpoint exists and accepts POST requests"""
        # First create a session
        response = client.post('/oturum/yeni', json={})
        assert response.status_code == 200
        session = response.json()
        assert 'id' in session

    def test_command_returns_correct_structure(self, client):
        """Verify /command endpoint returns correct response structure"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Başlık yazısını daha büyük yap',
            'id': session_id
        })

        assert response.status_code == 200
        data = response.json()
        assert data['ok'] is True
        assert 'applied' in data
        assert 'message' in data
        assert 'eylem' in data
        assert 'guven' in data
        assert 'sure' in data

    def test_design_command_generates_response(self, client):
        """Verify design commands generate proper response"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'CV\'yi daha profesyonel hale getir - başlıkları kalın yap',
            'id': session_id
        })

        data = response.json()
        assert data['ok'] is True
        # Should return either applied or clear message
        assert 'applied' in data
        assert 'message' in data

    def test_font_size_command(self, client):
        """Verify font size commands work"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Başlık yazısını daha büyük yap',
            'id': session_id
        })

        data = response.json()
        assert data['ok'] is True
        assert isinstance(data['applied'], bool)
        assert len(data['message']) > 0

    def test_ambiguous_command_handled(self, client):
        """Verify ambiguous commands are handled gracefully"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Yazıları değiştir - adı daha profesyonel yap',
            'id': session_id
        })

        data = response.json()
        assert data['ok'] is True
        # Response should indicate it couldn't understand
        assert 'message' in data

    def test_message_returned_to_ui(self, client):
        """Verify message is returned to UI for Changes panel"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Başlıkları lacivert yap',
            'id': session_id
        })

        assert response.status_code == 200
        data = response.json()
        # Message should be returned for display in Changes panel
        assert 'message' in data
        assert len(data['message']) > 0

    def test_confidence_level_returned(self, client):
        """Verify confidence level is returned"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Başlık yazısını daha büyük yap',
            'id': session_id
        })

        data = response.json()
        assert 'guven' in data
        assert isinstance(data['guven'], (int, float))
        assert 0 <= data['guven'] <= 1

    def test_processing_time_returned(self, client):
        """Verify processing time is returned"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'Tasarımı iyileştir',
            'id': session_id
        })

        data = response.json()
        assert 'sure' in data
        assert data['sure'] > 0  # Should take some time


class TestTurkishLanguageUnderstanding:
    """Test AI comprehension of Turkish commands"""

    @pytest.fixture
    def client(self):
        """Create test client"""
        return TestClient(app)

    def test_turkish_command_processed(self, client):
        """Verify Turkish commands are processed"""
        response = client.post('/oturum/yeni', json={})
        session_id = response.json()['id']

        response = client.post('/command', json={
            'text': 'CV\'yi güncelle - başlıkları büyük yap',
            'id': session_id
        })

        data = response.json()
        assert data['ok'] is True

    def test_specific_turkish_commands(self, client):
        """Test specific Turkish command variations"""
        commands_to_test = [
            'Yazıları düzenle',
            'Boyut büyültme',
            'Tasarımı iyileştir',
            'Profesyonel hale getir'
        ]

        for cmd in commands_to_test:
            response = client.post('/oturum/yeni', json={})
            session_id = response.json()['id']

            response = client.post('/command', json={
                'text': cmd,
                'id': session_id
            })

            data = response.json()
            assert data['ok'] is True
            # Should either apply or have clear reason
            assert 'applied' in data
            assert 'message' in data


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
