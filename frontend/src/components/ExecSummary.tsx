import { useState, useRef, useCallback } from 'react';
import { FiRefreshCw, FiPlus, FiEdit3, FiSave, FiX, FiEye, FiEyeOff, FiMenu, FiHelpCircle } from 'react-icons/fi';
import { ExecSummarySkeleton } from './SkeletonLoader';
import type { ExecMetrics, ResumoConfig } from '../hooks/useKpiCalculator';

interface ExecSummaryProps {
  execMetrics: ExecMetrics | null;
  loading: boolean;
  onReload: () => void;
  /** Configuração do resumo executivo do contrato */
  configResumo?: ResumoConfig | null;
  /** ID do serviço para salvar config */
  servicoId?: string;
  /** Token JWT para autenticação */
  token?: string;
  /** Filtro de tipo de caminhao */
  tiposCaminhao?: string[];
  filtroCaminhao?: string | null;
  onFiltroCaminhao?: (tipo: string | null) => void;
  /** Callback quando usuario clica em "Criar KPI" em uma metrica */
  onCriarKpi?: (metricaKey: string) => void;
  /** Se o servico tem planilha vinculada */
  temPlanilha?: boolean;
  /** Conjunto de keys de metricas que ja foram transformadas em KPI */
  kpisExistentes?: Set<string>;
}

// ─── Catálogo de todas as métricas ───

interface MetricaInfo {
  key: string;
  label: string;
  tipo: 'primaria' | 'secundaria';
  cor: string;
  formatar: (m: ExecMetrics) => string;
  formato: 'numero' | 'moeda' | 'porcentagem';
}

