# conferir-whatsapp.ps1 - NA MAQUINA DESTINO
# Mostra se o webhook do WhatsApp aponta para o backend.
# Nao altera banco, volume, .env nem container.
$ErrorActionPreference = "Continue"

function Ler-Env([string]$container, [string]$nome) {
  $valor = docker exec $container printenv $nome 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $valor) { return "(ausente)" }
  return ($valor | Out-String).Trim()
}

Write-Host "Containers"
docker ps --filter "name=sistemma-" --format "table {{.Names}}`t{{.Status}}`t{{.Image}}"

Write-Host ""
Write-Host "Health"
try {
  $h = Invoke-RestMethod http://localhost:3200/health -TimeoutSec 8
  Write-Host ("   status={0}  tag={1}" -f $h.status, $h.tag)
} catch {
  Write-Host "   /health nao respondeu. O backend ainda pode estar subindo."
}

Write-Host ""
Write-Host "Enderecos do WhatsApp"
$pares = @(
  @{ c = "sistemma-backend"; n = "WUZAPI_URL" },
  @{ c = "sistemma-backend"; n = "WUZAPI_WEBHOOK_URL" },
  @{ c = "sistemma-backend"; n = "WUZAPI_WEBHOOK_ENFORCE" },
  @{ c = "sistemma-wuzapi"; n = "WUZAPI_GLOBAL_WEBHOOK" }
)
$ruim = $false
foreach ($p in $pares) {
  $v = Ler-Env $p.c $p.n
  Write-Host ("   {0} {1}={2}" -f $p.c, $p.n, $v)
  if ($v -match "host\.docker\.internal") { $ruim = $true }
}
if ($ruim) {
  Write-Host ""
  Write-Host "AINDA aponta para host.docker.internal." -ForegroundColor Yellow
  Write-Host "Substitua o docker-compose.yml deste pacote, apague essas linhas do .env e rode atualizar-destino.cmd de novo."
  Write-Host "Nao use docker compose down -v."
} else {
  Write-Host ""
  Write-Host "Enderecos internos ok. Procure no log a linha Webhook confirmado." -ForegroundColor Green
}

Write-Host ""
Write-Host "Ultimas linhas do backend sobre webhook"
docker logs sistemma-backend --tail 200 2>&1 | Select-String -Pattern "Webhook|WuzapiWebhook|Whatsapp" | Select-Object -Last 20
