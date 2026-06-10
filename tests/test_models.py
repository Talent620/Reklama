"""Testy modeli danych."""

import pytest
from pydantic import ValidationError

from reklama.models import AppOpportunity, GeneratedPrompt, OpportunityReport, StoreListing


def _okazja(**nadpisz) -> AppOpportunity:
    dane = dict(
        nazwa="Trening Oddechu Pro",
        nisza="zdrowie",
        pomysl="Aplikacja do ćwiczeń oddechowych.",
        grupa_docelowa="Osoby zestresowane",
        model_monetyzacji="subskrypcja",
        szczegoly_monetyzacji="4.99 USD/mies., trial 7 dni",
        szac_miesieczny_przychod_usd="1000-3000 USD",
        poziom_konkurencji="srednia",
        trudnosc_wykonania="latwa",
        dlaczego_dochodowe="Rosnący trend wellness",
        kluczowe_funkcje=["timer", "statystyki"],
        ryzyka=["konkurencja"],
        wynik=80,
    )
    dane.update(nadpisz)
    return AppOpportunity(**dane)


def test_slug_bezpieczny_dla_plikow():
    o = _okazja(nazwa="Trening Oddechu Pro! (2026)")
    assert o.slug == "trening-oddechu-pro-2026"
    assert "/" not in o.slug and " " not in o.slug


def test_slug_pusty_fallback():
    o = _okazja(nazwa="!!!")
    assert o.slug == "aplikacja"


def test_wynik_poza_zakresem_odrzucony():
    with pytest.raises(ValidationError):
        _okazja(wynik=101)
    with pytest.raises(ValidationError):
        _okazja(wynik=-1)


def test_zly_model_monetyzacji_odrzucony():
    with pytest.raises(ValidationError):
        _okazja(model_monetyzacji="krypto")


def test_kanaly_pozyskania_domyslnie_puste():
    # Wsteczna kompatybilność ze starymi raportami bez tego pola.
    assert _okazja().kanaly_pozyskania == []


def test_report_best_wybiera_najwyzszy_wynik():
    r = OpportunityReport(
        temat="t", podsumowanie="p",
        okazje=[_okazja(wynik=10), _okazja(nazwa="Lepsza", wynik=90), _okazja(wynik=50)],
    )
    assert r.best().nazwa == "Lepsza"


def test_report_roundtrip_json():
    r = OpportunityReport(temat="t", podsumowanie="p", okazje=[_okazja()])
    r2 = OpportunityReport.model_validate_json(r.model_dump_json())
    assert r2.okazje[0].nazwa == r.okazje[0].nazwa


def test_store_listing_przycina_limity():
    l = StoreListing(
        tytul="T" * 99, krotki_opis="K" * 200, pelny_opis="P" * 9999,
        slowa_kluczowe_aso=["x"], kategoria="Tools", notatki_wydania="N" * 999,
        polityka_prywatnosci_md="# P", data_safety_wskazowki=[],
    ).przytnij_limity()
    assert len(l.tytul) == 30
    assert len(l.krotki_opis) == 80
    assert len(l.pelny_opis) == 4000
    assert len(l.notatki_wydania) == 500


def test_store_listing_krotkie_wartosci_nietykane():
    l = StoreListing(
        tytul="Apka", krotki_opis="Opis", pelny_opis="Pełny",
        slowa_kluczowe_aso=["x"], kategoria="Tools", notatki_wydania="v1",
        polityka_prywatnosci_md="# P", data_safety_wskazowki=[],
    ).przytnij_limity()
    assert l.tytul == "Apka" and l.krotki_opis == "Opis"


def test_generated_prompt_przechowuje_okazje():
    g = GeneratedPrompt(nazwa_aplikacji="A", okazja=_okazja(), prompt="zrób apkę", stack="Flutter")
    assert g.okazja.slug.startswith("trening")
