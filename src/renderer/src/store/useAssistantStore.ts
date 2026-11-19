import { create } from 'zustand'

export interface AssistantFinding {
  id: string
  category: string
  classification: 'auto' | 'decision'
  severity: 'high' | 'medium' | 'low'
  title: string
  detail: string
  recommendation: string
  action: string
  params: Record<string, any>
  affectedCount: number
  amountImpact?: number
  evidence?: Record<string, any>
}

export interface AssistantScanResult {
  success: boolean
  stationCode?: string
  schoolYear?: string
  scannedAt?: string
  cloudAvailable?: boolean
  autoCount?: number
  decisionCount?: number
  findings?: AssistantFinding[]
  error?: string
}

interface AssistantState {
  // Persisté hors du composant : changer de page ne réinitialise plus le scan
  // (l'Assistant reste consultable sans relancer une analyse à chaque navigation).
  result: AssistantScanResult | null
  setResult: (result: AssistantScanResult | null) => void
}

export const useAssistantStore = create<AssistantState>((set) => ({
  result: null,
  setResult: (result) => set({ result })
}))