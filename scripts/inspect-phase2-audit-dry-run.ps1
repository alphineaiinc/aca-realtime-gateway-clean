# Phase 2 dependency audit dry-run: local evidence handling
# This script never invokes npm install or npm audit fix.
$ErrorActionPreference = 'Stop'
$expected = 'aca-phase2-dependency-remediation-proposal'
$branch = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne $expected) { throw "Wrong branch: $branch" }
$path = './phase2-audit-dry-run.json'
if (-not (Test-Path $path)) { throw 'Missing phase2-audit-dry-run.json; do not rerun npm audit fix yet.' }
$report = Get-Content $path -Raw | ConvertFrom-Json
Write-Host 'Dry-run JSON top-level keys:' (($report.PSObject.Properties.Name) -join ', ')
if ($report.error) { Write-Host 'Dry-run returned an npm error; inspect sanitized details before remediation.' }
if ($report.audit -and $report.audit.metadata -and $report.audit.metadata.vulnerabilities) {
  $v = $report.audit.metadata.vulnerabilities
  Write-Host "Audit metadata: critical=$($v.critical) high=$($v.high) moderate=$($v.moderate) low=$($v.low)"
}
if ($report.added -ne $null -or $report.removed -ne $null -or $report.changed -ne $null) {
  Write-Host "Dry-run proposed changes: added=$($report.added) removed=$($report.removed) changed=$($report.changed)"
}
Write-Host 'Tracked manifest changes (should be empty):'
& git diff -- package.json package-lock.json
if ($LASTEXITCODE -ne 0) { throw 'git diff failed.' }
Write-Host 'Local worktree status (untracked report and node_modules changes are expected):'
& git status --short
if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }
Write-Host 'Do not commit generated report or node_modules. Do not use npm audit fix --force.'
