import { memo, useEffect, useMemo, useRef } from 'react';
import type { MotoristaKpi } from '../services/dashboardExecutivoService';

interface Props {
  motoristas: MotoristaKpi[];
  campo?: 'tonelagem' | 'tonPorViagem' | 'kmPorViagem' | 'tonPorHora' | 'tonPorKm';
  titulo?: string;
  topN?: number;
}

const CORES = [
  '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

const MotoristaBarChart = memo(function MotoristaBarChart({
  motoristas,
  campo = 'tonPorViagem',
  titulo = 'Tonelagem por Viagem',
  topN = 10,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);

  const chartSeries = useMemo(() => {
    const top = [...motoristas]
      .sort((a, b) => (b[campo] ?? 0) - (a[campo] ?? 0))
      .slice(0, topN);

    return {
      top,
      labels: top.map(m => m.motorista.length > 15 ? m.motorista.slice(0, 13) + '...' : m.motorista),
      valores: top.map(m => m[campo] ?? 0),
    };
  }, [motoristas, campo, topN]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || chartSeries.top.length === 0) return;

    const { top, labels, valores } = chartSeries;

    const carregarErenderizar = () => {
      if ((window as any).Chart) {
        renderizar();
        return;
      }
      const script = document.querySelector('script[src*="chart.js"]');
      if (script) {
        (script as any).onload = () => setTimeout(renderizar, 100);
        return;
      }
      const novoScript = document.createElement('script');
      novoScript.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      novoScript.onload = () => setTimeout(renderizar, 100);
      document.head.appendChild(novoScript);
    };

    const renderizar = () => {
      const Chart = (window as any).Chart;
      if (!Chart) return;

      Chart.defaults.animation = false;

      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      chartRef.current = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: campo === 'tonelagem' ? 'Tonelagem (t)' :
                    campo === 'kmPorViagem' ? 'KM por Viagem' :
                    campo === 'tonPorHora' ? 't/hora' : 't/viagem',
            data: valores,
            backgroundColor: CORES.slice(0, labels.length),
            borderRadius: 4,
          }]
        },
        options: {
          animation: false,
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx: any) => {
                  const m = top[ctx.dataIndex];
                  return [
                    `${m.motorista}: ${ctx.parsed.x.toFixed(2)}`,
                    `Viagens: ${m.viagens} | Tons: ${m.tonelagem.toFixed(1)}`,
                  ];
                },
              },
            },
          },
          scales: {
            x: {
              ticks: { font: { size: 10 } },
              grid: { display: false },
            },
            y: {
              ticks: { font: { size: 9 } },
              grid: { display: false },
            },
          },
        },
      });
    };

    carregarErenderizar();

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartSeries, campo]);

  if (motoristas.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '2rem', color: '#94a3b8',
        fontSize: '0.78rem', background: '#f8fafc', borderRadius: '8px',
      }}>
        Sem dados para exibir no gráfico
      </div>
    );
  }

  return (
    <div>
      <h4 style={{
        margin: '0 0 0.5rem', fontSize: '0.75rem', fontWeight: 700,
        color: '#334155',
      }}>
        📊 {titulo} (Top {Math.min(topN, motoristas.length)})
      </h4>
      <div style={{ position: 'relative', height: Math.min(motoristas.length, topN) * 36 + 40, width: '100%' }}>
        <canvas ref={canvasRef}></canvas>
      </div>
    </div>
  );
});

export default MotoristaBarChart;
