# ─────────────────────────────────────────────────────────────────────────────
#  Jarvis Atrix — Instalador automatico
#  Execute CONFIGURAR.bat (pede admin automaticamente)
# ─────────────────────────────────────────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$BASE     = Split-Path $MyInvocation.MyCommand.Path
$ENV_FILE = Join-Path $BASE "scraper\.env"
$AGENT    = Join-Path $BASE "scraper\atrix_agent.js"
$NODE     = "C:\Program Files\nodejs\node.exe"
$TASK     = "JarvisAtrixSync"
$WRAPPER  = "D:\JarvisAgent\run.bat"

# ── Passo 1: Verificar Node.js ────────────────────────────────────────────────
if (-not (Test-Path $NODE)) {
    $found = Get-ChildItem "C:\Program Files\nodejs","$env:ProgramFiles\nodejs" -Filter "node.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $NODE = $found.FullName }
    else {
        [System.Windows.Forms.MessageBox]::Show(
            "Node.js nao encontrado.`nBaixe em: https://nodejs.org e instale antes de continuar.",
            "Jarvis — Prerequisito", "OK", "Error") | Out-Null
        exit 1
    }
}

# ── Passo 1.5: Garantir que .env existe (clone novo so tem .env.example) ─────
if (-not (Test-Path $ENV_FILE)) {
    $exampleFile = Join-Path $BASE "scraper\.env.example"
    if (-not (Test-Path $exampleFile)) {
        [System.Windows.Forms.MessageBox]::Show(
            "Nao foi possivel localizar scraper\.env nem scraper\.env.example.`nVerifique se a pasta 'scraper' foi copiada corretamente.",
            "Jarvis — Prerequisito", "OK", "Error") | Out-Null
        exit 1
    }
    Copy-Item $exampleFile $ENV_FILE
}

# ── Passo 2: Coletar credenciais via formulario ───────────────────────────────
$envRaw        = Get-Content $ENV_FILE -Raw -Encoding UTF8
$existingUser  = ($envRaw -split "`n" | Where-Object { $_ -match "^ATRIX_USER=\S" }) -replace "^ATRIX_USER=",""
$existingToken = ($envRaw -split "`n" | Where-Object { $_ -match "^GITHUB_TOKEN=\S" }) -replace "^GITHUB_TOKEN=",""
if ($existingToken -eq "seu_token_github_aqui") { $existingToken = "" }

$form = New-Object System.Windows.Forms.Form
$form.Text            = "Jarvis — Configuracao Atrix"
$form.Size            = New-Object System.Drawing.Size(400, 300)
$form.StartPosition   = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox     = $false
$form.TopMost         = $true
$form.BackColor       = [System.Drawing.Color]::FromArgb(15, 23, 42)
$form.ForeColor       = [System.Drawing.Color]::FromArgb(226, 232, 240)

function MkLabel($text, $x, $y) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $text; $l.Location = New-Object System.Drawing.Point($x, $y)
    $l.Size = New-Object System.Drawing.Size(120, 20); $l.ForeColor = [System.Drawing.Color]::FromArgb(148, 163, 184)
    return $l
}
function MkText($x, $y, $pw = $false) {
    $t = New-Object System.Windows.Forms.TextBox
    $t.Location = New-Object System.Drawing.Point($x, $y); $t.Size = New-Object System.Drawing.Size(230, 24)
    $t.BackColor = [System.Drawing.Color]::FromArgb(30, 41, 59); $t.ForeColor = [System.Drawing.Color]::White
    $t.BorderStyle = "FixedSingle"; if ($pw) { $t.PasswordChar = "*" }
    return $t
}

$lbTitle = New-Object System.Windows.Forms.Label
$lbTitle.Text = "Configurar credenciais do Atrix"; $lbTitle.Location = New-Object System.Drawing.Point(20, 18)
$lbTitle.Size = New-Object System.Drawing.Size(350, 22); $lbTitle.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$lbTitle.ForeColor = [System.Drawing.Color]::FromArgb(96, 165, 250)

$lbSub = New-Object System.Windows.Forms.Label
$lbSub.Text = "Salvo localmente em .env — nao vai para o repositorio."; $lbSub.Location = New-Object System.Drawing.Point(20, 44)
$lbSub.Size = New-Object System.Drawing.Size(350, 16); $lbSub.ForeColor = [System.Drawing.Color]::FromArgb(100, 116, 139)

$txtUser  = MkText 150 82
$txtPass  = MkText 150 122 $true
$txtToken = MkText 150 162 $true
if ($existingUser)  { $txtUser.Text  = $existingUser.Trim() }
if ($existingToken) { $txtToken.Text = $existingToken.Trim() }

