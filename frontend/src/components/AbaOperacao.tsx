import { useMemo, useState } from 'react';
import { FiTruck, FiUsers, FiMapPin, FiDownload } from 'react-icons/fi';
import GoogleFilterBar from './GoogleFilterBar';
import ChartGrid from './ChartGrid';
import GraficosRelatorioDiario from './GraficosRelatorioDiario';
import { agruparPorDia, fmtMoeda, fmtNum } from '../utils/relatorioDiario';
import type { KpiValor, ExecMetrics } from '../hooks/useKpiCalculator';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from './KpiEditor/KpiEditorTypes';

interface AbaOperacaoProps {
  filtrosGA: any;
  dadosFiltradosGraficos: Record<string, unknown>[];
  kpisOperacao: KpiConfig[];
  kpiValoresOperacao: KpiValor[];
  graficosOperacao: GraficoConfig[];
  execMetrics: ExecMetrics | null;
  kpiValores: KpiValor[];
  loadingKpis: boolean;
  contractId?: string;
  servicoId?: string;
  filtrosCompletos: any;
  colunasHoraSet: Set<string>;
  onExportPdf: (tipo: 'operacao') => void;
  colunasAnaliseViagens: any;
  valoresCaminhao?: { valorTonelada?: number; valorMini?: number; valorTruck?: number; valorToco?: number; valorBasculante?: number };
}

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

