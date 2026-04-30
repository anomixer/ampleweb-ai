import { create } from 'zustand'

interface StoreState {
  theme: 'light' | 'dark'
  toggleTheme: () => void
}

export const useStore = create<StoreState>((set) => ({
  theme: (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') as 'light' | 'dark',
  toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}))