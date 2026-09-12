"""Unit tests for session.py module."""

import json
import time
from pathlib import Path

import pytest

import session


class TestSessionPaths:
    """Test path generation and validation."""

    def test_kok_creates_directory(self, temp_session_dir):
        """kok() should create and return sessions root directory."""
        kok = session.kok()
        assert kok.is_dir()
        assert kok == temp_session_dir

    def test_gecerli_accepts_4_digit_ids(self):
        """gecerli() accepts only 4-digit IDs."""
        assert session.gecerli("0001")
        assert session.gecerli("9999")
        assert session.gecerli("0000")
        assert not session.gecerli("001")
        assert not session.gecerli("00001")
        assert not session.gecerli("abcd")
        assert not session.gecerli(None)
        assert not session.gecerli("")

    def test_yol_returns_valid_path(self, temp_session_dir):
        """yol() returns correct path for valid ID."""
        result = session.yol("0001")
        assert result == temp_session_dir / "0001"

    def test_yol_rejects_invalid_id(self):
        """yol() raises ValueError for invalid ID."""
        with pytest.raises(ValueError, match="Gecersiz"):
            session.yol("invalid")

    def test_var_detects_existing_session(self, new_session, temp_session_dir):
        """var() returns True for existing sessions."""
        assert session.var(new_session)
        assert not session.var("9999")


class TestSessionMeta:
    """Test metadata functions."""

    def test_meta_creates_default(self, new_session):
        """meta() creates default metadata if file missing."""
        m = session.meta(new_session)
        assert m["id"] == new_session
        assert m["ad"] == "Test Session"
        assert m["kaynak"] == "test.pdf"
        assert m["notlar"] == ""
        assert m["not_tarihi"] == 0
        assert m["olusturma"] > 0
        assert m["guncelleme"] > 0

    def test_meta_reads_existing_file(self, new_session):
        """meta() reads existing meta.json."""
        m = session.meta(new_session)
        assert m["id"] == new_session
        assert m["ad"] == "Test Session"

    def test_meta_yaz_updates_file(self, new_session):
        """meta_yaz() updates metadata and persists to file."""
        updated = session.meta_yaz(new_session, ad="Updated Name", kaynak="new.pdf")
        assert updated["ad"] == "Updated Name"
        assert updated["kaynak"] == "new.pdf"

        # Verify persistence
        m2 = session.meta(new_session)
        assert m2["ad"] == "Updated Name"

    def test_meta_yaz_ignores_none_values(self, new_session):
        """meta_yaz() ignores None values."""
        session.meta_yaz(new_session, ad="First", kaynak=None)
        m = session.meta(new_session)
        assert m["ad"] == "First"
        assert m["kaynak"] == "test.pdf"  # unchanged

    def test_ad_ver_truncates_long_names(self, new_session):
        """ad_ver() truncates names to 80 characters."""
        long_name = "x" * 100
        session.ad_ver(new_session, long_name)
        m = session.meta(new_session)
        assert len(m["ad"]) == 80

    def test_ad_ver_handles_empty_string(self, new_session):
        """ad_ver() with empty string uses session ID."""
        session.ad_ver(new_session, "   ")
        m = session.meta(new_session)
        assert m["ad"] == new_session

    def test_dokun_updates_timestamp(self, new_session):
        """dokun() updates guncelleme timestamp."""
        old_time = session.meta(new_session)["guncelleme"]
        time.sleep(1.1)
        session.dokun(new_session)
        new_time = session.meta(new_session)["guncelleme"]
        assert new_time > old_time


