"""Cienka warstwa nad Anthropic SDK — model flagowy z web search i structured outputs.

Wszystko skupione tutaj, żeby reszta kodu nie znała szczegółów API.
"""

from __future__ import annotations

from typing import TypeVar

import anthropic
from pydantic import BaseModel

from .config import Settings

T = TypeVar("T", bound=BaseModel)

# Wersja narzędzia web search z dynamicznym filtrowaniem (wbudowane w modele 4.6+).
_WEB_SEARCH_TOOL = {"type": "web_search_20260209", "name": "web_search"}


def make_client(settings: Settings) -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def research(
    client: anthropic.Anthropic,
    settings: Settings,
    *,
    system: str,
    prompt: str,
    max_searches: int = 8,
    max_tokens: int = 16000,
) -> str:
    """Wywołanie z web search w pętli agentowej. Zwraca scalony tekst odpowiedzi.

    Używa streamingu (długie wyjście) i adaptive thinking.
    """
    messages = [{"role": "user", "content": prompt}]
    tools = [{**_WEB_SEARCH_TOOL, "max_uses": max_searches}]

    # Pętla obsługująca pause_turn (serwerowe narzędzie wyczerpało iteracje).
    for _ in range(6):
        with client.messages.stream(
            model=settings.model,
            max_tokens=max_tokens,
            system=system,
            thinking={"type": "adaptive"},
            output_config={"effort": settings.effort},
            tools=tools,
            messages=messages,
        ) as stream:
            message = stream.get_final_message()

        if message.stop_reason == "pause_turn":
            messages.append({"role": "assistant", "content": message.content})
            continue
        break

    return "\n".join(b.text for b in message.content if b.type == "text").strip()


def parse_into(
    client: anthropic.Anthropic,
    settings: Settings,
    *,
    schema: type[T],
    system: str,
    prompt: str,
    max_tokens: int = 16000,
) -> T:
    """Structured output — zwraca zwalidowany obiekt Pydantic.

    Uwaga: structured outputs nie współpracują z web search (cytaty), dlatego
    research i formatowanie to dwa osobne wywołania.
    """
    response = client.messages.parse(
        model=settings.model,
        max_tokens=max_tokens,
        system=system,
        thinking={"type": "adaptive"},
        output_config={"effort": settings.effort},
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    if response.parsed_output is None:
        raise RuntimeError(
            "Model nie zwrócił poprawnej struktury "
            f"(stop_reason={response.stop_reason}). Spróbuj ponownie."
        )
    return response.parsed_output


def generate_text(
    client: anthropic.Anthropic,
    settings: Settings,
    *,
    system: str,
    prompt: str,
    max_tokens: int = 32000,
) -> str:
    """Zwykłe długie generowanie tekstu (np. prompt budujący aplikację)."""
    with client.messages.stream(
        model=settings.model,
        max_tokens=max_tokens,
        system=system,
        thinking={"type": "adaptive"},
        output_config={"effort": settings.effort},
        messages=[{"role": "user", "content": prompt}],
    ) as stream:
        message = stream.get_final_message()
    return "\n".join(b.text for b in message.content if b.type == "text").strip()
