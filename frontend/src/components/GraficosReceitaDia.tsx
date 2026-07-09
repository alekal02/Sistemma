import { useMemo } from 'react';
import type { ReceitaDiaAnalise } from '../utils/receitaDia';
import { fmtMoeda } from '../utils/relatorioDiario';
import { GraficoPizza, GraficoBarras } from './GraficosSvg';

interface GraficosReceitaDiaProps {
  analise: ReceitaDiaAnalise;
}

const CORES_RECEITA = ['#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#06b6d4'];

export default function GraficosReceitaDia({ analise }: GraficosReceitaDiaProps) {
  const porTipo = useMemo(() => {
    const linhas = analise.porTipoCaminhao.filter(l => l.faturamento > 0);
    const total = linhas.reduce((s, l) => s + l.faturamento, 0);
    return linhas.map(l => ({
      label: l.chave,
      valor: l.faturamento,
      pct: total > 0 ? (l.faturamento / total) * 100 : 0,
    }));
  }, [analise.porTipoCaminhao]);

  const porTurno = useMemo(
    () => analise.porTurno
      .filter(l => l.chave !== '—' && l.faturamento > 0)
      .map(l => ({ label: l.chave, valor: l.faturamento })),
    [analise.porTurno],
  );

  const porRegional = useMemo(
    () => analise.porRegional
      .filter(l => l.chave !== '—' && l.faturamento > 0)
      .map(l => ({ label: l.chave, valor: l.faturamento })),
    [analise.porRegional],
  );

  const temGraficosPrincipais = porTipo.length > 0;
  const temGraficosSecundarios = porTurno.length > 0 || porRegional.length > 0;

  if (!temGraficosPrincipais && !temGraficosSecundarios) return null;

  const fmtCurto = (v: number) =>
    v >= 1000 ? `R$ ${(v / 1000).toFixed(1)}k` : fmtMoeda(v);

  return (
    <div style={{ marginBottom: '1rem' }}>
      {temGraficosPrincipais && (
        <>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', marginBottom: '0.5rem',
          }}>
            Distribuição da receita do dia
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
            marginBottom: temGraficosSecundarios ? '0.75rem' : 0,
          }}>
            {porTipo.length > 0 && (
              <GraficoPizza
                titulo="Faturamento por tipo de caminhão"
                dados={porTipo}
                paleta={CORES_RECEITA}
                textoCentro={fmtCurto(analise.resumo.faturamento)}
                subtituloCentro="faturamento"
                legendaValor={(v, pct) => `${fmtMoeda(v)} (${pct.toFixed(0)}%)`}
              />
            )}
          </div>
        </>
      )}

      {temGraficosSecundarios && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.75rem',
        }}>
          {porTurno.length > 0 && (
            <GraficoBarras
              titulo="Faturamento por turno"
              dados={porTurno}
              cor="#7c3aed"
              formato={fmtCurto}
              formatoTooltip={fmtMoeda}
            />
          )}
          {porRegional.length > 0 && (
            <GraficoBarras
              titulo="Faturamento por regional"
              dados={porRegional}
              cor="#0891b2"
              formato={fmtCurto}
              formatoTooltip={fmtMoeda}
            />
          )}
        </div>
      )}
    </div>
  );
}
