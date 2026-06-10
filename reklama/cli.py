"""Interfejs wiersza poleceń narzędzia Reklama.

Komendy:
    reklama analyze   "fitness"          # znajdź dochodowe nisze
    reklama prompt    "fitness"          # nisze + gotowy prompt dla najlepszej
    reklama pipeline  "fitness"          # pełny przebieg: analiza -> prompt(y)
    reklama pipeline  "fitness" --build  # j.w. + auto-budowa kodu najlepszej aplikacji
    reklama build     --prompt out/prompt-x.json   # zbuduj kod z zapisanego promptu
    reklama listing   --prompt out/prompt-x.json   # karta sklepu (ASO) + polityka prywatności
    reklama wymogi                       # checklista zgodności Google Play
    reklama kalkulator --installs 10000 --model hybryda --cena 4.99
    reklama publish   --package ... --aab app.aab --track internal \
                      --listing out/listing-x.json   # AAB + opisy sklepu w jednej edycji
"""

from __future__ import annotations

import argparse
import sys

from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import analyzer, prompt_generator, storage
from .config import load_settings
from .models import OpportunityReport

console = Console()


def _print_report(report: OpportunityReport) -> None:
    console.print(Panel.fit(report.podsumowanie, title=f"Analiza: {report.temat}", border_style="cyan"))
    table = Table(show_lines=True)
    table.add_column("#", justify="right", style="bold")
    table.add_column("Wynik", justify="right")
    table.add_column("Nazwa", style="bold green")
    table.add_column("Monetyzacja")
    table.add_column("Przychod/mies.")
    table.add_column("Konk.")
    table.add_column("Trud.")
    for i, o in enumerate(report.okazje, 1):
        table.add_row(
            str(i), str(o.wynik), o.nazwa, o.model_monetyzacji,
            o.szac_miesieczny_przychod_usd, o.poziom_konkurencji, o.trudnosc_wykonania,
        )
    console.print(table)
    best = report.best()
    if best.kanaly_pozyskania:
        console.print(
            f"[bold]Kanały pozyskania ({best.nazwa}):[/bold] "
            + "; ".join(best.kanaly_pozyskania)
        )


def cmd_analyze(args: argparse.Namespace) -> int:
    settings = load_settings()
    with console.status("[cyan]Model flagowy analizuje rynek (web search)..."):
        report = analyzer.analyze_market(settings, args.temat, count=args.ile)
    _print_report(report)
    path = storage.save_report(report, args.out)
    console.print(f"[dim]Raport zapisany: {path}")
    return 0


def cmd_prompt(args: argparse.Namespace) -> int:
    settings = load_settings()
    with console.status("[cyan]Analiza rynku..."):
        report = analyzer.analyze_market(settings, args.temat, count=args.ile)
    _print_report(report)
    storage.save_report(report, args.out)

    best = report.best()
    console.print(f"\n[bold]Generuję prompt dla:[/bold] {best.nazwa} (wynik {best.wynik})")
    with console.status("[cyan]Tworzę gotowy do wklejenia prompt..."):
        generated = prompt_generator.generate_prompt(settings, best)
    txt_path, _ = storage.save_prompt(generated, args.out)

    console.print(Panel(generated.prompt, title="PROMPT — wklej do agenta kodującego", border_style="green"))
    console.print(f"[dim]Prompt zapisany: {txt_path}")
    return 0


