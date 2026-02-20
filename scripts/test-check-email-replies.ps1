param(
  [Parameter(Mandatory = $true)]
  [string]$ConfigId,
  [int]$LookbackDays = 7,
  [switch]$LegacyHostinger,
  [switch]$ForceDirectTls,
  [switch]$ForceStartTls,
  [string]$ImapHostOverride,
  [string[]]$ImapHostCandidates,
  [int]$MaxAttempts,
  [int]$ConnectionTimeoutMs,
  [int]$GreetingTimeoutMs,
  [int]$SocketTimeoutMs,
  [switch]$UseDbScan,
  [string]$Url
)

$ErrorActionPreference = 'Stop'

$envPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
      $name = $Matches[1]
      $value = $Matches[2].Trim().Trim('"')
      if (-not [Environment]::GetEnvironmentVariable($name)) {
        [Environment]::SetEnvironmentVariable($name, $value)
      }
    }
  }
}

if (-not $Url) {
  if (-not $env:SUPABASE_URL) {
    throw "Missing SUPABASE_URL in environment or .env file."
  }
  $Url = "$($env:SUPABASE_URL.TrimEnd('/'))/functions/v1/check-email-replies"
}

$body = @{
  config_id = $ConfigId
  lookback_days = $LookbackDays
}

if ($UseDbScan) { $body.use_db_scan = $true }
if ($LegacyHostinger) { $body.force_legacy_hostinger = $true }
if ($ForceDirectTls) { $body.force_direct_tls = $true }
if ($ForceStartTls) { $body.force_starttls = $true }
if ($ImapHostOverride) { $body.imap_host_override = $ImapHostOverride }
if ($ImapHostCandidates) { $body.imap_host_candidates = $ImapHostCandidates }
if ($MaxAttempts) { $body.max_attempts = $MaxAttempts }
if ($ConnectionTimeoutMs) { $body.connection_timeout_ms = $ConnectionTimeoutMs }
if ($GreetingTimeoutMs) { $body.greeting_timeout_ms = $GreetingTimeoutMs }
if ($SocketTimeoutMs) { $body.socket_timeout_ms = $SocketTimeoutMs }

$json = $body | ConvertTo-Json -Depth 6

Write-Host "Invoking check-email-replies..." -ForegroundColor Cyan
Write-Host $json

try {
  $response = Invoke-RestMethod -Method Post -Uri $Url -ContentType "application/json" -Body $json -TimeoutSec 180
  $response | ConvertTo-Json -Depth 6
} catch {
  Write-Host "Request failed:" -ForegroundColor Red
  Write-Host $_.Exception.Message
  if ($_.Exception.Response) {
    $stream = $_.Exception.Response.GetResponseStream()
    if ($stream) {
      $reader = New-Object System.IO.StreamReader($stream)
      $reader.ReadToEnd()
    }
  }
  exit 1
}
