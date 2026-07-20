# ═══════════════════════════════════════════════════════════
# Publica a Edge Function "admin-usuarios" no Supabase.
# Uso: clique com o botao direito no arquivo > "Executar com PowerShell"
#      ou rode:  .\deploy-funcao.ps1
#
# Antes de rodar pela 1a vez, faca o login (uma vez so):
#      npx --yes supabase login
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"
$env:Path = "C:\Program Files\nodejs;$env:Path"
Set-Location -Path $PSScriptRoot

Write-Host "==> Verificando login no Supabase..." -ForegroundColor Cyan
$projetos = npx --yes supabase projects list 2>&1
if ($projetos -match "Access token not provided" -or $projetos -match "AuthRequired") {
  Write-Host "`nVoce ainda nao esta logado. Rode uma vez:" -ForegroundColor Yellow
  Write-Host "    npx --yes supabase login`n" -ForegroundColor White
  Write-Host "Depois rode este script de novo." -ForegroundColor Yellow
  exit 1
}

# Descobre o project-ref a partir do VITE_SUPABASE_URL do .env (ex.: https://ABCDEF.supabase.co)
$ref = $null
if (Test-Path ".\.env") {
  $linha = Get-Content ".\.env" | Where-Object { $_ -match "VITE_SUPABASE_URL" } | Select-Object -First 1
  if ($linha -match "https://([a-z0-9]+)\.supabase\.co") { $ref = $Matches[1] }
}
if (-not $ref) {
  $ref = Read-Host "Nao achei o project-ref no .env. Cole o ref do seu projeto (o pedaco antes de .supabase.co)"
}
Write-Host "==> Projeto: $ref" -ForegroundColor Cyan

Write-Host "==> Vinculando o projeto (link)..." -ForegroundColor Cyan
npx --yes supabase link --project-ref $ref

Write-Host "==> Publicando a funcao admin-usuarios..." -ForegroundColor Cyan
npx --yes supabase functions deploy admin-usuarios

Write-Host "`n✓ Pronto! A funcao foi publicada." -ForegroundColor Green
Write-Host "  Agora abra o sistema, entre com seu login master e va na aba Usuarios." -ForegroundColor Green
