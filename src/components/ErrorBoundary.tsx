import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24, background: 'var(--bg)', color: 'var(--fg)' }}>
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8, lineHeight: 1.6 }}>
            {this.state.error.message}. Your data is still saved in this browser. Reload to try again.
          </p>
          <button
            onClick={() => location.reload()}
            style={{ marginTop: 16, padding: '8px 14px', borderRadius: 8, background: 'var(--fg)', color: 'var(--bg)', fontSize: 13, fontWeight: 500 }}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
