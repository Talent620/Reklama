"""Baza wiedzy o wymogach Google Play i monetyzacji (research: czerwiec 2026).

Fakty wstrzykiwane do promptów analizy/generowania, żeby model opierał się na
aktualnych realiach, oraz wyświetlane użytkownikowi jako checklista zgodności.

Źródła: support.google.com/googleplay (Play Console Help), developer.android.com,
raporty eCPM 2025/2026 (Playwire, Tenjin, MonetizeMore).
"""

from __future__ import annotations

MARKET_FACTS = """\
AKTUALNE REALIA GOOGLE PLAY (stan: 2026 — uwzględniaj w analizie i szacunkach):

Wymogi publikacji:
- Nowe KONTA OSOBISTE (utworzone po 13.11.2023) przed produkcją muszą przejść
  zamknięty test: min. 12 opt-in testerów przez 14 KOLEJNYCH dni (konta firmowe zwolnione).
- Nowe aplikacje od 31.08.2026 muszą celować w Android 16 (API 36).
- Obowiązkowe: formularz Data Safety (14 kategorii danych) + polityka prywatności;
  niespójność między nimi blokuje przegląd.
- Pierwsza wersja produkcyjna przechodzi ręczną weryfikację Google (zwykle 1-7 dni).

Limity opisów sklepu (twarde):
- Tytuł: max 30 znaków; zakazane "free", "#1", "best", emoji-spam, CAPS.
- Krótki opis: max 80 znaków. Pełny opis: max 4000 znaków.

Benchmarki monetyzacji reklamami (AdMob, eCPM):
- Banner: Tier-1 ~0.5-1.5 USD; średnia globalna 0.2-0.8 USD.
- Interstitial: Tier-1 ~5-14 USD; średnia globalna 2.5-5 USD.
- Rewarded video: Tier-1 ~18-45 USD; średnia globalna 10-22 USD.
- Gry mają eCPM ~20-30% wyższe niż inne kategorie; ruch z Tier-1 daje ~3x przychód
  vs ruch globalny. Szacunki przychodu licz od realnego DAU i liczby wyświetleń/użytkownika,
  nie od pobrań.

Retencja i konwersja (mediany rynkowe — licz od nich, nie od marzeń):
- Retencja: D1 26%, D7 13%, D30 7%. Po miesiącu zostaje ~7% instalujących.
- Freemium: tylko ~2.1% pobrań staje się płacącymi (D35); hard paywall ~10.7%
  pobrań, ale mniej instalacji. Download->trial 3.7-8.9%; trial->paid 38-54%.
- 55% anulowań triala następuje w DNIU 0 — pierwsza sesja musi dowieźć wartość.
- Subskrypcje tygodniowe tracą 65% użytkowników w 30 dni; roczne trzymają najlepiej.

Wnioski monetyzacyjne:
- Same bannery rzadko utrzymują aplikację — preferuj rewarded/interstitial + IAP/subskrypcję.
- Subskrypcje: typowe punkty cenowe 2.99-9.99 USD/mies.; trial 3-7 dni podnosi konwersję.
- Google bierze 15% prowizji do 1 mln USD przychodu rocznie (program Small Business).

BRUTALNA PRAWDA O DYSTRYBUCJI (najważniejszy czynnik zarobku):
- Większość aplikacji zarabia ~0 USD, bo nikt ich nie znajduje — wąskim gardłem
  jest pozyskanie użytkowników, nie kod. Mediana udanej aplikacji indie: 1-5 tys.
  USD/mies.; topowe nisze (produktywność, zdrowie, narzędzia kreatywne) 50 tys.+.
- ASO to absolutne minimum, ale samo nie wygeneruje popytu. Każda nisza MUSI mieć
  zidentyfikowany kanał pozyskania: frazy o realnym wolumenie wyszukiwań w Play,
  istniejące społeczności (Reddit/FB/Discord), short-form video (TikTok/Reels/Shorts),
  SEO/web companion albo płatny UA z dodatnim ROAS.
- Odrzucaj nisze, w których nie umiesz wskazać, SKĄD przyjdzie pierwsze
  10 000 instalacji."""

CHECKLIST = [
    ("Konto Google Play Developer", "Jednorazowa opłata 25 USD; konto firmowe omija wymóg testerów."),
    ("Zamknięty test (konta osobiste po 13.11.2023)", "Min. 12 testerów opt-in przez 14 kolejnych dni, potem wniosek o produkcję."),
    ("Target API", "Nowe aplikacje od 31.08.2026: Android 16 (API 36)."),
    ("Podpisany AAB", "App Bundle podpisany Twoim kluczem (upload key); Play App Signing zalecane."),
    ("Data Safety", "Formularz 14 kategorii danych — musi być spójny z polityką prywatności."),
    ("Polityka prywatności", "Publiczny URL wymagany dla każdej aplikacji (generuje ją komenda 'listing')."),
    ("Opisy sklepu", "Tytuł ≤30, krótki opis ≤80, pełny ≤4000 znaków; bez 'free'/'#1'/'best' w tytule."),
    ("Grafiki", "Ikona 512x512 PNG, feature graphic 1024x500, min. 2 zrzuty ekranu na typ urządzenia."),
    ("Reklamy/IAP", "Deklaracja reklam w Console; AdMob app-ads.txt na domenie dewelopera."),
    ("Pierwsza produkcja", "Ręczna weryfikacja Google, zwykle 1-7 dni."),
]
