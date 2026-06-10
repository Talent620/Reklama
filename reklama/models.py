"""Modele danych (Pydantic) używane w całym pipeline."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field

CompetitionLevel = Literal["niska", "srednia", "wysoka"]
Difficulty = Literal["latwa", "srednia", "trudna"]
MonetizationModel = Literal[
    "reklamy",            # AdMob / reklamy displayowe / rewarded
    "subskrypcja",        # in-app subscription
    "jednorazowy_zakup",  # paid app / jednorazowy unlock
    "freemium_iap",       # darmowa + zakupy wewnątrz aplikacji
    "hybryda",            # reklamy + IAP / subskrypcja
]


class AppOpportunity(BaseModel):
    """Pojedyncza nisza / pomysł na dochodową aplikację."""

    nazwa: str = Field(description="Krótka, chwytliwa nazwa robocza aplikacji")
    nisza: str = Field(description="Nisza / kategoria rynkowa")
    pomysl: str = Field(description="Opis pomysłu w 2-3 zdaniach")
    grupa_docelowa: str = Field(description="Kto jest użytkownikiem i jaki ma problem")

    model_monetyzacji: MonetizationModel
    szczegoly_monetyzacji: str = Field(
        description="Konkretnie jak aplikacja zarabia: stawki, punkty cenowe, co odblokowuje płatność"
    )
    szac_miesieczny_przychod_usd: str = Field(
        description="Realistyczny widełkowy szacunek przychodu/mies. po 6-12 mies. (np. '500-3000 USD')"
    )

    poziom_konkurencji: CompetitionLevel
    trudnosc_wykonania: Difficulty
    dlaczego_dochodowe: str = Field(description="Dlaczego akurat to ma szansę zarobić — uzasadnienie popytu")
    kluczowe_funkcje: list[str] = Field(description="3-7 kluczowych funkcji MVP")
    ryzyka: list[str] = Field(description="Najważniejsze ryzyka i przeszkody")

    wynik: int = Field(
        ge=0, le=100,
        description="Łączna ocena atrakcyjności 0-100 (popyt vs konkurencja vs trudność vs zarobek)",
    )

    @property
    def slug(self) -> str:
        """Bezpieczna nazwa do plików."""
        safe = "".join(c if c.isalnum() else "-" for c in self.nazwa.lower())
        return "-".join(filter(None, safe.split("-")))[:60] or "aplikacja"


class OpportunityReport(BaseModel):
    """Zbiorczy raport z analizy rynku."""

    temat: str = Field(description="Temat / obszar zadany przez użytkownika")
    podsumowanie: str = Field(description="Krótkie podsumowanie wniosków z analizy")
    okazje: list[AppOpportunity] = Field(description="Lista nisz posortowana malejąco wg wyniku")
    utworzono: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def best(self) -> AppOpportunity:
        return max(self.okazje, key=lambda o: o.wynik)


class GeneratedPrompt(BaseModel):
    """Gotowy do wklejenia prompt budujący całą aplikację."""

    nazwa_aplikacji: str
    okazja: AppOpportunity
    prompt: str = Field(description="Pełny prompt 'wklej i odbierz gotową aplikację'")
    stack: str = Field(description="Sugerowany stack technologiczny (np. Flutter, Kotlin/Compose)")
    utworzono: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
