# =============================================================================
# backup-destino.ps1 - rodar NA MAQUINA DESTINO (C:\Sistemma)
# =============================================================================
# NAO apaga dados. NAO usa docker compose down -v. NAO remove volume nem imagem.
# Guarda, para rollback:
#   - dump logico de cada banco do PostgreSQL do Sistemma
#   - dump logico do PostgreSQL da WuzAPI
#   - copia do .env (com TAG)
#   - arquivo somente leitura de MinIO, uploads e sessao da WuzAPI
# O dump e a copia consistente do banco. O .tgz do volume PostgreSQL da WuzAPI
# complementa os arquivos de sessao; na restauracao do banco, use o dump.
# =============================================================================
param(
  [string]$Destino = "C:\Sistemma\backups",
  [string]$Container = "sistemma-postgres",
  [string]$Usuario = "neurai",
  [string]$Banco = "abastecimento"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $Destino | Out-Null
$gerados = @()

function Assert-DockerOk([string]$Acao) {
  if ($LASTEXITCODE -ne 0) { throw $Acao }
}

function Backup-Banco([string]$NomeContainer, [string]$User, [string]$Database, [string]$Arquivo) {
  if ($Database -notmatch '^[A-Za-z0-9_]+$') { throw "Nome de banco recusado: $Database" }
  Write-Host "   $NomeContainer / $Database"
  docker exec $NomeContainer pg_dump -U $User -d $Database -Fc -f "/tmp/$Arquivo.dump"
  Assert-DockerOk "pg_dump de $Database falhou"
  $dumpFile = Join-Path $Destino "$Arquivo-$stamp.dump"
  docker cp "${NomeContainer}:/tmp/$Arquivo.dump" $dumpFile
  Assert-DockerOk "docker cp do dump $Database falhou"
  docker exec $NomeContainer rm -f "/tmp/$Arquivo.dump" | Out-Null
  Write-Host "   Dump: $dumpFile"
  return $dumpFile
}

function Get-Volume([string]$NomeContainer, [string]$DestinoMount) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $raw = docker inspect $NomeContainer --format "{{range .Mounts}}{{.Type}}|{{.Name}}|{{.Destination}}{{println}}{{end}}" 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0 -or -not $raw) { return $null }
  $texto = if ($raw -is [System.Array]) { $raw -join "`n" } else { [string]$raw }
  foreach ($linha in ($texto -split "`r?`n")) {
    $partes = $linha.Trim().Split("|")
    if ($partes.Count -ge 3 -and $partes[0].Trim() -eq "volume" -and $partes[2].Trim() -eq $DestinoMount) {
      return $partes[1].Trim()
    }
  }
  return $null
}

function Find-VolumeBySuffix([string]$Suffix) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $raw = docker volume ls --format "{{.Name}}" 2>$null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0 -or -not $raw) { return $null }
  $texto = if ($raw -is [System.Array]) { $raw -join "`n" } else { [string]$raw }
  $achados = @($texto -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -eq $Suffix -or $_.EndsWith("_$Suffix") })
  if ($achados.Count -eq 1) { return $achados[0] }
  return $null
}

function Backup-Volume([string]$NomeContainer, [string]$DestinoMount, [string]$Arquivo) {
  $volume = Get-Volume $NomeContainer $DestinoMount
  if (-not $volume) { $volume = Find-VolumeBySuffix $Arquivo }
  if (-not $volume) { throw "Volume $Arquivo nao encontrado em $NomeContainer ($DestinoMount). Backup incompleto; nada foi apagado." }
  Write-Host "   $volume -> $Arquivo"
  $nomeArquivo = "$Arquivo-$stamp.tgz"
  docker run --rm -v "${volume}:/data:ro" -v "${Destino}:/backup" alpine:3.20 tar czf "/backup/$nomeArquivo" -C /data .
  Assert-DockerOk "Falha ao arquivar $volume. O volume nao foi alterado."
  $arquivo = Join-Path $Destino $nomeArquivo
  Write-Host "   Arquivo: $arquivo"
  return $arquivo
}

Write-Host "1/5 Bancos do Sistemma em $Container..."
$lista = docker exec $Container psql -U $Usuario -d postgres -At -c "SELECT datname FROM pg_database WHERE datistemplate = false AND datname <> 'postgres' ORDER BY 1"
Assert-DockerOk "Nao foi possivel listar os bancos de $Container"
$bancos = @($lista -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($bancos -notcontains $Banco) { throw "Banco $Banco nao existe em $Container. Nada foi alterado." }
foreach ($db in $bancos) {
  $gerados += Backup-Banco $Container $Usuario $db $db
}

Write-Host "2/5 Banco da WuzAPI..."
$wuzapiDb = docker ps --format "{{.Names}}" | Select-String -SimpleMatch "sistemma-wuzapi-db"
if (-not $wuzapiDb) { throw "Container sistemma-wuzapi-db nao esta no ar. Backup interrompido; nada foi apagado." }
$gerados += Backup-Banco "sistemma-wuzapi-db" "wuzapi" "wuzapi" "wuzapi"

Write-Host "3/5 .env e TAG..."
$envSrc = Join-Path (Get-Location) ".env"
if (-not (Test-Path $envSrc)) { $envSrc = "C:\Sistemma\.env" }
$tagTexto = "TAG nao encontrada"
if (Test-Path $envSrc) {
  $envCopy = Join-Path $Destino "env-$stamp.txt"
  Copy-Item $envSrc $envCopy
  $gerados += $envCopy
  $tagLine = Select-String -Path $envSrc -Pattern "^TAG=" | Select-Object -First 1
  if ($tagLine) { $tagTexto = $tagLine.Line }
  Write-Host "   .env copiado: $envCopy"
  Write-Host "   $tagTexto"
} else {
  Write-Host "   AVISO: .env nao encontrado - anote o TAG manualmente."
}

Write-Host "4/5 Volumes (somente leitura; nenhum volume e removido)..."
$gerados += Backup-Volume "sistemma-minio" "/data" "minio_data"
$gerados += Backup-Volume "sistemma-backend" "/app/uploads" "uploads_data"
$gerados += Backup-Volume "sistemma-wuzapi-db" "/var/lib/postgresql/data" "wuzapi_pg_data"
$gerados += Backup-Volume "sistemma-wuzapi" "/app/files" "wuzapi_files"
$gerados += Backup-Volume "sistemma-wuzapi" "/app/dbdata" "wuzapi_dbdata"

$manifesto = Join-Path $Destino "manifesto-$stamp.txt"
$linhas = @(
  "stamp=$stamp"
  $tagTexto
  "postgresql=dump logico; restaurar com pg_restore"
  "volumes=tar somente leitura; restaurar extraindo no volume de mesmo papel"
  "nao-usar=docker compose down -v"
)
$linhas += $gerados | ForEach-Object { "arquivo=$_" }
$linhas | Set-Content -Path $manifesto -Encoding UTF8
$gerados += $manifesto

Write-Host "5/5 Pronto. Guarde esta pasta ANTES de atualizar:"
$gerados | ForEach-Object { Write-Host "   $_" }
Write-Host ""
Write-Host "Rollback da imagem: volte a TAG anterior no .env e rode .\scripts\atualizar-destino.cmd"
Write-Host "Rollback do banco: pare so o backend e use pg_restore no dump correspondente."
Write-Host "Rollback de MinIO, uploads ou sessao WhatsApp: pare o servico, extraia o .tgz no volume e suba de novo."
Write-Host ""
Write-Host "NUNCA rode: docker compose down -v"
