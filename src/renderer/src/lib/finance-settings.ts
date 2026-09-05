export interface FinancePrices {
  tuition: Record<string, number>
  classes: string[]
  fram: number
  registration: number
  reenrollment: number
  canteen: {
    daily: number
    monthly: number
  }
  bus: Record<string, number>
  busRoutes: string[]
  deletedBusRoutes?: string[]
  uniforms: Record<string, number>
  uniformItems: string[]
  deletedUniformItems?: string[]
}

export const CLASS_ALIASES: Record<string, string[]> = {
  CP: ['CP1', 'CP2', 'CP'],
  Seconde: ['2nde', '2nde A', '2nde C', 'Seconde', 'Seconde A', 'Seconde C'],
  Première: ['1ère', '1ère L', '1ère S', 'Première', 'Première L', 'Première S'],
  Terminale: ['Terminale', 'TA', 'TD', 'Terminale A', 'Terminale D', 'Tle']
}

export function getCanonicalClassName(className: string): string {
  const clean = className.trim()
  for (const [canonical, aliases] of Object.entries(CLASS_ALIASES)) {
    if (aliases.some((a) => a.toLowerCase() === clean.toLowerCase())) {
      return canonical
    }
  }
  return clean
}

export function resolveClassPrice(tuition: Record<string, number> | undefined, className: string): number {
  if (!tuition) return defaultPrices.tuition[className] || 0
  if (tuition[className] !== undefined && Number(tuition[className]) > 0) {
    return Number(tuition[className])
  }
  const canonical = getCanonicalClassName(className)
  if (tuition[canonical] !== undefined && Number(tuition[canonical]) > 0) {
    return Number(tuition[canonical])
  }
  for (const [canon, aliases] of Object.entries(CLASS_ALIASES)) {
    if (canon.toLowerCase() === canonical.toLowerCase() || aliases.some((a) => a.toLowerCase() === className.toLowerCase())) {
      for (const a of aliases) {
        if (tuition[a] !== undefined && Number(tuition[a]) > 0) return Number(tuition[a])
      }
      if (tuition[canon] !== undefined && Number(tuition[canon]) > 0) return Number(tuition[canon])
    }
  }
  return defaultPrices.tuition[className] || defaultPrices.tuition[canonical] || 0
}

export const defaultPrices: FinancePrices = {
  tuition: {
    PS: 60000,
    MS: 60000,
    GS: 60000,
    CP: 70000,
    CP1: 70000,
    CP2: 70000,
    CE1: 70000,
    CE2: 70000,
    CM1: 80000,
    CM2: 80000,
    '6ème': 90000,
    '5ème': 90000,
    '4ème': 100000,
    '3ème': 100000,
    Seconde: 110000,
    '2nde': 110000,
    Première: 110000,
    '1ère': 110000,
    Terminale: 120000,
    TA: 120000,
    TD: 120000
  },
  classes: [
    'PS',
    'MS',
    'GS',
    'CP1',
    'CP2',
    'CE1',
    'CE2',
    'CM1',
    'CM2',
    '6ème',
    '5ème',
    '4ème',
    '3ème',
    '2nde',
    '1ère',
    'TA',
    'TD'
  ],
  fram: 15000,
  registration: 145000,
  reenrollment: 115000,
  canteen: {
    daily: 2000,
    monthly: 40000
  },
  bus: {
    'Zone 1': 30000,
    'Zone 2': 40000,
    'Zone 3': 50000
  },
  busRoutes: ['Zone 1', 'Zone 2', 'Zone 3'],
  uniforms: {
    Tablier: 15000,
    'T-shirt': 10000,
    Survêtement: 25000,
    Badge: 5000
  },
  uniformItems: ['Tablier', 'T-shirt', 'Survêtement', 'Badge']
}
