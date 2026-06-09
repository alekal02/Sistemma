/* ============================================
   ContratoDetalhe — Reformulação Completa
   ═══════════════════════════════════════════════════
   Fluxo intuitivo de adição de dados:
   • Cabeçalho unificado (sem abas)
   • Valores de receita definidos no cadastro do serviço
   • Tela de boas-vindas para contratos vazios
   • Cards de serviço simplificados com barra de progresso
   • Criação em 1 etapa (modal rápido)
   • Exclusão com detalhes específicos
   ═══════════════════════════════════════════════════
   URL: /contratos/:id
   ============================================ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiAlertCircle, FiChevronDown, FiChevronRight, FiCheck,
  FiDatabase, FiBarChart2, FiRefreshCw,
  FiClock, FiSettings,
  FiUpload, FiInfo, FiDollarSign,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import ServicoMiniFlow from '../components/ServicoMiniFlow';
import type { EtapasStatus } from '../components/ServicoMiniFlow';
import { TIPOS_SERVICO, TIPOS_SERVICO_LABELS, TIPOS_SERVICO_OPCOES, TIPOS_SERVICO_META } from '../types';
import type { TipoServico } from '../types';
import '../styles/FluxoUnificado.css';
import '../styles/ContratoDetalhe.css';

/* ═══ Interfaces ═══ */
interface Servico {
  id: string;
  contract_id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  criadoEm: string;
}

interface Contrato {
  id: string;
  numeroContrato: string;
  status: 'ativo' | 'encerrado';
  valorTonelada?: number | null;
  valorMini?: number | null;
  valorTruck?: number | null;
  valorToco?: number | null;
  configResumo?: any | null;
}

interface PlanilhaItem {
  id: number;
  nomeArquivo: string;
  totalLinhas: number;
  linhasImportadas: number;
  criadoEm: string;
}

interface ServicoComStatus extends Servico {
  etapasStatus?: EtapasStatus;
  planilhas?: PlanilhaItem[];
  totalRegistros?: number;
  ultimoUpload?: string;
}

type TipoValor = 'caminhao' | 'km_linear' | 'm2' | 'por_arvore' | 'por_equipe';

const TIPO_VALOR_POR_SERVICO: Record<string, TipoValor> = {
  coleta_caminhao: 'caminhao',
  remocao: 'por_equipe',
  varricao: 'km_linear',
  rocadeira: 'm2',
  poda: 'por_arvore',
  pintura_meio_fio: 'km_linear',
  geral: 'caminhao',
};

const TIPO_VALOR_LABELS: Record<TipoValor, string> = {
  caminhao: 'Por Tipo de Caminhão',
  km_linear: 'KM Linear',
  m2: 'Metro Quadrado (m²)',
  por_arvore: 'Por Árvore',
  por_equipe: 'Por Equipe',
};

function tipoValorPadrao(tipoServico: string): TipoValor {
  return TIPO_VALOR_POR_SERVICO[tipoServico] || 'caminhao';
}

function opcoesTipoValorDisponiveis(tipoServico: string): TipoValor[] {
  if (tipoServico === TIPOS_SERVICO.REMOCAO) return ['por_equipe'];
  return ['caminhao', 'km_linear', 'm2', 'por_arvore'];
}

function buildConfigFaturamento(
  tipoValor: TipoValor,
  valores: {
    valorMini: string;
    valorTruck: string;
    valorToco: string;
    valorKmLinear: string;
    valorM2: string;
    valorPorArvore: string;
    valorPorEquipe: string;
  }
) {
  const parse = (v: string) => (v.trim() ? parseFloat(v) : null);
  const base = { ativo: true };

  if (tipoValor === 'caminhao') {
    return {
      ...base,
      tipoCobranca: 'tonelada_tipo_caminhao',
      valorMini: parse(valores.valorMini),
      valorTruck: parse(valores.valorTruck),
      valorToco: parse(valores.valorToco),
    };
  }
  if (tipoValor === 'km_linear') {
    return { ...base, tipoCobranca: 'km_linear', valorKmLinear: parse(valores.valorKmLinear) };
  }
  if (tipoValor === 'm2') {
    return { ...base, tipoCobranca: 'm2', valorM2: parse(valores.valorM2) };
  }
  if (tipoValor === 'por_equipe') {
    return { ...base, tipoCobranca: 'por_equipe', valorPorEquipe: parse(valores.valorPorEquipe) };
  }
  return { ...base, tipoCobranca: 'por_arvore', valorPorArvore: parse(valores.valorPorArvore) };
}

