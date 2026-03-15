param(
  [string]$Domain = "lp.theciovision.com",
  [string]$Path = ""
)

$ErrorActionPreference = "Stop"

function Get-PublicDnsIp {
  param(
    [string]$HostName
  )

  $servers = @("1.1.1.1", "8.8.8.8")
  $addresses = [System.Collections.Generic.List[string]]::new()

  foreach ($server in $servers) {
    try {
      $records = Resolve-DnsName -Server $server -Name $HostName -Type A -ErrorAction Stop
      $resolved = $records |
        Where-Object { $_.Type -eq "A" -and $_.IPAddress } |
        Select-Object -ExpandProperty IPAddress

      foreach ($address in $resolved) {
        if ($address -and -not $addresses.Contains($address)) {
          $addresses.Add($address)
        }
      }
    } catch {
      continue
    }
  }

  if ($addresses.Count -eq 0) {
    throw "Unable to resolve $HostName via public DNS."
  }

  return $addresses
}

function Test-CandidateIp {
  param(
    [string]$HostName,
    [string]$IpAddress
  )

  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $curlOutput = & curl.exe -Ivs --resolve "${HostName}:443:${IpAddress}" "https://${HostName}" 2>&1
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0 -and -not ($curlOutput -match "< HTTP/1\.[01] [23]\d\d")) {
    return $false
  }

  return ($curlOutput -match "< HTTP/1\.[01] [23]\d\d") -and ($curlOutput -match "< Server: Vercel")
}

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chromePath)) {
  $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chromePath)) {
  throw "Google Chrome is not installed in the default location."
}

$resolvedIps = Get-PublicDnsIp -HostName $Domain
$resolvedIp = $resolvedIps | Where-Object { Test-CandidateIp -HostName $Domain -IpAddress $_ } | Select-Object -First 1

if (-not $resolvedIp) {
  throw "Unable to find a working Vercel IP for $Domain."
}

$normalizedPath = if ([string]::IsNullOrWhiteSpace($Path)) { "" } else { "/" + $Path.TrimStart("/") }
$targetUrl = "https://$Domain$normalizedPath"
$profileDir = Join-Path $env:TEMP ("chrome-custom-domain-" + [guid]::NewGuid().ToString("N"))

$arguments = @(
  "--user-data-dir=$profileDir"
  "--new-window"
  "--no-first-run"
  "--host-resolver-rules=MAP $Domain $resolvedIp"
  $targetUrl
)

Write-Host "Opening $targetUrl via $resolvedIp" -ForegroundColor Green
Start-Process -FilePath $chromePath -ArgumentList $arguments
