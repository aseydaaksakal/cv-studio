"""Test suite for design improvements: spacing, animations, and visual feedback."""

import pytest
from fastapi.testclient import TestClient
from app import app


@pytest.fixture
def client():
    """FastAPI TestClient for API tests."""
    return TestClient(app)


class TestSpacingAndLayout:
    """Test improved spacing and layout."""

    def test_composer_padding(self, client):
        """Composer section should have proper padding."""
        response = client.get("/")
        text = response.text
        assert "padding:16px 24px 20px" in text

    def test_stage_alignment(self, client):
        """Stage area should be centered both ways."""
        response = client.get("/")
        text = response.text
        assert "align-items:center" in text
        assert "justify-content:center" in text

    def test_input_focus_styling(self, client):
        """Input elements should have focus states."""
        response = client.get("/")
        text = response.text
        assert "#cmd:focus" in text

    def test_gap_improvements(self, client):
        """Components should have proper gaps between elements."""
        response = client.get("/")
        text = response.text
        assert "gap:" in text


class TestAnimations:
    """Test animation and transition improvements."""

    def test_modal_animation(self, client):
        """Modal should have fade-in animation."""
        response = client.get("/")
        text = response.text
        assert "fadeIn" in text
        assert "@keyframes fadeIn" in text

    def test_modal_content_animation(self, client):
        """Modal content should slide up."""
        response = client.get("/")
        text = response.text
        assert "slideUp" in text
        assert "@keyframes slideUp" in text

    def test_send_button_animation(self, client):
        """Send button should have smooth animations."""
        response = client.get("/")
        text = response.text
        assert "#send:hover" in text
        assert "transform" in text

    def test_blur_effect(self, client):
        """Modal should have backdrop blur."""
        response = client.get("/")
        text = response.text
        assert "backdrop-filter" in text


class TestInteractiveElements:
    """Test interactive element improvements."""

    def test_item_hover_effect(self, client):
        """Items in the change list should have hover effects."""
        response = client.get("/")
        text = response.text
        assert ".item:hover" in text
        assert "background:rgba(143,176,216,.05)" in text

    def test_delete_button_styling(self, client):
        """Delete button should have red hover state."""
        response = client.get("/")
        text = response.text
        assert ".del:hover" in text
        assert "#3a2320" in text  # Red background

    def test_button_transitions(self, client):
        """Buttons should have smooth transitions."""
        response = client.get("/")
        text = response.text
        # Check for transition keywords
        transitions = text.count("transition:")
        assert transitions > 5  # Multiple transition definitions


class TestBorderAndShadow:
    """Test border and shadow improvements."""

    def test_send_button_shadow(self, client):
        """Send button should have shadow effects."""
        response = client.get("/")
        text = response.text
        assert "box-shadow:0 2px 8px" in text or "box-shadow:0 4px 16px" in text

    def test_modal_shadow(self, client):
        """Modal should have prominent shadow."""
        response = client.get("/")
        text = response.text
        assert "box-shadow:0 24px 48px" in text

    def test_border_top_composer(self, client):
        """Composer should have border-top."""
        response = client.get("/")
        text = response.text
        assert "border-top:1px solid" in text


class TestColorAndContrast:
    """Test color and contrast improvements."""

    def test_hint_color(self, client):
        """Hint text should be visible."""
        response = client.get("/")
        text = response.text
        assert "color:var(--accent)" in text

    def test_depth_indicator_color(self, client):
        """Depth indicator should have good color."""
        response = client.get("/")
        text = response.text
        assert "color:var(--ok)" in text


def test_responsive_additions(client):
    """Test new responsive and mobile-friendly additions."""
    response = client.get("/")
    text = response.text

    # Should have proper mobile considerations
    assert "border-radius:" in text
    assert "max-width:" in text
    assert "100%" in text


def test_accessibility_improvements(client):
    """Test accessibility features."""
    response = client.get("/")
    text = response.text

    # Should have aria labels and roles
    assert "aria-label=" in text
    assert "title=" in text
    assert "placeholder=" in text


def test_visual_feedback_completeness(client):
    """Test that visual feedback is comprehensive."""
    response = client.get("/")
    text = response.text

    # Check for comprehensive feedback mechanisms
    assert "box-shadow" in text
    assert "transform" in text
    assert "animation:" in text
    assert "background:" in text


def test_emoji_consistency(client):
    """Test emoji usage is consistent."""
    response = client.get("/")
    text = response.text

    emoji_count = text.count("🎨")  # Brand emoji
    emoji_count += text.count("🎤")  # Voice emoji
    emoji_count += text.count("📝")  # Notes emoji

    assert emoji_count > 0  # At least some emoji present


def test_button_visual_hierarchy(client):
    """Test button hierarchy is clear."""
    response = client.get("/")
    text = response.text

    # Primary buttons should be distinct
    assert "background:var(--accent)" in text
    assert "color:#12171c" in text

    # Secondary buttons should be different
    assert ".btn-secondary" in text
