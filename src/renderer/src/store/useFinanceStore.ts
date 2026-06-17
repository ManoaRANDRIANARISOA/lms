import { create } from 'zustand'
import { FinancePrices, defaultPrices } from '@/lib/finance-settings'
import { handleStoreError } from '@/lib/store-utils'

interface FinanceState {
  prices: FinancePrices
  loading: boolean
  error: string | null
  fetchPrices: () => Promise<void>
  savePrices: (newPrices: FinancePrices) => Promise<void>
  getClasses: () => string[]
}

export const useFinanceStore = create<FinanceState>((set, get) => ({
  prices: defaultPrices,
  loading: false,
  error: null,

  fetchPrices: async () => {
    set({ loading: true, error: null })
    try {
      const savedPrices = (await window.api.settings.get(
        'finance_prices'
      )) as Partial<FinancePrices> | null

      set((state) => {
        if (savedPrices) {
          return {
            prices: {
              ...state.prices,
              ...savedPrices,
              classes: savedPrices.classes || state.prices.classes,
              tuition: { ...state.prices.tuition, ...(savedPrices.tuition || {}) },
              canteen: { ...state.prices.canteen, ...(savedPrices.canteen || {}) },
              bus: { ...state.prices.bus, ...(savedPrices.bus || {}) },
              uniforms: { ...state.prices.uniforms, ...(savedPrices.uniforms || {}) }
            },
            loading: false
          }
        }
        return { loading: false }
      })
    } catch (error: unknown) {
      handleStoreError(error, set, 'Load settings')
    }
  },

  savePrices: async (newPrices: FinancePrices) => {
    set({ loading: true, error: null })
    try {
      await window.api.settings.set('finance_prices', newPrices)
      set({ prices: newPrices, loading: false })
    } catch (error: unknown) {
      handleStoreError(error, set, 'Save settings')
      throw error
    }
  },

  getClasses: () => {
    const state = get()
    if (state.prices.classes && state.prices.classes.length > 0) {
      return state.prices.classes
    }
    return defaultPrices.classes
  }
}))
