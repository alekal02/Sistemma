import { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { FiAward, FiTrendingDown } from 'react-icons/fi';
import dashboardExecutivoService, {
  type KpiOperacionalMotoristasResponse,
  type RankingPar,
} from '../services/dashboardExecutivoService';

interface Props {
  contractId: string;
  servicoId: string;
  filtros?: {
    dataInicio?: string;
    dataFim?: string;
    placa?: string;
    tipoCaminhao?: string;
    filtrosDinamicos?: Record<string, string>;
  };
}

type Categoria = 'motoristas' | 'coletores' | 'rotas';

interface ItemGrafico {
  nome: string;
  tonelagem: number;
  viagens: number;
}

function extrairItens(
  categoria: Categoria,
  par: RankingPar<any>,
  tipo: 'melhores' | 'piores',
): ItemGrafico[] {
  const lista = par[tipo] || [];
  return lista.map((item) => ({
    nome:
      categoria === 'motoristas'
        ? item.motorista
        : categoria === 'coletores'
          ? item.coletor
          : item.rota,
    tonelagem: item.tonelagem ?? 0,
    viagens: item.viagens ?? 0,
  }));
}

function RankingChart({
  titulo,
  itens,
  cor,
  icone,
}: {
  titulo: string;
  itens: ItemGrafico[];
  cor: string;
  icone: 'melhor' | 'pior';
}) {
  const dados = useMemo(
    () => [...itens].reverse().map((i) => ({
      ...i,
      nomeCurto: i.nome.length > 22 ? `${i.nome.slice(0, 20)}…` : i.nome,
    })),
    [itens],
  );

  if (itens.length === 0) {
    return (
      <div className="ranking-chart-card ranking-chart-card--empty">
        <div className="ranking-chart-header">
          {icone === 'melhor' ? <FiAward size={14} color={cor} /> : <FiTrendingDown size={14} color={cor} />}
          <span>{titulo}</span>
        </div>
        <p className="ranking-chart-empty">Sem dados suficientes no período.</p>
      </div>
    );
  }

  return (
    <div className="ranking-chart-card">
      <div className="ranking-chart-header">
        {icone === 'melhor' ? <FiAward size={14} color={cor} /> : <FiTrendingDown size={14} color={cor} />}
        <span>{titulo}</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(220, dados.length * 26 + 40)}>
        <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={(v) => `${v} t`}
          />
          <YAxis
            type="category"
            dataKey="nomeCurto"
            width={108}
            tick={{ fontSize: 10, fill: '#334155' }}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`, 'Tonelagem']}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.nome ?? ''}
            contentStyle={{ fontSize: '0.75rem', borderRadius: 8 }}
          />
          <Bar dataKey="tonelagem" fill={cor} radius={[0, 4, 4, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function RankingsOperacionais({ contractId, servicoId, filtros }: Props) {
  const [dados, setDados] = useState<KpiOperacionalMotoristasResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const filtrosKey = useMemo(
    () => JSON.stringify(filtros ?? {}),
    [filtros?.dataInicio, filtros?.dataFim, filtros?.placa, filtros?.tipoCaminhao, JSON.stringify(filtros?.filtrosDinamicos ?? {})],
  );

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    dashboardExecutivoService
      .carregarKpiMotoristas(contractId, servicoId, filtros)
      .then((res) => {
        if (!cancelado) setDados(res);
      })
      .catch(() => {
        if (!cancelado) setErro('Não foi possível carregar os rankings operacionais.');
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => { cancelado = true; };
  }, [contractId, servicoId, filtrosKey]);

  if (carregando) {
    return (
      <div className="rankings-operacionais">
        <h3 className="rankings-operacionais-titulo">Rankings — Melhores e Piores</h3>
        <div className="rankings-operacionais-loading">Carregando rankings…</div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="rankings-operacionais">
        <h3 className="rankings-operacionais-titulo">Rankings — Melhores e Piores</h3>
        <div className="rankings-operacionais-erro">{erro}</div>
      </div>
    );
  }

  if (!dados?.rankings) return null;

  const secoes: { categoria: Categoria; label: string; aviso?: string }[] = [
    { categoria: 'motoristas', label: 'Motoristas' },
    {
      categoria: 'coletores',
      label: 'Coletores',
      aviso: !dados.metadados.temColetores
        ? 'Preencha as colunas COLETOR 01–04 na planilha para ver o ranking por coletor.'
        : undefined,
    },
    {
      categoria: 'rotas',
      label: dados.metadados.colunaRotaLabel
        ? `Distritos / ${dados.metadados.colunaRotaLabel}`
        : 'Distritos / Rotas',
      aviso: !dados.metadados.temRota ? 'Nenhuma coluna de distrito/rota detectada na planilha.' : undefined,
    },
  ];

  return (
    <div className="rankings-operacionais">
      <div className="rankings-operacionais-cabecalho">
        <h3 className="rankings-operacionais-titulo">Rankings — Melhores e Piores</h3>
        <span className="rankings-operacionais-subtitulo">
          Top 20 por tonelagem no período · {dados.metadados.totalTonelagem.toLocaleString('pt-BR')} t no total
        </span>
      </div>

      {secoes.map(({ categoria, label, aviso }) => (
        <section key={categoria} className="rankings-secao">
          <h4 className="rankings-secao-titulo">{label}</h4>
          {aviso && <p className="rankings-secao-aviso">{aviso}</p>}
          <div className="rankings-grid">
            <RankingChart
              titulo={`Top 20 melhores — ${label.toLowerCase()}`}
              itens={extrairItens(categoria, dados.rankings![categoria], 'melhores')}
              cor="#16a34a"
              icone="melhor"
            />
            <RankingChart
              titulo={`Top 20 piores — ${label.toLowerCase()}`}
              itens={extrairItens(categoria, dados.rankings![categoria], 'piores')}
              cor="#dc2626"
              icone="pior"
            />
          </div>
        </section>
      ))}
    </div>
  );
}
