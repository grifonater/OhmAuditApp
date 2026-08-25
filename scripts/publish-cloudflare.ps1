#requires -Version 7.0

<#
.SYNOPSIS
Publishes the Ohm Audit Cloudflare applications in dependency-safe order.

.EXAMPLE
pnpm publish:cloudflare

.EXAMPLE
pnpm publish:cloudflare -- -Scope All -ApplyMigrations

.NOTES
Secrets are never read from or printed by this script. Configure Worker secrets once with
Wrangler before publishing. For migrations, set OHMAUDIT_MIGRATION_DATABASE_URL in the current
process and pass -ApplyMigrations.
#>

[CmdletBinding()]
param(
  [ValidateSet('Core', 'All')]
  [string]$Scope = 'All',

  [switch]$ApplyMigrations,
  [switch]$SkipVerify,
  [switch]$RequireBootstrapSecret,
  [switch]$Yes
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$environmentName = 'production'
$workspaceRoot = Split-Path -Parent $PSScriptRoot

function Write-Step([string]$Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Invoke-Pnpm([string[]]$Arguments) {
  & pnpm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "pnpm command failed with exit code ${LASTEXITCODE}: pnpm $($Arguments -join ' ')"
  }
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Required file was not found: $Path"
  }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Read-DotEnvValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $pattern = '^\s*' + [regex]::Escape($Name) + '\s*=\s*(.*)\s*$'
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch $pattern) { continue }
    $value = $Matches[1].Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
      return $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return $null
}

function Get-EnvironmentConfig([object]$Config, [string]$ProjectName) {
  $property = $Config.env.PSObject.Properties[$environmentName]
  if ($null -eq $property) {
    throw "$ProjectName has no env.production configuration in wrangler.jsonc."
  }
  return $property.Value
}

function Assert-ProductionWorkerConfig([string]$Project) {
  $configPath = Join-Path $workspaceRoot "$Project\wrangler.jsonc"
  $config = Read-Json $configPath
  $production = Get-EnvironmentConfig $config $Project
  if ($null -eq $production.vars) {
    throw "$Project env.production must define its own vars; Wrangler does not inherit top-level vars."
  }
  if ($production.vars.APP_ENV -ne 'production') {
    throw "$Project env.production.vars.APP_ENV must be 'production'."
  }
  $serialised = $production | ConvertTo-Json -Depth 20 -Compress
  if ($serialised -match 'localhost|127\.0\.0\.1|replace|example\.supabase|configure-per-environment') {
    throw "$Project env.production still contains a local or placeholder value."
  }
  return $production
}

function Assert-ApiBindings([object]$Production) {
  if ($null -eq $Production.hyperdrive -or @($Production.hyperdrive).Count -eq 0) {
    throw 'ohmaudit-api env.production requires a HYPERDRIVE binding.'
  }
  if ($null -eq $Production.r2_buckets -or @($Production.r2_buckets).Count -eq 0) {
    throw 'ohmaudit-api env.production requires the MEDIA_BUCKET R2 binding.'
  }
  if ($null -eq $Production.services -or @($Production.services).Count -eq 0) {
    throw 'ohmaudit-api env.production requires the PDF_WORKER service binding.'
  }
  if ([string]::IsNullOrWhiteSpace([string]$Production.vars.SUPABASE_URL)) {
    throw 'ohmaudit-api env.production requires SUPABASE_URL.'
  }
  if ([string]::IsNullOrWhiteSpace([string]$Production.vars.ALLOWED_ORIGINS)) {
    throw 'ohmaudit-api env.production requires ALLOWED_ORIGINS.'
  }
}

function Assert-WebConfig([object]$ApiProduction) {
  $runtime = Read-Json (Join-Path $workspaceRoot 'ohmaudit-web\config\production\config.json')
  $values = @(
    [string]$runtime.apiBaseUrl,
    [string]$runtime.supabaseUrl,
    [string]$runtime.supabasePublishableKey,
    [string]$runtime.authRedirectUrl
  )
  if ($values.Where({ [string]::IsNullOrWhiteSpace($_) }).Count -gt 0) {
    throw 'ohmaudit-web/config/production/config.json is missing a required production value.'
  }
  if (($values -join '|') -match 'localhost|127\.0\.0\.1|replace|example\.supabase') {
    throw 'ohmaudit-web/config/production/config.json still contains a local or placeholder value.'
  }
  if (-not $runtime.apiBaseUrl.StartsWith('https://') -or -not $runtime.apiBaseUrl.EndsWith('/api/v1')) {
    throw 'Web apiBaseUrl must be an HTTPS URL ending in /api/v1.'
  }
  if (-not $runtime.authRedirectUrl.StartsWith('https://')) {
    throw 'Web authRedirectUrl must use HTTPS in production.'
  }
  $redirectUri = [Uri]$runtime.authRedirectUrl
  $webOrigin = $redirectUri.GetLeftPart([System.UriPartial]::Authority)
  $allowedOrigins = ([string]$ApiProduction.vars.ALLOWED_ORIGINS).Split(',').Trim()
  if (-not $allowedOrigins.Contains($webOrigin)) {
    throw "API ALLOWED_ORIGINS does not include the web origin $webOrigin."
  }
}

