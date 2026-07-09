import { useMemo } from 'react';
import type { OperacaoDiaAnalise } from '../utils/operacaoDia';
import { fmtNum } from '../utils/relatorioDiario';
import { GraficoPizza, GraficoBarras, GraficoRotasPorDistrito } from './GraficosSvg';

interface GraficosOperacaoDiaProps {
  analise: OperacaoDiaAnalise;
}

const CORES_OP = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#06b6d4'];
const CORES_DISTRITO = ['#6366f1', '#8b5cf6', '#0891b2', '#16a34a', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function GraficosOperacaoDia({ analise }: GraficosOperacaoDiaProps) {
  const distritos = useMemo(
    () => analise.porDistrito.filter((l) => l.chave && l.chave !== '—' && l.viagens > 0),
    [analise.porDistrito],
  );

  const porTipo = useMemo(() => {
    const linhas = analise.porTipoCaminhao.filter((l) => l.viagens > 0);
    const total = linhas.reduce((s, l) => s + l.viagens, 0);
    return linhas.map((l) => ({
      label: l.chave,
      valor: l.viagens,
      pct: total > 0 ? (l.viagens / total) * 100 : 0,
    }));
  }, [analise.porTipoCaminhao]);

  const porTurno = useMemo(
    () => analise.porTurno
      .filter((l) => l.chave !== '—' && l.viagens > 0)
      .map((l) => ({ label: l.chave, valor: l.viagens })),
    [analise.porTurno],
  );

  const porRegional = useMemo(
    () => analise.porRegional
      .filter((l) => l.chave !== '—' && l.viagens > 0)
      .map((l) => ({ label: l.chave, valor: l.viagens })),
    [analise.porRegional],
  );

  const kmPorDistrito = useMemo(
    () => distritos.map((d) => ({ label: d.chave, valor: d.km })),
    [distritos],
  );

  const pizzaDistrito = useMemo(() => {
    const total = distritos.reduce((s, d) => s + d.viagens, 0);
    return distritos.map((d) => ({
      label: d.chave,
      valor: d.viagens,
      km: d.km,
      pct: total > 0 ? (d.viagens / total) * 100 : 0,
    }));
  }, [distritos]);

  const legendaPizzaDistrito = useMemo(
    () => (v: number, pct: number) => {
      const item = pizzaDistrito.find(
        (p) => p.valor === v && Math.abs(p.pct - pct) < 0.05,
      ) ?? pizzaDistrito.find((p) => p.valor === v);
      const km = item?.km ?? 0;
      return `${fmtNum(v, 0)} viag. · ${fmtNum(km, 0)} km (${pct.toFixed(0)}%)`;
    },
    [pizzaDistrito],
  );

  const linhasDistrito = useMemo(
    () => distritos.map((d) => ({
      distrito: d.chave,
      viagens: d.viagens,
      toneladas: d.toneladas,
      km: d.km,
    })),
    [distritos],
  );

  const temRotas = distritos.length > 0;
  const temPizza = porTipo.length > 0;
  const temSecundarios = porTurno.length > 0 || porRegional.length > 0;

  if (!temRotas && !temPizza && !temSecundarios) return null;

  return (
    <div style={{ marginBottom: '1rem' }}>
      {temRotas && (
        <>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', marginBottom: '0.5rem',
          }}>
            Rotas do dia (por distrito)
          </div>

          <GraficoRotasPorDistrito
            titulo="KM, viagens e toneladas por distrito"
            linhas={linhasDistrito}
            formatoNum={fmtNum}
          />

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}>
            {pizzaDistrito.length > 1 && pizzaDistrito.length <= 8 && (
              <GraficoPizza
                titulo="Viagens por distrito"
                dados={pizzaDistrito}
                paleta={CORES_DISTRITO}
                textoCentro={fmtNum(pizzaDistrito.reduce((s, d) => s + d.valor, 0), 0)}
                subtituloCentro="viagens"
                legendaValor={legendaPizzaDistrito}
              />
            )}
            <GraficoBarras
              titulo="KM por distrito"
              dados={kmPorDistrito}
              cor="#0891b2"
              unidade=" km"
              formato={(v) => fmtNum(v, 0)}
            />
          </div>
        </>
      )}

      {temPizza && (
        <>
          <div style={{
            fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
            textTransform: 'uppercase', marginBottom: '0.5rem',
          }}>
            Distribuição operacional do dia
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.75rem',
            marginBottom: temSecundarios ? '0.75rem' : 0,
          }}>
            <GraficoPizza
              titulo="Viagens por tipo de caminhão"
              dados={porTipo}
              paleta={CORES_OP}
              textoCentro={fmtNum(analise.resumo.viagens, 0)}
              subtituloCentro="viagens"
              legendaValor={(v, pct) => `${fmtNum(v, 0)} viag. (${pct.toFixed(0)}%)`}
            />
          </div>
        </>
      )}

      {temSecundarios && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '0.75rem',
        }}>
          {porTurno.length > 0 && (
            <GraficoBarras
              titulo="Viagens por turno"
              dados={porTurno}
              cor="#7c3aed"
              unidade=" viag."
              formato={(v) => fmtNum(v, 0)}
            />
          )}
          {porRegional.length > 0 && (
            <GraficoBarras
              titulo="Viagens por regional"
              dados={porRegional}
              cor="#0891b2"
              unidade=" viag."
              formato={(v) => fmtNum(v, 0)}
            />
          )}
        </div>
      )}
    </div>
  );
}
