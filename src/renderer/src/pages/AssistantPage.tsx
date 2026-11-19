import React from 'react'
import { DataConsistencyAssistant } from '@/components/settings/DataConsistencyAssistant'

export default function AssistantPage(): React.JSX.Element {
  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assistant de cohérence</h1>
        <p className="text-sm text-gray-500">
          Diagnostic et remédiation non destructive des données de ce poste, accessible à la Direction.
        </p>
      </div>
      <DataConsistencyAssistant />
    </div>
  )
}