<#
.SYNOPSIS
    AmpleWeb ROM Downloader & Converter (ULTRA-COMPREHENSIVE VERSION)
    Downloads standalone ROMs from mdk.cab (.7z) and converts them to MAMEWASM-compatible .zip files.
#>

$roms = @(
    "3xtwin", "4dparprn", "a1cass", "a2aevm80", "a2ap16", "a2ap16a", "a2aplcrd", "a2booti", "a2bufgrapplerplus", "a2cffa02", "a2cffa2", "a2corvus", "a2diskiing", "a2excel9", "a2focdrv", "a2grappler", "a2grapplerplus", "a2hsscsi", "a2ieee488", "a2iwm", "a2kb200", "a2memexp", "a2mouse", "a2parprn", "a2pdromdr", "a2pic", "a2q68", "a2ramfac", "a2retronet", "a2romfp", "a2romint", "a2scsi", "a2sd", "a2sic", "a2sider1", "a2sider2", "a2ssc", "a2superdrive", "a2suprterm", "a2surance", "a2swyft", "a2thunpl", "a2tk10", "a2tmstho", "a2twarp", "a2ultrme", "a2ulttrm", "a2uniprint", "a2vidtrm", "a2vistaa800", "a2vtc1", "a2vulcan", "a2vulgld", "a2vuliie", "a2zipdrv", "a3fdc", "acb2072", "ace100", "ace1000", "ace2200", "ace500", "adbmodem", "agat_fdc", "agat7", "agat7_flop", "agat840k_hle", "agat9", "agat9_flop", "albert", "am100", "am100kbd", "am64", "ap2000", "aplcd150", "apple1", "apple2", "apple2c", "apple2c0", "apple2c3", "apple2c4", "apple2cp", "apple2e", "apple2ede", "apple2ee", "apple2eede", "apple2eefr", "apple2ees", "apple2eese", "apple2eeuk", "apple2efr", "apple2ep", "apple2epde", "apple2epfr", "apple2epse", "apple2epuk", "apple2ese", "apple2euk", "apple2gs", "apple2gsr0", "apple2gsr1", "apple2jp", "apple2p", "apple3", "aprissi", "archimedes_keyboard", "asc88", "basis108", "bbc_24bbc", "bbc_2ndserial", "bbc_acorn1770", "bbc_acorn8271", "bbc_ams3", "bbc_ariesb20", "bbc_ariesb32", "bbc_autoprom", "bbc_beebspch", "bbc_bitstik1", "bbc_bitstik2", "bbc_cc500", "bbc_chameleon", "bbc_cisco", "bbc_cms6502", "bbc_cumana1", "bbc_cumana2", "bbc_cumana68k", "bbc_cv1797", "bbc_datacentre", "bbc_detalker", "bbc_ieee488", "bbc_integrab", "bbc_kenda", "bbc_magazzino", "bbc_memexb20", "bbc_mertec", "bbc_morleyaa", "bbc_multiform", "bbc_opus1770", "bbc_opus2791", "bbc_opus2793", "bbc_opus3", "bbc_opus8272", "bbc_opusa", "bbc_pdram", "bbc_pms64k", "bbc_ramdisc", "bbc_raven20", "bbc_stl1770_1", "bbc_stl1770_2", "bbc_stl2m128", "bbc_stl4m32", "bbc_stldfdc_1", "bbc_stlswr128", "bbc_stlswr16", "bbc_stlswr32", "bbc_stlswr64", "bbc_sweetalker", "bbc_tube_16032", "bbc_tube_32016", "bbc_tube_32016l", "bbc_tube_6502", "bbc_tube_6502e", "bbc_tube_6502p", "bbc_tube_65c102", "bbc_tube_80186", "bbc_tube_80286", "bbc_tube_a500", "bbc_tube_a500d", "bbc_tube_arm", "bbc_tube_arm7", "bbc_tube_casper", "bbc_tube_cms6809", "bbc_tube_matchbox", "bbc_tube_pcplus", "bbc_tube_rc6502", "bbc_tube_rc65816", "bbc_tube_x25", "bbc_tube_z80", "bbc_tube_z80w", "bbc_tube_zep100", "bbc_tube_zep100l", "bbc_tube_zep100m", "bbc_tube_zep100w", "bbc_udm", "bbc_voicebox", "bbc_we32kram", "bbc_weddb2", "bbc_weddb3", "bbca", "bbcb", "bbcb_de", "bbcb_no", "bbcb_us", "bbcbp", "bbcbp128", "bbcm", "bbcmc", "bbcmt", "bluechip", "c1526", "c1540", "c1541", "c1541c", "c1541dd", "c1541ii", "c1541pd", "c1541pdc", "c1570", "c1571", "c1581", "c2031", "c2040", "c2040_fdc", "c3040", "c4023", "c4040", "c64", "c64_buscard", "c64_buscard2", "c64_cspeech", "c64_mscr", "c64_nl10", "c64_supercpu", "c64_xl80", "c64_z80videopak", "c64c", "c8050", "c8050fdc", "c8250", "c8280", "cbm_interpod", "cbm_serbox", "ccs7710", "cd6809_fdc", "cdd2000", "cdr4210", "cdrn820s", "cdu415", "cdu561_25", "cdu75s", "cec2000", "cece", "cecg", "ceci", "cecm", "cffa1", "cfp1080s", "cga", "cga_m24", "cga_mc1502", "cga_poisk2", "chessmachine", "cmdhd", "cmdrc2", "cms_4080term", "cmsscsi", "coco", "coco_dcmodem", "coco_fdc", "coco_orch90", "coco_psg", "coco_rs232", "coco_scii", "coco_ssc", "coco_wpk", "coco_wpk2", "coco_wpkrs", "coco2b", "coco2bh", "coco3", "coco3h", "coco3p", "cocoh", "comx_pl80", "cp2024", "cp450_fdc", "craft2p", "crd254sh", "csd1", "cuda", "cv8lc", "cw7501", "d2fdc", "d64plus", "d9060", "d9090", "dectalk_isa", "diskii13", "dodo", "dragon_fdc", "dragon_jcbsnd", "dragon_jcbspch", "dragon_serial", "dragon_sprites", "dragon200", "dragon200e", "dragon32", "dragon64", "duodock", "ec1841_0002", "econet_e01", "econet_e01s", "ef9365", "ega", "egret", "electron", "electron_ap1", "electron_ap6", "electron_elksd128", "electron_elksd64", "electron_m2105", "electron_mc68k", "electron_mode7", "electron_plus1", "electron_plus3", "electron_pwrjoy", "electron_romboxp", "electron_sidewndr", "electron_voxbox", "elppa", "enetlc", "enetlctp", "enetnbtp", "enh2000", "epson_fx80", "epson_jx80", "epson_rx80", "ethudock", "ex800", "fd148", "fd2000", "fd4000", "fdc344", "fdcmag", "fsd1", "fsd2", "hardbox", "hd44780", "heath_gp19_tlb", "heath_imaginator_tlb", "heath_super19_tlb", "heath_superset_tlb", "heath_tlb", "heath_ultra_tlb", "heath_watz_tlb", "hkc8800a", "hp9122c", "hp9133", "hp9895", "ibm_mfc", "ibm_vga", "ibsap2", "ie15_device", "ie15kbd", "indusgt", "isa_aga", "isa_aga_pc200", "isa_epc_mda", "isa_finalchs", "isa_hdc", "isa_hercules", "isa_ibm_mda", "isa_ibm_pgc", "isa_ibm_speech", "isa_pcmidi", "isa_prose4001", "ivelultr", "ivelultrkb", "kb_ec1841", "kb_iskr1030", "kb_pcxt83", "keytronic_pc3270", "las128e2", "las128ex", "laser128", "laser128o", "laser2c", "laser3k", "lba_enhancer", "lisa", "lisa2", "lisa2fdc", "lisafdc", "lisavideo", "lx800", "lx810l", "m68705p3", "m68hc05pge", "mac128k", "mac2fdhd", "mac512k", "mac512ke", "maccclas", "macclas2", "macclasc", "macct610", "macct650", "macii", "maciici", "maciicx", "maciifx", "maciihmu", "maciisi", "maciivi", "maciivx", "maciix", "mackbd_m0110", "mackbd_m0110a", "maclc", "maclc2", "maclc3", "maclc3p", "maclc475", "maclc520", "maclc550", "maclc575", "macpb100", "macpb140", "macpb145", "macpb145b", "macpb160", "macpb165", "macpb165c", "macpb170", "macpb180", "macpb180c", "macpd210", "macpd230", "macpd250", "macpd270c", "macpd280", "macpd280c", "macplus", "macprtb", "macqd605", "macqd610", "macqd630", "macqd650", "macqd700", "macqd800", "macqd900", "macqd950", "macse", "macse30", "macsefd", "mactv", "macxlfdc", "macxlvideo", "maxxi", "mc10", "mcx128", "megast", "microeng", "minichif", "mm5740", "mockingboardd", "mprof3", "mps1200", "mps1250", "mpu401", "msdsd1", "msdsd2", "mshark", "mz1p16", "nb_aenet", "nb_amc3b", "nb_btbug", "nb_c264", "nb_image", "nb_laserview", "nb_m2hr", "nb_m2vc", "nb_mdc48", "nb_mdc824", "nb_pcs8", "nb_qdlink", "nb_rtpd", "nb_sp8s3", "nb_spdq", "nb_thungx", "nb_vikbw", "nb_wkstn", "nb_wspt", "nlq401", "nss_tvinterface", "oric_jasmin", "oric_microdisc", "oric1", "orica", "p72", "pd3_30hr", "pd3_c264", "pd3_lviw", "pd3_mclr", "pd3_pc16", "pd3_pcs8", "pds_hyper", "pds_sefp", "pds30_emac", "pdslc_macconlc", "pet_softbox", "prav82", "prav8c", "prav8ckb", "prav8d", "prav8m", "premier_fdc", "px320a", "qsound", "rt1000b", "saa5050", "scorpion_ic", "sdtandy_fdc", "sfd1001", "side116", "smoc501", "softcard3", "space84", "spectred", "st", "st_kbd", "stereo_fx", "swtpc8212_device", "tanodr64", "technica", "telstrat", "tk3000", "trs80", "trs80l2", "ubpnic", "uniap2en", "uniap2pt", "uniap2ti", "upd7220", "vic1515", "vic1520", "videnh2", "votraxtnt", "votrsc01a", "wd1002a_wx1", "wd90c90_jk", "wdxt_gen", "wyse700", "xetec_c5181", "xtide", "ym2413", "ym2608", "zijini", "zip100_ide", "zxbus_neogs"
)

