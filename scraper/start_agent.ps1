# Jarvis Atrix Agent — Script de inicialização
# Configura credenciais na primeira vez, depois inicia o agente automaticamente.

Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Jarvis Atrix Agent" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ── Verificar .env ────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host "[ERRO] Arquivo .env nao encontrado." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

$envRaw = Get-Content ".env" -Raw -Encoding UTF8

# ── Verificar GitHub token ────────────────────────────────────────────────────
if ($envRaw -notmatch 'GITHUB_TOKEN=\S') {
    Write-Host "[ERRO] GITHUB_TOKEN nao configurado no .env" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# ── Configurar credenciais Atrix (apenas na primeira vez) ────────────────────
$needsCreds = $envRaw -notmatch 'ATRIX_USER=\S'

if ($needsCreds) {
    Write-Host "=== Configuracao inicial ===" -ForegroundColor Yellow
    Write-Host "Credenciais Atrix serao salvas em .env para execucoes futuras."
    Write-Host "(Nao sera necessario digitar novamente)"
    Write-Host ""

    $atrixUser = Read-Host "Usuario Atrix"
    $atrixPass = Read-Host "Senha Atrix"

    $envRaw = $envRaw -replace '(?m)^ATRIX_USER=.*', "ATRIX_USER=$atrixUser"
    $envRaw = $envRaw -replace '(?m)^ATRIX_PASS=.*', "ATRIX_PASS=$atrixPass"
    Set-Content ".env" $envRaw -Encoding UTF8 -NoNewline

    Write-Host ""
    Write-Host "[OK] Credenciais salvas. Proximas execucoes serao totalmente automaticas." -ForegroundColor Green
    Write-Host ""
}
else {
    Write-Host "[OK] Credenciais Atrix configuradas." -ForegroundColor Green
    Write-Host ""
}

# ── Iniciar agente ────────────────────────────────────────────────────────────
Write-Host "Iniciando agente (Ctrl+C para parar)..." -ForegroundColor Green
Write-Host ""

node atrix_agent.js

Write-Host ""
Read-Host "Agente encerrado. Pressione Enter para sair"
