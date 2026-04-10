// ─────────────────────────────────────────────────────────────────────────────
// wasm_loader.ts  —  MAME WASM 載入器
//
// 核心策略（參考 test_mamewasm.html 已驗證的做法）：
//   1. Module.arguments = 自動啟動（不用 noInitialRun + callMain）
//   2. preRun + addRunDependency 暫停 MAME 啟動
//   3. 在 preRun 內寫入 ROM（ZIP 檔直接寫入，不解壓縮）
//   4. removeRunDependency 後 MAME 自動執行 callMain
//
// MAME 會自行開啟 ZIP 檔並驗證 checksum，不需要我們先解壓縮。
// ─────────────────────────────────────────────────────────────────────────────

export interface MameWasmModule {
  canvas?: HTMLCanvasElement
  noInitialRun?: boolean
  arguments?: string[]
  calledRun?: boolean
  locateFile?: (path: string) => string
  print?: (text: string) => void
  printErr?: (text: string) => void
  monitorRunDependencies?: (left: number) => void
  onRuntimeInitialized?: () => void
  onAbort?: (what: string) => void
  setStatus?: (text: string) => void
  preRun?: Array<() => void>
  quit?: (code: number, toThrow?: any) => void
  addRunDependency?: (id: string) => void
  removeRunDependency?: (id: string) => void
}

/** ROM 檔案：driver 名稱 + ZIP bytes */
export interface RomFile {
  /** MAME driver 名稱，例如 "apple2e" */
  driver: string
  /** 檔名，例如 "apple2e.zip" */
  name: string
  /** 原始 ZIP bytes（MAME 會自行解壓） */
  data: Uint8Array
}

export interface WasmLoaderOptions {
  /** MAME 啟動參數（driver + flags），不含 rompath（會自動加） */
  driverArgs?: string[]
  /** 預先 fetch 好的 ROM ZIP 檔 */
  romFiles?: RomFile[]
  /** WASM 虛擬 FS 中的 rompath 根目錄（預設 /roms） */
  romPath?: string
  onReady?: (module: MameWasmModule) => void
  onProgress?: (loaded: number, total: number) => void
  onError?: (error: string) => void
  onLog?: (line: string, isError: boolean) => void
}

let _moduleRef: MameWasmModule | null = null
export const getModule = () => _moduleRef

