import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RomSettings {
  autoDownload: boolean
  downloadServers: string[]
}

export interface VideoSettings {
  windowMode: '1x' | '2x' | '3x' | '4x' | 'fit'
  captureMouse: boolean
  videoMethod: 'soft' | 'bgfx' | 'opengl'
  bgfxBackend: 'auto' | 'opengl' | 'gles' | 'vulkan'
  bgfxEffect: 'none' | 'scanlines' | 'crt-geom' | 'crt-geom-deluxe' | 'hq2x' | 'lcd-grid'
  keepAspect: boolean
}

export interface CpuSettings {
  speed: '100' | '200' | '300' | '400' | '500' | 'nothrottle'
  debug: boolean // to be disabled in UI
  rewind: boolean
}

export interface AvSettings {
  generateAvi: boolean
  generateWav: boolean
  diskSound: boolean
}

export interface PathSettings {
  mapLocalDir: boolean
  localDirPath: string | null
}

interface StoreState {
  theme: 'light' | 'dark'
  toggleTheme: () => void
  romSettings: RomSettings
  setRomSettings: (settings: RomSettings | ((prev: RomSettings) => RomSettings)) => void
  sidebarWidth: number
  setSidebarWidth: (width: number) => void
  configWidth: number
  setConfigWidth: (width: number) => void
  
  videoSettings: VideoSettings
  setVideoSettings: (settings: Partial<VideoSettings>) => void
  cpuSettings: CpuSettings
  setCpuSettings: (settings: Partial<CpuSettings>) => void
  avSettings: AvSettings
  setAvSettings: (settings: Partial<AvSettings>) => void
  pathSettings: PathSettings
  setPathSettings: (settings: Partial<PathSettings>) => void
}

export const useStore = create<StoreState>()(
  persist(
    (set) => ({
      theme: (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as 'light' | 'dark',
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
      romSettings: {
        autoDownload: false,
        downloadServers: [] as string[]
      },
      setRomSettings: (updater) => set((state) => ({
        romSettings: typeof updater === 'function' ? updater(state.romSettings) : updater
      })),
      sidebarWidth: 260,
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      configWidth: 320,
      setConfigWidth: (configWidth) => set({ configWidth }),

      videoSettings: { 
        windowMode: 'fit', 
        captureMouse: false,
        videoMethod: 'soft',
        bgfxBackend: 'auto',
        bgfxEffect: 'none',
        keepAspect: true
      },
      setVideoSettings: (settings) => set((state: any) => ({ videoSettings: { ...state.videoSettings, ...settings } })),
      cpuSettings: { speed: '100', debug: false, rewind: false },
      setCpuSettings: (settings) => set((state) => ({ cpuSettings: { ...state.cpuSettings, ...settings } })),
      avSettings: { generateAvi: false, generateWav: false, diskSound: false },
      setAvSettings: (settings) => set((state) => ({ avSettings: { ...state.avSettings, ...settings } })),
      pathSettings: { mapLocalDir: false, localDirPath: null },
      setPathSettings: (settings) => set((state) => ({ pathSettings: { ...state.pathSettings, ...settings } })),
    }),
    {
      name: 'ample-app-storage-v2', // Changed name to ensure fresh start
    }
  )
)