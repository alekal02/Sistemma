# =============================================================================
# backup-destino.ps1 - rodar NA MAQUINA DESTINO (C:\Sistemma)
# =============================================================================
# NAO apaga dados. NAO usa docker compose down -v.
# Gera dump do banco atual e copia o .env (com TAG) para rollback.
# =============================================================================
param(
  [string]$Destino = "C:\Sistemma\backups",
  [string]$Container = "sistemma-postgres",
  [string]$Usuario = "neurai",
  [string]$Banco = "abastecimento"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $Destino | Out-Null

Write-Host "1/4 Dump de $Banco a partir de $Container..."
docker exec $Container pg_dump -U $Usuario -d $Banco -Fc -f /tmp/abastecimento.dump
if ($LASTEXITCODE -ne 0) { throw "pg_dump falhou" }

$dumpFile = Join-Path $Destino "abastecimento-$stamp.dump"
docker cp "${Container}:/tmp/abastecimento.dump" $dumpFile
Write-Host "   Dump: $dumpFile"

$envSrc = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envSrc)) { $envSrc = "C:\Sistemma\.env" }
if (Test-Path $envSrc) {
  $envCopy = Join-Path $Destino "env-$stamp.txt"
  Copy-Item $envSrc $envCopy
  Write-Host "   .env copiado: $envCopy"
  $tagLine = Select-String -Path $envSrc -Pattern "^TAG=" | Select-Object -First 1
  Write-Host "2/4 TAG atual: $($tagLine.Line)"
} else {
  Write-Host "2/4 AVISO: .env nao encontrado - anote o TAG manualmente."
}

Write-Host "3/4 Conferindo volume (nao sera removido)..."
docker inspect $Container --format "{{range .Mounts}}{{.Name}} {{.Destination}}{{println}}{{end}}"

Write-Host "4/4 Pronto. Guarde o dump ANTES de rodar a migracao."
Write-Host ""
Write-Host "Proximo passo: .\scripts\cutover-destino.ps1 -TagNova 3.1.0 -TagAnterior <tag atual>"
Write-Host "  (ele sobe a imagem nova em banco unico, migra e so depois liga o multi-banco)"
Write-Host ""
Write-Host "NUNCA rode: docker compose down -v"
