import { create } from 'zustand'
import type { CashJournalEntry, CashJournalFilters } from '@shared/types'
import { handleStoreError } from '@/lib/store-utils'

interface CashJournalState {
  entries: CashJournalEntry[]
  dailyBalance: { total_income: number; total_expense: number; balance: number } | null
  monthlyBalance: { total_income: number; total_expense: number; balance: number } | null
  totalBalance: { total_income: number; total_expense: number; balance: number }
  loading: boolean
  error: string | null

  fetchEntries: (filters?: CashJournalFilters) => Promise<void>
  createEntry: (data: Omit<CashJournalEntry, 'id' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; id?: string; error?: string }>
  updateEntry: (id: string, updates: Partial<CashJournalEntry>) => Promise<{ success: boolean; error?: string }>
  deleteEntry: (id: string) => Promise<{ success: boolean; error?: string }>
  fetchDailyBalance: (date: string) => Promise<void>
  fetchMonthlyBalance: (year: number, month: number) => Promise<void>
  fetchTotalBalance: () => Promise<void>
}

export const useCashJournalStore = create<CashJournalState>((set) => ({
  entries: [],
  dailyBalance: null,
  monthlyBalance: null,
  totalBalance: { total_income: 0, total_expense: 0, balance: 0 },
  loading: false,
  error: null,

  fetchEntries: async (filters?: CashJournalFilters) => {
    set({ loading: true, error: null })
    try {
      const result = await window.api.cashJournal.list(filters)
      if (result.success) {
        set({ entries: result.entries || [], loading: false })
      } else {
        set({ error: result.error || 'Erreur de chargement', loading: false })
      }
    } catch (error: unknown) {
      handleStoreError(error, set, 'Fetch entries')
    }
  },

  createEntry: async (data) => {
    try {
      const result = await window.api.cashJournal.create(data)
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de création'
      return { success: false, error: message }
    }
  },

  updateEntry: async (id, updates) => {
    try {
      const result = await window.api.cashJournal.update(id, updates)
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de modification'
      return { success: false, error: message }
    }
  },

  deleteEntry: async (id) => {
    try {
      const result = await window.api.cashJournal.delete(id)
      return result
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Erreur de suppression'
      return { success: false, error: message }
    }
  },

  fetchDailyBalance: async (date: string) => {
    try {
      const result = await window.api.cashJournal.getDailyBalance(date)
      if (result.success) {
        set({ dailyBalance: result.balance || null })
      }
    } catch {
      // Silently fail for balance queries
    }
  },

  fetchMonthlyBalance: async (year: number, month: number) => {
    try {
      const result = await window.api.cashJournal.getMonthlyBalance(year, month)
      if (result.success) {
        set({ monthlyBalance: result.balance || null })
      }
    } catch {
      // Silently fail for balance queries
    }
  },

  fetchTotalBalance: async () => {
    try {
      const result = await window.api.cashJournal.getTotalBalance()
      if (result.success && result.balance) {
        set({ totalBalance: result.balance })
      }
    } catch {
      // Silently fail
    }
  }
}))
