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

      set(() => {
        if (savedPrices && typeof savedPrices === 'object') {
          // Detect and heal legacy v1.0.12 test artifacts (20 000 Ar / 10 000 Ar)
          const rawReg = Number(savedPrices.registration)
          const rawReen = Number(savedPrices.reenrollment)
          const isLegacyPlaceholder = rawReg === 20000 && rawReen === 10000

          const reg = !isLegacyPlaceholder && rawReg > 0 ? rawReg : defaultPrices.registration
          const reen = !isLegacyPlaceholder && rawReen > 0 ? rawReen : defaultPrices.reenrollment
          const fram = Number(savedPrices.fram) > 0 ? Number(savedPrices.fram) : defaultPrices.fram

          const safeTuition =
            savedPrices.tuition && Object.keys(savedPrices.tuition).length > 0
              ? { ...defaultPrices.tuition, ...savedPrices.tuition }
              : { ...defaultPrices.tuition }

          const safeBus =
            savedPrices.bus && Object.keys(savedPrices.bus).length > 0
              ? { ...savedPrices.bus }
              : { ...defaultPrices.bus }

          const safeBusRoutes =
            savedPrices.busRoutes && savedPrices.busRoutes.length > 0
              ? [...savedPrices.busRoutes]
              : Object.keys(safeBus)

          const safeUniforms =
            savedPrices.uniforms && Object.keys(savedPrices.uniforms).length > 0
              ? { ...savedPrices.uniforms }
              : { ...defaultPrices.uniforms }

          const safeUniformItems =
            savedPrices.uniformItems && savedPrices.uniformItems.length > 0
              ? [...savedPrices.uniformItems]
              : Object.keys(safeUniforms)

          const safeCanteen = {
            daily: Number(savedPrices.canteen?.daily) || defaultPrices.canteen.daily,
            monthly: Number(savedPrices.canteen?.monthly) || defaultPrices.canteen.monthly
          }

          return {
            prices: {
              ...defaultPrices,
              ...savedPrices,
              registration: reg,
              reenrollment: reen,
              fram,
              classes: savedPrices.classes || defaultPrices.classes,
              tuition: safeTuition,
              canteen: safeCanteen,
              bus: safeBus,
              busRoutes: safeBusRoutes,
              uniforms: safeUniforms,
              uniformItems: safeUniformItems
            },
            loading: false
          }
        }
        return { prices: defaultPrices, loading: false }
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
