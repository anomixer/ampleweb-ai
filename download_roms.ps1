<#
.SYNOPSIS
    AmpleWeb ROM Downloader & Converter (COMPREHENSIVE VERSION)
    Downloads standalone ROMs from mdk.cab (.7z) and converts them to MAMEWASM-compatible .zip files.
#>

$roms = @(
    "a2diskii", "ace100", "agat7", "agat9", "albert", "am100", "apple1", "apple2", "apple2c", "apple2c0", "apple2c1", "apple2c2", "apple2c3", "apple2c4", "apple2che", "apple2cm", "apple2cp", "apple2e", "apple2ede", "apple2ee", "apple2eede", "apple2eefr", "apple2ees", "apple2eese", "apple2eeuk", "apple2efr", "apple2ep", "apple2epde", "apple2epes", "apple2epfr", "apple2epse", "apple2epuk", "apple2ese", "apple2euk", "apple2gs", "apple2gs_shared", "apple2gsr0", "apple2gsr1", "apple2jp", "apple2p", "apple3", "basis108", "bbcb", "c64", "c64c", "coco", "coco2b", "coco2bh", "coco3", "coco3h", "coco3p", "cocoh", "dragon32", "electron", "hkc8800a", "laser128", "mac128k", "mac512k", "mac512ke", "maccclas", "macclas2", "macclasc", "macii", "maciici", "maciicx", "maciifx", "maciihmu", "maciisi", "maciivi", "maciivx", "maciix", "maclc", "maclc2", "maclc3", "maclc3p", "maclc520", "macpb100", "macpb140", "macpb160", "macpb180c", "macpd210", "macpd270c", "macpd280", "macplus", "macqd605", "macqd610", "macqd630", "macqd650", "macqd700", "macqd800", "macqd900", "macqd950", "macse", "macse30", "macsefd", "mactv", "mc10", "mprof3", "oric1", "prav82", "prav8m", "trs80", "trs80l2"
)

$destDir = Join-Path $PSScriptRoot "public\roms"
$tempDir = Join-Path $PSScriptRoot "temp_roms"

if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
if (!(Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

Write-Host "AmpleWeb ROM Downloader (Comprehensive)" -ForegroundColor Cyan
Write-Host "Destination: $destDir"
Write-Host "----------------------------------"

$total = $roms.Count
$index = 0
$count = 0

foreach ($rom in $roms) {
    $index++
    $zipPath = Join-Path $destDir "$rom.zip"
    $progressStr = "[$($index.ToString().PadLeft($total.ToString().Length)) / $total]"

    $url = "https://mdk.cab/download/standalone/$rom.7z"
    $szPath = Join-Path $tempDir "$rom.7z"
    
    Write-Host "$progressStr Downloading ROM: $rom ..." -NoNewline -ForegroundColor Cyan
    
    $result = & curl.exe -f -s -L $url -o $szPath
    
    if (Test-Path $szPath) {
        $size = (Get-Item $szPath).Length
        if ($size -lt 500) {
            Write-Host " [NOT FOUND]" -ForegroundColor Yellow
            Remove-Item $szPath
            continue
        }
        
        Write-Host " [OK]" -ForegroundColor Green -NoNewline
        Write-Host " ($($size / 1024) KB)" -ForegroundColor Gray
        
        $extractDir = Join-Path $tempDir "ext_$rom"
        if (Test-Path $extractDir) { Remove-Item -Recurse -Force $extractDir }
        New-Item -ItemType Directory -Path $extractDir -Force | Out-Null
        & tar -xf $szPath -C $extractDir
        
        $prev = Get-Location
        Set-Location $extractDir
        & tar.exe -a -c -f $zipPath *
        Set-Location $prev
        
        Remove-Item -Recurse -Force $extractDir
        Remove-Item $szPath
        $count++
    }
    else {
        Write-Host " [NOT FOUND]" -ForegroundColor Yellow
    }
}

# Special Case: Generate auxiliary ROMs from apple2e for slot compatibility
Write-Host "`nGenerating auxiliary ROMs for Slot compatibility..." -ForegroundColor Yellow
$a2eZip = Join-Path $destDir "apple2e.zip"
if (Test-Path $a2eZip) {
    $auxTemp = Join-Path $tempDir "aux_ext"
    if (Test-Path $auxTemp) { Remove-Item -Recurse -Force $auxTemp }
    New-Item -ItemType Directory -Path $auxTemp -Force | Out-Null
    
    # Extract apple2e.zip to get common files (using tar to be safe)
    & tar.exe -xf $a2eZip -C $auxTemp
    
    # Create a2diskii.zip and a2diskiing.zip (Disk II)
    $d2files = @("341-0027-a.p5", "341-0028-a.rom")
    $d2Dir = Join-Path $tempDir "d2"
    if (Test-Path $d2Dir) { Remove-Item -Recurse -Force $d2Dir }
    New-Item -ItemType Directory -Path $d2Dir -Force | Out-Null
    foreach ($f in $d2files) { if (Test-Path (Join-Path $auxTemp $f)) { Copy-Item (Join-Path $auxTemp $f) $d2Dir } }
    Set-Location $d2Dir; & tar.exe -a -c -f (Join-Path $destDir "a2diskii.zip") *; & tar.exe -a -c -f (Join-Path $destDir "a2diskiing.zip") *; Set-Location $PSScriptRoot
    
    # Create d2fdc.zip
    $fdcDir = Join-Path $tempDir "fdc"
    if (Test-Path $fdcDir) { Remove-Item -Recurse -Force $fdcDir }
    New-Item -ItemType Directory -Path $fdcDir -Force | Out-Null
    if (Test-Path (Join-Path $auxTemp "341-0028-a.rom")) { Copy-Item (Join-Path $auxTemp "341-0028-a.rom") $fdcDir }
    Set-Location $fdcDir; & tar.exe -a -c -f (Join-Path $destDir "d2fdc.zip") *; Set-Location $PSScriptRoot
    
    # Create votrax.zip
    $vDir = Join-Path $tempDir "votrax"
    if (Test-Path $vDir) { Remove-Item -Recurse -Force $vDir }
    New-Item -ItemType Directory -Path $vDir -Force | Out-Null
    if (Test-Path (Join-Path $auxTemp "sc01a.bin")) { Copy-Item (Join-Path $auxTemp "sc01a.bin") $vDir }
    Set-Location $vDir; & tar.exe -a -c -f (Join-Path $destDir "votrax.zip") *; Set-Location $PSScriptRoot

    Write-Host "Auxiliary ROMs generated successfully." -ForegroundColor Green
}

Write-Host "`n----------------------------------"
Write-Host "Done! Newly added: $count ROMs." -ForegroundColor Cyan
Write-Host "Total library size: $( (Get-ChildItem $destDir -Filter *.zip).Count ) ROMs."
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
