/**
 * Ficha das rotas no ciclo: o comportamento normal de cada rota (mediana),
 * quanto ela varia dia a dia e se está melhorando ou piorando.
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiAlertTriangle,
  FiArrowDownRight,
  FiArrowUpRight,
  FiChevronDown,
  FiChevronUp,
  FiMinus,
  FiRepeat,
} from 'react-icons/fi';
import servicoService, {
  type DirecaoTendenciaRota,
  type FichaRotaCiclo,
  type FichaRotasCicloResponse,
} from '../services/servicoService';

interface Props {
  contractId: string;
  servicoId: string;
  dataInicio: string | null;
  dataFim: string | null;
}

type Filtro = 'todas' | 'atencao' | 'piorando' | 'instaveis';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'atencao', label: 'Com alerta' },
  { id: 'piorando', label: 'Piorando' },
  { id: 'instaveis', label: 'Instáveis' },
  { id: 'todas', label: 'Todas' },
];

const ESTILO_TENDENCIA: Record<DirecaoTendenciaRota, { cor: string; label: string }> = {
  melhorando: { cor: '#15803d', label: 'Melhorando' },
  estavel: { cor: '#64748b', label: 'Estável' },
  piorando: { cor: '#b91c1c', label: 'Piorando' },
};

function fmt(n: number | null | undefined, casas = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function IconeTendencia({ direcao }: { direcao: DirecaoTendenciaRota }) {
  const cor = ESTILO_TENDENCIA[direcao].cor;
  if (direcao === 'melhorando') return <FiArrowUpRight size={13} color={cor} />;
  if (direcao === 'piorando') return <FiArrowDownRight size={13} color={cor} />;
  return <FiMinus size={13} color={cor} />;
}

/** Mini gráfico de linha da tonelada por viagem ao longo do ciclo. */
function Sparkline({ ficha }: { ficha: FichaRotaCiclo }) {
  const pontos = ficha.porDia
    .map((d) => d.tonPorViagem)
    .filter((v): v is number => v != null && v > 0);
  if (pontos.length < 2) return <span style={{ color: '#cbd5e1', fontSize: '0.65rem' }}>—</span>;

  const largura = 78;
  const altura = 20;
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const faixa = max - min || 1;
  const cor = ficha.tendencia ? ESTILO_TENDENCIA[ficha.tendencia.direcao].cor : '#64748b';
  const path = pontos
    .map((v, i) => {
      const x = (i / (pontos.length - 1)) * largura;
      const y = altura - ((v - min) / faixa) * altura;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={largura} height={altura} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={cor} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export default function RotasCicloPainel({ contractId, servicoId, dataInicio, dataFim }: Props) {
  const [aberto, setAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<FichaRotasCicloResponse | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('atencao');
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!contractId || !servicoId || !dataInicio || !dataFim) {
      setDados(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const resp = await servicoService.getRotasCiclo(contractId, servicoId, { dataInicio, dataFim });
      setDados(resp);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      setErro(msg || 'Não foi possível carregar a ficha das rotas.');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, dataInicio, dataFim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const rotas = useMemo(() => {
    const lista = dados?.rotas || [];
    if (filtro === 'atencao') return lista.filter((r) => r.alertas.length > 0);
    if (filtro === 'piorando') return lista.filter((r) => r.tendencia?.direcao === 'piorando');
    if (filtro === 'instaveis') return lista.filter((r) => r.instavelKm || r.instavelCarga);
    return lista;
  }, [dados, filtro]);

  if (!dataInicio || !dataFim) return null;

  const resumo = dados?.resumo;

  return (
    <section style={{
      marginTop: '1rem', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.75rem', padding: '0.75rem 1rem', background: '#f8fafc',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <FiRepeat size={16} color="#4338ca" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
              Consistência das rotas no ciclo
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
              Como cada rota se repete dia a dia — mediana, variação e tendência
              {resumo ? ` · ${resumo.rotas} rota(s)` : ''}
            </div>
          </div>
        </div>
        {aberto ? <FiChevronUp size={18} color="#64748b" /> : <FiChevronDown size={18} color="#64748b" />}
      </button>

      {aberto && (
        <div style={{ padding: '0.85rem 1rem 1rem' }}>
          {carregando ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Carregando rotas…</p>
          ) : erro ? (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
              padding: '0.55rem 0.75rem', fontSize: '0.75rem', color: '#991b1b',
            }}>
              {erro}
              <button
                type="button"
                onClick={() => void carregar()}
                style={{
                  marginLeft: '0.5rem', background: 'none', border: 'none', color: '#b91c1c',
                  fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Tentar de novo
              </button>
            </div>
          ) : !dados || !dados.rotas.length ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              Sem rotas com viagens válidas neste ciclo.
            </p>
          ) : (
            <>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.1rem',
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                padding: '0.5rem 0.7rem', marginBottom: '0.75rem', fontSize: '0.73rem',
              }}>
                <span style={{ color: '#334155' }}>
                  Instáveis: <strong style={{ color: '#b45309' }}>{resumo?.rotasInstaveis ?? 0}</strong>
                </span>
                <span style={{ color: '#334155' }}>
                  Piorando: <strong style={{ color: '#b91c1c' }}>{resumo?.rotasPiorando ?? 0}</strong>
                </span>
                <span style={{ color: '#334155' }}>
                  Melhorando: <strong style={{ color: '#15803d' }}>{resumo?.rotasMelhorando ?? 0}</strong>
                </span>
                {resumo?.diasPeriodo ? (
                  <span style={{ color: '#64748b' }}>{resumo.diasPeriodo} dias no período</span>
                ) : null}
              </div>

              <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.6rem', flexWrap: 'wrap' }}>
                {FILTROS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    style={{
                      border: `1px solid ${filtro === f.id ? '#4338ca' : '#cbd5e1'}`,
                      background: filtro === f.id ? '#eef2ff' : '#fff',
                      color: filtro === f.id ? '#4338ca' : '#475569',
                      borderRadius: '6px', padding: '0.25rem 0.55rem',
                      fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {!rotas.length ? (
                <p style={{ margin: 0, fontSize: '0.76rem', color: '#15803d', fontWeight: 600 }}>
                  Nenhuma rota nesse filtro — as rotas do ciclo estão se repetindo dentro do esperado.
                </p>
              ) : (
                <div style={{ maxHeight: '460px', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.71rem' }}>
                    <thead>
                      <tr>
                        {[
                          { l: 'Rota', a: 'left' },
                          { l: 'Dias', a: 'right' },
                          { l: 'Viagens/dia', a: 'right' },
                          { l: 't/viagem', a: 'right' },
                          { l: 'KM/dia', a: 'right' },
                          { l: 'Variação KM', a: 'right' },
                          { l: 'Tendência', a: 'left' },
                          { l: 'Evolução', a: 'left' },
                        ].map((c) => (
                          <th key={c.l} style={{
                            padding: '6px 8px', textAlign: c.a as 'left' | 'right',
                            fontSize: '0.61rem', fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: '0.02em',
                            borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
                            position: 'sticky', top: 0, zIndex: 1, whiteSpace: 'nowrap',
                          }}>
                            {c.l}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rotas.map((r) => {
                        const aberta = expandida === r.rota;
                        const tend = r.tendencia;
                        return (
                          <Fragment key={r.rota}>
                            <tr
                              onClick={() => setExpandida(aberta ? null : r.rota)}
                              style={{
                                borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                                background: aberta ? '#f8fafc' : undefined,
                              }}
                            >
                              <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0f172a' }}>
                                {r.rota}
                                {r.alertas.length > 0 && (
                                  <FiAlertTriangle
                                    size={11}
                                    color="#b45309"
                                    style={{ marginLeft: 5, verticalAlign: 'middle' }}
                                  />
                                )}
                                {r.tipoPredominante && (
                                  <span style={{
                                    marginLeft: 6, fontSize: '0.58rem', fontWeight: 700,
                                    color: '#4338ca', background: '#eef2ff',
                                    padding: '1px 5px', borderRadius: '4px',
                                  }}>
                                    {r.tipoPredominante}
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{r.diasComOperacao}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(r.medianaViagensDia, 1)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>
                                {fmt(r.medianaTonPorViagem, 2)}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmt(r.medianaKmDia, 0)}</td>
                              <td style={{
                                padding: '5px 8px', textAlign: 'right', fontWeight: 700,
                                color: r.instavelKm ? '#b45309' : '#64748b',
                              }}>
                                {r.cvKmDia != null ? `${fmt(r.cvKmDia, 0)}%` : '—'}
                              </td>
                              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                                {tend ? (
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: 3,
                                    color: ESTILO_TENDENCIA[tend.direcao].cor, fontWeight: 700,
                                  }}>
                                    <IconeTendencia direcao={tend.direcao} />
                                    {tend.direcao === 'estavel'
                                      ? ESTILO_TENDENCIA[tend.direcao].label
                                      : `${tend.variacaoPct > 0 ? '+' : ''}${fmt(tend.variacaoPct, 0)}%`}
                                  </span>
                                ) : (
                                  <span style={{ color: '#cbd5e1' }}>—</span>
                                )}
                              </td>
                              <td style={{ padding: '3px 8px' }}><Sparkline ficha={r} /></td>
                            </tr>
                            {aberta && (
                              <tr style={{ background: '#f8fafc' }}>
                                <td colSpan={8} style={{ padding: '0.6rem 0.8rem' }}>
                                  {r.alertas.length > 0 && (
                                    <ul style={{
                                      margin: '0 0 0.5rem', paddingLeft: '1.1rem',
                                      fontSize: '0.71rem', color: '#9a3412', lineHeight: 1.6,
                                    }}>
                                      {r.alertas.map((a, i) => <li key={i}>{a}</li>)}
                                    </ul>
                                  )}
                                  <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '0.35rem 1rem',
                                    fontSize: '0.7rem', color: '#334155', marginBottom: '0.5rem',
                                  }}>
                                    <span>Ciclo: <strong>{fmt(r.toneladas, 1)} t</strong> em {r.viagens} viagens</span>
                                    <span>KM total: <strong>{fmt(r.km, 0)}</strong></span>
                                    <span>Horas na rota: <strong>{fmt(r.horasProdutivas, 1)}</strong></span>
                                    {r.kmDiaMin != null && r.kmDiaMax != null && (
                                      <span>KM por dia: <strong>{fmt(r.kmDiaMin, 0)} a {fmt(r.kmDiaMax, 0)}</strong></span>
                                    )}
                                    {r.cvTonPorViagem != null && (
                                      <span>Variação da carga: <strong>{fmt(r.cvTonPorViagem, 0)}%</strong></span>
                                    )}
                                  </div>
                                  <div style={{ maxHeight: '180px', overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b' }}>
                                          <th style={{ textAlign: 'left', padding: '3px 6px' }}>Dia</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px' }}>Viagens</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px' }}>t</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px' }}>t/viagem</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px' }}>KM</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px' }}>h na rota</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {r.porDia.map((d) => (
                                          <tr key={d.data} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: '3px 6px' }}>
                                              {d.data.split('-').reverse().join('/')}
                                            </td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{d.viagens}</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt(d.toneladas, 1)}</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right', fontWeight: 700 }}>
                                              {fmt(d.tonPorViagem, 2)}
                                            </td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt(d.km, 0)}</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right' }}>{fmt(d.horasProdutivas, 1)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p style={{ margin: '0.45rem 0 0', fontSize: '0.66rem', color: '#94a3b8', lineHeight: 1.5 }}>
                Mediana = comportamento normal da rota (um dia atípico não distorce).
                Variação KM = quanto o KM diário se afasta dessa mediana; acima de 30% a rota
                não está se repetindo. Tendência compara a carga por viagem da primeira metade
                do ciclo com a da segunda. Clique na rota para ver dia a dia.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
