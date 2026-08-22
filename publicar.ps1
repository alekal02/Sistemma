# publicar.ps1 — build + push Nexus + pacote dist\deploy
param(
    [string]$Tag = "latest",
    [string]$NexusPassword = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

& "$PSScriptRoot\build-and-push.ps1" -Tag $Tag -NexusPassword $NexusPassword
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$DeployDir = Join-Path $PSScriptRoot "dist\deploy"
if (Test-Path $DeployDir) { Remove-Item $DeployDir -Recurse -Force }
New-Item -ItemType Directory -Path $DeployDir -Force | Out-Null

Copy-Item docker-compose.yml $DeployDir
Copy-Item env.docker.example $DeployDir
Copy-Item env.nexus.example $DeployDir
Copy-Item INSTRUCOES-WHATSAPP.txt $DeployDir
New-Item -ItemType Directory -Path (Join-Path $DeployDir "scripts") -Force | Out-Null
Copy-Item scripts\backup-destino.ps1 (Join-Path $DeployDir "scripts")
Copy-Item scripts\cutover-destino.ps1 (Join-Path $DeployDir "scripts")
Copy-Item scripts\ativar-acesso-livre.ps1 (Join-Path $DeployDir "scripts")
# Atalhos .cmd: a maquina destino bloqueia .ps1 nao assinado (politica AllSigned)
Copy-Item scripts\*.cmd (Join-Path $DeployDir "scripts")

$envFile = Join-Path $DeployDir "env.docker.example"
(Get-Content $envFile -Raw) -replace '(?m)^TAG=.*', "TAG=$Tag" | Set-Content $envFile -NoNewline

$instrucoes = Join-Path $DeployDir "INSTRUCOES-WHATSAPP.txt"
if (Test-Path $instrucoes) {
    (Get-Content $instrucoes -Raw) -replace 'TAG=2\.3\.\d+', "TAG=$Tag" | Set-Content $instrucoes -NoNewline
}

Compress-Archive -Path "$DeployDir\*" -DestinationPath "dist\deploy.zip" -Force

Write-Host ""
Write-Host "Publicado: $Tag" -ForegroundColor Green
Write-Host "IMPORTANTE na destino: substitua docker-compose.yml + .env (WuzAPI) e use --force-recreate" -ForegroundColor Yellow
Write-Host "Destino: TAG=$Tag no .env  ->  docker compose up -d --force-recreate" -ForegroundColor Cyan
