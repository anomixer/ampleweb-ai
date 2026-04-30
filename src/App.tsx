import React, { useState, useEffect, useRef, useCallback } from 'react'
import { dataManager, type ModelEntry, type MachineConfig } from './core/data_manager'
import {
  loadMameWasm,
  buildMameArgs,
  fetchRom,
  type MameWasmModule,
  type RomFile,
  type MediaFile,
} from './core/wasm_loader'
import { useStore } from './core/store'

/**
 * Emulator type → WASM file info.
 * Maps Ample's emulator values to the correct WASM file and MAME driver.
 */
const EMULATOR_WASM_MAP: Record<string, { wasm: string; js: string; driver: string }> = {
  // Dedicated emularity builds (each WASM = one emularity config)
  apple2e:    { wasm: 'apple2e.wasm',   js: 'apple2e.js',     driver: 'apple2e' },
  mac128:     { wasm: 'mac128.wasm',    js: 'mac128.js',      driver: 'mac128k' },
  maciici:    { wasm: 'maciici.wasm',   js: 'maciici.js',     driver: 'maciici' },
  mc10:       { wasm: 'mc10.wasm',      js: 'mc10.js',        driver: 'mc10' },
  // MAME-wrapped builds (full MAME with specific driver)
  mameapple2: { wasm: 'mameapple2.wasm', js: 'mameapple2.js',  driver: 'apple2' },
  mameapple2e: { wasm: 'mameapple2e.wasm', js: 'mameapple2e.js', driver: 'apple2e' },
  apple2gs:   { wasm: 'apple2gs.wasm',  js: 'apple2gs.js',    driver: 'apple2gs' },
  apple3:     { wasm: 'apple3.wasm',    js: 'apple3.js',      driver: 'apple3' },
  mac:        { wasm: 'mac.wasm',       js: 'mac.js',         driver: 'mac' },
  coco:       { wasm: 'coco.wasm',      js: 'coco.js',        driver: 'coco' },
  coco3:      { wasm: 'coco3.wasm',     js: 'coco3.js',       driver: 'coco3' },
  trs80:      { wasm: 'trs80.wasm',     js: 'trs80.js',       driver: 'trs80l2' },
  // NOTE: st WASM is Stadium Hero (arcade), NOT Atari ST. No Atari ST support.
  // NOTE: mac128.wasm only supports mac128k + macplus + macse drivers (per emularity config).
  c64:        { wasm: 'c64.wasm',       js: 'c64.js',         driver: 'c64' },
}

/**
 * Machine name → MAME driver name mapping.
 * mac128.wasm supports: mac128k, macplus, macse.
 * maciici.wasm supports: maciici.
 * mac.wasm supports: ALL Mac variants (macii, maciix, maciicx, maciisi, maciivx, maciivi, macqd*, maclc*, macpb*, macpd*, macclasc, macclas2, maccclas, mactv, macct6, macxl, macprtb).
 */
const DRIVER_MAP: Record<string, string> = {
  mac128k: 'mac128k',
  mac512k: 'mac128k',
  mac512ke: 'mac128k',
  macplus: 'macplus',
  macse: 'macse',
  macsefd: 'macse',
  macse30: 'macse30',
  macxl: 'mac',
  // Mac II family → mac.wasm
  macii: 'macii',
  maciihmu: 'macii',
  mac2fdhd: 'macii',
  maciix: 'maciix',
  maciifx: 'maciifx',
  maciicx: 'macii',
  maciisi: 'maciisi',
  maciivx: 'maciivx',
  maciivi: 'maciivi',
  // Mac Quadra → mac.wasm
  macqd605: 'macqd605',
  macqd610: 'macqd610',
  macqd630: 'macqd630',
  macqd650: 'macqd650',
  macqd700: 'macqd700',
  macqd800: 'macqd800',
  macqd900: 'macqd900',
  macqd950: 'macqd950',
  // Mac LC/Performa → mac.wasm
  maclc: 'maclc',
  maclc2: 'maclc2',
  maclc3: 'maclc3',
  maclc3p: 'maclc3',
  maclc475: 'maclc',
  maclc520: 'maclc520',
  maclc550: 'maclc520',
  maclc575: 'maclc520',
  maclc580: 'maclc520',
  macct610: 'macqd610',
  macct650: 'macqd650',
  mactv: 'mactv',
  // Mac Portable → mac.wasm
  macprtb: 'macprtb',
  macpb100: 'macpb100',
  macpb140: 'macpb140',
  macpb145: 'macpb140',
  macpb145b: 'macpb140',
  macpb160: 'macpb160',
  macpb165: 'macpb160',
  macpb165c: 'macpb160',
  macpb170: 'macpb140',
  macpb180: 'macpb160',
  macpb180c: 'macpb180c',
  // Mac Duo → mac.wasm
  macpd210: 'macpd210',
  macpd230: 'macpd210',
  macpd250: 'macpd210',
  macpd270c: 'macpd270c',
  macpd280: 'macpd280',
  macpd280c: 'macpd280',
  // Mac Classic → mac.wasm
  macclasc: 'macclasc',
  macclas2: 'macclas2',
  maccclas: 'maccclas',
  // apple2c* variants
  apple2c: 'apple2c',
  apple2c0: 'apple2c',
  apple2c3: 'apple2c',
  apple2cp: 'apple2c',
}


/** Lightweight file existence check (synchronous, checks browser cache). */
const _wasmCache: Record<string, boolean> = {}
function _wasmExists(filename: string): boolean {
  const url = `/wasm/${filename}`
  if (!(url in _wasmCache)) {
    _wasmCache[url] = false
    fetch(url, { method: 'HEAD' })
      .then(r => { _wasmCache[url] = r.ok })
      .catch(() => { _wasmCache[url] = false })
  }
  return _wasmCache[url]
}

/**
 * Get the WASM info for an emulator type, falling back to available.
 */
function getWasmForEmulator(emulator: string, _machineName: string): { wasm: string; js: string; driver: string } | null {
  // Direct match from EMULATOR_WASM_MAP
  const info = EMULATOR_WASM_MAP[emulator]
  if (info) return info
  return null
}

type LaunchState = 'idle' | 'fetching-rom' | 'loading-wasm' | 'running' | 'error'

interface LogLine {
  text: string
  isError: boolean
  ts: number
}

