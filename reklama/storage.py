"""Zapis/odczyt artefaktów pipeline na dysk."""

from __future__ import annotations

import json
import os

from .models import GeneratedPrompt, OpportunityReport

DEFAULT_OUT = "out"


def ensure_dir(path: str) -> str:
    os.makedirs(path, exist_ok=True)
    return path


def save_report(report: OpportunityReport, out_dir: str = DEFAULT_OUT) -> str:
    ensure_dir(out_dir)
    path = os.path.join(out_dir, "raport-okazji.json")
    with open(path, "w", encoding="utf-8") as f:
        f.write(report.model_dump_json(indent=2))
    return path


def load_report(path: str) -> OpportunityReport:
    with open(path, encoding="utf-8") as f:
        return OpportunityReport.model_validate_json(f.read())


def save_prompt(generated: GeneratedPrompt, out_dir: str = DEFAULT_OUT) -> tuple[str, str]:
    """Zapisuje prompt jako .txt (do wklejenia) i .json (z metadanymi)."""
    ensure_dir(out_dir)
    slug = generated.okazja.slug
    txt_path = os.path.join(out_dir, f"prompt-{slug}.txt")
    json_path = os.path.join(out_dir, f"prompt-{slug}.json")

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write(generated.prompt.rstrip() + "\n")
    with open(json_path, "w", encoding="utf-8") as f:
        f.write(generated.model_dump_json(indent=2))

    return txt_path, json_path
