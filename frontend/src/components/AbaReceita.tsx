import { useMemo } from 'react';
import { FiDollarSign, FiDownload } from 'react-icons/fi';
import GoogleFilterBar from './GoogleFilterBar';
import ChartGrid from './ChartGrid';
import GraficosRelatorioDiario from './GraficosRelatorioDiario';
import { agruparPorDia, fmtMoeda, fmtNum } from '../utils/relatorioDiario';
import type { GoogleFilterBarHandle } from './GoogleFilterBar'; // se existir, senão any
import type { KpiValor, ExecMetrics } from '../hooks/useKpiCalculator';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from './KpiEditor/KpiEditorTypes';

interface AbaReceitaProps {
  filtrosGA: any;
  dadosFiltradosGraficos: Record<string, unknown>[];
  kpisReceita: KpiConfig[];
  kpiValoresReceita: KpiValor[];
  graficosReceita: GraficoConfig[];
  graficosAtivos: GraficoConfig[];
  execMetrics: ExecMetrics | null;
  kpiValores: KpiValor[];
  kpis: KpiConfig[];
  receitaPorHora: number;
  loadingKpis: boolean;
  contractId?: string;
  servicoId?: string;
  filtrosCompletos: any;
  colunas: ColunaDetectada[];
  colunasHoraSet: Set<string>;
  onExportPdf: (tipo: 'receita') => void;
  onNavigateConfig: () => void;
  carregarDados: () => void;
  reloadKpis: () => void;
  onRecalcular: () => void;
}

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

function detectarValorFaturamento(receita: KpiValor[]) {
  return receita.find(v => v.nome.toLowerCase().includes('faturamento') || v.formato === 'moeda');
}

