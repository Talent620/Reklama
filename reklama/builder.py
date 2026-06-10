"""Etap 2.5 — automatyczne budowanie kodu aplikacji z wygenerowanego promptu.

Zamiast ręcznie wklejać prompt do agenta kodującego, ten moduł sam wysyła go
do modelu flagowego i odbiera kompletny projekt (wiele plików), który zapisuje
na dysk. Wynik jest gotowy do `flutter pub get && flutter build appbundle`.

Model emituje pliki w prostym, odpornym na długie wyjścia formacie:

    ===== FILE: lib/main.dart =====
    <zawartość>
    ===== END =====

Parsujemy go strumieniowo po zakończeniu generacji; przy uciętym wyjściu
(stop_reason == max_tokens) prosimy o kontynuację i sklejamy tekst.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field

import anthropic

from .config import Settings
from .models import GeneratedPrompt

_FILE_RE = re.compile(
    r"^===== FILE: (?P<path>[^\n]+?) =====\n(?P<body>.*?)\n===== END =====",
    re.DOTALL | re.MULTILINE,
)

_BUILD_SYSTEM = """\
Jesteś agentem kodującym. Wykonujesz specyfikację aplikacji w całości — bez \
pytań zwrotnych, bez placeholderów, bez TODO. Generujesz KOMPLETNY projekt, \
który kompiluje się bez poprawek.

FORMAT WYJŚCIA (obowiązkowy, niczego poza nim nie wypisuj):
Każdy plik projektu emituj jako blok:

===== FILE: <ścieżka/względna/pliku> =====
<pełna zawartość pliku>
===== END =====

Zasady:
- Wygeneruj WSZYSTKIE pliki potrzebne do zbudowania projektu (kod, pubspec/gradle,
  manifesty, zasoby tekstowe). Pliki binarne (ikony/obrazy) pomiń, ale kod nie może
  ich wymagać do kompilacji.
- Ostatnim blokiem zawsze emituj plik `BUILD.md` z dokładnymi komendami budowania
  podpisanego AAB oraz listą metadanych do sklepu (tytuł, opisy, kategoria, ASO).
- Jeśli zabraknie miejsca w odpowiedzi, urwij się w pół bloku — na prośbę
  "KONTYNUUJ" wznowisz emisję dokładnie od miejsca przerwania, bez powtórek
  i bez żadnego komentarza."""

_CONTINUE_MSG = "KONTYNUUJ"

# Limity bezpieczeństwa.
_MAX_CONTINUATIONS = 8
_MAX_TOKENS_PER_TURN = 64000


@dataclass
class BuildResult:
    out_dir: str
    files: list[str] = field(default_factory=list)
    truncated: bool = False

    @property
    def build_instructions(self) -> str | None:
        path = os.path.join(self.out_dir, "BUILD.md")
        return path if os.path.exists(path) else None


def _safe_join(root: str, rel_path: str) -> str | None:
    """Łączy ścieżkę z ochroną przed path traversal. None = ścieżka odrzucona."""
    rel_path = rel_path.strip().lstrip("/\\")
    if not rel_path or rel_path.startswith("~"):
        return None
    candidate = os.path.realpath(os.path.join(root, rel_path))
    root_real = os.path.realpath(root)
    if candidate != root_real and not candidate.startswith(root_real + os.sep):
        return None
    return candidate


def build_app(
    settings: Settings,
    generated: GeneratedPrompt,
    out_dir: str,
    *,
    client: anthropic.Anthropic | None = None,
    on_progress=None,
) -> BuildResult:
    """Wysyła prompt do modelu, odbiera projekt i zapisuje pliki na dysk.

    Args:
        generated: prompt z etapu 2 (prompt_generator).
        out_dir: katalog docelowy projektu (zostanie utworzony).
        on_progress: opcjonalny callback(str) z komunikatami postępu.

    Returns:
        BuildResult z listą zapisanych plików.
    """
    from ._llm import make_client

    client = client or make_client(settings)
    notify = on_progress or (lambda _msg: None)

    messages: list[dict] = [{"role": "user", "content": generated.prompt}]
    chunks: list[str] = []
    truncated = False

    for turn in range(1 + _MAX_CONTINUATIONS):
        notify(f"Generuję kod (tura {turn + 1})...")
        with client.messages.stream(
            model=settings.model,
            max_tokens=_MAX_TOKENS_PER_TURN,
            system=_BUILD_SYSTEM,
            thinking={"type": "adaptive"},
            output_config={"effort": settings.effort},
            messages=messages,
        ) as stream:
            message = stream.get_final_message()

        text = "".join(b.text for b in message.content if b.type == "text")
        chunks.append(text)

        if message.stop_reason != "max_tokens":
            break
        # Wyjście ucięte — prosimy o wznowienie od miejsca przerwania.
        messages.append({"role": "assistant", "content": message.content})
        messages.append({"role": "user", "content": _CONTINUE_MSG})
    else:
        truncated = True

    full_text = "".join(chunks)
    os.makedirs(out_dir, exist_ok=True)

    result = BuildResult(out_dir=out_dir, truncated=truncated)
    for match in _FILE_RE.finditer(full_text):
        target = _safe_join(out_dir, match.group("path"))
        if target is None:
            notify(f"Pominięto podejrzaną ścieżkę: {match.group('path')!r}")
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as f:
            f.write(match.group("body").rstrip() + "\n")
        result.files.append(os.path.relpath(target, out_dir))
        notify(f"Zapisano: {result.files[-1]}")

    if not result.files:
        raise RuntimeError(
            "Model nie zwrócił żadnych plików w oczekiwanym formacie. "
            "Spróbuj ponownie lub wklej prompt ręcznie do agenta kodującego."
        )
    return result
