# Alphine AI Phase 2: local-only, disposable PostgreSQL integration regression runner.
# Run from repository root. Requires Docker, Node.js, and alphine_phase2_test_pg.
$ErrorActionPreference = 'Stop'
$container = 'alphine_phase2_test_pg'
$expectedImage = 'postgres:17'
$expectedPort = '127.0.0.1:55432'
$testUser = 'phase2_test'
$testPassword = 'phase2_local_only'
$integration = @(
  'postgres-correction-ledger',
  'postgres-role-isolation',
  'postgres-repository-rls',
  'postgres-owner-decision',
  'postgres-owner-edge-nonce',
  'postgres-owner-oauth',
  'postgres-owner-private-chain',
  'postgres-owner-mtls-chain'
)

if (-not (Test-Path './test')) { throw 'Run from the repository root (test folder missing).' }
if ($env:ACA_TEST_DATABASE_URL) { throw 'ACA_TEST_DATABASE_URL is already set. Clear it before running.' }
$inspectJson = docker inspect $container --format '{{json .}}'
if ($LASTEXITCODE -ne 0) { throw 'Expected local test container not found.' }
$inspect = $inspectJson | ConvertFrom-Json
if ($inspect.Config.Image -ne $expectedImage -or $inspect.State.Status -ne 'running') {
  throw 'Unexpected container image or state; refusing to run.'
}
$bindings = @($inspect.NetworkSettings.Ports.'5432/tcp')
if ($bindings.Count -ne 1 -or $bindings[0].HostIp -ne '127.0.0.1' -or $bindings[0].HostPort -ne '55432') {
  throw 'Container is not bound exclusively to 127.0.0.1:55432.'
}
$identity = docker exec $container psql -X -A -t -v ON_ERROR_STOP=1 -U $testUser -d postgres -c 'SELECT current_user;'
if ($LASTEXITCODE -ne 0 -or ($identity | Out-String).Trim() -ne $testUser) {
  throw 'Unexpected PostgreSQL identity; refusing to run.'
}
$failures = @()
$created = @()
try {
  $unitTests = @(Get-ChildItem './test' -Filter '*.test.js' | Where-Object { $_.Name -notlike '*.integration.test.js' } | ForEach-Object { $_.FullName })
  if ($unitTests.Count -eq 0) { throw 'No non-integration tests found.' }
  Write-Host "Running $($unitTests.Count) non-integration test files" -ForegroundColor Cyan
  & node --test --test-concurrency=1 @unitTests
  if ($LASTEXITCODE -ne 0) { $failures += 'non-integration' }

  foreach ($name in $integration) {
    $file = "test/$name.integration.test.js"
    if (-not (Test-Path $file)) { $failures += "missing:$file"; continue }
    # Each invocation creates its own random, isolated database. No reused fixture state.
    $db = 'phase2_ci_' + ([guid]::NewGuid().ToString('N').Substring(0,20))
    docker exec $container psql -X -v ON_ERROR_STOP=1 -U $testUser -d postgres -c "CREATE DATABASE $db;"
    if ($LASTEXITCODE -ne 0) { throw "Could not create $db" }
    $created += $db
    try {
      $env:ACA_TEST_DATABASE_URL = "postgresql://${testUser}:${testPassword}@${expectedPort}/$db"
      Write-Host "Testing $name against disposable $db" -ForegroundColor Cyan
      & node --test $file
      if ($LASTEXITCODE -ne 0) { $failures += $name }
    } finally {
      Remove-Item Env:ACA_TEST_DATABASE_URL -ErrorAction SilentlyContinue
    }
  }
} finally {
  Remove-Item Env:ACA_TEST_DATABASE_URL -ErrorAction SilentlyContinue
  # Only drop databases this exact process created, never existing databases.
  foreach ($db in $created) {
    docker exec $container psql -X -v ON_ERROR_STOP=1 -U $testUser -d postgres -c "DROP DATABASE $db WITH (FORCE);"
    if ($LASTEXITCODE -ne 0) { $failures += "cleanup:$db" }
  }
}
if ($failures.Count -gt 0) {
  Write-Host "FAILED: $($failures -join ', ')" -ForegroundColor Red
  exit 1
}
Write-Host 'PASS: non-integration suite and all 8 isolated PostgreSQL integration files; cleanup succeeded.' -ForegroundColor Green
exit 0
