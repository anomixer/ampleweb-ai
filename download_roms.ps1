<#
.SYNOPSIS
    AmpleWeb ROM Downloader (CLI Wrapper)
    Controls the rom_manager_cli.py to download ROMs based on the official roms.plist.
#>

$plistPath = Join-Path $PSScriptRoot "public\resources\roms.plist"
$destDir = Join-Path $PSScriptRoot "public\roms"
$pythonScript = Join-Path $PSScriptRoot "rom_manager_cli.py"

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "   AmpleWeb ROM Downloader v2.1   " -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# Source Selection
Write-Host "Please select a download source:"
Write-Host "1) CallApple (Default)"
Write-Host "2) MDK Cab"
Write-Host "3) Both (Failover)"
Write-Host "4) Custom URL"

$choice = Read-Host "Choice [1-4]"
$sources = ""

switch ($choice) {
    "1" { $sources = "https://www.callapple.org/roms/" }
    "2" { $sources = "https://mdk.cab/download/split/" }
    "3" { $sources = "https://www.callapple.org/roms/,https://mdk.cab/download/split/" }
    "4" { 
        $custom = Read-Host "Enter custom base URL (e.g., http://example.com/roms/)"
        if ($custom -match "https?://") { $sources = $custom }
        else { Write-Host "Invalid URL!"; exit }
    }
    Default { $sources = "https://www.callapple.org/roms/,https://mdk.cab/download/split/" }
}

Write-Host "----------------------------------"
Write-Host "Calling Python engine with source: $sources"

if (!(Test-Path $pythonScript)) {
    Write-Host "Error: rom_manager_cli.py not found!" -ForegroundColor Red
    exit
}

if (!(Test-Path $plistPath)) {
    Write-Host "Error: roms.plist not found at $plistPath" -ForegroundColor Red
    exit
}

# Run the python script
python $pythonScript --plist $plistPath --dest $destDir --sources $sources

# --- ROM Patches & Fixes ---
Write-Host "Applying ROM patches..." -ForegroundColor Yellow

$a2c = Join-Path $destDir "apple2c.zip"
$tk3k = Join-Path $destDir "tk3000.zip"

if (Test-Path $a2c) {
    if (!(Test-Path $tk3k)) {
        Copy-Item $a2c $tk3k -Force
        Write-Host "Fixed: Copied apple2c.zip to tk3000.zip (Source fix for CallApple)" -ForegroundColor Green
    } else {
        Write-Host "tk3000.zip already exists, skipping patch." -ForegroundColor DarkGray
    }
}

# Dragon32 Patch
$dragon32 = Join-Path $destDir "dragon32.zip"
Write-Host "Checking Dragon32 ROM patch..." -ForegroundColor Cyan
$tempPatchDir = Join-Path $PSScriptRoot "temp_dragon_patch"
if (Test-Path $tempPatchDir) { Remove-Item $tempPatchDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempPatchDir | Out-Null

if (Test-Path $dragon32) {
    Write-Host "Extracting existing dragon32.zip..." -ForegroundColor Gray
    Expand-Archive -Path $dragon32 -DestinationPath $tempPatchDir -Force
}

$mdkUrl = "https://mdk.cab/download/split/dragon32.zip"
$mdkZip = Join-Path $PSScriptRoot "mdk_dragon.zip"
Write-Host "Fetching MDK version for missing files..." -ForegroundColor Gray
try {
    Invoke-WebRequest -Uri $mdkUrl -OutFile $mdkZip -ErrorAction Stop
    Expand-Archive -Path $mdkZip -DestinationPath $tempPatchDir -Force
    Remove-Item $mdkZip -Force
    
    # Create a fresh zip
    if (Test-Path $dragon32) { Remove-Item $dragon32 -Force }
    Compress-Archive -Path "$tempPatchDir\*" -DestinationPath $dragon32 -Force
    Write-Host "Fixed: dragon32.zip patched and updated." -ForegroundColor Green
    
    Write-Host "Final ZIP content verification:" -ForegroundColor Gray
    tar -tf $dragon32
} catch {
    Write-Host "Warning: Could not download or patch Dragon32 ROM" -ForegroundColor Yellow
}
if (Test-Path $tempPatchDir) { Remove-Item $tempPatchDir -Recurse -Force }

Write-Host "----------------------------------"
Write-Host "Script execution finished." -ForegroundColor Cyan