function Get-SecretNames([string]$Project) {
  $projectPath = Join-Path $workspaceRoot $Project
  $output = & pnpm --dir $projectPath exec wrangler secret list --env $environmentName --json
  if ($LASTEXITCODE -ne 0) {
    throw "Could not list Cloudflare secrets for $Project. Deploy or configure the Worker first."
  }
  if ([string]::IsNullOrWhiteSpace(($output -join ''))) { return @() }
  return @((($output -join "`n") | ConvertFrom-Json) | ForEach-Object { $_.name })
}

function Assert-Secret([string]$Project, [string]$Name) {
  $names = Get-SecretNames $Project
  if (-not $names.Contains($Name)) {
    throw "$Project is missing Cloudflare secret $Name for env.production."
  }
}

function Deploy-Worker([string]$Project) {
  Write-Step "Deploying $Project"
  Invoke-Pnpm -Arguments @('--dir', (Join-Path $workspaceRoot $Project), 'exec', 'wrangler', 'deploy', '--env', $environmentName)
}

Set-Location $workspaceRoot

Write-Step 'Checking local release prerequisites'
if ($null -eq (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  throw 'pnpm is not available on PATH.'
}
$nodeMajor = [int]((& node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) { throw 'Node.js 24 or newer is required.' }
Invoke-Pnpm -Arguments @('--filter', '@ohmaudit/api', 'exec', 'wrangler', 'whoami')

Write-Step 'Validating production configuration'
$pdfProduction = Assert-ProductionWorkerConfig 'ohmaudit-worker-pdf'
$apiProduction = Assert-ProductionWorkerConfig 'ohmaudit-api'
Assert-ApiBindings $apiProduction
Assert-WebConfig $apiProduction

if ($Scope -eq 'All') {
  foreach ($project in @(
    'ohmaudit-worker-notifications',
    'ohmaudit-worker-ai',
    'ohmaudit-worker-integrations',
    'ohmaudit-worker-scheduler'
  )) {
    $null = Assert-ProductionWorkerConfig $project
  }
  Assert-Secret 'ohmaudit-api' 'INTERNAL_SERVICE_TOKEN'
  Assert-Secret 'ohmaudit-worker-scheduler' 'INTERNAL_SERVICE_TOKEN'
}
if ($RequireBootstrapSecret) {
  Assert-Secret 'ohmaudit-api' 'SUPERADMIN_BOOTSTRAP_TOKEN'
}

if (-not $Yes) {
  Write-Host "`nThis will publish the $Scope Cloudflare applications to PRODUCTION." -ForegroundColor Yellow
  $confirmation = Read-Host 'Type PUBLISH production to continue'
  if ($confirmation -cne 'PUBLISH production') {
    throw 'Publishing cancelled.'
  }
}

if (-not $SkipVerify) {
  Write-Step 'Running complete workspace verification'
  Invoke-Pnpm -Arguments @('verify')
}

if ($ApplyMigrations) {
  $migrationDatabaseUrl = $env:OHMAUDIT_MIGRATION_DATABASE_URL
  if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrl)) {
    $migrationDatabaseUrl = Read-DotEnvValue (Join-Path $workspaceRoot 'ohmaudit-api\.dev.vars') 'DIRECT_URL'
  }
  if ([string]::IsNullOrWhiteSpace($migrationDatabaseUrl)) {
    throw 'Set OHMAUDIT_MIGRATION_DATABASE_URL or DIRECT_URL in ohmaudit-api/.dev.vars before using -ApplyMigrations.'
  }
  Write-Step 'Applying reviewed Prisma migrations to the selected production database'
  $previousDirectUrl = $env:DIRECT_URL
  try {
    $env:DIRECT_URL = $migrationDatabaseUrl
    Invoke-Pnpm -Arguments @('--dir', (Join-Path $workspaceRoot 'ohmaudit-api'), 'db:deploy')
  } finally {
    $migrationDatabaseUrl = $null
    if ($null -eq $previousDirectUrl) { Remove-Item Env:DIRECT_URL -ErrorAction SilentlyContinue }
    else { $env:DIRECT_URL = $previousDirectUrl }
  }
} else {
  Write-Host 'Database migrations were not applied. Use -ApplyMigrations when a release includes migrations.' -ForegroundColor Yellow
}

# Deploy dependencies before their consumers.
Deploy-Worker 'ohmaudit-worker-pdf'
if ($Scope -eq 'All') {
  Deploy-Worker 'ohmaudit-worker-notifications'
  Deploy-Worker 'ohmaudit-worker-ai'
  Deploy-Worker 'ohmaudit-worker-integrations'
}
Deploy-Worker 'ohmaudit-api'
if ($Scope -eq 'All') { Deploy-Worker 'ohmaudit-worker-scheduler' }

Write-Step 'Building and deploying the Angular static-assets Worker'
Invoke-Pnpm -Arguments @('--dir', (Join-Path $workspaceRoot 'ohmaudit-web'), 'build')
Invoke-Pnpm -Arguments @('--dir', (Join-Path $workspaceRoot 'ohmaudit-web'), 'exec', 'wrangler', 'deploy')

Write-Host "`nOhm Audit $Scope production publish completed successfully." -ForegroundColor Green
