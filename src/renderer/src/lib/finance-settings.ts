export interface FinancePrices {
  tuition: Record<string, number>
  classes: string[]
  registration: number
  reenrollment: number
  canteen: {
    daily: number
    monthly: number
  }
  bus: Record<string, number>
  busRoutes: string[]
  uniforms: Record<string, number>
  uniformItems: string[]
}

export const defaultPrices: FinancePrices = {
  tuition: {
    PS: 60000,
    MS: 60000,
    GS: 60000,
    CP: 70000,
    CE1: 70000,
    CE2: 70000,
    CM1: 80000,
    CM2: 80000,
    '6ème': 90000,
    '5ème': 90000,
    '4ème': 100000,
    '3ème': 100000,
    Seconde: 110000,
    Première: 110000,
    Terminale: 120000
  },
  classes: [
    'PS',
    'MS',
    'GS',
    'CP',
    'CE1',
    'CE2',
    'CM1',
    'CM2',
    '6ème',
    '5ème',
    '4ème',
    '3ème',
    'Seconde',
    'Première',
    'Terminale'
  ],
  registration: 20000,
  reenrollment: 10000,
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