$destDir = Join-Path $PSScriptRoot "public\roms"
$tempDir = Join-Path $PSScriptRoot "temp_roms"

if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
if (!(Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

Write-Host "AmpleWeb ROM Downloader (Ultra-Comprehensive)" -ForegroundColor Cyan
Write-Host "Destination: $destDir"
Write-Host "Total ROMs to check: $($roms.Count)"
Write-Host "----------------------------------"

$total = $roms.Count
$index = 0

foreach ($rom in $roms) {
    $index++
    $destZip = Join-Path $destDir "$rom.zip"
    
    if (Test-Path $destZip) {
        # Write-Host "[$index / $total] Skipping $rom (already exists)" -ForegroundColor DarkGray
        continue
    }

    Write-Host "[$index / $total] Downloading ROM: $rom ..." -NoNewline

    $romUrl = "https://github.com/vitas/mdk/raw/master/roms/$rom.7z"
    $temp7z = Join-Path $tempDir "$rom.7z"

    try {
        Invoke-WebRequest -Uri $romUrl -OutFile $temp7z -ErrorAction Stop
        
        # Extract .7z and re-zip as .zip
        $extractDir = Join-Path $tempDir $rom
        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        New-Item -ItemType Directory -Path $extractDir | Out-Null
        
        & "7z.exe" x $temp7z "-o$extractDir" -y | Out-Null
        
        # Compress to .zip
        & "7z.exe" a -tzip $destZip "$extractDir\*" | Out-Null
        
        $size = (Get-Item $destZip).Length / 1KB
        Write-Host " [OK] ($size KB)" -ForegroundColor Green
        
        # Cleanup
        Remove-Item $temp7z -Force
        Remove-Item $extractDir -Recurse -Force
    } catch {
        Write-Host " [NOT FOUND]" -ForegroundColor Yellow
    }
}

Write-Host "----------------------------------"
Write-Host "Done!" -ForegroundColor Cyan
