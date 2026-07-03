import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const { tab = 'this section' } = this.props

    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-5 p-8 text-center">
        <div className="w-12 h-12 rounded-2xl bg-red/10 border border-red/20 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-red" />
        </div>
        <div>
          <p className="text-sm font-bold text-white mb-1">Something went wrong in {tab}</p>
          <p className="text-xs text-text-dim max-w-xs leading-relaxed">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          className="flex items-center gap-2 text-xs font-bold bg-white/5 border border-white/10 hover:bg-white/10 px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      </div>
    )
  }
}
