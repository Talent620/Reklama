# ============================================================================
#  REKLAMA GATEWAY - INSTALATOR (uruchom raz)
#  Co robi:
#    1. sprawdza Node.js (proponuje instalacje),
#    2. instaluje zaleznosci npm,
#    3. tworzy plik .env i generuje mocne haslo + sekret sesji,
#    4. pobiera cloudflared.exe (tunel, bez konfiguracji routera).
#  Uruchom w PowerShell:  .\scripts\setup.ps1
# ============================================================================

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8

# Przejdz do katalogu glownego projektu (rodzic katalogu scripts).
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Write-Step($msg)  { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn2($msg) { Write-Host "    [!] $msg" -ForegroundColor Yellow }

Write-Host "============================================" -ForegroundColor Magenta
Write-Host "   REKLAMA GATEWAY - instalacja" -ForegroundColor Magenta
Write-Host "============================================" -ForegroundColor Magenta

# --- 1. Node.js -------------------------------------------------------------
Write-Step "Sprawdzam Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Warn2 "Nie znaleziono Node.js."
  $ans = Read-Host "Sprobowac zainstalowac przez winget? (t/n)"
  if ($ans -match '^(t|tak|y|yes)$') {
    winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    Write-Warn2 "Po instalacji ZAMKNIJ to okno PowerShell, otworz nowe i uruchom setup.ps1 ponownie."
    exit 0
  } else {
    Write-Warn2 "Zainstaluj Node.js LTS ze strony https://nodejs.org i uruchom setup ponownie."
    exit 1
  }
}
Write-Ok ("Node.js " + (node --version))

# --- 2. Zaleznosci npm ------------------------------------------------------
Write-Step "Instaluje zaleznosci (npm install)"
npm install --no-fund --no-audit
Write-Ok "Zaleznosci zainstalowane."

# --- 3. Plik .env + sekrety -------------------------------------------------
Write-Step "Konfiguruje plik .env"
$envPath = Join-Path $Root ".env"
if (-not (Test-Path $envPath)) {
  Copy-Item (Join-Path $Root ".env.example") $envPath
  Write-Ok "Utworzono .env z szablonu."
} else {
  Write-Ok "Plik .env juz istnieje - uzupelniam tylko brakujace sekrety."
}

function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  # base64url bez znakow problematycznych
  ([Convert]::ToBase64String($b)) -replace '\+','-' -replace '/','_' -replace '=',''
}

function Set-EnvValue([string]$key, [string]$value) {
  $lines = Get-Content $envPath
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^\s*$key\s*=") { $found = $true; "$key=$value" } else { $line }
  }
  if (-not $found) { $out += "$key=$value" }
  Set-Content -Path $envPath -Value $out -Encoding UTF8
}

function Get-EnvValue([string]$key) {
  $line = (Get-Content $envPath | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1)
  if ($null -eq $line) { return "" }
  return ($line -replace "^\s*$key\s*=", "").Trim()
}

# Haslo dostepu
if ([string]::IsNullOrWhiteSpace((Get-EnvValue "ACCESS_PASSWORD"))) {
  $pwd = New-Secret 9   # ~12 znakow
  Set-EnvValue "ACCESS_PASSWORD" $pwd
  Write-Ok "Wygenerowano wspolne haslo dostepu."
} else {
  Write-Ok "Haslo dostepu juz ustawione - zostawiam."
}

# Sekret sesji
if ([string]::IsNullOrWhiteSpace((Get-EnvValue "SESSION_SECRET"))) {
  Set-EnvValue "SESSION_SECRET" (New-Secret 32)
  Write-Ok "Wygenerowano sekret sesji."
} else {
  Write-Ok "Sekret sesji juz ustawiony - zostawiam."
}

# --- 4. cloudflared ---------------------------------------------------------
Write-Step "Pobieram cloudflared (tunel Cloudflare)"
$cf = Join-Path $Root "cloudflared.exe"
if (Test-Path $cf) {
  Write-Ok "cloudflared.exe juz jest."
} else {
  $url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  Write-Host "    Pobieram z: $url"
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Invoke-WebRequest -Uri $url -OutFile $cf -UseBasicParsing
  Write-Ok "Pobrano cloudflared.exe."
}

# --- Podsumowanie -----------------------------------------------------------
Write-Host "`n============================================" -ForegroundColor Green
Write-Host "   GOTOWE! Instalacja zakonczona." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Twoje wspolne haslo dostepu:" -ForegroundColor White
Write-Host ("    " + (Get-EnvValue "ACCESS_PASSWORD")) -ForegroundColor Yellow
Write-Host ""
Write-Host "Nastepne kroki:" -ForegroundColor White
Write-Host "  1. (Opcjonalnie) Wpisz adres swojego narzedzia w .env -> UPSTREAM_URL"
Write-Host "     np. UPSTREAM_URL=http://127.0.0.1:3000"
Write-Host "  2. Uruchom serwer:               .\scripts\run.ps1"
Write-Host "  3. Aby startowal sam z Windows:  .\scripts\install-autostart.ps1"
Write-Host ""
