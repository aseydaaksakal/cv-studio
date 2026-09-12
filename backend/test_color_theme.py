"""Test suite for color theme, dark mode, and visual consistency."""

import pytest
from fastapi.testclient import TestClient
from app import app


@pytest.fixture
def client():
    """FastAPI TestClient for API tests."""
    return TestClient(app)


class TestColorVariables:
    """Test CSS color variables and theme system."""

    def test_root_variables_exist(self, client):
        """Root CSS variables should be defined."""
        response = client.get("/")
        text = response.text
        assert ":root{" in text or ":root {" in text

    def test_primary_colors(self, client):
        """Primary colors should be defined."""
        response = client.get("/")
        text = response.text
        assert "--desk:" in text
        assert "--panel:" in text
        assert "--edge:" in text
        assert "--text:" in text

    def test_accent_color(self, client):
        """Accent color should be defined."""
        response = client.get("/")
        text = response.text
        assert "--accent:" in text
        assert "8fb0d8" in text  # Accent color

    def test_status_colors(self, client):
        """Status indicator colors should exist."""
        response = client.get("/")
        text = response.text
        assert "--ok:" in text  # Success color
        assert "--warn:" in text  # Warning color

    def test_typography_variables(self, client):
        """Typography variables should be defined."""
        response = client.get("/")
        text = response.text
        assert "--ui:" in text
        assert "--mono:" in text


class TestColorConsistency:
    """Test color usage is consistent across UI."""

    def test_text_color_usage(self, client):
        """Text should use consistent color variable."""
        response = client.get("/")
        text = response.text
        # Should use var(--text) instead of hardcoded colors
        text_var_count = text.count("var(--text)")
        assert text_var_count > 10  # Multiple usages

    def test_accent_color_usage(self, client):
        """Accent color should be used consistently."""
        response = client.get("/")
        text = response.text
        accent_count = text.count("var(--accent)")
        assert accent_count > 5  # Multiple usages

    def test_background_consistency(self, client):
        """Background colors should be consistent."""
        response = client.get("/")
        text = response.text
        assert "var(--panel)" in text
        assert "var(--desk)" in text


class TestDarkMode:
    """Test dark mode implementation."""

    def test_dark_theme_default(self, client):
        """Default theme should be dark."""
        response = client.get("/")
        text = response.text
        # Check for dark color values
        assert "#1a1f24" in text or "1a1f24" in text  # Dark panel

    def test_high_contrast_text(self, client):
        """Text should have high contrast in dark mode."""
        response = client.get("/")
        text = response.text
        # Light text for dark backgrounds
        assert "#e7ebee" in text or "e7ebee" in text

    def test_border_visibility_dark(self, client):
        """Borders should be visible in dark mode."""
        response = client.get("/")
        text = response.text
        assert "--edge:" in text
        assert "--edge-soft:" in text


class TestColorAccessibility:
    """Test color accessibility (WCAG compliance)."""

    def test_button_contrast(self, client):
        """Buttons should have sufficient contrast."""
        response = client.get("/")
        text = response.text
        # Primary button: dark text on light background
        assert "color:#12171c" in text
        assert "background:var(--accent)" in text

    def test_text_dim_contrast(self, client):
        """Dimmed text should be readable."""
        response = client.get("/")
        text = response.text
        assert "--dim:" in text

    def test_focus_indicator_visibility(self, client):
        """Focus indicators should be visible."""
        response = client.get("/")
        text = response.text
        assert ":focus-visible" in text
        assert "outline:2px solid var(--accent)" in text


class TestColorStates:
    """Test color changes for different states."""

    def test_hover_color_changes(self, client):
        """Hover states should change colors."""
        response = client.get("/")
        text = response.text
        assert ":hover" in text

    def test_active_state_colors(self, client):
        """Active states should be distinct."""
        response = client.get("/")
        text = response.text
        assert '[aria-pressed="true"]' in text or "active" in text.lower()

    def test_disabled_state_colors(self, client):
        """Disabled states should appear faded."""
        response = client.get("/")
        text = response.text
        assert ":disabled" in text
        assert "opacity:" in text

    def test_error_color(self, client):
        """Error messages should have warning color."""
        response = client.get("/")
        text = response.text
        assert "#e0605a" in text or "e0605a" in text  # Red error color


class TestColorSemantics:
    """Test semantic color usage."""

    def test_success_indicator(self, client):
        """Success state should use green."""
        response = client.get("/")
        text = response.text
        assert "--ok:" in text
        assert "8fc9a4" in text  # Green color

    def test_warning_indicator(self, client):
        """Warning state should use orange/amber."""
        response = client.get("/")
        text = response.text
        assert "--warn:" in text
        assert "e0a15f" in text  # Orange color

    def test_information_indicator(self, client):
        """Information should use accent color."""
        response = client.get("/")
        text = response.text
        # Accent is used for important info
        assert "--accent:" in text


class TestColorBrandConsistency:
    """Test brand color consistency."""

    def test_primary_brand_color(self, client):
        """Primary brand color should be consistent."""
        response = client.get("/")
        text = response.text
        # Blue accent as primary brand
        assert "8fb0d8" in text

    def test_secondary_colors(self, client):
        """Secondary colors should complement brand."""
        response = client.get("/")
        text = response.text
        assert "8fc9a4" in text  # Green complement
        assert "e0a15f" in text  # Warm complement


def test_color_palette_completeness(client):
    """Test color palette is complete for all use cases."""
    response = client.get("/")
    text = response.text

    # Should have colors for all states
    colors = {
        "desk": "#23292f",
        "panel": "#1a1f24",
        "text": "#e7ebee",
        "accent": "8fb0d8",
        "ok": "8fc9a4",
        "warn": "e0a15f",
    }

    for name, value in colors.items():
        # At least one of the formats should be present
        assert value in text


def test_color_usage_avoids_hardcoding(client):
    """Test that hardcoded colors are minimal."""
    response = client.get("/")
    text = response.text

    # Count hardcoded hex values
    # Most should be replaced with variables
    import re
    hex_colors = len(re.findall(r'#[0-9a-f]{6}', text, re.IGNORECASE))
    var_references = len(re.findall(r'var\(--\w+\)', text))

    # Variable references should be much more common
    assert var_references > hex_colors / 2