const CATALOGO_METRICAS: MetricaInfo[] = [
  { key: 'viagens', label: 'Viagens', tipo: 'primaria', cor: '#22c55e', formato: 'numero', formatar: m => m.viagens.toLocaleString('pt-BR') },
  { key: 'qtdColetores', label: 'Coletores', tipo: 'primaria', cor: '#8b5cf6', formato: 'numero', formatar: m => m.qtdColetores.toLocaleString('pt-BR') },
  { key: 'pesoTotalTon', label: 'Tonelagem Total', tipo: 'primaria', cor: '#22c55e', formato: 'numero', formatar: m => m.pesoTotalTon.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' t' },
  { key: 'kmTotal', label: 'KM Rodados', tipo: 'primaria', cor: '#06b6d4', formato: 'numero', formatar: m => m.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km' },
  { key: 'horasProdutivas', label: 'Horas Produtivas', tipo: 'primaria', cor: '#f59e0b', formato: 'numero', formatar: m => m.horasProdutivas > 0 ? m.horasProdutivas.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'h' : 'N/D' },
  { key: 'faturamento', label: 'Faturamento Total', tipo: 'primaria', cor: '#f59e0b', formato: 'moeda', formatar: m => m.faturamento > 0 ? m.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : (m.temValor ? 'R$ 0,00' : 'Configurar') },
  { key: 'tonKm', label: 'Tonelada por KM', tipo: 'secundaria', cor: '#06b6d4', formato: 'numero', formatar: m => m.tonKm < 0.001 ? (m.tonKm * 1000).toFixed(2) + ' kg' : m.tonKm.toFixed(4) + ' t' },
  { key: 'prodColetor', label: 'Prod. por Coletor', tipo: 'secundaria', cor: '#8b5cf6', formato: 'numero', formatar: m => m.prodColetor.toFixed(2) + ' t' },
  { key: 'kmMedioViagem', label: 'KM Médio por Viagem', tipo: 'secundaria', cor: '#22c55e', formato: 'numero', formatar: m => m.kmMedioViagem.toFixed(1) + ' km' },
  { key: 'tonMediaColeta', label: 'Ton. Média por Coleta', tipo: 'secundaria', cor: '#22c55e', formato: 'numero', formatar: m => m.tonMediaColeta.toFixed(2) + ' t' },
  { key: 'receitaKm', label: 'Receita por KM', tipo: 'secundaria', cor: '#f59e0b', formato: 'moeda', formatar: m => m.receitaKm > 0 ? m.receitaKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/km' : 'N/D' },
  { key: 'receitaHora', label: 'Receita por Hora', tipo: 'secundaria', cor: '#ef4444', formato: 'moeda', formatar: m => m.receitaHora > 0 ? m.receitaHora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h' : 'N/D' },
];

const METRICAS_POR_KEY = new Map(CATALOGO_METRICAS.map(m => [m.key, m]));

export default function ExecSummary({
  execMetrics,
  loading,
  onReload,
  configResumo,
  servicoId,
  token,
  tiposCaminhao = [],
  filtroCaminhao,
  onFiltroCaminhao,
  onCriarKpi,
  temPlanilha = true,
  kpisExistentes,
}: ExecSummaryProps) {
  const [editMode, setEditMode] = useState(false);
  const [metricasVisiveis, setMetricasVisiveis] = useState<Record<string, boolean>>({});
  const [ordem, setOrdem] = useState<string[]>([]);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Inicializar estados quando edição for aberta
  const iniciarEdicao = useCallback(() => {
    // Usar ordem do configResumo ou ordem padrão do catálogo
    const ordemPadrao = CATALOGO_METRICAS.map(m => m.key);
    const ordemInicial = configResumo?.ordem?.length ? configResumo.ordem.filter(k => METRICAS_POR_KEY.has(k)) : ordemPadrao;
    // Adicionar métricas que estão no catálogo mas não na ordem salva
    for (const m of CATALOGO_METRICAS) {
      if (!ordemInicial.includes(m.key)) ordemInicial.push(m.key);
    }
    setOrdem(ordemInicial);

    const visiveis: Record<string, boolean> = {};
    // Começar com config salva
    if (configResumo?.metricasAtivas?.length) {
      for (const key of configResumo.metricasAtivas) {
        visiveis[key] = true;
      }
    }
    // Default: todas visíveis
    for (const m of CATALOGO_METRICAS) {
      if (visiveis[m.key] === undefined) visiveis[m.key] = true;
    }
    setMetricasVisiveis(visiveis);
    setEditMode(true);
    setSalvo(false);
  }, [configResumo]);

  const cancelarEdicao = () => {
    setEditMode(false);
    setSalvo(false);
  };

  const salvarConfig = async () => {
    if (!servicoId || !token) return;
    setSalvandoConfig(true);
    try {
      const metricasAtivas = Object.entries(metricasVisiveis)
        .filter(([_, visivel]) => visivel)
        .map(([key]) => key);

      const res = await fetch(`/api/contracts/_/servicos/${servicoId}/config-resumo`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ metricasAtivas, ordem }),
      });

      if (res.ok) {
        setSalvo(true);
        setTimeout(() => { setEditMode(false); setSalvo(false); }, 800);
      } else {
        console.error('Erro ao salvar config resumo');
      }
    } catch (err) {
      console.error('Erro ao salvar config resumo:', err);
    } finally {
      setSalvandoConfig(false);
    }
  };

  // ─── Drag handlers ───
  const handleDragStart = (index: number) => { dragItem.current = index; };
  const handleDragEnter = (index: number) => { dragOverItem.current = index; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const newOrdem = [...ordem];
    const draggedItem = newOrdem.splice(dragItem.current, 1)[0];
    newOrdem.splice(dragOverItem.current, 0, draggedItem);
    setOrdem(newOrdem);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  // ─── Colunas encontradas ───
  const colunasEncontradas = configResumo?.colunasEncontradas || {};
  const metricaTemColuna = (key: string): boolean => {
    const info = colunasEncontradas[key];
    if (!info) return true;
    return info.encontrada;
  };

  // ─── Render ───

  if (loading && !execMetrics) return <ExecSummarySkeleton />;

  if (!execMetrics) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px', padding: '1.1rem 1.25rem', marginBottom: '1.25rem',
        color: '#94a3b8', fontSize: '0.78rem',
      }}>
        Nenhum dado disponivel para o resumo executivo.
      </div>
    );
  }

  // Métricas ordenadas (para visualização normal)
  const ordemMetricas = configResumo?.ordem?.length
    ? configResumo.ordem.filter(k => CATALOGO_METRICAS.some(m => m.key === k))
    : CATALOGO_METRICAS.map(m => m.key);

  const metricasVisiveisNormais = CATALOGO_METRICAS
    .filter(m => {
      // Filtro de visibilidade
      if (configResumo?.metricasAtivas?.length) {
        return configResumo.metricasAtivas.includes(m.key);
      }
      return true;
    })
    .sort((a, b) => ordemMetricas.indexOf(a.key) - ordemMetricas.indexOf(b.key));

  const metricasPrimariasNormais = metricasVisiveisNormais.filter(m => m.tipo === 'primaria');
  const metricasSecundariasNormais = metricasVisiveisNormais.filter(m => m.tipo === 'secundaria');

  // Função para renderizar card de métrica (compartilhada entre modo normal e edição)
  const renderMetricaCard = (metrica: MetricaInfo, isEdit: boolean) => {
    const temColuna = metricaTemColuna(metrica.key);
    const visivel = metricasVisiveis[metrica.key] !== false;
    const estiloPrimario = {
      background: 'rgba(255,255,255,0.06)',
      borderRadius: '8px',
      padding: '0.55rem 0.7rem',
      borderLeft: `3px solid ${metrica.cor}`,
      opacity: isEdit && !visivel ? 0.35 : (temColuna ? 1 : 0.6),
      transition: 'opacity 0.2s, transform 0.15s',
      cursor: isEdit ? 'default' : 'default',
    };
    const estiloSecundario = {
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '8px',
      padding: '0.5rem 0.65rem',
      borderBottom: `2px solid ${metrica.cor}`,
      opacity: isEdit && !visivel ? 0.35 : (temColuna ? 1 : 0.6),
      transition: 'opacity 0.2s, transform 0.15s',
    };

    const valorDisplay = temColuna
      ? metrica.formatar(execMetrics)
      : '—';

    return (
      <div
        key={metrica.key}
        style={{
          ...(metrica.tipo === 'primaria' ? estiloPrimario : estiloSecundario),
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.25rem' }}>
          <div style={{
            fontSize: '0.58rem', color: '#94a3b8', fontWeight: 600,
            textTransform: 'uppercase', marginBottom: '0.2rem',
            flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: '0.25rem',
          }}>
            {/* Ícone de coluna ausente */}
            {!temColuna && (
              <span title="Coluna necessária não encontrada na planilha" style={{ color: '#f59e0b', display: 'inline-flex' }}>
                <FiHelpCircle size={10} />
              </span>
            )}
            {metrica.label}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
            {isEdit && (
              <>
                {/* Checkbox de visibilidade */}
                <button
                  onClick={() => setMetricasVisiveis(prev => ({ ...prev, [metrica.key]: !prev[metrica.key] }))}
                  title={visivel ? 'Ocultar métrica' : 'Mostrar métrica'}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '0.1rem', display: 'flex', color: visivel ? metrica.cor : '#475569',
                    fontSize: '0.75rem',
                  }}
                >
                  {visivel ? <FiEye size={11} /> : <FiEyeOff size={11} />}
                </button>
                {/* Alça de drag */}
                <span style={{ color: '#475569', cursor: 'grab', fontSize: '0.7rem', display: 'flex' }}>
                  <FiMenu size={11} />
                </span>
              </>
            )}
            {!isEdit && onCriarKpi && (
              // Botão KPI (fora do edit mode)
              (() => {
                const jaExiste = kpisExistentes?.has(metrica.key);
                return (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCriarKpi(metrica.key); }}
                    disabled={!temPlanilha || jaExiste || !temColuna}
                    title={
                      !temPlanilha ? 'Faça upload de uma planilha primeiro'
                      : !temColuna ? 'Coluna necessária não encontrada'
                      : jaExiste ? 'KPI já existe para esta métrica'
                      : `Criar KPI: ${metrica.label}`
                    }
                    style={{
                      background: jaExiste ? 'rgba(245,158,11,0.15)' : temPlanilha && temColuna ? 'rgba(34,197,94,0.15)' : 'rgba(100,116,139,0.15)',
                      border: jaExiste ? '1px solid rgba(245,158,11,0.3)' : temPlanilha && temColuna ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(100,116,139,0.2)',
                      borderRadius: '4px', padding: '0.1rem 0.3rem',
                      cursor: (!temPlanilha || jaExiste || !temColuna) ? 'not-allowed' : 'pointer',
                      color: jaExiste ? '#fbbf24' : (temPlanilha && temColuna) ? '#22c55e' : '#64748b',
                      fontSize: '0.6rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.15rem',
                      opacity: (!temPlanilha && !jaExiste) ? 0.4 : 1, marginBottom: '0.2rem', flexShrink: 0,
                    }}
                  >
                    <FiPlus size={10} /> {jaExiste ? 'KPI' : 'KPI'}
                  </button>
                );
              })()
            )}
          </div>
        </div>
        <div style={{
          fontSize: metrica.tipo === 'primaria' ? '1.1rem' : '1rem',
          fontWeight: 700,
          color: temColuna ? '#fff' : '#64748b',
          fontStyle: !temColuna ? 'italic' : 'normal',
        }}>
          {valorDisplay}
        </div>
        {/* Tooltip de coluna ausente */}
        {!temColuna && isEdit && (
          <div style={{ fontSize: '0.55rem', color: '#f59e0b', marginTop: '0.15rem' }}>
            Colunas necessárias: {colunasEncontradas[metrica.key]?.precisaColuna?.join(', ') || 'N/A'}
          </div>
        )}
      </div>
    );
  };

  // ─── Modo de EDIÇÃO ───
  if (editMode) {
    return (
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px', padding: '1.1rem 1.25rem', marginBottom: '1.25rem',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Editar Resumo Executivo
            <span style={{ marginLeft: '0.4rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 400 }}>
              (arraste para reordenar, clique no olho para mostrar/ocultar)
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.3rem' }}>
            <button
              onClick={cancelarEdicao}
              style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: 'pointer',
                color: '#ef4444', fontSize: '0.65rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.2rem',
              }}
            >
              <FiX size={12} /> Cancelar
            </button>
            <button
              onClick={salvarConfig}
              disabled={salvandoConfig}
              style={{
                background: salvo ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.15)',
                border: salvo ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(34,197,94,0.3)',
                borderRadius: '6px', padding: '0.25rem 0.5rem', cursor: salvandoConfig ? 'wait' : 'pointer',
                color: salvo ? '#22c55e' : '#22c55e', fontSize: '0.65rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.2rem',
                opacity: salvandoConfig ? 0.6 : 1,
              }}
            >
              <FiSave size={12} />
              {salvo ? 'Salvo ✓' : salvandoConfig ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        {/* Cards editáveis em grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.6rem',
        }}>
          {ordem.map((key, index) => {
            const metrica = METRICAS_POR_KEY.get(key);
            if (!metrica) return null;
            return (
              <div
                key={metrica.key}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{ cursor: 'grab' }}
              >
                {renderMetricaCard(metrica, true)}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Modo NORMAL ───
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
      borderRadius: '12px', padding: '1.1rem 1.25rem', marginBottom: '1.25rem',
    }}>
      {/* Filtro de tipo de caminhao */}
      {tiposCaminhao.length > 0 && onFiltroCaminhao && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            Tipo de Caminhao:
          </span>
          <button
            onClick={() => onFiltroCaminhao(null)}
            style={{
              padding: '0.25rem 0.6rem', borderRadius: '6px',
              border: !filtroCaminhao ? '2px solid #22c55e' : '1px solid #475569',
              background: !filtroCaminhao ? '#f0fdf4' : 'transparent',
              fontSize: '0.72rem', fontWeight: !filtroCaminhao ? 700 : 500,
              color: !filtroCaminhao ? '#15803d' : '#94a3b8', cursor: 'pointer',
            }}
          >
            Todos
          </button>
          {tiposCaminhao.map(tipo => (
            <button
              key={tipo}
              onClick={() => onFiltroCaminhao(filtroCaminhao === tipo ? null : tipo)}
              style={{
                padding: '0.25rem 0.6rem', borderRadius: '6px',
                border: filtroCaminhao === tipo ? '2px solid #22c55e' : '1px solid #475569',
                background: filtroCaminhao === tipo ? '#f0fdf4' : 'transparent',
                fontSize: '0.72rem', fontWeight: filtroCaminhao === tipo ? 700 : 500,
                color: filtroCaminhao === tipo ? '#15803d' : '#94a3b8', cursor: 'pointer',
              }}
            >
              {tipo}
            </button>
          ))}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.7rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Resumo Executivo
          <span style={{ marginLeft: '0.4rem', fontSize: '0.6rem', color: '#64748b', fontWeight: 400 }}>
            ({metricasPrimariasNormais.length + metricasSecundariasNormais.length} métricas)
          </span>
          {loading && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', color: '#64748b', fontWeight: 400 }}>
              (Sincronizando...)
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          <button
            onClick={onReload}
            style={{
              background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
              padding: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.65rem',
            }}
          >
            <FiRefreshCw size={11} /> Backend
          </button>
          {servicoId && token && (
            <button
              onClick={iniciarEdicao}
              title="Editar métricas do resumo executivo"
              style={{
                background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)',
                borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer',
                color: '#818cf8', fontSize: '0.65rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '0.2rem',
              }}
            >
              <FiEdit3 size={11} /> Editar
            </button>
          )}
        </div>
      </div>

      {/* Metricas primarias */}
      {metricasPrimariasNormais.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.6rem',
          marginBottom: metricasSecundariasNormais.length > 0 ? '0.75rem' : '0',
        }}>
          {metricasPrimariasNormais.map(metrica => renderMetricaCard(metrica, false))}
        </div>
      )}

      {/* Metricas secundarias */}
      {metricasSecundariasNormais.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.6rem',
          marginBottom: '0.75rem',
        }}>
          {metricasSecundariasNormais.map(metrica => renderMetricaCard(metrica, false))}
        </div>
      )}

      {/* Faturamento por tipo de caminhao */}
      {execMetrics.temValor && Object.keys(execMetrics.fatPorTipo).length > 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', borderRadius: '8px', padding: '0.55rem 0.7rem',
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
            Faturamento por Tipo de Caminhao
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {Object.entries(execMetrics.fatPorTipo).map(([tipo, valor]) => (
              <div key={tipo} style={{
                background: 'rgba(245,158,11,0.1)', borderRadius: '6px', padding: '0.3rem 0.55rem',
                border: '1px solid rgba(245,158,11,0.2)', display: 'flex', alignItems: 'center', gap: '0.4rem',
              }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase' }}>
                  {tipo}
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>
                  {(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { CATALOGO_METRICAS };
