// ─────────────────────────────────────────────────────────────────────────────
// wasm_loader.ts  —  MAME WASM loader
//
// Core strategy (reference test_mamewasm.html):
//   1. Module.arguments = auto-start (no noInitialRun + callMain)
//   2. preRun + addRunDependency pauses MAME startup
//   3. Write ROM ZIP directly to VFS in preRun, then removeRunDependency
//   4. MAME auto-executes callMain after dependencies resolve
//
// MAME handles ZIP internally (no need to unzip via JS).
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

/** ROM file: driver name + ZIP bytes */
export interface RomFile {
  /** MAME driver name e.g. "apple2e" */
  driver: string
  /** Filename e.g. "apple2e.zip" */
  name: string
  /** Raw ZIP bytes (MAME unzips internally) */
  data: Uint8Array
}

export interface WasmLoaderOptions {
  /** MAME args (driver + flags), -rompath is added automatically */
  driverArgs?: string[]
  /** Pre-fetched ROM ZIP files to inject into VFS */
  romFiles?: RomFile[]
  /** WASM virtual FS root for ROMs (default /roms) */
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
    // Emscripten SDL hardcodes document.getElementById('canvas')
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

    // MAME args: ensure -rompath is present
    const finalArgs = [...driverArgs]
    if (!finalArgs.includes('-rompath')) {
      finalArgs.push('-rompath', romPath)
    }

    console.log('[WasmLoader] url:', wasmUrl)
    console.log('[WasmLoader] js:', jsUrl)
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
      // Key: use Module.arguments for auto-start instead of noInitialRun + callMain
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

      // Core: preRun + addRunDependency pauses MAME startup
      // Write ROM ZIP files here, then removeRunDependency to release
      preRun: [function () {
        const FS = (window as any).FS
        if (!FS) {
          console.error('[WasmLoader] FS not available in preRun!')
          return
        }

        try { FS.mkdir(romPath) } catch { /* exists */ }

        if (romFiles.length > 0) {
          // Block MAME startup until ROM writes complete
          Module.addRunDependency('rom-write')

          try {
            for (const rom of romFiles) {
              const dest = `${romPath}/${rom.name}`
              FS.writeFile(dest, rom.data)
              const sizeKB = (rom.data.length / 1024).toFixed(0)
              console.log('[WasmLoader] Wrote', dest, `(${sizeKB} KB)`)
              onLog?.(`[FS] ${dest} (${sizeKB} KB)`, false)
            }
          } catch (e: any) {
            const msg = `Failed to write ROM: ${e?.message}`
            console.error('[WasmLoader]', msg)
            onLog?.(msg, true)
          }

          // Resume MAME startup
          Module.removeRunDependency('rom-write')
        }
      }],

      onRuntimeInitialized: function () {
        console.log('[WasmLoader] Runtime initialized.')
        canvas.style.display = ''
        onProgress?.(100, 100)
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
        if (!resolved && !rejected) {
          succeed(Module)
        }
      },
    }

    ;(window as any).Module = Module

    // ── load mame.js bootstrap ──
    const existing = document.getElementById('mame-js-script')
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = 'mame-js-script'
    script.src = jsUrl
    script.onload = () => {
      console.log('[WasmLoader] mame.js loaded.')
      // Wait for MAME to finish callMain before resolving
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
// fetchRom: GET a ROM ZIP from URL → RomFile
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchRom(
  url: string,
  driver: string,
  filename?: string,
): Promise<RomFile> {
  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`)
  }
  const contentType = resp.headers.get('content-type')
  if (contentType && contentType.includes('text/html')) {
    throw new Error(`Failed to fetch ${url}: server returned HTML (likely a 404 fallback)`)
  }
  const buf = await resp.arrayBuffer()
  const name = filename ?? url.split('/').pop() ?? 'rom.zip'
  return { driver, name, data: new Uint8Array(buf) }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildMameArgs: construct MAME command-line args for a driver
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