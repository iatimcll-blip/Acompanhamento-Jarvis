# -----------------------------------------------------------------------------
# Jarvis - Instalar GitHub Actions Runner (self-hosted)
# Execute em qualquer maquina Windows que tenha acesso ao Atrix.
# Cada dispositivo registra um runner proprio; o botao Iniciar usa qualquer um online.
# -----------------------------------------------------------------------------
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$GH_REPO    = "iatimcll-blip/Acompanhamento-Jarvis"
$RUNNER_DIR = "D:\JarvisRunner"
$ENV_FILE   = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "scraper\.env"
$RUNNER_NAME_RAW = "jarvis-atrix-$($env:COMPUTERNAME)"
$RUNNER_NAME = ($RUNNER_NAME_RAW -replace '[^a-zA-Z0-9._-]', '-').Trim('-')
if (-not $RUNNER_NAME) { $RUNNER_NAME = "jarvis-atrix-local" }

if (-not (Test-Path $ENV_FILE)) {
    [System.Windows.Forms.MessageBox]::Show("Arquivo scraper\.env nao encontrado.", "Erro", "OK", "Error") | Out-Null
    exit 1
}

$envRaw = Get-Content $ENV_FILE -Raw -Encoding UTF8
$GH_TOKEN = ($envRaw -split "`n" | Where-Object { $_ -match "^GITHUB_TOKEN=" }) -replace "^GITHUB_TOKEN=", "" | ForEach-Object { $_.Trim() }

if (-not $GH_TOKEN) {
    [System.Windows.Forms.MessageBox]::Show("GITHUB_TOKEN nao encontrado no .env.", "Erro", "OK", "Error") | Out-Null
    exit 1
}

$HEADERS = @{ Authorization = "token $GH_TOKEN"; Accept = "application/vnd.github.v3+json"; "User-Agent" = "jarvis-ps" }

$existingUser = ($envRaw -split "`n" | Where-Object { $_ -match "^ATRIX_USER=\S" }) -replace "^ATRIX_USER=", "" | ForEach-Object { $_.Trim() }

$form = New-Object System.Windows.Forms.Form
$form.Text = "Jarvis - Configurar Credenciais Atrix"
$form.Size = New-Object System.Drawing.Size(430,260)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(15,23,42)
$form.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)

function Lbl($t,$x,$y){
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $t
    $l.Location = New-Object System.Drawing.Point($x,$y)
    $l.Size = New-Object System.Drawing.Size(130,20)
    $l.ForeColor = [System.Drawing.Color]::FromArgb(148,163,184)
    return $l
}
function Txt($x,$y,$pw=$false){
    $t = New-Object System.Windows.Forms.TextBox
    $t.Location = New-Object System.Drawing.Point($x,$y)
    $t.Size = New-Object System.Drawing.Size(240,24)
    $t.BackColor = [System.Drawing.Color]::FromArgb(30,41,59)
    $t.ForeColor = [System.Drawing.Color]::White
    $t.BorderStyle = "FixedSingle"
    if($pw){ $t.PasswordChar = "*" }
    return $t
}

$lbTitle = New-Object System.Windows.Forms.Label
$lbTitle.Text = "Credenciais do Atrix"
$lbTitle.Location = New-Object System.Drawing.Point(20,18)
$lbTitle.Size = New-Object System.Drawing.Size(380,22)
$lbTitle.Font = New-Object System.Drawing.Font("Segoe UI",11,[System.Drawing.FontStyle]::Bold)
$lbTitle.ForeColor = [System.Drawing.Color]::FromArgb(96,165,250)

$lbInfo = New-Object System.Windows.Forms.Label
$lbInfo.Text = "Este computador sera registrado como: $RUNNER_NAME"
$lbInfo.Location = New-Object System.Drawing.Point(20,44)
$lbInfo.Size = New-Object System.Drawing.Size(390,18)
$lbInfo.ForeColor = [System.Drawing.Color]::FromArgb(100,116,139)

$txtUser = Txt 160 86
if($existingUser){ $txtUser.Text = $existingUser }
$txtPass = Txt 160 124 $true

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Instalar Runner"
$btn.Location = New-Object System.Drawing.Point(125,178)
$btn.Size = New-Object System.Drawing.Size(170,34)
$btn.BackColor = [System.Drawing.Color]::FromArgb(37,99,235)
$btn.ForeColor = [System.Drawing.Color]::White
$btn.FlatStyle = "Flat"
$btn.DialogResult = "OK"
$btn.Font = New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
$form.AcceptButton = $btn
$form.Controls.AddRange(@($lbTitle,$lbInfo,(Lbl "Usuario Atrix:" 20 89),$txtUser,(Lbl "Senha Atrix:" 20 127),$txtPass,$btn))

$res = $form.ShowDialog()
if ($res -ne "OK" -or -not $txtUser.Text -or -not $txtPass.Text) { exit 0 }

