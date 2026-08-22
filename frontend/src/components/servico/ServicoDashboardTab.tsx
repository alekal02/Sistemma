import { memo, useEffect, useState, useMemo, useCallback } from 'react';
import { FiZap, FiAlertCircle } from 'react-icons/fi';
import KpiUniversalActivator from '../KpiUniversalActivator';
import servicoService from '../../services/servicoService';
import { useToast } from '../../contexts/ToastContext';
import type { ColunaDetectada, KpiConfig, GraficoConfig } from '../KpiEditor/KpiEditorTypes';
import type { EtapaMiniFlow, EtapasStatus } from './servicoTypes';

export interface ServicoDashboardTabProps {
  mode: 'revisao' | 'indicadoresAuto';
  contractId: string;
  servicoId: string;
  servicoNome: string;
  tipoServico: string;
  token: string | null;
  colunas: ColunaDetectada[];
  temPlanilha: boolean;
  totalLinhas: number;
  totalImportados: number;
  kpis: KpiConfig[];
  graficos: GraficoConfig[];
  kpisUniversalIds: string[];
  onSetKpis: (kpis: KpiConfig[]) => void;
  onSetEtapa: (etapa: EtapaMiniFlow) => void;
  onSetStatus: (fn: (prev: EtapasStatus) => EtapasStatus) => void;
  onSalvarConfig: (kpis: KpiConfig[], graficos: GraficoConfig[]) => void;
  onAlterarTipoColuna: (nome: string, tipo: string) => Promise<void>;
  onAutoSkip: () => void;
}

