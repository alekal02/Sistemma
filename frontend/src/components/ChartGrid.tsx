import { useEffect, useState, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import servicoService from '../services/servicoService';

interface ChartData {
  name: string;
  value: number;
}

interface GraficoConfig {
  tipo: 'barra' | 'linha' | 'pizza';
  titulo: string;
  eixoX: string;
  eixoY: string;
  ativo: boolean;
}

interface ChartGridProps {
  graficos: GraficoConfig[];
  dadosBrutos?: any[];
  colunasHoraSet?: Set<string>;
  CORES?: string[];
  contractId?: string;
  servicoId?: string;
  filtrosAtivos?: Record<string, any>;
}

const CORES_PADRAO = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

function fmt(v: number, e: string): string {
  const n = e.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (['R$','$','VALOR','PRECO','CUSTO','RECEITA','VENDA'].some(x => n.includes(x)))
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (['TON','PESO','KG','COLET'].some(x => n.includes(x)))
    return v >= 1000 ? (v/1000).toFixed(2) + ' t' : v.toFixed(2) + ' kg';
  if (['KM','DISTAN'].some(x => n.includes(x)))
    return v >= 1000 ? (v/1000).toFixed(2) + ' mil km' : v.toFixed(1) + ' km';
  if (['HORA','SAIDA','CHEGADA'].some(x => n.includes(x))) {
    const h = Math.floor(Math.abs(v)/60), m = Math.round(Math.abs(v)%60);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} h`;
  }
  if (['%','TAXA'].some(x => n.includes(x))) return v.toFixed(1) + '%';
  if (Math.abs(v) >= 1000000) return (v/1000000).toFixed(2) + ' M';
  if (Math.abs(v) >= 10000) return (v/1000).toFixed(1) + ' mil';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

export default function ChartGrid({
  graficos, dadosBrutos = [], colunasHoraSet = new Set(),
  CORES = CORES_PADRAO, contractId, servicoId, filtrosAtivos,
}: ChartGridProps) {
  const { token } = useAuth();
  const [dados, setDados] = useState<Record<number, ChartData[]>>({});
  const [carregando, setCarregando] = useState<Record<number, boolean>>({});
  const rid = useRef(0);
  const mon = useRef(true);

  useEffect(() => { mon.current = true; return () => { mon.current = false; }; }, []);

  // Evita re-render por colunasHoraSet
  const chs = useMemo(() => colunasHoraSet, [colunasHoraSet.size]);
  const gk = useMemo(() => graficos.map(g => `${g.titulo}|${g.tipo}|${g.eixoX}|${g.eixoY}|${g.ativo}`).join(';;'), [graficos]);
  const fk = useMemo(() => JSON.stringify(filtrosAtivos ?? {}), [filtrosAtivos]);
  const bk = `${dadosBrutos.length}`;

  useEffect(() => {
    if (!graficos.length) { setDados({}); setCarregando({}); return; }
    const req = ++rid.current;
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 25000);

    const loading: Record<number, boolean> = {};
    graficos.forEach((_, i) => { loading[i] = true; });
    setCarregando(loading);

    const pl = graficos.map((g, i) => ({ idx: i, eixoX: g.eixoX, eixoY: g.tipo === 'pizza' ? undefined : g.eixoY, tipo: g.tipo, topN: g.tipo === 'pizza' ? 8 : 10 }));
    const body: Record<string, unknown> = { graficos: pl };
    if (filtrosAtivos && Object.keys(filtrosAtivos).length) body.filtros = filtrosAtivos;

    servicoService.getGraficosAgregados(contractId!, servicoId!, body, controller.signal)
      .then(data => {
        if (rid.current !== req || !mon.current) return;
        const r: Record<number, ChartData[]> = {};
        const l: Record<number, boolean> = {};
        for (const item of data.graficos || []) {
          r[item.idx] = (item.dados || []).map((d: any) => ({ name: d.name, value: Math.round(d.value * 100) / 100 }));
          l[item.idx] = false;
        }
        graficos.forEach((_, i) => { if (l[i] === undefined) { r[i] = []; l[i] = false; } });
        setDados(r);
        setCarregando(l);
      })
      .catch(err => {
        if (err?.name === 'AbortError' || rid.current !== req) return;
        const r: Record<number, ChartData[]> = {};
        const l: Record<number, boolean> = {};
        graficos.forEach((_, i) => { r[i] = []; l[i] = false; });
        setDados(r);
        setCarregando(l);
      })
      .finally(() => clearTimeout(to));

    return () => { controller.abort(); };
  }, [gk, fk, bk, contractId, servicoId, token]);

  if (!graficos.length) return null;

  return (
    <div className="chart-grid">
      {graficos.map((g, idx) => {
        const dd = dados[idx] || [];
        return (
          <div key={idx} className="card card-bordered" style={{ padding: '1rem' }}>
            <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
              {g.titulo}
              {carregando[idx] && <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: '#94a3b8' }}>carregando...</span>}
            </h4>
            {!dd.length && !carregando[idx] ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.78rem' }}>
                Nenhum dado disponivel para este grafico
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                {g.tipo === 'pizza' ? (
                  <PieChart>
                    <Pie data={dd} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} isAnimationActive={false}
                      label={({ name, value, percent }: any) => `${name}: ${fmt(value, g.eixoX)} (${((percent??0)*100).toFixed(0)}%)`}>
                      {dd.map((_: any, i: number) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v, g.eixoX), 'Total']} />
                  </PieChart>
                ) : (
                  <BarChart data={dd} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} width={48}
                      tickFormatter={(v: number) => fmt(v, g.eixoY)} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.78rem' }}
                      formatter={(v: number) => [fmt(v, g.eixoY), g.eixoY]} />
                    <Bar dataKey="value" fill={CORES[idx % CORES.length]} radius={[4,4,0,0]} isAnimationActive={false} maxBarSize={48} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        );
      })}
    </div>
  );
}
