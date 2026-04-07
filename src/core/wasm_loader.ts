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
    const existingCanvas = document.getElementById('mame-canvas') as HTMLCanvasElement | null
    const canvas = existingCanvas ?? (() => {
      const c = document.createElement('canvas')
      c.id = 'mame-canvas'
      c.className = 'emscripten'
      c.tabIndex = -1
      c.width = 640
      c.height = 480
      return c
    })()

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

    // ── onRuntimeInitialized：FS 已就緒，寫 ROM，然後 callMain ──
    function onRuntimeInit(this: void) {
      runtimeInitialized = true
      const mod = (window as any).Module as MameWasmModule
      _moduleRef = mod

      console.log('[WasmLoader] Runtime initialized.')
      console.log('[WasmLoader] Module.FS available:', !!mod.FS)
      console.log('[WasmLoader] Module.callMain available:', !!mod.callMain)
      console.log('[WasmLoader] Module.FS_createDataFile available:', !!mod.FS_createDataFile)

      // ── 寫入 ROM 檔 ──
      if (romFiles.length > 0) {
        writeRoms(mod, romFiles, romPath, onLog)
      }

      // ── 通知 UI Ready ──
      onProgress?.(100, 100)
      onReady?.(mod)
      resolve(mod)

      // ── 手動 callMain（因為 noInitialRun: true）──
      // 必須確保 canvas 在 DOM 樹上，否則 SDL 初始化會當機
      if (!canvas.parentElement) {
        // 先暫時塞在 body 底下隱藏起來，等 React render 時會把它搬走
        canvas.style.display = 'none'
        document.body.appendChild(canvas)
      }

      if (mod.callMain) {
        // 在真正啟動前把它顯示出來，確保長寬正常
        canvas.style.display = ''
        console.log('[WasmLoader] Calling Module.callMain with args:', finalArgs)
        onLog?.('Calling MAME main()...', false)
        try {
          mod.callMain!(finalArgs)
        } catch (e: any) {
          // MAME 的 quit() 會 throw，這是正常的
          const code = typeof e === 'number' ? e : e?.message
          if (typeof e === 'number' && e === 0) {
            onLog?.('MAME exited normally (code 0)', false)
          } else {
            onLog?.(`MAME exited with: ${code}`, true)
            console.warn('[WasmLoader] callMain threw:', e)

            // Look for exception string pointer (commonly located at e or e+4 or e+8)
            if (typeof e === 'number' && typeof (mod as any).HEAPU8 !== 'undefined') {
              const heap = (mod as any).HEAPU8
              try {
                const HEAP32 = new Int32Array(heap.buffer)
                for (let i = 0; i < 4; i++) {
                  let strPtr = HEAP32[(e >> 2) + i]
                  if (strPtr > 0 && strPtr < heap.length) {
                    let str = ''
                    while (heap[strPtr] !== 0) str += String.fromCharCode(heap[strPtr++])
                    if (str.length > 5) {
                      console.warn(`[WasmLoader] Potential exception string at offset ${i*4}:`, str)
                      if (str.includes('missing') || str.includes('NOT FOUND') || str.includes('Error:')) {
                        onLog?.(`MAME Error: ${str}`, true)
                      }
                    }
                  }
                }
              } catch (memErr) {}
            }
          }
        }
      } else {
        // fallback：讓 mame.js 自動跑（理論上 noInitialRun:true 時不會）
        console.warn('[WasmLoader] Module.callMain not available! Using auto-run.')
        onLog?.('Warning: callMain not exported, falling back to auto-run', true)
      }
    }

    const Module: any = {
      canvas,
      // noInitialRun: true → 讓我們在 onRuntimeInitialized 後手動 callMain
      noInitialRun: true,

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

      onRuntimeInitialized: onRuntimeInit,

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
    script.onload = () => console.log('[WasmLoader] mame.js loaded, awaiting runtime init...')
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
