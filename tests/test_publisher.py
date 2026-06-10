"""Testy publishera — walidacja wejścia i poprawna sekwencja wywołań API (mock)."""

import os

import pytest

from reklama import publisher
from reklama.models import StoreListing


def test_zly_track_odrzucony(tmp_path):
    aab = tmp_path / "app.aab"
    aab.write_bytes(b"x")
    with pytest.raises(ValueError):
        publisher.publish_aab("creds.json", "com.x.y", str(aab), track="produkcja")


def test_brak_pliku_aab():
    with pytest.raises(FileNotFoundError):
        publisher.publish_aab("creds.json", "com.x.y", "/nie/ma.aab")


def test_apk_odrzucony(tmp_path):
    apk = tmp_path / "app.apk"
    apk.write_bytes(b"x")
    with pytest.raises(ValueError):
        publisher.publish_aab("creds.json", "com.x.y", str(apk))


# --- Mock łańcucha androidpublisher (edits().bundles()/tracks()/listings()/commit()) ---


class _Exec:
    def __init__(self, ret):
        self._ret = ret

    def execute(self):
        return self._ret


class _FakeEdits:
    def __init__(self, log):
        self.log = log

    def insert(self, body, packageName):
        self.log.append(("insert", packageName))
        return _Exec({"id": "edit-1"})

    def bundles(self):
        return self

    def upload(self, packageName, editId, media_body):
        self.log.append(("upload", editId))
        return _Exec({"versionCode": 42})

    def tracks(self):
        return self

    def update(self, packageName, editId, track, body):
        self.log.append(("track.update", track, tuple(body["releases"][0].get("versionCodes", []))))
        return _Exec({})

    def listings(self):
        return _FakeListings(self.log)

    def commit(self, packageName, editId):
        self.log.append(("commit", editId))
        return _Exec({})

    def delete(self, packageName, editId):
        self.log.append(("delete", editId))
        return _Exec({})


class _FakeListings:
    def __init__(self, log):
        self.log = log

    def update(self, packageName, editId, language, body):
        self.log.append(("listing.update", language, body["title"]))
        return _Exec({})


class _FakeService:
    def __init__(self, log):
        self._edits = _FakeEdits(log)

    def edits(self):
        return self._edits


@pytest.fixture
def patched(monkeypatch):
    log = []
    monkeypatch.setattr(publisher, "_build_service", lambda _c: _FakeService(log))
    # MediaFileUpload nie jest istotne w teście — podstawiamy atrapę.
    import googleapiclient.http as ghttp  # noqa

    monkeypatch.setattr(ghttp, "MediaFileUpload", lambda *a, **k: object())
    return log


def test_publikacja_pelna_sekwencja(patched, tmp_path):
    aab = tmp_path / "app.aab"
    aab.write_bytes(b"bundle")
    res = publisher.publish_aab(
        "creds.json", "com.x.y", str(aab), track="internal", release_notes="v1"
    )
    assert res.version_code == 42
    assert res.committed is True
    kroki = [k[0] for k in patched]
    assert kroki == ["insert", "upload", "track.update", "commit"]


def test_publikacja_z_listingiem(patched, tmp_path):
    aab = tmp_path / "app.aab"
    aab.write_bytes(b"bundle")
    listing = StoreListing(
        tytul="Moja Apka", krotki_opis="Krotko", pelny_opis="Pelny",
        slowa_kluczowe_aso=["x"], kategoria="Tools", notatki_wydania="v1",
        polityka_prywatnosci_md="# P", data_safety_wskazowki=[],
    )
    res = publisher.publish_aab("creds.json", "com.x.y", str(aab), listing=listing)
    assert res.listing_updated is True
    assert ("listing.update", "pl-PL", "Moja Apka") in patched


def test_dry_run_nie_zatwierdza(patched, tmp_path):
    aab = tmp_path / "app.aab"
    aab.write_bytes(b"bundle")
    res = publisher.publish_aab("creds.json", "com.x.y", str(aab), dry_run=True)
    assert res.committed is False
    kroki = [k[0] for k in patched]
    assert "commit" not in kroki
    assert "delete" in kroki  # edycja posprzątana


def test_blad_uploadu_sprzata_edycje(monkeypatch, tmp_path):
    log = []

    class _BrokenEdits(_FakeEdits):
        def upload(self, packageName, editId, media_body):
            raise RuntimeError("upload padl")

    class _BrokenService:
        def __init__(self):
            self._edits = _BrokenEdits(log)

        def edits(self):
            return self._edits

    monkeypatch.setattr(publisher, "_build_service", lambda _c: _BrokenService())
    import googleapiclient.http as ghttp

    monkeypatch.setattr(ghttp, "MediaFileUpload", lambda *a, **k: object())

    aab = tmp_path / "app.aab"
    aab.write_bytes(b"bundle")
    with pytest.raises(RuntimeError):
        publisher.publish_aab("creds.json", "com.x.y", str(aab))
    assert ("delete", "edit-1") in log  # edycja usunięta mimo błędu
