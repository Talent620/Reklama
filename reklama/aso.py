"""Etap 2.7 — generator metadanych ASO i polityki prywatności.

Tworzy kompletną kartę sklepu (tytuł/opisy/słowa kluczowe/kategorię), notatki
wydania, treść polityki prywatności oraz wskazówki do formularza Data Safety —
wszystko zgodne z twardymi limitami Google Play.
"""

from __future__ import annotations

import os

import anthropic

from ._llm import parse_into
from .config import Settings
from .knowledge import MARKET_FACTS
from .models import AppOpportunity, StoreListing

_SYSTEM = f"""\
Jesteś specjalistą ASO (App Store Optimization) i compliance Google Play. \
Tworzysz kartę sklepu, która maksymalizuje konwersję i pozycję w wyszukiwarce \
Play, oraz dokumenty zgodności.

{MARKET_FACTS}

Zasady:
- Limity znaków traktuj jako TWARDE: tytuł ≤30, krótki opis ≤80, pełny ≤4000.
- Frazy ASO wpleć naturalnie w krótki i pełny opis (Google indeksuje opisy).
- Polityka prywatności musi odpowiadać realnym danym zbieranym przez aplikację
  (np. AdMob = identyfikatory reklamowe, przybliżona lokalizacja przez IP) i być
  spójna ze wskazówkami Data Safety.
- Pisz po polsku; nazwy kategorii Google Play po angielsku (tak są w Console)."""

_USER = """\
Przygotuj kartę sklepu Google Play dla aplikacji:

- Nazwa robocza: {nazwa}
- Nisza: {nisza}
- Pomysł: {pomysl}
- Grupa docelowa: {grupa}
- Monetyzacja: {model_monet} — {szczegoly_monet}
- Kluczowe funkcje: {funkcje}"""


def generate_listing(
    settings: Settings,
    opportunity: AppOpportunity,
    *,
    client: anthropic.Anthropic | None = None,
) -> StoreListing:
    """Generuje metadane sklepu dla danej okazji (z przycięciem do limitów)."""
    from ._llm import make_client

    client = client or make_client(settings)
    listing = parse_into(
        client,
        settings,
        schema=StoreListing,
        system=_SYSTEM,
        prompt=_USER.format(
            nazwa=opportunity.nazwa,
            nisza=opportunity.nisza,
            pomysl=opportunity.pomysl,
            grupa=opportunity.grupa_docelowa,
            model_monet=opportunity.model_monetyzacji,
            szczegoly_monet=opportunity.szczegoly_monetyzacji,
            funkcje="; ".join(opportunity.kluczowe_funkcje),
        ),
    )
    return listing.przytnij_limity()


def save_listing(listing: StoreListing, slug: str, out_dir: str) -> tuple[str, str]:
    """Zapisuje listing-<slug>.json oraz politykę prywatności jako osobny plik .md."""
    os.makedirs(out_dir, exist_ok=True)
    json_path = os.path.join(out_dir, f"listing-{slug}.json")
    policy_path = os.path.join(out_dir, f"polityka-prywatnosci-{slug}.md")

    with open(json_path, "w", encoding="utf-8") as f:
        f.write(listing.model_dump_json(indent=2))
    with open(policy_path, "w", encoding="utf-8") as f:
        f.write(listing.polityka_prywatnosci_md.rstrip() + "\n")

    return json_path, policy_path


def load_listing(path: str) -> StoreListing:
    with open(path, encoding="utf-8") as f:
        return StoreListing.model_validate_json(f.read()).przytnij_limity()
