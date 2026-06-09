/* ============================================
   ConfigModal — Modal de configuração que USA KpiEditor
   Abre como overlay sobre o dashboard do serviço
   ============================================ */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import KpiEditor from '../KpiEditor/KpiEditor';
import type { KpiConfig, GraficoConfig, ColunaDetectada, ConstanteGlobal } from '../KpiEditor/KpiEditorTypes';

interface ConfigModalProps {
  contractId: string;
  servicoId: string;
  onClose: () => void;
  onSaved?: () => void;
  /** Dados já carregados pelo dashboard (opcional — evita refetch) */
  colunas?: ColunaDetectada[];
  colunasNum?: ColunaDetectada[];
  colunasTexto?: ColunaDetectada[];
  dadosBrutos?: any[];
  constantesGlobais?: Record<string, ConstanteGlobal>;
  initialKpis?: KpiConfig[];
  initialGraficos?: GraficoConfig[];
  contratoKpis?: any[];
  servicoNome?: string;
}

export default function ConfigModal({
  contractId, servicoId, onClose, onSaved,
  colunas: initialColunas, colunasNum: initialColunasNum, colunasTexto: initialColunasTexto,
  dadosBrutos: initialDadosBrutos, constantesGlobais: initialConstantesGlobais,
  initialKpis, initialGraficos, contratoKpis: initialContratoKpis,
  servicoNome: initialServicoNome,
}: ConfigModalProps) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [carregando, setCarregando] = useState(false);
  const [servicoNome, setServicoNome] = useState(initialServicoNome || 'Serviço');
  const [colunas, setColunas] = useState<ColunaDetectada[]>(initialColunas || []);
  const [colunasNum, setColunasNum] = useState<ColunaDetectada[]>(initialColunasNum || []);
  const [colunasTexto, setColunasTexto] = useState<ColunaDetectada[]>(initialColunasTexto || []);
  const [dadosBrutos, setDadosBrutos] = useState<any[]>(initialDadosBrutos || []);
  const [constantesGlobais, setConstantesGlobais] = useState<Record<string, ConstanteGlobal>>(initialConstantesGlobais || {});
  const [salvando, setSalvando] = useState(false);
  const [contratoKpis, setContratoKpis] = useState<any[]>(initialContratoKpis || []);

  const loadedRef = useRef(false);

  // Só carrega dados se não foram passados via props
  const carregarDados = useCallback(async () => {
    if (loadedRef.current) return;
    if (initialColunas?.length && initialDadosBrutos?.length) {
      loadedRef.current = true;
      return;
    }
    setCarregando(true);
    try {
      const [resPadrao, resBrutos] = await Promise.all([
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/padrao', {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/dados-brutos?limite=2000', {
          headers: { Authorization: 'Bearer ' + token },
        }),
      ]);

      if (resPadrao.ok) {
        const data = await resPadrao.json();
        if (!initialServicoNome) setServicoNome(data.servico?.nome || 'Serviço');
        const cols = data.servico?.padraoPlanilha?.colunas || [];
        setColunas(cols);
        setColunasNum(cols.filter((c: ColunaDetectada) => c.tipo === 'numero'));
        setColunasTexto(cols.filter((c: ColunaDetectada) => c.tipo === 'texto' || c.tipo === 'desconhecido'));
        if (data.contratoKpis?.length) setContratoKpis(data.contratoKpis);
        if (data.valoresCaminhao) {
          const globs: Record<string, ConstanteGlobal> = {};
          for (const [k, v] of Object.entries(data.valoresCaminhao)) {
            if (v !== null && v !== undefined) globs[k] = { valor: Number(v), label: k };
          }
          setConstantesGlobais(globs);
        }
      }
      if (resBrutos.ok) {
        setDadosBrutos((await resBrutos.json()).dados || []);
      }
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
      loadedRef.current = true;
    }
  }, [contractId, servicoId, token, adicionarToast, initialServicoNome, initialColunas, initialDadosBrutos]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const handleSave = async (newKpis: KpiConfig[], newGraficos: GraficoConfig[]) => {
    setSalvando(true);
    try {
      const configDashboard = {
        kpis: newKpis.filter(k => k.ativo).map(k => ({
          ...k,
          colunasUsadas: k.expressao ? extrairColunasDaExpressao(k.expressao) : k.colunasUsadas || [],
        })),
        graficos: newGraficos.filter(g => g.ativo),
      };
      const r = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/config-dashboard', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configDashboard }),
      });
      if (r.ok) {
        adicionarToast('Indicadores salvos com sucesso!', 'success');
        onSaved?.();
        onClose();
      } else {
        adicionarToast('Erro ao salvar', 'error');
      }
    } catch {
      adicionarToast('Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '12px',
          width: '100%', maxWidth: '980px', height: '92vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 16px 48px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header do modal */}
        <div style={{
          padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              Configurar Indicadores
            </h3>
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.78rem', color: '#64748b' }}>
              {servicoNome}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: '#94a3b8', cursor: 'pointer', padding: '0.25rem' }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Conteúdo do modal */}
        {carregando ? (
          <div style={{ flex: 1, padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
            Carregando...
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto' }}>
            <KpiEditor
              mode="modal"
              contractId={contractId}
              servicoId={servicoId}
              token={token!}
              servicoNome={servicoNome}
              colunas={colunas}
              colunasNum={colunasNum}
              colunasTexto={colunasTexto}
              dadosBrutos={dadosBrutos}
              constantesGlobais={constantesGlobais}
              contratoKpis={contratoKpis}
              initialKpis={initialKpis}
              initialGraficos={initialGraficos}
              onSave={handleSave}
              onBack={onClose}
              salvando={salvando}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function extrairColunasDaExpressao(expressao: string): string[] {
  const colunas: string[] = [];
  const funcRegex = /(?:SUM|AVG|MIN|MAX|COUNT(?:\s+DISTINCT)?)\s*\(\s*([^)]+)\s*\)/gi;
  let match;
  while ((match = funcRegex.exec(expressao)) !== null) {
    const params = match[1].trim();
    if (params !== '*' && !colunas.includes(params)) colunas.push(params);
  }
  return colunas;
}
