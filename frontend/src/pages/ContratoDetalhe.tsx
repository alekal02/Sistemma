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
  FiUpload, FiInfo, FiDollarSign, FiTruck, FiUsers,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import ServicoMiniFlow from '../components/ServicoMiniFlow';
import type { EtapasStatus } from '../components/ServicoMiniFlow';
import { TIPOS_SERVICO, TIPOS_SERVICO_LABELS, TIPOS_SERVICO_OPCOES, TIPOS_SERVICO_META } from '../types';
import type { TipoServico } from '../types';
import contractService from '../services/contractService';
import servicoService from '../services/servicoService';
import {
  extrairPlacasReservaContrato,
  parsePlacasReservaTexto,
  placasReservaParaTexto,
} from '../utils/placasReserva';
import {
  extrairCadastroOperacionalContrato,
  listaParaTexto,
  parseListaNomesTexto,
  parseListaPlacasTexto,
} from '../utils/configOperacional';
import {
  TIPOS_LIMITE_CAMINHAO,
  LABEL_TIPO_CAMINHAO,
  PESO_MAX_KG_PADRAO,
  VOLUME_L_PADRAO,
  mapaLimitesParaForm,
  formLimitesParaMapa,
  type TipoLimiteCaminhao,
} from '../utils/limitesCaminhaoContrato';
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
  diaInicioCiclo?: number;
  valorTonelada?: number | null;
  valorMini?: number | null;
  valorTruck?: number | null;
  valorToco?: number | null;
  valorBasculante?: number | null;
  configResumo?: any | null;
  configOperacional?: {
    placasReserva?: string[];
    placasAtivas?: string[];
    motoristas?: string[];
    coletores?: string[];
    pesoMaximoKg?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
    volumeL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
  } | null;
}

interface PlanilhaItem {
  id: number;
  nomeArquivo: string;
  totalLinhas: number;
  linhasImportadas: number;
  criadoEm: string;
}