class TestSessionNotes:
    """Test notes/comments functionality."""

    def test_notlar_yaz_saves_notes(self, new_session):
        """notlar_yaz() saves notes and timestamp."""
        note_text = "This is a test note"
        result = session.notlar_yaz(new_session, note_text)
        assert result["notlar"] == note_text
        assert result["not_tarihi"] > 0

    def test_notlar_yaz_truncates_to_1000_chars(self, new_session):
        """notlar_yaz() enforces 1000 character limit."""
        long_note = "x" * 1500
        result = session.notlar_yaz(new_session, long_note)
        assert len(result["notlar"]) == 1000

    def test_notlar_yaz_clears_timestamp_on_empty(self, new_session):
        """notlar_yaz() clears timestamp when notes are empty."""
        session.notlar_yaz(new_session, "some note")
        result = session.notlar_yaz(new_session, "   ")
        assert result["notlar"] == ""
        assert result["not_tarihi"] == 0

    def test_notlar_yaz_handles_unicode(self, new_session):
        """notlar_yaz() handles Turkish and other UTF-8 characters."""
        note = "Türkçe notlar: çöğüış ñ 中文 العربية"
        result = session.notlar_yaz(new_session, note)
        assert result["notlar"] == note

        # Verify persistence
        m = session.meta(new_session)
        assert m["notlar"] == note


class TestSessionBatchOperations:
    """Test batch operations."""

    def test_batch_ad_degistir_single(self, new_session):
        """batch_ad_degistir() renames single session."""
        renames = [{"id": new_session, "newName": "New Name"}]
        result = session.batch_ad_degistir(renames)
        assert len(result) == 1
        assert result[0]["ad"] == "New Name"

    def test_batch_ad_degistir_multiple(self, temp_session_dir):
        """batch_ad_degistir() handles multiple sessions atomically."""
        oid1 = session.yeni(ad="Session 1")
        oid2 = session.yeni(ad="Session 2")

        renames = [
            {"id": oid1, "newName": "Updated 1"},
            {"id": oid2, "newName": "Updated 2"}
        ]
        result = session.batch_ad_degistir(renames)
        assert len(result) == 2
        assert result[0]["ad"] == "Updated 1"
        assert result[1]["ad"] == "Updated 2"

    def test_batch_ad_degistir_rejects_invalid_id(self, new_session):
        """batch_ad_degistir() rejects invalid session IDs (all-or-nothing)."""
        renames = [
            {"id": new_session, "newName": "Valid"},
            {"id": "9999", "newName": "Invalid"}
        ]
        with pytest.raises(ValueError, match="Oturum yok"):
            session.batch_ad_degistir(renames)

        # Verify nothing was changed
        m = session.meta(new_session)
        assert m["ad"] == "Test Session"

    def test_batch_ad_degistir_rejects_empty_name(self, new_session):
        """batch_ad_degistir() rejects empty names."""
        renames = [{"id": new_session, "newName": "   "}]
        with pytest.raises(ValueError, match="Ad boş"):
            session.batch_ad_degistir(renames)

    def test_batch_ad_degistir_not_list(self, new_session):
        """batch_ad_degistir() requires list input."""
        with pytest.raises(ValueError, match="liste olmalıdır"):
            session.batch_ad_degistir({"id": new_session, "newName": "test"})


class TestSessionCreation:
    """Test session creation and listing."""

    def test_yeni_creates_session(self, temp_session_dir):
        """yeni() creates new session with unique ID."""
        oid1 = session.yeni(ad="Session 1")
        oid2 = session.yeni(ad="Session 2")

        assert session.var(oid1)
        assert session.var(oid2)
        assert oid1 != oid2
        assert session.gecerli(oid1)
        assert session.gecerli(oid2)

    def test_yeni_creates_history_directory(self, new_session):
        """yeni() creates history subdirectory."""
        history_path = session.yol(new_session) / "history"
        assert history_path.is_dir()

    def test_yeni_default_name(self):
        """yeni() uses default name if not provided."""
        oid = session.yeni()
        m = session.meta(oid)
        assert m["ad"].startswith("CV")

    def test_yeni_auto_increment_id(self, temp_session_dir):
        """yeni() auto-increments session IDs."""
        oid1 = session.yeni()  # "0001"
        oid2 = session.yeni()  # "0002"
        oid3 = session.yeni()  # "0003"

        assert int(oid2) == int(oid1) + 1
        assert int(oid3) == int(oid2) + 1