export function loadMameWasm(
  wasmUrl: string,
  opts: WasmLoaderOptions = {}
): Promise<MameWasmModule> {
  return new Promise((resolve, reject) => {
    const {
      driverArgs = [],
      romFiles = [],
      romPath = '/roms',
      onReady,
      onProgress,
      onError,
      onLog,
    } = opts

    // ── canvas ──
    // Emscripten SDL hardcodes document.getElementById('canvas') internally.
    const existingCanvas = document.getElementById('canvas') as HTMLCanvasElement | null
    const canvas = existingCanvas ?? (() => {
      const c = document.createElement('canvas')
      c.id = 'canvas'
      c.className = 'emscripten'
      c.tabIndex = -1
      c.width = 640
      c.height = 480
      return c
    })()

    if (!canvas.parentElement) {
      canvas.style.display = 'none'
      document.body.appendChild(canvas)
    }

    const jsUrl = wasmUrl.replace('.wasm', '.js')

    // MAME args：確保含 -rompath
    const finalArgs = [...driverArgs]
    if (!finalArgs.includes('-rompath')) {
      finalArgs.push('-rompath', romPath)
    }

    console.log('[WasmLoader] args:', finalArgs)
    console.log('[WasmLoader] ROM files:', romFiles.map(r => r.name))

    let totalDeps = 0
    let maxDeps = 0
    let resolved = false
    let rejected = false

    const fail = (msg: string) => {
      if (!rejected) {
        rejected = true
        onError?.(msg)
        reject(new Error(msg))
      }
    }

    const succeed = (m: MameWasmModule) => {
      if (!resolved && !rejected) {
        resolved = true
        _moduleRef = m
        onReady?.(m)
        resolve(m)
      }
    }

    const Module: any = {
      // 關鍵：用 Module.arguments 自動啟動，不用 noInitialRun + callMain
      // 原因：noInitialRun + callMain 會觸發 WASM C++ exception handling bug
      arguments: finalArgs,

      canvas,

      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) return wasmUrl
        return path
      },

      print: (text: string) => {
        console.log('[MAME]', text)
        onLog?.(text, false)
      },

      printErr: (text: string) => {
        console.warn('[MAME]', text)
        onLog?.(text, true)
      },

      monitorRunDependencies: (left: number) => {
        if (left > maxDeps) { maxDeps = left; totalDeps = left }
        const done = totalDeps - left
        if (totalDeps > 0) onProgress?.(done, totalDeps)
        if (left === 0 && totalDeps > 0) onProgress?.(100, 100)
      },

      // 核心修正：用 preRun + addRunDependency 暫停 MAME
      // 在 preRun 內寫入 ROM ZIP 檔，完成後 removeRunDependency
      // 這樣 MAME 的 callMain 會在我們寫完 ROM 之後才執行
      preRun: [function () {
        // FS 已在 preRun 之前初始化，可以直接用
        const FS = (window as any).FS
        if (!FS) {
          console.error('[WasmLoader] FS not available in preRun!')
          return
        }

        // 建立 rompath 目錄
        try { FS.mkdir(romPath) } catch { /* 已存在 */ }

        if (romFiles.length > 0) {
          // 暫停 MAME 啟動直到 ROM 寫完
          Module.addRunDependency('rom-write')

          // 用 setTimeout 讓非同步 ROM fetch 有機會完成
          // （如果 romFiles 已經有資料，這裡是同步寫入）
          try {
            for (const rom of romFiles) {
              const dest = `${romPath}/${rom.name}`
              FS.writeFile(dest, rom.data)
              const sizeKB = (rom.data.length / 1024).toFixed(0)
              const msg = `[FS] Wrote ${dest} (${sizeKB} KB)`
              console.log('[WasmLoader]', msg)
              onLog?.(msg, false)
            }
          } catch (e: any) {
            const msg = `Failed to write ROM: ${e?.message}`
            console.error('[WasmLoader]', msg)
            onLog?.(msg, true)
          }

          // ROM 寫完，釋放依賴
          Module.removeRunDependency('rom-write')
        }
      }],

      onRuntimeInitialized: function () {
        console.log('[WasmLoader] Runtime initialized, MAME will auto-start.')
        canvas.style.display = ''
        onProgress?.(100, 100)
        // 注意：不在此處 resolve，因為 MAME 尚未執行 callMain
        // callMain 會在 onRuntimeInitialized 之後自動執行
      },

      onAbort: (what: string) => {
        const msg = `MAME aborted: ${what}`
        console.error('[WasmLoader]', msg)
        onLog?.(msg, true)
        fail(msg)
      },

      setStatus: (text: string) => {
        if (text) {
          console.log('[MAME status]', text)
          onLog?.(text, false)
        }
      },

      quit: (code: number, _toThrow?: any) => {
        const isErr = code !== 0
        console.log(`[WasmLoader] MAME quit(${code})`)
        onLog?.(`MAME exited (code ${code})`, isErr)
        // MAME 正常退出也算成功（resolve Module）
        if (!resolved && !rejected) {
          succeed(Module)
        }
      },
    }

    ;(window as any).Module = Module

    // ── 載入 mame.js ──
    const existing = document.getElementById('mame-js-script')
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = 'mame-js-script'
    script.src = jsUrl
    script.onload = () => {
      console.log('[WasmLoader] mame.js loaded, MAME will auto-start...')
      // MAME 開始執行後，稍等一下再 resolve
      // （因為 MAME 是非同步啟動的，callMain 可能在下一個 tick）
      setTimeout(() => {
        if (!resolved && !rejected) {
          succeed((window as any).Module as MameWasmModule)
        }
      }, 2000)
    }
    script.onerror = () => fail(`Failed to load: ${jsUrl}`)
    document.head.appendChild(script)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// fetchRom：從 URL 取得 ROM ZIP 並包裝成 RomFile
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRom(
  url: string,
  driver: string,
  filename?: string
): Promise<RomFile> {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  }
  const contentType = resp.headers.get('content-type')
  if (contentType && contentType.includes('text/html')) {
    throw new Error(`Failed to fetch ${url}: Server returned HTML (probably 404 fallback)`)
  }
  const buf = await resp.arrayBuffer()
  const name = filename ?? url.split('/').pop() ?? 'rom.zip'
  return { driver, name, data: new Uint8Array(buf) }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMameArgs：建立 MAME 命令列參數（不含 rompath，由 loadMameWasm 加）
// ─────────────────────────────────────────────────────────────────────────────
export function buildMameArgs(
  driver: string,
  options: {
    floppy?: string[]
    hardDrive?: string[]
    cassette?: string
    ramSize?: string
    slots?: Record<string, string>
    extraArgs?: string[]
    video?: 'soft' | 'bgfx' | 'opengl' | 'none'
    resolution?: string
    noMaximize?: boolean
    skipGameInfo?: boolean
    window?: boolean
  } = {}
): string[] {
  const args: string[] = [driver]

  if (options.floppy?.length) {
    options.floppy.forEach((f, i) => { if (f) args.push(`-flop${i + 1}`, f) })
  }
  if (options.hardDrive?.length) {
    options.hardDrive.forEach((h, i) => { if (h) args.push(`-hard${i + 1}`, h) })
  }
  if (options.cassette) args.push('-cass', options.cassette)
  if (options.ramSize) args.push('-ramsize', options.ramSize)

  if (options.slots) {
    for (const [slot, value] of Object.entries(options.slots)) {
      if (value) args.push(`-${slot}`, value)
    }
  }

  args.push('-video', options.video ?? 'soft')
  args.push('-resolution', options.resolution ?? '640x480')
  if (options.window !== false) args.push('-window')
  if (options.noMaximize !== false) args.push('-nomaximize')
  if (options.skipGameInfo !== false) args.push('-skip_gameinfo')

  if (options.extraArgs) args.push(...options.extraArgs)

  return args
}