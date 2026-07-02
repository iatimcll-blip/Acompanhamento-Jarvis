# ─────────────────────────────────────────────────────────────────────────────
#  Jarvis — Instalar GitHub Actions Runner (self-hosted)
#  Execute uma vez na máquina que tem acesso ao Atrix.
#  Depois, o GitHub gerencia tudo automaticamente.
# ─────────────────────────────────────────────────────────────────────────────
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# ── Configuração ──────────────────────────────────────────────────────────────
$GH_REPO    = "iatimcll-blip/Acompanhamento-Jarvis"
$RUNNER_DIR = "D:\JarvisRunner"
$ENV_FILE   = Join-Path (Split-Path $MyInvocation.MyCommand.Path) "scraper\.env"

# Ler token do .env
$envRaw  = Get-Content $ENV_FILE -Raw -Encoding UTF8
$GH_TOKEN = ($envRaw -split "`n" | Where-Object { $_ -match "^GITHUB_TOKEN=" }) -replace "^GITHUB_TOKEN=","" | ForEach-Object { $_.Trim() }

if (-not $GH_TOKEN) {
    [System.Windows.Forms.MessageBox]::Show("GITHUB_TOKEN não encontrado no .env.","Erro","OK","Error") | Out-Null
    exit 1
}

$HEADERS = @{ Authorization = "token $GH_TOKEN"; Accept = "application/vnd.github.v3+json"; "User-Agent" = "jarvis-ps" }

# ── Coletar credenciais Atrix ─────────────────────────────────────────────────
$existingUser = ($envRaw -split "`n" | Where-Object { $_ -match "^ATRIX_USER=\S" }) -replace "^ATRIX_USER=","" | ForEach-Object { $_.Trim() }

$form = New-Object System.Windows.Forms.Form
$form.Text = "Jarvis — Configurar Credenciais Atrix"; $form.Size = New-Object System.Drawing.Size(400,240)
$form.StartPosition = "CenterScreen"; $form.FormBorderStyle = "FixedDialog"; $form.MaximizeBox = $false
$form.TopMost = $true; $form.BackColor = [System.Drawing.Color]::FromArgb(15,23,42); $form.ForeColor = [System.Drawing.Color]::FromArgb(226,232,240)

function Lbl($t,$x,$y){ $l=New-Object System.Windows.Forms.Label; $l.Text=$t; $l.Location=New-Object System.Drawing.Point($x,$y); $l.Size=New-Object System.Drawing.Size(120,20); $l.ForeColor=[System.Drawing.Color]::FromArgb(148,163,184); return $l }
function Txt($x,$y,$pw=$false){ $t=New-Object System.Windows.Forms.TextBox; $t.Location=New-Object System.Drawing.Point($x,$y); $t.Size=New-Object System.Drawing.Size(230,24); $t.BackColor=[System.Drawing.Color]::FromArgb(30,41,59); $t.ForeColor=[System.Drawing.Color]::White; $t.BorderStyle="FixedSingle"; if($pw){$t.PasswordChar="*"}; return $t }

$lbTitle = New-Object System.Windows.Forms.Label; $lbTitle.Text="Credenciais do Atrix"; $lbTitle.Location=New-Object System.Drawing.Point(20,18); $lbTitle.Size=New-Object System.Drawing.Size(350,22); $lbTitle.Font=New-Object System.Drawing.Font("Segoe UI",11,[System.Drawing.FontStyle]::Bold); $lbTitle.ForeColor=[System.Drawing.Color]::FromArgb(96,165,250)
$lbInfo = New-Object System.Windows.Forms.Label; $lbInfo.Text="Necessário para o agente fazer login automaticamente."; $lbInfo.Location=New-Object System.Drawing.Point(20,44); $lbInfo.Size=New-Object System.Drawing.Size(350,16); $lbInfo.ForeColor=[System.Drawing.Color]::FromArgb(100,116,139)

$txtUser = Txt 150 80; if($existingUser){$txtUser.Text=$existingUser}
$txtPass = Txt 150 118 $true
$btn = New-Object System.Windows.Forms.Button; $btn.Text="Instalar Runner"; $btn.Location=New-Object System.Drawing.Point(110,168); $btn.Size=New-Object System.Drawing.Size(160,34); $btn.BackColor=[System.Drawing.Color]::FromArgb(37,99,235); $btn.ForeColor=[System.Drawing.Color]::White; $btn.FlatStyle="Flat"; $btn.DialogResult="OK"; $btn.Font=New-Object System.Drawing.Font("Segoe UI",10,[System.Drawing.FontStyle]::Bold)
$form.AcceptButton = $btn
$form.Controls.AddRange(@($lbTitle,$lbInfo,(Lbl "Usuário Atrix:" 20 83),$txtUser,(Lbl "Senha Atrix:" 20 121),$txtPass,$btn))

