import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Evita tela branca no layout quando uma página quebra no render.
 */
export default class PageErrorBoundary extends Component<
  { children: ReactNode; fallbackHref?: string },
  { erro: string | null }
> {
  state = { erro: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { erro: error?.message || 'Erro ao renderizar a página' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary]', error, info?.componentStack);
  }

  render() {
    if (this.state.erro) {
      const href = this.props.fallbackHref || '/contratos';
      return (
        <div style={{
          maxWidth: 560,
          margin: '3rem auto',
          padding: '1.5rem',
          background: '#fff',
          border: '1px solid #fecaca',
          borderRadius: 12,
          color: '#7f1d1d',
        }}>
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>A tela não pôde ser aberta</h2>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#991b1b' }}>
            {this.state.erro}
          </p>
          <a
            href={href}
            style={{
              display: 'inline-flex',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#4338ca',
            }}
          >
            Voltar
          </a>
        </div>
      );
    }
    return this.props.children;
  }
}
