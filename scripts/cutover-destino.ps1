# =============================================================================
# cutover-destino.ps1 - NA MAQUINA DESTINO, DEPOIS do backup-destino.ps1
# =============================================================================
# Ordem que importa:
#   1. sobe a imagem NOVA ainda em banco unico (nada muda para o usuario)
#   2. roda a migracao com a imagem NOVA (copia; nao apaga abastecimento)
#   3. so entao liga o multi-banco e recria o backend
# O banco de origem `abastecimento` continua intacto para rollback.
# =============================================================================
param(
  [Parameter(Mandatory = $true)]
  [string]$TagNova,
  [string]$TagAnterior = "",
  # Tela inicial sem senha (botoes Gestor e Contratos)
  [switch]$AcessoLivre
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path "C:\Sistemma\backups") -or -not (Get-ChildItem "C:\Sistemma\backups\abastecimento-*.dump" -ErrorAction SilentlyContinue)) {
  throw "Nenhum dump em C:\Sistemma\backups. Rode primeiro .\scripts\backup-destino.ps1"
}

$envFile = ".\.env"
if (-not (Test-Path $envFile)) { $envFile = "C:\Sistemma\.env" }
if (-not (Test-Path $envFile)) { throw ".env nao encontrado" }

function Definir-Variavel {
  param([string]$Nome, [string]$Valor)
  $linhas = Get-Content $envFile
  $achou = $false
  $saida = $linhas | ForEach-Object {
    if ($_ -match "^\s*#?\s*$Nome=") { $achou = $true; "$Nome=$Valor" } else { $_ }
  }
  if (-not $achou) { $saida += "$Nome=$Valor" }
  Set-Content $envFile $saida
}

Write-Host "1/6 Imagem nova ($TagNova) ainda em banco unico"
Definir-Variavel "TAG" $TagNova
Definir-Variavel "MULTI_TENANT" "false"
(Get-Content $envFile) | ForEach-Object {
  if ($_ -match "^CONTROL_DATABASE_NAME=") { "# $_" } else { $_ }
} | Set-Content $envFile

docker compose pull
docker compose up -d
if ($LASTEXITCODE -ne 0) { throw "Subida da imagem nova falhou. Volte TAG=$TagAnterior no .env." }

Write-Host "2/6 Esperando o backend ficar saudavel..."
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-RestMethod http://localhost:3200/health -TimeoutSec 5
    if ($r) { $ok = $true; break }
  } catch { }
}
if (-not $ok) { throw "Backend nao respondeu no /health. Nao siga para a migracao." }
Write-Host "   Backend saudavel em banco unico - nada mudou para o usuario."

Write-Host "3/6 Migracao: copia cada contrato para o seu banco (origem intacta)"
docker exec sistemma-backend node dist/scripts/migrar-bancos-por-contrato.js
if ($LASTEXITCODE -ne 0) { throw "Migracao falhou. Nao ligue o multi-banco. O banco abastecimento segue intacto." }

Write-Host "4/6 Ligando um-banco-por-contrato no .env"
Definir-Variavel "CONTROL_DATABASE_NAME" "sistemma_control"
Definir-Variavel "MULTI_TENANT" "true"
if ($AcessoLivre) { Definir-Variavel "ACESSO_LIVRE" "true" }

docker compose up -d
Write-Host "5/6 Esperando o backend voltar no modo multi-banco..."
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-RestMethod http://localhost:3200/health -TimeoutSec 5
    if ($r) { $ok = $true; break }
  } catch { }
}
if (-not $ok) {
  Write-Host "Backend nao respondeu. Rollback rapido:" -ForegroundColor Yellow
  Write-Host "  no .env: MULTI_TENANT=false e comente CONTROL_DATABASE_NAME; docker compose up -d"
  throw "Multi-banco nao subiu."
}

Write-Host "6/6 Confira na tela: Contratos lista todas as unidades e o Gestor compara todas."
Write-Host ""
Write-Host "Rollback (dados preservados): no .env MULTI_TENANT=false, comente CONTROL_DATABASE_NAME,"
Write-Host "  TAG=$TagAnterior se quiser voltar a imagem, e docker compose up -d"
Write-Host "NUNCA rode: docker compose down -v"