def cmd_pipeline(args: argparse.Namespace) -> int:
    settings = load_settings()
    with console.status("[cyan]Analiza rynku..."):
        report = analyzer.analyze_market(settings, args.temat, count=args.ile)
    _print_report(report)
    storage.save_report(report, args.out)

    top = report.okazje[: args.top]
    console.print(f"\n[bold]Generuję prompty dla {len(top)} najlepszych nisz...[/bold]")
    best_generated = None
    for o in top:
        with console.status(f"[cyan]Prompt: {o.nazwa}..."):
            generated = prompt_generator.generate_prompt(settings, o)
        if best_generated is None:
            best_generated = generated
        txt_path, _ = storage.save_prompt(generated, args.out)
        console.print(f"  [green]✓[/green] {o.nazwa} -> {txt_path}")

    # Karta sklepu (ASO) + polityka prywatności dla najlepszej niszy.
    if best_generated is not None and not args.no_aso:
        from . import aso

        best = best_generated.okazja
        with console.status(f"[cyan]Karta sklepu (ASO): {best.nazwa}..."):
            listing = aso.generate_listing(settings, best)
        json_path, policy_path = aso.save_listing(listing, best.slug, args.out)
        console.print(f"  [green]✓[/green] Karta sklepu -> {json_path}")
        console.print(f"  [green]✓[/green] Polityka prywatności -> {policy_path}")

    if args.build and best_generated is not None:
        app_dir = _run_build(settings, best_generated, args.out)
        next_step = (
            f"Kod najlepszej aplikacji jest w [bold]{app_dir}[/bold] — "
            "zbuduj AAB wg BUILD.md i opublikuj komendą [bold]reklama publish[/bold]."
        )
    else:
        next_step = (
            f"Otwórz pliki [bold]prompt-*.txt[/bold] w katalogu '{args.out}', "
            "wklej do agenta kodującego (lub użyj [bold]reklama build[/bold]), "
            "a potem opublikuj komendą [bold]reklama publish[/bold]."
        )

    console.print(Panel.fit(f"Gotowe. {next_step}", border_style="cyan"))
    return 0


def _run_build(settings, generated, out_root: str) -> str:
    """Wspólna obsługa auto-budowy: model generuje projekt i zapisuje pliki."""
    from . import builder

    app_dir = f"{out_root}/app-{generated.okazja.slug}"
    console.print(f"\n[bold]Auto-budowa aplikacji:[/bold] {generated.nazwa_aplikacji} -> {app_dir}")
    with console.status("[cyan]Model generuje projekt...") as status:
        result = builder.build_app(
            settings, generated, app_dir,
            on_progress=lambda msg: status.update(f"[cyan]{msg}"),
        )
    console.print(f"  [green]✓[/green] Zapisano {len(result.files)} plików")
    if result.truncated:
        console.print(
            "  [yellow]⚠ Wyjście mogło zostać ucięte mimo kontynuacji — "
            "sprawdź kompletność projektu.[/yellow]"
        )
    if result.build_instructions:
        console.print(f"  [dim]Instrukcje budowania: {result.build_instructions}")
    return app_dir


def cmd_build(args: argparse.Namespace) -> int:
    import json

    from .models import GeneratedPrompt

    from . import builder

    settings = load_settings()
    with open(args.prompt, encoding="utf-8") as f:
        generated = GeneratedPrompt.model_validate(json.load(f))
    app_dir = args.out or f"out/app-{generated.okazja.slug}"

    with console.status("[cyan]Model generuje projekt...") as status:
        result = builder.build_app(
            settings, generated, app_dir,
            on_progress=lambda msg: status.update(f"[cyan]{msg}"),
        )
    console.print(
        Panel.fit(
            f"Zapisano {len(result.files)} plików w [bold]{app_dir}[/bold].\n"
            + ("⚠ Wyjście mogło zostać ucięte — sprawdź projekt.\n" if result.truncated else "")
            + (f"Instrukcje budowania: {result.build_instructions}" if result.build_instructions else ""),
            title=f"Auto-budowa: {generated.nazwa_aplikacji}",
            border_style="green",
        )
    )
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    from . import publisher

    settings = load_settings()
    creds = settings.require_play_credentials()

    listing = None
    if args.listing:
        from . import aso

        listing = aso.load_listing(args.listing)

    with console.status(f"[cyan]Wgrywam {args.aab} na kanał '{args.track}'..."):
        result = publisher.publish_aab(
            creds,
            args.package,
            args.aab,
            track=args.track,
            status=args.status,
            release_notes=args.notes,
            listing=listing,
            dry_run=args.dry_run,
        )
    msg = (
        f"applicationId: {result.package_name}\n"
        f"versionCode:   {result.version_code}\n"
        f"kanal:         {result.track} ({result.status})\n"
        f"karta sklepu:  {'zaktualizowana' if result.listing_updated else 'bez zmian'}\n"
        f"zatwierdzono:  {'TAK' if result.committed else 'NIE (dry-run)'}"
    )
    console.print(Panel(msg, title="Publikacja Google Play", border_style="green"))
    return 0


