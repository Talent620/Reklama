"""Testy regresyjne dla poprawek z AUDIT.md (P1-P4)."""

import os
import tempfile

import pytest

from reklama.builder import _safe_join
from reklama.models import OpportunityReport


# --- P1: pusty raport daje czytelny błąd, nie kryptyczny max() ---

def test_best_pusta_lista_czytelny_blad():
    r = OpportunityReport(temat="t", podsumowanie="p", okazje=[])
    with pytest.raises(ValueError, match="okazji"):
        r.best()


def test_analyze_market_pusty_raport_rzuca(monkeypatch):
    from reklama import analyzer
    from reklama.config import Settings

    # Podstawiamy etapy LLM tak, by zwróciły raport bez nisz.
    monkeypatch.setattr(analyzer, "research", lambda *a, **k: "brak nisz")
    monkeypatch.setattr(
        analyzer, "parse_into",
        lambda *a, **k: OpportunityReport(temat="t", podsumowanie="p", okazje=[]),
    )
    monkeypatch.setattr("reklama._llm.make_client", lambda s: object())

    with pytest.raises(RuntimeError, match="nisz"):
        analyzer.analyze_market(Settings(anthropic_api_key="k"), "x")


# --- P2: _safe_join odrzuca ścieżki wskazujące na korzeń ---

@pytest.mark.parametrize("zla", [".", "./", "sub/..", "a/../", "lib/.."])
def test_safe_join_odrzuca_korzen(zla):
    root = tempfile.mkdtemp()
    assert _safe_join(root, zla) is None


def test_safe_join_nadal_przepuszcza_poprawne():
    root = tempfile.mkdtemp()
    assert _safe_join(root, "lib/main.dart") is not None
    assert _safe_join(root, "pubspec.yaml") is not None


# --- P4: notatki wydania używają języka spójnego z listingiem ---

def test_publisher_notes_language_param_istnieje():
    import inspect

    from reklama import publisher

    sig = inspect.signature(publisher.publish_aab)
    assert "notes_language" in sig.parameters


def _publish_lapiac_release(monkeypatch, tmp_path, **kwargs):
    """Publikuje na atrapie i zwraca body przekazane do tracks().update()."""
    from reklama import publisher

    zlapane = {}

    class _Exec:
        def __init__(self, ret):
            self._ret = ret

        def execute(self):
            return self._ret

    class _Edits:
        def insert(self, body, packageName):
            return _Exec({"id": "e1"})

        def bundles(self):
            return self

        def upload(self, packageName, editId, media_body):
            return _Exec({"versionCode": 1})

        def tracks(self):
            return self

        def update(self, packageName, editId, track, body):
            zlapane["body"] = body
            return _Exec({})

        def commit(self, packageName, editId):
            return _Exec({})

        def delete(self, packageName, editId):
            return _Exec({})

    class _Svc:
        def edits(self):
            return _Edits()

    monkeypatch.setattr(publisher, "_build_service", lambda _c: _Svc())
    import googleapiclient.http as ghttp

    monkeypatch.setattr(ghttp, "MediaFileUpload", lambda *a, **k: object())

    aab = tmp_path / "app.aab"
    aab.write_bytes(b"x")
    publisher.publish_aab("c.json", "com.x.y", str(aab), release_notes="zmiany", **kwargs)
    return zlapane["body"]


def test_release_notes_dziedziczy_listing_language(monkeypatch, tmp_path):
    body = _publish_lapiac_release(monkeypatch, tmp_path, listing_language="en-US")
    assert body["releases"][0]["releaseNotes"][0]["language"] == "en-US"


def test_release_notes_jawny_notes_language_wygrywa(monkeypatch, tmp_path):
    body = _publish_lapiac_release(
        monkeypatch, tmp_path, listing_language="en-US", notes_language="pl-PL"
    )
    assert body["releases"][0]["releaseNotes"][0]["language"] == "pl-PL"