/**
 * Driver name → ROM ZIP filename mapping.
 * MAME needs the correct BIOS ROM for each driver.
 */
const DRIVER_ROM_MAP: Record<string, string> = {
  // Apple IIe variants
  apple2e: 'apple2e.zip',
  apple2ee: 'apple2ee.zip',
  apple2eeuk: 'apple2eeuk.zip',
  apple2eede: 'apple2eede.zip',
  apple2eese: 'apple2eese.zip',
  apple2eefr: 'apple2eefr.zip',
  apple2ep: 'apple2ep.zip',
  apple2euk: 'apple2euk.zip',
  apple2ede: 'apple2ede.zip',
  apple2ese: 'apple2ese.zip',
  apple2efr: 'apple2efr.zip',
  apple2ees: 'apple2ees.zip',
  // Apple IIc variants
  apple2c: 'apple2c.zip',
  apple2c0: 'apple2c0.zip',
  apple2c1: 'apple2c1.zip',
  apple2c2: 'apple2c2.zip',
  apple2c3: 'apple2c3.zip',
  apple2c4: 'apple2c4.zip',
  apple2cp: 'apple2cp.zip',
  apple2cm: 'apple2cm.zip',
  apple2che: 'apple2che.zip',
  // Apple IIgs
  apple2gs: 'apple2gs.zip',
  apple2gsr0: 'apple2gsr0.zip',
  apple2gsr1: 'apple2gsr1.zip',
  // Apple III
  apple3: 'apple3.zip',
  // Mac variants
  mac128k: 'mac128k.zip',
  mac512k: 'mac512k.zip',
  mac512ke: 'mac512ke.zip',
  macplus: 'macplus.zip',
  macse: 'macse.zip',
  macsefd: 'macsefd.zip',
  maciici: 'maciici.zip',
  macii: 'macii.zip',
  maciihmu: 'maciihmu.zip',
  maciix: 'maciix.zip',
  maciifx: 'maciifx.zip',
  maciicx: 'maciicx.zip',
  maciisi: 'maciisi.zip',
  maciivx: 'maciivx.zip',
  maciivi: 'maciivi.zip',
  macqd605: 'macqd605.zip',
  macqd610: 'macqd610.zip',
  macqd630: 'macqd630.zip',
  macqd650: 'macqd650.zip',
  macqd700: 'macqd700.zip',
  macqd800: 'macqd800.zip',
  macqd900: 'macqd900.zip',
  macqd950: 'macqd950.zip',
  maclc: 'maclc.zip',
  maclc2: 'maclc2.zip',
  maclc3: 'maclc3.zip',
  maclc3p: 'maclc3p.zip',
  maclc520: 'maclc520.zip',
  macpb100: 'macpb100.zip',
  macpb140: 'macpb140.zip',
  macpb160: 'macpb160.zip',
  macpb180c: 'macpb180c.zip',
  macpd210: 'macpd210.zip',
  macpd270c: 'macpd270c.zip',
  macpd280: 'macpd280.zip',
  macclasc: 'macclasc.zip',
  macclas2: 'macclas2.zip',
  maccclas: 'maccclas.zip',
  mactv: 'mactv.zip',
  macse30: 'macse30.zip',
  // Other emulators
  c64c: 'c64c.zip',
  c64: 'c64.zip',
  coco: 'coco.zip',
  cocoh: 'coco.zip',
  coco2b: 'coco.zip',
  coco2bh: 'coco.zip',
  coco3: 'coco3.zip',
  coco3p: 'coco3p.zip',
  coco3h: 'coco3h.zip',
  trs80: 'trs80.zip',
  trs80l2: 'trs80l2.zip',
  mc10: 'mc10.zip',
  apple2: 'apple2.zip',
  apple2p: 'apple2.zip',
  apple2jp: 'apple2.zip',
  // Special: IIgs needs files from apple2c set too (e.g. disk II ROMs)
  apple2gs_shared: 'apple2gs.zip;apple2c.zip',
}

/**
 * Default resolution per emulator type.
 * Each emularity WASM has a native resolution from its config.
 * For MAME-wrapped builds, these are used as -resolution flags.
 */
const DEFAULT_RESOLUTIONS: Record<string, string> = {
  mameapple2: '560x384',
  mameapple2e: '560x384',
  apple2e: '560x384',
  apple2gs: '704x462',
  apple3: '560x384',
  mac128: '512x342',
  maciici: '640x480',
  mac: '640x480',
  coco: '320x240',
  coco3: '640x480',
  trs80: '384x192',
  c64: '384x272',
  mc10: '372x243',
}

