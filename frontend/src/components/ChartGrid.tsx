import { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useAuth } from '../contexts/AuthContext';

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
  /** Fallback local — usado apenas se contractId/servicoId/token não forem passados */
  dadosBrutos?: any[];
  colunasHoraSet?: Set<string>;
  CORES?: string[];
  /** Propriedades para usar o endpoint de agregação no backend */
  contractId?: string;
  servicoId?: string;
  /** Filtros ativos para enviar ao backend */
  filtrosAtivos?: Record<string, any>;
}

const CORES_PADRAO = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

/**
 * Formata valor de forma inteligente baseado no nome do eixo Y
 */
function formatarValor(valor: number, eixoY: string): string {
  const nome = eixoY.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Moeda
  if (nome.includes('R$') || nome.includes('$') || nome.includes('VALOR') ||
      nome.includes('PRECO') || nome.includes('PRECO') || nome.includes('CUSTO') ||
      nome.includes('FATURAMENTO') || nome.includes('RECEITA') || nome.includes('VENDA') ||
      nome.includes('TOTAL_R') || nome.includes('TOTAL_V')) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Toneladas / Peso
  if (nome.includes('TON') || nome.includes('TONELADA') || nome.includes('PESO') ||
      nome.includes('KG') || nome.includes('COLET') || nome.includes('COLETADA') ||
      nome.includes('CARGA')) {
    if (valor >= 1000) {
      return (valor / 1000).toFixed(2) + ' t';
    }
    return valor.toFixed(2) + ' kg';
  }

  // KM / Distancia
  if (nome.includes('KM') || nome.includes('KILOMETRO') || nome.includes('QUILOMETRO') ||
      nome.includes('DISTAN') || nome.includes('DISTANCIA')) {
    if (valor >= 1000) {
      return (valor / 1000).toFixed(2) + ' mil km';
    }
    return valor.toFixed(1) + ' km';
  }

  // Horas (formato serial Excel ou texto HH:MM)
  if (nome.includes('HORA') || nome.includes('HORAR') || nome.includes('TEMPO') ||
      nome.includes('DURACAO') || nome.includes('MINUT') || nome.includes('ENTRADA') ||
      nome.includes('SAIDA') || nome.includes('CHEGADA')) {
    const h = Math.floor(Math.abs(valor) / 60);
    const m = Math.round(Math.abs(valor) % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' h';
  }

  // Porcentagem
  if (nome.includes('%') || nome.includes('PORCENT') || nome.includes('PERCENT') ||
      nome.includes('PROPORCAO') || nome.includes('TAXA')) {
    return valor.toFixed(1) + '%';
  }

  // Numeros grandes (> 10000)
  if (Math.abs(valor) >= 1000000) {
    return (valor / 1000000).toFixed(2) + ' M';
  }
  if (Math.abs(valor) >= 10000) {
    return (valor / 1000).toFixed(1) + ' mil';
  }

  // Padrao
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Encontra valor em um objeto por chave com fallback case-insensitive
 */
function encontrarValor(dado: Record<string, any>, nomeColuna: string): any {
  if (!dado || !nomeColuna) return undefined;
  if (dado[nomeColuna] !== undefined && dado[nomeColuna] !== null) return dado[nomeColuna];

  const normalizar = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const chaveNorm = normalizar(nomeColuna);

  for (const [k, v] of Object.entries(dado)) {
    if (v !== null && v !== undefined && normalizar(k) === chaveNorm) return v;
  }

  if (dado.dados && typeof dado.dados === 'object' && !Array.isArray(dado.dados)) {
    return encontrarValor(dado.dados, nomeColuna);
  }

  return undefined;
}

/**
 * Converte serial Excel de hora em minutos totais
 */
function serialParaMinutos(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number);
    return h * 60 + (m || 0);
  }
  if (typeof v === 'string') {
    const num = parseFloat(v.trim());
    if (!isNaN(num) && num > 0) {
      const dias = Math.floor(num);
      const fracao = num - dias;
      return Math.round(dias * 24 * 60 + fracao * 24 * 60);
    }
    return 0;
  }
  if (typeof v === 'number' && v > 0) {
    if (v < 100) return Math.round(v * 24 * 60);
    return Math.round(v);
  }
  return Number(v) || 0;
}

/**
 * Agregacao LOCAL (fallback) — para quando o backend nao esta disponivel
 */
function agregarGraficoLocal(
  eixoX: string,
  eixoY: string,
  dadosBrutos: any[],
  colunasHoraSet: Set<string>
): ChartData[] {
  const nomeUpperY = eixoY.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const temKM = nomeUpperY.includes('KM') || nomeUpperY.includes('KILOMETRO') || nomeUpperY.includes('QUILOMETRO');
  const isHoraY = colunasHoraSet.has(eixoY) || (!temKM && (
    nomeUpperY.includes('HORA') || nomeUpperY.includes('HORAR') ||
    nomeUpperY.includes('TEMPO') || nomeUpperY.includes('DURACAO') ||
    nomeUpperY.includes('MINUT') || nomeUpperY.includes('ENTRADA') ||
    nomeUpperY.includes('SAIDA') || nomeUpperY.includes('CHEGADA')
  ));

  const agrupado: Record<string, number> = {};
  for (const d of dadosBrutos) {
    const key = String(encontrarValor(d, eixoX) || 'N/A');
    const valRaw = encontrarValor(d, eixoY);
    const val = isHoraY ? serialParaMinutos(valRaw) : Number(valRaw) || 0;
    agrupado[key] = (agrupado[key] || 0) + val;
  }

  return Object.entries(agrupado)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, value]) => ({ name, value }));
}