function Set-EnvLine($raw, $key, $value) {
    $line = "$key=$value"
    if ($raw -match "(?m)^$key=") {
        return [regex]::Replace($raw, "(?m)^$key=.*", [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $line })
    }
    return $raw.TrimEnd() + "`r`n$line`r`n"
}

$envRaw = Set-EnvLine $envRaw "ATRIX_USER" $txtUser.Text.Trim()
$envRaw = Set-EnvLine $envRaw "ATRIX_PASS" $txtPass.Text
[System.IO.File]::WriteAllText($ENV_FILE, $envRaw, [System.Text.Encoding]::UTF8)
Write-Host "Credenciais salvas."

Write-Host "Obtendo token de registro do GitHub..."
try {
    $reg = Invoke-RestMethod -Uri "https://api.github.com/repos/$GH_REPO/actions/runners/registration-token" -Method Post -Headers $HEADERS
    $regToken = $reg.token
    Write-Host "Token obtido (expira em $($reg.expires_at))"
} catch {
    [System.Windows.Forms.MessageBox]::Show("Erro ao obter token do GitHub:`n$_`n`nVerifique GITHUB_TOKEN no .env", "Erro", "OK", "Error") | Out-Null
    exit 1
}

New-Item -ItemType Directory -Force $RUNNER_DIR | Out-Null
$configCmd = Join-Path $RUNNER_DIR "config.cmd"
$svcCmd = Join-Path $RUNNER_DIR "svc.cmd"

if (-not (Test-Path $configCmd)) {
    Write-Host "Obtendo versao mais recente do runner..."
    $latest = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -Headers $HEADERS
    $asset = $latest.assets | Where-Object { $_.name -like "actions-runner-win-x64-*.zip" } | Select-Object -First 1
    if (-not $asset) { throw "Asset actions-runner-win-x64 nao encontrado." }

    $zipPath = Join-Path $RUNNER_DIR "runner.zip"
    if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

    Write-Host "Baixando GitHub Actions Runner $($latest.tag_name)..."
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($asset.browser_download_url, $zipPath)
    Write-Host "Download concluido ($([Math]::Round((Get-Item $zipPath).Length/1MB,1)) MB)"

    Write-Host "Extraindo..."
    Expand-Archive -LiteralPath $zipPath -DestinationPath $RUNNER_DIR -Force
    Remove-Item -LiteralPath $zipPath -Force
    Write-Host "Extraido em $RUNNER_DIR"
}

Push-Location $RUNNER_DIR
try {
    if (Test-Path ".runner") {
        Write-Host "Removendo configuracao local anterior..."
        if (Test-Path $svcCmd) {
            Start-Process -FilePath $svcCmd -ArgumentList "stop" -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
            Start-Process -FilePath $svcCmd -ArgumentList "uninstall" -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
        }
        try {
            $remove = Invoke-RestMethod -Uri "https://api.github.com/repos/$GH_REPO/actions/runners/remove-token" -Method Post -Headers $HEADERS
            Start-Process -FilePath $configCmd -ArgumentList @("remove","--token",$remove.token) -Wait -NoNewWindow -ErrorAction SilentlyContinue | Out-Null
        } catch {
            Write-Host "Aviso: nao foi possivel remover o runner anterior via GitHub. Tentando substituir..."
        }
    }

    Write-Host "Configurando runner $RUNNER_NAME..."
    $configArgs = @(
        "--url", "https://github.com/$GH_REPO",
        "--token", $regToken,
        "--name", $RUNNER_NAME,
        "--labels", "self-hosted,Windows,x64,jarvis,atrix",
        "--work", "$RUNNER_DIR\_work",
        "--unattended",
        "--replace"
    )
    $p = Start-Process -FilePath $configCmd -ArgumentList $configArgs -Wait -PassThru -NoNewWindow
    if ($p.ExitCode -ne 0) {
        [System.Windows.Forms.MessageBox]::Show("Erro ao configurar runner (codigo $($p.ExitCode)).`nVerifique a conexao com a internet.", "Erro", "OK", "Error") | Out-Null
        exit 1
    }
    Write-Host "Runner configurado."

    Write-Host "Instalando como servico Windows (inicia automaticamente)..."
    Start-Process -FilePath $svcCmd -ArgumentList "install" -Wait -NoNewWindow | Out-Null
    Start-Process -FilePath $svcCmd -ArgumentList "start" -Wait -NoNewWindow | Out-Null
    Write-Host "Servico instalado e iniciado."
}
finally {
    Pop-Location
}

[System.Windows.Forms.MessageBox]::Show(
    "Runner instalado com sucesso!`n`n" +
    "Este dispositivo agora pode executar o Agente Atrix quando alguem clicar em Iniciar no painel.`n`n" +
    "Outros dispositivos com acesso ao Atrix tambem podem instalar seu proprio runner sem substituir este.",
    "Jarvis - Runner Instalado", "OK", "Information") | Out-Null

Write-Host ""
Write-Host "Acesse: https://github.com/$GH_REPO/settings/actions/runners"
Write-Host "O runner '$RUNNER_NAME' deve aparecer como Online."
