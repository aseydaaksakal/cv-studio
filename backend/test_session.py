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


class TestSessionDeletion:
    """Test session deletion."""

    def test_sil_deletes_session(self, new_session):
        """sil() deletes session directory."""
        assert session.var(new_session)
        result = session.sil(new_session)
        assert result
        assert not session.var(new_session)

    def test_sil_nonexistent_session(self):
        """sil() returns False for nonexistent session."""
        result = session.sil("9999")
        assert not result

    def test_sil_updates_active_session(self, temp_session_dir):
        """sil() updates active session if deleted."""
        oid1 = session.yeni(ad="Session 1")
        oid2 = session.yeni(ad="Session 2")
        session.sec(oid2)  # Make oid2 active
        assert session.aktif() == oid2

        # Delete active session
        session.sil(oid2)
        # Should fall back to remaining session
        assert session.aktif() == oid1


class TestSessionCopy:
    """Test session duplication."""

    def test_kopyala_creates_copy(self, session_with_files):
        """kopyala() creates independent copy."""
        original_id = session_with_files
        copy_id = session.kopyala(original_id)

        assert copy_id != original_id
        assert session.var(copy_id)

        # Verify name has (Kopya) suffix
        copy_meta = session.meta(copy_id)
        assert "(Kopya)" in copy_meta["ad"]

    def test_kopyala_invalid_session(self):
        """kopyala() raises ValueError for invalid session."""
        with pytest.raises(ValueError, match="Oturum yok"):
            session.kopyala("9999")

    def test_kopyala_copies_files(self, session_with_files):
        """kopyala() copies all files from source."""
        original_id = session_with_files
        copy_id = session.kopyala(original_id)

        original_dir = session.yol(original_id)
        copy_dir = session.yol(copy_id)

        # Check that files exist in copy
        for filename in ("cv_structured.json", "cv_layout.json"):
            assert (original_dir / filename).exists()
            assert (copy_dir / filename).exists()


class TestSessionSummary:
    """Test session summary (ozet)."""

    def test_ozet_returns_metadata(self, new_session):
        """ozet() returns session metadata."""
        summary = session.ozet(new_session)
        assert summary["id"] == new_session
        assert "ad" in summary
        assert "kaynak" in summary
        assert "hazir" in summary
        assert "bolum" in summary
        assert "gecmis" in summary

    def test_ozet_counts_history(self, new_session):
        """ozet() counts history snapshots."""
        session_dir = session.yol(new_session)
        history_dir = session_dir / "history"
        history_dir.mkdir(exist_ok=True)

        # Create fake history files
        (history_dir / "snapshot1.json").write_text("{}")
        (history_dir / "snapshot2.json").write_text("{}")

        summary = session.ozet(new_session)
        assert summary["gecmis"] == 2


class TestSessionListing:
    """Test listing all sessions."""

    def test_liste_returns_all_sessions(self, temp_session_dir):
        """liste() returns all sessions with summaries."""
        oid1 = session.yeni(ad="Session 1")
        oid2 = session.yeni(ad="Session 2")
        oid3 = session.yeni(ad="Session 3")

        sessions = session.liste()
        assert len(sessions) == 3
        ids = [s["id"] for s in sessions]
        assert oid1 in ids
        assert oid2 in ids
        assert oid3 in ids


class TestActiveSession:
    """Test active session management."""

    def test_aktif_returns_active_session(self, new_session):
        """aktif() returns currently active session."""
        session.sec(new_session)
        assert session.aktif() == new_session

    def test_aktif_returns_empty_if_none(self, temp_session_dir):
        """aktif() returns empty string if no sessions."""
        assert session.aktif() == ""

    def test_sec_sets_active_session(self, new_session):
        """sec() sets active session."""
        session.sec(new_session)
        assert session.aktif() == new_session

    def test_sec_invalid_session(self):
        """sec() raises ValueError for invalid session."""
        with pytest.raises(ValueError, match="Oturum yok"):
            session.sec("9999")

    def test_baglanan_returns_bound_session(self):
        """baglanan() returns bound session ID."""
        bound = session.baglanan()
        assert isinstance(bound, str)


class TestErrorHandling:
    """Test error handling and edge cases."""

    def test_meta_handles_corrupted_json(self, new_session):
        """meta() handles corrupted meta.json gracefully."""
        meta_file = session.yol(new_session) / "meta.json"
        meta_file.write_text("invalid json {]")

        # Should return defaults
        m = session.meta(new_session)
        assert m["id"] == new_session
        assert m["ad"] == new_session

    def test_aktif_handles_corrupted_active_json(self, temp_session_dir):
        """aktif() handles corrupted aktif.json gracefully."""
        oid = session.yeni(ad="Test")

        # Corrupt the aktif.json
        aktif_file = session.kok() / "aktif.json"
        aktif_file.write_text("invalid json {]")

        # Should still return a valid session
        result = session.aktif()
        assert result == oid or result == ""

    def test_hazirla_with_specific_session(self, new_session):
        """hazirla() binds specific session."""
        result = session.hazirla(new_session)
        assert result == new_session

    def test_hazirla_invalid_session(self):
        """hazirla() returns empty for invalid session."""
        result = session.hazirla("9999")
        assert result == ""


class TestLegacyMigration:
    """Test legacy migration (devral)."""

    def test_devral_does_nothing_if_sessions_exist(self, new_session):
        """devral() returns empty if sessions already exist."""
        result = session.devral()
        assert result == ""


class TestSessionIntegration:
    """Integration tests combining multiple operations."""

    def test_workflow_create_select_delete(self, temp_session_dir):
        """Complete workflow: create, select, delete."""
        oid = session.yeni(ad="Workflow Test")
        assert session.var(oid)

        session.sec(oid)
        assert session.aktif() == oid

        result = session.sil(oid)
        assert result
        assert not session.var(oid)

    def test_workflow_copy_and_rename(self, session_with_files):
        """Complete workflow: create, copy, rename."""
        original_id = session_with_files

        # Copy session
        copy_id = session.kopyala(original_id)
        assert copy_id != original_id

        # Rename copy
        new_name = "Renamed Copy"
        session.ad_ver(copy_id, new_name)
        assert session.meta(copy_id)["ad"] == new_name

    def test_workflow_batch_operations(self, temp_session_dir):
        """Complete workflow: batch rename multiple sessions."""
        oid1 = session.yeni(ad="Session 1")
        oid2 = session.yeni(ad="Session 2")

        renames = [
            {"id": oid1, "newName": "Updated 1"},
            {"id": oid2, "newName": "Updated 2"}
        ]

        results = session.batch_ad_degistir(renames)
        assert len(results) == 2
        assert results[0]["ad"] == "Updated 1"
        assert results[1]["ad"] == "Updated 2"
