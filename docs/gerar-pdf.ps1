# Gera o PDF da documentacao a partir do HTML, usando o Chrome/Edge em modo headless.
# Uso: clique com o botao direito neste arquivo -> "Executar com PowerShell"
#      ou no terminal: powershell -ExecutionPolicy Bypass -File docs\gerar-pdf.ps1

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = "file:///" + ($dir + "\documentacao-valentrax.html").Replace("\", "/")
$out = Join-Path $dir "documentacao-valentrax.pdf"

# Acha o Chrome ou o Edge instalado
$cands = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
)
$browser = $cands | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host "Chrome/Edge nao encontrado."; exit 1 }

if (Test-Path $out) { Remove-Item $out -Force }
& $browser --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="$out" $src 2>$null
Start-Sleep -Seconds 3

if (Test-Path $out) {
  $f = Get-Item $out
  Write-Host ("PDF gerado: {0} ({1:N0} bytes)" -f $f.FullName, $f.Length)
} else {
  Write-Host "Falhou - PDF nao gerado."
}
