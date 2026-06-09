try {
    $url = 'http://localhost:3200/api/dashboard/kpis-consolidado'
    $request = [System.Net.WebRequest]::Create($url)
    $request.Timeout = 20000
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    Write-Host "Status: $($response.StatusCode)"
    Write-Host "Tamanho: $($responseText.Length) chars"
    Write-Host "Primeiros 500 chars:"
    Write-Host $responseText.Substring(0, [Math]::Min(500, $responseText.Length))
} catch {
    Write-Host 'Erro: ' + $_.Exception.Message
}
