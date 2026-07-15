$taskName  = "JarvisAtrixSync"
$nodePath  = "C:\Program Files\nodejs\node.exe"
$agentPath = "d:\Acompanhamento Jarvis\scraper\atrix_agent.js"
$workDir   = "d:\Acompanhamento Jarvis\scraper"

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue

$action   = New-ScheduledTaskAction -Execute $nodePath -Argument "`"$agentPath`"" -WorkingDirectory $workDir
$tLogon   = New-ScheduledTaskTrigger -AtLogOn
$tRepeat  = New-ScheduledTaskTrigger -Once -At "00:00" -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew -StartWhenAvailable -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $tLogon,$tRepeat `
    -Settings $settings -Description "Jarvis: atualiza substatus Atrix a cada 30 min" `
    -RunLevel Highest -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

Set-Content "d:\Acompanhamento Jarvis\scraper\task_ok.txt" "OK $(Get-Date -Format 'dd/MM/yyyy HH:mm:ss')" -Encoding UTF8
