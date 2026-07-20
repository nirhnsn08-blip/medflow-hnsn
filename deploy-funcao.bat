@echo off
REM ===================================================================
REM  Publica a Edge Function "admin-usuarios" no Supabase.
REM  COMO USAR: de dois cliques neste arquivo (deploy-funcao.bat).
REM  Antes, faca o login uma vez (no PowerShell):
REM       npx.cmd --yes supabase login
REM ===================================================================
setlocal enabledelayedexpansion
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

echo.
echo ==^> Procurando o seu projeto no arquivo .env ...
set "URL="
for /f "tokens=2 delims==" %%A in ('findstr /b /i "VITE_SUPABASE_URL" .env') do set "URL=%%A"
set "REF="
if defined URL (
  set "TMP=!URL:https://=!"
  for /f "tokens=1 delims=." %%B in ("!TMP!") do set "REF=%%B"
)

if not defined REF (
  echo Nao consegui achar o projeto no .env.
  set /p REF=Cole o "ref" do seu projeto (o pedaco antes de .supabase.co):
)

echo ==^> Projeto: !REF!
echo.
echo ==^> Vinculando o projeto...
call npx.cmd --yes supabase link --project-ref !REF!
if errorlevel 1 goto :erro

echo.
echo ==^> Publicando a funcao admin-usuarios...
call npx.cmd --yes supabase functions deploy admin-usuarios
if errorlevel 1 goto :erro

echo.
echo ============================================
echo  PRONTO! A funcao foi publicada com sucesso.
echo  Abra o sistema, entre como master e va em Usuarios.
echo ============================================
echo.
pause
exit /b 0

:erro
echo.
echo ---------------------------------------------------
echo  Algo deu errado. O mais comum e nao ter feito login.
echo  Rode no PowerShell (uma vez):
echo       npx.cmd --yes supabase login
echo  Depois de em dois cliques neste arquivo de novo.
echo ---------------------------------------------------
echo.
pause
exit /b 1