export default function ContratoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [servicos, setServicos] = useState<ServicoComStatus[]>([]);
  const [carregando, setCarregando] = useState(true);

  // ─── Valores (modal de criação) ───
  const [tipoValor, setTipoValor] = useState<TipoValor>('caminhao');
  const [valorMini, setValorMini] = useState('');
  const [valorTruck, setValorTruck] = useState('');
  const [valorToco, setValorToco] = useState('');
  const [valorKmLinear, setValorKmLinear] = useState('');
  const [valorM2, setValorM2] = useState('');
  const [valorPorArvore, setValorPorArvore] = useState('');
  const [valorPorEquipe, setValorPorEquipe] = useState('');

  // ─── Serviço ───
  const [servicoExpandidoId, setServicoExpandidoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [servicoExclusaoInfo, setServicoExclusaoInfo] = useState<any>(null);

  // ═══ CRIAÇÃO — Modal rápido ═══
  const [modalCriacaoAberto, setModalCriacaoAberto] = useState(false);
  const [nomeServico, setNomeServico] = useState('');
  const [tiposSelecionados, setTiposSelecionados] = useState<string[]>([TIPOS_SERVICO.COLETA_CAMINHAO]);
  const [salvandoServico, setSalvandoServico] = useState(false);

  const { setBreadcrumbs } = useBreadcrumbs();

  /* ═══ Carregar dados ═══ */
  const carregarDados = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const [resContrato, resServicos] = await Promise.all([
        fetch(`/api/contracts/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/contracts/${id}/servicos`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (resContrato.ok) {
        const c = await resContrato.json();
        setContrato(c);
      }

      if (resServicos.ok) {
        const data = await resServicos.json();
        const lista = data.servicos || [];

        const resultados = await Promise.allSettled(
          lista.map(async (s: Servico) => {
            try {
              const res = await fetch(`/api/contracts/${id}/servicos/${s.id}/padrao`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) {
                return {
                  ...s,
                  etapasStatus: { upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending' } satisfies EtapasStatus,
                  planilhas: [],
                  totalRegistros: 0,
                  ultimoUpload: null,
                };
              }
              const padrao = await res.json();
              const cols = padrao.servico?.padraoPlanilha?.colunas || [];
              const uploads = padrao.uploads?.ultimos || [];
              const config = padrao.servico?.configDashboard;

              return {
                ...s,
                planilhas: uploads,
                totalRegistros: padrao.uploads?.totalImportados || 0,
                ultimoUpload: uploads[0]?.criadoEm || null,
                etapasStatus: {
                  upload: cols.length > 0 ? 'done' : 'pending',
                  indicadoresAuto: config?.indicadoresAutomaticosConfirmados === true ? 'done' : 'pending',
                  revisao: cols.length > 0 ? 'done' : 'pending',
                  config: (config?.kpis?.length > 0) ? 'done' : 'pending',
                } satisfies EtapasStatus,
              };
            } catch {
              return {
                ...s,
                etapasStatus: { upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending' } satisfies EtapasStatus,
                planilhas: [],
                totalRegistros: 0,
                ultimoUpload: null,
              };
            }
          })
        );

        setServicos(
          resultados.map(r => (r.status === 'fulfilled' ? r.value : {
            ...(r.reason as any),
            etapasStatus: { upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending' },
            planilhas: [],
            totalRegistros: 0,
            ultimoUpload: null,
          }))
        );
      }
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
    }
  }, [id, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [id]);

  useEffect(() => {
    if (!modalCriacaoAberto) return;
    const tipoPrincipal = tiposSelecionados[0] || TIPOS_SERVICO.COLETA_CAMINHAO;
    const opcoes = opcoesTipoValorDisponiveis(tipoPrincipal);
    if (!opcoes.includes(tipoValor)) {
      setTipoValor(opcoes[0]);
    }
  }, [tiposSelecionados, modalCriacaoAberto, tipoValor]);

  /* ═══ Breadcrumbs ═══ */
  useEffect(() => {
    if (!contrato) return;
    setBreadcrumbs([
      { label: 'Visão Geral', href: '/visao-geral' },
      { label: 'Contratos', href: '/contratos' },
      { label: contrato.numeroContrato || 'Contrato' },
    ]);
  }, [contrato?.numeroContrato, setBreadcrumbs]);

  /* ═══ Estatísticas agregadas ═══ */
  const totalServicos = servicos.length;
  const totalRegistros = servicos.reduce((acc, s) => acc + (s.totalRegistros || 0), 0);
  const totalPlanilhas = servicos.reduce((acc, s) => acc + (s.planilhas?.length || 0), 0);
  const ultimoUploadGeral = servicos
    .map(s => s.ultimoUpload)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] || null;

  const servicosUploadPendente = servicos.filter(s => !s.totalRegistros || s.totalRegistros === 0).length;
  const servicosSemKpi = servicos.filter(s => s.etapasStatus?.config !== 'done').length;
  const servicosDesatualizados = servicos.filter(s => {
    if (!s.ultimoUpload) return true;
    return Date.now() - new Date(s.ultimoUpload).getTime() > 7 * 24 * 60 * 60 * 1000;
  }).length;

  const temAlertas = servicosUploadPendente > 0 || servicosSemKpi > 0 || servicosDesatualizados > 0;

  const resetValoresModal = (tipoServico: string) => {
    setTipoValor(tipoValorPadrao(tipoServico));
    setValorMini('');
    setValorTruck('');
    setValorToco('');
    setValorKmLinear('');
    setValorM2('');
    setValorPorArvore('');
    setValorPorEquipe('');
  };

  /* ═══ CRIAÇÃO — Modal rápido ═══ */
  const abrirModalCriacao = () => {
    setNomeServico('');
    setTiposSelecionados([TIPOS_SERVICO.COLETA_CAMINHAO]);
    resetValoresModal(TIPOS_SERVICO.COLETA_CAMINHAO);
    setModalCriacaoAberto(true);
  };

  const fecharModalCriacao = () => {
    setModalCriacaoAberto(false);
    setNomeServico('');
    setTiposSelecionados([TIPOS_SERVICO.COLETA_CAMINHAO]);
    resetValoresModal(TIPOS_SERVICO.COLETA_CAMINHAO);
  };

  const toggleTipoCriacao = (tipo: string) => {
    setTiposSelecionados(prev => {
      let novos: string[];
      if (prev.includes(tipo)) {
        novos = prev.filter(t => t !== tipo);
        if (novos.length === 0) novos = [tipo];
      } else {
        novos = [...prev, tipo];
      }
      setTipoValor(tipoValorPadrao(novos[0]));
      return novos;
    });
  };

  const criarServico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeServico.trim()) {
      adicionarToast('Digite um nome para o serviço', 'warning');
      return;
    }

    const tiposStr = tiposSelecionados.join(',');
    const configFaturamento = buildConfigFaturamento(tipoValor, {
      valorMini, valorTruck, valorToco, valorKmLinear, valorM2, valorPorArvore, valorPorEquipe,
    });

    const temValor =
      tipoValor === 'caminhao'
        ? [valorMini, valorTruck, valorToco].some(v => v.trim())
        : tipoValor === 'km_linear'
          ? valorKmLinear.trim()
          : tipoValor === 'm2'
            ? valorM2.trim()
            : tipoValor === 'por_equipe'
              ? valorPorEquipe.trim()
              : valorPorArvore.trim();

    if (!temValor) {
      adicionarToast('Informe pelo menos um valor de receita para o serviço', 'warning');
      return;
    }

    setSalvandoServico(true);

    try {
      const res = await fetch(`/api/contracts/${id}/servicos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeServico.trim(),
          tipo: tiposStr,
          configFaturamento,
        }),
      });

      if (!res.ok) {
        adicionarToast('Erro ao criar serviço', 'error');
        return;
      }

      adicionarToast('Serviço criado!', 'success');
      fecharModalCriacao();
      setSalvandoServico(false);
      await carregarDados();

    } catch {
      adicionarToast('Erro ao criar serviço', 'error');
      setSalvandoServico(false);
    }
  };

  /* ═══ Excluir serviço ═══ */
  const prepararExclusao = async (servico: ServicoComStatus) => {
    setExcluindoId(servico.id);
    setServicoExclusaoInfo({
      nome: servico.nome,
      qtdPlanilhas: servico.planilhas?.length || 0,
      qtdRegistros: servico.totalRegistros || 0,
      qtdKpis: servico.etapasStatus?.config === 'done' ? 'Sim' : 'Nenhum',
    });
  };

  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('');

  const excluirServico = async () => {
    if (!excluindoId) return;
    if (confirmacaoExclusao !== servicoExclusaoInfo?.nome) {
      adicionarToast('Digite o nome do serviço para confirmar', 'warning');
      return;
    }
    try {
      const res = await fetch(`/api/contracts/${id}/servicos/${excluindoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        adicionarToast('Serviço excluído!', 'success');
        if (servicoExpandidoId === excluindoId) setServicoExpandidoId(null);
        setExcluindoId(null);
        setServicoExclusaoInfo(null);
        setConfirmacaoExclusao('');
        await carregarDados();
      } else adicionarToast('Erro ao excluir', 'error');
    } catch { adicionarToast('Erro ao excluir', 'error'); }
  };

  /* ═══ Status change handler ═══ */
  const handleStatusChange = useCallback((servicoId: string, status: EtapasStatus) => {
    setServicos(prev => prev.map(s => s.id === servicoId ? { ...s, etapasStatus: status } : s));
  }, []);

  /* ═══ Render: Carregando ═══ */
  if (carregando) {
    return (
      <div className="fluxo-unificado">
        <div className="skeleton-flow">
          <div className="skeleton" style={{ height: 90, marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 60, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 60, marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 60 }} />
        </div>
      </div>
    );
  }

  if (!contrato) {
    return (
      <div className="fluxo-unificado">
        <div className="empty-state">
          <FiAlertCircle size={32} style={{ opacity: 0.3 }} />
          <p>Contrato não encontrado.</p>
        </div>
      </div>
    );
  }

  /* ═══ Render principal ═══ */
  return (
    <div className="fluxo-unificado">
      {/* ══ CABEÇALHO DO CONTRATO ══ */}
      <div className="topo-contrato" style={{ marginBottom: '0.5rem' }}>
        <div className="topo-info">
          <button className="btn-link" onClick={() => navigate('/contratos')}>
            <FiArrowLeft size={14} /> Contratos
          </button>
          <h1>{contrato.numeroContrato}</h1>
          <span className={'status-badge ' + contrato.status}>{contrato.status}</span>
          <button className="btn btn-sm btn-ghost" onClick={carregarDados} title="Recarregar">
            <FiRefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* ══ Resumo compacto ══ */}
      <div style={{
        display: 'flex', gap: '0.5rem', marginBottom: '0.75rem',
        flexWrap: 'wrap', alignItems: 'stretch',
      }}>
        <div style={{
          flex: 1, minWidth: 120, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #6366f1', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.05rem' }}>
            <FiDatabase size={10} style={{ marginRight: '0.2rem' }} /> Serviços
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{totalServicos}</div>
        </div>
        <div style={{
          flex: 1, minWidth: 120, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #14b8a6', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.05rem' }}>
            <FiDatabase size={10} style={{ marginRight: '0.2rem' }} /> Registros
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>
            {totalRegistros.toLocaleString('pt-BR')}
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: 120, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #f59e0b', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.05rem' }}>
            <FiClock size={10} style={{ marginRight: '0.2rem' }} /> Último Upload
          </div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
            {ultimoUploadGeral
              ? new Date(ultimoUploadGeral).toLocaleDateString('pt-BR')
              : '—'}
          </div>
        </div>
        <div style={{
          flex: 1, minWidth: 80, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #a855f7', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.05rem' }}>
            <FiUpload size={10} style={{ marginRight: '0.2rem' }} /> Planilhas
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0f172a' }}>{totalPlanilhas}</div>
        </div>
      </div>

      {/* ══ Alertas ══ */}
      {temAlertas && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {servicosUploadPendente > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.7rem', borderRadius: '6px',
              background: '#fef2f2', border: '1px solid #fecaca',
              fontSize: '0.72rem', color: '#991b1b', fontWeight: 500,
            }}>
              <FiAlertCircle size={13} style={{ color: '#ef4444', flexShrink: 0 }} />
              {servicosUploadPendente} serviço(s) sem upload de planilha
            </div>
          )}
          {servicosSemKpi > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.7rem', borderRadius: '6px',
              background: '#eef2ff', border: '1px solid #c7d2fe',
              fontSize: '0.72rem', color: '#3730a3', fontWeight: 500,
            }}>
              <FiSettings size={13} style={{ color: '#6366f1', flexShrink: 0 }} />
              {servicosSemKpi} serviço(s) sem indicadores configurados
            </div>
          )}
          {servicosDesatualizados > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              padding: '0.4rem 0.7rem', borderRadius: '6px',
              background: '#fefce8', border: '1px solid #fde68a',
              fontSize: '0.72rem', color: '#92400e', fontWeight: 500,
            }}>
              <FiClock size={13} style={{ color: '#f59e0b', flexShrink: 0 }} />
              {servicosDesatualizados} serviço(s) desatualizado(s) — sem upload há mais de 7 dias
            </div>
          )}
        </div>
      )}

      {/* ══ CORPO DA PÁGINA ══ */}

      {totalServicos === 0 ? (
        <div className="welcome-section">
          <div className="welcome-icon">
            <FiBarChart2 size={32} />
          </div>
          <h2>Comece aqui</h2>
          <p>
            Crie seu primeiro serviço para começar a gerenciar os dados deste contrato.
          </p>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Um serviço representa uma atividade operacional — como coleta com caminhão,
            roçadeira ou poda — onde você fará upload de planilhas, configurará KPIs e
            visualizará dashboards.
          </p>
          <div className="welcome-actions">
            <button className="btn-welcome" onClick={abrirModalCriacao}>
              <FiPlus size={18} /> Criar Primeiro Serviço
            </button>
          </div>
        </div>
      ) : (
        <div className="servicos-bloco">
          <div className="servicos-topo">
            <div className="servicos-topo-left">
              <h2>Serviços</h2>
              <span className="servicos-count">{totalServicos}</span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={abrirModalCriacao} style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.4rem 0.85rem', fontSize: '0.78rem', fontWeight: 600,
              background: 'linear-gradient(135deg, #6366f1, #818cf8)',
              border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer',
              boxShadow: '0 2px 6px rgba(99,102,241,0.25)',
            }}>
              <FiPlus size={14} /> Novo Serviço
            </button>
          </div>

          {servicos.map(servico => {
            const etapas = servico.etapasStatus || { upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending' };
            const expandido = servicoExpandidoId === servico.id;
            const temUpload = (servico.totalRegistros || 0) > 0;
            const temKpi = etapas.config === 'done';
            const desatualizado = servico.ultimoUpload
              ? Date.now() - new Date(servico.ultimoUpload).getTime() > 7 * 24 * 60 * 60 * 1000
              : true;

            let classeCard = 'servico-card';
            if (!temUpload) classeCard += ' error';
            else if (!temKpi || desatualizado) classeCard += ' attention';
            else classeCard += ' complete';
            if (expandido) classeCard += ' expanded';

            const etapasList = [
              { key: 'criado', label: 'Criado', done: true },
              { key: 'upload', label: 'Upload Feito', done: etapas.upload === 'done' },
              { key: 'kpis', label: 'KPIs Configurados', done: etapas.config === 'done' },
              { key: 'dashboard', label: 'Dashboard Pronto', done: etapas.config === 'done' && etapas.upload === 'done' },
            ];

            return (
              <div key={servico.id} className={classeCard}>
                <div
                  className="servico-card-header"
                  onClick={() => setServicoExpandidoId(expandido ? null : servico.id)}
                >
                  <div className="servico-progresso">
                    {etapasList.map((etp, idx) => (
                      <div key={etp.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div
                          className={'ponto ' + (etp.done ? 'done' : 'pending')}
                          data-tooltip={etp.label}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!etp.done) {
                              if (etp.key === 'upload') {
                                setServicoExpandidoId(servico.id);
                              } else if (etp.key === 'kpis') {
                                navigate(`/contratos/${id}/servicos/${servico.id}/configurar`);
                              } else if (etp.key === 'dashboard') {
                                navigate(`/contratos/${id}/servicos/${servico.id}/dashboard`);
                              }
                            } else {
                              if (etp.key === 'dashboard') {
                                navigate(`/contratos/${id}/servicos/${servico.id}/dashboard`);
                              } else if (etp.key === 'upload') {
                                setServicoExpandidoId(servico.id);
                              }
                            }
                          }}
                          title={etp.label}
                        />
                        {idx < etapasList.length - 1 && (
                          <div className={'linha ' + (etp.done ? 'done' : '')} />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="servico-info">
                    <div className="servico-info-nome">
                      <strong>{servico.nome}</strong>
                      {!temUpload && (
                        <span className="badge-status upload-pendente">Sem upload</span>
                      )}
                      {temUpload && (
                        <span className="badge-status upload-feito">{servico.totalRegistros?.toLocaleString('pt-BR')} registros</span>
                      )}
                    </div>
                    <div className="servico-info-badges">
                      {servico.tipo && servico.tipo !== 'geral' && (
                        servico.tipo.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                          <span key={t} className="badge-tipo">
                            {(TIPOS_SERVICO_LABELS as any)[t] || t}
                          </span>
                        ))
                      )}
                      {servico.ultimoUpload && (
                        <span style={{
                          fontSize: '0.6rem', color: desatualizado ? '#dc2626' : '#64748b',
                          display: 'flex', alignItems: 'center', gap: '0.15rem',
                        }}>
                          <FiClock size={9} />
                          {new Date(servico.ultimoUpload).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {temKpi && (
                        <span style={{
                          fontSize: '0.6rem', fontWeight: 600,
                          padding: '0.05rem 0.3rem', borderRadius: '3px',
                          background: '#f0fdf4', color: '#15803d',
                        }}>
                          <FiCheck size={9} style={{ marginRight: '0.15rem' }} />
                          KPIs OK
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="servico-acoes">
                    {!temUpload ? (
                      <button
                        className="btn-servico-acao primaria sem-dados"
                        onClick={(e) => {
                          e.stopPropagation();
                          setServicoExpandidoId(servico.id);
                        }}
                        title="Fazer Upload"
                      >
                        <FiUpload size={12} /> Upload
                      </button>
                    ) : (
                      <button
                        className="btn-servico-acao primaria"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/contratos/${id}/servicos/${servico.id}/dashboard`);
                        }}
                        title="Ver Dashboard"
                      >
                        <FiBarChart2 size={12} /> Dashboard
                      </button>
                    )}
                    <button
                      className="btn-servico-acao config"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/contratos/${id}/servicos/${servico.id}/configurar`);
                      }}
                      title="Configurar"
                    >
                      <FiSettings size={12} />
                    </button>
                    <button
                      className="btn-servico-acao danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        prepararExclusao(servico);
                      }}
                      title="Excluir"
                    >
                      <FiTrash2 size={12} />
                    </button>
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', marginLeft: '0.15rem' }}>
                      {expandido ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
                    </span>
                  </div>
                </div>

                {expandido && (
                  <div className="servico-expandido">
                    <ServicoMiniFlow
                      contractId={id!}
                      servicoId={servico.id}
                      servicoNome={servico.nome}
                      onStatusChange={(status) => handleStatusChange(servico.id, status)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ══ MODAL CRIAÇÃO ══ */}
      {modalCriacaoAberto && (
        <div className="modal-overlay" onClick={fecharModalCriacao}>
          <div className="modal-card modal-criacao-rapida" onClick={e => e.stopPropagation()}>
            <h3>
              <FiPlus size={16} style={{ color: '#6366f1' }} />
              Novo Serviço
            </h3>
            <form onSubmit={criarServico}>
              <div className="form-group">
                <label>Nome do serviço</label>
                <input
                  type="text"
                  value={nomeServico}
                  onChange={e => setNomeServico(e.target.value)}
                  placeholder="Ex: Coleta Regional Norte"
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label>Tipo de serviço</label>
                <div className="criacao-tipos-grid">
                  {TIPOS_SERVICO_OPCOES.map(op => {
                    const ativo = tiposSelecionados.includes(op.value);
                    return (
                      <div
                        key={op.value}
                        className={'criacao-tipo-card' + (ativo ? ' selecionado' : '')}
                        onClick={() => toggleTipoCriacao(op.value)}
                      >
                        <div className="check">
                          {ativo && <FiCheck size={10} />}
                        </div>
                        <span>{op.label}</span>
                      </div>
                    );
                  })}
                </div>
                {tiposSelecionados.length > 0 && TIPOS_SERVICO_META[tiposSelecionados[0] as TipoServico] && (
                  <div style={{
                    marginTop: '0.4rem', padding: '0.5rem 0.6rem',
                    background: '#f8fafc', borderRadius: '6px',
                    border: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#475569',
                  }}>
                    {TIPOS_SERVICO_META[tiposSelecionados[0] as TipoServico].descricao}
                  </div>
                )}
              </div>

              <div className="form-group modal-valores-servico">
                <label>
                  <FiDollarSign size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
                  Tipo de Valor
                </label>
                {(() => {
                  const tipoPrincipal = tiposSelecionados[0] || TIPOS_SERVICO.COLETA_CAMINHAO;
                  const opcoes = opcoesTipoValorDisponiveis(tipoPrincipal);
                  if (opcoes.length === 1) {
                    return (
                      <div className="modal-valor-fixo">
                        {TIPO_VALOR_LABELS[opcoes[0]]}
                      </div>
                    );
                  }
                  return (
                    <select
                      className="modal-valor-select"
                      value={tipoValor}
                      onChange={e => setTipoValor(e.target.value as TipoValor)}
                    >
                      {opcoes.map(op => (
                        <option key={op} value={op}>{TIPO_VALOR_LABELS[op]}</option>
                      ))}
                    </select>
                  );
                })()}

                {tipoValor === 'caminhao' && (
                  <div className="valores-form-linha modal-valores-form">
                    {[
                      { key: 'MINI', val: valorMini, set: setValorMini, cor: '#22c55e' },
                      { key: 'TRUCK', val: valorTruck, set: setValorTruck, cor: '#f59e0b' },
                      { key: 'TOCO', val: valorToco, set: setValorToco, cor: '#a855f7' },
                    ].map(item => (
                      <div key={item.key} className="valor-input-group">
                        <label style={{ color: item.cor }}>{item.key}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.val}
                          onChange={e => item.set(e.target.value)}
                          placeholder="0,00"
                        />
                      </div>
                    ))}
                    <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.35rem 0 0', lineHeight: 1.4, flexBasis: '100%' }}>
                      Cada viagem usará o valor do tipo correspondente (Mini, Truck ou Toco) conforme a coluna da planilha.
                    </p>
                  </div>
                )}

                {tipoValor === 'km_linear' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#0ea5e9' }}>Valor por KM (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorKmLinear}
                        onChange={e => setValorKmLinear(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                )}

                {tipoValor === 'm2' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#f97316' }}>Valor por m² (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorM2}
                        onChange={e => setValorM2(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                )}

                {tipoValor === 'por_arvore' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#22d3ee' }}>Valor por Árvore (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorPorArvore}
                        onChange={e => setValorPorArvore(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                )}

                {tipoValor === 'por_equipe' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#ef4444' }}>Valor por Equipe (R$)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={valorPorEquipe}
                        onChange={e => setValorPorEquipe(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions" style={{ marginTop: '1rem' }}>
                <button type="submit" className="btn btn-primary" disabled={salvandoServico} style={{
                  flex: 1, justifyContent: 'center', padding: '0.5rem',
                  background: 'linear-gradient(135deg, #6366f1, #818cf8)',
                  fontSize: '0.85rem',
                }}>
                  {salvandoServico ? 'Criando...' : 'Criar Serviço'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={fecharModalCriacao}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL EXCLUSÃO ═══ */}
      {excluindoId && servicoExclusaoInfo && (
        <div className="modal-overlay" onClick={() => { setExcluindoId(null); setServicoExclusaoInfo(null); setConfirmacaoExclusao(''); }}>
          <div className="modal-card modal-exclusao-detalhada" onClick={e => e.stopPropagation()}>
            <div className="exclusao-header">
              <div className="exclusao-icon">
                <FiTrash2 size={24} />
              </div>
              <h3>Excluir serviço?</h3>
              <p className="exclusao-sub">
                Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="exclusao-detalhes">
              <div className="exclusao-detalhe-item">
                <span className="label"><FiInfo size={13} /> Serviço</span>
                <span className="value">{servicoExclusaoInfo.nome}</span>
              </div>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiUpload size={13} /> Planilhas vinculadas</span>
                <span className="value">{servicoExclusaoInfo.qtdPlanilhas}</span>
              </div>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiDatabase size={13} /> Registros importados</span>
                <span className="value">{servicoExclusaoInfo.qtdRegistros.toLocaleString('pt-BR')}</span>
              </div>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiBarChart2 size={13} /> KPIs configurados</span>
                <span className="value">{servicoExclusaoInfo.qtdKpis}</span>
              </div>
            </div>

            <div className="exclusao-confirmacao">
              Digite <strong>{servicoExclusaoInfo.nome}</strong> para confirmar a exclusão
            </div>
            <input
              className={'exclusao-input' + (confirmacaoExclusao === servicoExclusaoInfo.nome ? ' correto' : '')}
              type="text"
              value={confirmacaoExclusao}
              onChange={e => setConfirmacaoExclusao(e.target.value)}
              placeholder="Digite o nome do serviço"
              autoFocus
            />

            <div className="modal-actions" style={{ marginTop: '0.75rem' }}>
              <button className="btn btn-danger" onClick={excluirServico} disabled={confirmacaoExclusao !== servicoExclusaoInfo.nome} style={{ flex: 1, justifyContent: 'center' }}>
                <FiTrash2 size={14} /> Excluir Serviço
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setExcluindoId(null); setServicoExclusaoInfo(null); setConfirmacaoExclusao(''); }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
