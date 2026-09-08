import { create } from 'zustand'
import { normalizeStationCode } from '@/lib/utils'

interface AppState {
  currentYear: string
  stationCode: string
  setCurrentYear: (year: string) => void
  setStationCode: (code: string) => void
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
  stationCode: 'C1',
  setCurrentYear: (year: string) => set({ currentYear: year }),
  setStationCode: (code: string) => set({ stationCode: normalizeStationCode(code) }),
  fetchSettings: async () => {
    try {
      if (window.api?.settings?.get) {
        const year = (await window.api.settings.get('school_year')) as string
        if (year && year.trim()) {
          set({ currentYear: year.replace(/['"]/g, '').trim() })
        } else {
          set({ currentYear: getDynamicSchoolYear() })
        }

        const station = (await window.api.settings.get('pos_station_code')) as string
        if (station) {
          set({ stationCode: normalizeStationCode(station) })
        }
      }
    } catch (e) {
      console.error('Failed to load global settings', e)
    }
  }
}))
