# empacotar.ps1
# Empacota tudo num unico .zip para levar para outra maquina
# Uso: .\empacotar.ps1

$ErrorActionPreference = "Stop"

$nomeZip = "sistemma-deploy.zip"

Write-Host "Criando pacote $nomeZip ..." -ForegroundColor Green

# Remove zip antigo se existir
if (Test-Path $nomeZip) { Remove-Item $nomeZip }

# Arquivos necessarios para deploy
$arquivos = @(
    "docker-compose.yml",
    ".env.docker",
    "sistemma-backend-corrigido.tar",
    "sistemma-frontend-corrigido.tar",
    "deploy.ps1"
)

Compress-Archive -Path $arquivos -DestinationPath $nomeZip -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Pacote criado: $nomeZip" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Tamanho: $((Get-Item $nomeZip).Length / 1MB -as [int]) MB" -ForegroundColor Yellow
Write-Host ""