def cmd_listing(args: argparse.Namespace) -> int:
    import json

    from . import aso
    from .models import GeneratedPrompt

    settings = load_settings()
    with open(args.prompt, encoding="utf-8") as f:
        generated = GeneratedPrompt.model_validate(json.load(f))
    opportunity = generated.okazja

    with console.status(f"[cyan]Karta sklepu (ASO): {opportunity.nazwa}..."):
        listing = aso.generate_listing(settings, opportunity)
    json_path, policy_path = aso.save_listing(listing, opportunity.slug, args.out)

    console.print(Panel(
        f"[bold]Tytuł ({len(listing.tytul)}/30):[/bold] {listing.tytul}\n"
        f"[bold]Krótki opis ({len(listing.krotki_opis)}/80):[/bold] {listing.krotki_opis}\n"
        f"[bold]Kategoria:[/bold] {listing.kategoria}\n"
        f"[bold]Frazy ASO:[/bold] {', '.join(listing.slowa_kluczowe_aso)}",
        title="Karta sklepu Google Play", border_style="green",
    ))
    console.print(f"[dim]Zapisano: {json_path} oraz {policy_path}")
    console.print(
        "[dim]Użyj przy publikacji: reklama publish ... --listing " + json_path
    )
    return 0


def cmd_kalkulator(args: argparse.Namespace) -> int:
    from . import economics

    wyniki = economics.scenariusze(
        args.installs,
        model=args.model,
        cena_mies_usd=args.cena,
        hard_paywall=args.hard_paywall,
    )
    table = Table(
        title=f"Realny szacunek przychodu — model: {args.model}"
              + (f", cena {args.cena:.2f} USD/mies." if args.model != "reklamy" else ""),
        show_lines=True,
    )
    table.add_column("Scenariusz", style="bold")
    table.add_column("Instalacje/mies.", justify="right")
    table.add_column("DAU", justify="right")
    table.add_column("Subskrybenci", justify="right")
    table.add_column("Reklamy USD", justify="right")
    table.add_column("Subskrypcje USD", justify="right")
    table.add_column("RAZEM USD/mies.", justify="right", style="bold green")
    for s in wyniki:
        table.add_row(
            s.scenariusz, f"{s.instalacje_mies:,}", f"{s.dau:,}", f"{s.subskrybenci:,}",
            f"{s.przychod_reklamy:,.0f}", f"{s.przychod_subskrypcje:,.0f}",
            f"{s.przychod_netto:,.0f}",
        )
    console.print(table)
    console.print(
        "[dim]Mediany rynkowe: D1 26% / D7 13% / D30 7%; freemium ~2.1% płacących; "
        "prowizja Google 15% na subskrypcjach. Najwięcej zmienia liczba instalacji — "
        "czyli kanał pozyskania.[/dim]"
    )
    return 0


