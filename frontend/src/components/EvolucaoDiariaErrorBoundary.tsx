import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Evita tela em branco se o gráfico da evolução diária lançar erro de render. */
export default class EvolucaoDiariaErrorBoundary extends Component<
  { children: ReactNode; onFechar?: () => void },
  { erro: string | null }
> {
  state = { erro: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { erro: error?.message || 'Erro ao renderizar evolução diária' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[EvolucaoDiaria]', error, info?.componentStack);
  }

  render() {
    if (this.state.erro) {
      return (
        <div className="vg-tv-ed-overlay" role="alertdialog">
          <div className="vg-tv-ed-panel" style={{ padding: '1.5rem' }}>
            <div className="vg-tv-ed-msg erro">
              Falha ao abrir a Evolução Diária: {this.state.erro}
            </div>
            {this.props.onFechar && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                style={{ marginTop: '1rem', alignSelf: 'flex-start' }}
                onClick={this.props.onFechar}
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
