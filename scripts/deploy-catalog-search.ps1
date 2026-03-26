$ErrorActionPreference = "Stop"

function Get-EnvMap([string]$Path) {
    if (-not (Test-Path $Path)) {
        throw "Missing env file: $Path"
    }

    $envMap = @{}
    Get-Content $Path | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim().Trim('"')
            $envMap[$key] = $value
        }
    }

    return $envMap
}

function Get-ProjectRef([hashtable]$EnvMap) {
    if ($EnvMap.ContainsKey("SUPABASE_PROJECT_REF") -and $EnvMap["SUPABASE_PROJECT_REF"]) {
        return $EnvMap["SUPABASE_PROJECT_REF"]
    }

    $supabaseUrl = $EnvMap["SUPABASE_URL"]
    if ($supabaseUrl -match '^https://([a-z0-9-]+)\.supabase\.co/?$') {
        return $Matches[1]
    }

    throw "Missing SUPABASE_PROJECT_REF and could not derive project ref from SUPABASE_URL."
}

$envMap = Get-EnvMap ".\.env"
$projectRef = Get-ProjectRef $envMap
$accessToken = ""
if ($envMap.ContainsKey("SUPABASE_ACCESS_TOKEN") -and $envMap["SUPABASE_ACCESS_TOKEN"]) {
    $accessToken = $envMap["SUPABASE_ACCESS_TOKEN"].Trim()
}

if (-not $accessToken) {
    throw "Missing SUPABASE_ACCESS_TOKEN in .env."
}

if ($accessToken -notmatch '^sbp_[A-Za-z0-9]+$') {
    throw "SUPABASE_ACCESS_TOKEN in .env has an invalid format. Expected a personal access token like sbp_...."
}

$env:SUPABASE_ACCESS_TOKEN = $accessToken

Write-Host "Deploying catalog-search to project $projectRef" -ForegroundColor Cyan

try {
    & npx.cmd supabase functions deploy catalog-search --project-ref $projectRef
} catch {
    throw
}
