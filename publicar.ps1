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
Copy-Item LEIA-ME-DESTINO.txt $DeployDir
New-Item -ItemType Directory -Path (Join-Path $DeployDir "scripts") -Force | Out-Null
Copy-Item scripts\backup-destino.ps1 (Join-Path $DeployDir "scripts")
Copy-Item scripts\cutover-destino.ps1 (Join-Path $DeployDir "scripts")
Copy-Item scripts\atualizar-destino.ps1 (Join-Path $DeployDir "scripts")
Copy-Item scripts\conferir-whatsapp.ps1 (Join-Path $DeployDir "scripts")
# Atalhos .cmd: a maquina destino bloqueia .ps1 nao assinado (politica AllSigned)
Copy-Item scripts\*.cmd (Join-Path $DeployDir "scripts")

$envFile = Join-Path $DeployDir "env.docker.example"
(Get-Content $envFile -Raw) -replace '(?m)^TAG=.*', "TAG=$Tag" | Set-Content $envFile -NoNewline

$instrucoes = Join-Path $DeployDir "INSTRUCOES-WHATSAPP.txt"
if (Test-Path $instrucoes) {
    (Get-Content $instrucoes -Raw) -replace 'TAG=\d+\.\d+\.\d+', "TAG=$Tag" | Set-Content $instrucoes -NoNewline
}

Compress-Archive -Path "$DeployDir\*" -DestinationPath "dist\deploy.zip" -Force

Write-Host ""
Write-Host "Publicado: $Tag" -ForegroundColor Green
Write-Host "Destino: so mude TAG=$Tag no .env (nao substitua o arquivo inteiro)." -ForegroundColor Yellow
Write-Host "Depois: docker compose pull && docker compose up -d --force-recreate backend frontend" -ForegroundColor Cyan
