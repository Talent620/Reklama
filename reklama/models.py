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
    kanaly_pozyskania: list[str] = Field(
        default_factory=list,
        description="2-4 KONKRETNE kanały, skąd przyjdą instalacje (frazy ASO z wolumenem, "
                    "społeczności, short-form video, SEO) — bez tego nisza nie zarobi",
    )

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


class StoreListing(BaseModel):
    """Metadane do karty sklepu Google Play (zgodne z twardymi limitami)."""

    tytul: str = Field(description="Tytuł aplikacji, max 30 znaków, bez 'free'/'#1'/'best'")
    krotki_opis: str = Field(description="Krótki opis, max 80 znaków, konkretna korzyść")
    pelny_opis: str = Field(description="Pełny opis, max 4000 znaków, z akapitami i listą funkcji")
    slowa_kluczowe_aso: list[str] = Field(description="8-15 fraz ASO wplecionych w opisy")
    kategoria: str = Field(description="Kategoria Google Play, np. 'Health & Fitness'")
    notatki_wydania: str = Field(description="Release notes pierwszej wersji, max 500 znaków")
    polityka_prywatnosci_md: str = Field(
        description="Pełna treść polityki prywatności (Markdown, PL) spójna z Data Safety"
    )
    data_safety_wskazowki: list[str] = Field(
        description="Jak wypełnić formularz Data Safety dla tej aplikacji (per kategoria danych)"
    )

    def przytnij_limity(self) -> "StoreListing":
        """Twarde przycięcie do limitów Google Play (asekuracja po stronie klienta)."""
        return self.model_copy(update={
            "tytul": self.tytul[:30].rstrip(),
            "krotki_opis": self.krotki_opis[:80].rstrip(),
            "pelny_opis": self.pelny_opis[:4000].rstrip(),
            "notatki_wydania": self.notatki_wydania[:500].rstrip(),
        })


class GeneratedPrompt(BaseModel):
    """Gotowy do wklejenia prompt budujący całą aplikację."""

    nazwa_aplikacji: str
    okazja: AppOpportunity
    prompt: str = Field(description="Pełny prompt 'wklej i odbierz gotową aplikację'")
    stack: str = Field(description="Sugerowany stack technologiczny (np. Flutter, Kotlin/Compose)")
    utworzono: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
