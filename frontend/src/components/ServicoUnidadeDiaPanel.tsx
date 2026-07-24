/**
 * Dashboard do dia para serviços medidos por unidade (capina, varrição, poda, pintura).
 * Fonte: totais da API + registros da planilha (não usa fluxo de viagens/toneladas).
 */
import type { CSSProperties } from 'react';
import { FiMapPin, FiTrendingUp, FiList, FiUsers, FiLayers } from 'react-icons/fi';
import {
  formatarMetricaUnidade,
  metricaPrincipalDoDia,
  unidadeOperacionalDoTipo,
} from '../utils/unidadeServico';

type AgregacaoDia = {
  areaM2?: number;
  metroLinear?: number;
  kmLinear?: number;
  qtdArvore?: number;
  quantitativo?: number;
  rotas?: number;
};

type Props = {
  dataIso: string;
  tipoServico: string;
  registros: Record<string, unknown>[];
  totalRegistros: number;
  /** Totais do dia vindos da API (não dependem da página de registros). */
  agregacaoDia?: AgregacaoDia | null;
  carregandoRegistros?: boolean;
  mostrarRegistros?: boolean;
  onToggleRegistros?: () => void;
  kpisOperacao?: Array<{
    id?: string;
    nome: string;
    label?: string;
    valor: number | string | null;
    unidade?: string;
    formato?: string;
  }>;
  loadingKpis?: boolean;
};

function numDeRegistro(r: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (!isNaN(n) && n > 0) return n;
  }
  return 0;
}

function textoDeRegistro(r: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = r[k];
    if (v == null || v === '') continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return '';
}

