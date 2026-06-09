# deploy.ps1
# Script para deploy em maquina DESTINO
# Faz pull das imagens do Nexus e sobe os containers
# Uso: .\deploy.ps1

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sistemma - Deploy via Nexus" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$NexusUrl = if ($env:NEXUS_URL) { $env:NEXUS_URL } else { "nexus.chchat.org" }
$NexusUser = if ($env:NEXUS_USER) { $env:NEXUS_USER } else { "admin" }
$NexusPass = $env:NEXUS_PASSWORD
if (-not $NexusPass) { throw "Defina a variavel NEXUS_PASSWORD antes de executar." }

# Verifica se Docker existe
$dockerVersion = docker --version 2>$null
if (-not $dockerVersion) {
    Write-Host "Docker nao encontrado." -ForegroundColor Red
    exit 1
}
Write-Host "Docker: $dockerVersion" -ForegroundColor Green

# Verifica Docker Compose
$dockerComposeVersion = docker compose version 2>$null
if (-not $dockerComposeVersion) {
    Write-Host "Docker Compose nao encontrado." -ForegroundColor Red
    exit 1
}
Write-Host "Docker Compose OK" -ForegroundColor Green

# Login no Nexus
Write-Host ""
Write-Host "Login no Nexus..." -ForegroundColor Green
docker login $NexusUrl --username $NexusUser --password $NexusPass
if ($LASTEXITCODE -ne 0) { throw "Falha no login do Nexus" }

# Cria .env se nao existir
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "Criando .env a partir do .env.docker..." -ForegroundColor Yellow
    Copy-Item ".env.docker" ".env"
    Write-Host ""
    Write-Host "Edite o arquivo .env com suas configuracoes:" -ForegroundColor Red
    Write-Host "  notepad .env"
    Write-Host "Depois execute este script novamente."
    exit 0
}

# Pull das imagens
Write-Host ""
Write-Host "Baixando imagens do Nexus..." -ForegroundColor Green
docker compose --env-file .env pull
if ($LASTEXITCODE -ne 0) { throw "Falha ao baixar imagens" }

# Sobe os containers
Write-Host ""
Write-Host "Iniciando containers..." -ForegroundColor Green
docker compose --env-file .env up -d
if ($LASTEXITCODE -ne 0) { throw "Falha ao iniciar containers" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy concluido!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Acesse: http://localhost:3300" -ForegroundColor Yellow
Write-Host ""
Write-Host "Comandos uteis:" -ForegroundColor Yellow
Write-Host "  docker compose logs -f       # Ver logs"
Write-Host "  docker compose ps            # Status"
Write-Host "  docker compose down          # Parar tudo"
Write-Host "  docker compose restart       # Reiniciar"
