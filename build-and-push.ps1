# build-and-push.ps1
# Builda as imagens Docker e envia ao Nexus
# Uso: .\build-and-push.ps1 [tag]

param([string]$Tag = "latest")

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sistemma - Build e Push para Nexus" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$NexusUrl = if ($env:NEXUS_URL) { $env:NEXUS_URL } else { "nexus.chchat.org" }
$NexusUser = if ($env:NEXUS_USER) { $env:NEXUS_USER } else { "admin" }
$NexusPass = $env:NEXUS_PASSWORD
if (-not $NexusPass) { throw "Defina a variavel NEXUS_PASSWORD antes de executar." }

$BackendImage = "${NexusUrl}/docker-registry/sistemma-backend:${Tag}"
$FrontendImage = "${NexusUrl}/docker-registry/sistemma-frontend:${Tag}"

Write-Host ""
Write-Host "TAG: $Tag" -ForegroundColor Yellow
Write-Host "Backend: $BackendImage" -ForegroundColor Yellow
Write-Host "Frontend: $FrontendImage" -ForegroundColor Yellow
Write-Host ""

Write-Host "Login no Nexus..." -ForegroundColor Green
docker login $NexusUrl --username $NexusUser --password $NexusPass
if ($LASTEXITCODE -ne 0) { throw "Falha no login do Nexus" }

Write-Host ""
Write-Host "Buildando backend..." -ForegroundColor Green
docker build -t $BackendImage -f backend\Dockerfile backend\
if ($LASTEXITCODE -ne 0) { throw "Falha no build do backend" }
Write-Host "Backend buildado: $BackendImage" -ForegroundColor Green

Write-Host ""
Write-Host "Buildando frontend..." -ForegroundColor Green
docker build -t $FrontendImage --build-arg VITE_API_URL=/api --build-arg VITE_APP_NAME=Sistemma -f frontend\Dockerfile frontend\
if ($LASTEXITCODE -ne 0) { throw "Falha no build do frontend" }
Write-Host "Frontend buildado: $FrontendImage" -ForegroundColor Green

Write-Host ""
Write-Host "Enviando backend para Nexus..." -ForegroundColor Green
docker push $BackendImage
if ($LASTEXITCODE -ne 0) { throw "Falha no push do backend" }

Write-Host "Enviando frontend para Nexus..." -ForegroundColor Green
docker push $FrontendImage
if ($LASTEXITCODE -ne 0) { throw "Falha no push do frontend" }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build e Push concluido!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Imagens publicadas:" -ForegroundColor Yellow
Write-Host "  $BackendImage"
Write-Host "  $FrontendImage"
Write-Host ""
Write-Host "Para usar em outra maquina:" -ForegroundColor Yellow
Write-Host "  1. Instale Docker + Docker Compose"
Write-Host "  2. Copie docker-compose.yml + .env.docker"
Write-Host "  3. Execute no PowerShell:"
Write-Host "    docker login nexus.chchat.org"
Write-Host '    docker compose --env-file .env.docker pull'
Write-Host '    docker compose --env-file .env.docker up -d'
Write-Host ""
