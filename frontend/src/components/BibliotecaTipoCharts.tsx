import { memo, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid,
} from 'recharts';

export interface KpiAgregadoChart {
  nome: string;
  media: number;
  total: number;
}

export interface ServicoIndicadorChart {
  nome: string;
  totalRegistros: number;
}

const CORES_GRAFICOS = ['#6366f1', '#22c55e', '#f59e0b', '#14b8a6', '#8b5cf6', '#ec4899', '#f97316', '#3b82f6', '#ef4444', '#84cc16'];

function truncarNome(nome: string, max: number): string {
  return nome.length > max ? nome.substring(0, max) + '...' : nome;
}

export const BibliotecaKpiMediaChart = memo(function BibliotecaKpiMediaChart({
  kpis,
  tipoCor,
}: {
  kpis: KpiAgregadoChart[];
  tipoCor: string;
}) {
  const dados = useMemo(
    () => kpis.slice(0, 10).map(k => ({
      name: truncarNome(k.nome, 16),
      nomeCompleto: k.nome,
      media: Math.round(k.media * 100) / 100,
      total: Math.round(k.total * 100) / 100,
    })),
    [kpis],
  );

  if (dados.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
        Nenhum indicador com dados
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={dados} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis type="number" tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
        <Tooltip
          formatter={(value: number) => value.toLocaleString('pt-BR')}
          labelFormatter={(label) => `KPI: ${label}`}
        />
        <Bar dataKey="media" name="Média" fill={tipoCor} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

export const BibliotecaRegistrosPieChart = memo(function BibliotecaRegistrosPieChart({
  servicos,
}: {
  servicos: ServicoIndicadorChart[];
}) {
  const dadosPizza = useMemo(
    () => [...servicos]
      .map(sv => ({
        name: truncarNome(sv.nome, 14),
        nomeCompleto: sv.nome,
        value: sv.totalRegistros,
      }))
      .sort((a, b) => b.value - a.value),
    [servicos],
  );

  if (dadosPizza.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '50px 0', color: '#94a3b8', fontSize: '0.8rem' }}>
        Sem dados de registro
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={dadosPizza}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={85}
          innerRadius={35}
          label={({ name, percent }: { name: string; percent?: number }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
        >
          {dadosPizza.map((_, i) => (
            <Cell key={i} fill={CORES_GRAFICOS[i % CORES_GRAFICOS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
      </PieChart>
    </ResponsiveContainer>
  );
});

export const BibliotecaKpiTotalChart = memo(function BibliotecaKpiTotalChart({
  kpis,
  tipoCor,
}: {
  kpis: KpiAgregadoChart[];
  tipoCor: string;
}) {
  const dadosTotal = useMemo(
    () => kpis.slice(0, 8).map(k => ({
      name: truncarNome(k.nome, 16),
      nomeCompleto: k.nome,
      total: Math.round(k.total * 100) / 100,
    })),
    [kpis],
  );

  if (dadosTotal.length === 0) return null;

  return (
    <div style={{
      background: 'white', borderRadius: '10px', padding: '1rem',
      border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      marginBottom: '1rem',
    }}>
      <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#1e293b' }}>
        📈 Top Indicadores — Total Acumulado
      </h4>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={dadosTotal}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="name" tick={{ fontSize: 9 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => value.toLocaleString('pt-BR')} />
          <Bar dataKey="total" name="Total" fill={tipoCor} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