function normalizarPlanilhasContrato(raw: unknown[] | undefined): PlanilhaItem[] {
  return (raw || [])
    .map((item) => {
      const u = item as Record<string, unknown>;
      const id = Number(u.id);
      return {
        id,
        nomeArquivo: String(u.nomeArquivo ?? u.nome ?? ''),
        totalLinhas: Number(u.totalLinhas ?? u.linhas ?? 0),
        linhasImportadas: Number(u.linhasImportadas ?? u.importados ?? 0),
        criadoEm: String(u.criadoEm ?? ''),
      };
    })
    .filter(u => Number.isFinite(u.id) && u.id > 0);
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
  capina: 'km_linear',
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

/** Aceita 0,43 / 0.43 / 1.234,56 (pt-BR) */
function parseValorMonetario(v: string): number | null {
  const s = String(v ?? '').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (!s) return null;
  let n: number;
  if (s.includes(',') && s.includes('.')) {
    n = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? Number(s.replace(/\./g, '').replace(',', '.'))
      : Number(s.replace(/,/g, ''));
  } else if (s.includes(',')) {
    n = Number(s.replace(',', '.'));
  } else {
    n = Number(s);
  }
  return !Number.isNaN(n) && n >= 0 ? n : null;
}

function buildConfigFaturamento(
  tipoValor: TipoValor,
  valores: {
    valorMini: string;
    valorTruck: string;
    valorToco: string;
    valorBasculante: string;
    valorKmLinear: string;
    valorM2: string;
    valorM2Manual: string;
    valorM2Mecanizada: string;
    valorPorArvore: string;
    valorPorEquipe: string;
  },
  opts?: { dualM2?: boolean },
) {
  const parse = parseValorMonetario;
  const base = { ativo: true };

  if (tipoValor === 'caminhao') {
    return {
      ...base,
      tipoCobranca: 'tonelada_tipo_caminhao',
      valorMini: parse(valores.valorMini),
      valorTruck: parse(valores.valorTruck),
      valorToco: parse(valores.valorToco),
      valorBasculante: parse(valores.valorBasculante),
    };
  }
  if (tipoValor === 'km_linear') {
    return { ...base, tipoCobranca: 'km_linear', valorKmLinear: parse(valores.valorKmLinear) };
  }
  if (tipoValor === 'm2') {
    if (opts?.dualM2) {
      const valorM2Manual = parse(valores.valorM2Manual);
      const valorM2Mecanizada = parse(valores.valorM2Mecanizada);
      const valorM2 =
        valorM2Manual != null && valorM2Mecanizada != null && valorM2Manual === valorM2Mecanizada
          ? valorM2Manual
          : valorM2Mecanizada ?? valorM2Manual;
      return {
        ...base,
        tipoCobranca: 'm2',
        valorM2,
        valorM2Manual,
        valorM2Mecanizada,
      };
    }
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
  const [salvandoCiclo, setSalvandoCiclo] = useState(false);
  const [textoPlacasReserva, setTextoPlacasReserva] = useState('');
  const [salvandoPlacasReserva, setSalvandoPlacasReserva] = useState(false);
  const [textoPlacasAtivas, setTextoPlacasAtivas] = useState('');
  const [textoMotoristas, setTextoMotoristas] = useState('');
  const [textoColetores, setTextoColetores] = useState('');
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const [pesoMaxForm, setPesoMaxForm] = useState<Record<TipoLimiteCaminhao, string>>(
    () => mapaLimitesParaForm(null, PESO_MAX_KG_PADRAO),
  );
  const [volumeForm, setVolumeForm] = useState<Record<TipoLimiteCaminhao, string>>(
    () => mapaLimitesParaForm(null, VOLUME_L_PADRAO),
  );
  const [salvandoLimites, setSalvandoLimites] = useState(false);

  // ─── Valores (modal de criação) ───
  const [tipoValor, setTipoValor] = useState<TipoValor>('caminhao');
  const [valorMini, setValorMini] = useState('');
  const [valorTruck, setValorTruck] = useState('');
  const [valorToco, setValorToco] = useState('');
  const [valorBasculante, setValorBasculante] = useState('');
  const [valorKmLinear, setValorKmLinear] = useState('');
  const [valorM2, setValorM2] = useState('');
  const [valorM2Manual, setValorM2Manual] = useState('');
  const [valorM2Mecanizada, setValorM2Mecanizada] = useState('');
  const [valorPorArvore, setValorPorArvore] = useState('');
  const [valorPorEquipe, setValorPorEquipe] = useState('');

  // ─── Serviço ───
  const [servicoExpandidoId, setServicoExpandidoId] = useState<string | null>(null);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [servicoExclusaoInfo, setServicoExclusaoInfo] = useState<any>(null);

  // ═══ CRIAÇÃO — Modal rápido ═══
  const [modalCriacaoAberto, setModalCriacaoAberto] = useState(false);
  const [nomeServico, setNomeServico] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState<string>(TIPOS_SERVICO.COLETA_CAMINHAO);
  const [salvandoServico, setSalvandoServico] = useState(false);

  const { setBreadcrumbs } = useBreadcrumbs();

  /* ═══ Carregar dados ═══ */
  const carregarDados = useCallback(async () => {
    if (!id) return;
    setCarregando(true);
    try {
      const [contratoData, lista] = await Promise.all([
        contractService.buscar(id),
        servicoService.listarServicosContrato(id),
      ]);

      setContrato(contratoData);
      setTextoPlacasReserva(placasReservaParaTexto(extrairPlacasReservaContrato(contratoData)));
      const cadastro = extrairCadastroOperacionalContrato(contratoData);
      setTextoPlacasAtivas(listaParaTexto(cadastro.placasAtivas));
      setTextoMotoristas(listaParaTexto(cadastro.motoristas));
      setTextoColetores(listaParaTexto(cadastro.coletores));
      setPesoMaxForm(mapaLimitesParaForm(contratoData.configOperacional?.pesoMaximoKg, PESO_MAX_KG_PADRAO));
      setVolumeForm(mapaLimitesParaForm(contratoData.configOperacional?.volumeL, VOLUME_L_PADRAO));

      const resultados = await Promise.allSettled(
        lista.map(async (s: Servico) => {
          try {
            const padrao = await servicoService.getPadrao(id, s.id, { force: true });
              const cols = padrao.servico?.padraoPlanilha?.colunas || [];
              const uploads = normalizarPlanilhasContrato(padrao.uploads?.ultimos || []);
              const config = padrao.servico?.configDashboard;
              const totalRegistros = padrao.uploads?.registrosValidos
                ?? padrao.uploads?.totalImportados
                ?? 0;
              const temDadosUpload = totalRegistros > 0 || uploads.length > 0 || (padrao.uploads?.total || 0) > 0;

              return {
                ...s,
                planilhas: uploads,
                totalRegistros,
                ultimoUpload: uploads[0]?.criadoEm || null,
                etapasStatus: {
                  upload: temDadosUpload || cols.length > 0 ? 'done' : 'pending',
                  indicadoresAuto: config?.indicadoresAutomaticosConfirmados === true ? 'done' : 'pending',
                  revisao: temDadosUpload || cols.length > 0 ? 'done' : 'pending',
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
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
    }
  }, [id, token, adicionarToast]);

  const salvarDiaInicioCiclo = async (dia: number) => {
    if (!id || !contrato) return;
    setSalvandoCiclo(true);
    try {
      const atualizado = await contractService.atualizar(id, { diaInicioCiclo: dia });
      setContrato(atualizado);
      adicionarToast('Ciclo de medição atualizado', 'success');
    } catch {
      adicionarToast('Erro ao salvar ciclo de medição', 'error');
    } finally {
      setSalvandoCiclo(false);
    }
  };

  const salvarPlacasReserva = async () => {
    if (!id || !contrato) return;
    setSalvandoPlacasReserva(true);
    try {
      const placas = parsePlacasReservaTexto(textoPlacasReserva);
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          placasReserva: placas,
        },
      });
      setContrato(atualizado);
      setTextoPlacasReserva(placasReservaParaTexto(extrairPlacasReservaContrato(atualizado)));
      adicionarToast('Placas reserva atualizadas', 'success');
    } catch {
      adicionarToast('Erro ao salvar placas reserva', 'error');
    } finally {
      setSalvandoPlacasReserva(false);
    }
  };

  const salvarLimitesCaminhao = async () => {
    if (!id || !contrato) return;
    setSalvandoLimites(true);
    try {
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          pesoMaximoKg: formLimitesParaMapa(pesoMaxForm),
          volumeL: formLimitesParaMapa(volumeForm),
        },
      });
      setContrato(atualizado);
      setPesoMaxForm(mapaLimitesParaForm(atualizado.configOperacional?.pesoMaximoKg, PESO_MAX_KG_PADRAO));
      setVolumeForm(mapaLimitesParaForm(atualizado.configOperacional?.volumeL, VOLUME_L_PADRAO));
      adicionarToast('Limites de caminhão salvos no contrato', 'success');
    } catch {
      adicionarToast('Erro ao salvar limites de caminhão', 'error');
    } finally {
      setSalvandoLimites(false);
    }
  };

  const salvarCadastroOperacional = async () => {
    if (!id || !contrato) return;
    setSalvandoCadastro(true);
    try {
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          placasAtivas: parseListaPlacasTexto(textoPlacasAtivas),
          motoristas: parseListaNomesTexto(textoMotoristas),
          coletores: parseListaNomesTexto(textoColetores),
        },
      });
      setContrato(atualizado);
      const cadastro = extrairCadastroOperacionalContrato(atualizado);
      setTextoPlacasAtivas(listaParaTexto(cadastro.placasAtivas));
      setTextoMotoristas(listaParaTexto(cadastro.motoristas));
      setTextoColetores(listaParaTexto(cadastro.coletores));
      adicionarToast('Cadastro operacional salvo', 'success');
    } catch {
      adicionarToast('Erro ao salvar cadastro operacional', 'error');
    } finally {
      setSalvandoCadastro(false);
    }
  };

  useEffect(() => { carregarDados(); }, [id]);

  useEffect(() => {
    if (!modalCriacaoAberto) return;
    const opcoes = opcoesTipoValorDisponiveis(tipoSelecionado || TIPOS_SERVICO.COLETA_CAMINHAO);
    if (!opcoes.includes(tipoValor)) {
      setTipoValor(opcoes[0]);
    }
  }, [tipoSelecionado, modalCriacaoAberto, tipoValor]);

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
    setValorBasculante('');
    setValorKmLinear('');
    setValorM2('');
    setValorM2Manual('');
    setValorM2Mecanizada('');
    setValorPorArvore('');
    setValorPorEquipe('');
  };

  /* ═══ CRIAÇÃO — Modal rápido ═══ */
  const abrirModalCriacao = () => {
    setNomeServico('');
    setTipoSelecionado(TIPOS_SERVICO.COLETA_CAMINHAO);
    resetValoresModal(TIPOS_SERVICO.COLETA_CAMINHAO);
    setModalCriacaoAberto(true);
  };

  const fecharModalCriacao = () => {
    setModalCriacaoAberto(false);
    setNomeServico('');
    setTipoSelecionado(TIPOS_SERVICO.COLETA_CAMINHAO);
    resetValoresModal(TIPOS_SERVICO.COLETA_CAMINHAO);
  };

  const selecionarTipoCriacao = (tipo: string) => {
    setTipoSelecionado(tipo);
    setTipoValor(tipoValorPadrao(tipo));
  };

  const criarServico = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nomeServico.trim()) {
      adicionarToast('Digite um nome para o serviço', 'warning');
      return;
    }

    const tipo = tipoSelecionado || TIPOS_SERVICO.COLETA_CAMINHAO;
    const dualM2 = tipo === TIPOS_SERVICO.ROCADEIRA && tipoValor === 'm2';
    const configFaturamento = buildConfigFaturamento(tipoValor, {
      valorMini, valorTruck, valorToco, valorBasculante, valorKmLinear, valorM2,
      valorM2Manual, valorM2Mecanizada, valorPorArvore, valorPorEquipe,
    }, { dualM2 });

    const temValor =
      tipoValor === 'caminhao'
        ? [valorMini, valorTruck, valorToco, valorBasculante].some(v => v.trim())
        : tipoValor === 'km_linear'
          ? valorKmLinear.trim()
          : tipoValor === 'm2'
            ? (dualM2
              ? Boolean(valorM2Manual.trim() || valorM2Mecanizada.trim())
              : valorM2.trim())
            : tipoValor === 'por_equipe'
              ? valorPorEquipe.trim()
              : valorPorArvore.trim();

    if (!temValor) {
      adicionarToast(
        dualM2
          ? 'Informe o valor por m² da roçada Manual e/ou Mecanizada'
          : 'Informe pelo menos um valor de receita para o serviço',
        'warning',
      );
      return;
    }

    const valorPrincipal =
      tipoValor === 'caminhao'
        ? [configFaturamento.valorMini, configFaturamento.valorTruck, configFaturamento.valorToco, configFaturamento.valorBasculante]
            .find(v => v != null && v > 0)
        : tipoValor === 'km_linear'
          ? configFaturamento.valorKmLinear
          : tipoValor === 'm2'
            ? (
              (configFaturamento as any).valorM2Manual
              ?? (configFaturamento as any).valorM2Mecanizada
              ?? configFaturamento.valorM2
            )
            : tipoValor === 'por_equipe'
              ? configFaturamento.valorPorEquipe
              : configFaturamento.valorPorArvore;

    if (valorPrincipal == null || Number(valorPrincipal) <= 0) {
      adicionarToast('Valor inválido. Use formato 0,43 ou 0.43', 'warning');
      return;
    }

    setSalvandoServico(true);
    try {
      await servicoService.criarServico(id!, {
        nome: nomeServico.trim(),
        tipo,
        configFaturamento,
      });
      adicionarToast('Serviço criado!', 'success');
      fecharModalCriacao();
      await carregarDados();
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Erro ao criar serviço';
      adicionarToast(msg, 'error');
    } finally {
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
      await servicoService.excluirServico(id, excluindoId);
      adicionarToast('Serviço excluído!', 'success');
        if (servicoExpandidoId === excluindoId) setServicoExpandidoId(null);
        setExcluindoId(null);
        setServicoExclusaoInfo(null);
        setConfirmacaoExclusao('');
        await carregarDados();
    } catch { adicionarToast('Erro ao excluir', 'error'); }
  };

  /* ═══ Status change handler ═══ */
  const handleStatusChange = useCallback((servicoId: string, status: EtapasStatus) => {
    setServicos(prev => prev.map(s => s.id === servicoId ? { ...s, etapasStatus: status } : s));
  }, []);

  const handlePlanilhasChange = useCallback((
    servicoId: string,
    info: { totalRegistros: number; planilhas: PlanilhaItem[]; temUpload: boolean },
  ) => {
    setServicos(prev => prev.map(s => {
      if (s.id !== servicoId) return s;
      return {
        ...s,
        totalRegistros: info.totalRegistros,
        planilhas: info.planilhas,
        ultimoUpload: info.planilhas[0]?.criadoEm || null,
        etapasStatus: {
          ...s.etapasStatus,
          upload: info.temUpload ? 'done' : 'pending',
          revisao: info.temUpload ? 'done' : 'pending',
        } satisfies EtapasStatus,
      };
    }));
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
        <div style={{
          flex: 1.4, minWidth: 200, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #0d9488', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            <FiClock size={10} style={{ marginRight: '0.2rem' }} /> Ciclo de medição
          </div>
          <select
            value={contrato.diaInicioCiclo ?? 1}
            disabled={salvandoCiclo}
            onChange={(e) => salvarDiaInicioCiclo(Number(e.target.value))}
            style={{
              width: '100%', fontSize: '0.8rem', fontWeight: 600,
              border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.3rem 0.4rem',
              color: '#0f172a', background: '#f8fafc',
            }}
          >
            <option value={1}>Dia 1 — mês civil</option>
            {Array.from({ length: 27 }, (_, i) => i + 2).map(d => (
              <option key={d} value={d}>Dia {d} — início do ciclo</option>
            ))}
          </select>
          <div style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.2rem' }}>
            Usado no comparativo entre contratos
          </div>
        </div>
        <div style={{
          flex: 1.6, minWidth: 220, background: '#fff', borderRadius: '8px',
          padding: '0.55rem 0.75rem', border: '1px solid #e2e8f0',
          borderTop: '3px solid #f59e0b', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
        }}>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
            <FiTruck size={10} style={{ marginRight: '0.2rem' }} /> Placas reserva
          </div>
          <textarea
            value={textoPlacasReserva}
            disabled={salvandoPlacasReserva}
            onChange={(e) => setTextoPlacasReserva(e.target.value)}
            placeholder={'ABC1234\nDEF5678'}
            rows={2}
            style={{
              width: '100%', fontSize: '0.75rem', fontWeight: 600,
              border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.45rem',
              color: '#0f172a', background: '#f8fafc', resize: 'vertical', minHeight: '44px',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.25rem', gap: '0.35rem' }}>
            <div style={{ fontSize: '0.62rem', color: '#64748b' }}>
              Uma placa por linha — aparece como RESERVA no relatório operacional
            </div>
            <button
              type="button"
              onClick={salvarPlacasReserva}
              disabled={salvandoPlacasReserva}
              style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '0.25rem 0.5rem',
                border: 'none', borderRadius: '5px', cursor: salvandoPlacasReserva ? 'wait' : 'pointer',
                background: '#f59e0b', color: '#fff', flexShrink: 0,
              }}
            >
              {salvandoPlacasReserva ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>

      {/* Limites de caminhão por tipo (peso / volume) */}
      <div style={{
        marginBottom: '0.75rem', background: '#fff', borderRadius: '8px',
        padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0',
        borderTop: '3px solid #ef4444', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
          <FiTruck size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
          Limites por tipo de caminhão
        </div>
        <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.55rem', lineHeight: 1.4 }}>
          Defina o <strong>peso máximo (kg)</strong> e o <strong>volume da caixa (L)</strong> de cada tipo neste contrato.
          A <strong>CAIXA MÉDIA (L)</strong> na Visão Geral usa a coluna Volume — média ponderada só dos tipos
          que existem na frota da planilha (se não houver TOCO nos dados, mudar o volume do TOCO não altera o número).
          Depois de salvar, clique em <strong>Atualizar</strong> na comparação.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700 }}>Tipo</th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700 }}>Peso máx. (kg)</th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700, color: '#b91c1c' }}>
                  Volume caixa (L) → CAIXA MÉDIA
                </th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_LIMITE_CAMINHAO.map((tipo) => (
                <tr key={tipo} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{
                    padding: '0.4rem',
                    fontWeight: 700,
                    color: tipo === 'BASCULANTE' ? '#dc2626' : '#0f172a',
                  }}>
                    {LABEL_TIPO_CAMINHAO[tipo]}
                    {tipo === 'BASCULANTE' && (
                      <span style={{
                        marginLeft: '0.35rem', fontSize: '0.58rem', fontWeight: 600,
                        color: '#991b1b', background: '#fee2e2', padding: '0.1rem 0.35rem', borderRadius: '4px',
                      }}>
                        padrão 14.000 kg
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.3rem 0.4rem' }}>
                    <input
                      type="number"
                      min={1}
                      step={100}
                      disabled={salvandoLimites}
                      value={pesoMaxForm[tipo]}
                      onChange={(e) => setPesoMaxForm((prev) => ({ ...prev, [tipo]: e.target.value }))}
                      placeholder={String(PESO_MAX_KG_PADRAO[tipo])}
                      style={{
                        width: '100%', maxWidth: 140, fontSize: '0.72rem',
                        border: '1px solid #e2e8f0', borderRadius: '6px',
                        padding: '0.3rem 0.45rem', background: '#f8fafc', color: '#0f172a',
                      }}
                    />
                  </td>
                  <td style={{ padding: '0.3rem 0.4rem' }}>
                    <input
                      type="number"
                      min={1}
                      step={100}
                      disabled={salvandoLimites}
                      value={volumeForm[tipo]}
                      onChange={(e) => setVolumeForm((prev) => ({ ...prev, [tipo]: e.target.value }))}
                      placeholder={String(VOLUME_L_PADRAO[tipo])}
                      style={{
                        width: '100%', maxWidth: 140, fontSize: '0.72rem',
                        border: '1px solid #e2e8f0', borderRadius: '6px',
                        padding: '0.3rem 0.45rem', background: '#f8fafc', color: '#0f172a',
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={salvarLimitesCaminhao}
            disabled={salvandoLimites}
            style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '0.3rem 0.65rem',
              border: 'none', borderRadius: '5px', cursor: salvandoLimites ? 'wait' : 'pointer',
              background: '#ef4444', color: '#fff',
            }}
          >
            {salvandoLimites ? 'Salvando…' : 'Salvar limites'}
          </button>
        </div>
      </div>

      {/* Cadastro operacional — conferência com planilha */}
      <div style={{
        marginBottom: '0.75rem', background: '#fff', borderRadius: '8px',
        padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0',
        borderTop: '3px solid #6366f1', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
          <FiUsers size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
          Cadastro operacional — conferência com a planilha
        </div>
        <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.45rem' }}>
          Cadastre a frota, motoristas e coletores ativos. Na validação do upload, o sistema compara com os nomes/placas da planilha.
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.5rem',
        }}>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Placas ativas (frota)
            </div>
            <textarea
              value={textoPlacasAtivas}
              disabled={salvandoCadastro}
              onChange={(e) => setTextoPlacasAtivas(e.target.value)}
              placeholder={'ABC1D23\nXYZ9W87'}
              rows={3}
              style={{
                width: '100%', fontSize: '0.72rem', border: '1px solid #e2e8f0',
                borderRadius: '6px', padding: '0.35rem 0.45rem', resize: 'vertical',
                color: '#0f172a', background: '#f8fafc', minHeight: '56px',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Motoristas
            </div>
            <textarea
              value={textoMotoristas}
              disabled={salvandoCadastro}
              onChange={(e) => setTextoMotoristas(e.target.value)}
              placeholder={'João Silva\nMaria Souza'}
              rows={3}
              style={{
                width: '100%', fontSize: '0.72rem', border: '1px solid #e2e8f0',
                borderRadius: '6px', padding: '0.35rem 0.45rem', resize: 'vertical',
                color: '#0f172a', background: '#f8fafc', minHeight: '56px',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b', marginBottom: '0.2rem' }}>
              Coletores ativos
            </div>
            <textarea
              value={textoColetores}
              disabled={salvandoCadastro}
              onChange={(e) => setTextoColetores(e.target.value)}
              placeholder={'Carlos\nAna Paula'}
              rows={3}
              style={{
                width: '100%', fontSize: '0.72rem', border: '1px solid #e2e8f0',
                borderRadius: '6px', padding: '0.35rem 0.45rem', resize: 'vertical',
                color: '#0f172a', background: '#f8fafc', minHeight: '56px',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
          <button
            type="button"
            onClick={salvarCadastroOperacional}
            disabled={salvandoCadastro}
            style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '0.3rem 0.65rem',
              border: 'none', borderRadius: '5px', cursor: salvandoCadastro ? 'wait' : 'pointer',
              background: '#6366f1', color: '#fff',
            }}
          >
            {salvandoCadastro ? 'Salvando…' : 'Salvar cadastro'}
          </button>
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
            const temUpload = (servico.totalRegistros || 0) > 0 || (servico.planilhas?.length || 0) > 0;
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
                                navigate(`/contratos/${id}/servicos/${servico.id}`);
                              }
                            } else {
                              if (etp.key === 'dashboard') {
                                navigate(`/contratos/${id}/servicos/${servico.id}`);
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
                          navigate(`/contratos/${id}/servicos/${servico.id}`);
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
                      tipoServico={servico.tipo}
                      onStatusChange={(status) => handleStatusChange(servico.id, status)}
                      onPlanilhasChange={(info) => handlePlanilhasChange(servico.id, info)}
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
                    const ativo = tipoSelecionado === op.value;
                    return (
                      <div
                        key={op.value}
                        className={'criacao-tipo-card' + (ativo ? ' selecionado' : '')}
                        onClick={() => selecionarTipoCriacao(op.value)}
                        role="radio"
                        aria-checked={ativo}
                      >
                        <div className="check">
                          {ativo && <FiCheck size={10} />}
                        </div>
                        <span>{op.label}</span>
                      </div>
                    );
                  })}
                </div>
                {TIPOS_SERVICO_META[tipoSelecionado as TipoServico] && (
                  <div style={{
                    marginTop: '0.4rem', padding: '0.5rem 0.6rem',
                    background: '#f8fafc', borderRadius: '6px',
                    border: '1px solid #e2e8f0', fontSize: '0.72rem', color: '#475569',
                  }}>
                    {TIPOS_SERVICO_META[tipoSelecionado as TipoServico].descricao}
                  </div>
                )}
              </div>

              <div className="form-group modal-valores-servico">
                <label>
                  <FiDollarSign size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
                  Tipo de Valor
                </label>
                {(() => {
                  const opcoes = opcoesTipoValorDisponiveis(tipoSelecionado || TIPOS_SERVICO.COLETA_CAMINHAO);
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
                      { key: 'BASCULANTE', val: valorBasculante, set: setValorBasculante, cor: '#ef4444' },
                    ].map(item => (
                      <div key={item.key} className="valor-input-group">
                        <label style={{ color: item.cor }}>{item.key}</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.val}
                          onChange={e => item.set(e.target.value.replace(/[^\d.,]/g, ''))}
                          placeholder="0,43"
                        />
                      </div>
                    ))}
                    <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.35rem 0 0', lineHeight: 1.4, flexBasis: '100%' }}>
                      Cada viagem usará o valor do tipo correspondente (Mini, Truck, Toco ou Basculante) conforme a coluna da planilha.
                    </p>
                  </div>
                )}

                {tipoValor === 'km_linear' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#0ea5e9' }}>Valor por KM (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorKmLinear}
                        onChange={e => setValorKmLinear(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
                      />
                    </div>
                  </div>
                )}

                {tipoValor === 'm2' && tipoSelecionado === TIPOS_SERVICO.ROCADEIRA && (
                  <div className="valores-form-linha modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#16a34a' }}>Manual (R$/m²)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorM2Manual}
                        onChange={e => setValorM2Manual(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
                      />
                    </div>
                    <div className="valor-input-group">
                      <label style={{ color: '#ea580c' }}>Mecanizada (R$/m²)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorM2Mecanizada}
                        onChange={e => setValorM2Mecanizada(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
                      />
                    </div>
                    <p style={{ fontSize: '0.68rem', color: '#64748b', margin: '0.35rem 0 0', lineHeight: 1.4, flexBasis: '100%' }}>
                      Informe o valor por m² de cada tipo da planilha (Manual e Mecanizada). Podem ser iguais ou diferentes.
                    </p>
                  </div>
                )}

                {tipoValor === 'm2' && tipoSelecionado !== TIPOS_SERVICO.ROCADEIRA && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#f97316' }}>Valor por m² (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorM2}
                        onChange={e => setValorM2(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
                      />
                      <span style={{ fontSize: '0.62rem', color: '#64748b', marginTop: '0.2rem' }}>
                        Use vírgula ou ponto (ex.: 0,43)
                      </span>
                    </div>
                  </div>
                )}

                {tipoValor === 'por_arvore' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#22d3ee' }}>Valor por Árvore (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorPorArvore}
                        onChange={e => setValorPorArvore(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
                      />
                    </div>
                  </div>
                )}

                {tipoValor === 'por_equipe' && (
                  <div className="modal-valores-form">
                    <div className="valor-input-group">
                      <label style={{ color: '#ef4444' }}>Valor por Equipe (R$)</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorPorEquipe}
                        onChange={e => setValorPorEquipe(e.target.value.replace(/[^\d.,]/g, ''))}
                        placeholder="0,43"
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