function App() {
  const { theme, toggleTheme } = useStore()
  const [models, setModels] = useState<ModelEntry[]>([])
  const [selectedMachine, setSelectedMachine] = useState<{ name: string; description: string } | null>(null)
  const [machineConfig, setMachineConfig] = useState<MachineConfig | null>(null)
  const [slotValues, setSlotValues] = useState<Record<string, string>>({})
  const [wasmModule, setWasmModule] = useState<MameWasmModule | null>(null)
  const [launchState, setLaunchState] = useState<LaunchState>('idle')
  const [wasmProgress, setWasmProgress] = useState(0)
  const [statusText, setStatusText] = useState('')
  const [errorText, setErrorText] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [logs, setLogs] = useState<LogLine[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [search, setSearch] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [isSidebarResizing, setIsSidebarResizing] = useState(false)
  const [configWidth, setConfigWidth] = useState(450)
  const [isConfigResizing, setIsConfigResizing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [romSettings, setRomSettings] = useState({ autoDownload: false, downloadServers: [] as string[] })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [configTab, setConfigTab] = useState<'slots' | 'media' | 'logs'>('slots')
  const [mediaFiles, setMediaFiles] = useState<Record<string, File | null>>({})
  const logEndRef = useRef<HTMLDivElement>(null)
  const hasAutoLaunched = useRef(false)

  // Detect available WASM on mount (legacy display only)
  const [wasmTarget] = useState(() => {
    for (const [emu, info] of Object.entries(EMULATOR_WASM_MAP)) {
      if (_wasmExists(info.wasm)) return emu
    }
    return 'none'
  })





  // ── Sidebar resize ──
  useEffect(() => {
    if (!isSidebarResizing) return
    const onMove = (e: MouseEvent) => {
      const w = Math.max(200, Math.min(500, e.clientX))
      setSidebarWidth(w)
    }
    const onUp = () => setIsSidebarResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isSidebarResizing])

  // ── Config area resize ──
  useEffect(() => {
    if (!isConfigResizing) return
    const onMove = (e: MouseEvent) => {
      // config width from right edge of viewport
      const rightEdge = window.innerWidth - e.clientX
      const w = Math.max(200, Math.min(800, rightEdge))
      setConfigWidth(w)
    }
    const onUp = () => setIsConfigResizing(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isConfigResizing])

  const addLog = useCallback((text: string, isError: boolean) => {
    setLogs(prev => {
      const next = [...prev, { text, isError, ts: Date.now() }]
      return next.length > 500 ? next.slice(next.length - 500) : next
    })
  }, [])

  const fillSlotDefaults = useCallback((slots: Slot[], currentValues: Record<string, string>, devices?: Device[], parentPath = '') => {
    const next = { ...currentValues }
    const walk = (sList: Slot[], pathPrefix = '') => {
      if (!Array.isArray(sList)) return
      sList.forEach(s => {
        let fullPath = s.name
        if (pathPrefix) {
          fullPath = s.name.startsWith(':') ? `${pathPrefix}${s.name}` : `${pathPrefix}:${s.name}`
        }
        
        let val = next[fullPath]
        const option = s.options?.find(o => o.value === val) || s.options?.find(o => o.default)
        if (option) {
          next[fullPath] = option.value
          const nextPrefix = `${fullPath}:${option.value}`
          if (Array.isArray(option.slots)) walk(option.slots, nextPrefix)
          if (option.devname && devices) {
            const dev = devices.find(d => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) walk(dev.slots, nextPrefix)
          }
        }
      })
    }
    walk(slots, parentPath)
    return next
  }, [])

  const doSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    setSelectedMachine(machine)
    setErrorText(null)
    setStatusText('')
    setLaunchState('idle')
    const config = await dataManager.loadMachine(machine.name)
    setMachineConfig(config)
    if (config) {
      const defaults = fillSlotDefaults(config.slots, {}, config.devices)
      setSlotValues(defaults)
    }
  }, [fillSlotDefaults])

  const handleSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    doSelectMachine(machine)
  }, [doSelectMachine])

  /**
   * Fetch all required ROM ZIP files for a driver.
   */
  const fetchAllRoms = useCallback(async (driverName: string): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — look up from DRIVER_ROM_MAP
    const romFile = DRIVER_ROM_MAP[driverName]
    const rawMapValue = DRIVER_ROM_MAP[driverName] || (driverName.startsWith('apple2gs') ? DRIVER_ROM_MAP['apple2gs_shared'] : null)
    const romFilesToFetch = rawMapValue ? rawMapValue.split(';') : [driverName + '.zip']

    for (const romFile of romFilesToFetch) {
      try {
        const url = `/roms/${romFile}`
        // fetchRom(url, driver, filename?)
        const rom = await fetchRom(url, driverName, romFile)
        
        // TorrentZip check
        if (rom.data.length >= 48) {
          const raw = rom.data
          const end = raw.length
          const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
          if (view.getUint32(end - 4, true) === 0x506b0708) {
            const cleaned = new Uint8Array(end - 40)
            cleaned.set(raw.subarray(0, end - 40))
            rom.data = cleaned
          }
        }
        romFiles.push(rom)
        addLog(`ROM: ${romFile} (${(rom.data.length / 1024).toFixed(0)} KB)`, false)
      } catch {
        addLog(`ROM not found: ${romFile}`, true)
      }
    }

    // 2. Auxiliary ROMs for Apple II family (apple2, apple2p, apple2e*)
    // MAME needs sc01a.bin (votrax), 341-0027-a.p5 (a2diskiing), 341-0028-a.rom (d2fdc)
    // These are separate ROM sets. MAME identifies ROM sets by the ZIP filename.
    // MAME looks for a ZIP containing a file with the ROM set name (e.g., "votrax")
    // We need to create a ZIP with the file named after the ROM set, not the original filename.
    const auxRoms: Array<{ romSet: string; zipName: string; files: string[] }> = [
      { romSet: 'votrax', zipName: 'votrsc01a', files: ['sc01a.bin'] },
      { romSet: 'a2diskiing', zipName: 'a2diskiing', files: ['341-0027-a.p5'] },
      { romSet: 'd2fdc', zipName: 'd2fdc', files: ['341-0028-a.rom'] },
    ]
    if (driverName.startsWith('apple2') || driverName === 'apple2p') {
      for (const aux of auxRoms) {
        try {
          const resp = await fetch(`/roms/${aux.zipName}.zip`)
          if (resp.ok) {
            const data = new Uint8Array(await resp.arrayBuffer())
            // Directly push the ZIP with the expected MAME name (romSet)
            romFiles.push({ 
              driver: aux.romSet, 
              name: `${aux.romSet}.zip`, 
              data 
            })
            addLog(`Aux: ${aux.romSet}.zip added`, false)
          }
        } catch {
          addLog(`Aux ROM skipped (optional): ${aux.zipName}.zip`, false)
        }
      }
    }

    return romFiles
  }, [addLog])

  /**
   * Determine which emulator type a machine belongs to.
   * Maps machine driver names to emulator WASM files.
   */
  function getEmulatorForMachine(machineName: string): string | null {
    // apple2gs* → apple2gs
    if (machineName.startsWith('apple2gs')) return 'apple2gs'
    // apple2c* → mameapple2e (mameapple2e.wasm now available in emularity-engine)
    if (machineName.startsWith('apple2c')) return 'mameapple2e'
    // apple2e* variants → apple2e (all Apple IIe variants share the apple2e WASM)
    if (machineName.startsWith('apple2e')) return 'apple2e'
    // apple2woz* → apple2e (uses apple2e.wasm)
    if (machineName.startsWith('apple2woz')) return 'apple2e'
    // apple2p*, apple2*, apple2jp* → mameapple2 (apple2, apple2p, apple2jp all share mameapple2.wasm)
    if (machineName.startsWith('apple2p') || machineName.startsWith('apple2') || machineName.startsWith('apple2jp')) return 'mameapple2'
    // apple3* → apple3
    if (machineName.startsWith('apple3')) return 'apple3'
    // maciici* → maciici (dedicated WASM)
    if (machineName.startsWith('maciici')) return 'maciici'
    // mac128*, mac512* → mac128 (dedicated WASM)
    if (machineName.startsWith('mac128') || machineName.startsWith('mac512')) return 'mac128'
    // mac* → mac for unsupported models (mac.wasm = full MAME Mac build)
    if (machineName.startsWith('mac')) {
      // macplus, macse, macsefd → mac128.wasm (per emularity config)
      // macse30 uses 68030 and belongs to mac.wasm
      if (machineName.startsWith('macplus') || machineName === 'macse' || machineName === 'macsefd') return 'mac128'
      // All other mac* variants → mac.wasm (full MAME Mac build)
      return 'mac'
    }
    // coco* → coco (Coco 1/2), coco3* → coco3
    if (machineName.startsWith('coco3')) return 'coco3'
    if (machineName.startsWith('coco')) return 'coco'
    // trs80* → trs80
    if (machineName.startsWith('trs80')) return 'trs80'
    // c64* → c64
    if (machineName.startsWith('c64')) return 'c64'
    // mc10 → mc10
    if (machineName.startsWith('mc10')) return 'mc10'
    // st* → no emularity WASM for Atari ST (st.wasm is Stadium Hero arcade)
    // if (machineName.startsWith('st')) return 'st'
    // apple1, apple2 → apple2e (fallback)
    if (machineName.startsWith('apple')) return 'apple2e'
    return null
  }

  /**
   * Calculate effective media drives based on current machine config and slot selections.
   */
  const getEffectiveMedia = useCallback(() => {
    if (!machineConfig) return {}
    
    const counts: Record<string, number> = {}
    const typeMap: Record<string, string> = {
      'floppy_5_25': 'flop',
      'floppy_3_5': 'flop',
      'hard': 'hard',
      'cdrom': 'cdrom',
      'cass': 'cass',
      'cassette': 'cass'
    }

    // Include root media
    Object.entries(machineConfig.media).forEach(([mameType, count]) => {
      const brief = typeMap[mameType] || mameType
      counts[brief] = (counts[brief] || 0) + count
    })

    const collectMedia = (slots: Slot[], pathPrefix = '') => {
      if (!Array.isArray(slots)) return
      slots.forEach(slot => {
        let fullPath = slot.name
        if (pathPrefix) {
          fullPath = slot.name.startsWith(':') ? `${pathPrefix}${slot.name}` : `${pathPrefix}:${slot.name}`
        }
        
        const selectedValue = slotValues[fullPath]
        if (!selectedValue) return
        
        const option = slot.options?.find(o => o.value === selectedValue)
        if (option) {
          if (option.media) {
            Object.entries(option.media).forEach(([mameType, count]) => {
              const brief = typeMap[mameType] || mameType
              counts[brief] = (counts[brief] || 0) + count
            })
          }
          const nextPath = `${fullPath}:${selectedValue}`
          if (Array.isArray(option.slots)) {
            collectMedia(option.slots, nextPath)
          }
          if (option.devname && machineConfig.devices) {
            const dev = machineConfig.devices.find(d => d.name === option.devname)
            if (dev && Array.isArray(dev.slots)) {
              collectMedia(dev.slots, nextPath)
            }
          }
        }
      })
    }
    
    collectMedia(machineConfig.slots)
    return counts
  }, [machineConfig, slotValues])

  /**
   * Main launch sequence:
   * 1. determine emulator type from machine
   * 2. fetch ROM ZIP files
   * 3. load the correct WASM (per-emulator)
   * 4. preRun writes ZIPs to VFS → MAME auto-starts
   */
  const doLaunch = useCallback(async (
    machine: { name: string; description: string }, 
    slotsParam?: Record<string, string>,
    mediaParam?: Record<string, File | null>
  ) => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)

    // Clear old canvas if it exists
    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = ''
    }

    // Step 0: determine emulator type
    const emulator = getEmulatorForMachine(machine.name)
    if (!emulator) {
      setErrorText(`No emulator support for machine: ${machine.name}`)
      setLaunchState('error')
      addLog(`Error: no emulator for ${machine.name}`, true)
      return
    }

    const wasmInfo = getWasmForEmulator(emulator, machine.name)
    if (!wasmInfo) {
      setErrorText(`No WASM file available for ${emulator}.\nPlace ${emulator}.wasm or ${machine.name}.wasm in public/wasm/`)
      setLaunchState('error')
      addLog(`Error: no WASM for ${emulator} / ${machine.name}`, true)
      return
    }

    // Step 1: fetch ROMs
    setLaunchState('fetching-rom')
    setStatusText('Fetching ROM...')

    let romFiles: RomFile[] = []
    try {
      romFiles = await fetchAllRoms(machine.name)
    } catch (e) {
      addLog(`ROM fetch failed: ${e}`, true)
    }

    // Step 2: load WASM
    setLaunchState('loading-wasm')
    const wasmUrl = `/wasm/${wasmInfo.wasm}`
    addLog(`Using /wasm/${wasmInfo.wasm} (emulator: ${emulator}, driver: ${wasmInfo.driver})`, false)

    // Use emulator-appropriate resolution
    const resolution = DEFAULT_RESOLUTIONS[emulator] ?? '640x480'
    // Resolve MAME driver name (e.g. mac128k → mac)
    const mameDriver = DRIVER_MAP[machine.name] ?? wasmInfo.driver

    // 3. Prepare media files
    const finalMedia = mediaParam ?? mediaFiles
    const mediaList: MediaFile[] = []
    for (const [id, file] of Object.entries(finalMedia)) {
      if (file) {
        try {
          const data = await readFileAsArrayBuffer(file)
          mediaList.push({
            name: file.name,
            data,
            type: id, // e.g. "flop1"
          })
        } catch (e) {
          console.error(`Failed to read media file ${file.name}:`, e)
        }
      }
    }

    // 4. Build MAME args
    const finalSlots = slotsParam ?? slotValues
    
    const args = buildMameArgs(mameDriver, {
      slots: finalSlots,
      extraArgs: [
        '-verbose',
        '-resolution', resolution,
        '-rompath', '/roms',
        ...(mediaList.map(m => [`-${m.type}`, `/media/${m.name}`]).flat())
      ]
    })
    addLog(`args: ${args.join(' ')}`, false)

    try {
      const mod = await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles,
        mediaFiles: mediaList,
        romPath: '/roms',
        jsUrl: `/wasm/${wasmInfo.js}`,
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading... ${pct}%`)
          }
        },
        onError: (err) => {
          let msg = err
          if (err.includes('Failed to fetch') || err.includes('404')) {
            msg += `\nPlace the correct WASM in public/wasm/`
          }
          setErrorText(msg)
          setLaunchState('error')
          addLog(`Error: ${msg}`, true)
        },
        onLog: addLog,
        onReady: (m) => {
          setWasmModule(m)
          setLaunchState('running')
          setStatusText('')

          requestAnimationFrame(() => {
            const c = document.getElementById('canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
              c.style.display = ''
            }
          })
        },
      })
      setWasmModule(mod)
    } catch (e: any) {
      const msg = e.message || String(e)
      setErrorText(msg)
      setLaunchState('error')
      addLog(`Fatal: ${msg}`, true)
    }
  }, [wasmTarget, addLog, fetchAllRoms, mediaFiles, slotValues])

  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return

    // If already running, refresh the whole page to ensure a clean state
    if (wasmModule) {
      const url = new URL(window.location.href)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)
      url.searchParams.set('launch', '1')
      window.location.href = url.toString()
      return
    }

    doLaunch(selectedMachine)
  }, [selectedMachine, wasmModule, doLaunch])

  useEffect(() => {
    const init = async () => {
      const data = await dataManager.loadModels()
      setModels(data)
      
      // Restore selection from URL
      const params = new URLSearchParams(window.location.search)
      const m = params.get('m')
      const d = params.get('d')
      
      let machineToLaunch: { name: string; description: string } | null = null
      if (m && d) {
        machineToLaunch = { name: m, description: d }
        // Restore machine config and slots
        const config = await dataManager.loadMachine(machineToLaunch.name)
        setMachineConfig(config)
        let slots: Record<string, string> = {}
        const slotsParam = params.get('s')
        if (slotsParam) {
          try {
            slotsParam.split(',').forEach(p => {
              const [k, v] = p.split(':')
              if (k && v) slots[k] = v
            })
          } catch {}
        }

        if (config) {
          slots = fillSlotDefaults(config.slots, slots, config.devices)
          setSlotValues(slots)
        }
        setSelectedMachine(machineToLaunch)
        
        // 2. Auto-expand tree to show selected machine
        const path: string[] = []
        const findPath = (nodes: ModelEntry[], target: string, ancestors: string[]): boolean => {
          for (const node of nodes) {
            const id = `${node.description}${node.value ?? ''}`
            const isMatch = node.value?.trim() === target.trim()
            const hasChildren = !!(node.children && node.children.length > 0)

            if (isMatch && !hasChildren) {
              path.push(...ancestors)
              return true
            }
            
            if (hasChildren) {
              if (findPath(node.children!, target, [...ancestors, id])) {
                return true
              }
              // If we didn't find it in children but the parent matches, we can fall back to it
              if (isMatch) {
                path.push(...ancestors)
                return true
              }
            }
          }
          return false
        }
        
        if (findPath(data, m, [])) {
          setExpandedNodes(prev => new Set([...prev, ...path]))
        }

        // 3. Restore media from IndexedDB
        let restoredMedia: Record<string, File | null> = {}
        const mediaParam = params.get('media')
        if (mediaParam) {
          const pairs = mediaParam.split(',')
          for (const p of pairs) {
            const [id, name] = p.split(':')
            if (id && name) {
              const file = await dataManager.loadMedia(id)
              if (file) restoredMedia[id] = file
            }
          }
          setMediaFiles(restoredMedia)
        }

        // 4. Trigger launch logic
        if (params.get('launch') === '1' && !hasAutoLaunched.current) {
          hasAutoLaunched.current = true
          const newUrl = new URL(window.location.href)
          newUrl.searchParams.delete('launch')
          window.history.replaceState({}, '', newUrl.toString())
          doLaunch(machineToLaunch, slots, restoredMedia)
        }
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Mount only

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  // Sync selection to URL (without reloading)
  useEffect(() => {
    if (selectedMachine) {
      const url = new URL(window.location.href)
      url.searchParams.set('m', selectedMachine.name)
      url.searchParams.set('d', selectedMachine.description)
      
      // Sync slots
      const slotStrings = Object.entries(slotValues)
        .filter(([_, v]) => !!v)
        .map(([k, v]) => `${k}:${v}`)
        .join(',')
      if (slotStrings) url.searchParams.set('s', slotStrings)
      else url.searchParams.delete('s')

      // Sync media filenames
      const mediaStrings = Object.entries(mediaFiles)
        .filter(([_, f]) => !!f)
        .map(([k, f]) => `${k}:${f!.name}`)
        .join(',')
      if (mediaStrings) url.searchParams.set('media', mediaStrings)
      else url.searchParams.delete('media')

      window.history.replaceState({}, '', url.toString())
    }
  }, [selectedMachine, slotValues, mediaFiles])

  /**
   * Test launch — no ROMs, just load the WASM runtime.
   */
  const handleTestLaunch = useCallback(async () => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)
    setLaunchState('loading-wasm')

    // Use apple2e for test
    const wasmInfo = getWasmForEmulator('apple2e')
    if (!wasmInfo) {
      setErrorText('No WASM file available')
      setLaunchState('error')
      return
    }

    const wasmUrl = `/wasm/${wasmInfo.wasm}`
    addLog(`Test: /wasm/${wasmInfo.wasm}`, false)

    const args = buildMameArgs('apple2e', {
      video: 'soft',
      resolution: '640x480',
      extraArgs: ['-verbose'],
    })

    try {
      await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles: [],
        jsUrl: `/wasm/${wasmInfo.js}`,
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading... ${pct}%`)
          }
        },
        onError: (err) => {
          addLog(`Error: ${err}`, true)
          setLaunchState('error')
        },
        onLog: addLog,
        onReady: (mod) => {
          setWasmModule(mod)
          setLaunchState('running')
          requestAnimationFrame(() => {
            const c = document.getElementById('canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
              c.style.display = ''
            }
          })
        },
      })
    } catch (e: any) {
      setErrorText(e.message || String(e))
      setLaunchState('error')
      addLog(`Fatal: ${e}`, true)
    }
  }, [wasmTarget, addLog])

  /**
   * Strip TorrentZip footer (40 bytes: 36-byte SHA256 + PK\x07\x08 sig)
   * so MAME's ZIP parser can read the file.
   */
  const stripTorrentZip = (data: Uint8Array): Uint8Array => {
    if (data.length < 48) return data
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
    const end = data.length
    if (view.getUint32(end - 4, true) === 0x506b0708) {
      const cleaned = new Uint8Array(end - 40)
      cleaned.set(data.subarray(0, end - 40))
      return cleaned
    }
    return data
  }

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const isLoading = launchState === 'fetching-rom' || launchState === 'loading-wasm'

  return (
    <div className={`app ${theme}`}>
      {/* ── Left Sidebar ── */}
      <div className="sidebar" style={{ width: sidebarWidth, flexShrink: 0, minWidth: '200px' }}>
        <div className="sidebar-header">
          <div className="sidebar-title">
            <span className="sidebar-logo">🍎</span>
            <span>AmpleWeb</span>
          </div>
          <button className="theme-btn" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>

        <div className="search-box-wrap">
          <input
            className="search-box"
            placeholder="Search machines..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="machine-tree-container">
          <MachineTree
            models={models}
            expanded={expandedNodes}
            selected={selectedMachine}
            onToggle={toggleNode}
            onSelect={handleSelectMachine}
            filter={search.toLowerCase()}
          />
        </div>

        {/* ROM Settings Panel */}
        {showSettings && (
          <div className="settings-panel">
            <div className="section-heading">
              <span>🌐 ROM Download Settings</span>
              <button className="log-btn" onClick={() => setShowSettings(false)}>✕</button>
            </div>
            <div className="settings-section">
              <label className="settings-label">Auto-download missing ROMs</label>
              <label className="settings-toggle-wrap">
                <input
                  type="checkbox"
                  checked={romSettings.autoDownload}
                  onChange={e => setRomSettings(s => ({ ...s, autoDownload: e.target.checked }))}
                />
                <span className="settings-toggle-track" />
              </label>
              <p className="settings-hint">
                When enabled, missing ROMs will be downloaded from configured servers and cached in IndexedDB.
              </p>
            </div>
            <div className="settings-section">
              <label className="settings-label">Download Servers (one per line, {`{filename}`} = filename)</label>
              <textarea
                className="settings-textarea"
                rows={6}
                value={romSettings.downloadServers.join('\n')}
                onChange={e => setRomSettings(s => ({ ...s, downloadServers: e.target.value.split('\n').filter(Boolean) }))}
                placeholder="https://example.com/{filename}"
              />
              <p className="settings-hint">
                Servers are tried in order. Add custom servers below.
              </p>
            </div>
            <div className="settings-section">
              <button
                className="btn btn-secondary"
                style={{ width: '100%' }}
                onClick={() => {
                  const url = prompt('Enter server URL (use {filename} as placeholder):')
                  if (url && !romSettings.downloadServers.includes(url)) {
                    setRomSettings(s => ({ ...s, downloadServers: [...s.downloadServers, url] }))
                  }
                }}
              >
                + Add Server
              </button>
            </div>
          </div>
        )}

        <div className="sidebar-footer">
          {wasmTarget && (
            <code style={{ fontSize: '9px', opacity: 0.6 }}>
              wasm:{wasmTarget}
            </code>
          )}
          {models.length > 0 && ` · ${models.length} groups`}
          <button className="theme-btn" onClick={() => setShowSettings(v => !v)} title="ROM Settings" style={{ marginLeft: 'auto' }}>
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Sidebar Resize Handle ── */}
      <div
        className={`resize-handle ${isSidebarResizing ? 'active' : ''}`}
        onMouseDown={() => setIsSidebarResizing(true)}
      />

      {/* ── Right Main Panel ── */}
      <div className="main" style={{ minWidth: 0 }}>
        {selectedMachine ? (
          <div className="machine-panel">
            {/* Machine header */}
            <div className="machine-header">
              <div>
                <h2 className="machine-title">{selectedMachine.description}</h2>
                <code className="machine-id">{selectedMachine.name}</code>
              </div>
              <div className="header-badges">
                {launchState === 'running' && (
                  <span className="badge badge-running">● Running</span>
                )}
                {launchState === 'error' && (
                  <span className="badge badge-error">● Error</span>
                )}
              </div>
            </div>

            {/* Progress bar (top of panel, before layout split) */}
            {isLoading && (
              <div className="progress-wrap">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${wasmProgress}%` }} />
                </div>
                <span className="progress-label">{statusText}</span>
              </div>
            )}

            {/* Error banner */}
            {errorText && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <pre>{errorText}</pre>
              </div>
            )}

            {/* Content row: emulator + config side by side */}
            <div className="content-row">
              {/* Left: emulator canvas */}
              <div className="emulator-area">
                <div className={`emulator-container ${launchState === 'running' ? 'active' : ''}`}>
                  <div
                    ref={canvasContainerRef}
                    style={{
                      width: '100%',
                      height: '100%',
                      display: launchState === 'running' ? 'flex' : 'none',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />

                  {launchState !== 'running' && (
                    <div className="emulator-placeholder">
                      {launchState === 'idle' && (
                        <div className="welcome-inner">
                          <div className="welcome-badge">MAME {selectedMachine.name}</div>
                          <p>Press Launch to start emulation</p>
                        </div>
                      )}
                      {isLoading && (
                        <div className="loading-indicator">
                          <div className="spinner" />
                          <p>{statusText}</p>
                        </div>
                      )}
                      {launchState === 'error' && (
                        <div className="error-state">
                          <span className="error-icon">❌</span>
                          <p>Emulation failed</p>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfigTab('logs')}>View Log</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Config Resize Handle ── */}
              <div
                className={`resize-handle ${isConfigResizing ? 'active' : ''}`}
                onMouseDown={() => setIsConfigResizing(true)}
              />

              {/* Config area */}
              <div className="config-area" style={{ width: configWidth ?? 450 }}>
                <div className="tab-header">
                  <button 
                    className={`tab-btn ${configTab === 'slots' ? 'active' : ''}`}
                    onClick={() => setConfigTab('slots')}
                  >
                    Slots
                  </button>
                  <button 
                    className={`tab-btn ${configTab === 'media' ? 'active' : ''}`}
                    onClick={() => setConfigTab('media')}
                  >
                    Media
                  </button>
                  <button 
                    className={`tab-btn ${configTab === 'logs' ? 'active' : ''}`}
                    onClick={() => setConfigTab('logs')}
                  >
                    Logs
                  </button>
                </div>

                <div className="tab-content">
                  {configTab === 'slots' && (
                    <div className="section no-border">
                      {machineConfig ? (
                        <div className="slot-grid">
                          {(() => {
                            const renderSlots = (sList: Slot[], depth = 0, pathPrefix = '') => {
                              if (!Array.isArray(sList)) return null
                              return sList.map((slot, idx) => {
                                let fullPath = slot.name
                                if (pathPrefix) {
                                  fullPath = slot.name.startsWith(':') ? `${pathPrefix}${slot.name}` : `${pathPrefix}:${slot.name}`
                                }
                                
                                const selectedValue = slotValues[fullPath] || ''
                                const selectedOption = slot.options?.find(o => o.value === selectedValue)
                                
                                const nextPath = `${fullPath}:${selectedValue}`
                                
                                return (
                                  <React.Fragment key={`${fullPath}-${depth}-${idx}`}>
                                    <div className="slot-row" style={{ paddingLeft: depth * 16 }}>
                                      <label className="slot-label" title={fullPath}>
                                        {depth > 0 ? '↳ ' : ''}{slot.description}
                                      </label>
                                      <select
                                        className="slot-select"
                                        value={selectedValue}
                                        onChange={e => {
                                          const newVal = e.target.value
                                          setSlotValues(prev => {
                                            const next = { ...prev, [fullPath]: newVal }
                                            return fillSlotDefaults(machineConfig!.slots, next, machineConfig!.devices)
                                          })
                                        }}
                                      >
                                        {slot.options?.map((opt, i) => (
                                          <option key={i} value={opt.value} disabled={opt.disabled}>
                                            {opt.description}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    {Array.isArray(selectedOption?.slots) && renderSlots(selectedOption.slots, depth + 1, nextPath)}
                                    {selectedOption?.devname && machineConfig?.devices && (() => {
                                      const dev = machineConfig.devices.find(d => d.name === selectedOption.devname)
                                      return dev && Array.isArray(dev.slots) && renderSlots(dev.slots, depth + 1, nextPath)
                                    })()}
                                  </React.Fragment>
                                )
                              })
                            }
                            return renderSlots(machineConfig.slots)
                          })()}
                        </div>
                      ) : (
                        <p className="empty-hint">No slots available for this machine.</p>
                      )}
                    </div>
                  )}

                  {configTab === 'media' && (
                    <div className="section no-border">
                      <div className="media-grid">
                        {machineConfig && Object.entries(getEffectiveMedia()).map(([type, count]) => (
                          Array.from({ length: count }).map((_, i) => {
                            const mediaId = `${type}${i + 1}`
                            const label = `${type.toUpperCase()} ${i + 1}`
                            return (
                              <div key={mediaId} className="media-row">
                                <label className="media-label">{label}</label>
                                <div className="media-input-wrap">
                                  <span className="media-filename">
                                    {mediaFiles[mediaId]?.name || 'Empty'}
                                  </span>
                                  <button className="btn btn-ghost btn-icon" onClick={() => document.getElementById(`file-${mediaId}`)?.click()} title="Select File">
                                    📁
                                  </button>
                                  {mediaFiles[mediaId] && (
                                    <button 
                                      className="btn btn-ghost btn-icon" 
                                      onClick={() => {
                                        setMediaFiles(prev => {
                                          const next = { ...prev }
                                          delete next[mediaId]
                                          return next
                                        })
                                        dataManager.clearMedia(mediaId)
                                      }}
                                      title="Eject"
                                    >
                                      ⏏️
                                    </button>
                                  )}
                                  <input 
                                    type="file" 
                                    id={`file-${mediaId}`} 
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null
                                      setMediaFiles(prev => ({ ...prev, [mediaId]: file }))
                                      if (file) {
                                        dataManager.saveMedia(mediaId, file)
                                      } else {
                                        dataManager.clearMedia(mediaId)
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            )
                          })
                        ))}
                        {!machineConfig || Object.keys(machineConfig.media).length === 0 ? (
                          <p className="empty-hint">No media drives available.</p>
                        ) : null}
                      </div>
                    </div>
                  )}

                  {configTab === 'logs' && (
                    <div className="log-panel-inline">
                      <div className="log-body">
                        {logs.length === 0 && (
                          <span className="log-empty">No log output yet.</span>
                        )}
                        {logs.map((l, i) => (
                          <div key={i} className={`log-line ${l.isError ? 'log-err' : ''}`}>
                            {l.text}
                          </div>
                        ))}
                        <div ref={logEndRef} />
                      </div>
                      <div className="log-footer">
                        <button className="log-btn" onClick={() => setLogs([])}>Clear Log</button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="launch-footer">
                  <button
                    className="btn btn-primary btn-large"
                    onClick={handleLaunch}
                    disabled={isLoading}
                  >
                    {isLoading ? '⏳' : wasmModule ? '🔄' : '🚀'} {isLoading ? 'Loading...' : wasmModule ? 'Restart' : 'Launch'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome-icon">🍎</div>
            <h2>AmpleWeb</h2>
            <p>Browser-based Apple II &amp; Macintosh emulation</p>
            {wasmTarget && (
              <p style={{ fontSize: '12px', opacity: 0.5 }}>
                WASM target: {wasmTarget}
              </p>
            )}
            <p className="welcome-sub">Select a machine from the sidebar to begin</p>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Minimal ZIP parser: extract specific files from a ZIP archive.
 * Handles standard ZIP and TorrentZip (PK\x07\x08 footer stripped).
 */
function parseZip(data: Uint8Array, wanted: string[]): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {}
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)

  // Find End of Central Directory
  let eocdOffset = -1
  for (let i = data.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i
      break
    }
  }
  if (eocdOffset < 0) return result

  const cdOffset = view.getUint32(eocdOffset + 16, true)
  const cdEntries = view.getUint16(eocdOffset + 10, true)

  let pos = cdOffset
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) break

    const compSize = view.getUint32(pos + 20, true)
    const uncompSize = view.getUint32(pos + 24, true)
    const nameLen = view.getUint16(pos + 28, true)
    const extraLen = view.getUint16(pos + 30, true)
    const commentLen = view.getUint16(pos + 32, true)
    const localHdrOffset = view.getUint32(pos + 42, true)
    const method = view.getUint16(pos + 10, true)

    const name = new TextDecoder().decode(data.subarray(pos + 46, pos + 46 + nameLen))
    const baseName = name.split('/').pop() || name

    if (!wanted.includes(baseName)) {
      pos += 46 + nameLen + extraLen + commentLen + 6
      continue
    }

    const lhNameLen = view.getUint16(localHdrOffset + 26, true)
    const lhExtraLen = view.getUint16(localHdrOffset + 28, true)
    const lhDataOffset = localHdrOffset + 30 + lhNameLen + lhExtraLen
    const fileData = data.subarray(lhDataOffset, lhDataOffset + uncompSize)

    if (method === 0) {
      result[baseName] = fileData
    } else if (method === 8) {
      console.warn(`[App] ${name} is deflated — cannot decompress in browser`)
    }
    pos += 46 + nameLen + extraLen + commentLen + 6
  }
  return result
}

/**
 * Create a minimal ZIP in memory from a map of filename -> content.
 * Uses stored (no-compression) method.
 */
function createZip(entries: Record<string, Uint8Array>): Uint8Array {
  const encoder = new TextEncoder()
  const fileNames = Object.keys(entries)
  let dataOffset = 0
  for (const [name, data] of Object.entries(entries)) {
    dataOffset += 30 + encoder.encode(name).length + data.length
  }

  const cdSize = fileNames.reduce((s, n) => s + 46 + encoder.encode(n).length, 0)
  const totalSize = dataOffset + cdSize + 22
  const zip = new Uint8Array(totalSize)
  const view = new DataView(zip.buffer)
  let pos = 0

  // Local file headers + data
  for (const name of fileNames) {
    const data = entries[name]
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    view.setUint32(pos, 0x04034b50, true); pos += 4
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, crc, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint16(pos, nameBytes.length, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    zip.set(nameBytes, pos); pos += nameBytes.length
    zip.set(data, pos); pos += data.length
  }

  // Central directory
  const cdStart = pos
  for (const name of fileNames) {
    const data = entries[name]
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    let off = 0
    for (let i = 0; i < fileNames.indexOf(name); i++) {
      off += 30 + encoder.encode(Object.keys(entries)[i]).length + entries[Object.keys(entries)[i]].length
    }
    view.setUint32(pos, 0x02014b50, true); pos += 4
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 20, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, crc, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint32(pos, data.length, true); pos += 4
    view.setUint16(pos, nameBytes.length, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint16(pos, 0, true); pos += 2
    view.setUint32(pos, 0, true); pos += 4
    view.setUint32(pos, off, true); pos += 4
    zip.set(nameBytes, pos); pos += nameBytes.length
  }

  // End of central directory
  view.setUint32(pos, 0x06054b50, true); pos += 4
  view.setUint16(pos, 0, true); pos += 2
  view.setUint16(pos, 0, true); pos += 2
  view.setUint16(pos, fileNames.length, true); pos += 2
  view.setUint16(pos, fileNames.length, true); pos += 2
  view.setUint32(pos, cdSize, true); pos += 4
  view.setUint32(pos, cdStart, true); pos += 4
  view.setUint16(pos, 0, true); pos += 2

  return zip
}

/**
 * CRC32 lookup table and computation.
 */
const _crc32Table: number[] = (() => {
  const table: number[] = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
    }
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < data.length; i++) {
    crc = _crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

/** Read File as Uint8Array */
async function readFileAsArrayBuffer(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

export default App

/* ─── Machine Tree Components ─── */

function MachineTree({
  models,
  expanded,
  selected,
  onToggle,
  onSelect,
  filter,
}: {
  models: ModelEntry[]
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
  filter: string
}) {
  return (
    <ul className="machine-tree">
      {models.map(m => (
        <TreeItem
          key={`${m.description}${m.value ?? ''}`}
          entry={m}
          expanded={expanded}
          selected={selected}
          onToggle={onToggle}
          onSelect={onSelect}
          filter={filter}
          depth={0}
        />
      ))}
    </ul>
  )
}

function matchesFilter(entry: ModelEntry, filter: string): boolean {
  if (!filter) return true
  if (entry.description.toLowerCase().includes(filter)) return true
  if (entry.value?.toLowerCase().includes(filter)) return true
  if (entry.children?.some(c => matchesFilter(c, filter))) return true
  return false
}

function TreeItem({
  entry,
  expanded,
  selected,
  onToggle,
  onSelect,
  filter,
  depth,
}: {
  entry: ModelEntry
  expanded: Set<string>
  selected: { name: string; description: string } | null
  onToggle: (id: string) => void
  onSelect: (machine: { name: string; description: string }) => void
  filter: string
  depth: number
}) {
  const hasChildren = !!(entry.children && entry.children.length > 0)
  const id = `${entry.description}${entry.value ?? ''}`

  if (filter && !matchesFilter(entry, filter)) return null

  const isExpanded = filter ? matchesFilter(entry, filter) : expanded.has(id)
  const isSelected = selected?.name === entry.value && !!entry.value

  return (
    <li>
      <div
        className={`tree-item${isSelected ? ' selected' : ''}${hasChildren ? ' group' : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (hasChildren) onToggle(id)
          if (entry.value) onSelect({ name: entry.value, description: entry.description })
        }}
      >
        {hasChildren ? (
          <span className="tree-arrow">{isExpanded ? '▾' : '▸'}</span>
        ) : (
          <span className="tree-dot">·</span>
        )}
        <span className="tree-label">{entry.description}</span>
        {entry.value && !hasChildren && (
          <code className="tree-id">{entry.value}</code>
        )}
      </div>

      {hasChildren && isExpanded && (
        <ul className="tree-children">
          {entry.children!.map(child => (
            <TreeItem
              key={`${child.description}${child.value ?? ''}`}
              entry={child}
              expanded={expanded}
              selected={selected}
              onToggle={onToggle}
              onSelect={onSelect}
              filter={filter}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  )
}