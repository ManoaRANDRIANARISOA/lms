import { create } from 'zustand'

interface AppState {
  currentYear: string
  setCurrentYear: (year: string) => void
  fetchSettings: () => Promise<void>
}

function getDynamicSchoolYear(): string {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`
}

export const useAppStore = create<AppState>((set) => ({
  currentYear: getDynamicSchoolYear(),
  setCurrentYear: (year: string) => set({ currentYear: year }),
  fetchSettings: async () => {
    try {
      const year = (await window.api.settings.get('school_year')) as string
      if (year && year.trim()) {
        set({ currentYear: year.replace(/['"]/g, '').trim() })
      } else {
        set({ currentYear: getDynamicSchoolYear() })
      }
    } catch (e) {
      console.error('Failed to load global settings', e)
    }
  }
}))
