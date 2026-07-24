import { useMemo } from 'react';
import type { AnaliseRocadaDia, LinhaRocadaAgrupada } from '../utils/operacaoRocada';
import { fmtAreaM2 } from '../utils/operacaoRocada';
import { GraficoPizza, GraficoBarras, GraficoBarrasHorizontais } from './GraficosSvg';

interface BlocoTipoMini {
  registros: number;
  areaM2: number;
}

interface Props {
  analise: AnaliseRocadaDia;
  porTipo?: LinhaRocadaAgrupada[];
  blocoManual?: BlocoTipoMini | null;
  blocoMecanizada?: BlocoTipoMini | null;
}

const CORES_TIPO = ['#0ea5e9', '#f59e0b', '#94a3b8', '#22c55e', '#a855f7'];

function topBarras(linhas: LinhaRocadaAgrupada[], max = 8) {
  return linhas
    .filter((l) => l.areaM2 > 0 && l.label && l.label !== '—')
    .slice(0, max)
    .map((l) => ({ label: l.label, valor: l.areaM2 }));
}

export default function GraficosRocadaDia({
  analise,
  porTipo = [],
  blocoManual = null,
  blocoMecanizada = null,
}: Props) {
  const { resumo } = analise;

  const pizzaTipo = useMemo(() => {
    const fontes = porTipo.length > 0
      ? porTipo
      : [
          ...(blocoManual && blocoManual.areaM2 > 0
            ? [{ label: 'Manual', registros: blocoManual.registros, areaM2: blocoManual.areaM2 }]
            : []),
          ...(blocoMecanizada && blocoMecanizada.areaM2 > 0
            ? [{ label: 'Mecanizada', registros: blocoMecanizada.registros, areaM2: blocoMecanizada.areaM2 }]
            : []),
          ...((resumo.areaManualM2 || 0) <= 0 && (resumo.areaMecanizadaM2 || 0) <= 0 && resumo.areaM2 > 0
            ? [{ label: 'Roçada', registros: resumo.registros, areaM2: resumo.areaM2 }]
            : []),
        ];

    const total = fontes.reduce((s, t) => s + t.areaM2, 0);
    if (total <= 0) return [];
    return fontes
      .filter((t) => t.areaM2 > 0)
      .map((t) => ({
        label: t.label,
        valor: t.areaM2,
        pct: (t.areaM2 / total) * 100,
      }));
  }, [porTipo, blocoManual, blocoMecanizada, resumo]);

  const barrasBairro = useMemo(() => topBarras(analise.porBairro), [analise.porBairro]);
  const barrasOperador = useMemo(() => topBarras(analise.porOperador), [analise.porOperador]);
  const barrasEquipe = useMemo(() => topBarras(analise.porEquipe, 6), [analise.porEquipe]);
  const barrasEquip = useMemo(() => topBarras(analise.porEquipamento, 6), [analise.porEquipamento]);

  const temAlgo = pizzaTipo.length > 0
    || barrasBairro.length > 0
    || barrasOperador.length > 0
    || barrasEquipe.length > 0
    || barrasEquip.length > 0;

  if (!temAlgo) return null;

  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem',
      }}>
        Visão gráfica do dia
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '0.75rem',
        marginBottom: '0.75rem',
      }}>
        {pizzaTipo.length > 0 && (
          <GraficoPizza
            titulo="Área por tipo de execução"
            dados={pizzaTipo}
            paleta={CORES_TIPO}
            textoCentro={fmtAreaM2(resumo.areaM2)}
            subtituloCentro="m² total"
            legendaValor={(v, pct) => `${fmtAreaM2(v)} m² (${pct.toFixed(0)}%)`}
          />
        )}
        {barrasBairro.length > 0 && (
          <GraficoBarrasHorizontais
            titulo="Top locais / trechos / bairros (m²)"
            dados={barrasBairro}
            cor="#22c55e"
            formato={(v) => fmtAreaM2(v)}
            maxItens={8}
          />
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '0.75rem',
      }}>
        {barrasOperador.length > 0 && (
          <GraficoBarrasHorizontais
            titulo="Top segmentos / operadores (m²)"
            dados={barrasOperador}
            cor="#7c3aed"
            formato={(v) => fmtAreaM2(v)}
            maxItens={8}
          />
        )}
        {barrasEquipe.length > 0 && (
          <GraficoBarras
            titulo="Área por equipe / periodicidade (m²)"
            dados={barrasEquipe}
            cor="#b45309"
            unidade=" m²"
            formato={(v) => fmtAreaM2(v)}
          />
        )}
        {barrasEquip.length > 0 && (
          <GraficoBarras
            titulo="Área por equipamento (m²)"
            dados={barrasEquip}
            cor="#0f766e"
            unidade=" m²"
            formato={(v) => fmtAreaM2(v)}
          />
        )}
      </div>
    </div>
  );
}
