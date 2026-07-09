# build-and-push.ps1
# Build via docker compose e envia ao Nexus
#
# Uso (Windows - NAO use build-and-push.sh no PowerShell):
#   .\build-and-push.ps1 -Tag 2.0.2
#   .\publicar.ps1 -Tag 2.0.2               # igual + gera dist\deploy
#   .\build-and-push.ps1                    # tag latest (.env.nexus)
#   .\build-and-push.ps1 -BuildOnly         # so build local, sem login/push
#   .\build-and-push.ps1 -BuildOnly -Up     # build + docker compose up -d (local)
#   .\build-and-push.ps1 -NexusPassword "chat@2025"

param(
    [string]$Tag = "latest",
    [string]$NexusPassword = "",
    [switch]$BuildOnly,
    [switch]$SkipPush,
    [switch]$Up
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot
Set-Location $Root

function Import-EnvFile {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $key = $line.Substring(0, $eq).Trim()
        $val = $line.Substring($eq + 1).Trim()
        if (($val.StartsWith('"') -and $val.EndsWith('"')) -or ($val.StartsWith("'") -and $val.EndsWith("'"))) {
            $val = $val.Substring(1, $val.Length - 2)
        }
        if ($key -and -not [string]::IsNullOrWhiteSpace($val)) {
            Set-Item -Path "env:$key" -Value $val
        }
    }
}

Import-EnvFile (Join-Path $Root ".env.nexus")

function Invoke-Docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & docker @Args
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) {
        throw "Comando falhou (exit $code): docker $($Args -join ' ')"
    }
}

function Test-BuildxBuilder {
    param([string]$Name)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $list = docker buildx ls --format "{{.Name}}" 2>$null
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { return $false }
    return ($list -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $Name }).Count -gt 0
}

function Ensure-BuildxAmd64 {
    if (Test-BuildxBuilder "sistemma-amd64") {
        Invoke-Docker buildx use sistemma-amd64
    } else {
        Write-Host "Criando builder buildx (linux/amd64)..." -ForegroundColor Yellow
        Invoke-Docker buildx create --name sistemma-amd64 --driver docker-container --use
    }
    Invoke-Docker buildx inspect --bootstrap
}

