"""Reklama — pipeline od pomysłu na dochodową aplikację do publikacji w Google Play.

Etapy:
    1. analyzer        — model flagowy analizuje rynek i znajduje nisze "na czym zarobić"
    2. prompt_generator — tworzy gotowy do wklejenia prompt "zbuduj całą aplikację"
    3. publisher       — wgrywa gotowy AAB do Google Play przez Developer API
"""

from .config import Settings, load_settings
from .models import AppOpportunity, GeneratedPrompt, OpportunityReport

__all__ = [
    "Settings",
    "load_settings",
    "AppOpportunity",
    "GeneratedPrompt",
    "OpportunityReport",
]

__version__ = "0.1.0"
