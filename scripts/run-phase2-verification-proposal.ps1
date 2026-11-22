# Phase 2: non-mutating local verification for the proposal branch.
# Does not connect to Render, Neon, Twilio, or any production/staging endpoint.
$ErrorActionPreference = 'Stop'
$expectedBranch = 'aca-phase2-verification-workflow-proposal'
$branchName = (& git branch --show-current).Trim()
if ($LASTEXITCODE -ne 0 -or $branchName -ne $expectedBranch) {
  throw "Expected branch $expectedBranch; found $branchName"
}
if (-not (Test-Path './test/phase2aDbReadiness.test.js') -or
    -not (Test-Path './test/phase2a-staging-origin-security.test.js')) {
  throw 'Required security test files not found; run from repository root.'
}
if ($env:ACA_TEST_DATABASE_URL) {
  throw 'ACA_TEST_DATABASE_URL is set. Clear it before running non-integration verification.'
}
$files = @(Get-ChildItem './test' -Filter '*.test.js' |
  Where-Object { $_.Name -notlike '*.integration.test.js' } |
  ForEach-Object { $_.FullName })
if ($files.Count -eq 0) { throw 'No unit test files found.' }
Write-Host 'Running isolated security regressions' -ForegroundColor Cyan
& node --test './test/phase2a-staging-origin-security.test.js' './test/phase2aDbReadiness.test.js'
if ($LASTEXITCODE -ne 0) { throw 'Security regressions failed.' }
Write-Host 'Running non-integration regression suite' -ForegroundColor Cyan
& node --test --test-concurrency=1 @files
if ($LASTEXITCODE -ne 0) { throw 'Unit regression suite failed.' }
Write-Host 'Running read-only production dependency audit' -ForegroundColor Cyan
# Windows PowerShell: invoke npm.cmd explicitly to avoid ambiguous npm shell shims.
$npmCmd = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue
if (-not $npmCmd) { throw 'npm.cmd was not found. Check Node.js/npm installation and PATH.' }
& $npmCmd.Source audit --omit=dev --audit-level=high
if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed or could not complete.' }
Write-Host 'PASS: local security, unit, and dependency verification; PostgreSQL integration and CodeQL remain separate gates.' -ForegroundColor Green