$res = $form.ShowDialog()
if ($res -ne "OK" -or -not $txtUser.Text -or -not $txtPass.Text) { exit 0 }

# Salvar credenciais
$envRaw = $envRaw -replace "(?m)^ATRIX_USER=.*","ATRIX_USER=$($txtUser.Text.Trim())"
$envRaw = $envRaw -replace "(?m)^ATRIX_PASS=.*","ATRIX_PASS=$($txtPass.Text)"
[System.IO.File]::WriteAllText($ENV_FILE, $envRaw, [System.Text.Encoding]::UTF8)
Write-Host "✓ Credenciais salvas."

# ── Obter token de registro do runner ─────────────────────────────────────────
Write-Host "Obtendo token de registro do GitHub..."
try {
    $reg = Invoke-RestMethod -Uri "https://api.github.com/repos/$GH_REPO/actions/runners/registration-token" -Method Post -Headers $HEADERS
    $regToken = $reg.token
    Write-Host "✓ Token obtido (expira em $($reg.expires_at))"
} catch {
    [System.Windows.Forms.MessageBox]::Show("Erro ao obter token do GitHub:`n$_`n`nVerifique GITHUB_TOKEN no .env","Erro","OK","Error") | Out-Null
    exit 1
}

# ── Baixar runner ─────────────────────────────────────────────────────────────
Write-Host "Obtendo versão mais recente do runner..."
$latest  = Invoke-RestMethod -Uri "https://api.github.com/repos/actions/runner/releases/latest" -Headers $HEADERS
$asset   = $latest.assets | Where-Object { $_.name -like "actions-runner-win-x64-*.zip" } | Select-Object -First 1
$version = $latest.tag_name

Write-Host "Baixando GitHub Actions Runner $version..."
New-Item -ItemType Directory -Force $RUNNER_DIR | Out-Null
$zipPath = "$RUNNER_DIR\runner.zip"

$wc = New-Object System.Net.WebClient
$wc.DownloadFile($asset.browser_download_url, $zipPath)
Write-Host "✓ Download concluído ($([Math]::Round((Get-Item $zipPath).Length/1MB,1)) MB)"

# ── Extrair ───────────────────────────────────────────────────────────────────
Write-Host "Extraindo..."
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $RUNNER_DIR)
Add-Type -AssemblyName System.IO.Compression.FileSystem
Write-Host "✓ Extraído em $RUNNER_DIR"

# ── Configurar runner ─────────────────────────────────────────────────────────
Write-Host "Configurando runner..."
Push-Location $RUNNER_DIR
$configArgs = "--url https://github.com/$GH_REPO --token $regToken --name jarvis-atrix --labels self-hosted,Windows,x64,jarvis --work `"$RUNNER_DIR\_work`" --unattended --replace"
$p = Start-Process -FilePath "$RUNNER_DIR\config.cmd" -ArgumentList $configArgs -Wait -PassThru -NoNewWindow
if ($p.ExitCode -ne 0) {
    [System.Windows.Forms.MessageBox]::Show("Erro ao configurar runner (código $($p.ExitCode)).`nVerifique a conexão com a internet.","Erro","OK","Error") | Out-Null
    Pop-Location; exit 1
}
Write-Host "✓ Runner configurado."

# ── Instalar como serviço Windows ─────────────────────────────────────────────
Write-Host "Instalando como serviço Windows (inicia automaticamente)..."
$svc = Start-Process -FilePath "$RUNNER_DIR\svc.cmd" -ArgumentList "install" -Wait -PassThru -NoNewWindow
Start-Process -FilePath "$RUNNER_DIR\svc.cmd" -ArgumentList "start" -Wait -NoNewWindow
Pop-Location
Write-Host "✓ Serviço instalado e iniciado."

# ── Limpeza ───────────────────────────────────────────────────────────────────
$zipPath | ForEach-Object { if (Test-Path $_) { [System.IO.File]::Delete($_) } }

# ── Concluído ─────────────────────────────────────────────────────────────────
[System.Windows.Forms.MessageBox]::Show(
    "Runner instalado com sucesso!`n`n" +
    "O GitHub Actions agora roda o agente nesta máquina automaticamente a cada 30 minutos.`n`n" +
    "Em qualquer outro dispositivo, abra o painel — ele lê do GitHub sem precisar de nada instalado.",
    "Jarvis — Runner Instalado", "OK", "Information") | Out-Null

Write-Host ""
Write-Host "Acesse: https://github.com/$GH_REPO/settings/actions/runners"
Write-Host "O runner 'jarvis-atrix' deve aparecer como Online."
