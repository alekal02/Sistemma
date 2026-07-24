import { memo, useEffect, useMemo } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import type { DashboardExecutivoResponse } from '../../services/dashboardExecutivoService';
import { temGrupoAtivo } from '../../config/executivoLayout';
import {
  calcularStatsReceitaDiaria,
  corBarraReceita,
  diaSemanaDeIso,
  formatarMoeda,
  formatarMoedaCompacta,
} from './dashboardUtils';

export interface DashboardGraficosProps {
  dados: DashboardExecutivoResponse;
  widgetsAtivos: Set<string>;
  widgetAtivo: (id: string) => boolean;
}

const DashboardGraficos = memo(function DashboardGraficos({
  dados,
  widgetsAtivos,
  widgetAtivo,
}: DashboardGraficosProps) {
  const g = dados.graficos;

  const statsReceitaDiaria = useMemo(
    () => calcularStatsReceitaDiaria(dados.graficos.receitaDiaria),
    [dados.graficos.receitaDiaria],
  );

  useEffect(() => {
      if (!dados) return;
  
      const carregarChartJS = async () => {
        if ((window as any).Chart) {
          renderizarGraficos();
          return;
        }
  
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
        script.onload = () => {
          setTimeout(renderizarGraficos, 100);
        };
        document.head.appendChild(script);
      };
  
      function renderizarGraficos() {
        const Chart = (window as any).Chart;
        if (!Chart) return;
  
        Chart.defaults.animation = false;
        const g = dados!.graficos;
        const formatMoeda = (val: number | undefined) => 'R$ ' + (val ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
        // Destruir gráficos existentes antes de recriar
        ['chart-receita-km', 'chart-receita-hora', 'chart-receita-diaria',
         'chart-ranking-motoristas', 'chart-receita-regional',
         'chart-receita-diasemana', 'chart-receita-turno'].forEach(id => {
          const canvas = document.getElementById(id) as HTMLCanvasElement;
          if (canvas) {
            const existing = (Chart as any).getChart(canvas);
            if (existing) existing.destroy();
          }
        });
  
        // 1. Receita por Km Rodado (barras)
        const ctx1 = document.getElementById('chart-receita-km') as HTMLCanvasElement;
        if (ctx1 && widgetsAtivos.has('chart_receita_km') && g.receitaKmDiario.length > 0) {
          new Chart(ctx1, {
            type: 'bar',
            data: {
              labels: g.receitaKmDiario.map((r: any) => r.label),
              datasets: [{
                label: 'Receita/Km',
                data: g.receitaKmDiario.map((r: any) => r.valor),
                backgroundColor: '#3b82f6',
                borderRadius: 4,
              }]
            },
            options: {
              animation: false,
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx: any) => {
                      const item = g.receitaKmDiario[ctx.dataIndex];
                      return [
                        'Receita/Km: ' + formatMoeda(ctx.parsed.y),
                        'KM: ' + Number(item.km).toLocaleString('pt-BR'),
                        'Faturamento: ' + formatMoeda(item.faturamento),
                      ];
                    },
                  },
                },
              },
              scales: {
                x: { ticks: { font: { size: 9 } } },
                y: {
                  ticks: {
                    font: { size: 9 },
                    callback: (val: any) => 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                  },
                },
              },
            },
          });
        }
  
        // 2. Receita por Hora Produtiva (barras)
        const ctx2 = document.getElementById('chart-receita-hora') as HTMLCanvasElement;
        if (ctx2 && widgetsAtivos.has('chart_receita_hora') && g.receitaHoraDiario.length > 0) {
          new Chart(ctx2, {
            type: 'bar',
            data: {
              labels: g.receitaHoraDiario.map((r: any) => r.label),
              datasets: [{
                label: 'Receita/Hora',
                data: g.receitaHoraDiario.map((r: any) => r.valor),
                backgroundColor: '#f59e0b',
                borderRadius: 4,
              }]
            },
            options: {
              animation: false,
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (ctx: any) => {
                      const item = g.receitaHoraDiario[ctx.dataIndex];
                      return [
                        'Receita/Hora: ' + formatMoeda(ctx.parsed.y),
                        'Horas: ' + Number(item.horas).toFixed(1) + 'h',
                        'Faturamento: ' + formatMoeda(item.faturamento),
                      ];
                    },
                  },
                },
              },
              scales: {
                x: { ticks: { font: { size: 9 } } },
                y: {
                  ticks: {
                    font: { size: 9 },
                    callback: (val: any) => 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
                  },
                },
              },
            },
          });
        }
  
        // ═══ NOVOS GRÁFICOS DE RECEITA ═══
  
        // 3. Evolução Diária de Receita (barras + linha de média)
        const ctx3 = document.getElementById('chart-receita-diaria') as HTMLCanvasElement;
        if (ctx3 && widgetsAtivos.has('chart_receita_diaria') && g.receitaDiaria && g.receitaDiaria.length > 0) {
          const serie = g.receitaDiaria;
          const stats = calcularStatsReceitaDiaria(serie);
          const media = stats?.media ?? 0;
          const valores = serie.map((r: { valor: number }) => r.valor);
          const maxY = Math.max(...valores, media, 1) * 1.12;
  
          new Chart(ctx3, {
            type: 'bar',
            data: {
              labels: serie.map((r: { label: string; data?: string }) => {
                const ds = r.data ? diaSemanaDeIso(r.data) : '';
                return ds ? `${r.label} · ${ds}` : r.label;
              }),
              datasets: [
                {
                  type: 'bar' as const,
                  label: 'Faturamento',
                  data: valores,
                  backgroundColor: valores.map((v: number) => corBarraReceita(v, media)),
                  hoverBackgroundColor: valores.map((v: number) => corBarraReceita(v, media).replace('0.88', '1').replace('0.78', '0.95').replace('0.82', '0.95')),
                  borderRadius: 6,
                  borderSkipped: false,
                  maxBarThickness: 42,
                  order: 2,
                },
                {
                  type: 'line' as const,
                  label: 'Média do período',
                  data: valores.map(() => Math.round(media * 100) / 100),
                  borderColor: '#6366f1',
                  backgroundColor: 'transparent',
                  borderWidth: 2,
                  borderDash: [7, 5],
                  pointRadius: 0,
                  pointHoverRadius: 0,
                  tension: 0,
                  order: 1,
                },
              ],
            },
            options: {
              animation: { duration: 400, easing: 'easeOutQuart' },
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              plugins: {
                legend: {
                  display: true,
                  position: 'bottom',
                  labels: {
                    boxWidth: 10,
                    boxHeight: 10,
                    font: { size: 10, weight: 600 },
                    color: '#64748b',
                    usePointStyle: true,
                    padding: 14,
                  },
                },
                tooltip: {
                  backgroundColor: '#0f172a',
                  titleFont: { size: 12, weight: 'bold' },
                  bodyFont: { size: 11 },
                  padding: 12,
                  cornerRadius: 8,
                  callbacks: {
                    title: (items: { dataIndex: number }[]) => {
                      const idx = items[0]?.dataIndex ?? 0;
                      const item = serie[idx];
                      const ds = item?.data ? diaSemanaDeIso(item.data) : '';
                      return ds ? `${item?.label} (${ds})` : (item?.label || '');
                    },
                    label: (ctx: { datasetIndex: number; parsed: { y: number } }) => {
                      if (ctx.datasetIndex === 1) {
                        return ` Média: ${formatMoeda(ctx.parsed.y)}`;
                      }
                      return ` Faturamento: ${formatMoeda(ctx.parsed.y)}`;
                    },
                    afterBody: (items: { dataIndex: number }[]) => {
                      const idx = items[0]?.dataIndex ?? 0;
                      const item = serie[idx] as { km?: number; horas?: number; valor: number };
                      const linhas: string[] = [];
                      if (media > 0 && item.valor > 0) {
                        const pct = ((item.valor - media) / media) * 100;
                        const sinal = pct >= 0 ? '+' : '';
                        linhas.push(`${sinal}${pct.toFixed(1)}% vs média`);
                      }
                      if (item.km && item.km > 0) linhas.push(`KM: ${item.km.toLocaleString('pt-BR')}`);
                      if (item.horas && item.horas > 0) linhas.push(`Horas: ${item.horas.toFixed(1)} h`);
                      return linhas;
                    },
                  },
                },
              },
              scales: {
                x: {
                  grid: { display: false },
                  ticks: {
                    font: { size: 9, weight: 500 },
                    color: '#64748b',
                    maxRotation: 45,
                    minRotation: 0,
                    autoSkip: true,
                    maxTicksLimit: serie.length > 14 ? 12 : undefined,
                  },
                },
                y: {
                  beginAtZero: true,
                  suggestedMax: maxY,
                  grid: { color: 'rgba(226,232,240,0.8)' },
                  ticks: {
                    font: { size: 9 },
                    color: '#94a3b8',
                    callback: (v: number | string) => formatarMoedaCompacta(Number(v)),
                  },
                },
              },
            },
          });
        }
  
        // 4. Ranking Motoristas (barras horizontais)
        const ctx4 = document.getElementById('chart-ranking-motoristas') as HTMLCanvasElement;
        if (ctx4 && widgetsAtivos.has('chart_ranking_motoristas') && g.rankingMotoristas && g.rankingMotoristas.length > 0) {
          const lbl4 = [...g.rankingMotoristas].reverse().map((r: any) =>
            r.motorista.length > 16 ? r.motorista.slice(0,14)+'…' : r.motorista
          );
          const dat4 = [...g.rankingMotoristas].reverse().map((r: any) => r.faturamento);
          const col4 = dat4.map((_: any, i: number) =>
            i === dat4.length-1 ? '#fbbf24' : i === dat4.length-2 ? '#94a3b8' : i === dat4.length-3 ? '#d97706' : '#22c55e'
          );
          new Chart(ctx4, {
            type: 'bar',
            data: { labels: lbl4, datasets: [{ data: dat4, backgroundColor: col4, borderRadius: 3 }] },
            options: {
              indexAxis: 'y', animation: false, responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } },
                y: { ticks: { font: { size: 8 } } }
              },
            },
          });
        }
  
        // 5. Receita por Regional (barras)
        const ctx5 = document.getElementById('chart-receita-regional') as HTMLCanvasElement;
        if (ctx5 && widgetsAtivos.has('chart_receita_regional') && g.receitaPorRegional?.length > 0) {
          const maxF = Math.max(...g.receitaPorRegional?.map((r: any) => r.faturamento));
          const cores5 = g.receitaPorRegional?.map((r: any) => {
            const pct = r.faturamento / maxF;
            return pct > 0.75 ? '#059669' : pct > 0.50 ? '#10b981' : pct > 0.25 ? '#34d399' : '#a7f3d0';
          });
          new Chart(ctx5, {
            type: 'bar',
            data: {
              labels: g.receitaPorRegional?.map((r: any) => r.regional),
              datasets: [{ data: g.receitaPorRegional?.map((r: any) => r.faturamento), backgroundColor: cores5, borderRadius: 4 }]
            },
            options: {
              animation: false, responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { font: { size: 9 } } },
                y: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } }
              },
            },
          });
        }
  
        // 6. Receita por Dia da Semana
        const ctx6 = document.getElementById('chart-receita-diasemana') as HTMLCanvasElement;
        if (ctx6 && widgetsAtivos.has('chart_receita_diasemana') && g.receitaPorDiaSemana && g.receitaPorDiaSemana.length > 0) {
          const diasLabel = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
          const lbl6 = g.receitaPorDiaSemana.map((d: any) => diasLabel[d.diaSemana-1] || d.diaNome);
          new Chart(ctx6, {
            type: 'bar',
            data: {
              labels: lbl6,
              datasets: [{
                data: g.receitaPorDiaSemana.map((d: any) => d.faturamento),
                backgroundColor: ['#ef4444','#3b82f6','#22c55e','#f59e0b','#8b5cf6','#ec4899','#06b6d4'],
                borderRadius: 4,
              }]
            },
            options: {
              animation: false, responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { font: { size: 9 } } },
                y: { ticks: { font: { size: 8 }, callback: (v: any) => (v/1000).toFixed(0)+'k' } }
              },
            },
          });
        }
  
        // 7. Receita por Turno (donut)
        const ctx7 = document.getElementById('chart-receita-turno') as HTMLCanvasElement;
        if (ctx7 && widgetsAtivos.has('chart_receita_turno') && g.receitaPorTurno?.length > 0) {
          new Chart(ctx7, {
            type: 'doughnut',
            data: {
              labels: g.receitaPorTurno?.map((t: any) => t.turno),
              datasets: [{
                data: g.receitaPorTurno?.map((t: any) => t.faturamento),
                backgroundColor: ['#fbbf24','#1e293b','#6366f1','#ec4899'],
                borderWidth: 2, borderColor: 'white',
              }]
            },
            options: {
              animation: false, responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 10 } },
              },
            },
          });
        }
      }
  
      carregarChartJS();
    }, [dados, widgetsAtivos]);

  if (!temGrupoAtivo(widgetsAtivos, 'graficos')) return null;

  return (
    <>
      <div className="exec-section-title">
        <div className="bar purple" />
        <span>Gráficos Financeiros</span>
      </div>
      
                {(widgetAtivo('chart_receita_km') || widgetAtivo('chart_receita_hora')) && (
                  <div className="graficos-row-2">
                    {widgetAtivo('chart_receita_km') && (
                      <div className="grafico-card">
                        <h3>📊 Receita por Km Rodado (7 dias)</h3>
                        {g.usandoEstimativa && (
                          <div className="estimativa-badge">
                            <FiAlertCircle size={12} />
                            Estimativa de R$ 80/ton — Configure valores no contrato
                          </div>
                        )}
                        <div className="chart-wrapper">
                          <canvas id="chart-receita-km"></canvas>
                        </div>
                        <div className="grafico-media" style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                          Média: {(g.receitaKmMedio ?? 0) > 0 ? 'R$ ' + (g.receitaKmMedio ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/km' : '—'}
                        </div>
                      </div>
                    )}
      
                    {widgetAtivo('chart_receita_hora') && (
                      <div className="grafico-card">
                        <h3>📊 Receita por Hora Produtiva (7 dias)</h3>
                        {g.usandoEstimativa && (
                          <div className="estimativa-badge">
                            <FiAlertCircle size={12} />
                            Estimativa de R$ 80/ton — Configure valores no contrato
                          </div>
                        )}
                        <div className="chart-wrapper">
                          <canvas id="chart-receita-hora"></canvas>
                        </div>
                        <div className="grafico-media" style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>
                          Média: {(g.receitaHoraMedia ?? 0) > 0 ? 'R$ ' + (g.receitaHoraMedia ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '/h' : '—'}
                        </div>
                      </div>
                    )}
                  </div>
                )}
      
                {(widgetAtivo('chart_receita_diaria') || widgetAtivo('chart_ranking_motoristas')) && (
                  <div className="graficos-row-2">
                    {widgetAtivo('chart_receita_diaria') && (
                      <div className="grafico-card grafico-receita-diaria">
                        <div className="grafico-card-topo">
                          <div>
                            <h3>Evolução Diária de Receita</h3>
                            <p className="grafico-subtitulo">
                              Faturamento por dia com operação
                              {statsReceitaDiaria && (
                                <> · {statsReceitaDiaria.diasComReceita} dia(s) no período</>
                              )}
                            </p>
                          </div>
                          {g.usandoEstimativa && (
                            <span className="grafico-badge-estimativa">Estimado</span>
                          )}
                        </div>
                        {statsReceitaDiaria && (
                          <div className="grafico-receita-stats">
                            <div className="grafico-stat">
                              <span className="lbl">Total</span>
                              <span className="val">{formatarMoeda(statsReceitaDiaria.total)}</span>
                            </div>
                            <div className="grafico-stat">
                              <span className="lbl">Média / dia</span>
                              <span className="val">{formatarMoeda(statsReceitaDiaria.media)}</span>
                            </div>
                            <div className="grafico-stat destaque">
                              <span className="lbl">Melhor dia</span>
                              <span className="val">
                                {statsReceitaDiaria.melhor.label}
                                {' · '}
                                {formatarMoeda(statsReceitaDiaria.melhor.valor)}
                              </span>
                            </div>
                          </div>
                        )}
                        <div className="chart-wrapper chart-receita-diaria">
                          <canvas id="chart-receita-diaria"></canvas>
                        </div>
                        <div className="grafico-legenda-cores">
                          <span><i className="cor acima" /> Acima da média</span>
                          <span><i className="cor na-media" /> Na média</span>
                          <span><i className="cor abaixo" /> Abaixo da média</span>
                        </div>
                      </div>
                    )}
      
                    {widgetAtivo('chart_ranking_motoristas') && (
                      <div className="grafico-card">
                        <h3>🏆 Top Motoristas por Receita</h3>
                        <div className="chart-wrapper">
                          <canvas id="chart-ranking-motoristas"></canvas>
                        </div>
                      </div>
                    )}
                  </div>
                )}
      
                {(widgetAtivo('chart_receita_regional') || widgetAtivo('chart_receita_diasemana')) && (
                  <div className="graficos-row-2">
                    {widgetAtivo('chart_receita_regional') && g.receitaPorRegional?.length > 0 && (
                      <div className="grafico-card">
                        <h3>🌎 Receita por Regional</h3>
                        <div className="chart-wrapper">
                          <canvas id="chart-receita-regional"></canvas>
                        </div>
                      </div>
                    )}
      
                    {widgetAtivo('chart_receita_diasemana') && (
                      <div className="grafico-card">
                        <h3>📅 Receita por Dia da Semana</h3>
                        <div className="chart-wrapper">
                          <canvas id="chart-receita-diasemana"></canvas>
                        </div>
                      </div>
                    )}
                  </div>
                )}
      
                {widgetAtivo('chart_receita_turno') && g.receitaPorTurno?.length > 1 && (
                  <div className="graficos-row-2">
                    <div className="grafico-card" style={{ maxWidth: '50%' }}>
                      <h3>☀️ Receita por Turno</h3>
                      <div className="chart-wrapper">
                        <canvas id="chart-receita-turno"></canvas>
                      </div>
                    </div>
                  </div>
                )}
    </>
  );
});

export default DashboardGraficos;
