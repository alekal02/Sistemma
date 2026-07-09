/**
 * GraficosRelatorioDiario - Gráficos SVG inline para o Relatório Diário
 *
 * Renderiza gráficos visuais (barras, linhas, pizza) usando SVG puro,
 * sem dependência de Recharts — ideal para relatórios que precisam
 * de leveza e dados diretos do agrupamento diário.
 */

import { useMemo } from 'react';
import type { DadoDiario } from '../utils/relatorioDiario';
import { GraficoBarras, GraficoPizza } from './GraficosSvg';

interface GraficosRelatorioDiarioProps {
  dias: DadoDiario[];
  totais: DadoDiario;
  dadosBrutos?: Record<string, unknown>[];
}

// ── Paleta de cores ──
const CORES = {
  verde: '#059669',
  verdeClaro: '#22c55e',
  amarelo: '#f59e0b',
  roxo: '#a855f7',
  vermelho: '#ef4444',
  azul: '#3b82f6',
  azulClaro: '#06b6d4',
  rosa: '#ec4899',
  lima: '#84cc16',
  laranja: '#f97316',
};

const CORES_PADRAO = Object.values(CORES);

export default function GraficosRelatorioDiario({
  dias,
  totais,
  dadosBrutos = [],
}: GraficosRelatorioDiarioProps) {
  // ── Dados para gráfico de pizza (distribuição por placa) ──
  const distribuicaoPlacas = useMemo(() => {
    if (!dadosBrutos.length) return [];

    const normalizar = (s: string) =>
      s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    const chaves = Object.keys(dadosBrutos[0] || {});
    const colPlaca = chaves.find(k => normalizar(k) === 'PLACA' || normalizar(k).includes('CAMINHAO'));

    if (!colPlaca) return [];

    const placas: Record<string, { placa: string; peso: number; km: number; viagens: number }> = {};
    let totalPeso = 0;

    for (const dado of dadosBrutos) {
      const placa = String(dado[colPlaca] || 'Desconhecido').toUpperCase().trim();
      if (!placas[placa]) {
        placas[placa] = { placa, peso: 0, km: 0, viagens: 0 };
      }
      placas[placa].viagens++;

      // Peso
      const colPeso = chaves.find(k => {
        const n = normalizar(k);
        return n.includes('PESO') && (n.includes('TOTAL') || n.length < 10);
      });
      if (colPeso && dado[colPeso] != null) {
        const peso = Number(dado[colPeso]) || 0;
        placas[placa].peso += peso / 1000;
      }

      // KM
      const colKm = chaves.find(k => {
        const n = normalizar(k);
        return n.includes('KMTOTAL') || n === 'KM TOTAL' || n === 'KM';
      });
      if (colKm && dado[colKm] != null) {
        placas[placa].km += Number(dado[colKm]) || 0;
      }
      totalPeso += placas[placa].peso;
    }

    return Object.values(placas)
      .sort((a, b) => b.peso - a.peso)
      .slice(0, 8)
      .map(item => ({
        ...item,
        pct: totalPeso > 0 ? (item.peso / totalPeso) * 100 : 0,
      }));
  }, [dadosBrutos]);

  // ── Totais resumo para os big cards ──
  const bigCards = useMemo(() => [
    {
      label: 'Total Viagens',
      value: totais.viagens.toLocaleString('pt-BR'),
      cor: CORES.azul,
      icon: '🚛',
    },
    {
      label: 'Toneladas',
      value: totais.toneladas.toFixed(1) + ' t',
      cor: CORES.verde,
      icon: '⚖️',
    },
    {
      label: 'KM Rodados',
      value: totais.km.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km',
      cor: CORES.amarelo,
      icon: '📏',
    },
    {
      label: 'Horas Prod.',
      value: totais.horas.toFixed(1) + ' h',
      cor: CORES.roxo,
      icon: '⏱️',
    },
    {
      label: 'Faturamento',
      value: totais.faturamento.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      cor: CORES.verde,
      icon: '💰',
    },
    {
      label: 'R$/KM Médio',
      value: totais.receitaKm.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }),
      cor: CORES.vermelho,
      icon: '📊',
    },
  ], [totais]);

  // ── Se não houver dias, não renderiza ──
  if (!dias.length) return null;

  const maxDiasExibir = Math.min(dias.length, 31);
  const diasExibir = dias.slice(0, maxDiasExibir);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {/* ═══ BIG CARDS ═══ */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
        gap: '0.5rem',
        marginBottom: '1rem',
      }}>
        {bigCards.map((card, i) => (
          <div key={i} style={{
            background: '#fff',
            borderRadius: '10px',
            border: `1px solid #e2e8f0`,
            borderTop: `3px solid ${card.cor}`,
            padding: '0.65rem 0.75rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            transition: 'all 0.15s',
          }}>
            <div style={{
              fontSize: '0.6rem',
              fontWeight: 600,
              color: '#64748b',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
              marginBottom: '0.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}>
              <span>{card.icon}</span> {card.label}
            </div>
            <div style={{
              fontSize: '1.1rem',
              fontWeight: 800,
              color: '#0f172a',
              marginTop: '0.05rem',
              fontFamily: card.label === 'Faturamento' ? 'monospace' : 'inherit',
            }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ SEÇÃO: GRÁFICOS ═══ */}
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        color: '#64748b',
        textTransform: 'uppercase',
        marginBottom: '0.6rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.3rem',
      }}>
        <span>📈</span> Gráficos de Evolução Diária
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '0.75rem',
        marginBottom: '0.75rem',
      }}>
        {/* ── Gráfico 1: Toneladas por Dia ── */}
        <GraficoBarras
          titulo="Toneladas por Dia"
          dados={diasExibir.map(d => ({
            label: d.label,
            valor: d.toneladas,
          }))}
          cor={CORES.verde}
          unidade=" t"
          formato={(v) => v.toFixed(1)}
        />

        {/* ── Gráfico 2: Faturamento por Dia ── */}
        <GraficoBarras
          titulo="Faturamento por Dia"
          dados={diasExibir.map(d => ({
            label: d.label,
            valor: d.faturamento,
          }))}
          cor={CORES.verdeClaro}
          unidade=""
          formato={(v) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          formatoTooltip={(v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        {/* ── Gráfico 3: Viagens por Dia ── */}
        <GraficoBarras
          titulo="Viagens por Dia"
          dados={diasExibir.map(d => ({
            label: d.label,
            valor: d.viagens,
          }))}
          cor={CORES.azul}
          unidade=""
          formato={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        />

        {/* ── Gráfico 4: KM por Dia ── */}
        <GraficoBarras
          titulo="KM por Dia"
          dados={diasExibir.map(d => ({
            label: d.label,
            valor: d.km,
          }))}
          cor={CORES.amarelo}
          unidade=" km"
          formato={(v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
        />
      </div>

      {/* ═══ GRÁFICO DE PIZZA: DISTRIBUIÇÃO POR COLETOR ═══ */}
      {distribuicaoPlacas.length > 1 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            marginBottom: '0.6rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}>
            <span>🥧</span> Distribuição por Coletor
          </div>
          <GraficoPizza
            titulo="Toneladas por Coletor"
            dados={distribuicaoPlacas.map(p => ({
              label: p.placa,
              valor: p.peso,
              pct: p.pct,
            }))}
            legendaValor={(v, pct) => `${v.toFixed(1)} t (${pct.toFixed(0)}%)`}
          />
        </div>
      )}
    </div>
  );
}
