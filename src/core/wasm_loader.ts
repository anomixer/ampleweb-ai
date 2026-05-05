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

/** Media file: filename + bytes + type (for args) */
export interface MediaFile {
  /** Filename e.g. "os7.dsk" */
  name: string
  /** Raw bytes */
  data: Uint8Array
  /** MAME media type e.g. "flop1", "hard1" */
  type: string
}

export interface WasmLoaderOptions {
  /** MAME args (driver + flags), -rompath is added automatically */
  driverArgs?: string[]
  /** Pre-fetched ROM ZIP files to inject into VFS */
  romFiles?: RomFile[]
  /** WASM virtual FS root for ROMs (default /roms) */
  romPath?: string
  /** Explicit JS bootstrap URL. If set, wasmUrl is used only for the .wasm file. */
  jsUrl?: string
  /** Media files to mount into VFS */
  mediaFiles?: MediaFile[]
  /** WASM virtual FS root for Media (default /media) */
  mediaPath?: string
  /** Audio samples to mount into VFS (default /samples) */
  sampleFiles?: RomFile[]
  onReady?: (module: MameWasmModule) => void
  onProgress?: (loaded: number, total: number) => void
  onError?: (error: string) => void
  onLog?: (line: string, isError: boolean) => void
  /** Local directory handle to mount to /share */
  localDirHandle?: FileSystemDirectoryHandle
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
      mediaFiles = [],
      sampleFiles = [],
      romPath = '/roms',
      mediaPath = '/media',
      onReady,
      onProgress,
      onError,
      onLog,
      localDirHandle,
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

    // Keep canvas in DOM (Emscripten SDL needs getElementById('canvas')).
    // It stays display:none until onReady moves it into the React container.
    // If not already in the container, place it there so flexbox centers it.
    if (!canvas.parentElement) {
      const container = document.querySelector('.emulator-container') as HTMLElement | null
      if (container) {
        container.appendChild(canvas)
      } else {
        document.body.appendChild(canvas)
      }
    }

    const jsUrl = opts.jsUrl ?? wasmUrl.replace('.wasm', '.js')

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

      /**
       * Custom instantiation to support GZIP decompression on the fly.
       */
      instantiateWasm: (info: any, receiveInstance: any) => {
        (async () => {
          try {
            console.log(`[WasmLoader] Fetching WASM from ${wasmUrl}...`)
            const response = await fetch(wasmUrl)
            if (!response.ok) throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)

            // Check if server already decompressed it (via Content-Encoding: gzip)
            const contentEncoding = response.headers.get('Content-Encoding')
            const isAlreadyDecompressed = contentEncoding === 'gzip'

            let wasmBuffer: ArrayBuffer
            if (wasmUrl.endsWith('.gz') && !isAlreadyDecompressed) {
              console.log('[WasmLoader] Decompressing GZIP WASM via DecompressionStream...')
              try {
                const ds = new (window as any).DecompressionStream('gzip')
                const decompressedStream = response.body!.pipeThrough(ds)
                wasmBuffer = await new Response(decompressedStream).arrayBuffer()
                console.log(`[WasmLoader] Decompression complete. Size: ${wasmBuffer.byteLength} bytes`)
              } catch (decompressErr: any) {
                console.error('[WasmLoader] Decompression failed:', decompressErr)
                throw new Error(`Decompression failed: ${decompressErr.message}`)
              }
            } else {
              if (isAlreadyDecompressed) {
                console.log('[WasmLoader] WASM was already decompressed by the browser/server.')
              }
              wasmBuffer = await response.arrayBuffer()
            }

            console.log('[WasmLoader] Instantiating WASM...')
            const result = await WebAssembly.instantiate(wasmBuffer, info)
            console.log('[WasmLoader] WASM Instantiated successfully.')
            receiveInstance(result.instance)
          } catch (e: any) {
            console.error('[WasmLoader] instantiateWasm failed:', e)
            fail(`WASM instantiation failed: ${e.message}`)
          }
        })()
        return {} // Return empty object to indicate async instantiation
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
              // Create intermediate directories for subdirectory paths (e.g., /roms/votrax/sc01a.bin)
              const dir = dest.substring(0, dest.lastIndexOf('/'))
              if (dir && dir !== romPath) {
                try { FS.mkdir(dir) } catch { /* exists */ }
              }
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

        if (sampleFiles.length > 0) {
          const samplePath = '/samples'
          try { FS.mkdir(samplePath) } catch { /* exists */ }
          Module.addRunDependency('sample-write')
          try {
            for (const s of sampleFiles) {
              const dest = `${samplePath}/${s.name}`
              const dir = dest.substring(0, dest.lastIndexOf('/'))
              if (dir && dir !== samplePath) {
                try { FS.mkdir(dir) } catch { /* exists */ }
              }
              FS.writeFile(dest, s.data)
              console.log('[WasmLoader] Wrote sample', dest)
              onLog?.(`[FS] ${dest} mounted`, false)
            }
          } catch (e: any) {
            console.error('[WasmLoader] Sample write error:', e)
          }
          Module.removeRunDependency('sample-write')
        }

        if (mediaFiles.length > 0) {
          Module.addRunDependency('media-write')
          try {
            FS.mkdir(mediaPath)
            for (const media of mediaFiles) {
              const dest = `${mediaPath}/${media.name}`
              FS.writeFile(dest, media.data)
              console.log('[WasmLoader] Wrote media', dest)
              onLog?.(`[FS] ${dest} mounted`, false)
            }
          } catch (e: any) {
            console.error('[WasmLoader] Media write failed:', e)
          }
          Module.removeRunDependency('media-write')
        }