const ServicoDashboardTab = memo(function ServicoDashboardTab({
  mode,
  contractId,
  servicoId,
  servicoNome,
  tipoServico,
  token,
  colunas,
  temPlanilha,
  totalLinhas,
  totalImportados,
  kpis,
  graficos,
  kpisUniversalIds,
  onSetKpis,
  onSetEtapa,
  onSetStatus,
  onSalvarConfig,
  onAlterarTipoColuna,
  onAutoSkip,
}: ServicoDashboardTabProps) {
  const { adicionarToast } = useToast();
  const [dados, setDados] = useState<any[]>([]);
  const [loadingDados, setLoadingDados] = useState(false);
  const [execMetrics, setExecMetrics] = useState<any>(null);
  const [loadingExec, setLoadingExec] = useState(false);

  const kpisAutomaticos = useMemo(() => kpis.filter(k => (k as any).automatico), [kpis]);

  useEffect(() => {
    if (mode !== 'revisao' || !temPlanilha) return;
    let ativo = true;
    setLoadingDados(true);
    setLoadingExec(true);
    Promise.all([
      servicoService.getDadosBrutos(contractId, servicoId, 100),
      servicoService.getKpiExecMetrics(contractId, servicoId),
    ]).then(([brutos, metrics]) => {
      if (!ativo) return;
      setDados(brutos.dados || []);
      setExecMetrics(metrics);
    }).catch(() => {}).finally(() => {
      if (ativo) { setLoadingDados(false); setLoadingExec(false); }
    });
    return () => { ativo = false; };
  }, [contractId, servicoId, token, temPlanilha, mode]);

  const alterarTipo = useCallback(async (nome: string, tipo: string) => {
    await onAlterarTipoColuna(nome, tipo);
  }, [onAlterarTipoColuna]);

  if (mode === 'indicadoresAuto') {
    if (!tipoServico) {
      return (
        <div>
          <div style={{ background: '#fefce8', borderRadius: '8px', border: '1px solid #fde68a', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#92400e' }}>
            <FiAlertCircle size={16} />
            <span><strong>Tipo de servico nao definido.</strong> Defina o tipo nas configuracoes do servico para acessar os KPIs da Biblioteca Universal.</span>
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
            <button className="btn btn-secondary btn-sm" onClick={onAutoSkip}>Pular esta etapa</button>
            <button className="btn btn-ghost btn-sm" onClick={() => onSetEtapa('upload')}>Voltar</button>
          </div>
        </div>
      );
    }
    return (
      <div>
        <div style={{ background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', color: '#15803d' }}>
          <FiZap size={16} />
          <span><strong>Planilha processada!</strong> {totalImportados.toLocaleString('pt-BR')} linhas importadas. Selecione os KPIs da Biblioteca Universal que deseja ativar para este servico.</span>
        </div>
        <KpiUniversalActivator
          tipoServico={tipoServico}
          servicoId={servicoId}
          servicoNome={servicoNome}
          kpisJaAtivos={kpisUniversalIds}
          onClose={() => onSetEtapa('upload')}
          onConfirm={(kpisAtivados) => {
            if (kpisAtivados.length > 0) {
              const novosKpisUniversal: KpiConfig[] = kpisAtivados.map((k: any) => ({
                nome: k.nome, label: k.label, expressao: k.expressao,
                agregacao: (k.agregacao || 'sum') as KpiConfig['agregacao'],
                formato: (k.formato || 'numero') as KpiConfig['formato'],
                unidade: k.unidade, categoria: k.categoria, cor: k.cor,
                descricao: k.descricao, meta: k.meta, ativo: true,
                valoresFixos: {} as Record<string, number>, colunasUsadas: [] as string[],
                origemUniversal: k.origemUniversal, placeholdersNaoResolvidos: k.placeholdersNaoResolvidos,
              }));
              const novosKpis = [...kpis, ...novosKpisUniversal];
              onSetKpis(novosKpis);
              onSetStatus(prev => ({
                ...prev,
                indicadoresAuto: 'done',
                config: novosKpis.filter(k => k.ativo !== false).length > 0 ? 'done' : 'pending',
              }));
              onSetEtapa('revisao');
              onSalvarConfig(novosKpis, graficos);
              adicionarToast(`${kpisAtivados.length} KPI(s) da biblioteca ativado(s)!`, 'success');
            } else {
              onAutoSkip();
            }
          }}
        />
      </div>
    );
  }

  if (loadingDados) {
    return (
      <div className="skeleton-flow">
        <div className="skeleton" style={{ height: 60 }} />
        <div className="skeleton" style={{ height: 60, marginTop: 8 }} />
      </div>
    );
  }
  if (!temPlanilha) return <div className="empty-state"><p>Nenhuma planilha.</p></div>;

  return (
    <div>
      <div className="estat-grid">
        <div className="estat-card"><div className="estat-valor">{totalLinhas.toLocaleString('pt-BR')}</div><div className="estat-label">Total</div></div>
        <div className="estat-card"><div className="estat-valor">{totalImportados.toLocaleString('pt-BR')}</div><div className="estat-label">Importados</div></div>
        <div className="estat-card"><div className="estat-valor">{colunas.length}</div><div className="estat-label">Colunas</div></div>
      </div>
      {kpisAutomaticos.length > 0 && (
        <div style={{ background: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0', padding: '0.35rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#15803d' }}>
          <FiZap size={13} />
          <span>{kpisAutomaticos.length} indicador(es) automático(s) criados e {graficos.filter(g => g.automatico).length} gráfico(s)</span>
        </div>
      )}
      <table className="colunas-table">
        <thead><tr><th>Coluna</th><th>Tipo</th><th>Únicos</th><th>Amostras</th></tr></thead>
        <tbody>{colunas.map((c, i) => (
          <tr key={i}>
            <td style={{ fontWeight: 600 }}>{c.nome}</td>
            <td>
              <select className="tipo-select" value={c.tipo} onChange={e => alterarTipo(c.nome, e.target.value)}
                style={{ color: c.tipo === 'numero' ? '#0369a1' : c.tipo === 'data' ? '#b45309' : c.tipo === 'hora' ? '#7c3aed' : '#64748b' }}>
                <option value="numero">Número</option><option value="texto">Texto</option><option value="data">Data</option><option value="hora">Hora</option><option value="desconhecido">?</option>
              </select>
            </td>
            <td style={{ color: '#94a3b8' }}>{c.valoresUnicos}</td>
            <td style={{ color: '#94a3b8', fontSize: '0.68rem' }}>{(c.amostras || []).slice(0, 3).join(', ') || '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      {dados.length > 0 && (
        <div className="previa-area">
          <h5>Primeiras {Math.min(dados.length, 5)} linhas</h5>
          <div className="previa-wrapper">
            <table className="previa-table">
              <thead><tr>{Object.keys(dados[0]).slice(0, 6).map(k => <th key={k}>{k}</th>)}</tr></thead>
              <tbody>{dados.slice(0, 5).map((r, i) => (
                <tr key={i}>{Object.keys(dados[0]).slice(0, 6).map(k => <td key={k} title={String(r[k] ?? '')}>{r[k] != null ? String(r[k]).substring(0, 18) : '—'}</td>)}</tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
      {/* execMetrics carregado para uso futuro / métricas rápidas na aba config */}
      {loadingExec && execMetrics === null && null}
    </div>
  );
});

export default ServicoDashboardTab;