function agregarPizzaLocal(eixo: string, dadosBrutos: any[]): ChartData[] {
  const agrupado: Record<string, number> = {};
  for (const d of dadosBrutos) {
    const key = String(encontrarValor(d, eixo) || 'N/A');
    agrupado[key] = (agrupado[key] || 0) + 1;
  }

  return Object.entries(agrupado)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));
}

export default function ChartGrid({
  graficos,
  dadosBrutos = [],
  colunasHoraSet = new Set(),
  CORES = CORES_PADRAO,
  contractId,
  servicoId,
  filtrosAtivos,
}: ChartGridProps) {
  const { token } = useAuth();
  const [dadosGraficos, setDadosGraficos] = useState<Record<number, ChartData[]>>({});
  const [carregandoGraficos, setCarregandoGraficos] = useState<Record<number, boolean>>({});
  const carregadosRef = useRef<Set<number>>(new Set());

  // Usa backend se contractId, servicoId e token estiverem disponiveis
  const usaBackend = !!(contractId && servicoId && token);

  useEffect(() => {
    if (!usaBackend) {
      // Modo fallback local — usa dadosBrutos diretamente
      const dados: Record<number, ChartData[]> = {};
      graficos.forEach((g, idx) => {
        dados[idx] = g.tipo === 'pizza'
          ? agregarPizzaLocal(g.eixoX, dadosBrutos)
          : agregarGraficoLocal(g.eixoX, g.eixoY, dadosBrutos, colunasHoraSet);
      });
      setDadosGraficos(dados);
      return;
    }

    // Modo backend: busca cada grafico via API
    graficos.forEach((g, idx) => {
      if (carregadosRef.current.has(idx)) return;

      setCarregandoGraficos(prev => ({ ...prev, [idx]: true }));
      carregadosRef.current.add(idx);

      const body: any = {
        eixoX: g.eixoX,
        tipo: g.tipo,
        topN: g.tipo === 'pizza' ? 8 : 10,
      };
      if (g.tipo !== 'pizza') {
        body.eixoY = g.eixoY;
      }
      // Incluir filtros ativos se houver
      if (filtrosAtivos && Object.keys(filtrosAtivos).length > 0) {
        body.filtros = filtrosAtivos;
      }

      fetch(`/api/contracts/${contractId}/servicos/${servicoId}/grafico-agregado`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
        .then(res => {
          if (!res.ok) throw new Error('Erro na resposta');
          return res.json();
        })
        .then(data => {
          setDadosGraficos(prev => ({
            ...prev,
            [idx]: (data.dados || []).map((d: any) => ({
              name: d.name,
              value: Math.round(d.value * 100) / 100,
            })),
          }));
        })
        .catch(err => {
          console.error('[ChartGrid] Erro ao carregar grafico ' + idx + ':', err);
          // Fallback: agregacao local com dados limitados
          setDadosGraficos(prev => ({
            ...prev,
            [idx]: g.tipo === 'pizza'
              ? agregarPizzaLocal(g.eixoX, dadosBrutos)
              : agregarGraficoLocal(g.eixoX, g.eixoY, dadosBrutos, colunasHoraSet),
          }));
        })
        .finally(() => {
          setCarregandoGraficos(prev => ({ ...prev, [idx]: false }));
        });
    });
  }, [graficos, dadosBrutos, colunasHoraSet, contractId, servicoId, token, usaBackend, filtrosAtivos]);

  if (!graficos.length) return null;

  return (
    <>
      <div
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 700,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '0.6rem',
        }}
      >
        Graficos ({graficos.length})
      </div>
      <div className="chart-grid">
        {graficos.map((g, idx) => {
          const dadosGrafico = dadosGraficos[idx] || [];

          return (
            <div
              key={idx}
              className="card card-bordered"
              style={{ padding: '1rem' }}
            >
              <h4
                style={{
                  margin: '0 0 0.75rem',
                  fontSize: '0.85rem',
                  color: 'var(--color-text-primary)',
                }}
              >
                {g.titulo}
                {carregandoGraficos[idx] && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: '#94a3b8' }}>
                    carregando...
                  </span>
                )}
              </h4>
              {dadosGrafico.length === 0 && !carregandoGraficos[idx] ? (
                <div style={{
                  textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontSize: '0.78rem'
                }}>
                  Nenhum dado disponivel para este grafico
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  {g.tipo === 'barra' ? (
                    <BarChart data={dadosGrafico}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => formatarValor(v, g.eixoY)}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatarValor(value, g.eixoY), g.eixoY]}
                        labelFormatter={(label: string) => g.eixoX + ': ' + label}
                      />
                      <Bar dataKey="value" fill={CORES[idx % CORES.length]} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : g.tipo === 'linha' ? (
                    <LineChart data={dadosGrafico}>
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }}
                        tickFormatter={(v: number) => formatarValor(v, g.eixoY)}
                      />
                      <Tooltip
                        formatter={(value: number) => [formatarValor(value, g.eixoY), g.eixoY]}
                        labelFormatter={(label: string) => g.eixoX + ': ' + label}
                      />
                      <Line type="monotone" dataKey="value" stroke={CORES[idx % CORES.length]} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  ) : (
                    <PieChart>
                      <Pie
                        data={dadosGrafico}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={({ name, value, percent }) => name + ': ' + formatarValor(value, g.eixoX) + ' (' + ((percent ?? 0) * 100).toFixed(0) + '%)'}
                      >
                        {dadosGrafico.map((_: any, i: number) => (
                          <Cell key={i} fill={CORES[i % CORES.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [formatarValor(value, g.eixoX), 'Total']}
                      />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
