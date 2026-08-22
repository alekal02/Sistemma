/**
 * Onde a hora improdutiva foi gasta — deslocamento inicial, entre rotas
 * (descarga/aterro) e retorno à base — com ranking por placa, motorista e rota.
 */
import { useMemo, useState } from 'react';
import { FiClock } from 'react-icons/fi';
import type {
  MapeamentoOperacionalResponse,
  TrechosJornadaDimensao,
} from '../services/servicoService';
import {
  montarDistribuicaoImprodutiva,
  montarLeituraTrechos,
} from '../utils/trechosImprodutivos';

interface Props {
  dados: MapeamentoOperacionalResponse;
  /** Quantas linhas do ranking mostrar. */
  topN?: number;
}

type Dimensao = 'placa' | 'motorista' | 'rota';

const DIMENSOES: { id: Dimensao; label: string }[] = [
  { id: 'placa', label: 'Por placa' },
  { id: 'motorista', label: 'Por motorista' },
  { id: 'rota', label: 'Por rota' },
];

function fmt(n: number, casas = 1): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export default function TrechosImprodutivosPainel({ dados, topN = 10 }: Props) {
  const [dimensao, setDimensao] = useState<Dimensao>('placa');

  const fatias = useMemo(
    () => montarDistribuicaoImprodutiva(dados.resumo),
    [dados.resumo],
  );
  const leitura = useMemo(() => montarLeituraTrechos(dados.resumo), [dados.resumo]);

  const ranking: TrechosJornadaDimensao[] = useMemo(() => {
    const mapa: Record<Dimensao, TrechosJornadaDimensao[] | undefined> = {
      placa: dados.trechosPorPlaca,
      motorista: dados.trechosPorMotorista,
      rota: dados.trechosPorRota,
    };
    return (mapa[dimensao] || []).slice(0, topN);
  }, [dados, dimensao, topN]);

  if (!fatias.length) return null;

  const kmProdutivo = dados.resumo.kmProdutivo ?? 0;
  const kmImprodutivo = dados.resumo.kmImprodutivo ?? 0;
  const kmSomado = kmProdutivo + kmImprodutivo;
  const maiorImprodutiva = ranking.length
    ? Math.max(...ranking.map((r) => r.horasImprodutivas))
    : 0;

  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: '10px',
      padding: '0.7rem 0.8rem', marginBottom: '0.85rem', background: '#fff',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.15rem' }}>
        <FiClock size={14} color="#c2410c" />
        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>
          Onde a hora improdutiva foi gasta
        </div>
      </div>
      <div style={{ fontSize: '0.68rem', color: '#64748b', marginBottom: '0.7rem', lineHeight: 1.45 }}>
        Tempo fora da rota separado por trecho, a partir dos horários de base e de
        cada rota na planilha.
        {leitura.coberturaPct != null && leitura.coberturaPct < 100
          ? ` Horários suficientes em ${leitura.coberturaPct}% dos registros.`
          : ''}
      </div>

      {leitura.texto && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px',
          padding: '0.5rem 0.65rem', marginBottom: '0.7rem',
          fontSize: '0.73rem', color: '#9a3412', lineHeight: 1.5,
        }}>
          {leitura.texto}
        </div>
      )}

      <div style={{
        display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden',
        border: '1px solid #e2e8f0', marginBottom: '0.5rem',
      }}>
        {fatias.map((f) => (
          <div
            key={f.id}
            title={`${f.label}: ${fmt(f.horas)} h (${fmt(f.pct, 0)}%)`}
            style={{
              width: `${Math.max(f.pct, 2)}%`, background: f.cor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '0.6rem', fontWeight: 800,
            }}
          >
            {f.pct >= 12 ? `${fmt(f.pct, 0)}%` : ''}
          </div>
        ))}
      </div>

      <div style={{
        display: 'grid', gap: '0.4rem', marginBottom: '0.85rem',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
      }}>
        {fatias.map((f) => (
          <div key={f.id} style={{
            border: '1px solid #e2e8f0', borderRadius: '8px',
            padding: '0.45rem 0.6rem', borderLeft: `4px solid ${f.cor}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.4rem' }}>
              <span style={{ fontSize: '0.71rem', fontWeight: 800, color: '#0f172a' }}>{f.label}</span>
              <span style={{
                fontSize: '0.8rem', fontWeight: 800, color: f.cor,
                fontFamily: 'ui-monospace, monospace',
              }}>
                {fmt(f.horas)} h
              </span>
            </div>
            <div style={{ fontSize: '0.63rem', color: '#64748b', marginTop: '0.15rem', lineHeight: 1.4 }}>
              {f.descricao}
              {f.km > 0 ? ` · ${fmt(f.km, 0)} km` : ''}
            </div>
          </div>
        ))}
      </div>

      {kmSomado > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.6rem 1.1rem',
          background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
          padding: '0.5rem 0.7rem', marginBottom: '0.85rem', fontSize: '0.72rem',
        }}>
          <span style={{ color: '#334155' }}>
            KM dentro das rotas:{' '}
            <strong style={{ color: '#0f766e' }}>{fmt(kmProdutivo, 0)} km</strong>
          </span>
          <span style={{ color: '#334155' }}>
            KM fora das rotas:{' '}
            <strong style={{ color: '#c2410c' }}>{fmt(kmImprodutivo, 0)} km</strong>
            {leitura.pctKmImprodutivo != null ? ` (${fmt(leitura.pctKmImprodutivo, 0)}%)` : ''}
          </span>
        </div>
      )}

      {ranking.length > 0 && (
        <>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '0.35rem',
            alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem',
          }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>
              Quem mais perde tempo fora da rota
            </div>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              {DIMENSOES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setDimensao(d.id)}
                  style={{
                    border: `1px solid ${dimensao === d.id ? '#0f766e' : '#cbd5e1'}`,
                    background: dimensao === d.id ? '#ccfbf1' : '#fff',
                    color: dimensao === d.id ? '#0f766e' : '#475569',
                    borderRadius: '6px', padding: '0.25rem 0.55rem',
                    fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.71rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { label: DIMENSOES.find((d) => d.id === dimensao)?.label.replace('Por ', '') || '', align: 'left' },
                    { label: 'Improdutivas', align: 'right' },
                    { label: 'Composição', align: 'left' },
                    { label: 'h improd/viagem', align: 'right' },
                    { label: 'KM fora', align: 'right' },
                    { label: '% prod', align: 'right' },
                  ].map((c) => (
                    <th key={c.label} style={{
                      padding: '6px 8px', textAlign: c.align as 'left' | 'right',
                      fontSize: '0.61rem', fontWeight: 700, color: '#64748b',
                      textTransform: 'uppercase', letterSpacing: '0.02em',
                      borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap',
                    }}>
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ranking.map((r) => {
                  const partes = [
                    { horas: r.horasDeslocamentoInicial, cor: '#0369a1' },
                    { horas: r.horasEntreRotas, cor: '#c2410c' },
                    { horas: r.horasRetornoFinal, cor: '#7c3aed' },
                    { horas: r.horasImprodutivasNaoDetalhadas, cor: '#cbd5e1' },
                  ].filter((p) => p.horas > 0);
                  const larguraTotal = maiorImprodutiva > 0
                    ? (r.horasImprodutivas / maiorImprodutiva) * 100
                    : 0;
                  return (
                    <tr key={r.chave} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{
                        padding: '5px 8px', fontWeight: 700, color: '#0f172a',
                        fontFamily: dimensao === 'placa' ? 'ui-monospace, monospace' : undefined,
                      }}>
                        {r.chave}
                      </td>
                      <td style={{
                        padding: '5px 8px', textAlign: 'right', fontWeight: 800, color: '#c2410c',
                        fontFamily: 'ui-monospace, monospace',
                      }}>
                        {fmt(r.horasImprodutivas)} h
                      </td>
                      <td style={{ padding: '5px 8px', minWidth: '120px' }}>
                        <div style={{
                          display: 'flex', height: 9, borderRadius: 5, overflow: 'hidden',
                          width: `${Math.max(larguraTotal, 6)}%`, minWidth: '24px',
                        }}>
                          {partes.map((p, i) => (
                            <div
                              key={i}
                              style={{
                                flex: p.horas,
                                background: p.cor,
                              }}
                            />
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>
                        {r.horasImprodutivasPorViagem != null ? fmt(r.horasImprodutivasPorViagem, 2) : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#334155' }}>
                        {fmt(r.kmImprodutivo, 0)}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: '#0f766e', fontWeight: 700 }}>
                        {fmt(r.percentualProdutivo, 0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ margin: '0.4rem 0 0', fontSize: '0.66rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Barra colorida = composição do tempo fora da rota (azul: deslocamento inicial,
            laranja: entre rotas, roxo: retorno, cinza: sem horário). Largura proporcional
            ao maior improdutivo do período.
          </p>
        </>
      )}
    </div>
  );
}
