@echo off
rem Baixa a versao nova da extensao do WhatsApp do Jarvis e grava por cima desta pasta.
rem A extensao se recarrega sozinha na proxima vez que o Painel WhatsApp consultar o status.
set "JARVIS_PASTA=%~dp0."
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { $z=Join-Path $env:TEMP 'jarvis-wpp-ext.zip'; Invoke-WebRequest -UseBasicParsing ('https://iatimcll-blip.github.io/Acompanhamento-Jarvis/whatsapp-extensao.zip?t='+(Get-Date).Ticks) -OutFile $z; Expand-Archive -Force -LiteralPath $z -DestinationPath $env:JARVIS_PASTA; Remove-Item $z; $v=(Get-Content (Join-Path $env:JARVIS_PASTA 'manifest.json') -Raw | ConvertFrom-Json).version; Write-Host ('Extensao atualizada para a versao '+$v+'. Abra o Painel WhatsApp.') } catch { Write-Host ('Falhou: '+$_.Exception.Message) }"
pause
