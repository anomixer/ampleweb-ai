<#
.SYNOPSIS
    AmpleWeb ROM Downloader (CLI Wrapper)
    Controls the rom_manager_cli.py to download ROMs based on the official roms.plist.
#>

$plistPath = Join-Path $PSScriptRoot "..\Ample\Resources\roms.plist"
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
Write-Host "`nApplying ROM patches..." -ForegroundColor Yellow

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

Write-Host "----------------------------------"
Write-Host "Script execution finished." -ForegroundColor Cyan
