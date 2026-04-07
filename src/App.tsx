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

type LaunchState = 'idle' | 'fetching-rom' | 'loading-wasm' | 'running' | 'error'

interface LogLine {
  text: string
  isError: boolean
  ts: number
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

  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dataManager.loadModels().then(setModels)
  }, [])

  // 自動捲到 log 底部
  useEffect(() => {
    if (showLogs) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, showLogs])

  const addLog = useCallback((text: string, isError: boolean) => {
    setLogs(prev => {
      const next = [...prev, { text, isError, ts: Date.now() }]
      // 最多保留 500 行
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
   * 主要 Launch 流程：
   * 1. Fetch ROM（若有）
   * 2. 載入 MAME WASM
   * 3. preRun 寫入 ROM → MAME 執行
   */
  const handleLaunch = useCallback(async () => {
    if (!selectedMachine) return
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)

    // 步驟 1：Fetch ROM
    setLaunchState('fetching-rom')
    setStatusText('Fetching ROM...')

    const romFiles: RomFile[] = []

    // 1. 嘗試從 /roms/<driver>.zip 取得主要 Machine ROM
    const possibleRomUrls = [
      `/roms/${selectedMachine.name}.zip`,
      `/roms/${selectedMachine.name}.7z`,
    ]

    for (const url of possibleRomUrls) {
      try {
        const rom = await fetchRom(url, selectedMachine.name)
        romFiles.push(rom)
        addLog(`ROM loaded: ${url} (${(rom.data.length / 1024).toFixed(0)} KB)`, false)
        break
      } catch {
        // 嘗試下一個 URL
      }
    }

    if (romFiles.length === 0) {
      addLog(`No ROM found for ${selectedMachine.name} at /roms/. MAME will attempt to use built-in resources.`, true)
    }

    // 2. 嘗試載入常見的擴充卡 ROM (因為 WASM 無法自動掃描目錄，必須明確 Fetch)
    // 這裡列出 Apple II 與 Mac 常用到的 Slot / Device ROM 名稱
    const auxiliaryRomNames = [
      'votrsc01a', 'a2diskiing', 'd2fdc', 'diskii', 'mockingboard', 'mac128k', 'mac512k', 'macplus'
    ]
    for (const auxName of auxiliaryRomNames) {
      // 避免重複載入 main machine
      if (auxName === selectedMachine.name) continue
      try {
        const rom = await fetchRom(`/roms/${auxName}.zip`, auxName)
        romFiles.push(rom)
        addLog(`Aux ROM loaded: /roms/${auxName}.zip`, false)
      } catch {
        // 沒有這個檔就忽略
      }
    }

    // 步驟 2：載入 WASM
    setLaunchState('loading-wasm')
    setStatusText('Loading MAME WASM...')

    // 恢復正軌：指定機型以及啟動參數
    const args = buildMameArgs(selectedMachine.name, {
      video: 'soft',
      resolution: '640x480',
      window: true,
      extraArgs: ['-verbose'],
    })

    addLog(`Launch args: ${args.join(' ')}`, false)

    try {
      const mod = await loadMameWasm('/wasm/mame.wasm', {
        driverArgs: args,
        romFiles,
        romPath: '/roms',
        onProgress: (loaded, total) => {
          if (total > 0) {
            const pct = Math.round((loaded / total) * 100)
            setWasmProgress(pct)
            setStatusText(`Loading WASM... ${pct}%`)
          }
        },
        onError: (err) => {
          setErrorText(err)
          setLaunchState('error')
          addLog(`Error: ${err}`, true)
        },
        onLog: addLog,
        onReady: (m) => {
          setWasmModule(m)
          setLaunchState('running')
          setStatusText('MAME running')

          // 把 canvas 放進容器
          requestAnimationFrame(() => {
            const c = document.getElementById('mame-canvas') as HTMLCanvasElement | null
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
  }, [selectedMachine, slotValues, addLog])

  /**
   * 快速測試：不帶 ROM，直接看 MAME 能否啟動
   */
  const handleTestLaunch = useCallback(async () => {
    setWasmModule(null)
    setErrorText(null)
    setLogs([])
    setWasmProgress(0)
    setShowLogs(true)
    setLaunchState('loading-wasm')
    setStatusText('Loading MAME WASM (no ROM)...')
    addLog('Test launch: no ROM, using apple2 driver', false)

    const args = buildMameArgs('apple2', {
      video: 'soft',
      resolution: '640x480',
      extraArgs: ['-verbose'],
    })

    try {
      await loadMameWasm('/wasm/mame.wasm', {
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
          addLog('MAME runtime ready', false)
          requestAnimationFrame(() => {
            const c = document.getElementById('mame-canvas') as HTMLCanvasElement | null
            if (c && canvasContainerRef.current) {
              canvasContainerRef.current.innerHTML = ''
              canvasContainerRef.current.appendChild(c)
            }
          })
        },
      })
    } catch (e: any) {
      const msg = e.message || String(e)
      setErrorText(msg)
      setLaunchState('error')
      addLog(`Fatal: ${msg}`, true)
    }
  }, [addLog])

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
      {/* ── 左側 Sidebar ── */}
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
          {models.length > 0
            ? `${models.length} machine groups`
            : 'Loading machines...'}
        </div>
      </div>

      {/* ── 右側主面板 ── */}
      <div className="main">
        {selectedMachine ? (
          <div className="machine-panel">
            {/* 機器標題 */}
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

            {/* 槽位設定 */}
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

            {/* 進度列 */}
            {isLoading && (
              <div className="progress-wrap">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${wasmProgress}%` }}
                  />
                </div>
                <span className="progress-label">{statusText}</span>
              </div>
            )}

            {/* 錯誤訊息 */}
            {errorText && (
              <div className="error-banner">
                <span className="error-icon">⚠️</span>
                <span>{errorText}</span>
              </div>
            )}

            {/* 啟動按鈕列 */}
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

            {/* Emulator Canvas 區域 */}
            <div
              className={`emulator-container ${launchState === 'running' ? 'active' : ''}`}
            >
              {/* 這個空的 span 專門用來放 canvas，避免 React 嘗試 unmount 被我們強制改過 DOM 的 element */}
              <div ref={canvasContainerRef} style={{ width: '100%', height: '100%', display: launchState === 'running' ? 'block' : 'none' }} />
              
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

            {/* MAME Console Log */}
            {showLogs && (
              <div className="log-panel">
                <div className="log-header">
                  <span>📋 MAME Console</span>
                  <div className="log-actions">
                    <button
                      className="log-btn"
                      onClick={() => setLogs([])}
                    >
                      Clear
                    </button>
                    <button
                      className="log-btn"
                      onClick={() => setShowLogs(false)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="log-body">
                  {logs.length === 0 && (
                    <span className="log-empty">No log output yet.</span>
                  )}
                  {logs.map((l, i) => (
                    <div
                      key={i}
                      className={`log-line ${l.isError ? 'log-err' : ''}`}
                    >
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
            <p className="welcome-sub">Select a machine from the sidebar to begin</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

/* ─── Machine Tree 元件 ─── */

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

  // 過濾：如果自己或子節點沒有符合，就不顯示
  if (filter && !matchesFilter(entry, filter)) return null

  // 有過濾詞時自動展開符合的群組
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
