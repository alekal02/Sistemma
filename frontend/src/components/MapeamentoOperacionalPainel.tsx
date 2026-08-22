/**
 * Mapeamento operacional do ciclo: rota × motorista × placa (tempo e km).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiChevronDown, FiChevronUp, FiDownload, FiMap, FiSearch } from 'react-icons/fi';
import {
  COR_STATUS_RANKING,
  LABEL_STATUS_RANKING,
  statusPorPctIdeal,
} from '../utils/rankingViagensTipo';
import servicoService, {
  type LinhaMapeamentoOperacional,
  type MapeamentoOperacionalResponse,
  type ViagemPesoRotaItem,
} from '../services/servicoService';
import TrechosImprodutivosPainel from './TrechosImprodutivosPainel';

interface Props {
  contractId: string;
  servicoId: string;
  dataInicio: string | null;
  dataFim: string | null;
}

type ColunaOrdenacao =
  | 'rota'
  | 'motorista'
  | 'placa'
  | 'dias'
  | 'viagens'
  | 'kmTotal'
  | 'horasTotais'
  | 'horasProdutivas'
  | 'horasImprodutivas'
  | 'horasPorViagem'
  | 'horasProdutivasPorViagem'
  | 'kmPorViagem'
  | 'percentualProdutivo';

function fmtNum(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '');
  if (/[;"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function viagemTemPesagem(v: ViagemPesoRotaItem): boolean {
  return !v.semPesagem && Number(v.pesoKg) > 0;
}

function corBarraViagem(v: ViagemPesoRotaItem): string {
  if (!viagemTemPesagem(v)) return '#94a3b8';
  const st = statusPorPctIdeal(v.pctIdeal);
  if (st) return COR_STATUS_RANKING[st];
  if (v.encheu) return '#0f766e';
  if ((v.pctIdeal ?? 0) >= 80) return '#d97706';
  return '#dc2626';
}

const BADGE_ST: Record<string, { color: string; background: string }> = {
  pessimo: { color: '#7f1d1d', background: '#fecaca' },
  ruim: { color: '#9a3412', background: '#ffedd5' },
  otimo: { color: '#166534', background: '#dcfce7' },
};

function agruparViagensPeso(itens: ViagemPesoRotaItem[]) {
  const mapa = new Map<string, {
    chave: string;
    rota: string;
    placa: string;
    motorista: string;
    tipo: string | null;
    origemHora: 'trecho' | 'rateio';
    viagens: ViagemPesoRotaItem[];
  }>();
  for (const it of itens) {
    const chave = `${it.data || ''}\0${it.rota}\0${it.placa}\0${it.motorista}`;
    let g = mapa.get(chave);
    if (!g) {
      g = {
        chave, rota: it.rota, placa: it.placa, motorista: it.motorista,
        tipo: it.tipo, origemHora: it.origemHora, viagens: [],
      };
      mapa.set(chave, g);
    }
    g.viagens.push(it);
  }
  return Array.from(mapa.values()).map((g) => {
    g.viagens.sort((a, b) => a.nViagem - b.nViagem);
    const horas = g.viagens.reduce((s, v) => s + (v.horasProdutivasViagem || 0), 0);
    return { ...g, horasProdutivasRota: Math.round(horas * 100) / 100 };
  }).sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR') || a.placa.localeCompare(b.placa, 'pt-BR'));
}

function Chip({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '0.45rem 0.65rem',
      minWidth: '88px',
      textAlign: 'center',
      borderTop: cor ? `3px solid ${cor}` : undefined,
    }}>
      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', marginTop: '0.15rem' }}>
        {label}
      </div>
    </div>
  );
}

export default function MapeamentoOperacionalPainel({
  contractId,
  servicoId,
  dataInicio,
  dataFim,
}: Props) {
  const [aberto, setAberto] = useState(true);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [dados, setDados] = useState<MapeamentoOperacionalResponse | null>(null);
  const [busca, setBusca] = useState('');
  const [ordCol, setOrdCol] = useState<ColunaOrdenacao>('horasProdutivas');
  const [ordAsc, setOrdAsc] = useState(false);

  const carregar = useCallback(async () => {
    if (!contractId || !servicoId || !dataInicio || !dataFim) {
      setDados(null);
      return;
    }
    setCarregando(true);
    setErro(null);
    try {
      const resp = await servicoService.getMapeamentoOperacional(contractId, servicoId, {
        dataInicio,
        dataFim,
      });
      setDados(resp);
    } catch (e: unknown) {
      const msg = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      setErro(msg || 'Não foi possível carregar o mapeamento operacional.');
      setDados(null);
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, dataInicio, dataFim]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhasFiltradas = useMemo(() => {
    if (!dados?.linhas) return [];
    const q = busca.trim().toLowerCase();
    let lista = dados.linhas;
    if (q) {
      lista = lista.filter((l) =>
        l.rota.toLowerCase().includes(q)
        || l.motorista.toLowerCase().includes(q)
        || l.placa.toLowerCase().includes(q)
        || (l.tipoCaminhao || '').toLowerCase().includes(q));
    }
    const dir = ordAsc ? 1 : -1;
    return [...lista].sort((a, b) => {
      const va = a[ordCol];
      const vb = b[ordCol];
      if (typeof va === 'string' && typeof vb === 'string') {
        return va.localeCompare(vb, 'pt-BR') * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [dados, busca, ordCol, ordAsc]);

  const gruposViagem = useMemo(() => {
    const itens = dados?.viagensPesoRota || [];
    if (!itens.length) return [];
    const q = busca.trim().toLowerCase();
    const filtrados = q
      ? itens.filter((v) =>
        v.rota.toLowerCase().includes(q)
        || v.placa.toLowerCase().includes(q)
        || v.motorista.toLowerCase().includes(q)
        || (v.tipo || '').toLowerCase().includes(q))
      : itens;
    return agruparViagensPeso(filtrados);
  }, [dados, busca]);

  const toggleOrd = (col: ColunaOrdenacao) => {
    if (ordCol === col) setOrdAsc((v) => !v);
    else {
      setOrdCol(col);
      setOrdAsc(col === 'rota' || col === 'motorista' || col === 'placa');
    }
  };

  const exportarCsv = () => {
    if (!linhasFiltradas.length) return;
    const header = [
      'Rota', 'Motorista', 'Placa', 'Tipo', 'Dias', 'Viagens',
      'KM', 'Horas totais', 'Horas produtivas', 'Horas improdutivas',
      '% produtivo', 'h tot/viagem', 'h prod/viagem', 'km/viagem', 't', 't/h prod',
      'h deslocamento inicial', 'h entre rotas', 'h retorno', 'h sem horário',
      'KM nas rotas', 'KM fora das rotas',
    ];
    const rows = linhasFiltradas.map((l: LinhaMapeamentoOperacional) => [
      l.rota, l.motorista, l.placa, l.tipoCaminhao || '',
      l.dias, l.viagens, l.kmTotal,
      l.horasTotais ?? l.horasProdutivas,
      l.horasProdutivas,
      l.horasImprodutivas ?? 0,
      l.percentualProdutivo ?? 0,
      l.horasPorViagem,
      l.horasProdutivasPorViagem ?? 0,
      l.kmPorViagem, l.tonelagem, l.tonPorHora,
      l.horasDeslocamentoInicial ?? 0,
      l.horasEntreRotas ?? 0,
      l.horasRetornoFinal ?? 0,
      l.horasImprodutivasNaoDetalhadas ?? 0,
      l.kmProdutivo ?? 0,
      l.kmImprodutivo ?? 0,
    ].map(csvEscape).join(';'));
    const blob = new Blob([[header.join(';'), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mapeamento-operacional_${dataInicio}_${dataFim}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const th = (col: ColunaOrdenacao, label: string, align: 'left' | 'right' = 'left') => (
    <th
      onClick={() => toggleOrd(col)}
      style={{
        padding: '6px 8px',
        textAlign: align,
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        color: ordCol === col ? '#0f172a' : '#64748b',
        fontWeight: 700,
        fontSize: '0.62rem',
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}
    >
      {label}{ordCol === col ? (ordAsc ? ' ↑' : ' ↓') : ''}
    </th>
  );

  return (
    <section style={{
      marginTop: '1rem',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: '#f8fafc',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <FiMap size={16} color="#0f766e" />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0f172a' }}>
              Mapeamento operacional
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.1rem' }}>
              Rotas × motoristas × caminhões — tempo produtivo (na rota) vs improdutivo (fora)
              {dataInicio && dataFim ? ` · ${dataInicio} → ${dataFim}` : ''}
            </div>
          </div>
        </div>
        {aberto ? <FiChevronUp size={18} color="#64748b" /> : <FiChevronDown size={18} color="#64748b" />}
      </button>

      {aberto && (
        <div style={{ padding: '0.85rem 1rem 1rem' }}>
          {!dataInicio || !dataFim ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              Selecione um ciclo para ver o mapeamento.
            </p>
          ) : carregando ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Carregando mapeamento…</p>
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
                  marginLeft: '0.5rem', background: 'none', border: 'none',
                  color: '#b91c1c', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline',
                }}
              >
                Tentar de novo
              </button>
            </div>
          ) : !dados || dados.linhas.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
              Sem viagens válidas neste período para montar o mapeamento.
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginBottom: '0.85rem' }}>
                <Chip label="Rotas" valor={String(dados.resumo.rotas)} />
                <Chip label="Motoristas" valor={String(dados.resumo.motoristas)} />
                <Chip label="Placas" valor={String(dados.resumo.placas)} />
                <Chip label="Viagens" valor={dados.resumo.viagens.toLocaleString('pt-BR')} />
                <Chip label="KM" valor={fmtNum(dados.resumo.kmTotal, 0)} />
                <Chip label="Horas totais" valor={fmtNum(dados.resumo.horasTotais ?? dados.resumo.horasProdutivas, 1)} cor="#64748b" />
                <Chip label="Produtivas" valor={fmtNum(dados.resumo.horasProdutivas, 1)} cor="#0f766e" />
                <Chip label="Improdutivas" valor={fmtNum(dados.resumo.horasImprodutivas ?? 0, 1)} cor="#c2410c" />
                <Chip
                  label="% Produtivo"
                  valor={`${fmtNum(dados.resumo.percentualProdutivo ?? 0, 0)}%`}
                  cor="#0369a1"
                />
              </div>

              <TrechosImprodutivosPainel dados={dados} />

              {dados.resumo.truncado && (
                <div style={{
                  background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px',
                  padding: '0.45rem 0.65rem', marginBottom: '0.75rem',
                  fontSize: '0.72rem', color: '#9a3412',
                }}>
                  Exibindo as {dados.resumo.linhas.toLocaleString('pt-BR')} combinações com mais horas (limite do relatório).
                </div>
              )}

              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
                alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.55rem',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: '8px', padding: '0.35rem 0.55rem', flex: '1 1 220px', maxWidth: '360px',
                }}>
                  <FiSearch size={14} color="#94a3b8" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar rota, motorista ou placa…"
                    style={{
                      border: 'none', outline: 'none', background: 'transparent',
                      width: '100%', fontSize: '0.78rem', color: '#0f172a',
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={exportarCsv}
                  disabled={!linhasFiltradas.length}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    border: '1px solid #cbd5e1', background: '#fff',
                    borderRadius: '8px', padding: '0.4rem 0.7rem',
                    fontSize: '0.72rem', fontWeight: 700, color: '#334155',
                    cursor: linhasFiltradas.length ? 'pointer' : 'not-allowed',
                    opacity: linhasFiltradas.length ? 1 : 0.5,
                  }}
                >
                  <FiDownload size={13} /> Exportar CSV
                </button>
              </div>

              {gruposViagem.length > 0 && (
                <div style={{
                  border: '1px solid #e2e8f0', borderRadius: '10px',
                  padding: '0.7rem 0.8rem', marginBottom: '0.85rem',
                }}>
                  <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.15rem' }}>
                    Viagens do dia — qualidade, peso e hora produtiva
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.65rem', lineHeight: 1.45 }}>
                    Cada faixa é uma viagem com dado real (peso ou horário da ROTA N).
                    Hora produtiva = saída − chegada daquele trecho, não a rota inteira.
                    “Sem pesagem” só aparece se o trecho existe e o peso falta.
                  </div>
                  <div style={{ display: 'grid', gap: '0.65rem', maxHeight: '520px', overflow: 'auto' }}>
                    {gruposViagem.map((g) => (
                      <div key={g.chave} style={{
                        border: '1px solid #e2e8f0', borderRadius: '10px',
                        padding: '0.55rem 0.65rem', background: '#fff',
                      }}>
                        <div style={{
                          display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.7rem',
                          alignItems: 'baseline', marginBottom: '0.45rem',
                        }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a' }}>{g.rota}</span>
                          <span style={{ fontSize: '0.72rem', fontFamily: 'ui-monospace, monospace', color: '#334155' }}>{g.placa}</span>
                          {g.tipo && (
                            <span style={{
                              fontSize: '0.62rem', fontWeight: 700, color: '#4338ca',
                              background: '#eef2ff', padding: '1px 6px', borderRadius: '4px',
                            }}>{g.tipo}</span>
                          )}
                          <span style={{
                            fontSize: '0.72rem', fontWeight: 800, color: '#0f766e',
                            background: '#ccfbf1', padding: '1px 7px', borderRadius: '5px',
                            fontFamily: 'ui-monospace, monospace',
                          }}>
                            {fmtNum(g.horasProdutivasRota, 1)} h na rota
                          </span>
                          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                            {g.viagens.length} viagem{g.viagens.length !== 1 ? 'ns' : ''}
                            {g.origemHora === 'rateio' ? ' · hora rateada' : ' · hora do trecho'}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gap: '0.4rem' }}>
                          {g.viagens.map((v) => {
                            const pctBar = v.pctIdeal != null ? Math.min(100, Math.max(4, v.pctIdeal)) : 4;
                            const cor = corBarraViagem(v);
                            const st = statusPorPctIdeal(v.pctIdeal);
                            const stStyle = st ? BADGE_ST[st] : null;
                            return (
                              <div key={`${g.chave}-${v.nViagem}`} style={{
                                background: '#f8fafc', border: '1px solid #e2e8f0',
                                borderRadius: '8px', padding: '0.45rem 0.55rem',
                                borderLeft: `4px solid ${cor}`,
                              }}>
                                <div style={{
                                  display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between',
                                  alignItems: 'center', gap: '0.35rem', marginBottom: '0.3rem',
                                }}>
                                  <strong style={{ fontSize: '0.75rem', color: '#0f172a' }}>
                                    Viagem {v.nViagem}
                                    {viagemTemPesagem(v) && st && stStyle && (
                                      <span style={{
                                        marginLeft: 6, fontSize: '0.62rem', fontWeight: 800,
                                        padding: '2px 7px', borderRadius: '6px',
                                        color: stStyle.color, background: stStyle.background,
                                      }}>
                                        {LABEL_STATUS_RANKING[st]}
                                      </span>
                                    )}
                                  </strong>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                    <span style={{
                                      fontSize: '0.78rem', fontWeight: 800, color: '#0f766e',
                                      background: '#ccfbf1', padding: '2px 8px', borderRadius: '6px',
                                      fontFamily: 'ui-monospace, monospace',
                                    }}>
                                      {fmtNum(v.horasProdutivasViagem, 1)} h produtivas
                                    </span>
                                    {!viagemTemPesagem(v) ? (
                                      <span style={{
                                        fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: '6px',
                                        color: '#334155', background: '#e2e8f0',
                                      }}>
                                        Sem pesagem
                                      </span>
                                    ) : v.pesoIdealKg != null && (
                                      <span style={{
                                        fontSize: '0.65rem', fontWeight: 800, padding: '2px 7px', borderRadius: '6px',
                                        color: v.encheu ? '#065f46' : '#9a3412',
                                        background: v.encheu ? '#d1fae5' : '#ffedd5',
                                      }}>
                                        {v.encheu ? 'Já encheu' : 'Não encheu'}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  <div style={{
                                    flex: 1, height: 10, background: '#e2e8f0',
                                    borderRadius: 6, overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      width: `${pctBar}%`, height: '100%',
                                      background: cor, borderRadius: 6,
                                    }} />
                                  </div>
                                  <span style={{
                                    fontSize: '0.75rem', fontWeight: 800, color: cor,
                                    fontFamily: 'ui-monospace, monospace', minWidth: '42px', textAlign: 'right',
                                  }}>
                                    {v.pctIdeal != null ? `${fmtNum(v.pctIdeal, 0)}%` : '—'}
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem' }}>
                                  {!viagemTemPesagem(v)
                                    ? 'Sem pesagem — hora desta viagem (trecho), não da rota completa'
                                    : (
                                      <>
                                        {fmtNum(v.pesoKg, 0)} kg
                                        {v.pesoIdealKg != null ? ` / ${fmtNum(v.pesoIdealKg, 0)} kg ideal` : ''}
                                        {!v.encheu && v.pesoIdealKg != null
                                          ? ` · falta ${fmtNum(Math.max(0, v.pesoIdealKg - v.pesoKg), 0)} kg`
                                          : ''}
                                        {v.tempoEqEncher != null
                                          ? ` · estimativa para encher: ${fmtNum(v.tempoEqEncher, 2)} h`
                                          : ''}
                                      </>
                                    )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                maxHeight: '420px', overflow: 'auto',
                border: '1px solid #e2e8f0', borderRadius: '8px',
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                  <thead>
                    <tr>
                      {th('rota', 'Rota')}
                      {th('motorista', 'Motorista')}
                      {th('placa', 'Placa')}
                      <th style={{
                        padding: '6px 8px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700,
                        color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0',
                        background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1,
                      }}>Tipo</th>
                      {th('dias', 'Dias', 'right')}
                      {th('viagens', 'Viagens', 'right')}
                      {th('kmTotal', 'KM', 'right')}
                      {th('horasTotais', 'Totais', 'right')}
                      {th('horasProdutivas', 'Produtivas', 'right')}
                      {th('horasImprodutivas', 'Improdutivas', 'right')}
                      {th('percentualProdutivo', '% Prod', 'right')}
                      {th('horasProdutivasPorViagem', 'h prod/viagem', 'right')}
                      {th('kmPorViagem', 'km/viagem', 'right')}
                    </tr>
                  </thead>
                  <tbody>
                    {linhasFiltradas.map((l) => (
                      <tr key={`${l.rota}|${l.motorista}|${l.placa}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '5px 8px', fontWeight: 600, color: '#0f172a' }}>{l.rota}</td>
                        <td style={{ padding: '5px 8px', color: '#334155' }}>{l.motorista}</td>
                        <td style={{ padding: '5px 8px', fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{l.placa}</td>
                        <td style={{ padding: '5px 8px', color: '#64748b' }}>{l.tipoCaminhao || '—'}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{l.dias}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{l.viagens}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(l.kmTotal, 0)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(l.horasTotais ?? l.horasProdutivas, 1)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#0f766e', fontWeight: 700 }}>{fmtNum(l.horasProdutivas, 1)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: '#c2410c', fontWeight: 700 }}>{fmtNum(l.horasImprodutivas ?? 0, 1)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(l.percentualProdutivo ?? 0, 0)}%</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>{fmtNum(l.horasProdutivasPorViagem ?? l.horasPorViagem, 2)}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right' }}>{fmtNum(l.kmPorViagem, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '0.45rem 0 0', fontSize: '0.68rem', color: '#94a3b8' }}>
                {linhasFiltradas.length.toLocaleString('pt-BR')} combinação(ões)
                {busca.trim() ? ' filtrada(s)' : ''}
                {' · '}produtivo = Σ (saída rota − chegada rota)
                {' · '}total = chegada base − saída base
                {' · '}improdutivo = total − produtivo
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
