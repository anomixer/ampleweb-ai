// ─────────────────────────────────────────────────────────────────────────────
// wasm_loader.ts  —  MAME WASM 載入器
//
// 關鍵時序（mame.js internals）：
//   run() → preRun() → doRun() → initRuntime() [FS.init() 在這裡] →
//   onRuntimeInitialized() → if(!noInitialRun) callMain()
//
// 修復策略：
//   1. noInitialRun: true  → 讓我們自己控制何時 callMain
//   2. onRuntimeInitialized 時 FS 已就緒，用 Module.FS_createDataFile 寫 ROM
//      （mame.js 有 export FS_createDataFile / FS_createPath）
//   3. mame.js 已被 patch，加了 Module['callMain'] = callMain 和 Module['FS'] = FS
//   4. 寫完 ROM 後手動呼叫 Module.callMain(args)
// ─────────────────────────────────────────────────────────────────────────────

export interface MameWasmModule {
  // patched exports
  callMain?: (args: string[]) => void
  FS?: {
    mkdir: (path: string) => void
    writeFile: (path: string, data: Uint8Array, opts?: any) => void
    readFile: (path: string) => Uint8Array
    unlink: (path: string) => void
    analyzePath: (path: string) => { exists: boolean; object?: any }
    createPath: (parent: string, path: string, canRead: boolean, canWrite: boolean) => void
    createDataFile: (
      parent: string,
      name: string | null,
      data: string | Uint8Array,
      canRead: boolean,
      canWrite: boolean,
      canOwn?: boolean
    ) => void
  }
  // official emscripten exports in this build
  FS_createPath?: (parent: string, path: string, canRead: boolean, canWrite: boolean) => void
  FS_createDataFile?: (
    parent: string,
    name: string | null,
    data: string | Uint8Array,
    canRead: boolean,
    canWrite: boolean,
    canOwn?: boolean
  ) => void
  FS_createPreloadedFile: (...args: any[]) => void
  FS_unlink: (path: string) => void
  // emscripten standard
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
  cwrap?: (name: string, ret: string, args: string[]) => (...a: any[]) => any
}

export interface RomFile {
  /** MAME driver 名稱，同時是 rompath 下的子目錄（例如 "apple2"）*/
  driver: string
  /** 檔名（例如 "apple2.zip"）*/
  name: string
  /** 原始 bytes（zip/7z 格式，MAME 會自行解壓 zip）*/
  data: Uint8Array
}

export interface WasmLoaderOptions {
  /** MAME 啟動參數（driver + flags），不含 rompath（會自動加）*/
  driverArgs?: string[]
  /** 預先 fetch 好的 ROM 檔 */
  romFiles?: RomFile[]
  /** WASM 虛擬 FS 中的 rompath 根目錄（預設 /roms）*/
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
    // The id MUST be 'canvas' or SDL will fail to find the screen surface,
    // causing 'Optional memory region :screen not found' and Aborted().
    const existingCanvas = document.getElementById('canvas') as HTMLCanvasElement | null
    const canvas = existingCanvas ?? (() => {
      const c = document.createElement('canvas')
      c.id = 'canvas'  // MUST be 'canvas' - Emscripten SDL hardcodes this
      c.className = 'emscripten'
      c.tabIndex = -1
      c.width = 640
      c.height = 480
      return c
    })()

    // Canvas MUST be in the DOM before we create the Module object,
    // otherwise SDL init races and loses the reference.
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
    console.log('[WasmLoader] ROM files:', romFiles.map(r => `${r.driver}/${r.name}`))

    let totalDeps = 0
    let maxDeps = 0
    let runtimeInitialized = false
    let rejected = false

    const fail = (msg: string) => {
      if (!rejected) {
        rejected = true
        onError?.(msg)
        reject(new Error(msg))
      }
    }

