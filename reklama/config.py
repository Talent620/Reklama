"""Wczytywanie konfiguracji ze zmiennych środowiskowych / pliku .env."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

# Model flagowy — najmocniejszy dostępny. Nie zmieniaj na słabszy bez powodu.
DEFAULT_MODEL = "claude-opus-4-8"
DEFAULT_EFFORT = "high"


@dataclass(frozen=True)
class Settings:
    """Ustawienia całego pipeline'u."""

    anthropic_api_key: str
    model: str = DEFAULT_MODEL
    effort: str = DEFAULT_EFFORT
    google_play_credentials: str | None = None

    def require_play_credentials(self) -> str:
        if not self.google_play_credentials:
            raise RuntimeError(
                "Brak ścieżki do pliku konta serwisowego Google Play. "
                "Ustaw GOOGLE_PLAY_CREDENTIALS w .env (patrz README)."
            )
        if not os.path.exists(self.google_play_credentials):
            raise RuntimeError(
                f"Plik poświadczeń Google Play nie istnieje: {self.google_play_credentials}"
            )
        return self.google_play_credentials


def load_settings() -> Settings:
    """Wczytuje .env i buduje obiekt Settings.

    Rzuca czytelny błąd, gdy brakuje klucza API.
    """
    load_dotenv()

    api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "Brak ANTHROPIC_API_KEY. Skopiuj .env.example do .env i uzupełnij klucz "
            "(https://console.anthropic.com/)."
        )

    return Settings(
        anthropic_api_key=api_key,
        model=os.getenv("REKLAMA_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL,
        effort=os.getenv("REKLAMA_EFFORT", DEFAULT_EFFORT).strip() or DEFAULT_EFFORT,
        google_play_credentials=(os.getenv("GOOGLE_PLAY_CREDENTIALS") or "").strip() or None,
    )
