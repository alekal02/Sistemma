# =============================================================================
# ativar-acesso-livre.ps1 - NA MAQUINA DESTINO (C:\Sistemma)
# =============================================================================
# Liga a entrada sem senha: os botoes Gestor e Contratos da tela inicial passam
# a abrir direto, em vez de pedir email e senha.
#
# Nao mexe em banco nem em volume. So no .env + recriar o backend.
# =============================================================================
param(
  [string]$ComposeFile = ".\docker-compose.yml",
  [string]$EnvFile = ".\.env",
  # Use -Desligar para voltar a exigir senha
  [switch]$Desligar
)

$ErrorActionPreference = "Stop"
$valor = if ($Desligar) { "false" } else { "true" }

if (-not (Test-Path $ComposeFile)) { throw "docker-compose.yml nao encontrado em $ComposeFile" }
if (-not (Test-Path $EnvFile)) { throw ".env nao encontrado em $EnvFile" }

Write-Host "1/4 Conferindo se o docker-compose.yml repassa ACESSO_LIVRE ao backend"
if (-not (Select-String -Path $ComposeFile -Pattern "ACESSO_LIVRE" -Quiet)) {
  Write-Host ""
  Write-Host "  Seu docker-compose.yml e antigo: ele nao repassa ACESSO_LIVRE." -ForegroundColor Yellow
  Write-Host "  Por isso a variavel no .env nao chega no container e nada muda." -ForegroundColor Yellow
  Write-Host "  Copie o docker-compose.yml do pacote deploy 3.1.0 para ca e rode de novo." -ForegroundColor Yellow
  throw "docker-compose.yml sem ACESSO_LIVRE"
}
Write-Host "   OK"

Write-Host "2/4 Gravando ACESSO_LIVRE=$valor no .env"
$linhas = @(Get-Content $EnvFile)
# Remove qualquer ocorrencia (inclusive comentada ou duplicada) antes de gravar,
# porque no docker compose a ultima linha repetida e a que vale.
$limpas = $linhas | Where-Object { $_ -notmatch "^\s*#?\s*ACESSO_LIVRE=" }
$limpas += "ACESSO_LIVRE=$valor"
Set-Content $EnvFile $limpas

$duplicadas = ($linhas | Where-Object { $_ -match "^\s*[A-Z_]+=" } |
  ForEach-Object { ($_ -split "=", 2)[0].Trim() } |
  Group-Object | Where-Object { $_.Count -gt 1 })
if ($duplicadas) {
  Write-Host "   Aviso: chaves repetidas no .env (vale a ULTIMA linha de cada):" -ForegroundColor Yellow
  $duplicadas | ForEach-Object { Write-Host "     $($_.Name) x$($_.Count)" -ForegroundColor Yellow }
}
$placeholder = Select-String -Path $EnvFile -Pattern "=seu_token|=seu_admin_token|=altere-" -ErrorAction SilentlyContinue
if ($placeholder) {
  Write-Host "   Aviso: ha valores de exemplo ainda no .env (WhatsApp pode nao conectar):" -ForegroundColor Yellow
  $placeholder | ForEach-Object { Write-Host "     linha $($_.LineNumber): $($_.Line)" -ForegroundColor Yellow }
}

Write-Host "3/4 Recriando o backend para pegar a variavel"
docker compose up -d --force-recreate backend
if ($LASTEXITCODE -ne 0) { throw "Falha ao recriar o backend" }

Write-Host "4/4 Conferindo no container e na API"
$noContainer = (docker exec sistemma-backend printenv ACESSO_LIVRE) 2>$null
Write-Host "   ACESSO_LIVRE no container: $noContainer"

$ok = $false
for ($i = 0; $i -lt 24; $i++) {
  Start-Sleep -Seconds 5
  try {
    $r = Invoke-RestMethod "http://localhost:3200/api/auth/acesso-local" -TimeoutSec 5
    Write-Host "   API responde habilitado=$($r.habilitado) contratos=$($r.contratos.Count)"
    $ok = ($r.habilitado -eq (-not $Desligar))
    break
  } catch { }
}

if ($ok) {
  Write-Host ""
  Write-Host "Pronto. Recarregue a tela com Ctrl+F5 e clique em Contratos." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "A API ainda nao confirmou. Veja o log: docker logs --tail 60 sistemma-backend" -ForegroundColor Yellow
}
