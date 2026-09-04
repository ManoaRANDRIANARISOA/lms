import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ReadOnlyBanner from '@/components/shared/ReadOnlyBanner'
import FinanceJournal from '@/pages/finance/FinanceJournal'
import FinanceConfig from '@/pages/finance/FinanceConfig'
import { usePermissions } from '@/lib/usePermissions'

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState('journal')
  const [refreshKey, setRefreshKey] = useState(0)
  const { canRead } = usePermissions()
  const canAccessSettings = canRead('settings')

  const handleTabChange = (value: string) => {
    if (value === 'journal') setRefreshKey((k) => k + 1)
    setActiveTab(value)
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <ReadOnlyBanner resource="payments" />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Module Finance</h1>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="journal">Journal de Caisse</TabsTrigger>
          {canAccessSettings && <TabsTrigger value="settings">Configuration</TabsTrigger>}
        </TabsList>

        <TabsContent value="journal">
          <FinanceJournal key={`journal-${refreshKey}`} />
        </TabsContent>

        {canAccessSettings && (
          <TabsContent value="settings">
            <FinanceConfig />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
