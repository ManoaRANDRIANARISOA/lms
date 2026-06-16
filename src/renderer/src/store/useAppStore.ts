import { create } from 'zustand'

interface AppState {
  currentYear: string
  setCurrentYear: (year: string) => void
  fetchSettings: () => Promise<void>
}

export const useAppStore = create<AppState>((set) => ({
  currentYear: '',
  setCurrentYear: (year: string) => set({ currentYear: year }),
  fetchSettings: async () => {
    try {
      const year = (await window.api.settings.get('school_year')) as string
      if (year) {
        set({ currentYear: year.replace(/['"]/g, '').trim() })
      }
    } catch (e) {
      console.error('Failed to load global settings', e)
    }
  }
}))
