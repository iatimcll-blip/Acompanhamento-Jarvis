@echo off
cd /d "%~dp0"

:: Verifica se .env existe
if not exist ".env" (
    echo [ERRO] Arquivo .env nao encontrado.
    echo Copie .env.example para .env e preencha suas credenciais.
    pause
    exit /b 1
)

:: Instala dependencias se necessario
if not exist "venv\Scripts\python.exe" (
    echo Criando ambiente virtual...
    python -m venv venv
    call venv\Scripts\activate
    echo Instalando dependencias...
    pip install -r requirements.txt
    echo Instalando navegador Playwright...
    python -m playwright install chromium
) else (
    call venv\Scripts\activate
)

echo.
echo ========================================
echo  Jarvis Atrix Agent - Iniciando...
echo  Ciclo a cada 30 minutos
echo  Pressione Ctrl+C para parar
echo ========================================
echo.

python atrix_agent.py

pause
