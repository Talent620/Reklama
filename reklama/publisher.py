"""Etap 3 — automatyczna publikacja gotowego AAB do Google Play.

Korzysta z Google Play Developer Publishing API (androidpublisher v3) i konta
serwisowego. Wgrywa pakiet App Bundle (.aab) na wybrany kanał (internal/alpha/
beta/production) i zatwierdza edycję.

WYMAGANIA WSTĘPNE (jednorazowo, opisane w README):
  - konto Google Play Developer (jednorazowo 25 USD),
  - aplikacja utworzona w Play Console z tym samym applicationId co AAB,
  - konto serwisowe z dostępem do API i nadanymi uprawnieniami w Play Console,
  - pierwsza wersja produkcyjna zwykle musi przejść ręczną weryfikację Google.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .models import StoreListing

VALID_TRACKS = ("internal", "alpha", "beta", "production")
_SCOPE = "https://www.googleapis.com/auth/androidpublisher"


@dataclass
class PublishResult:
    package_name: str
    version_code: int
    track: str
    status: str
    committed: bool
    listing_updated: bool = False


def _build_service(credentials_path: str):
    """Tworzy klienta androidpublisher. Import lokalny, by nie wymuszać zależności
    Google przy samej analizie/generowaniu promptów."""
    from google.oauth2 import service_account  # type: ignore
    from googleapiclient.discovery import build  # type: ignore

    creds = service_account.Credentials.from_service_account_file(
        credentials_path, scopes=[_SCOPE]
    )
    # cache_discovery=False — unika ostrzeżeń i problemów na środowiskach bez zapisu.
    return build("androidpublisher", "v3", credentials=creds, cache_discovery=False)


def publish_aab(
    credentials_path: str,
    package_name: str,
    aab_path: str,
    *,
    track: str = "internal",
    status: str = "completed",
    release_notes: str | None = None,
    release_name: str | None = None,
    listing: "StoreListing | None" = None,
    listing_language: str = "pl-PL",
    dry_run: bool = False,
) -> PublishResult:
    """Wgrywa AAB i przypisuje go do kanału; opcjonalnie aktualizuje kartę sklepu.

    Args:
        package_name: applicationId aplikacji (np. com.firma.appka).
        aab_path: ścieżka do podpisanego pliku .aab.
        track: internal | alpha | beta | production.
        status: completed | draft | inProgress | halted (dla rollout: 'inProgress').
        release_notes: opis zmian (pl-PL).
        listing: metadane sklepu (tytuł/opisy) do wgrania w tej samej edycji.
        listing_language: język karty sklepu (BCP-47, np. 'pl-PL').
        dry_run: jeśli True — wgrywa do edycji, ale jej NIE zatwierdza (commit).

    Returns:
        PublishResult z numerem wersji i stanem.
    """
    if track not in VALID_TRACKS:
        raise ValueError(f"Nieprawidłowy kanał: {track!r}. Dozwolone: {', '.join(VALID_TRACKS)}")
    if not os.path.exists(aab_path):
        raise FileNotFoundError(f"Nie znaleziono pliku AAB: {aab_path}")
    if not aab_path.lower().endswith(".aab"):
        raise ValueError("Oczekiwano pliku App Bundle (.aab). APK nie jest obsługiwany przez ten upload.")

    from googleapiclient.http import MediaFileUpload  # type: ignore

    service = _build_service(credentials_path)
    edits = service.edits()

    edit = edits.insert(body={}, packageName=package_name).execute()
    edit_id = edit["id"]

    try:
        media = MediaFileUpload(aab_path, mimetype="application/octet-stream", resumable=True)
        bundle = edits.bundles().upload(
            packageName=package_name, editId=edit_id, media_body=media
        ).execute()
        version_code = int(bundle["versionCode"])

        release: dict = {"versionCodes": [version_code], "status": status}
        if release_name:
            release["name"] = release_name
        if release_notes:
            release["releaseNotes"] = [{"language": "pl-PL", "text": release_notes}]

        edits.tracks().update(
            packageName=package_name,
            editId=edit_id,
            track=track,
            body={"track": track, "releases": [release]},
        ).execute()

        listing_updated = False
        if listing is not None:
            edits.listings().update(
                packageName=package_name,
                editId=edit_id,
                language=listing_language,
                body={
                    "language": listing_language,
                    "title": listing.tytul,
                    "shortDescription": listing.krotki_opis,
                    "fullDescription": listing.pelny_opis,
                },
            ).execute()
            listing_updated = True

        if dry_run:
            # Sprzątamy edycję — nic nie publikujemy.
            edits.delete(packageName=package_name, editId=edit_id).execute()
            return PublishResult(
                package_name, version_code, track, status,
                committed=False, listing_updated=listing_updated,
            )

        edits.commit(packageName=package_name, editId=edit_id).execute()
        return PublishResult(
            package_name, version_code, track, status,
            committed=True, listing_updated=listing_updated,
        )

    except Exception:
        # Najlepszy wysiłek: usuń niezatwierdzoną edycję, by nie zostawić śmieci.
        try:
            edits.delete(packageName=package_name, editId=edit_id).execute()
        except Exception:
            pass
        raise
