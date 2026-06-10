"""Testy kalkulatora przychodów — matematyka musi być deterministyczna i uczciwa."""

import pytest

from reklama import economics
from reklama.economics import BAZOWE, Szacunek, arpdau_reklamy, oszacuj, scenariusze, wspolczynnik_dau


def test_wspolczynnik_dau_w_realnych_widelkach():
    # Przy medianach D1 26%/D7 13%/D30 7% średnia dzienna aktywność kohorty
    # w 1. miesiącu wypada kilkanaście procent.
    w = wspolczynnik_dau()
    assert 0.10 < w < 0.20


def test_arpdau_realistyczne():
    # ARPDAU dla mieszanki banner+interstitial+rewarded: rzędu 1-5 centów.
    a = arpdau_reklamy()
    assert 0.005 < a < 0.05


def test_oszacuj_zero_instalacji():
    s = oszacuj(0)
    assert s.dau == 0 and s.subskrybenci == 0 and s.przychod_netto == 0


def test_oszacuj_ujemne_instalacje():
    with pytest.raises(ValueError):
        oszacuj(-1)


def test_oszacuj_nieznany_model():
    with pytest.raises(ValueError):
        oszacuj(1000, model="nft")


def test_model_reklamy_bez_subskrypcji():
    s = oszacuj(10_000, model="reklamy")
    assert s.subskrybenci == 0
    assert s.przychod_subskrypcje == 0
    assert s.przychod_reklamy > 0


def test_model_subskrypcja_bez_reklam():
    s = oszacuj(10_000, model="subskrypcja", cena_mies_usd=4.99)
    assert s.przychod_reklamy == 0
    assert s.przychod_subskrypcje > 0
    # Stan ustalony: 10000 * 0.021 / 0.30 = 700 subskrybentów
    assert s.subskrybenci == 700


def test_prowizja_google_odjeta():
    s = oszacuj(10_000, model="subskrypcja", cena_mies_usd=10.0)
    brutto = s.subskrybenci * 10.0
    assert s.przychod_subskrypcje == pytest.approx(brutto * 0.85, rel=0.01)


def test_hard_paywall_wieksza_konwersja():
    miekki = oszacuj(10_000, model="subskrypcja")
    twardy = oszacuj(10_000, model="subskrypcja", hard_paywall=True)
    assert twardy.subskrybenci > miekki.subskrybenci * 4  # ~10.7% vs ~2.1%


def test_hybryda_subskrybenci_nie_ogladaja_reklam():
    tylko_reklamy = oszacuj(10_000, model="reklamy")
    hybryda = oszacuj(10_000, model="hybryda")
    assert hybryda.przychod_reklamy < tylko_reklamy.przychod_reklamy
    assert hybryda.przychod_netto > tylko_reklamy.przychod_netto  # subskrypcje to nadrabiają


def test_skala_liniowa_reklam():
    s1 = oszacuj(1_000, model="reklamy")
    s10 = oszacuj(10_000, model="reklamy")
    assert s10.przychod_reklamy == pytest.approx(s1.przychod_reklamy * 10, rel=0.01)


def test_scenariusze_uporzadkowane():
    p, r, o = scenariusze(10_000)
    assert p.scenariusz == "pesymistyczny" and o.scenariusz == "optymistyczny"
    assert p.przychod_netto < r.przychod_netto < o.przychod_netto


def test_scenariusz_realistyczny_w_medianie_indie():
    # 10k instalacji/mies. w hybrydzie powinno dawać wynik w widełkach
    # "mediana udanej aplikacji indie" (1-5 tys. USD/mies.) — sanity check researchu.
    _, r, _ = scenariusze(10_000, model="hybryda", cena_mies_usd=4.99)
    assert 1_000 < r.przychod_netto < 5_000


def test_szacunek_przychod_netto_to_suma():
    s = Szacunek("x", 1, 1, 1, przychod_reklamy=1.25, przychod_subskrypcje=2.50)
    assert s.przychod_netto == 3.75


def test_benchmarki_zamrozone():
    with pytest.raises(Exception):
        BAZOWE.d1 = 0.5  # frozen dataclass


def test_modul_offline():
    # Kalkulator nie może zależeć od sieci ani SDK — sprawdzamy brak importu anthropic.
    import inspect

    zrodlo = inspect.getsource(economics)
    assert "anthropic" not in zrodlo
    assert "requests" not in zrodlo
