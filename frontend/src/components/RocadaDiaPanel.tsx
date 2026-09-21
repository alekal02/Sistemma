import { FiMap, FiUsers, FiTool, FiLayers, FiActivity, FiDollarSign } from 'react-icons/fi';
import {
  fmtAreaM2,
  labelStatusVsMedia,
  resumirProducaoPorUnidade,
  equipeEhApenasTipo,
  type AnaliseRocadaDia,
  type FrotaRocadaCiclo,
  type LinhaRocadaAgrupada,
  type ResumoProducaoUnidade,
} from '../utils/operacaoRocada';
import { formatarIsoParaBr } from '../utils/periodoDados';
import GraficosRocadaDia from './GraficosRocadaDia';

export interface BlocoTipoRocadaUi {
  tipo: 'manual' | 'mecanizada';
  label: string;
  registros: number;
  areaM2: number;
  bairros: number;
  operadores: number;
  equipes: number;
  equipamentos: number;
  porBairro: LinhaRocadaAgrupada[];
  porOperador: LinhaRocadaAgrupada[];
  porEquipe: LinhaRocadaAgrupada[];
  porEquipamento: LinhaRocadaAgrupada[];
  frotaCiclo?: FrotaRocadaCiclo;
}

interface Props {
  dataIso: string;
  analise: AnaliseRocadaDia | null;
  blocoManual?: BlocoTipoRocadaUi | null;
  blocoMecanizada?: BlocoTipoRocadaUi | null;
  porTipo?: LinhaRocadaAgrupada[];
  valorM2?: number | null;
  valorM2Manual?: number | null;
  valorM2Mecanizada?: number | null;
  registros?: Record<string, unknown>[];
  totalRegistros?: number;
  carregandoRegistros?: boolean;
  mostrarRegistros?: boolean;
  onToggleRegistros?: () => void;
  pagina?: number;
  totalPaginas?: number;
  onPaginaChange?: (pagina: number) => void;
}

function Kpi({
  label, valor, cor, icone, sub,
}: {
  label: string;
  valor: string;
  cor: string;
  icone: React.ReactNode;
  sub?: string;
}) {
  return (
    <div style={{
      flex: '1 1 140px', background: '#fff', border: '1px solid #e2e8f0',
      borderRadius: '10px', padding: '0.7rem 0.8rem', borderTop: `3px solid ${cor}`, minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.62rem', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem',
      }}>
        {icone} {label}
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.15 }}>{valor}</div>
      {sub && (
        <div style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.2rem' }}>{sub}</div>
      )}
    </div>
  );
}

function MiniStat({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', padding: '0.4rem 0.55rem',
    }}>
      <div style={{ fontSize: '0.58rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#e2e8f0', marginTop: '0.1rem' }}>
        {valor}
      </div>
    </div>
  );
}