function Build-And-PushImage {
    param(
        [string]$ContextRel,
        [string]$DockerfileRel,
        [string]$Image,
        [hashtable]$BuildArgs = @{}
    )
    Push-Location $Root
    try {
        $argList = @(
            "buildx", "build",
            "--platform", "linux/amd64",
            "--provenance=false",
            "--sbom=false",
            "-f", $DockerfileRel,
            "-t", $Image,
            "--push"
        )
        foreach ($key in $BuildArgs.Keys) {
            $argList += @("--build-arg", "${key}=$($BuildArgs[$key])")
        }
        $argList += $ContextRel
        Invoke-Docker @argList
    } finally {
        Pop-Location
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Sistemma - Build e Push (Compose)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$EnvDocker = Join-Path $Root ".env.docker"
if (-not (Test-Path $EnvDocker)) {
    if (Test-Path (Join-Path $Root "env.docker.example")) {
        Copy-Item (Join-Path $Root "env.docker.example") $EnvDocker
        Write-Host ".env.docker criado a partir de env.docker.example" -ForegroundColor Yellow
    } else {
        Write-Host ".env.docker nao encontrado." -ForegroundColor Red
        exit 1
    }
}

Import-EnvFile $EnvDocker

# REGISTRY: prioriza .env.nexus (fonte do registry) e alinha com NEXUS_URL
$NexusUrl = if ($env:NEXUS_URL) { $env:NEXUS_URL } else { "nexus.neurai-platform.com" }
$NexusUser = if ($env:NEXUS_USER) { $env:NEXUS_USER } else { "admin" }
$NexusPass = if ($NexusPassword) { $NexusPassword } else { $env:NEXUS_PASSWORD }
$Registry = if ($env:REGISTRY) { $env:REGISTRY } else { "${NexusUrl}/docker-registry" }

function Show-NexusTlsHelp {
    Write-Host ""
    Write-Host "ERRO TLS no Nexus - causas comuns:" -ForegroundColor Red
    Write-Host "  1. Nexus usa HTTP na porta 8081 (nao HTTPS na 443)" -ForegroundColor Yellow
    Write-Host "     Ajuste .env.nexus:" -ForegroundColor Yellow
    Write-Host "       NEXUS_URL=nexus.neurai-platform.com" -ForegroundColor Gray
    Write-Host "       REGISTRY=nexus.neurai-platform.com/docker-registry" -ForegroundColor Gray
    Write-Host "  2. Docker Desktop precisa de registry inseguro (HTTP):" -ForegroundColor Yellow
    Write-Host '     Settings > Docker Engine > adicione em "insecure-registries":' -ForegroundColor Gray
    Write-Host '       "nexus.neurai-platform.com"' -ForegroundColor Gray
    Write-Host "     Depois reinicie o Docker Desktop." -ForegroundColor Gray
    Write-Host ""
}

$BuildSha = (git rev-parse --short HEAD 2>$null)
if (-not $BuildSha) { $BuildSha = "local" }

$env:TAG = $Tag
$env:REGISTRY = $Registry
$env:BUILD_SHA = $BuildSha
if ($Tag -and $Tag -ne 'latest') {
    Set-Content -Path (Join-Path $Root "VERSION") -Value $Tag -NoNewline -Encoding UTF8
}
$VersionFile = Join-Path $Root "VERSION"
$VersionFromFile = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { $null }
if ($VersionFromFile) {
    $appVersionJson = Join-Path $Root "frontend\public\app-version.json"
    $json = (@{ version = $VersionFromFile } | ConvertTo-Json -Compress)
    # Vite/dev server pode manter o arquivo aberto — WriteAllText evita IOException do Set-Content
    $written = $false
    for ($i = 0; $i -lt 5 -and -not $written; $i++) {
        try {
            [System.IO.File]::WriteAllText($appVersionJson, $json)
            $written = $true
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    if (-not $written) {
        Write-Host "Aviso: nao foi possivel atualizar app-version.json (arquivo em uso). Seguindo com VITE_APP_VERSION=$VersionFromFile" -ForegroundColor Yellow
    }
}
$GitDescribe = (git describe --tags --always --dirty 2>$null)
if ($Tag -and $Tag -ne 'latest') {
    $env:VITE_APP_VERSION = $Tag
} elseif ($VersionFromFile) {
    $env:VITE_APP_VERSION = $VersionFromFile
} elseif ($GitDescribe -and $GitDescribe -notmatch '^[0-9a-f]{7,40}') {
    $env:VITE_APP_VERSION = $GitDescribe
} else {
    $env:VITE_APP_VERSION = "dev"
}
# Maquinas destino Windows/Linux costumam ser amd64 - evita imagem arm64-only no Nexus
$env:DOCKER_DEFAULT_PLATFORM = "linux/amd64"

$BackendImage = "${Registry}/sistemma-backend:${Tag}"
$FrontendImage = "${Registry}/sistemma-frontend:${Tag}"

Write-Host ""
Write-Host "TAG: $Tag" -ForegroundColor Yellow
Write-Host "BUILD_SHA: $BuildSha" -ForegroundColor Yellow
Write-Host "VITE_APP_VERSION: $env:VITE_APP_VERSION" -ForegroundColor Yellow
Write-Host "Backend:  $BackendImage" -ForegroundColor Yellow
Write-Host "Frontend: $FrontendImage" -ForegroundColor Yellow
if ($BuildOnly) {
    Write-Host "Modo: BuildOnly (sem login/push)" -ForegroundColor Yellow
}
if ($Up) {
    Write-Host "Modo: Up local apos build" -ForegroundColor Yellow
}
Write-Host ""

$needsLogin = (-not $BuildOnly) -or $Up
if ($needsLogin -and -not $NexusPass) {
    Write-Host "NEXUS_PASSWORD nao definida." -ForegroundColor Red
    Write-Host ""
    Write-Host "Crie .env.nexus (ou copie env.nexus.example):" -ForegroundColor Yellow
    Write-Host "  Copy-Item env.nexus.example .env.nexus"
    Write-Host ""
    Write-Host "Ou informe na hora:" -ForegroundColor Yellow
    Write-Host '  .\build-and-push.ps1 -NexusPassword "chat@2025"'
    Write-Host ""
    Write-Host "Somente build local:" -ForegroundColor Yellow
    Write-Host "  .\build-and-push.ps1 -BuildOnly -Up"
    exit 1
}

if ($NexusPass -in @("sua-senha", "altere-a-senha", "senha", "altere-sua-senha", "altere-sua-senha-nexus")) {
    Write-Host "AVISO: NEXUS_PASSWORD parece placeholder." -ForegroundColor Red
    exit 1
}

if ($needsLogin -and $NexusPass) {
    Write-Host "Login no Nexus ($NexusUrl)..." -ForegroundColor Green
    if ($NexusUrl -notmatch ':\d+$') {
        Write-Host "AVISO: NEXUS_URL sem porta - o Nexus costuma ser :8081 (HTTP)." -ForegroundColor Yellow
    }
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $loginOut = $NexusPass | docker login $NexusUrl -u $NexusUser --password-stdin 2>&1
    $loginCode = $LASTEXITCODE
    $loginText = ($loginOut | Out-String)
    $ErrorActionPreference = $prev
    if ($loginCode -ne 0) {
        Write-Host $loginText -ForegroundColor Red
        if ($loginText -match 'tls:|unrecognized name|certificate') {
            Show-NexusTlsHelp
        }
        throw "Falha no login do Nexus"
    }
    Write-Host "Login OK" -ForegroundColor Green
}

Write-Host ""
if ($BuildOnly -or $Up) {
    Write-Host "Build (docker compose - local)..." -ForegroundColor Green
    Invoke-Docker compose --env-file $EnvDocker -f docker-compose.yml -f docker-compose.dev.yml build backend frontend
} else {
    Write-Host "Build e push (buildx linux/amd64)..." -ForegroundColor Green
    Ensure-BuildxAmd64
    Build-And-PushImage -ContextRel "backend" -DockerfileRel "backend/Dockerfile" -Image $BackendImage -BuildArgs @{ BUILD_SHA = $BuildSha }
    Build-And-PushImage -ContextRel "frontend" -DockerfileRel "frontend/Dockerfile" -Image $FrontendImage -BuildArgs @{
        VITE_API_URL = "/api"
        VITE_APP_NAME = "Sistemma"
        VITE_APP_VERSION = $env:VITE_APP_VERSION
        VITE_ENV = "production"
    }
    Write-Host "Verificando manifest amd64 no Nexus..." -ForegroundColor Green
    Invoke-Docker buildx imagetools inspect $BackendImage
    Invoke-Docker buildx imagetools inspect $FrontendImage
}
Write-Host "Build concluido." -ForegroundColor Green

if ($BuildOnly -and -not $Up) {
    Write-Host ""
    Write-Host "Build local concluido. Para subir:" -ForegroundColor Green
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.docker up -d --build"
    Write-Host ""
    Write-Host "Para publicar no Nexus:" -ForegroundColor Green
    Write-Host "  .\build-and-push.ps1 -Tag $Tag"
    exit 0
}

if ($Up) {
    Write-Host ""
    Write-Host "Subindo stack (docker compose up -d)..." -ForegroundColor Green
    Invoke-Docker compose --env-file $EnvDocker -f docker-compose.yml -f docker-compose.dev.yml up -d --build
    Invoke-Docker compose --env-file $EnvDocker ps
    Write-Host ""
    Write-Host "Pronto! Frontend: http://localhost:3300" -ForegroundColor Green
    exit 0
}

if ($SkipPush) {
    Write-Host ""
    Write-Host "Build concluido (SkipPush)." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host 'Push concluido via buildx.' -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Build e Push concluido!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Imagens publicadas:" -ForegroundColor Yellow
Write-Host "  $BackendImage"
Write-Host "  $FrontendImage"
Write-Host ""
Write-Host "Na maquina destino (C:\Sistemma):" -ForegroundColor Yellow
Write-Host "  1. Edite TAG=$Tag no arquivo .env"
Write-Host "  2. docker compose pull"
Write-Host "  3. docker compose up -d"
Write-Host '  (use apenas docker-compose.yml; nao copie docker-compose.dev.yml)'
Write-Host ""