$btn = New-Object System.Windows.Forms.Button
$btn.Text = "Instalar e Iniciar"; $btn.Location = New-Object System.Drawing.Point(100, 215)
$btn.Size = New-Object System.Drawing.Size(180, 36); $btn.BackColor = [System.Drawing.Color]::FromArgb(37, 99, 235)
$btn.ForeColor = [System.Drawing.Color]::White; $btn.FlatStyle = "Flat"; $btn.DialogResult = "OK"
$btn.Font = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Bold)
$form.AcceptButton = $btn

$form.Controls.AddRange(@($lbTitle, $lbSub,
    (MkLabel "Usuario Atrix:"    20 85),  $txtUser,
    (MkLabel "Senha Atrix:"      20 125), $txtPass,
    (MkLabel "Token GitHub:"     20 165), $txtToken,
    $btn))

$res = $form.ShowDialog()
if ($res -ne "OK" -or -not $txtUser.Text -or -not $txtPass.Text -or -not $txtToken.Text) {
    Write-Host "Instalacao cancelada (usuario, senha e token do GitHub sao obrigatorios)."; exit 0
}

# ── Passo 3: Salvar credenciais no .env ───────────────────────────────────────
$envRaw = $envRaw -replace "(?m)^ATRIX_USER=.*", "ATRIX_USER=$($txtUser.Text.Trim())"
$envRaw = $envRaw -replace "(?m)^ATRIX_PASS=.*", "ATRIX_PASS=$($txtPass.Text)"
$envRaw = $envRaw -replace "(?m)^GITHUB_TOKEN=.*", "GITHUB_TOKEN=$($txtToken.Text.Trim())"
[System.IO.File]::WriteAllText($ENV_FILE, $envRaw, [System.Text.Encoding]::UTF8)

# ── Passo 4: Criar wrapper bat em caminho sem espaco ─────────────────────────
New-Item -ItemType Directory -Force "D:\JarvisAgent" | Out-Null
Set-Content $WRAPPER "@echo off`ncd /d `"$(Split-Path $AGENT)`"`n`"$NODE`" `"atrix_agent.js`"" -Encoding ASCII

# ── Passo 5: Criar tarefa agendada ───────────────────────────────────────────
Unregister-ScheduledTask -TaskName $TASK -Confirm:$false -ErrorAction SilentlyContinue
$action   = New-ScheduledTaskAction -Execute $NODE -Argument "`"$AGENT`"" -WorkingDirectory (Split-Path $AGENT)
$tLogon   = New-ScheduledTaskTrigger -AtLogOn
$tRepeat  = New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 90) -RepetitionDuration (New-TimeSpan -Days 1825)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable
Register-ScheduledTask -TaskName $TASK -Action $action -Trigger $tLogon,$tRepeat -Settings $settings -Description "Jarvis: atualiza substatus Atrix a cada 90 min" -RunLevel Highest -Force | Out-Null

# ── Passo 6: Instalar dependencias Node + navegador Chromium se necessario ───
$pkgJson     = Join-Path (Split-Path $AGENT) "package.json"
$nodeModules = Join-Path (Split-Path $AGENT) "node_modules"
$npmCmd      = Join-Path (Split-Path $NODE) "npm.cmd"
$npxCmd      = Join-Path (Split-Path $NODE) "npx.cmd"
if ((Test-Path $pkgJson) -and -not (Test-Path $nodeModules)) {
    Push-Location (Split-Path $AGENT)
    & $NODE $npmCmd install --silent 2>&1 | Out-Null
    Pop-Location
}
# O pacote "playwright" nao baixa o Chromium automaticamente (sem postinstall) —
# sem este passo, o agente falha em maquina nova com "Executable doesn't exist".
Push-Location (Split-Path $AGENT)
& $NODE $npxCmd playwright install chromium 2>&1 | Out-Null
Pop-Location

# ── Passo 7: Executar primeiro ciclo ─────────────────────────────────────────
Start-ScheduledTask -TaskName $TASK -ErrorAction SilentlyContinue

[System.Windows.Forms.MessageBox]::Show(
    "Instalacao concluida!`n`n" +
    "O agente esta rodando agora e repetira a cada 90 minutos.`n`n" +
    "Em outros dispositivos: basta abrir o painel - ele le os dados do GitHub automaticamente, sem instalacao.",
    "Jarvis — Instalado com Sucesso", "OK", "Information") | Out-Null

# Abrir log para acompanhar
$log = Join-Path (Split-Path $AGENT) "atrix_agent.log"
if (Test-Path $log) { Start-Process notepad.exe $log }
