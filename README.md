# Reklama Gateway

Autonomiczny serwer-brama na Windows, ktory udostepnia Twoje **narzedzie webowe**
— bez konfiguracji routera, z automatycznym startem i restartem.

Dostepne sa **dwie wersje**:

| Wersja | Dla kogo | Jak dziala | Skrypt |
|---|---|---|---|
| **Wspolna** | dla pracownikow | publiczny link + jedno wspolne haslo (bez kont), przez tunel Cloudflare | `run.ps1` |
| **Prywatna** | tylko dla Ciebie | prywatna siec Tailscale — widoczna wylacznie na Twoim koncie, sterujesz z domu | `run-private.ps1` |

Obie wersje korzystaja z tej samej bramy i tego samego pliku `.env`. Mozesz miec obie naraz.

---

## Jak to dziala (w skrocie)

```
            WERSJA WSPOLNA (pracownicy)              WERSJA PRYWATNA (tylko Ty)

  pracownik --HTTPS--> Cloudflare ----+        Ty (telefon/laptop, Tailscale)
                                      |                      |
                                      v                      v  (prywatna siec)
                            [ Brama: haslo ]  <----  [ Tailscale Serve, HTTPS ]
                                      |                      |
                                      +-------> Twoje narzedzie (localhost) <----+
```

Brama nasluchuje tylko lokalnie (`127.0.0.1`). Na swiat nie wystawia jej router,
tylko tunel (Cloudflare) albo prywatna siec (Tailscale). Twoja siec domowa
pozostaje zamknieta.

---

## Wymagania

- Windows 10/11
- [Node.js LTS](https://nodejs.org) (setup pomoze zainstalowac)
- Twoje narzedzie webowe dzialajace lokalnie (np. `http://127.0.0.1:3000`)

---

## Instalacja (raz)

W PowerShell, w katalogu projektu:

```powershell
.\scripts\setup.ps1
```

Skrypt:
1. sprawdzi Node.js,
2. zainstaluje zaleznosci,
3. utworzy `.env` i **wygeneruje mocne haslo** oraz sekret sesji,
4. pobierze `cloudflared.exe`.

Nastepnie wpisz adres swojego narzedzia w pliku `.env`:

```ini
UPSTREAM_URL=http://127.0.0.1:3000
```

> Jesli zostawisz `UPSTREAM_URL` puste, brama pokaze strone powitalna —
> przydatne do pierwszego testu.

---

## Wersja WSPOLNA — udostepnij pracownikom

```powershell
.\scripts\run.ps1
```

Po chwili w oknie pojawi sie **link i haslo**, np.:

```
   Link  : https://losowe-slowa.trycloudflare.com
   Haslo : Xy7k-Qm2p-9Rt
```

To samo zapisze sie w pliku **`share-info.txt`** — wyslij go (albo sam link + haslo)
pracownikom. Otwieraja link, wpisuja haslo i korzystaja z narzedzia.

### Staly adres (opcjonalnie)
W trybie szybkim adres `trycloudflare.com` zmienia sie po restarcie. Aby miec
**staly adres na wlasnej domenie**:
1. zaloz darmowe konto na [Cloudflare](https://dash.cloudflare.com),
2. Zero Trust → Networks → Tunnels → *Create tunnel*,
3. skopiuj **token** tunelu i wklej do `.env`:
   ```ini
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...twoj-token...
   ```
4. w panelu tunelu ustaw Public Hostname → Service: `http://127.0.0.1:8080`.

Od teraz `run.ps1` uzyje stalego adresu Twojej domeny.

---

## Wersja PRYWATNA — tylko Ty, zdalnie z domu

```powershell
.\scripts\run-private.ps1
```

Skrypt:
1. zainstaluje/uruchomi **Tailscale** (prywatna siec mesh),
2. zaloguje maszyne **Twoim kontem** (raz, przez przegladarke),
3. udostepni narzedzie **wylacznie w Twojej sieci** (Tailscale Serve, HTTPS).

Adres prywatny (typu `https://twoj-pc.twoj-tailnet.ts.net`) zapisze sie w pliku
**`private-access.txt`**.

Aby laczyc sie z domu / w podrozy:
1. na telefonie lub laptopie zainstaluj Tailscale i zaloguj sie **tym samym kontem**,
2. otworz adres prywatny,
3. wpisz haslo — masz pelna kontrole nad narzedziem zdalnie.

Narzedzie **nie jest widoczne publicznie** ani w wyszukiwarkach. Dostep ma
wylacznie Twoje konto i urzadzenia, ktore do niego dodasz.

---

## Pelna autonomia — start z Windows

Aby serwer uruchamial sie **sam po kazdym zalogowaniu** i sam wstawal po awarii:

```powershell
# wersja wspolna (pracownicy):
.\scripts\install-autostart.ps1

# wersja prywatna (tylko Ty):
.\scripts\install-autostart.ps1 -Mode private
```

Uruchomienie od razu, bez restartu:
```powershell
Start-ScheduledTask -TaskName ReklamaGateway          # wspolna
Start-ScheduledTask -TaskName ReklamaGatewayPrivate   # prywatna
```

Wylaczenie autostartu:
```powershell
.\scripts\uninstall-autostart.ps1
```

---

## Konfiguracja (`.env`)

| Klucz | Znaczenie |
|---|---|
| `PORT` | port lokalny bramy (domyslnie 8080) |
| `UPSTREAM_URL` | adres Twojego narzedzia, np. `http://127.0.0.1:3000` |
| `STATIC_DIR` | alternatywnie: folder z plikami do serwowania |
| `ACCESS_PASSWORD` | wspolne haslo dostepu (generowane automatycznie) |
| `SESSION_SECRET` | sekret podpisu sesji (generowany automatycznie) |
| `SESSION_TTL_HOURS` | jak dlugo wazna jest sesja po zalogowaniu |
| `CLOUDFLARE_TUNNEL_TOKEN` | token dla stalego adresu (opcjonalnie) |

Plik `.env` jest prywatny — nie trafia do gita i nie opuszcza Twojego komputera.

---

## Bezpieczenstwo

- Brama nasluchuje tylko na `127.0.0.1` — nie wystawiamy nic bezposrednio do internetu.
- Caly ruch zewnetrzny idzie przez **HTTPS** (Cloudflare / Tailscale).
- Haslo porownywane odpornie na ataki czasowe; limit prob logowania chroni przed zgadywaniem.
- Naglowek `X-Robots-Tag: noindex` — serwis nie trafia do wyszukiwarek.
- **Router pozostaje nietkniety** — brak otwartych portow, brak ryzyka wystawienia sieci domowej.

> Uwaga prawna: udostepniajac narzedzie pracownikom upewnij sie, ze masz do tego
> prawo (licencja narzedzia) i ze konfiguracja jest zgodna z polityka Twojej firmy.

---

## Rozwiazywanie problemow

| Problem | Rozwiazanie |
|---|---|
| `502 - narzedzie niedostepne` | Twoje narzedzie nie dziala lub zly `UPSTREAM_URL`. Uruchom narzedzie i sprawdz adres. |
| Brak linku w `run.ps1` | Zajrzyj do `logs\cloudflared.log`. Sprawdz polaczenie z internetem. |
| Tailscale nie laczy | Uruchom `tailscale status`; zaloguj sie ponownie `tailscale up`. |
| Zmienil sie adres trycloudflare | To normalne w trybie szybkim — uzyj `CLOUDFLARE_TUNNEL_TOKEN` dla stalego adresu. |

Logi znajdziesz w folderze `logs\`.
