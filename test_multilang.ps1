Write-Host "🌐 Starting Global ACA Test Matrix..."
$languages = @("en-US","ta-IN","es-ES","fr-FR","hi-IN")
foreach ($lang in $languages) {
  Write-Host "`nTesting language: $lang"
  $body = @{ query = "Welcome message test"; language = $lang } | ConvertTo-Json
  $response = Invoke-RestMethod `
    -Uri "https://aca-realtime-gateway-clean.onrender.com/brain/query" `
    -Method Post -ContentType "application/json" -Body $body
  Write-Host ("{0}`n{1}" -f $lang, ($response | ConvertTo-Json -Depth 5))
}
Write-Host "`n✅ Global test complete."