def cmd_wymogi(_args: argparse.Namespace) -> int:
    from .knowledge import CHECKLIST

    table = Table(title="Checklista publikacji w Google Play (stan: 2026)", show_lines=True)
    table.add_column("Wymóg", style="bold green", no_wrap=False)
    table.add_column("Szczegóły")
    for name, details in CHECKLIST:
        table.add_row(name, details)
    console.print(table)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="reklama",
        description="Generator dochodowych pomysłów/promptów na aplikacje + publikacja do Google Play.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    a = sub.add_parser("analyze", help="Znajdź dochodowe nisze")
    a.add_argument("temat", nargs="?", default="", help="Obszar (pusty = najbardziej dochodowe ogólnie)")
    a.add_argument("--ile", type=int, default=5, help="Ile nisz (domyślnie 5)")
    a.add_argument("--out", default=storage.DEFAULT_OUT, help="Katalog wyjściowy")
    a.set_defaults(func=cmd_analyze)

    pr = sub.add_parser("prompt", help="Nisze + prompt dla najlepszej")
    pr.add_argument("temat", nargs="?", default="")
    pr.add_argument("--ile", type=int, default=5)
    pr.add_argument("--out", default=storage.DEFAULT_OUT)
    pr.set_defaults(func=cmd_prompt)

    pl = sub.add_parser("pipeline", help="Pełny przebieg: analiza + prompty dla top N")
    pl.add_argument("temat", nargs="?", default="")
    pl.add_argument("--ile", type=int, default=5)
    pl.add_argument("--top", type=int, default=3, help="Dla ilu najlepszych nisz generować prompty")
    pl.add_argument("--build", action="store_true",
                    help="Auto-buduj kod najlepszej aplikacji (model generuje projekt)")
    pl.add_argument("--no-aso", action="store_true",
                    help="Pomiń generowanie karty sklepu i polityki prywatności")
    pl.add_argument("--out", default=storage.DEFAULT_OUT)
    pl.set_defaults(func=cmd_pipeline)

    b = sub.add_parser("build", help="Auto-buduj kod aplikacji z zapisanego promptu")
    b.add_argument("--prompt", required=True, help="Ścieżka do out/prompt-<nazwa>.json")
    b.add_argument("--out", default=None, help="Katalog projektu (domyślnie out/app-<nazwa>)")
    b.set_defaults(func=cmd_build)

    li = sub.add_parser("listing", help="Karta sklepu (ASO) + polityka prywatności z promptu")
    li.add_argument("--prompt", required=True, help="Ścieżka do out/prompt-<nazwa>.json")
    li.add_argument("--out", default=storage.DEFAULT_OUT)
    li.set_defaults(func=cmd_listing)

    w = sub.add_parser("wymogi", help="Checklista zgodności publikacji w Google Play")
    w.set_defaults(func=cmd_wymogi)

    k = sub.add_parser("kalkulator", help="Realny szacunek przychodu (benchmarki 2026)")
    k.add_argument("--installs", type=int, required=True, help="Instalacje miesięcznie")
    k.add_argument("--model", default="hybryda", choices=["reklamy", "subskrypcja", "hybryda"])
    k.add_argument("--cena", type=float, default=4.99, help="Cena subskrypcji USD/mies.")
    k.add_argument("--hard-paywall", action="store_true",
                   help="Twardy paywall (konwersja ~10.7%% zamiast ~2.1%%)")
    k.set_defaults(func=cmd_kalkulator)

    pub = sub.add_parser("publish", help="Wgraj gotowy AAB do Google Play")
    pub.add_argument("--package", required=True, help="applicationId, np. com.firma.app")
    pub.add_argument("--aab", required=True, help="Ścieżka do podpisanego .aab")
    pub.add_argument("--track", default="internal", help="internal|alpha|beta|production")
    pub.add_argument("--status", default="completed", help="completed|draft|inProgress|halted")
    pub.add_argument("--notes", default=None, help="Opis zmian (pl-PL)")
    pub.add_argument("--listing", default=None,
                     help="Ścieżka do out/listing-<nazwa>.json — wgra też opisy sklepu")
    pub.add_argument("--dry-run", action="store_true", help="Wgraj bez zatwierdzania (commit)")
    pub.set_defaults(func=cmd_publish)

    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except KeyboardInterrupt:
        console.print("\n[yellow]Przerwano.")
        return 130
    except Exception as exc:  # noqa: BLE001 — czytelny komunikat dla użytkownika CLI
        console.print(f"[red]Błąd:[/red] {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
