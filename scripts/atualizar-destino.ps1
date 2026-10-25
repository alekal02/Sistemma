# =============================================================================
# atualizar-destino.ps1 - NA MAQUINA DESTINO (C:\Sistemma)
# =============================================================================
# Puxa a TAG do .env, recria backend/frontend, espera o /health e SO ENTAO
# apaga imagens antigas do Sistemma (backend/frontend) que nao estao em uso.
#
# NAO apaga Postgres, MinIO, WuzAPI, volumes nem o .env.
# NUNCA usa docker compose down -v.
#
# Uso:
#   1. Edite TAG=4.0.8 no .env
#   2. .\scripts\atualizar-destino.cmd
#
# So limpar lixo de versoes antigas (ja esta na versao nova e saudavel):
#   .\scripts\atualizar-destino.cmd -SoLimpar
# =============================================================================
param(
  [switch]$SoLimpar
)

$ErrorActionPreference = "Stop"

$raiz = Get-Location
if (-not (Test-Path (Join-Path $raiz "docker-compose.yml"))) {
  if (Test-Path "C:\Sistemma\docker-compose.yml") { Set-Location "C:\Sistemma"; $raiz = Get-Location }
  else { throw "Rode este script na pasta do Sistemma (onde esta o docker-compose.yml)." }
}

function Ler-TagEnv {
  $envFile = Join-Path $raiz ".env"
  if (-not (Test-Path $envFile)) { return $null }
  $linha = Select-String -Path $envFile -Pattern "^\s*TAG=" | Select-Object -First 1
  if (-not $linha) { return $null }
  return ($linha.Line -replace "^\s*TAG=", "").Trim()
}

function ImagemDoContainer([string]$nome) {
  $img = docker inspect --format "{{.Config.Image}}" $nome 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return $img
}

function IdImagemDoContainer([string]$nome) {
  $id = docker inspect --format "{{.Image}}" $nome 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return $id
}

function StatusSaude([string]$nome) {
  $st = docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $nome 2>$null
  if ($LASTEXITCODE -ne 0) { return "ausente" }
  return $st
}

function Esperar-Saudavel {
  Write-Host "4/5 Esperando backend e frontend ficarem saudaveis..."
  $ok = $false
  for ($i = 0; $i -lt 48; $i++) {
    Start-Sleep -Seconds 5
    $back = StatusSaude "sistemma-backend"
    $front = StatusSaude "sistemma-frontend"
    $httpOk = $false
    try {
      $r = Invoke-RestMethod http://localhost:3200/health -TimeoutSec 5
      if ($r) { $httpOk = $true }
    } catch { }
    Write-Host "   backend=$back  frontend=$front  /health=$httpOk"
    if ($httpOk -and $back -match "healthy|running" -and $front -match "healthy|running") {
      $ok = $true
      break
    }
  }
  if (-not $ok) {
    throw "A versao nova nao ficou saudavel. Imagens antigas foram MANTIDAS. Volte a TAG anterior no .env e rode este script de novo."
  }
  Write-Host "   Backend e frontend saudaveis."
}

function Limpar-ImagensSistemmaAntigas {
  Write-Host "5/5 Removendo imagens antigas do Sistemma (so backend/frontend sem uso)..."
  $keep = @()
  foreach ($nome in @("sistemma-backend", "sistemma-frontend")) {
    $id = IdImagemDoContainer $nome
    if ($id) { $keep += $id }
  }
  if ($keep.Count -eq 0) {
    Write-Host "   Nenhum container Sistemma em execucao. Nao apaguei imagens."
    return 0
  }

  $linhas = docker images --format "{{.ID}}|{{.Repository}}|{{.Tag}}"
  $vistos = @{}
  $removidos = 0
  foreach ($linha in $linhas) {
    if (-not $linha) { continue }
    $p = $linha.Split("|")
    if ($p.Count -lt 3) { continue }
    $id = $p[0]
    $repo = $p[1]
    $tag = $p[2]
    if ($repo -notmatch "sistemma-backend$|sistemma-frontend$") { continue }
    if ($keep -contains $id) { continue }
    if ($vistos.ContainsKey($id)) { continue }
    $vistos[$id] = $true
    Write-Host "   Removendo ${repo}:${tag} ($id)"
    docker rmi $id 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $removidos++ }
    else { Write-Host "   Aviso: nao deu para remover $id (ainda referenciada)." -ForegroundColor Yellow }
  }

  docker image prune -f | Out-Null
  Write-Host "   $removidos imagem(ns) antiga(s) removida(s). Postgres/MinIO/WhatsApp nao foram mexidos."
  return $removidos
}

$tag = Ler-TagEnv
Write-Host "Pasta: $raiz"
if ($tag) { Write-Host "TAG no .env: $tag" }

if ($SoLimpar) {
  $back = StatusSaude "sistemma-backend"
  if ($back -notmatch "healthy|running") {
    throw "Backend nao esta saudavel ($back). Nao vou apagar imagens. Suba a versao nova primeiro sem -SoLimpar."
  }
  [void](Limpar-ImagensSistemmaAntigas)
  Write-Host ""
  Write-Host "Limpeza concluida. Volumes e banco intactos." -ForegroundColor Green
  exit 0
}

$imgBackAntes = ImagemDoContainer "sistemma-backend"
$imgFrontAntes = ImagemDoContainer "sistemma-frontend"
Write-Host "1/4 Imagens atuais:"
Write-Host "   backend  $imgBackAntes"
Write-Host "   frontend $imgFrontAntes"

Write-Host "2/4 Recriando a WuzAPI para apontar o webhook para o backend..."
Write-Host "   A sessao do WhatsApp e o banco ficam nos volumes. Nada e apagado."
docker compose up -d --force-recreate --no-deps wuzapi
if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel recriar a WuzAPI. Banco e volumes nao foram alterados." }

Write-Host "3/4 Puxando e recriando backend/frontend (TAG=$tag)..."
docker compose pull backend frontend
if ($LASTEXITCODE -ne 0) { throw "docker compose pull falhou. Confira o login no Nexus e a TAG no .env." }

docker compose up -d --force-recreate --no-deps backend frontend
if ($LASTEXITCODE -ne 0) { throw "docker compose up falhou. Imagens antigas foram MANTIDAS. O banco nao foi apagado." }

Esperar-Saudavel
[void](Limpar-ImagensSistemmaAntigas)

Write-Host ""
Write-Host "Atualizado para TAG=$tag. Versao antiga do Docker foi removida." -ForegroundColor Green
Write-Host "NUNCA rode: docker compose down -v" -ForegroundColor Yellow
