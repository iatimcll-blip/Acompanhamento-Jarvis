@echo off
setlocal
cd /d "%~dp0whatsapp-bridge"
if not exist node_modules (
  call npm.cmd install
)
echo.
echo Jarvis WhatsApp Bridge
echo Acesse o painel e abra a aba WhatsApp para ler o QR Code.
echo Servico local: http://127.0.0.1:8788
echo.
call npm.cmd start
