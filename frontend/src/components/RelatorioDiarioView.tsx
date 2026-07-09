/**
 * RelatorioDiarioView - Relatório diário com seletor de datas
 * Mostra dados detalhados com gráficos SVG, tabela e seletor de data
 */
import { useMemo, useState, useCallback, useEffect } from 'react';
import GraficosRelatorioDiario from './GraficosRelatorioDiario';
import DateListSelector from './DateListSelector';
import { agruparPorDia, fmtMoeda, fmtNum } from '../utils/relatorioDiario';

interface Props {
  filtrosGA: any;
  dadosBrutos: Record<string, unknown>[];
  valoresCaminhao?: { valorTonelada?: number; valorMini?: number; valorTruck?: number; valorToco?: number; valorBasculante?: number };
  onRefresh?: () => void;
}

export default function RelatorioDiarioView({ filtrosGA, dadosBrutos, valoresCaminhao, onRefresh }: Props) {
  // Estado para data selecionada via DateListSelector
  const [dataSelecionada, setDataSelecionada] = useState<string>('');

  // Quando seleciona uma data no DateListSelector, atualiza o GoogleFilterBar
  const handleSelectDate = useCallback((data: string) => {
    setDataSelecionada(data);
    filtrosGA.setPeriodo('personalizado', data, data);
  }, [filtrosGA]);

  // Quando limpa a data, volta para 30d
  const handleClearDate = useCallback(() => {
    setDataSelecionada('');
    filtrosGA.setPeriodo('30d', '', '');
  }, [filtrosGA]);

  // Sincroniza com mudanças externas no período
  useEffect(() => {
    const { dataInicio, dataFim } = filtrosGA.periodo;
    if (dataInicio && dataFim && dataInicio === dataFim) {
      setDataSelecionada(dataInicio);
    }
  }, [filtrosGA.periodo.dataInicio, filtrosGA.periodo.dataFim]);

  // Calcula relatório com base nos dados filtrados
  const relatorio = useMemo(() => agruparPorDia(
    dadosBrutos,
    80,
    valoresCaminhao?.valorMini,
    valoresCaminhao?.valorTruck,
    valoresCaminhao?.valorToco,
    valoresCaminhao?.valorBasculante,
  ), [dadosBrutos, valoresCaminhao]);

  const { dias, totais } = relatorio;

  if (!dadosBrutos.length) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>
        <h3>Nenhum dado disponível</h3>
        <p style={{ fontSize: '0.85rem' }}>Faça upload de uma planilha para gerar o relatório diário.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      {/* ═══ SELETOR DE DATAS COM CHECKBOX ═══ */}
      <DateListSelector
        dadosBrutos={dadosBrutos}
        dataSelecionada={dataSelecionada}
        onSelectDate={handleSelectDate}
        onClearDate={handleClearDate}
      />

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>
            📋 Relatório Diário
          </span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
            {relatorio.totalRegistros} registros · {dias.length} dia{dias.length !== 1 ? 's' : ''}
            {dataSelecionada && (
              <span style={{ marginLeft: '0.3rem', color: '#6366f1', fontWeight: 600 }}>
                · Filtrado: {dataSelecionada.split('-').reverse().join('/')}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* BIG CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.5rem', marginBottom: '1rem' }}>
        {[
          { label: '🚛 Viagens', value: fmtNum(totais.viagens, 0), cor: '#3b82f6' },
          { label: '⚖️ Toneladas', value: fmtNum(totais.toneladas, 1) + ' t', cor: '#22c55e' },
          { label: '📏 KM Total', value: fmtNum(totais.km, 0) + ' km', cor: '#f59e0b' },
          { label: '⏱️ Horas', value: fmtNum(totais.horas, 1) + ' h', cor: '#8b5cf6' },
          { label: '💰 Faturamento', value: fmtMoeda(totais.faturamento), cor: '#10b981' },
          { label: '📊 R$/KM', value: fmtMoeda(totais.receitaKm), cor: '#ef4444' },
          { label: '⏱️ R$/h', value: fmtMoeda(totais.receitaHora), cor: '#ec4899' },
          { label: '📈 t/dia', value: dias.length > 0 ? fmtNum(totais.toneladas / dias.length, 1) + ' t' : '-', cor: '#14b8a6' },
        ].map((card, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: '8px', padding: '0.5rem 0.65rem', border: '1px solid #e2e8f0', borderTop: '3px solid ' + card.cor }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{card.label}</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '0.05rem' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* GRÁFICOS SVG (só se mais de 1 dia) */}
      {dias.length > 1 && (
        <GraficosRelatorioDiario
          dias={dias}
          totais={totais}
          dadosBrutos={dadosBrutos}
        />
      )}

      {/* TABELA DIÁRIA */}
      {dias.length > 0 && (
        <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '800px' }}>
              <thead>
                <tr style={{ background: '#1e293b', color: '#fff' }}>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'left' }}>Data</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Viagens</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Toneladas</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>KM</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Horas</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Col.</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#065f46', color: '#6ee7b7' }}>💰 Faturamento</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#1e3a5f', color: '#93c5fd' }}>R$/KM</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#4a1942', color: '#f0abfc' }}>R$/h</th>
                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right', background: '#7c2d12', color: '#fdba74' }}>t/vg</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxV = Math.max(...dias.map(d => d.viagens), 1);
                  const maxT = Math.max(...dias.map(d => d.toneladas), 0.1);
                  const maxK = Math.max(...dias.map(d => d.km), 1);
                  const maxH = Math.max(...dias.map(d => d.horas), 0.1);
                  const maxF = Math.max(...dias.map(d => d.faturamento), 0.1);

                  return dias.map((d, idx) => (
                    <tr key={d.data} style={{ borderTop: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      <td style={{ padding: '0.45rem 0.6rem', fontWeight: 700, color: '#6366f1' }}>{d.label}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', fontWeight: 600 }}>
                        {fmtNum(d.viagens, 0)}
                        <div style={{ width: `${Math.max(3, (d.viagens / maxV) * 100)}%`, maxWidth: '60px', height: '3px', background: '#3b82f6', borderRadius: '2px', margin: '3px auto 0', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#166534' }}>
                        {fmtNum(d.toneladas, 1)}
                        <div style={{ width: `${Math.max(3, (d.toneladas / maxT) * 100)}%`, maxWidth: '60px', height: '3px', background: '#22c55e', borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#92400e' }}>
                        {fmtNum(d.km, 0)}
                        <div style={{ width: `${Math.max(3, (d.km / maxK) * 100)}%`, maxWidth: '60px', height: '3px', background: '#f59e0b', borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#6b21a8' }}>
                        {fmtNum(d.horas, 1)}
                        <div style={{ width: `${Math.max(3, (d.horas / maxH) * 100)}%`, maxWidth: '60px', height: '3px', background: '#a855f7', borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#475569' }}>{d.coletores}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#065f46', fontFamily: 'monospace' }}>
                        {fmtMoeda(d.faturamento)}
                        <div style={{ width: `${Math.max(3, (d.faturamento / maxF) * 100)}%`, maxWidth: '60px', height: '3px', background: '#10b981', borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#1d4ed8', fontSize: '0.68rem' }}>{fmtMoeda(d.receitaKm)}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#86198f', fontSize: '0.68rem' }}>{fmtMoeda(d.receitaHora)}</td>
                      <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 600, color: '#9a3412', fontSize: '0.68rem' }}>{fmtNum(d.viagens > 0 ? d.toneladas / d.viagens : 0, 1)}</td>
                    </tr>
                  ));
                })()}
                <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff', fontWeight: 800 }}>
                  <td style={{ padding: '0.5rem 0.6rem', fontWeight: 800, color: '#4338ca' }}>TOTAL</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{fmtNum(totais.viagens, 0)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#166534' }}>{fmtNum(totais.toneladas, 1)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#92400e' }}>{fmtNum(totais.km, 0)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#6b21a8' }}>{fmtNum(totais.horas, 1)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>{totais.coletores}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 800, color: '#065f46', fontFamily: 'monospace', fontSize: '0.82rem' }}>{fmtMoeda(totais.faturamento)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#1d4ed8' }}>{fmtMoeda(totais.receitaKm)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#86198f' }}>{fmtMoeda(totais.receitaHora)}</td>
                  <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#9a3412' }}>{fmtNum(totais.viagens > 0 ? totais.toneladas / totais.viagens : 0, 1)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Legenda */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem', fontSize: '0.65rem', color: '#94a3b8' }}>
        <span>💰 Faturamento estimado com base no peso × valor por tonelada</span>
        <span>📊 Valores em R$ são estimativas</span>
      </div>
    </div>
  );
}
