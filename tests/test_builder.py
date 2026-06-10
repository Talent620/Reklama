"""Testy parsera buildera i ochrony przed path traversal — bez sieci."""

import os
import tempfile

import pytest

from reklama.builder import _FILE_RE, _safe_join, build_app


def test_parser_wyciaga_pliki():
    txt = (
        "===== FILE: lib/main.dart =====\n"
        "void main() {}\n"
        "===== END =====\n"
        "===== FILE: pubspec.yaml =====\n"
        "name: app\n"
        "===== END ====="
    )
    pliki = {m.group("path"): m.group("body") for m in _FILE_RE.finditer(txt)}
    assert set(pliki) == {"lib/main.dart", "pubspec.yaml"}
    assert "void main()" in pliki["lib/main.dart"]


def test_safe_join_dozwolone():
    root = tempfile.mkdtemp()
    assert _safe_join(root, "lib/main.dart") is not None


def test_safe_join_blokuje_traversal():
    root = tempfile.mkdtemp()
    assert _safe_join(root, "../evil.txt") is None
    assert _safe_join(root, "a/../../evil") is None
    assert _safe_join(root, "~/secret") is None
    assert _safe_join(root, "") is None


def test_safe_join_absolutna_staje_sie_wzgledna():
    root = os.path.realpath(tempfile.mkdtemp())
    # Wiodący slash jest obcinany -> ścieżka ląduje WEWNĄTRZ root.
    wynik = _safe_join(root, "/etc/passwd")
    assert wynik == os.path.join(root, "etc/passwd")


class _FakeStream:
    def __init__(self, message):
        self._message = message

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self._message


class _FakeBlock:
    type = "text"

    def __init__(self, text):
        self.text = text


class _FakeMessage:
    def __init__(self, text, stop_reason="end_turn"):
        self.content = [_FakeBlock(text)]
        self.stop_reason = stop_reason


class _FakeClient:
    """Imituje klienta Anthropic — zwraca z góry ustalony projekt."""

    def __init__(self, text):
        self._text = text
        self.messages = self

    def stream(self, **_kw):
        return _FakeStream(_FakeMessage(self._text))


def test_build_app_zapisuje_pliki(tmp_path):
    from reklama.config import Settings
    from reklama.models import AppOpportunity, GeneratedPrompt

    projekt = (
        "===== FILE: pubspec.yaml =====\nname: demo\n===== END =====\n"
        "===== FILE: lib/main.dart =====\nvoid main() {}\n===== END =====\n"
        "===== FILE: ../zlosliwy.txt =====\nhack\n===== END ====="
    )
    okazja = AppOpportunity(
        nazwa="Demo", nisza="x", pomysl="y", grupa_docelowa="z",
        model_monetyzacji="reklamy", szczegoly_monetyzacji="ads",
        szac_miesieczny_przychod_usd="100", poziom_konkurencji="niska",
        trudnosc_wykonania="latwa", dlaczego_dochodowe="bo tak",
        kluczowe_funkcje=["a"], ryzyka=["b"], wynik=50,
    )
    gen = GeneratedPrompt(nazwa_aplikacji="Demo", okazja=okazja, prompt="zbuduj", stack="Flutter")
    settings = Settings(anthropic_api_key="test", model="claude-opus-4-8")

    out = tmp_path / "app"
    result = build_app(settings, gen, str(out), client=_FakeClient(projekt))

    assert set(result.files) == {"pubspec.yaml", os.path.join("lib", "main.dart")}
    assert (out / "pubspec.yaml").exists()
    assert (out / "lib" / "main.dart").exists()
    # Złośliwa ścieżka nie wyszła poza katalog projektu.
    assert not (out.parent / "zlosliwy.txt").exists()


def test_build_app_pusty_wynik_rzuca(tmp_path):
    from reklama.config import Settings
    from reklama.models import AppOpportunity, GeneratedPrompt

    okazja = AppOpportunity(
        nazwa="Demo", nisza="x", pomysl="y", grupa_docelowa="z",
        model_monetyzacji="reklamy", szczegoly_monetyzacji="ads",
        szac_miesieczny_przychod_usd="100", poziom_konkurencji="niska",
        trudnosc_wykonania="latwa", dlaczego_dochodowe="bo tak",
        kluczowe_funkcje=["a"], ryzyka=["b"], wynik=50,
    )
    gen = GeneratedPrompt(nazwa_aplikacji="Demo", okazja=okazja, prompt="zbuduj", stack="Flutter")
    settings = Settings(anthropic_api_key="test")

    with pytest.raises(RuntimeError):
        build_app(settings, gen, str(tmp_path / "app"), client=_FakeClient("brak plikow"))
