"""Testy zapisu artefaktów i wczytywania konfiguracji."""

import os

import pytest

from reklama import storage
from reklama.config import DEFAULT_EFFORT, DEFAULT_MODEL, Settings, load_settings
from reklama.models import AppOpportunity, GeneratedPrompt, OpportunityReport


def _okazja() -> AppOpportunity:
    return AppOpportunity(
        nazwa="Apka X", nisza="n", pomysl="p", grupa_docelowa="g",
        model_monetyzacji="hybryda", szczegoly_monetyzacji="ads+iap",
        szac_miesieczny_przychod_usd="1k", poziom_konkurencji="niska",
        trudnosc_wykonania="latwa", dlaczego_dochodowe="d",
        kluczowe_funkcje=["f"], ryzyka=["r"], wynik=70,
    )


def test_save_load_report(tmp_path):
    r = OpportunityReport(temat="t", podsumowanie="p", okazje=[_okazja()])
    path = storage.save_report(r, str(tmp_path))
    assert os.path.exists(path)
    r2 = storage.load_report(path)
    assert r2.okazje[0].nazwa == "Apka X"


def test_save_prompt_tworzy_txt_i_json(tmp_path):
    gen = GeneratedPrompt(nazwa_aplikacji="Apka X", okazja=_okazja(), prompt="zrób", stack="Flutter")
    txt, js = storage.save_prompt(gen, str(tmp_path))
    assert txt.endswith(".txt") and js.endswith(".json")
    assert open(txt, encoding="utf-8").read().strip() == "zrób"


def test_settings_require_play_credentials_brak():
    s = Settings(anthropic_api_key="k", google_play_credentials=None)
    with pytest.raises(RuntimeError):
        s.require_play_credentials()


def test_settings_require_play_credentials_nieistnieje():
    s = Settings(anthropic_api_key="k", google_play_credentials="/nie/ma.json")
    with pytest.raises(RuntimeError):
        s.require_play_credentials()


def test_load_settings_bez_klucza(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # Udajemy, że .env nie wnosi klucza.
    monkeypatch.setattr("reklama.config.load_dotenv", lambda *a, **k: None)
    with pytest.raises(RuntimeError):
        load_settings()


def test_load_settings_domyslne(monkeypatch):
    monkeypatch.setattr("reklama.config.load_dotenv", lambda *a, **k: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("REKLAMA_MODEL", raising=False)
    monkeypatch.delenv("REKLAMA_EFFORT", raising=False)
    monkeypatch.delenv("GOOGLE_PLAY_CREDENTIALS", raising=False)
    s = load_settings()
    assert s.model == DEFAULT_MODEL and s.effort == DEFAULT_EFFORT
    assert s.google_play_credentials is None


def test_load_settings_nadpisuje_z_env(monkeypatch):
    monkeypatch.setattr("reklama.config.load_dotenv", lambda *a, **k: None)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setenv("REKLAMA_EFFORT", "max")
    s = load_settings()
    assert s.effort == "max"


def test_knowledge_zawiera_kluczowe_fakty():
    from reklama.knowledge import CHECKLIST, MARKET_FACTS

    assert "12" in MARKET_FACTS  # 12 testerów
    assert "API 36" in MARKET_FACTS
    assert "2.1%" in MARKET_FACTS  # konwersja freemium
    assert len(CHECKLIST) >= 8