/** Tabela operacional inline (mini barras) */
function TabelaOpInline({ dias, totais }: { dias: any[]; totais: any }) {
  const maxVg = Math.max(...dias.map((d: any) => d.viagens), 1);
  const maxTon = Math.max(...dias.map((d: any) => d.toneladas), 0.1);
  const maxKm = Math.max(...dias.map((d: any) => d.km), 1);
  const maxHr = Math.max(...dias.map((d: any) => d.horas), 0.1);

  const miniBar = (val: number, max: number, cor: string) => (
    <div style={{ width: `${Math.max(3, (val / max) * 100)}%`, maxWidth: '50px', height: '3px', background: cor, borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
  );

  return (
    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: '1rem' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '700px' }}>
          <thead><tr style={{ background: '#1e293b', color: '#fff' }}>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Data</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Viagens</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Toneladas</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>KM</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Horas</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Col.</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>t/viagem</th>
            <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>KM/h</th>
          </tr></thead>
          <tbody>
            {dias.map((d: any, idx: number) => (
              <tr key={d.data} style={{ borderTop: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#6366f1' }}>{d.label}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', fontWeight: 600 }}>{fmtNum(d.viagens, 0)}{miniBar(d.viagens, maxVg, '#3b82f6')}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#166534' }}>{fmtNum(d.toneladas, 1)}{miniBar(d.toneladas, maxTon, '#22c55e')}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>{fmtNum(d.km, 0)}{miniBar(d.km, maxKm, '#f59e0b')}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#6b21a8' }}>{fmtNum(d.horas, 1)}{miniBar(d.horas, maxHr, '#a855f7')}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#475569' }}>{d.coletores}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#9a3412', fontSize: '0.68rem' }}>{fmtNum(d.viagens > 0 ? d.toneladas / d.viagens : 0, 1)}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#0891b2', fontSize: '0.68rem' }}>{fmtNum(d.horas > 0 ? d.km / d.horas : 0, 0)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff', fontWeight: 800 }}>
              <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: '#4338ca' }}>TOTAL</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{fmtNum(totais.viagens, 0)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{fmtNum(totais.toneladas, 1)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#92400e' }}>{fmtNum(totais.km, 0)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#6b21a8' }}>{fmtNum(totais.horas, 1)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{totais.coletores}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#9a3412' }}>{fmtNum(totais.viagens > 0 ? totais.toneladas / totais.viagens : 0, 1)}</td>
              <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#0891b2' }}>{fmtNum(totais.horas > 0 ? totais.km / totais.horas : 0, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AbaOperacao({
  filtrosGA,
  dadosFiltradosGraficos,
  kpisOperacao,
  kpiValoresOperacao,
  graficosOperacao,
  execMetrics,
  kpiValores,
  loadingKpis,
  contractId,
  servicoId,
  filtrosCompletos,
  colunasHoraSet,
  onExportPdf,
  valoresCaminhao,
}: AbaOperacaoProps) {
  const [analiseExpandida, setAnaliseExpandida] = useState(true);
  const [analisePlaca, setAnalisePlaca] = useState('');

  const relatorioOp = useMemo(() => agruparPorDia(
    dadosFiltradosGraficos,
    80,
    valoresCaminhao?.valorMini,
    valoresCaminhao?.valorTruck,
    valoresCaminhao?.valorToco,
    valoresCaminhao?.valorBasculante,
  ), [dadosFiltradosGraficos, valoresCaminhao]);

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

      {/* ═══ BIG CARDS OPERACIONAIS ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: '🚛 Viagens', value: fmtNum(relatorioOp.totais.viagens, 0), cor: '#3b82f6' },
          { label: '⚖️ Toneladas', value: fmtNum(relatorioOp.totais.toneladas, 1) + ' t', cor: '#22c55e' },
          { label: '📏 KM Total', value: fmtNum(relatorioOp.totais.km, 0) + ' km', cor: '#f59e0b' },
          { label: '⏱️ Horas Prod.', value: fmtNum(relatorioOp.totais.horas, 1) + ' h', cor: '#8b5cf6' },
          { label: '💰 Faturamento', value: fmtMoeda(relatorioOp.totais.faturamento), cor: '#10b981' },
          { label: '📊 R$/KM', value: fmtMoeda(relatorioOp.totais.receitaKm), cor: '#ef4444' },
          ...(execMetrics?.prodColetor && execMetrics.prodColetor > 0
            ? [{ label: '🎯 Prod./Coletor', value: execMetrics.prodColetor.toFixed(2) + ' t', cor: '#a855f7' }]
            : []),
          ...(relatorioOp.totais.viagens > 0
            ? [{ label: '📈 t/viagem', value: fmtNum(relatorioOp.totais.toneladas / relatorioOp.totais.viagens, 1) + ' t', cor: '#14b8a6' }]
            : []),
        ].map((card, i) => (
          <div key={i} style={{
            background: '#fff', borderRadius: '8px', padding: '0.5rem 0.65rem',
            border: '1px solid #e2e8f0', borderTop: '3px solid ' + card.cor,
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.1rem' }}>{card.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '0.05rem' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* ═══ GRÁFICOS SVG ═══ */}
      {relatorioOp.dias.length > 1 && (
        <GraficosRelatorioDiario
          dias={relatorioOp.dias}
          totais={relatorioOp.totais}
          dadosBrutos={dadosFiltradosGraficos}
        />
      )}

      {/* ═══ TABELA DIÁRIA ═══ */}
      {relatorioOp.dias.length > 0 && (
        <TabelaOpInline dias={relatorioOp.dias} totais={relatorioOp.totais} />
      )}

      {/* ═══ KPIs Operacionais ═══ */}
      {kpisOperacao.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
            Indicadores Operacionais ({kpisOperacao.length})
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem' }}>
            {kpiValoresOperacao.map((v, idx) => (
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

      {/* ═══ GRÁFICOS RECHARTS ═══ */}
      {graficosOperacao.length > 0 && (
        <ChartGrid
          graficos={graficosOperacao}
          dadosBrutos={dadosFiltradosGraficos}
          colunasHoraSet={colunasHoraSet}
          CORES={CORES}
          contractId={contractId}
          servicoId={servicoId}
          filtrosAtivos={filtrosCompletos}
        />
      )}

      {/* ═══ ANÁLISE DE VIAGENS ═══ */}
      <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
        <button onClick={() => setAnaliseExpandida(!analiseExpandida)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, color: '#1e293b', padding: '0.3rem 0' }}>
          <FiTruck size={14} />
          Analise de Viagens
          <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400 }}>({dadosFiltradosGraficos.length} registros)</span>
          <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#6366f1' }}>{analiseExpandida ? 'Recolher ▲' : 'Expandir ▼'}</span>
        </button>
      </div>

      {analiseExpandida && dadosFiltradosGraficos.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '1rem' }}>
          <div style={{ padding: '0.5rem 0.75rem 0.75rem', maxHeight: '600px', overflow: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.5rem' }}>
              {dadosFiltradosGraficos.slice(0, 80).map((dado: any, idx: number) => {
                const placa = String(dado.PLACA || dado.CAMINHAO || dado.placa || dado.caminhao || '-').toUpperCase();
                const motorista = String(dado.MOTORISTA || dado.motorista || '-').toUpperCase();
                const data = dado.DATA || dado.data || '-';
                const peso = Number(dado.PESO_TOTAL || dado.pesoTotal || dado.PESO || dado.peso || 0);
                const km = Number(dado.KM_TOTAL || dado.kmTotal || dado.KM || dado.km || 0);
                const toneladas = peso / 1000;
                return (
                  <div key={idx} style={{ background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '0.65rem', fontSize: '0.75rem', borderLeft: '4px solid ' + CORES[idx % CORES.length], boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                      <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>{placa !== '-' ? placa : '#' + (idx + 1)}</strong>
                      <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{data}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.65rem', color: '#64748b' }}><FiUsers size={10} /> {motorista}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.2rem' }}>
                      <div style={{ background: '#f0fdf4', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: '#15803d', fontWeight: 600 }}>PESO</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: peso > 0 ? '#0f172a' : '#94a3b8' }}>{peso > 0 ? fmtNum(toneladas, 1) + ' t' : '—'}</div>
                      </div>
                      <div style={{ background: '#eff6ff', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: '#1d4ed8', fontWeight: 600 }}>KM</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: km > 0 ? '#0f172a' : '#94a3b8' }}>{km > 0 ? fmtNum(km, 1) + ' km' : '—'}</div>
                      </div>
                      <div style={{ background: '#fdf4ff', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.55rem', color: '#a21caf', fontWeight: 600 }}>EFIC.</div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: peso > 0 && km > 0 ? '#0f172a' : '#94a3b8' }}>{peso > 0 && km > 0 ? fmtNum(peso / km, 1) + ' kg/km' : '—'}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Botão PDF */}
      <div style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '0.5rem' }}>
        <button onClick={() => onExportPdf('operacao')}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
          <FiDownload size={13} /> Exportar PDF - Operação
        </button>
      </div>
    </div>
  );
}