export default function AbaReceita({
  filtrosGA,
  dadosFiltradosGraficos,
  kpisReceita,
  kpiValoresReceita,
  graficosReceita,
  execMetrics,
  kpiValores,
  receitaPorHora,
  loadingKpis,
  contractId,
  servicoId,
  filtrosCompletos,
  colunasHoraSet,
  onExportPdf,
  onNavigateConfig,
}: AbaReceitaProps) {
  const faturamentoKpi = useMemo(() => detectarValorFaturamento(kpiValoresReceita), [kpiValoresReceita]);
  const temFaturamentoAuto = execMetrics && (execMetrics.faturamento || 0) > 0;

  // Valor por tonelada para o relatório
  const valorTonReceita = useMemo(() => {
    const fatKpiVal = kpiValoresReceita.find(v => v.formato === 'moeda' && Number(v.valor) > 0);
    const tonKpiVal = kpiValores.find(v => {
      const n = v.nome.toLowerCase();
      return n.includes('tonelada') || n.includes('ton.') || (n.includes('peso') && n.includes('total'));
    });
    if (fatKpiVal?.valor && tonKpiVal?.valor && Number(tonKpiVal.valor) > 0)
      return Number(fatKpiVal.valor) / Number(tonKpiVal.valor);
    if (execMetrics?.faturamento && execMetrics?.pesoTotalTon > 0)
      return execMetrics.faturamento / execMetrics.pesoTotalTon;
    return 80;
  }, [kpiValoresReceita, kpiValores, execMetrics]);

  const relatorioRec = useMemo(() => agruparPorDia(
    dadosFiltradosGraficos,
    Math.round(valorTonReceita * 100) / 100,
  ), [dadosFiltradosGraficos, valorTonReceita]);

  const formatarReceitaPorHora = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h';

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <GoogleFilterBar
        periodo={filtrosGA.periodo}
        comparacao={filtrosGA.comparacao}
        dimensoes={filtrosGA.dimensoes}
        totalRegistros={filtrosGA.totalRegistros}
        totalFiltrado={filtrosGA.totalFiltrado}
        variacaoPeriodo={filtrosGA.variacaoPeriodo}
        onSetPeriodo={filtrosGA.setPeriodo}
        onToggleComparacao={filtrosGA.toggleComparacao}
        onAdicionarFiltro={filtrosGA.adicionarFiltro}
        onRemoverFiltro={filtrosGA.removerFiltro}
        onLimparDimensao={filtrosGA.limparDimensao}
        onLimparTodos={filtrosGA.limparTodos}
        onRefresh={() => {}}
      />

      {/* ═══ BIG CARDS — PADRÃO RELATÓRIO DIÁRIO ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: '💰 Faturamento', value: fmtMoeda(relatorioRec.totais.faturamento), cor: '#10b981' },
          { label: '📊 R$/KM Médio', value: fmtMoeda(relatorioRec.totais.receitaKm), cor: '#f59e0b' },
          { label: '⏱️ R$/h Médio', value: fmtMoeda(relatorioRec.totais.receitaHora), cor: '#ef4444' },
          { label: '⚖️ R$/ton Médio', value: fmtMoeda(relatorioRec.totais.toneladas > 0 ? relatorioRec.totais.faturamento / relatorioRec.totais.toneladas : 0), cor: '#a855f7' },
          { label: '🚛 Total Viagens', value: fmtNum(relatorioRec.totais.viagens, 0), cor: '#3b82f6' },
          { label: '📏 Total KM', value: fmtNum(relatorioRec.totais.km, 0) + ' km', cor: '#06b6d4' },
        ].map((card, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '8px', padding: '0.5rem 0.65rem',
            border: '1px solid #e2e8f0', borderTop: '3px solid ' + card.cor,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.1rem' }}>{card.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '0.05rem', fontFamily: card.label.includes('R$') ? 'monospace' : 'inherit' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ═══ GRÁFICOS SVG ═══ */}
      {relatorioRec.dias.length > 1 && (
        <GraficosRelatorioDiario
          dias={relatorioRec.dias}
          totais={relatorioRec.totais}
          dadosBrutos={dadosFiltradosGraficos}
        />
      )}

      {/* ═══ TABELA DIÁRIA — RECEITA ═══ */}
      {relatorioRec.dias.length > 0 && (
        <div style={{
          background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
          overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: '1rem',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '500px' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Data</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#065f46', color: '#6ee7b7' }}>💰 Faturamento</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#1e3a5f', color: '#93c5fd' }}>R$/KM</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#4a1942', color: '#f0abfc' }}>R$/h</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#7c2d12', color: '#fdba74' }}>R$/ton</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxFatRec = Math.max(...relatorioRec.dias.map(d => d.faturamento), 0.1);
                  return relatorioRec.dias.map((d, idx) => {
                    const receitaPorTon = d.toneladas > 0 ? d.faturamento / d.toneladas : 0;
                    return (
                      <tr key={d.data} style={{ borderTop: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                        <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#6366f1' }}>{d.label}</td>
                        <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#065f46', fontFamily: 'monospace' }}>
                          {fmtMoeda(d.faturamento)}
                          <div style={{ width: `${Math.max(3, (d.faturamento / maxFatRec) * 100)}%`, maxWidth: '50px', height: '3px', background: '#10b981', borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
                        </td>
                        <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#1d4ed8', fontSize: '0.68rem' }}>{fmtMoeda(d.receitaKm)}</td>
                        <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#86198f', fontSize: '0.68rem' }}>{fmtMoeda(d.receitaHora)}</td>
                        <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#9a3412', fontSize: '0.68rem' }}>{fmtMoeda(receitaPorTon)}</td>
                      </tr>
                    );
                  });
                })()}
                <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff', fontWeight: 800 }}>
                  <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: '#4338ca' }}>TOTAL</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#065f46', fontFamily: 'monospace', fontSize: '0.82rem' }}>{fmtMoeda(relatorioRec.totais.faturamento)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmtMoeda(relatorioRec.totais.receitaKm)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#86198f' }}>{fmtMoeda(relatorioRec.totais.receitaHora)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#9a3412' }}>
                    {fmtMoeda(relatorioRec.totais.toneladas > 0 ? relatorioRec.totais.faturamento / relatorioRec.totais.toneladas : 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ DESTAQUES FINANCEIROS ═══ */}
      {temFaturamentoAuto && (
        <>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <FiDollarSign size={12} /> Destaques de Receita
          </div>

          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem',
            border: '1px solid #334155',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>Faturamento</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.1rem' }}>
              {(faturamentoKpi?.formatado || execMetrics?.faturamento?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || '-')}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
            {[
              { label: 'Receita por KM', value: (execMetrics?.receitaKm || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/km', cor: '#f59e0b' },
              { label: 'Receita por Hora', value: formatarReceitaPorHora(receitaPorHora), cor: '#ef4444' },
              { label: 'Receita por Tonelada', value: execMetrics && execMetrics.pesoTotalTon > 0 ? (execMetrics.faturamento / execMetrics.pesoTotalTon).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'N/D', cor: '#22c55e' },
              { label: 'Receita por Viagem', value: execMetrics && execMetrics.viagens > 0 ? (execMetrics.faturamento / execMetrics.viagens).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'N/D', cor: '#8b5cf6' },
            ].map((card, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0', borderTop: '3px solid ' + card.cor }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{card.label}</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>{card.value}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ═══ KPIs de Receita + Gráficos Recharts ═══ */}
      {kpisReceita.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Indicadores Financeiros ({kpisReceita.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem' }}>
            {kpiValoresReceita.map((v, idx) => (
              <div key={v.nome + idx} style={{
                background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', borderTop: '3px solid ' + CORES[idx % CORES.length],
                padding: '0.65rem 0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', marginBottom: '0.15rem' }}>{v.nome}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{v.formatado || '-'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {graficosReceita.length > 0 && (
        <ChartGrid
          graficos={graficosReceita}
          dadosBrutos={dadosFiltradosGraficos}
          colunasHoraSet={colunasHoraSet}
          CORES={['#f59e0b', '#fbbf24', '#fef3c7', '#b45309', '#d97706']}
          contractId={contractId}
          servicoId={servicoId}
          filtrosAtivos={filtrosCompletos}
        />
      )}

      {/* Botão PDF */}
      <div style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '0.5rem' }}>
        <button onClick={() => onExportPdf('receita')}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
          <FiDownload size={13} /> Exportar PDF - Receita
        </button>
      </div>
    </div>
  );
}
