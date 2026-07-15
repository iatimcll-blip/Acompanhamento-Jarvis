# Jarvis — Instalar agendamento automatico
# Execute este arquivo como Administrador (clique direito -> "Executar com o PowerShell como Admin")

$taskName  = "JarvisAtrixSync"
$nodePath  = "C:\Program Files\nodejs\node.exe"
$agentPath = "d:\Acompanhamento Jarvis\scraper\atrix_agent.js"
$workDir   = "d:\Acompanhamento Jarvis\scraper"

# Verificar se node existe
if (-not (Test-Path $nodePath)) {
    $found = Get-ChildItem "C:\Program Files\nodejs","$env:ProgramFiles\nodejs" -Filter "node.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { $nodePath = $found.FullName }
    else { Write-Host "[ERRO] node.exe nao encontrado em $nodePath" -ForegroundColor Red; Read-Host "Enter para sair"; exit 1 }
}

# Verificar se o agente existe
if (-not (Test-Path $agentPath)) {
    Write-Host "[ERRO] Agente nao encontrado em $agentPath" -ForegroundColor Red
    Read-Host "Enter para sair"; exit 1
}

# Remover task antiga
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

# Criar task
$action   = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$agentPath`"" -WorkingDirectory $workDir
$tLogon   = New-ScheduledTaskTrigger -AtLogOn
$tRepeat  = New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $tLogon,$tRepeat -Settings $settings `
    -Description "Jarvis: atualiza substatus do Atrix a cada 30 min" -RunLevel Highest -Force | Out-Null

Write-Host ""
Write-Host "✓ Agendamento criado!" -ForegroundColor Green
Write-Host "  Nome    : $taskName"
Write-Host "  Executa : ao logar + a cada 30 minutos"
Write-Host "  Acoes   : $nodePath"
Write-Host ""

# Executar agora para primeiro teste
$resp = Read-Host "Executar agora para testar? (S/N)"
if ($resp -match "^[Ss]") {
    Start-ScheduledTask -TaskName $taskName
    Write-Host "Agente iniciado! Verifique o log em:" -ForegroundColor Cyan
    Write-Host "  d:\Acompanhamento Jarvis\scraper\atrix_agent.log"
}

Write-Host ""
Read-Host "Pressione Enter para fechar"
