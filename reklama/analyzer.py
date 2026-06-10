"""Etap 1 — analiza rynku: na czym da się zarobić w Google Play.

Model flagowy przeszukuje sieć (trendy, top grossing, luki rynkowe),
a następnie destyluje wnioski do ustrukturyzowanego raportu okazji.
"""

from __future__ import annotations

import anthropic

from ._llm import parse_into, research
from .config import Settings
from .models import OpportunityReport

_RESEARCH_SYSTEM = """\
Jesteś analitykiem rynku aplikacji mobilnych i przedsiębiorcą, który zbudował \
kilkanaście dochodowych aplikacji na Androida. Twoim zadaniem jest znaleźć \
KONKRETNE, dochodowe nisze w Google Play, które da się zrealizować jako \
względnie prostą aplikację i zmonetyzować.

Zasady:
- Szukaj realnego popytu (wyszukiwania, trendy, rosnące kategorie), a nie modnych haseł.
- Preferuj nisze o niskiej/średniej konkurencji i jasnym modelu zarobku.
- Bądź konkretny co do monetyzacji: stawki reklam, ceny subskrypcji/IAP, co odblokowuje płatność.
- Odrzucaj pomysły wymagające dużych zespołów, licencji, treści chronionych prawem autorskim
  lub łamiące politykę Google Play.
- Opieraj wnioski na danych z wyszukiwania; gdy czegoś nie wiesz — powiedz wprost."""

_RESEARCH_PROMPT = """\
Obszar/temat do zbadania: {topic}

Znajdź {count} najlepszych nisz na dochodową aplikację Androida w tym obszarze \
(lub w pobliskich, jeśli temat jest pusty/ogólny — wtedy skup się na najbardziej \
zyskownych kategoriach Google Play na {year}).

Dla każdej niszy przeszukaj sieć i ustal:
- realny popyt i dlaczego rośnie,
- poziom konkurencji i czym można się wyróżnić,
- konkretny model i wysokość zarobku,
- trudność wykonania jako MVP,
- kluczowe funkcje i główne ryzyka.

Na końcu wypisz zwięzłe, uporządkowane wnioski — będą podstawą do raportu."""

_EXTRACT_SYSTEM = """\
Przekształć poniższą analizę rynku w ustrukturyzowany raport okazji. \
Nie dodawaj nisz, których nie ma w analizie. Posortuj okazje malejąco wg pola `wynik`. \
Pole `wynik` (0-100) wyważ: popyt i potencjał zarobku w górę, wysoka konkurencja \
i duża trudność w dół. Pisz po polsku, bez polskich znaków diakrytycznych w wartościach pól enum."""

_EXTRACT_PROMPT = """\
Temat zadany przez użytkownika: {topic}

Analiza rynku do przekształcenia w raport:
---
{research}
---"""


def analyze_market(
    settings: Settings,
    topic: str = "",
    *,
    count: int = 5,
    year: int = 2026,
    client: anthropic.Anthropic | None = None,
) -> OpportunityReport:
    """Zwraca raport okazji posortowany wg atrakcyjności.

    Args:
        topic: obszar zainteresowania (pusty = najbardziej dochodowe kategorie ogólnie).
        count: ile nisz wygenerować.
    """
    from ._llm import make_client

    client = client or make_client(settings)
    topic_label = topic.strip() or "(dowolny — wybierz najbardziej dochodowe kategorie)"

    research_text = research(
        client,
        settings,
        system=_RESEARCH_SYSTEM,
        prompt=_RESEARCH_PROMPT.format(topic=topic_label, count=count, year=year),
    )

    report = parse_into(
        client,
        settings,
        schema=OpportunityReport,
        system=_EXTRACT_SYSTEM,
        prompt=_EXTRACT_PROMPT.format(topic=topic_label, research=research_text),
    )
    report.okazje.sort(key=lambda o: o.wynik, reverse=True)
    return report
