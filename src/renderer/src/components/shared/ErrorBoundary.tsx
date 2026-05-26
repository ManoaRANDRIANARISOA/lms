/**
 * ErrorBoundary.tsx — Global Error Boundary
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * @module components/shared/ErrorBoundary
 */

import React from 'react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error', error, errorInfo)
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-red-600">
          <h1 className="text-2xl font-bold mb-4">Une erreur est survenue</h1>
          <pre className="bg-gray-100 p-4 rounded overflow-auto text-sm">
            {this.state.error?.toString()}
          </pre>
          <button
            className="mt-4 px-4 py-2 bg-primary text-white rounded"
            onClick={() => window.location.reload()}
          >
            Recharger l'application
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
