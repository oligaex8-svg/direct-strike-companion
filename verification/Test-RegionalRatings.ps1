$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$baseUrl = (Get-Content -LiteralPath (Join-Path $projectRoot 'data/running-url.txt') -Raw).Trim()
$fixtureId = 'name:dsregionalacceptancetest'
$fixtureName = 'DSRegionalAcceptanceTest'
$headers = @{ 'X-DS-Companion' = '1' }
$checks = [System.Collections.Generic.List[string]]::new()

function Invoke-CompanionApi($endpoint, $payload) {
    $response = Invoke-RestMethod -Uri "$baseUrl/api/$endpoint" -Method Post -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Depth 10)
    foreach ($item in $response) { $item }
}
function Get-Library {
    (Invoke-RestMethod -Uri "$baseUrl/api/state" -Headers $headers).library
}
function Assert-Check($condition, $message) {
    if (-not $condition) { throw $message }
    $checks.Add("PASS: $message")
}
function Get-FixturePair {
    (Get-Library).ratings.$fixtureId
}

if ((Get-Library).marks | Where-Object id -eq $fixtureId) { throw 'Fixture ID already exists; no changes made.' }
try {
    Invoke-CompanionApi 'mark' @{ id = $fixtureId; name = $fixtureName } | Out-Null
    $eu = @(Invoke-CompanionApi 'rating/search' @{ id = $fixtureId; region = 'EU'; name = 'emily' })
    $americas = @(Invoke-CompanionApi 'rating/search' @{ id = $fixtureId; region = 'Americas'; name = 'emily' })
    Assert-Check ($eu.Count -gt 0 -and @($eu | Where-Object region -ne 'eu').Count -eq 0) 'EU search returns only EU candidates'
    Assert-Check ($americas.Count -gt 0 -and @($americas | Where-Object region -ne 'na').Count -eq 0) 'Americas search returns only Americas candidates'
    $euProfile = $eu | Where-Object profileId -eq '236466' | Select-Object -First 1
    $americasProfile = $americas | Where-Object profileId -eq '358976' | Select-Object -First 1
    if (-not $euProfile -or -not $americasProfile) { throw 'Public test profiles are no longer present.' }
    Invoke-CompanionApi 'rating/link' @{ id = $fixtureId; region = 'EU'; name = 'emily'; profileId = $euProfile.profileId } | Out-Null
    Invoke-CompanionApi 'rating/link' @{ id = $fixtureId; region = 'Americas'; name = 'emily'; profileId = $americasProfile.profileId } | Out-Null
    $pair = Get-FixturePair
    Assert-Check ($pair.eu.profileId -eq '236466' -and $pair.americas.profileId -eq '358976') 'Two explicitly selected regional profiles coexist'
    Assert-Check ($pair.americas.value -gt 0 -and $pair.americas.mode -eq '3v3 Commanders') 'Americas value comes from the 3v3 Commanders rating row'
    $euBefore = $pair.eu | ConvertTo-Json -Compress
    $rejected = $false
    try {
        Invoke-CompanionApi 'rating/link' @{ id = $fixtureId; region = 'EU'; name = 'emily'; profileId = $americasProfile.profileId } | Out-Null
    } catch {
        $rejected = [int]$_.Exception.Response.StatusCode -eq 400
    }
    Assert-Check ($rejected -and ((Get-FixturePair).eu | ConvertTo-Json -Compress) -eq $euBefore) 'Wrong-region linking is rejected and preserves EU'
    Invoke-CompanionApi 'rating/refresh' @{ id = $fixtureId; region = 'Americas' } | Out-Null
    Assert-Check (((Get-FixturePair).eu | ConvertTo-Json -Compress) -eq $euBefore) 'Refreshing Americas preserves EU'
    Invoke-CompanionApi 'rating/unlink' @{ id = $fixtureId; region = 'EU' } | Out-Null
    $pair = Get-FixturePair
    Assert-Check ($null -eq $pair.eu -and $pair.americas.profileId -eq '358976') 'Unlinking EU preserves Americas'
} finally {
    Invoke-CompanionApi 'rating/unlink' @{ id = $fixtureId; region = 'EU' } | Out-Null
    Invoke-CompanionApi 'rating/unlink' @{ id = $fixtureId; region = 'Americas' } | Out-Null
    Invoke-CompanionApi 'mark' @{ id = $fixtureId; name = $fixtureName; remove = $true } | Out-Null
}
Assert-Check (-not ((Get-Library).marks | Where-Object id -eq $fixtureId) -and $null -eq (Get-FixturePair)) 'Temporary fixture and links removed'
[ordered]@{
    success = $true
    checkedAt = [DateTime]::UtcNow.ToString('o')
    fixture = 'Temporary local mark with two public emily profiles; this tests region isolation and does not assert these profiles belong to one person.'
    results = @($checks)
} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'regional-api.json') -Encoding UTF8
$checks
