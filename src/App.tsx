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

/** WASM target → filename under /wasm/. Priority: smallest to largest. */
const WASM_TARGET_MAP: Record<string, string> = {
  full: 'mame',
  tiny: 'mametiny',
  apple2eonly: 'apple2e',
}

/** Lightweight file existence check (synchronous, checks browser cache). */
const _wasmCache: Record<string, boolean> = {}
function _wasmExists(targetKey: string): boolean {
  const url = `/wasm/${WASM_TARGET_MAP[targetKey]}.wasm`
  if (!(url in _wasmCache)) {
    _wasmCache[url] = false // default to false; will be updated async
    fetch(url, { method: 'HEAD' })
      .then(r => { _wasmCache[url] = r.ok })
      .catch(() => { _wasmCache[url] = false })
  }
  return _wasmCache[url]
}

/**
 * Determine best available WASM target by checking which files exist.
 * Uses synchronous XHR to avoid async race conditions.
 */
function detectWasmTarget(): 'apple2eonly' | 'tiny' | 'full' {
  const candidates: Array<'apple2eonly' | 'tiny' | 'full'> = ['apple2eonly', 'tiny', 'full']
  for (const target of candidates) {
    const url = `/wasm/${WASM_TARGET_MAP[target]}.wasm`
    try {
      const xhr = new XMLHttpRequest()
      xhr.open('HEAD', url, false) // sync
      xhr.send()
      if (xhr.status === 200) {
        _wasmCache[url] = true
        return target
      }
    } catch { /* skip */ }
    _wasmCache[url] = false
  }
  console.warn(`[App] No WASM file confirmed available, will try ${candidates[0]} (${WASM_TARGET_MAP[candidates[0]]}.wasm)`)
  return candidates[0]
}

type LaunchState = 'idle' | 'fetching-rom' | 'loading-wasm' | 'running' | 'error'

interface LogLine {
  text: string
  isError: boolean
  ts: number
}

/**
 * Apple II auxiliary ROMs needed for apple2e.
 * MAME WASM can't auto-scan directories — we must write these to VFS explicitly.
 */
const APPLE2E_AUX_ROMS = [
  'a2diskiing',  // Disk II controller
  'votrsc01a',   // Votrax speech
  'd2fdc',       // Duo Disk floppy controller
]

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

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  // Detect available WASM on mount
  const [wasmTarget] = useState(detectWasmTarget())

  useEffect(() => {
    dataManager.loadModels().then(setModels)
  }, [])

  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

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
   * Key: write the complete ZIP to VFS — MAME handles unzip internally.
   */
  const fetchAllRoms = useCallback(async (driverName: string): Promise<RomFile[]> => {
    const romFiles: RomFile[] = []

    // 1. Main machine ROM — try .zip then .7z
    for (const ext of ['zip', '7z']) {
      try {
        const url = `/roms/${driverName}.${ext}`
        const rom = await fetchRom(url, driverName)
        romFiles.push(rom)
        addLog(`ROM: ${url} (${(rom.data.length / 1024).toFixed(0)} KB)`, false)
        break
      } catch { /* try next */ }
    }

    // 2. Auxiliary ROMs for Apple II
    for (const auxName of APPLE2E_AUX_ROMS) {
      if (auxName === driverName) continue
      try {
        const rom = await fetchRom(`/roms/${auxName}.zip`, auxName)
        romFiles.push(rom)
        addLog(`Aux: ${auxName}.zip`, false)
      } catch { /* optional */ }
    }

    return romFiles
  }, [addLog])

  /**
   * Main launch sequence:
   * 1. fetch ROM ZIP files
   * 2. load WASM with detected target
   * 3. preRun writes ZIPs to VFS → MAME auto-starts
   */
  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)

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
    const wasmName = `${WASM_TARGET_MAP[wasmTarget]}.wasm`
    addLog(`Using /wasm/${wasmName} (target: ${wasmTarget})`, false)

    const args = buildMameArgs(selectedMachine.name, {
      video: 'soft',
      resolution: '560x384',
      window: true,
      extraArgs: ['-verbose'],
    })
    addLog(`args: ${args.join(' ')}`, false)

    try {
      const mod = await loadMameWasm(`/wasm/${wasmName}`, {
        driverArgs: args,
        romFiles,
        romPath: '/roms',
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
            msg += `\nPlace the correct mame*.wasm in public/wasm/`
            msg += `\nAvailable targets: apple2eonly, tiny, full`
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

    const wasmName = `${WASM_TARGET_MAP[wasmTarget]}.wasm`
    addLog(`Test: /wasm/${wasmName}`, false)

    const args = buildMameArgs('apple2e', {
      video: 'soft',
      resolution: '640x480',
      extraArgs: ['-verbose'],
    })

    try {
      await loadMameWasm(`/wasm/${wasmName}`, {
        driverArgs: args,
        romFiles: [],
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
      <div className="sidebar">
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

      {/* ── Right Main Panel ── */}
      <div className="main">
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

            {/* Progress bar */}
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