        const sharePath = '/share'
        const snapPath = '/snap'
        try { FS.mkdir(sharePath) } catch { /* exists */ }
        try { FS.mkdir(snapPath) } catch { /* exists */ }

        if (localDirHandle) {
          Module.addRunDependency('local-dir-sync')

          // Recursive sync function
          const syncDir = async (handle: FileSystemDirectoryHandle, currentPath: string) => {
            try {
              console.log(`[WasmLoader] Scanning directory: ${currentPath}`)
              // @ts-ignore
              // @ts-ignore
              for await (const [name, entry] of (handle as any).entries()) {
                const dest = `${currentPath}/${name}`
                if (entry.kind === 'file') {
                  const file = await (entry as FileSystemFileHandle).getFile()
                  const buffer = await file.arrayBuffer()
                  FS.writeFile(dest, new Uint8Array(buffer))
                  console.log(`[WasmLoader] Synced: ${dest} (${buffer.byteLength} bytes)`)
                } else if (entry.kind === 'directory') {
                  try { FS.mkdir(dest) } catch { /* exists */ }
                  await syncDir(entry as FileSystemDirectoryHandle, dest)
                }
              }
            } catch (e: any) {
              console.error(`[WasmLoader] Error syncing ${currentPath}:`, e)
            }
          }

          syncDir(localDirHandle, sharePath)
            .then(() => {
              onLog?.(`[FS] Local directory synced to ${sharePath}`, false)
              Module.removeRunDependency('local-dir-sync')
            })
            .catch(e => {
              console.error('[WasmLoader] Local dir sync failed:', e)
              Module.removeRunDependency('local-dir-sync')
            })
        }
      }],

      onRuntimeInitialized: function () {
        console.log('[WasmLoader] Runtime initialized.')
        // Don't show canvas here — onReady moves it into the flex container first, then shows it.
        // Showing it here would flash it at the bottom of the page.
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

    // Clear global Module reference to avoid conflicts
    delete (window as any).Module
      ; (window as any).Module = Module

    // ── load mame.js bootstrap ──
    const existing = document.getElementById('mame-js-script')
    if (existing) existing.remove()

    const script = document.createElement('script')
    script.id = 'mame-js-script'
    // Add cache-buster to ensure fresh execution
    script.src = `${jsUrl}${jsUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
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

/**
 * Read a file from the Emscripten virtual filesystem.
 */
export function getVirtualFile(path: string): Uint8Array | null {
  try {
    const FS = (window as any).FS
    if (!FS) return null
    return FS.readFile(path)
  } catch (e) {
    console.warn(`[WasmLoader] Failed to read virtual file ${path}:`, e)
    return null
  }
}

/**
 * Get stats for a file in the Emscripten virtual filesystem.
 */
export function getVirtualFileStat(path: string): any | null {
  try {
    const FS = (window as any).FS
    if (!FS) return null
    return FS.stat(path)
  } catch (e) {
    return null
  }
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
    slots?: Record<string, string>
    extraArgs?: string[]
  video?: 'soft' | 'bgfx' | 'opengl' | 'none'
  resolution?: string
  noMaximize?: boolean
  skipGameInfo?: boolean
  window?: boolean
  aviWrite?: boolean
  wavWrite?: boolean
  videoMethod?: 'soft' | 'bgfx' | 'opengl'
  bgfxBackend?: string
  bgfxEffect?: string
  keepAspect?: boolean
  diskSound?: boolean
  cpuSpeed?: string
  debug?: boolean
  rewind?: boolean
} = {}
): string[] {
  const args: string[] = [driver]

  if (options.slots) {
    for (const [slot, value] of Object.entries(options.slots)) {
      if (value) args.push(`-${slot}`, value)
    }
  }

  args.push('-video', options.videoMethod ?? options.video ?? 'soft')
  args.push('-resolution', options.resolution ?? '640x480')
  if (options.window !== false) args.push('-window')
  if (options.noMaximize !== false) args.push('-nomaximize')
  if (options.skipGameInfo !== false) args.push('-skip_gameinfo')
  if (options.keepAspect === false) args.push('-nokeepaspect')
  if (options.diskSound !== false) {
    args.push('-samples')
    args.push('-samplepath', '/samples')
  }

  if (options.videoMethod === 'bgfx') {
    if (options.bgfxBackend && options.bgfxBackend !== 'auto') {
      args.push('-bgfx_backend', options.bgfxBackend)
    }
    if (options.bgfxEffect && options.bgfxEffect !== 'none') {
      args.push('-bgfx_screen_chains', options.bgfxEffect)
    }
  }

  if (options.cpuSpeed) {
    if (options.cpuSpeed === 'nothrottle') {
      args.push('-nothrottle')
    } else {
      const speedMult = parseFloat(options.cpuSpeed) / 100
      if (speedMult !== 1.0) {
        args.push('-speed', speedMult.toString())
      }
    }
  }
  if (options.debug) args.push('-debug')
  if (options.rewind) args.push('-rewind')
  if (options.aviWrite) {
    args.push('-snapshot_directory', 'snap')
    args.push('-aviwrite', 'output.avi')
  }
  if (options.wavWrite) args.push('-wavwrite', 'output.wav')

  if (options.extraArgs) args.push(...options.extraArgs)

  return args
}