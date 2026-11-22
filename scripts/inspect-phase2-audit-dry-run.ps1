# Read-only inspection of npm audit fix dry-run output.
$ErrorActionPreference = 'Stop'
$expected = 'aca-phase2-dependency-remediation-proposal'
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne $expected) { throw "Wrong branch: $branch" }
$path = './phase2-audit-dry-run.json'
if (-not (Test-Path $path)) { throw 'Missing phase2-audit-dry-run.json.' }
$raw = Get-Content $path -Raw
Write-Host "Report bytes (characters): $($raw.Length)"
$report = $null
try { $report = $raw | ConvertFrom-Json -ErrorAction Stop }
catch {
  Write-Warning 'Dry-run output is not one valid JSON document. No JSON remediation claims will be made.'
  $lines = @($raw -split "\r?\n")
  $nonempty = @($lines | Where-Object { $_.Trim().Length -gt 0 })
  Write-Host "Total lines: $($lines.Count); nonempty lines: $($nonempty.Count)"
  # Avoid echoing arbitrary npm output, which may contain paths, URLs or sensitive details.
  $patterns = @('^add\s', '^remove\s', '^change\s', '^npm\s', '^\s*\{', '^\s*\[')
  foreach ($pattern in $patterns) {
    $count = @($nonempty | Where-Object { $_ -match $pattern }).Count
    Write-Host "Lines matching $pattern : $count"
  }
  Write-Host 'The report may be npm mixed output. Use the separate npm audit command for authoritative vulnerability counts.'
}
if ($null -ne $report) {
  Write-Host 'JSON top-level keys:' (($report.PSObject.Properties.Name) -join ', ')
  if ($report.error) { Write-Warning 'npm reported an error; no remediation success claim.' }
  if ($report.audit -and $report.audit.metadata -and $report.audit.metadata.vulnerabilities) {
    $v = $report.audit.metadata.vulnerabilities
    Write-Host "Audit metadata: critical=$($v.critical) high=$($v.high) moderate=$($v.moderate) low=$($v.low)"
  }
  if ($null -ne $report.added -or $null -ne $report.removed -or $null -ne $report.changed) {
    Write-Host "Dry-run proposed changes: added=$($report.added) removed=$($report.removed) changed=$($report.changed)"
  }
}
Write-Host 'Tracked manifest diff (should be empty):'
& git diff -- package.json package-lock.json
if ($LASTEXITCODE -ne 0) { throw 'git diff failed.' }
Write-Host 'Worktree status:'
& git status --short
if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }
Write-Host 'No files modified by this inspection helper.'