    const Module: any = {
      // KEY CHANGE: Use Module.arguments, NOT noInitialRun + callMain.
      // The original mame.html works this way - MAME runs automatically
      // after FS init. The noInitialRun+callMain approach triggers a
      // C++ exception handling bug in this WASM build causing Abort().
      arguments: finalArgs,

      // Assign canvas directly - this is the correct Emscripten SDL binding
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

      // NOTE: preRun fires BEFORE FS.init, so we cannot write files there.
      // Instead we use onRuntimeInitialized which fires after FS is ready.
      // We use addRunDependency to pause MAME's main() until ROMs are written.
      preRun: [function() {
        const FS = (window as any).FS
        if (!FS) return  // FS not ready yet - will write in onRuntimeInitialized
        console.log('[WasmLoader] preRun: FS pre-check ok')
      }],

      onRuntimeInitialized: function() {
        runtimeInitialized = true
        const m = (window as any).Module as MameWasmModule
        _moduleRef = m

        console.log('[WasmLoader] Runtime initialized, writing ROMs then MAME will auto-start.')
        console.log('[WasmLoader] Module.FS available:', !!(m as any).FS)

        // Write ROMs NOW - FS is ready after onRuntimeInitialized
        if (romFiles.length > 0) {
          writeRoms(m, romFiles, romPath, onLog)
        }

        canvas.style.display = ''
        onProgress?.(100, 100)
        onReady?.(m)
        resolve(m)
      },

      onAbort: (what: string) => {
        const msg = `MAME aborted: ${what}`
        console.error('[WasmLoader]', msg)
        onLog?.(msg, true)
        if (!runtimeInitialized) fail(msg)
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
        if (isErr && !runtimeInitialized) {
          fail(`MAME exited with code ${code} before runtime initialized`)
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
    script.onload = () => console.log('[WasmLoader] mame.js loaded, MAME will auto-start...')
    script.onerror = () => fail(`Failed to load: ${jsUrl}`)
    document.head.appendChild(script)
  })
}

import { unzipSync } from 'fflate'

/**
 * 把 ROM 寫入 WASM 虛擬 FS。
 * 必須在 onRuntimeInitialized 之後才能呼叫（FS 才就緒）。
 * 在這裡我們使用 fflate 將 ZIP 解壓縮，逐一寫入個別 ROM 檔。
 */
function writeRoms(
  mod: MameWasmModule,
  romFiles: RomFile[],
  romPath: string,
  onLog?: (line: string, isError: boolean) => void
) {
  for (const rom of romFiles) {
    if (rom.name.endsWith('.zip')) {
      try {
        const unzipped = unzipSync(rom.data)
        const driverDir = `${romPath}/${rom.driver}`
        
        // 建立 driver folder
        if (mod.FS) {
          try { mod.FS.mkdir(romPath) } catch { /* ok */ }
          try { mod.FS.mkdir(driverDir) } catch { /* ok */ }
        } else if (mod.FS_createDataFile) {
          try { mod.FS_createPath?.('/', 'roms', true, true) } catch { /* ok */ }
          try { mod.FS_createPath?.(romPath, rom.driver, true, true) } catch { /* ok */ }
        }

        // 寫入每一個檔案
        let writeCount = 0
        for (const [filename, fileData] of Object.entries(unzipped)) {
          // fflate 的 unzipSync 會包含目錄項 (長度0，結尾有 /)
          if (fileData.length === 0 || filename.endsWith('/')) continue
          
          // 如果 ZIP 內原本就帶有 driver 目錄 (如 apple2/341-xxx.e0)，我們取出 basename 
          const baseName = filename.split('/').pop() || filename
          const fileFullPath = `${driverDir}/${baseName}`

          if (mod.FS) {
            mod.FS.writeFile(fileFullPath, fileData)
            writeCount++
          } else if (mod.FS_createDataFile) {
            mod.FS_createDataFile(driverDir, baseName, fileData, true, true, true)
            writeCount++
          }
        }
        
        const msg = `[FS] Extracted and wrote ${writeCount} files from ${rom.name} to ${driverDir}`
        console.log('[WasmLoader]', msg)
        onLog?.(msg, false)

      } catch (e: any) {
        console.error('[WasmLoader] Failed to unzip and write ROM:', e)
        onLog?.(`Failed to unzip and write ${rom.name}: ${e?.message}`, true)
      }
    } else {
      // 非 ZIP 檔案的處理，我們目前不支援
      onLog?.(`Skipped non-zip file: ${rom.name}`, true)
    }
  }
}



// ─────────────────────────────────────────────────────────────────────────────
// fetchRom：從 URL 取得 ROM 並包裝成 RomFile
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRom(
  url: string,
  driver: string,
  filename?: string
): Promise<RomFile> {
  const resp = await fetch(url)
  // Vite 在開發模式下如果找不到檔案，有時會回傳 index.html (200 OK, 但 content-type 是 text/html)
  // 或是直接回 404。必須確保抓到的是二進位檔。
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  }
  const contentType = resp.headers.get('content-type')
  if (contentType && contentType.includes('text/html')) {
    throw new Error(`Failed to fetch ${url}: Server returned HTML (probably 404 fallback)` )
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
