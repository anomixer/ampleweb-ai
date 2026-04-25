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
  apple2gs:   { wasm: 'apple2gs.wasm',  js: 'apple2gs.js',    driver: 'apple2gs' },
  apple3:     { wasm: 'apple3.wasm',    js: 'apple3.js',      driver: 'apple3' },
  coco:       { wasm: 'coco.wasm',      js: 'coco.js',        driver: 'coco' },
  coco3:      { wasm: 'coco3.wasm',     js: 'coco3.js',       driver: 'coco3' },
  trs80:      { wasm: 'trs80.wasm',     js: 'trs80.js',       driver: 'trs80l2' },
  // NOTE: st WASM is Stadium Hero (arcade), NOT Atari ST. No Atari ST support.
  // NOTE: mac128.wasm only supports mac128k + macplus + macse drivers (per emularity config).
  c64:        { wasm: 'c64.wasm',       js: 'c64.js',         driver: 'c64' },
}

/**
 * Machine name → MAME driver name mapping.
 * mac128.wasm supports 3 drivers (per emularity configs): mac128k, macplus, macse.
 * maciici.wasm supports only maciici driver.
 * Other Mac variants (macii, maciix, macquadra, maclc, macportable, macpb, etc.)
 * are NOT supported by emularity-engine — no dedicated WASM exists.
 */
const DRIVER_MAP: Record<string, string> = {
  mac128k: 'mac128k',
  mac512k: 'mac128k',
  mac512ke: 'mac128k',
  macplus: 'macplus',
  macse: 'macse',
  macsefd: 'macse',
}

/**
 * Mac machines NOT supported by emularity-engine.
 * These need dedicated WASM builds that don't exist.
 */
const UNSUPPORTED_MAC = new Set([
  // Mac II family
  'macii', 'maciihmu', 'mac2fdhd', 'maciix', 'maciifx', 'maciicx', 'maciisi', 'maciivx', 'maciivi',
  // Mac Quadra
  'macqd605', 'macqd610', 'macqd650', 'macqd700', 'macqd800', 'macqd900', 'macqd950',
  // Mac LC/Performa
  'maclc', 'maclc2', 'maclc3', 'maclc3p', 'maclc475', 'maclc520', 'maclc550', 'maclc575',
  'macct610', 'macct650', 'mactv',
  // Mac Portable
  'macprtb', 'macpb100', 'macpb140', 'macpb145', 'macpb145b', 'macpb160', 'macpb165', 'macpb165c',
  'macpb170', 'macpb180', 'macpb180c',
  // Mac Duo
  'macpd210', 'macpd230', 'macpd250', 'macpd270c', 'macpd280', 'macpd280c',
  // Mac Classic
  'macclasc', 'macclas2', 'maccclas',
  // Mac TV
  'mactv',
])

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
  // Mac variants
  mac128k: 'mac128k.zip',
  mac512k: 'mac128k.zip',
  mac512ke: 'mac128k.zip',
  macplus: 'macplus.zip',
  macse: 'macplus.zip',
  macsefd: 'macplus.zip',
  maciici: 'maciici.zip',
  // NOTE: All other Mac variants (macii, maciix, macquadra, maclc, macportable, macpb,
  // macpd, macclasc, macclas2, maccclas, mactv, etc.) have NO emularity WASM support.
  // They are caught by getEmulatorForMachine → returns null → "No emulator support" error.
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
  // Fallback
  apple2: 'apple2c.zip',
  apple2p: 'apple2c.zip',
  apple2jp: 'apple2c.zip',
}

/**
 * Default resolution per emulator type.
 * Each emularity WASM has a native resolution from its config.
 * For MAME-wrapped builds, these are used as -resolution flags.
 */
const DEFAULT_RESOLUTIONS: Record<string, string> = {
  apple2e: '560x384',
  apple2gs: '704x462',
  apple3: '560x384',
  mac128: '512x342',
  maciici: '640x480',
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
   * Uses DRIVER_ROM_MAP to find the correct BIOS ROM.
   */
  const fetchAllRoms = useCallback(async (driverName: string): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — look up from DRIVER_ROM_MAP
    const romFile = DRIVER_ROM_MAP[driverName]
    if (romFile) {
      try {
        const url = `/roms/${romFile}`
        const rom = await fetchRom(url, driverName)
        romFiles.push(rom)
        addLog(`ROM: ${url} (${(rom.data.length / 1024).toFixed(0)} KB)`, false)
      } catch {
        addLog(`ROM not found: ${romFile}`, true)
      }
    }

    // 2. Auxiliary ROMs for Apple IIe
    if (driverName.startsWith('apple2')) {
      for (const auxName of ['a2diskiing', 'votrsc01a', 'd2fdc']) {
        if (auxName === driverName) continue
        try {
          const rom = await fetchRom(`/roms/${auxName}.zip`, auxName)
          romFiles.push(rom)
          addLog(`Aux: ${auxName}.zip`, false)
        } catch { /* optional */ }
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
    // apple2* → apple2e (all Apple IIe variants share the apple2e WASM)
    if (machineName.startsWith('apple2')) return 'apple2e'
    // apple3* → apple3
    if (machineName.startsWith('apple3')) return 'apple3'
    // maciici* → maciici (dedicated WASM)
    if (machineName.startsWith('maciici')) return 'maciici'
    // mac128* → mac128 (dedicated WASM)
    if (machineName.startsWith('mac128')) return 'mac128'
    // mac* → check supported variants first
    if (machineName.startsWith('mac')) {
      if (UNSUPPORTED_MAC.has(machineName)) return null
      // macplus, macse, macsefd — also use mac128.wasm (resolved by DRIVER_MAP)
      if (machineName === 'macplus' || machineName === 'macse' || machineName === 'macsefd') return 'mac128'
      // All other mac* variants are unsupported
      return null
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

          // Move canvas into container
          requestAnimationFrame(() => {
            const c = document.getElementById('canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
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

        <div className="sidebar-footer">
          {wasmTarget && (
            <code style={{ fontSize: '9px', opacity: 0.6 }}>
              wasm:{wasmTarget}
            </code>
          )}
          {models.length > 0 && ` · ${models.length} groups`}
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