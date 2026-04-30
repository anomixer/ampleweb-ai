import { useState, useEffect, useRef, useCallback } from 'react'
import { dataManager, type ModelEntry, type MachineConfig } from './core/data_manager'
import {
  loadMameWasm,
  buildMameArgs,
  fetchRom,
  type MameWasmModule,
  type RomFile,
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
  macse30: 'macse',
  macxl: 'mac',
  // Mac II family → mac.wasm
  macii: 'mac',
  maciihmu: 'mac',
  mac2fdhd: 'mac',
  maciix: 'mac',
  maciifx: 'mac',
  maciicx: 'mac',
  maciisi: 'mac',
  maciivx: 'mac',
  maciivi: 'mac',
  // Mac Quadra → mac.wasm
  macqd605: 'mac',
  macqd610: 'mac',
  macqd630: 'mac',
  macqd650: 'mac',
  macqd700: 'mac',
  macqd800: 'mac',
  macqd900: 'mac',
  macqd950: 'mac',
  // Mac LC/Performa → mac.wasm
  maclc: 'mac',
  maclc2: 'mac',
  maclc3: 'mac',
  maclc3p: 'mac',
  maclc475: 'mac',
  maclc520: 'mac',
  maclc550: 'mac',
  maclc575: 'mac',
  maclc580: 'mac',
  macct610: 'mac',
  macct650: 'mac',
  mactv: 'mac',
  // Mac Portable → mac.wasm
  macprtb: 'mac',
  macpb100: 'mac',
  macpb140: 'mac',
  macpb145: 'mac',
  macpb145b: 'mac',
  macpb160: 'mac',
  macpb165: 'mac',
  macpb165c: 'mac',
  macpb170: 'mac',
  macpb180: 'mac',
  macpb180c: 'mac',
  // Mac Duo → mac.wasm
  macpd210: 'mac',
  macpd230: 'mac',
  macpd250: 'mac',
  macpd270c: 'mac',
  macpd280: 'mac',
  macpd280c: 'mac',
  // Mac Classic → mac.wasm
  macclasc: 'mac',
  macclas2: 'mac',
  maccclas: 'mac',
  // apple2c* variants use mameapple2e.wasm (now available in emularity-engine)
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
 * Get the WASM info for an emulator type, falling back to available targets.
 */
function getWasmForEmulator(emulator: string): { wasm: string; js: string; driver: string } | null {
  // Direct match
  const info = EMULATOR_WASM_MAP[emulator]
  if (info && _wasmExists(info.wasm)) return info

  // Fallback: try to find any available WASM
  for (const [emu, wasmInfo] of Object.entries(EMULATOR_WASM_MAP)) {
    if (_wasmExists(wasmInfo.wasm)) {
      console.warn(`[App] ${emulator} WASM not available, falling back to ${emu} (${wasmInfo.driver})`)
      return wasmInfo
    }
  }

  console.warn(`[App] No WASM file available for ${emulator}`)
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
  apple2ee: 'apple2e.zip',
  apple2eeuk: 'apple2e.zip',
  apple2eede: 'apple2e.zip',
  apple2eese: 'apple2e.zip',
  apple2eefr: 'apple2e.zip',
  apple2ep: 'apple2e.zip',
  apple2euk: 'apple2e.zip',
  apple2ede: 'apple2e.zip',
  apple2ese: 'apple2e.zip',
  apple2efr: 'apple2e.zip',
  apple2ees: 'apple2e.zip',
  // Apple IIc variants
  apple2c: 'apple2c.zip',
  apple2c0: 'apple2c.zip',
  apple2c3: 'apple2c.zip',
  apple2cp: 'apple2c.zip',
  // Apple IIgs
  apple2gs: 'apple2gs.zip',
  apple2gsr0: 'apple2gs.zip',
  apple2gsr1: 'apple2gs.zip',
  // Apple III
  apple3: 'apple3.zip',
  // Mac variants — only ROMs that exist in public/roms/
  mac128k: 'mac128k.zip',
  mac512k: 'mac128k.zip',
  mac512ke: 'mac128k.zip',
  macplus: 'macplus.zip',
  macse: 'macse.zip',
  macsefd: 'macsefd.zip',
  maciici: 'maciici.zip',
  macii: 'macii.zip',
  maciihmu: 'macii.zip',
  mac2fdhd: 'macii.zip',
  // Mac II family — macii.zip covers macii, maciihmu, maciix, maciicx
  maciix: 'macii.zip',
  maciifx: 'macii.zip',
  maciicx: 'macii.zip',
  maciisi: 'macii.zip',
  maciivx: 'macii.zip',
  maciivi: 'macii.zip',
  // Mac Quadra — no dedicated ROMs available
  macqd605: '',
  macqd610: '',
  macqd630: '',
  macqd650: '',
  macqd700: '',
  macqd800: '',
  macqd900: '',
  macqd950: '',
  // Mac LC/Performa — no dedicated ROMs available
  maclc: '',
  maclc2: '',
  maclc3: '',
  maclc3p: '',
  maclc475: '',
  maclc520: '',
  maclc550: '',
  maclc575: '',
  maclc580: '',
  macct610: '',
  macct650: '',
  mactv: '',
  // Mac Portable — no dedicated ROMs available
  macprtb: '',
  macpb100: '',
  macpb140: '',
  macpb145: '',
  macpb145b: '',
  macpb160: '',
  macpb165: '',
  macpb165c: '',
  macpb170: '',
  macpb180: '',
  macpb180c: '',
  // Mac Duo — no dedicated ROMs available
  macpd210: '',
  macpd230: '',
  macpd250: '',
  macpd270c: '',
  macpd280: '',
  macpd280c: '',
  // Mac Classic — no dedicated ROMs available
  macclasc: '',
  macclas2: '',
  maccclas: '',
  macxl: '',
  macse30: 'macse.zip',
  // Other emulators
  c64: 'c64.zip',
  coco: 'coco.zip',
  cocoh: 'coco.zip',
  coco2b: 'coco.zip',
  coco2bh: 'coco.zip',
  coco3: 'coco3.zip',
  coco3p: 'coco3.zip',
  coco3h: 'coco3.zip',
  trs80: 'trs80.zip',
  trs80l2: 'trs80.zip',
  mc10: 'mc10.zip',
  // NOTE: st WASM is Stadium Hero (arcade), NOT Atari ST. No Atari ST ROMs.
  // Apple II / Apple II Plus (mameapple2.wasm)
  apple2: 'apple2.zip',
  apple2p: 'apple2p.zip',
  // apple2jp needs a2jp.chr + 341-0047.f8 — not available
  apple2jp: '',
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
  const [configWidth, setConfigWidth] = useState(280)
  const [isConfigResizing, setIsConfigResizing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [romSettings, setRomSettings] = useState({ autoDownload: false, downloadServers: [] as string[] })
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Detect available WASM on mount (legacy display only)
  const [wasmTarget] = useState(() => {
    for (const [emu, info] of Object.entries(EMULATOR_WASM_MAP)) {
      if (_wasmExists(info.wasm)) return emu
    }
    return 'none'
  })

  useEffect(() => {
    dataManager.loadModels().then(setModels)
  }, [])

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

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
      const w = Math.max(200, Math.min(500, rightEdge))
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

  const handleSelectMachine = useCallback(async (machine: { name: string; description: string }) => {
    setSelectedMachine(machine)
    setWasmModule(null)
    setErrorText(null)
    setStatusText('')
    setLaunchState('idle')
    const config = await dataManager.loadMachine(machine.name)
    setMachineConfig(config)
    if (config) {
      const defaults: Record<string, string> = {}
      config.slots.forEach(slot => {
        const defaultOpt = slot.options.find(o => o.default)
        if (defaultOpt) defaults[slot.name] = defaultOpt.value
      })
      setSlotValues(defaults)
    }
  }, [])

  /**
   * Fetch all required ROM ZIP files for a driver.
   */
  const fetchAllRoms = useCallback(async (driverName: string): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — look up from DRIVER_ROM_MAP
    const romFile = DRIVER_ROM_MAP[driverName]
    if (romFile) {
      try {
        const url = `/roms/${romFile}`
        const rom = await fetchRom(url, driverName)
        // Strip TorrentZip footer (40 bytes: 36-byte SHA256 + PK\x07\x08)
        // MAME's WASM ZIP parser chokes on TorrentZip format
        const raw = rom.data
        if (raw.length >= 48) {
          const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
          const end = raw.length
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
    } else {
      addLog(`No ROM available for ${driverName}`, false)
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
          let zipData = new Uint8Array(await resp.arrayBuffer())
          // Strip TorrentZip footer so we can parse the ZIP structure
          if (zipData.length >= 48) {
            const view = new DataView(zipData.buffer, zipData.byteOffset, zipData.byteLength)
            const end = zipData.length
            if (view.getUint32(end - 4, true) === 0x506b0708) {
              zipData = zipData.subarray(0, end - 40)
            }
          }
          // Extract the file and repackage as a new ZIP named after the ROM set
          const extracted = parseZip(zipData, aux.files)
          for (const [name, content] of Object.entries(extracted)) {
            const newZip = createZip({ [aux.romSet]: content })
            romFiles.push({ driver: aux.romSet, name: `${aux.romSet}.zip`, data: newZip })
            addLog(`Aux: ${aux.romSet}.zip (${newZip.length} B)`, false)
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
    // apple2p*, apple2*, apple2jp* → mameapple2 (apple2, apple2p, apple2jp all share mameapple2.wasm)
    if (machineName.startsWith('apple2p') || machineName.startsWith('apple2') || machineName.startsWith('apple2jp')) return 'mameapple2'
    // apple2woz* → apple2e (uses apple2e.wasm)
    if (machineName.startsWith('apple2woz')) return 'apple2e'
    // apple2e* variants → apple2e (all Apple IIe variants share the apple2e WASM)
    if (machineName.startsWith('apple2e')) return 'apple2e'
    // apple3* → apple3
    if (machineName.startsWith('apple3')) return 'apple3'
    // maciici* → maciici (dedicated WASM)
    if (machineName.startsWith('maciici')) return 'maciici'
    // mac128* → mac128 (dedicated WASM)
    if (machineName.startsWith('mac128')) return 'mac128'
    // mac* → mac for unsupported models (mac.wasm = full MAME Mac build)
    if (machineName.startsWith('mac')) {
      // macplus, macse, macsefd, macse30 → mac128.wasm (per emularity config)
      if (machineName === 'macplus' || machineName === 'macse' || machineName === 'macsefd' || machineName === 'macse30') return 'mac128'
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
   * Main launch sequence:
   * 1. determine emulator type from machine
   * 2. fetch ROM ZIP files
   * 3. load the correct WASM (per-emulator)
   * 4. preRun writes ZIPs to VFS → MAME auto-starts
   */
  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)

    // Step 0: determine emulator type
    const emulator = getEmulatorForMachine(selectedMachine.name)
    if (!emulator) {
      setErrorText(`No emulator support for machine: ${selectedMachine.name}`)
      setLaunchState('error')
      addLog(`Error: no emulator for ${selectedMachine.name}`, true)
      return
    }

    const wasmInfo = getWasmForEmulator(emulator)
    if (!wasmInfo) {
      setErrorText(`No WASM file available for ${emulator}.\nPlace ${emulator}.wasm in public/wasm/`)
      setLaunchState('error')
      addLog(`Error: no WASM for ${emulator}`, true)
      return
    }

    // Step 1: fetch ROMs
    setLaunchState('fetching-rom')
    setStatusText('Fetching ROM...')

    let romFiles: RomFile[] = []
    try {
      romFiles = await fetchAllRoms(selectedMachine.name)
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
    const mameDriver = DRIVER_MAP[selectedMachine.name] ?? wasmInfo.driver

    const extraArgs = ['-verbose', '-resolution', resolution]

    const args = buildMameArgs(mameDriver, {
      video: 'soft',
      window: true,
      extraArgs,
    })
    addLog(`args: ${args.join(' ')}`, false)

    try {
      const mod = await loadMameWasm(wasmUrl, {
        driverArgs: args,
        romFiles,
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
          // Improve error message for missing WASM
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

          // Move canvas into container (centered by flexbox)
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
  }, [selectedMachine, wasmTarget, addLog, fetchAllRoms])

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
      <div className="sidebar" style={{ width: sidebarWidth }}>
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
                {/* Emulator canvas area */}
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
                      {launchState === 'idle' && <p>Press Launch to start emulation</p>}
                      {isLoading && (
                        <div className="loading-indicator">
                          <div className="spinner" />
                          <p>{statusText}</p>
                        </div>
                      )}
                      {launchState === 'error' && (
                        <p className="placeholder-error">Emulation failed — check log for details</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Config resize handle */}
              <div
                className={`resize-handle ${isConfigResizing ? 'active' : ''}`}
                onMouseDown={() => setIsConfigResizing(true)}
                style={{ alignSelf: 'stretch' }}
              />

              {/* Right: slot config + launch */}
              <div className="config-area" style={{ width: configWidth }}>
                {/* Slot configuration */}
                {machineConfig && machineConfig.slots.length > 0 && (
                  <div className="section">
                    <div className="section-heading">
                      <span>⚙️ Configuration</span>
                      <span className="section-count">{machineConfig.slots.length} slots</span>
                    </div>
                    <div className="slot-grid">
                      {machineConfig.slots.map(slot => (
                        <div key={slot.name} className="slot-row">
                          <label className="slot-label" title={slot.name}>
                            {slot.description}
                          </label>
                          <select
                            className="slot-select"
                            value={slotValues[slot.name] ?? ''}
                            onChange={e =>
                              setSlotValues(prev => ({ ...prev, [slot.name]: e.target.value }))
                            }
                          >
                            {slot.options.map((opt, i) => (
                              <option key={i} value={opt.value} disabled={opt.disabled}>
                                {opt.description}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Launch buttons */}
                <div className="launch-row">
                  <button
                    className="btn btn-primary"
                    onClick={handleLaunch}
                    disabled={isLoading}
                    id="btn-launch"
                  >
                    {isLoading ? '⏳ Loading...' : wasmModule ? '🔄 Restart' : '🚀 Launch'}
                  </button>

                  {!wasmModule && !isLoading && (
                    <button
                      className="btn btn-secondary"
                      onClick={handleTestLaunch}
                      id="btn-test"
                    >
                      🔬 Test WASM
                    </button>
                  )}

                  <button
                    className={`btn btn-ghost ${showLogs ? 'active' : ''}`}
                    onClick={() => setShowLogs(v => !v)}
                    id="btn-toggle-logs"
                  >
                    {showLogs ? '📋 Hide Log' : '📋 Show Log'}
                  </button>
                </div>

                {/* MAME console log */}
                {showLogs && (
                  <div className="log-panel">
                    <div className="log-header">
                      <span>📋 MAME Console</span>
                      <div className="log-actions">
                        <button className="log-btn" onClick={() => setLogs([])}>Clear</button>
                        <button className="log-btn" onClick={() => setShowLogs(false)}>✕</button>
                      </div>
                    </div>
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
                  </div>
                )}
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
          key={m.description + m.value}
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
  const id = entry.description + entry.value

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
              key={child.description + child.value}
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