function BarraParticipacao({
  label, area, total, cor,
}: {
  label: string;
  area: number;
  total: number;
  cor: string;
}) {
  const pct = total > 0 ? (area / total) * 100 : 0;
  return (
    <div style={{ marginBottom: '0.55rem' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
        fontSize: '0.72rem', marginBottom: '0.25rem',
      }}>
        <span style={{ fontWeight: 700, color: '#334155' }}>{label}</span>
        <span style={{ color: '#64748b' }}>
          {fmtAreaM2(area)} m² · {pct.toFixed(0)}%
        </span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, pct)}%`, height: '100%', background: cor, borderRadius: 999,
        }}
        />
      </div>
    </div>
  );
}

function TabelaProducaoUnidade({
  titulo,
  resumo,
  cor,
}: {
  titulo: string;
  resumo: ResumoProducaoUnidade;
  cor: string;
}) {
  if (!resumo.linhas.length && resumo.frota <= 0) return null;
  const corStatus = (s: ResumoProducaoUnidade['linhas'][number]['status']) => (
    s === 'acima' ? '#166534' : s === 'abaixo' ? '#9a3412' : '#475569'
  );
  const bgStatus = (s: ResumoProducaoUnidade['linhas'][number]['status']) => (
    s === 'acima' ? '#dcfce7' : s === 'abaixo' ? '#ffedd5' : '#f1f5f9'
  );
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
      overflow: 'hidden', marginBottom: '0.75rem',
    }}>
      <div style={{
        padding: '0.55rem 0.85rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{
          fontSize: '0.75rem', fontWeight: 700, color: '#334155',
          display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap',
        }}>
          <span>{titulo}</span>
          <span style={{ color: '#64748b', fontWeight: 600 }}>
            {resumo.ativas} de {resumo.frota} {resumo.unidadePlural} no dia
          </span>
        </div>
        <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '0.25rem' }}>
          Total {fmtAreaM2(resumo.total)} m²
          {resumo.ativas > 0 && ` · média ${fmtAreaM2(resumo.media)} m² / ${resumo.unidadeSingular}`}
          {resumo.ausentes.length > 0 && ` · ${resumo.ausentes.length} sem registro hoje`}
        </div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ color: '#64748b', background: '#fafbfc' }}>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'left' }}>
                {resumo.unidadeSingular === 'trator' ? 'Trator' : 'Equipe'}
              </th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>Registros</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Produção (m²)</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Vs média</th>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'right' }}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {resumo.linhas.map((l) => (
              <tr key={l.label} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '0.45rem 0.85rem', fontWeight: 600, color: '#1e293b' }}>{l.label}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#475569' }}>{l.registros}</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 700, color: cor }}>
                  {fmtAreaM2(l.areaM2)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: '#64748b' }}>
                  {Math.round(l.vsMedia * 100)}%
                </td>
                <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right' }}>
                  <span style={{
                    fontSize: '0.62rem', fontWeight: 700, padding: '0.15rem 0.4rem',
                    borderRadius: 999, background: bgStatus(l.status), color: corStatus(l.status),
                  }}>
                    {labelStatusVsMedia(l.status)}
                  </span>
                </td>
              </tr>
            ))}
            {resumo.linhas.length > 0 && (
              <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc' }}>
                <td style={{ padding: '0.45rem 0.85rem', fontWeight: 800 }}>Total / média</td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', fontWeight: 700 }}>
                  {resumo.linhas.reduce((s, l) => s + l.registros, 0)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', fontWeight: 800, color: cor }}>
                  {fmtAreaM2(resumo.total)}
                </td>
                <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: '#64748b' }}>—</td>
                <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#334155' }}>
                  {fmtAreaM2(resumo.media)} m²
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {resumo.ausentes.length > 0 && resumo.ausentes.length <= 12 && (
        <div style={{ padding: '0.4rem 0.85rem', fontSize: '0.65rem', color: '#9a3412', background: '#fff7ed' }}>
          Sem registro hoje: {resumo.ausentes.join(', ')}
        </div>
      )}
    </div>
  );
}

function TabelaGrupo({ titulo, linhas }: { titulo: string; linhas: { label: string; registros: number; areaM2: number }[] }) {
  if (!linhas.length) return null;
  const totalArea = linhas.reduce((s, l) => s + l.areaM2, 0);
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
      overflow: 'hidden', marginBottom: '0.75rem',
    }}>
      <div style={{
        padding: '0.55rem 0.85rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
        fontSize: '0.75rem', fontWeight: 700, color: '#334155',
        display: 'flex', justifyContent: 'space-between', gap: '0.5rem',
      }}>
        <span>{titulo}</span>
        <span style={{ color: '#64748b', fontWeight: 600 }}>
          {linhas.length} item(ns) · {fmtAreaM2(totalArea)} m²
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
          <thead>
            <tr style={{ color: '#64748b', background: '#fafbfc' }}>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'left' }}>Nome</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'center' }}>Registros</th>
              <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>Participação</th>
              <th style={{ padding: '0.4rem 0.85rem', textAlign: 'right' }}>Área (m²)</th>
            </tr>
          </thead>
          <tbody>
            {linhas.slice(0, 30).map((l) => {
              const pct = totalArea > 0 ? (l.areaM2 / totalArea) * 100 : 0;
              return (
                <tr key={l.label} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '0.45rem 0.85rem', fontWeight: 600, color: '#1e293b' }}>{l.label}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'center', color: '#475569' }}>{l.registros}</td>
                  <td style={{ padding: '0.45rem 0.6rem', textAlign: 'right', color: '#64748b' }}>
                    {pct.toFixed(1)}%
                  </td>
                  <td style={{ padding: '0.45rem 0.85rem', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                    {fmtAreaM2(l.areaM2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SecaoTipo({ bloco, cor }: { bloco: BlocoTipoRocadaUi; cor: string }) {
  const producao = resumirProducaoPorUnidade({
    porEquipamento: bloco.porEquipamento,
    porEquipe: bloco.porEquipe,
    frotaCiclo: bloco.frotaCiclo,
    preferirTrator: bloco.tipo === 'mecanizada',
  });
  return (
    <div style={{
      flex: '1 1 320px',
      minWidth: 0,
      background: '#fff',
      border: `1px solid ${cor}33`,
      borderRadius: '12px',
      overflow: 'hidden',
      borderTop: `4px solid ${cor}`,
    }}>
      <div style={{
        padding: '0.7rem 0.9rem',
        background: `${cor}12`,
        borderBottom: `1px solid ${cor}33`,
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#0f172a' }}>{bloco.label}</div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
            {bloco.registros.toLocaleString('pt-BR')} registro(s)
          </div>
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: cor }}>
          {fmtAreaM2(bloco.areaM2)} m²
        </div>
      </div>

      <div style={{ padding: '0.65rem 0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <Kpi label="Bairros" valor={String(bloco.bairros)} cor="#0369a1" icone={<FiMap size={11} />} />
        <Kpi label="Operadores" valor={String(bloco.operadores)} cor="#7c3aed" icone={<FiUsers size={11} />} />
        {producao.ativas > 0 && (
          <Kpi
            label={producao.unidadePlural[0].toUpperCase() + producao.unidadePlural.slice(1)}
            valor={`${producao.ativas}/${producao.frota}`}
            cor={cor}
            icone={<FiTool size={11} />}
            sub={`média ${fmtAreaM2(producao.media)} m²`}
          />
        )}
      </div>

      <div style={{ padding: '0 0.75rem 0.75rem' }}>
        <TabelaGrupo titulo={`Bairros — ${bloco.label}`} linhas={bloco.porBairro} />
        <TabelaGrupo titulo={`Operadores — ${bloco.label}`} linhas={bloco.porOperador} />
        <TabelaProducaoUnidade
          titulo={`Produção por ${producao.unidadeSingular} — ${bloco.label}`}
          resumo={producao}
          cor={cor}
        />
      </div>
    </div>
  );
}

function estimarReceita(
  resumo: AnaliseRocadaDia['resumo'],
  valorM2?: number | null,
  valorM2Manual?: number | null,
  valorM2Mecanizada?: number | null,
): number {
  const vMan = Number(valorM2Manual || 0) > 0 ? Number(valorM2Manual) : Number(valorM2 || 0);
  const vMec = Number(valorM2Mecanizada || 0) > 0 ? Number(valorM2Mecanizada) : Number(valorM2 || 0);
  const vFallback = Number(valorM2 || vMan || vMec || 0);
  const areaMan = Number(resumo.areaManualM2 || 0);
  const areaMec = Number(resumo.areaMecanizadaM2 || 0);
  const areaOutro = Math.max(0, Number(resumo.areaM2 || 0) - areaMan - areaMec);
  return areaMan * vMan + areaMec * vMec + areaOutro * vFallback;
}

export default function RocadaDiaPanel({
  dataIso,
  analise,
  blocoManual = null,
  blocoMecanizada = null,
  porTipo = [],
  valorM2 = null,
  valorM2Manual = null,
  valorM2Mecanizada = null,
  registros = [],
  totalRegistros,
  carregandoRegistros,
  mostrarRegistros,
  onToggleRegistros,
  pagina = 1,
  totalPaginas = 1,
  onPaginaChange,
}: Props) {
  if (carregandoRegistros && !analise) {
    return <div style={{ padding: '1rem', color: '#94a3b8', fontSize: '0.8rem' }}>Carregando operação de roçada...</div>;
  }

  if (!analise || analise.resumo.registros <= 0) {
    return (
      <div style={{
        background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '10px',
        padding: '1rem', color: '#9a3412', fontSize: '0.85rem',
      }}>
        Nenhuma área roçada em {formatarIsoParaBr(dataIso)}.
      </div>
    );
  }

  const { resumo } = analise;
  const total = totalRegistros ?? resumo.registros;
  const mediaPorRegistro = resumo.registros > 0 ? resumo.areaM2 / resumo.registros : 0;
  const receita = estimarReceita(resumo, valorM2, valorM2Manual, valorM2Mecanizada);
  const temSplit = Boolean(
    (blocoManual && blocoManual.registros > 0) || (blocoMecanizada && blocoMecanizada.registros > 0),
  );
  const areaMan = Number(resumo.areaManualM2 || blocoManual?.areaM2 || 0);
  const areaMec = Number(resumo.areaMecanizadaM2 || blocoMecanizada?.areaM2 || 0);
  const areaOutro = Math.max(0, resumo.areaM2 - areaMan - areaMec);

  const tiposBrutos = porTipo.length > 0
    ? porTipo
    : [
        ...(areaMan > 0 ? [{ label: 'Manual', registros: resumo.registrosManual || blocoManual?.registros || 0, areaM2: areaMan }] : []),
        ...(areaMec > 0 ? [{ label: 'Mecanizada', registros: resumo.registrosMecanizada || blocoMecanizada?.registros || 0, areaM2: areaMec }] : []),
        ...(areaOutro > 0 && areaMan <= 0 && areaMec <= 0
          ? [{ label: 'Roçada', registros: resumo.registros, areaM2: areaOutro }]
          : areaOutro > 0
            ? [{ label: 'Outros', registros: Math.max(0, resumo.registros - (resumo.registrosManual || 0) - (resumo.registrosMecanizada || 0)), areaM2: areaOutro }]
            : []),
      ];
  const tipos = tiposBrutos
    .map((t) => ({
      ...t,
      label: /n[aã]o classificado/i.test(t.label) ? 'Roçada' : t.label,
    }))
    .filter((t) => t.areaM2 > 0);

  const linhasLocal = (analise.porBairro || []).filter((l) => l.label !== 'Não informado' && l.areaM2 > 0);
  const linhasSegmento = (analise.porOperador || []).filter((l) => l.label !== 'Não informado' && l.areaM2 > 0);
  const linhasEquipe = (analise.porEquipe || []).filter((l) => l.label !== 'Não informado' && l.areaM2 > 0);
  const linhasEquip = (analise.porEquipamento || []).filter((l) => l.label !== 'Não informado' && l.areaM2 > 0);
  const producaoUnidade = resumirProducaoPorUnidade({
    porEquipamento: linhasEquip,
    porEquipe: linhasEquipe,
    frotaCiclo: analise.frotaCiclo,
    preferirTrator: linhasEquip.length > 0,
  });

  // Rótulos conforme o que a planilha realmente trouxe
  const labelLocal = linhasLocal.some((l) => /→/.test(l.label)) ? 'Área por local'
    : linhasLocal.length > 0 ? 'Área por local / trecho / bairro'
      : 'Área por local';
  const labelSegmento = linhasSegmento.some((l) => /→/.test(l.label))
    ? 'Área por segmento (início → término)'
    : 'Área por operador / endereço';

  return (
    <div>
      {/* Resumo rápido */}
      <div style={{
        background: 'linear-gradient(135deg, #ecfdf5 0%, #eff6ff 100%)',
        border: '1px solid #bbf7d0', borderRadius: '10px',
        padding: '0.65rem 0.85rem', marginBottom: '0.75rem',
        fontSize: '0.72rem', color: '#166534',
      }}>
        <strong>{fmtAreaM2(resumo.areaM2)} m²</strong>
        {' '}em {formatarIsoParaBr(dataIso)}
        {' · '}{resumo.registros} registro{resumo.registros !== 1 ? 's' : ''}
        {resumo.bairros > 0 && ` · ${resumo.bairros} local${resumo.bairros !== 1 ? 'is' : ''}`}
        {resumo.operadores > 0 && ` · ${resumo.operadores} segmento${resumo.operadores !== 1 ? 's' : ''}`}
        {resumo.equipes > 0 && ` · ${resumo.equipes} equipe${resumo.equipes !== 1 ? 's' : ''}/periodicidade`}
        {resumo.equipamentos > 0 && ` · ${resumo.equipamentos} equipamento${resumo.equipamentos !== 1 ? 's' : ''}`}
      </div>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.85rem',
        border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
            Área roçada no dia
          </div>
          <div style={{
            fontSize: '1.85rem', fontWeight: 800, color: '#86efac', marginTop: '0.15rem',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            {fmtAreaM2(resumo.areaM2)} m²
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem' }}>
            Média {fmtAreaM2(mediaPorRegistro)} m² / registro
            {receita > 0 && ` · receita estimada R$ ${receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(95px, 1fr))', gap: '0.4rem',
          minWidth: '210px',
        }}>
          <MiniStat label="Registros" valor={String(resumo.registros)} />
          <MiniStat label="Locais" valor={String(resumo.bairros)} />
          <MiniStat label="Segmentos" valor={String(resumo.operadores)} />
          <MiniStat label="Equipes" valor={String(resumo.equipes)} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
        <Kpi
          label="Área total"
          valor={`${fmtAreaM2(resumo.areaM2)} m²`}
          cor="#22c55e"
          icone={<FiLayers size={11} />}
          sub={`${resumo.registros} registro(s)`}
        />
        <Kpi
          label="Média / registro"
          valor={`${fmtAreaM2(mediaPorRegistro)} m²`}
          cor="#6366f1"
          icone={<FiActivity size={11} />}
        />
        {resumo.bairros > 0 && (
          <Kpi
            label="Locais"
            valor={String(resumo.bairros)}
            cor="#0369a1"
            icone={<FiMap size={11} />}
            sub="bairros / trechos"
          />
        )}
        {resumo.operadores > 0 && (
          <Kpi
            label="Segmentos"
            valor={String(resumo.operadores)}
            cor="#7c3aed"
            icone={<FiUsers size={11} />}
            sub="operador / início-término"
          />
        )}
        {!equipeEhApenasTipo(linhasEquipe) && resumo.equipes > 0 && (
          <Kpi
            label="Equipes"
            valor={String(resumo.equipes)}
            cor="#b45309"
            icone={<FiUsers size={11} />}
            sub="equipe / periodicidade"
          />
        )}
        {producaoUnidade.ativas > 0 && (
          <Kpi
            label={`${producaoUnidade.unidadePlural[0].toUpperCase()}${producaoUnidade.unidadePlural.slice(1)} no dia`}
            valor={`${producaoUnidade.ativas}/${producaoUnidade.frota}`}
            cor="#0f766e"
            icone={<FiTool size={11} />}
            sub={`média ${fmtAreaM2(producaoUnidade.media)} m² / ${producaoUnidade.unidadeSingular}`}
          />
        )}
        {resumo.equipamentos > 0 && producaoUnidade.ativas <= 0 && (
          <Kpi
            label="Equipamentos"
            valor={String(resumo.equipamentos)}
            cor="#0f766e"
            icone={<FiTool size={11} />}
          />
        )}
        {receita > 0 && (
          <Kpi
            label="Receita estimada"
            valor={`R$ ${receita.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            cor="#059669"
            icone={<FiDollarSign size={11} />}
            sub="com base na tarifa m² do serviço"
          />
        )}
        {areaMan > 0 && (
          <Kpi
            label="Manual"
            valor={`${fmtAreaM2(areaMan)} m²`}
            cor="#0ea5e9"
            icone={<FiUsers size={11} />}
            sub={resumo.areaM2 > 0 ? `${((areaMan / resumo.areaM2) * 100).toFixed(0)}% do dia` : undefined}
          />
        )}
        {areaMec > 0 && (
          <Kpi
            label="Mecanizada"
            valor={`${fmtAreaM2(areaMec)} m²`}
            cor="#f59e0b"
            icone={<FiTool size={11} />}
            sub={resumo.areaM2 > 0 ? `${((areaMec / resumo.areaM2) * 100).toFixed(0)}% do dia` : undefined}
          />
        )}
      </div>

      {/* Participação por tipo */}
      {tipos.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
          padding: '0.85rem 1rem', marginBottom: '0.85rem',
        }}>
          <div style={{
            fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '0.65rem',
          }}>
            Participação por tipo de execução
          </div>
          {tipos.map((t) => (
            <BarraParticipacao
              key={t.label}
              label={t.label}
              area={t.areaM2}
              total={resumo.areaM2}
              cor={
                /manual/i.test(t.label) ? '#0ea5e9'
                  : /mecaniz/i.test(t.label) ? '#f59e0b'
                    : '#22c55e'
              }
            />
          ))}
        </div>
      )}

      <GraficosRocadaDia
        analise={{
          ...analise,
          porBairro: linhasLocal,
          porOperador: linhasSegmento,
          porEquipe: linhasEquipe,
          porEquipamento: linhasEquip,
        }}
        porTipo={tipos}
        blocoManual={blocoManual}
        blocoMecanizada={blocoMecanizada}
      />

      {temSplit ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginBottom: '0.85rem', alignItems: 'flex-start' }}>
          {blocoManual && blocoManual.registros > 0 && (
            <SecaoTipo bloco={blocoManual} cor="#0ea5e9" />
          )}
          {blocoMecanizada && blocoMecanizada.registros > 0 && (
            <SecaoTipo bloco={blocoMecanizada} cor="#f59e0b" />
          )}
        </div>
      ) : (
        <>
          {(linhasLocal.length > 0 || linhasSegmento.length > 0 || linhasEquipe.length > 0 || linhasEquip.length > 0) && (
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0.25rem 0 0.5rem',
            }}>
              Rankings a partir dos indicadores da planilha
            </div>
          )}
          <TabelaGrupo titulo={labelLocal} linhas={linhasLocal} />
          <TabelaGrupo titulo={labelSegmento} linhas={linhasSegmento} />
          <TabelaProducaoUnidade
            titulo="Produção por trator / equipe"
            resumo={resumirProducaoPorUnidade({
              porEquipamento: linhasEquip,
              porEquipe: linhasEquipe,
              frotaCiclo: analise.frotaCiclo,
              preferirTrator: linhasEquip.length > 0,
            })}
            cor="#166534"
          />
        </>
      )}

      {onToggleRegistros && (
        <button
          type="button"
          onClick={onToggleRegistros}
          style={{
            fontSize: '0.72rem', fontWeight: 600, padding: '0.4rem 0.7rem',
            borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff',
            color: '#475569', cursor: 'pointer', marginBottom: '0.5rem',
          }}
        >
          {mostrarRegistros ? 'Ocultar registros' : `Ver registros (${total.toLocaleString('pt-BR')})`}
        </button>
      )}

      {mostrarRegistros && (
        <div>
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
              <thead>
                <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Tipo</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Bairro</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Operador</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Equipe</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'left' }}>Equipamento</th>
                  <th style={{ padding: '0.4rem 0.6rem', textAlign: 'right' }}>m²</th>
                </tr>
              </thead>
              <tbody>
                {carregandoRegistros ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '0.75rem', color: '#94a3b8', textAlign: 'center' }}>
                      Carregando página...
                    </td>
                  </tr>
                ) : (
                  registros.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.35rem 0.6rem', fontWeight: 600 }}>
                        {String(r.TIPO ?? r.TIPO_EXECUCAO ?? r._tipoExecucao ?? '—')}
                      </td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.BAIRRO ?? r.regional ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Operador ?? r.OPERADOR ?? r.motorista ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Equipe ?? r.EQUIPE ?? r.turno ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem' }}>{String(r.Equipamento ?? r.EQUIPAMENTO ?? r.tipoCaminhao ?? '—')}</td>
                      <td style={{ padding: '0.35rem 0.6rem', textAlign: 'right', fontWeight: 700, color: '#166534' }}>
                        {fmtAreaM2(Number(r['Area m²'] ?? r.AREA_M2 ?? r.M2 ?? 0))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {totalPaginas > 1 && onPaginaChange && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
              marginTop: '0.5rem', fontSize: '0.72rem', color: '#64748b',
            }}>
              <button
                type="button"
                disabled={pagina <= 1}
                onClick={() => onPaginaChange(pagina - 1)}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: pagina <= 1 ? 'default' : 'pointer' }}
              >
                Anterior
              </button>
              <span>{pagina} / {totalPaginas}</span>
              <button
                type="button"
                disabled={pagina >= totalPaginas}
                onClick={() => onPaginaChange(pagina + 1)}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', cursor: pagina >= totalPaginas ? 'default' : 'pointer' }}
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
