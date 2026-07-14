/* ============================================
   DashboardExecutivo — Visão Executiva Financeira e Operacional
   Orquestrador com sub-componentes memoizados
   URL: /dashboard/executivo
   ============================================ */

import { useCallback } from 'react';
import {
  FiRefreshCw, FiShare2, FiBarChart2, FiClock,
  FiAlertCircle, FiLayout,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import { useDashboardExecutivo } from '../hooks/useDashboardExecutivo';
import { gerarHtmlExecutivoCompartilhavel, baixarHtmlExecutivo, abrirHtmlExecutivoNovaAba } from '../utils/gerarHtmlExecutivo';
import ExecutivoLayoutModal from '../components/ExecutivoLayoutModal';
import DashboardFiltros from '../components/dashboard/DashboardFiltros';
import DashboardKPIs from '../components/dashboard/DashboardKPIs';
import DashboardGraficos from '../components/dashboard/DashboardGraficos';
import DashboardTabela from '../components/dashboard/DashboardTabela';
import { formatarDataISO, formatarHoraISO } from '../components/dashboard/dashboardUtils';
import '../styles/ExecutivoDashboard.css';

export default function DashboardExecutivo() {
  const { adicionarToast } = useToast();
  const {
    dados,
    carregando,
    erro,
    cacheIdade,
    atualizandoFundo,
    filtrosGA,
    periodoExibicao,
    filtros,
    handleFiltrosChange,
    setFiltrosProntos,
    handleRefresh,
    exportandoHtml,
    setExportandoHtml,
    widgetsAtivos,
    modalLayoutAberto,
    setModalLayoutAberto,
    widgetAtivo,
    aplicarLayout,
  } = useDashboardExecutivo();

  const handleCompartilhar = useCallback(() => {
    if (!dados) {
      adicionarToast('Carregue os dados antes de compartilhar', 'warning');
      return;
    }
    setExportandoHtml(true);
    try {
      const escopo = filtros.servicoLabel
        ? `${filtros.contratoLabel || 'Contrato'}_${filtros.servicoLabel}`
        : filtros.contratoLabel || 'Consolidado';
      const dataStr = new Date().toISOString().slice(0, 10);
      const filename = `Dashboard_Executivo_${escopo.replace(/[^a-zA-Z0-9._-]/g, '_')}_${dataStr}`;

      const html = gerarHtmlExecutivoCompartilhavel(dados, {
        contratoNome: filtros.contratoLabel || 'Todos os contratos',
        servicoNome: filtros.servicoLabel,
      });

      baixarHtmlExecutivo(html, filename);
      abrirHtmlExecutivoNovaAba(html);
      adicionarToast('Relatório HTML gerado! O arquivo foi baixado e aberto em nova aba.', 'success');
    } catch (err) {
      console.error('[Compartilhar]', err);
      adicionarToast('Erro ao gerar relatório HTML', 'error');
    } finally {
      setExportandoHtml(false);
    }
  }, [dados, filtros, adicionarToast, setExportandoHtml]);

  const filtrosBar = (
    <DashboardFiltros
      carregando={carregando}
      filtrosGA={filtrosGA}
      periodoExibicao={periodoExibicao}
      onFiltrosChange={handleFiltrosChange}
      onRefresh={handleRefresh}
      onReadyChange={setFiltrosProntos}
    />
  );

  if (carregando) {
    return (
      <div className="executivo-container">
        {filtrosBar}
        <div className="exec-header">
          <div>
            <div className="exec-skeleton" style={{ height: '28px', width: '300px', marginBottom: '0.5rem' }} />
            <div className="exec-skeleton" style={{ height: '14px', width: '200px' }} />
          </div>
        </div>
        <div className="exec-skeleton" style={{ height: '48px', width: '100%', marginBottom: '1rem' }} />
        <div className="financeiro-grid">
          {[1, 2, 3, 4].map(i => <div key={i} className="exec-skeleton" style={{ height: '120px' }} />)}
        </div>
        <div className="operacional-grid">
          {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="exec-skeleton" style={{ height: '80px' }} />)}
        </div>
        <div className="graficos-row-2">
          <div className="grafico-card"><div className="exec-skeleton" style={{ height: '200px' }} /></div>
          <div className="grafico-card"><div className="exec-skeleton" style={{ height: '200px' }} /></div>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="executivo-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        {filtrosBar}
        <FiAlertCircle size={48} style={{ color: '#ef4444', opacity: 0.5, marginBottom: '1rem' }} />
        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Erro ao carregar</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>{erro}</p>
        <button className="btn btn-primary" onClick={handleRefresh}>
          <FiRefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="executivo-container" style={{ textAlign: 'center', paddingTop: '3rem' }}>
        {filtrosBar}
        <FiBarChart2 size={48} style={{ color: '#22c55e', opacity: 0.3, marginBottom: '1rem' }} />
        <h3 style={{ color: '#475569', marginBottom: '0.5rem' }}>Dashboard Executivo</h3>
        <p style={{ color: '#94a3b8', marginBottom: '1.5rem' }}>
          Navegue pelo ciclo do contrato ou clique em &quot;Atualizar&quot; para carregar os indicadores.
        </p>
        <button className="btn btn-primary" onClick={handleRefresh}>
          <FiBarChart2 size={14} /> Carregar Dados
        </button>
      </div>
    );
  }

  const { periodo: p } = dados;

  return (
    <div className="executivo-container">
      {filtrosBar}

      <div className="exec-header">
        <div>
          <h1>
            <FiBarChart2 size={22} />
            Dashboard Executivo
          </h1>
          <div className="data-geracao">
            <FiClock size={12} />
            {p.label}
            {(filtros.contratoLabel || filtros.servicoLabel) && (
              <> • {filtros.servicoLabel
                ? `${filtros.contratoLabel} / ${filtros.servicoLabel}`
                : filtros.contratoLabel}</>
            )}
            {' • '}Atualizado {formatarDataISO(dados.metadados.dataGeracao)} às {formatarHoraISO(dados.metadados.dataGeracao)}
            {cacheIdade > 0 && (
              <span className={`cache-badge ${cacheIdade > 3600 ? 'aged' : ''}`}>
                {atualizandoFundo
                  ? 'Atualizando em segundo plano…'
                  : dados.metadados.cacheHit
                    ? `Cache do servidor · ${cacheIdade >= 3600
                      ? Math.floor(cacheIdade / 3600) + 'h'
                      : cacheIdade >= 60
                        ? Math.floor(cacheIdade / 60) + 'min'
                        : cacheIdade + 's'} atrás`
                    : `Dados de ${cacheIdade >= 3600
                      ? Math.floor(cacheIdade / 3600) + 'h'
                      : cacheIdade >= 60
                        ? Math.floor(cacheIdade / 60) + 'min'
                        : cacheIdade + 's'} atrás`}
              </span>
            )}
          </div>
        </div>
        <div className="exec-actions">
          <button
            className="btn-personalizar"
            onClick={() => setModalLayoutAberto(true)}
            title="Escolher quais indicadores e gráficos exibir"
          >
            <FiLayout size={13} /> Personalizar
          </button>
          <button
            className="btn-compartilhar"
            onClick={handleCompartilhar}
            disabled={exportandoHtml || !dados}
            title="Baixar relatório HTML para abrir em qualquer computador"
          >
            <FiShare2 size={13} /> {exportandoHtml ? 'Gerando...' : 'Compartilhar'}
          </button>
          <button
            className={`btn-refresh-moderno compact ${cacheIdade > 60 ? 'stale pulse' : ''}`}
            onClick={handleRefresh}
            title={cacheIdade > 60 ? `Dados de ${Math.floor(cacheIdade / 60)}min atrás — clique para atualizar` : 'Atualizar dados'}
          >
            <FiRefreshCw size={12} />
            <span className="refresh-text">Atualizar</span>
          </button>
        </div>
      </div>

      <DashboardKPIs dados={dados} widgetsAtivos={widgetsAtivos} widgetAtivo={widgetAtivo} />
      <DashboardGraficos dados={dados} widgetsAtivos={widgetsAtivos} widgetAtivo={widgetAtivo} />
      <DashboardTabela dados={dados} widgetAtivo={widgetAtivo} />

      {modalLayoutAberto && (
        <ExecutivoLayoutModal
          ativo={widgetsAtivos}
          onSalvar={aplicarLayout}
          onFechar={() => setModalLayoutAberto(false)}
        />
      )}

      <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1rem', flexWrap: 'wrap', fontSize: '0.68rem', color: '#94a3b8' }}>
        <span>{dados.metadados.totalRegistrosAtual.toLocaleString('pt-BR')} registros no período</span>
        <span>{dados.metadados.totalRegistrosAnterior.toLocaleString('pt-BR')} registros no período anterior</span>
        <span>{dados.metadados.totalAbastecimentosAtual} abastecimentos</span>
      </div>
    </div>
  );
}
