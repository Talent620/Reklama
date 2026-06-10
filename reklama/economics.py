"""Kalkulator realnych przychodów aplikacji — czysta matematyka na benchmarkach.

Liczy przychód z reklam i subskrypcji od INSTALACJI MIESIĘCZNYCH w dół,
używając median rynkowych (research: czerwiec 2026):

- Retencja (mediany wszystkich kategorii): D1 26%, D7 13%, D30 7%.
- Freemium: ~2.1% pobrań staje się płacącymi (D35); hard paywall ~10.7%.
- Subskrypcje: tygodniowe tracą 65% w 30 dni; przyjmujemy ~30% churn/mies.
  dla planu miesięcznego.
- eCPM (mieszanka globalna, środek widełek): banner ~0.5, interstitial ~3.5,
  rewarded ~14 USD.
- Prowizja Google: 15% (program Small Business, do 1 mln USD/rok) — dotyczy
  IAP/subskrypcji; przychód AdMob jest już netto.

Moduł jest w 100% offline i deterministyczny — pokryty testami.
"""

from __future__ import annotations

from dataclasses import dataclass, replace

PROWIZJA_GOOGLE_IAP = 0.15


@dataclass(frozen=True)
class Benchmarki:
    """Mediany rynkowe. Zmieniaj świadomie — wartości mają źródła w README."""

    # Retencja kohorty (dzień -> odsetek aktywnych)
    d1: float = 0.26
    d7: float = 0.13
    d30: float = 0.07

    # Zaangażowanie
    sesje_dziennie: float = 2.0

    # Reklamy: wyświetlenia na sesję i eCPM (USD/1000)
    imp_banner_na_sesje: float = 3.0
    imp_interstitial_na_sesje: float = 0.8
    imp_rewarded_na_sesje: float = 0.4
    ecpm_banner: float = 0.5
    ecpm_interstitial: float = 3.5
    ecpm_rewarded: float = 14.0

    # Subskrypcje
    konwersja_freemium: float = 0.021      # pobranie -> płacący (D35, mediana)
    konwersja_hard_paywall: float = 0.107  # pobranie -> płacący przy twardym paywallu
    churn_miesieczny: float = 0.30


BAZOWE = Benchmarki()


def wspolczynnik_dau(b: Benchmarki = BAZOWE) -> float:
    """Średni odsetek instalującej kohorty aktywny dziennie w 1. miesiącu.

    Interpolacja liniowa krzywej retencji przez punkty
    (0d, 100%), (1d, D1), (7d, D7), (30d, D30) i średnia po 30 dniach.
    DAU ~= instalacje_miesięczne * współczynnik.
    """
    punkty = [(0, 1.0), (1, b.d1), (7, b.d7), (30, b.d30)]
    osobodni = 0.0
    for (x0, y0), (x1, y1) in zip(punkty, punkty[1:]):
        osobodni += (y0 + y1) / 2 * (x1 - x0)  # pole trapezu
    return osobodni / 30


def arpdau_reklamy(b: Benchmarki = BAZOWE) -> float:
    """Średni dzienny przychód reklamowy z 1 aktywnego użytkownika (USD)."""
    na_sesje = (
        b.imp_banner_na_sesje * b.ecpm_banner
        + b.imp_interstitial_na_sesje * b.ecpm_interstitial
        + b.imp_rewarded_na_sesje * b.ecpm_rewarded
    ) / 1000
    return na_sesje * b.sesje_dziennie


@dataclass(frozen=True)
class Szacunek:
    """Wynik kalkulacji dla jednego scenariusza (USD, miesięcznie)."""

    scenariusz: str
    instalacje_mies: int
    dau: int
    subskrybenci: int
    przychod_reklamy: float
    przychod_subskrypcje: float  # już po prowizji Google

    @property
    def przychod_netto(self) -> float:
        return round(self.przychod_reklamy + self.przychod_subskrypcje, 2)


def oszacuj(
    instalacje_mies: int,
    *,
    model: str = "hybryda",  # reklamy | subskrypcja | hybryda
    cena_mies_usd: float = 4.99,
    hard_paywall: bool = False,
    b: Benchmarki = BAZOWE,
    scenariusz: str = "realistyczny",
) -> Szacunek:
    """Szacuje miesięczny przychód w stanie ustalonym dla danego napływu instalacji.

    Subskrybenci w stanie ustalonym = nowi płacący / churn.
    W modelu hybrydowym subskrybenci nie oglądają reklam (odejmowani z DAU reklamowego).
    """
    if instalacje_mies < 0:
        raise ValueError("instalacje_mies nie może być ujemne")
    if model not in ("reklamy", "subskrypcja", "hybryda"):
        raise ValueError(f"Nieznany model: {model!r}")

    dau = instalacje_mies * wspolczynnik_dau(b)

    subskrybenci = 0.0
    przychod_sub = 0.0
    if model in ("subskrypcja", "hybryda"):
        konwersja = b.konwersja_hard_paywall if hard_paywall else b.konwersja_freemium
        nowi_placacy = instalacje_mies * konwersja
        subskrybenci = nowi_placacy / b.churn_miesieczny
        przychod_sub = subskrybenci * cena_mies_usd * (1 - PROWIZJA_GOOGLE_IAP)

    przychod_ads = 0.0
    if model in ("reklamy", "hybryda"):
        dau_reklamowe = max(dau - subskrybenci, 0.0)
        przychod_ads = dau_reklamowe * 30 * arpdau_reklamy(b)

    return Szacunek(
        scenariusz=scenariusz,
        instalacje_mies=instalacje_mies,
        dau=round(dau),
        subskrybenci=round(subskrybenci),
        przychod_reklamy=round(przychod_ads, 2),
        przychod_subskrypcje=round(przychod_sub, 2),
    )


def scenariusze(
    instalacje_mies: int,
    *,
    model: str = "hybryda",
    cena_mies_usd: float = 4.99,
    hard_paywall: bool = False,
    b: Benchmarki = BAZOWE,
) -> list[Szacunek]:
    """Trzy scenariusze: pesymistyczny / realistyczny / optymistyczny.

    Pesymistyczny: 1/5 instalacji i konwersja/retencja -40% (typowy start bez marketingu).
    Optymistyczny: 3x instalacje i konwersja/retencja +30% (działający kanał pozyskania).
    """
    gorzej = replace(
        b,
        d1=b.d1 * 0.6, d7=b.d7 * 0.6, d30=b.d30 * 0.6,
        konwersja_freemium=b.konwersja_freemium * 0.6,
        konwersja_hard_paywall=b.konwersja_hard_paywall * 0.6,
    )
    lepiej = replace(
        b,
        d1=min(b.d1 * 1.3, 1.0), d7=min(b.d7 * 1.3, 1.0), d30=min(b.d30 * 1.3, 1.0),
        konwersja_freemium=b.konwersja_freemium * 1.3,
        konwersja_hard_paywall=b.konwersja_hard_paywall * 1.3,
    )
    wspolne = dict(model=model, cena_mies_usd=cena_mies_usd, hard_paywall=hard_paywall)
    return [
        oszacuj(max(instalacje_mies // 5, 0), b=gorzej, scenariusz="pesymistyczny", **wspolne),
        oszacuj(instalacje_mies, b=b, scenariusz="realistyczny", **wspolne),
        oszacuj(instalacje_mies * 3, b=lepiej, scenariusz="optymistyczny", **wspolne),
    ]
