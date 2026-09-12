"""Test suite for UI improvements: emoji buttons, enhanced styling, and better UX."""

import pytest
from fastapi.testclient import TestClient
from app import app


@pytest.fixture
def client():
    """FastAPI TestClient for API tests."""
    return TestClient(app)


class TestUIElements:
    """Test UI elements and frontend improvements."""

    def test_frontend_loads(self, client):
        """Frontend HTML should load successfully."""
        response = client.get("/")
        assert response.status_code == 200
        assert "CV Studio" in response.text

    def test_emoji_in_header(self, client):
        """Header should contain emoji icons."""
        response = client.get("/")
        assert "🎨" in response.text  # Brand emoji
        assert "📄" in response.text  # Upload emoji
        assert "📋" in response.text  # Sessions emoji

    def test_action_buttons_exist(self, client):
        """Action buttons should be present."""
        response = client.get("/")
        text = response.text
        assert "Geri al" in text
        assert "Sıfırla" in text
        assert "📤 Gönder" in text

    def test_text_area_placeholder(self, client):
        """Textarea should have helpful placeholder."""
        response = client.get("/")
        assert "✨" in response.text  # Placeholder emoji
        assert "Ne değiştirelim?" in response.text
        assert "resim ekle" in response.text.lower()

    def test_right_panel_header(self, client):
        """Right panel should have improved header."""
        response = client.get("/")
        assert "📝 Değişiklik Geçmişi" in response.text
        assert "💡 Henüz değişiklik yok" in response.text

    def test_voice_controls_improved(self, client):
        """Voice controls should be enhanced."""
        response = client.get("/")
        assert "🎤 Sesli Komut" in response.text
        assert "🇹🇷" in response.text  # Turkish flag
        assert "⚡" in response.text  # Speed emoji

    def test_responsive_design(self, client):
        """CSS should have responsive and smooth transitions."""
        response = client.get("/")
        text = response.text
        assert "transition:" in text  # Check for CSS transitions
        assert "rgba(" in text  # Check for shadow colors

    def test_accessibility_titles(self, client):
        """Buttons should have accessibility titles."""
        response = client.get("/")
        assert 'title="' in response.text
        assert "Küçükten görüntüle" in response.text
        assert "Pencereye sığdır" in response.text


class TestUIPlaceholders:
    """Test enhanced placeholder and help text."""

    def test_placeholder_has_examples(self, client):
        """Placeholder should have clear examples."""
        response = client.get("/")
        assert "başlıkları lacivert yap" in response.text
        assert "metni büyült" in response.text

    def test_color_coding(self, client):
        """UI elements should have color coding."""
        response = client.get("/")
        assert "var(--accent)" in response.text
        assert "var(--ok)" in response.text


class TestUIConsistency:
    """Test visual consistency across the UI."""

    def test_button_hover_states(self, client):
        """Buttons should have hover states."""
        response = client.get("/")
        assert ":hover" in response.text

    def test_input_focus_states(self, client):
        """Inputs should have focus states."""
        response = client.get("/")
        assert ":focus" in response.text

    def test_visual_feedback(self, client):
        """UI should provide visual feedback."""
        response = client.get("/")
        # Check for animation or transition keywords
        assert "transform" in response.text
        assert "box-shadow" in response.text


def test_ai_understanding_of_voice_controls(client):
    """Test if AI can understand context of voice controls."""
    response = client.get("/")
    text = response.text

    # Voice bar should be self-explanatory
    assert "🎤" in text  # Microphone icon
    assert "Sesli Komut" in text  # Clear label

    # Language options should be clear
    assert "Türkçe" in text or "🇹🇷" in text
    assert "English" in text or "🇬🇧" in text

    # Model choices should be clear
    assert "Turbo" in text or "⚡" in text
    assert "Large v3" in text or "🎯" in text


def test_empty_state_messaging(client):
    """Test empty state messaging is helpful."""
    response = client.get("/")
    text = response.text

    # Should guide user on what to do
    assert "💡" in text  # Light bulb icon for tip
    assert "Henüz değişiklik yok" in text
    assert "komut yaz" in text.lower()


def test_visual_hierarchy(client):
    """Test visual hierarchy is clear."""
    response = client.get("/")
    text = response.text

    # Important elements should be bold
    assert "<b>" in text

    # There should be clear grouping
    assert "gap:" in text or "margin:" in text
    assert "padding:" in text
