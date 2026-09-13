@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado nesta maquina.
  echo Baixe e instale em https://nodejs.org/ ^(versao LTS^) e rode este arquivo de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Primeira vez rodando aqui - instalando dependencias, isso demora um pouco...
  call npm install
  if errorlevel 1 (
    echo Falha ao instalar as dependencias. Confira sua conexao com a internet e tente de novo.
    pause
    exit /b 1
  )
  echo.
)

if not exist config.json (
  copy config.example.json config.json >nul
  echo.
  echo Criei o arquivo config.json nesta pasta.
  echo Abra ele num editor de texto ^(Bloco de Notas serve^) e troque a URL de
  echo exemplo pela URL do SEU personagem no Roll20 ^(copie da barra de
  echo enderecos do navegador quando a ficha estiver aberta^).
  echo Depois, rode este arquivo de novo.
  pause
  exit /b 0
)

set "PDF=%~1"
if "%PDF%"=="" (
  set /p PDF="Arraste o PDF da ficha preenchida para esta janela e aperte Enter (ou digite o caminho): "
)
rem Tira aspas que a pessoa possa ter digitado/colado junto do caminho
rem (ex.: "Copiar como caminho" do Explorer) — sempre re-adicionamos as
rem aspas abaixo na hora de chamar o node, entao o caminho funciona
rem mesmo com espaco (comum em nomes vindos da pasta Downloads). So
rem faz a troca se PDF nao estiver vazio, senao a sintaxe do "set" da erro.
if not "%PDF%"=="" set "PDF=%PDF:"=%"

if "%PDF%"=="" (
  echo Nenhum PDF informado.
  pause
  exit /b 1
)

echo.
echo === Revisando o que vai ser escrito (nenhuma mudanca feita ainda) ===
node atualizar-ficha.js "%PDF%" --dry-run
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
set /p CONFIRMA="Aplicar isso de verdade na ficha do Roll20 agora? (s/n): "
if /i not "%CONFIRMA%"=="s" (
  echo Cancelado - nada foi alterado na ficha.
  pause
  exit /b 0
)

echo.
node atualizar-ficha.js "%PDF%" --config config.json

echo.
pause