function agruparSoma(
  registros: Record<string, unknown>[],
  chaveKeys: string[],
  valorFn: (r: Record<string, unknown>) => number,
): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const r of registros) {
    const chave = textoDeRegistro(r, chaveKeys) || '—';
    map.set(chave, (map.get(chave) || 0) + valorFn(r));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export default function ServicoUnidadeDiaPanel({
  tipoServico,
  registros,
  totalRegistros,
  agregacaoDia,
  carregandoRegistros,
  mostrarRegistros,
  onToggleRegistros,
  kpisOperacao = [],
  loadingKpis,
}: Props) {
  const unidade = unidadeOperacionalDoTipo(tipoServico);
  const ehCapina = tipoServico === 'capina';
  const ehVarricao = tipoServico === 'varricao';
  const ehPoda = tipoServico === 'poda';

  const agregLocal = registros.reduce(
    (acc, r) => {
      acc.areaM2 += numDeRegistro(r, ['Area m²', 'AREA_M2', 'AREA_ROCADA']);
      acc.metroLinear += numDeRegistro(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']);
      acc.kmLinear += numDeRegistro(r, ['KM Linear', 'KM_LINEAR', 'QUILOMETROS_VARRIDOS', 'kmTotal']);
      acc.qtdArvore += numDeRegistro(r, ['Quantidade de Arvore', 'QTD_ARVORE', 'ARVORES_PODADAS']);
      acc.quantitativo += numDeRegistro(r, ['QUANTITATIVO']);
      return acc;
    },
    { areaM2: 0, metroLinear: 0, kmLinear: 0, qtdArvore: 0, quantitativo: 0, rotas: registros.length },
  );

  const agreg = {
    areaM2: Number(agregacaoDia?.areaM2 || 0) || agregLocal.areaM2,
    metroLinear: Number(agregacaoDia?.metroLinear || 0) || agregLocal.metroLinear,
    kmLinear: Number(agregacaoDia?.kmLinear || 0) || agregLocal.kmLinear,
    qtdArvore: Number(agregacaoDia?.qtdArvore || 0) || agregLocal.qtdArvore,
    quantitativo: Number(agregacaoDia?.quantitativo || 0) || agregLocal.quantitativo,
    rotas: Number(agregacaoDia?.rotas || 0) || totalRegistros || registros.length,
  };

  const metrica = metricaPrincipalDoDia(tipoServico, agreg);
  const qtdRegistros = totalRegistros || agreg.rotas || registros.length;

  const valorLinha = (r: Record<string, unknown>) => metricaPrincipalDoDia(tipoServico, {
    areaM2: numDeRegistro(r, ['Area m²', 'AREA_M2']),
    metroLinear: numDeRegistro(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']),
    kmLinear: numDeRegistro(r, ['KM Linear', 'KM_LINEAR', 'QUILOMETROS_VARRIDOS']),
    qtdArvore: numDeRegistro(r, ['Quantidade de Arvore', 'QTD_ARVORE']),
    quantitativo: numDeRegistro(r, ['QUANTITATIVO']),
  }).valor;

  const topBairros = agruparSoma(
    registros,
    ['BAIRRO', 'bairro', 'Setor', 'SETOR', 'regional'],
    valorLinha,
  ).slice(0, 8);

  const topEquipes = agruparSoma(
    registros,
    ['Equipe', 'EQUIPE', 'turno'],
    valorLinha,
  ).filter(([k]) => k !== '—').slice(0, 6);

  const topOperadores = agruparSoma(
    registros,
    ['Operador', 'OPERADOR', 'Funcionario', 'FUNCIONARIO', 'motorista'],
    valorLinha,
  ).filter(([k]) => k !== '—').slice(0, 6);

  const equipesAtivas = new Set(
    registros.map((r) => textoDeRegistro(r, ['Equipe', 'EQUIPE', 'turno'])).filter(Boolean),
  ).size;
  const operadoresAtivos = new Set(
    registros.map((r) => textoDeRegistro(r, ['Operador', 'OPERADOR', 'Funcionario', 'FUNCIONARIO'])).filter(Boolean),
  ).size;

  const tituloMetrica = ehCapina
    ? 'Capina do dia'
    : ehVarricao
      ? 'Varrição do dia'
      : ehPoda
        ? 'Poda do dia'
        : `${unidade.labelMetrica} do dia`;

  return (
    <div>
      <p style={{
        margin: '0 0 0.85rem', fontSize: '0.78rem', color: '#64748b', fontWeight: 600,
      }}>
        {tituloMetrica} · dados da planilha
      </p>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem',
      }}>
        <div style={cardStyle}>
          <div style={labelStyle}><FiList size={12} /> Registros</div>
          <div style={valorStyle}>{qtdRegistros.toLocaleString('pt-BR')}</div>
        </div>

        <div style={{ ...cardStyle, borderColor: '#86efac', background: '#f0fdf4' }}>
          <div style={{ ...labelStyle, color: '#166534' }}>
            <FiTrendingUp size={12} /> {metrica.label}
          </div>
          <div style={{ ...valorStyle, color: '#14532d' }}>
            {formatarMetricaUnidade(metrica.valor, metrica.sufixo || unidade.sufixo)}
          </div>
        </div>

        {ehCapina && agreg.metroLinear > 0 && metrica.sufixo !== 'm' && (
          <div style={cardStyle}>
            <div style={labelStyle}>Metro linear</div>
            <div style={valorStyle}>{formatarMetricaUnidade(agreg.metroLinear, 'm')}</div>
          </div>
        )}

        {ehCapina && agreg.kmLinear > 0 && metrica.sufixo !== 'km' && (
          <div style={cardStyle}>
            <div style={labelStyle}>Extensão</div>
            <div style={valorStyle}>{formatarMetricaUnidade(agreg.kmLinear, 'km')}</div>
          </div>
        )}

        {agreg.quantitativo > 0 && (
          <div style={cardStyle}>
            <div style={labelStyle}>Quantitativo (planilha)</div>
            <div style={valorStyle}>
              {agreg.quantitativo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
            </div>
          </div>
        )}

        {(equipesAtivas > 0 || Number(kpisOperacao.find((k) => /equipe/i.test(k.nome || k.label || ''))?.valor || 0) > 0) && (
          <div style={cardStyle}>
            <div style={labelStyle}><FiLayers size={12} /> Equipes</div>
            <div style={valorStyle}>
              {(equipesAtivas || Number(kpisOperacao.find((k) => /equipe/i.test(k.nome || k.label || ''))?.valor || 0)).toLocaleString('pt-BR')}
            </div>
          </div>
        )}

        {operadoresAtivos > 0 && (
          <div style={cardStyle}>
            <div style={labelStyle}><FiUsers size={12} /> Operadores</div>
            <div style={valorStyle}>{operadoresAtivos.toLocaleString('pt-BR')}</div>
          </div>
        )}
      </div>

      {loadingKpis ? (
        <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Carregando KPIs...</p>
      ) : kpisOperacao.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '0.5rem', marginBottom: '1rem',
        }}>
          {kpisOperacao.slice(0, 10).map((k) => (
            <div key={k.id || k.nome} style={cardStyle}>
              <div style={labelStyle}>{k.label || k.nome}</div>
              <div style={{ ...valorStyle, fontSize: '1rem' }}>
                {k.valor == null || k.valor === ''
                  ? '—'
                  : `${Number(k.valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${k.unidade ? ` ${k.unidade}` : ''}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '0.75rem',
        marginBottom: '1rem',
      }}>
        {topBairros.length > 0 && (
          <RankingCard
            titulo="Por bairro"
            icone={<FiMapPin size={14} />}
            itens={topBairros}
            sufixo={metrica.sufixo || unidade.sufixo}
          />
        )}
        {topEquipes.length > 0 && (
          <RankingCard
            titulo="Por equipe"
            icone={<FiLayers size={14} />}
            itens={topEquipes}
            sufixo={metrica.sufixo || unidade.sufixo}
          />
        )}
        {topOperadores.length > 0 && (
          <RankingCard
            titulo="Por operador"
            icone={<FiUsers size={14} />}
            itens={topOperadores}
            sufixo={metrica.sufixo || unidade.sufixo}
          />
        )}
      </div>

      {onToggleRegistros && (
        <button
          type="button"
          onClick={onToggleRegistros}
          style={{
            fontSize: '0.75rem', fontWeight: 600, padding: '0.4rem 0.75rem',
            borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff',
            color: '#334155', cursor: 'pointer', marginBottom: '0.75rem',
          }}
        >
          {mostrarRegistros ? 'Ocultar registros' : `Ver registros (${qtdRegistros.toLocaleString('pt-BR')})`}
        </button>
      )}

      {mostrarRegistros && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
          overflow: 'auto', maxHeight: 420,
        }}>
          {carregandoRegistros ? (
            <p style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>Carregando...</p>
          ) : registros.length === 0 ? (
            <p style={{ padding: '0.75rem', fontSize: '0.75rem', color: '#64748b' }}>
              Nenhum registro carregado para este dia.
            </p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                  <th style={th}>Logradouro</th>
                  <th style={th}>Bairro</th>
                  <th style={th}>UND</th>
                  <th style={{ ...th, textAlign: 'right' }}>Quantitativo</th>
                  <th style={{ ...th, textAlign: 'right' }}>{metrica.label}</th>
                  <th style={th}>Equipe</th>
                  <th style={th}>Operador</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => {
                  const m = metricaPrincipalDoDia(tipoServico, {
                    areaM2: numDeRegistro(r, ['Area m²', 'AREA_M2']),
                    metroLinear: numDeRegistro(r, ['Metro Linear', 'METRO_LINEAR', 'COMPRIMENTO']),
                    kmLinear: numDeRegistro(r, ['KM Linear', 'KM_LINEAR']),
                    qtdArvore: numDeRegistro(r, ['Quantidade de Arvore', 'QTD_ARVORE']),
                    quantitativo: numDeRegistro(r, ['QUANTITATIVO']),
                  });
                  const q = numDeRegistro(r, ['QUANTITATIVO']);
                  return (
                    <tr key={String(r.id ?? i)} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={td}>{textoDeRegistro(r, ['LOGRADOURO', 'logradouro', 'distrito', 'Avenida / Rua']) || '—'}</td>
                      <td style={td}>{textoDeRegistro(r, ['BAIRRO', 'bairro', 'Setor', 'regional']) || '—'}</td>
                      <td style={td}>{textoDeRegistro(r, ['UND', '_undNormalizada']) || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        {q > 0 ? q.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {formatarMetricaUnidade(m.valor, m.sufixo || unidade.sufixo)}
                      </td>
                      <td style={td}>{textoDeRegistro(r, ['Equipe', 'EQUIPE', 'turno']) || '—'}</td>
                      <td style={td}>{textoDeRegistro(r, ['Operador', 'OPERADOR', 'Funcionario']) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function RankingCard({
  titulo,
  icone,
  itens,
  sufixo,
}: {
  titulo: string;
  icone: React.ReactNode;
  itens: Array<[string, number]>;
  sufixo: string;
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
      padding: '0.75rem 1rem',
    }}>
      <div style={{
        fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem',
        display: 'flex', alignItems: 'center', gap: '0.35rem',
      }}>
        {icone} {titulo}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
        {itens.map(([nome, valor]) => (
          <li key={nome} style={{
            display: 'flex', justifyContent: 'space-between', gap: '0.75rem',
            fontSize: '0.75rem', padding: '0.28rem 0', borderTop: '1px solid #f1f5f9',
          }}>
            <span style={{ color: '#475569' }}>{nome}</span>
            <strong style={{ color: '#166534' }}>
              {formatarMetricaUnidade(valor, sufixo)}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const cardStyle: CSSProperties = {
  minWidth: 120,
  flex: '1 1 120px',
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '0.65rem 0.85rem',
};

const labelStyle: CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
  marginBottom: '0.25rem',
};

const valorStyle: CSSProperties = {
  fontSize: '1.2rem',
  fontWeight: 800,
  color: '#0f172a',
};

const th: CSSProperties = {
  padding: '0.45rem 0.65rem',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: '0.65rem',
  textTransform: 'uppercase',
};

const td: CSSProperties = {
  padding: '0.4rem 0.65rem',
  color: '#334155',
};
