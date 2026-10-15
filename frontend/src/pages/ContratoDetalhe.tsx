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

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FiPlus, FiTrash2, FiArrowLeft,
  FiAlertCircle, FiCheck, FiX,
  FiDatabase, FiBarChart2, FiRefreshCw,
  FiClock, FiSettings, FiFolder,
  FiUpload, FiDollarSign, FiTruck, FiUsers, FiMessageSquare, FiFileText,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import type { EtapasStatus } from '../components/ServicoMiniFlow';
import ContratoOperacaoUnificada from '../components/ContratoOperacaoUnificada';
import RelatoriosMenu from '../components/RelatoriosMenu';
import { relatoriosDoContexto } from '../relatorios/catalogoRelatorios';
import DataTable from '../components/DataTable';
import { TIPOS_SERVICO, TIPOS_SERVICO_LABELS, TIPOS_SERVICO_OPCOES, TIPOS_SERVICO_META } from '../types';
import type { TipoServico } from '../types';
import contractService from '../services/contractService';
import servicoService from '../services/servicoService';
import pdfService from '../services/pdfService';
import { metricaOficialServico } from '@sistemma/shared';
import { gerarHtmlRelatorioCicloConsolidado } from '../utils/gerarHtmlRelatorioCicloConsolidado';
import { gerarNomePdfRelatorioCicloConsolidado } from '../utils/gerarNomePdf';
import {
  calcularCicloMensalContrato,
  inferirMesReferenciaAtual,
  normalizarDiaInicioCiclo,
  recortarPeriodoAteReferencia,
} from '../utils/periodoCicloContrato';

const ORDEM_TIPOS_PADRAO = [
  'coleta_caminhao',
  'rocadeira',
  'capina',
  'varricao',
  'poda',
  'pintura_meio_fio',
  'remocao',
] as const;

const TIPOS_PADRAO_CONTRATO = new Set<string>(ORDEM_TIPOS_PADRAO);

function execucaoDoNomeServico(nome?: string): 'manual' | 'mecanizada' | null {
  const n = String(nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (n.includes('MANUAL')) return 'manual';
  if (n.includes('MECANIZ')) return 'mecanizada';
  return null;
}

/**
 * Mantém Varrição/Roçada Manual e Mecanizada como cards separados
 * (são abas distintas da planilha padrão). Só esconde o card genérico
 * vazio do mesmo tipo quando já existe a variante nomeada.
 */
function deduplicarServicosPadrao<T extends { tipo: string; nome?: string; totalRegistros?: number }>(lista: T[]): T[] {
  const porChave = new Map<string, T>();
  const extras: T[] = [];

  for (const s of lista) {
    if (!TIPOS_PADRAO_CONTRATO.has(s.tipo)) {
      extras.push(s);
      continue;
    }
    const exec = execucaoDoNomeServico(s.nome);
    const chave = exec ? `${s.tipo}:${exec}` : s.tipo;
    const atual = porChave.get(chave);
    if (!atual) {
      porChave.set(chave, s);
      continue;
    }
    const regAtual = Number(atual.totalRegistros || 0);
    const regNovo = Number(s.totalRegistros || 0);
    if (regNovo > regAtual) porChave.set(chave, s);
  }

  const temVariante = new Set(
    [...porChave.keys()].filter((k) => k.includes(':')).map((k) => k.split(':')[0]),
  );

  const visiveis = [...porChave.entries()]
    .filter(([chave, s]) => {
      if (chave.includes(':')) return true;
      const tipo = chave;
      if (!temVariante.has(tipo)) return true;
      return Number(s.totalRegistros || 0) > 0;
    })
    .map(([, s]) => s);

  return ordenarServicosPadrao([...visiveis, ...extras]);
}

function ordenarServicosPadrao<T extends { tipo: string; nome?: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const ia = ORDEM_TIPOS_PADRAO.indexOf(a.tipo as typeof ORDEM_TIPOS_PADRAO[number]);
    const ib = ORDEM_TIPOS_PADRAO.indexOf(b.tipo as typeof ORDEM_TIPOS_PADRAO[number]);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}
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
import { DENSIDADE_RESIDUO_PADRAO, parseDensidadeResiduoInput } from '../utils/analisePesoComparativoMetricas';
import {
  TIPOS_LIMITE_CAMINHAO,
  LABEL_TIPO_CAMINHAO,
  PESO_MAX_KG_PADRAO,
  VOLUME_L_PADRAO,
  calcularPesoIdealKg,
  formDensidadesParaMapa,
  formLimitesParaMapa,
  mapaDensidadesParaForm,
  mapaLimitesParaForm,
  normalizarMapaDensidadesPorPlacaForm,
  resolverDensidadePorTipo,
  resolverDensidadeResiduoKgL,
  type TipoLimiteCaminhao,
} from '../utils/limitesCaminhaoContrato';
import { normalizarPlaca } from '../utils/normalizarPlaca';
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
  configFaturamento?: unknown;
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
    densidadeResiduoKgL?: number | null;
    densidadeKgL?: { MINI?: number; TOCO?: number; BASCULANTE?: number; TRUCK?: number };
    densidadeKgLPorPlaca?: Record<string, number>;
    pastaBackupPlanilhas?: string | null;
  } | null;
}

interface PlanilhaItem {
  id: number;
  nomeArquivo: string;
  totalLinhas: number;
  linhasImportadas: number;
  criadoEm: string;
  urlDownload?: string | null;
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
        urlDownload: typeof u.urlDownload === 'string' ? u.urlDownload : null,
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [servicos, setServicos] = useState<ServicoComStatus[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvandoCiclo, setSalvandoCiclo] = useState(false);
  const [pastaBackupPlanilhas, setPastaBackupPlanilhas] = useState('');
  const [salvandoPastaBackup, setSalvandoPastaBackup] = useState(false);
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
  const [densidadeForm, setDensidadeForm] = useState(String(DENSIDADE_RESIDUO_PADRAO).replace('.', ','));
  const [densidadePorTipoForm, setDensidadePorTipoForm] = useState<Record<TipoLimiteCaminhao, string>>(
    () => mapaDensidadesParaForm(null, DENSIDADE_RESIDUO_PADRAO),
  );
  const [densidadePorPlacaForm, setDensidadePorPlacaForm] = useState<Record<string, string>>({});
  const [salvandoLimites, setSalvandoLimites] = useState(false);
  const [salvandoDensidade, setSalvandoDensidade] = useState(false);
  const [salvandoDensidadePlaca, setSalvandoDensidadePlaca] = useState(false);
  const [exportandoCicloTodos, setExportandoCicloTodos] = useState(false);
  const [dataRelatorio, setDataRelatorio] = useState('');
  const abaHub = (['operacao', 'relatorios', 'config'].includes(searchParams.get('aba') || '')
    ? searchParams.get('aba')
    : 'operacao') as 'operacao' | 'relatorios' | 'config';
  const setAbaHub = (aba: 'operacao' | 'relatorios' | 'config') => {
    const next = new URLSearchParams(searchParams);
    if (aba === 'operacao') next.delete('aba');
    else next.set('aba', aba);
    setSearchParams(next, { replace: true });
  };

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
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [excluindoServico, setExcluindoServico] = useState(false);
  const [servicoExclusaoInfo, setServicoExclusaoInfo] = useState<{
    nome: string;
    tipo: string;
    tipoLabel: string;
    qtdPlanilhas: number;
    qtdRegistros: number;
    temKpis: boolean;
    temDados: boolean;
  } | null>(null);

  // ═══ CRIAÇÃO — Modal rápido ═══
  const [modalCriacaoAberto, setModalCriacaoAberto] = useState(false);
  const [nomeServico, setNomeServico] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState<string>(TIPOS_SERVICO.COLETA_CAMINHAO);
  const [salvandoServico, setSalvandoServico] = useState(false);
  const [servicoRegistrosId, setServicoRegistrosId] = useState<string | null>(null);

  const { setBreadcrumbs } = useBreadcrumbs();

  /* ═══ Carregar dados ═══ */
  /**
   * `aproveitarCache` existe porque a busca do padrão é uma requisição por
   * serviço: na primeira abertura vale reusar o que o cliente já tem, e só
   * ignorar o cache quando a recarga vem de uma ação que mudou os dados.
   */
  const carregarDados = useCallback(async (opts?: { silencioso?: boolean; aproveitarCache?: boolean }) => {
    if (!id) return;
    if (!opts?.silencioso) setCarregando(true);
    try {
      const [contratoData, listaRaw] = await Promise.all([
        contractService.buscar(id),
        servicoService.listarServicosContrato(id, { force: !opts?.aproveitarCache }),
      ]);
      const lista = Array.isArray(listaRaw) ? listaRaw : (listaRaw as any)?.servicos || [];

      setContrato(contratoData);
      setPastaBackupPlanilhas(String(contratoData.configOperacional?.pastaBackupPlanilhas || '').trim());
      setTextoPlacasReserva(placasReservaParaTexto(extrairPlacasReservaContrato(contratoData)));
      const cadastro = extrairCadastroOperacionalContrato(contratoData);
      setTextoPlacasAtivas(listaParaTexto(cadastro.placasAtivas));
      setTextoMotoristas(listaParaTexto(cadastro.motoristas));
      setTextoColetores(listaParaTexto(cadastro.coletores));
      setPesoMaxForm(mapaLimitesParaForm(contratoData.configOperacional?.pesoMaximoKg, PESO_MAX_KG_PADRAO));
      setVolumeForm(mapaLimitesParaForm(contratoData.configOperacional?.volumeL, VOLUME_L_PADRAO));
      {
        const dens = contratoData.configOperacional?.densidadeResiduoKgL;
        setDensidadeForm(
          dens && dens > 0
            ? String(dens).replace('.', ',')
            : String(DENSIDADE_RESIDUO_PADRAO).replace('.', ','),
        );
        setDensidadePorTipoForm(
          mapaDensidadesParaForm(contratoData.configOperacional?.densidadeKgL, dens),
        );
        const densPlaca = contratoData.configOperacional?.densidadeKgLPorPlaca || {};
        const formPlaca: Record<string, string> = {};
        for (const [placa, v] of Object.entries(densPlaca)) {
          if (v != null && Number(v) > 0) formPlaca[placa] = String(v).replace('.', ',');
        }
        setDensidadePorPlacaForm(formPlaca);
      }

      const montarDoPadrao = (s: any, padrao: any) => {
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
      };

      const esqueleto = lista.map((s: any) => {
        const cols = s.padraoPlanilha?.colunas || [];
        const config = s.configDashboard;
        const totalRegistros = Number(s.padraoPlanilha?.totalLinhas || 0);
        const temDados = totalRegistros > 0 || cols.length > 0;
        return {
          ...s,
          planilhas: [],
          totalRegistros,
          ultimoUpload: s.padraoPlanilha?.detectadoEm || null,
          etapasStatus: {
            upload: temDados ? 'done' : 'pending',
            indicadoresAuto: config?.indicadoresAutomaticosConfirmados === true ? 'done' : 'pending',
            revisao: temDados ? 'done' : 'pending',
            config: (config?.kpis?.length > 0) ? 'done' : 'pending',
          } satisfies EtapasStatus,
        };
      });
      setServicos(deduplicarServicosPadrao(esqueleto));
      if (!opts?.silencioso) setCarregando(false);

      const CONCORRENCIA = 2;
      const enriquecidos = [...esqueleto];
      for (let i = 0; i < lista.length; i += CONCORRENCIA) {
        const lote = lista.slice(i, i + CONCORRENCIA);
        const resultados = await Promise.allSettled(
          lote.map(async (s: any, idxLote: number) => {
            const padrao = await servicoService.getPadrao(id, s.id, {
              force: !opts?.aproveitarCache,
              resumo: true,
            });
            return { idx: i + idxLote, valor: montarDoPadrao(s, padrao) };
          }),
        );
        for (const r of resultados) {
          if (r.status !== 'fulfilled') continue;
          enriquecidos[r.value.idx] = r.value.valor;
        }
        setServicos(deduplicarServicosPadrao([...enriquecidos]));
      }
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

  const salvarPastaBackupPlanilhas = async () => {
    if (!id || !contrato) return;
    setSalvandoPastaBackup(true);
    try {
      const pasta = pastaBackupPlanilhas.trim();
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          pastaBackupPlanilhas: pasta || null,
        },
      });
      setContrato(atualizado);
      setPastaBackupPlanilhas(String(atualizado.configOperacional?.pastaBackupPlanilhas || '').trim());
      adicionarToast(
        pasta ? 'Pasta de backup das planilhas salva' : 'Pasta de backup removida',
        'success',
      );
    } catch {
      adicionarToast('Erro ao salvar pasta de backup', 'error');
    } finally {
      setSalvandoPastaBackup(false);
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

  const densFormNum = useMemo(() => {
    const n = Number(String(densidadeForm || '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [densidadeForm]);

  const pesosIdeaisForm = useMemo(() => {
    const densMapa = formDensidadesParaMapa(densidadePorTipoForm);
    const out = {} as Record<TipoLimiteCaminhao, number>;
    for (const tipo of TIPOS_LIMITE_CAMINHAO) {
      const vol = Number(String(volumeForm[tipo] || '').replace(',', '.'));
      const dens = resolverDensidadePorTipo(tipo, {
        global: densFormNum,
        porTipo: densMapa,
      });
      out[tipo] = calcularPesoIdealKg(
        Number.isFinite(vol) && vol > 0 ? vol : VOLUME_L_PADRAO[tipo],
        dens,
      );
    }
    return out;
  }, [volumeForm, densFormNum, densidadePorTipoForm]);

  const salvarLimitesCaminhao = async () => {
    if (!id || !contrato) return;
    setSalvandoLimites(true);
    try {
      const densParsed = parseDensidadeResiduoInput(densidadeForm);
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          pesoMaximoKg: formLimitesParaMapa(pesoMaxForm),
          volumeL: formLimitesParaMapa(volumeForm),
          densidadeKgL: formDensidadesParaMapa(densidadePorTipoForm),
          ...(densParsed != null ? { densidadeResiduoKgL: densParsed } : {}),
        },
      });
      setContrato(atualizado);
      setPesoMaxForm(mapaLimitesParaForm(atualizado.configOperacional?.pesoMaximoKg, PESO_MAX_KG_PADRAO));
      setVolumeForm(mapaLimitesParaForm(atualizado.configOperacional?.volumeL, VOLUME_L_PADRAO));
      {
        const dens = atualizado.configOperacional?.densidadeResiduoKgL;
        if (dens && dens > 0) setDensidadeForm(String(dens).replace('.', ','));
        setDensidadePorTipoForm(
          mapaDensidadesParaForm(atualizado.configOperacional?.densidadeKgL, dens),
        );
      }
      adicionarToast('Limites, densidades e pesos ideais do contrato salvos', 'success');
    } catch {
      adicionarToast('Erro ao salvar limites de caminhão', 'error');
    } finally {
      setSalvandoLimites(false);
    }
  };

  const salvarDensidadeResiduo = async () => {
    if (!id || !contrato) return;
    const densParsed = parseDensidadeResiduoInput(densidadeForm);
    if (densParsed == null) {
      adicionarToast('Densidade inválida (use valor entre 0,01 e 5 kg/L)', 'warning');
      return;
    }
    setSalvandoDensidade(true);
    try {
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          densidadeResiduoKgL: densParsed,
        },
      });
      setContrato(atualizado);
      const dens = atualizado.configOperacional?.densidadeResiduoKgL;
      setDensidadeForm(
        dens && dens > 0
          ? String(dens).replace('.', ',')
          : String(DENSIDADE_RESIDUO_PADRAO).replace('.', ','),
      );
      setDensidadePorTipoForm(
        mapaDensidadesParaForm(atualizado.configOperacional?.densidadeKgL, dens),
      );
      adicionarToast(
        `Densidade padrão ${String(densParsed).replace('.', ',')} kg/L salva (fallback dos tipos)`,
        'success',
      );
    } catch {
      adicionarToast('Erro ao salvar densidade do resíduo', 'error');
    } finally {
      setSalvandoDensidade(false);
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

  const placasFrotaLista = useMemo(() => {
    const doTexto = parseListaPlacasTexto(textoPlacasAtivas);
    const doForm = Object.keys(densidadePorPlacaForm).map(normalizarPlaca).filter(Boolean);
    return [...new Set([...doTexto, ...doForm])].sort();
  }, [textoPlacasAtivas, densidadePorPlacaForm]);

  const salvarDensidadesPorPlaca = async () => {
    if (!id || !contrato) return;
    setSalvandoDensidadePlaca(true);
    try {
      const mapa = normalizarMapaDensidadesPorPlacaForm(densidadePorPlacaForm);
      const atualizado = await contractService.atualizar(id, {
        configOperacional: {
          ...(contrato.configOperacional || {}),
          densidadeKgLPorPlaca: mapa,
          // Garante que placas com densidade fiquem na frota
          placasAtivas: [
            ...new Set([
              ...parseListaPlacasTexto(textoPlacasAtivas),
              ...Object.keys(mapa),
            ]),
          ].sort(),
        },
      });
      setContrato(atualizado);
      const cadastro = extrairCadastroOperacionalContrato(atualizado);
      setTextoPlacasAtivas(listaParaTexto(cadastro.placasAtivas));
      const densPlaca = atualizado.configOperacional?.densidadeKgLPorPlaca || {};
      const formPlaca: Record<string, string> = {};
      for (const [placa, v] of Object.entries(densPlaca)) {
        if (v != null && Number(v) > 0) formPlaca[placa] = String(v).replace('.', ',');
      }
      setDensidadePorPlacaForm(formPlaca);
      adicionarToast('Densidades por caminhão salvas', 'success');
    } catch {
      adicionarToast('Erro ao salvar densidades por caminhão', 'error');
    } finally {
      setSalvandoDensidadePlaca(false);
    }
  };

  useEffect(() => { carregarDados({ aproveitarCache: true }); }, [id]);

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
  const enviosCiclo = (() => {
    const datas = new Set<string>();
    for (const s of servicos) {
      for (const p of s.planilhas || []) {
        const m = String(p.urlDownload || '').match(/diario\/(\d{4}-\d{2}-\d{2})/);
        const dia = m?.[1] || String(p.criadoEm || '').slice(0, 10);
        if (dia) datas.add(dia);
      }
    }
    return datas.size || totalPlanilhas;
  })();
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

  useEffect(() => {
    if (dataRelatorio) return;
    if (ultimoUploadGeral) {
      setDataRelatorio(String(ultimoUploadGeral).slice(0, 10));
      return;
    }
    const hoje = new Date();
    const iso = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    setDataRelatorio(iso);
  }, [ultimoUploadGeral, dataRelatorio]);

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
  const TEXTO_CONFIRMA_EXCLUSAO = 'EXCLUIR';

  const fecharModalExclusao = () => {
    if (excluindoServico) return;
    setExcluindoId(null);
    setServicoExclusaoInfo(null);
    setConfirmacaoExclusao('');
  };

  const prepararExclusao = (servico: ServicoComStatus) => {
    const qtdPlanilhas = servico.planilhas?.length || 0;
    const qtdRegistros = servico.totalRegistros || 0;
    setExcluindoId(servico.id);
    setConfirmacaoExclusao('');
    setServicoExclusaoInfo({
      nome: servico.nome,
      tipo: servico.tipo,
      tipoLabel: TIPOS_SERVICO_LABELS[servico.tipo as TipoServico] || servico.tipo,
      qtdPlanilhas,
      qtdRegistros,
      temKpis: servico.etapasStatus?.config === 'done',
      temDados: qtdPlanilhas > 0 || qtdRegistros > 0,
    });
  };

  const [confirmacaoExclusao, setConfirmacaoExclusao] = useState('');

  const confirmacaoExclusaoOk = Boolean(
    servicoExclusaoInfo
    && confirmacaoExclusao.trim().toUpperCase() === TEXTO_CONFIRMA_EXCLUSAO,
  );

  const excluirServico = async () => {
    if (!excluindoId || !servicoExclusaoInfo || !id) return;
    if (!confirmacaoExclusaoOk) {
      adicionarToast(
        servicoExclusaoInfo.temDados
          ? `Digite ${TEXTO_CONFIRMA_EXCLUSAO} para confirmar`
          : 'Confirme a exclusão',
        'warning',
      );
      return;
    }
    setExcluindoServico(true);
    try {
      const resultado = await servicoService.excluirServico(id, excluindoId);
      const uploads = resultado?.uploadsRemovidos ?? servicoExclusaoInfo.qtdPlanilhas;
      const regs = resultado?.registrosRemovidos ?? servicoExclusaoInfo.qtdRegistros;
      adicionarToast(
        regs > 0 || uploads > 0
          ? `“${servicoExclusaoInfo.nome}” excluído · ${uploads} planilha(s) e ${regs.toLocaleString('pt-BR')} registro(s) removidos`
          : `“${servicoExclusaoInfo.nome}” excluído`,
        'success',
      );
      if (servicoRegistrosId === excluindoId) setServicoRegistrosId(null);
      setExcluindoId(null);
      setServicoExclusaoInfo(null);
      setConfirmacaoExclusao('');
      await carregarDados();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      adicionarToast(msg || 'Erro ao excluir serviço', 'error');
    } finally {
      setExcluindoServico(false);
    }
  };

  const metricaDoTipo = (
    tipo: string,
    d: {
      rotas?: number;
      viagens?: number;
      pesoTotalTon?: number;
      pesoTotalKg?: number;
      kmTotal?: number;
      areaM2?: number;
      metroLinear?: number;
      kmLinear?: number;
      qtdArvore?: number;
      quantitativo?: number;
    },
  ): { valor: number; und: string; extra?: string } => {
    const t = String(tipo || '');
    if (t === 'coleta_caminhao') {
      const ton = Number(d.pesoTotalTon || 0) || Number(d.pesoTotalKg || 0) / 1000;
      const extra = [
        Number(d.viagens || 0) > 0 ? `${Number(d.viagens).toLocaleString('pt-BR')} viag.` : '',
        Number(d.kmTotal || 0) > 0 ? `${Math.round(Number(d.kmTotal)).toLocaleString('pt-BR')} km` : '',
      ].filter(Boolean).join(' · ');
      return { valor: ton, und: 't', extra: extra || undefined };
    }
    const oficial = metricaOficialServico(t, d);
    return { valor: oficial.valor, und: oficial.sufixo };
  };

  const exportarPdfCicloTodosServicos = async () => {
    if (!id || !contrato) return;
    if (exportandoCicloTodos) return;
    setExportandoCicloTodos(true);
    try {
      const diaInicio = normalizarDiaInicioCiclo(contrato.diaInicioCiclo);
      const ref = inferirMesReferenciaAtual(diaInicio);
      const ciclo = calcularCicloMensalContrato(ref.ano, ref.mes, diaInicio);
      const recorte = recortarPeriodoAteReferencia(ciclo.dataInicio, ciclo.dataFim);
      const tipos: Array<{
        tipo: string;
        nome: string;
        und: string;
        registros: number;
        quantitativo: number;
        diasComDados: number;
        dias: Array<{ data: string; registros: number; quantitativo: number }>;
        extra?: string;
      }> = [];
      const avisos: string[] = [];

      for (const s of servicos) {
        const resumo = await servicoService.getResumoCicloPorDia(id, s.id, {
          dataInicio: recorte.dataInicio,
          dataFim: recorte.dataFim,
        }, { abortKey: `pdf-ciclo-todos:${s.id}` });
        const dias = (resumo.dias || [])
          .map((d) => {
            const m = metricaDoTipo(s.tipo, d);
            return {
              data: d.data,
              registros: Number(d.rotas || 0),
              quantitativo: m.valor,
              und: m.und,
            };
          })
          .filter((d) => d.registros > 0 || d.quantitativo > 0);
        if (dias.length === 0) {
          avisos.push(`${s.nome} — sem operação neste ciclo`);
          continue;
        }
        const tot = dias.reduce(
          (a, d) => ({ registros: a.registros + d.registros, quantitativo: a.quantitativo + d.quantitativo }),
          { registros: 0, quantitativo: 0 },
        );
        const extra = metricaDoTipo(s.tipo, {
          rotas: resumo.totais?.rotas,
          viagens: resumo.totais?.viagens,
          pesoTotalTon: resumo.totais?.pesoTotalTon,
          pesoTotalKg: resumo.totais?.pesoTotalKg,
          kmTotal: resumo.totais?.kmTotal,
          areaM2: resumo.totais?.areaM2,
          metroLinear: resumo.totais?.metroLinear,
          kmLinear: resumo.totais?.kmLinear,
          qtdArvore: resumo.totais?.qtdArvore,
          quantitativo: resumo.totais?.quantitativo,
        }).extra;
        tipos.push({
          tipo: s.tipo,
          nome: s.nome,
          und: dias[0].und,
          registros: tot.registros,
          quantitativo: tot.quantitativo,
          diasComDados: dias.length,
          dias: dias.map(({ data, registros, quantitativo }) => ({ data, registros, quantitativo })),
          extra,
        });
      }

      if (tipos.length === 0) {
        adicionarToast('Nenhum serviço do contrato tem operação neste ciclo', 'warning');
        return;
      }

      const html = gerarHtmlRelatorioCicloConsolidado({
        contratoNome: contrato.numeroContrato,
        cicloLabel: recorte.emAndamento
          ? `${ciclo.label} — ${recorte.diasDecorridos} dias decorridos`
          : ciclo.label,
        dataInicio: recorte.dataInicio,
        dataFim: recorte.dataFim,
        tipos,
        avisos,
      });
      const nomeArquivo = gerarNomePdfRelatorioCicloConsolidado({
        contratoNome: contrato.numeroContrato,
        dataInicio: recorte.dataInicio,
        dataFim: recorte.dataFim,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      adicionarToast(`PDF do ciclo com ${tipos.length} serviço(s) gerado`, 'success');
    } catch (err) {
      console.error('Erro PDF ciclo todos serviços:', err);
      adicionarToast('Erro ao gerar o relatório do ciclo', 'error');
    } finally {
      setExportandoCicloTodos(false);
    }
  };

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
    <div className="fluxo-unificado contrato-page-clean">
      <header className="contrato-page-head">
        <div className="contrato-page-head-row">
          <button type="button" className="btn-link" onClick={() => navigate('/contratos')}>
            <FiArrowLeft size={14} /> Contratos
          </button>
          <h1>{contrato.numeroContrato}</h1>
          <span className={'status-badge ' + contrato.status}>{contrato.status}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void carregarDados()} title="Recarregar">
            <FiRefreshCw size={12} />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => navigate('/whatsapp-grupos')}
            title="WhatsApp desta unidade"
          >
            <FiMessageSquare size={12} /> WhatsApp
          </button>
        </div>
        <div className="contrato-page-meta">
          <span><FiDatabase size={12} /> {totalServicos} serviços</span>
          <span><FiBarChart2 size={12} /> {totalRegistros.toLocaleString('pt-BR')} registros</span>
          <span><FiUpload size={12} /> {totalPlanilhas > 0 ? `1 consolidado · ${enviosCiclo} envio${enviosCiclo === 1 ? '' : 's'}` : 'sem envios'}</span>
          <span>
            <FiClock size={12} />{' '}
            {ultimoUploadGeral ? new Date(ultimoUploadGeral).toLocaleDateString('pt-BR') : 'sem upload'}
          </span>
        </div>
      </header>

      <nav className="contrato-hub-tabs" aria-label="Seções do contrato">
        <button type="button" className={abaHub === 'operacao' ? 'is-on' : ''} onClick={() => setAbaHub('operacao')}>
          Operação
        </button>
        <button type="button" className={abaHub === 'relatorios' ? 'is-on' : ''} onClick={() => setAbaHub('relatorios')}>
          Relatórios
        </button>
        <button type="button" className={abaHub === 'config' ? 'is-on' : ''} onClick={() => setAbaHub('config')}>
          Configuração
        </button>
      </nav>

      {abaHub === 'relatorios' && (
        <section className="contrato-relatorios-hub">
          <div className="contrato-relatorios-bloco">
            <h2>Ciclo do contrato</h2>
            <p>PDF com todos os serviços do ciclo de medição.</p>
            <RelatoriosMenu
              opcoes={relatoriosDoContexto({ escopo: 'contrato' }).map((r) => ({
                id: r.id,
                label: r.label,
                descricao: r.descricao,
              }))}
              marcados={['ciclo_contrato']}
              onToggle={() => {}}
              onGerar={() => { void exportarPdfCicloTodosServicos(); }}
              gerando={exportandoCicloTodos}
              disabled={totalServicos === 0}
            />
          </div>
          <div className="contrato-relatorios-bloco">
            <h2>Relatório do dia</h2>
            <label className="contrato-relatorios-data">
              Dia
              <input
                type="date"
                value={dataRelatorio}
                onChange={(e) => setDataRelatorio(e.target.value)}
              />
            </label>
            <p>Abra o PDF do dia em cada serviço. No WhatsApp, peça com <code>dia 16/09</code>.</p>
            <div className="contrato-relatorios-servicos">
              {servicos.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="btn btn-sm"
                  disabled={!dataRelatorio}
                  onClick={() => navigate(`/contratos/${id}/servicos/${s.id}/dia/${dataRelatorio}`)}
                >
                  <FiFileText size={12} /> {s.nome}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {abaHub === 'operacao' && id && totalServicos > 0 && (
        <ContratoOperacaoUnificada
          contractId={id}
          servicos={servicos}
          tarifasContrato={contrato}
          onRefresh={() => { void carregarDados({ silencioso: true }); }}
        />
      )}

      {abaHub === 'operacao' && temAlertas && (
        <div className="contrato-page-alert">
          <FiAlertCircle size={14} />
          {[
            servicosUploadPendente > 0 ? `${servicosUploadPendente} sem planilha` : null,
            servicosSemKpi > 0 ? `${servicosSemKpi} sem KPIs` : null,
            servicosDesatualizados > 0 ? `${servicosDesatualizados} desatualizados` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      {abaHub === 'config' && (
      <section className="contrato-config-panel">
        <div className="contrato-config-toggle" aria-hidden="true">
          <span>
            <FiSettings size={15} />
            Configurações do contrato
            <small>Ciclo, frota, limites e cadastro operacional</small>
          </span>
        </div>
        <div className="contrato-config-body">
      <div className="contrato-config-grid-topo">
        <div className="contrato-config-mini">
          <label>
            <FiClock size={12} /> Ciclo de medição
          </label>
          <select
            value={contrato.diaInicioCiclo ?? 1}
            disabled={salvandoCiclo}
            onChange={(e) => void salvarDiaInicioCiclo(Number(e.target.value))}
          >
            <option value={1}>Dia 1 — mês civil</option>
            {Array.from({ length: 27 }, (_, i) => i + 2).map((d) => (
              <option key={d} value={d}>Dia {d} — início do ciclo</option>
            ))}
          </select>
        </div>
        <div className="contrato-config-mini contrato-config-mini--wide">
          <label>
            <FiFolder size={12} /> Pasta de backup das planilhas
          </label>
          <input
            type="text"
            value={pastaBackupPlanilhas}
            disabled={salvandoPastaBackup}
            onChange={(e) => setPastaBackupPlanilhas(e.target.value)}
            placeholder="vazio = planilhas-ciclo/NumeroDoContrato na raiz do Docker"
            title="No Docker o backup vai para C:\Sistemma\planilhas-ciclo\NumeroDoContrato. Este campo só vale no npm run dev."
          />
          <small className="contrato-config-hint">
            Ao fechar o ciclo, cria a pasta do contrato em
            {' '}<code>planilhas-ciclo/NumeroDoContrato</code> na raiz do Docker
            {' '}(<code>C:\Sistemma</code>) e salva a planilha com as datas do ciclo.
            Não precisa preencher este campo na máquina Docker.
          </small>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void salvarPastaBackupPlanilhas()}
            disabled={salvandoPastaBackup}
          >
            {salvandoPastaBackup ? 'Salvando…' : 'Salvar pasta'}
          </button>
        </div>
        <div className="contrato-config-mini contrato-config-mini--wide">
          <label>
            <FiTruck size={12} /> Placas reserva
          </label>
          <textarea
            value={textoPlacasReserva}
            disabled={salvandoPlacasReserva}
            onChange={(e) => setTextoPlacasReserva(e.target.value)}
            placeholder={'ABC1234\nDEF5678'}
            rows={2}
          />
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void salvarPlacasReserva()}
            disabled={salvandoPlacasReserva}
          >
            {salvandoPlacasReserva ? 'Salvando…' : 'Salvar placas'}
          </button>
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
          Informe o <strong>volume da caixa (L)</strong> e a <strong>densidade (kg/L) por tipo</strong> —
          o <strong>peso ideal</strong> é <strong>volume × densidade do tipo</strong>
          (ex.: basculante pode ter densidade menor que compactadores).
          A densidade padrão abaixo é o fallback. O <strong>peso máx.</strong> é o teto do contrato.
        </div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem 0.75rem',
          marginBottom: '0.55rem', padding: '0.45rem 0.55rem',
          background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
        }}>
          <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#92400e' }}>
            Densidade padrão (fallback) kg/L
          </label>
          <input
            type="text"
            inputMode="decimal"
            disabled={salvandoDensidade || salvandoLimites}
            value={densidadeForm}
            onChange={(e) => setDensidadeForm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void salvarDensidadeResiduo();
              }
            }}
            placeholder={String(DENSIDADE_RESIDUO_PADRAO).replace('.', ',')}
            title="Usada quando o tipo não tiver densidade própria"
            style={{
              width: 90, fontSize: '0.72rem', fontWeight: 700, fontFamily: 'ui-monospace, monospace',
              border: '1px solid #f59e0b', borderRadius: '6px',
              padding: '0.3rem 0.45rem', background: '#fff', color: '#92400e', textAlign: 'center',
            }}
          />
          <button
            type="button"
            onClick={() => { void salvarDensidadeResiduo(); }}
            disabled={salvandoDensidade || salvandoLimites}
            title="Salvar densidade padrão do contrato (fallback)"
            style={{
              fontSize: '0.65rem', fontWeight: 700, padding: '0.28rem 0.55rem',
              border: 'none', borderRadius: '5px',
              cursor: salvandoDensidade || salvandoLimites ? 'wait' : 'pointer',
              background: '#d97706', color: '#fff', flexShrink: 0,
            }}
          >
            {salvandoDensidade ? 'Salvando…' : 'Salvar padrão'}
          </button>
          <span style={{ fontSize: '0.62rem', color: '#a16207', flex: '1 1 12rem' }}>
            Fallback se o tipo estiver vazio. Padrão do sistema: {String(DENSIDADE_RESIDUO_PADRAO).replace('.', ',')}.
            Densidades por tipo ficam na tabela e salvam em <strong>Salvar limites</strong>.
          </span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700 }}>Tipo</th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700, color: '#b91c1c' }}>
                  Volume caixa (L)
                </th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700, color: '#b45309' }}>
                  Densidade (kg/L)
                </th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700, color: '#7c3aed' }}>
                  Peso ideal (kg) = vol × dens
                </th>
                <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700 }}>Peso máx. (kg)</th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_LIMITE_CAMINHAO.map((tipo) => {
                const densTipo = resolverDensidadePorTipo(tipo, {
                  global: densFormNum,
                  porTipo: formDensidadesParaMapa(densidadePorTipoForm),
                });
                return (
                <tr key={tipo} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{
                    padding: '0.4rem',
                    fontWeight: 700,
                    color: tipo === 'BASCULANTE' ? '#dc2626' : '#0f172a',
                  }}>
                    {LABEL_TIPO_CAMINHAO[tipo]}
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
                  <td style={{ padding: '0.3rem 0.4rem' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={salvandoLimites}
                      value={densidadePorTipoForm[tipo]}
                      onChange={(e) => setDensidadePorTipoForm((prev) => ({
                        ...prev,
                        [tipo]: e.target.value,
                      }))}
                      placeholder={String(resolverDensidadeResiduoKgL(densFormNum)).replace('.', ',')}
                      title={`Densidade do ${LABEL_TIPO_CAMINHAO[tipo]} (kg/L)`}
                      style={{
                        width: '100%', maxWidth: 100, fontSize: '0.72rem', fontWeight: 700,
                        fontFamily: 'ui-monospace, monospace',
                        border: '1px solid #fbbf24', borderRadius: '6px',
                        padding: '0.3rem 0.45rem', background: '#fffbeb', color: '#92400e',
                        textAlign: 'center',
                      }}
                    />
                  </td>
                  <td style={{ padding: '0.3rem 0.4rem' }}>
                    <div
                      title={`Volume ${volumeForm[tipo] || VOLUME_L_PADRAO[tipo]} L × densidade ${String(densTipo).replace('.', ',')} kg/L`}
                      style={{
                        width: '100%', maxWidth: 140, fontSize: '0.78rem', fontWeight: 800,
                        fontFamily: 'ui-monospace, monospace', color: '#5b21b6',
                        background: '#f5f3ff', border: '1px solid #c4b5fd', borderRadius: '6px',
                        padding: '0.35rem 0.45rem', textAlign: 'center',
                      }}
                    >
                      {pesosIdeaisForm[tipo] > 0
                        ? pesosIdeaisForm[tipo].toLocaleString('pt-BR')
                        : '—'}
                    </div>
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
                </tr>
                );
              })}
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

      {/* Densidade por caminhão (placa) */}
      <div style={{
        marginBottom: '0.75rem', background: '#fff', borderRadius: '8px',
        padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0',
        borderTop: '3px solid #0d9488', boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
      }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', marginBottom: '0.35rem' }}>
          <FiTruck size={12} style={{ marginRight: '0.25rem', verticalAlign: '-2px' }} />
          Densidade por caminhão
        </div>
        <div style={{ fontSize: '0.62rem', color: '#64748b', marginBottom: '0.55rem', lineHeight: 1.4 }}>
          As placas aparecem aqui ao subir a planilha (e no cadastro operacional abaixo).
          Deixe vazio para usar a densidade do tipo / padrão (0,55). Preencha só o caminhão especial (ex.: 0,43).
        </div>
        {placasFrotaLista.length === 0 ? (
          <div style={{
            fontSize: '0.68rem', color: '#94a3b8', padding: '0.55rem',
            background: '#f8fafc', borderRadius: '6px', border: '1px dashed #e2e8f0',
          }}>
            Nenhuma placa na frota ainda. Faça upload de uma planilha de coleta ou informe placas em “Placas ativas”.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
              <thead>
                <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700 }}>Placa</th>
                  <th style={{ padding: '0.35rem 0.4rem', fontWeight: 700, color: '#0f766e' }}>
                    Densidade (kg/L)
                  </th>
                  <th style={{ padding: '0.35rem 0.4rem', fontWeight: 600, color: '#94a3b8' }}>
                    Efetiva
                  </th>
                </tr>
              </thead>
              <tbody>
                {placasFrotaLista.map((placa) => {
                  const override = densidadePorPlacaForm[placa];
                  const efetiva = (() => {
                    const n = Number(String(override || '').replace(',', '.'));
                    if (Number.isFinite(n) && n > 0) return n;
                    return densFormNum;
                  })();
                  return (
                    <tr key={placa} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{
                        padding: '0.35rem 0.4rem', fontWeight: 700,
                        fontFamily: 'ui-monospace, monospace', color: '#0f172a',
                      }}>
                        {placa}
                      </td>
                      <td style={{ padding: '0.3rem 0.4rem' }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          disabled={salvandoDensidadePlaca}
                          value={override ?? ''}
                          placeholder="padrão"
                          onChange={(e) => {
                            const val = e.target.value;
                            setDensidadePorPlacaForm((prev) => {
                              const next = { ...prev };
                              if (!val.trim()) delete next[placa];
                              else next[placa] = val;
                              return next;
                            });
                          }}
                          style={{
                            width: 90, fontSize: '0.72rem', fontWeight: 700,
                            fontFamily: 'ui-monospace, monospace',
                            border: '1px solid #99f6e4', borderRadius: '6px',
                            padding: '0.28rem 0.4rem', background: '#fff', color: '#0f766e',
                            textAlign: 'center',
                          }}
                        />
                      </td>
                      <td style={{
                        padding: '0.35rem 0.4rem', fontFamily: 'ui-monospace, monospace',
                        color: override?.trim() ? '#0f766e' : '#94a3b8', fontWeight: 600,
                      }}>
                        {String(efetiva).replace('.', ',')} kg/L
                        {!override?.trim() ? ' (padrão)' : ''}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => { void salvarDensidadesPorPlaca(); }}
            disabled={salvandoDensidadePlaca || placasFrotaLista.length === 0}
            style={{
              fontSize: '0.68rem', fontWeight: 700, padding: '0.3rem 0.65rem',
              border: 'none', borderRadius: '5px',
              cursor: salvandoDensidadePlaca || placasFrotaLista.length === 0 ? 'not-allowed' : 'pointer',
              background: '#0d9488', color: '#fff',
              opacity: placasFrotaLista.length === 0 ? 0.5 : 1,
            }}
          >
            {salvandoDensidadePlaca ? 'Salvando…' : 'Salvar densidades por caminhão'}
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
          </div>
      </section>
      )}

      {abaHub === 'operacao' && (totalServicos === 0 ? (
        <div className="welcome-section">
          <div className="welcome-icon">
            <FiBarChart2 size={32} />
          </div>
          <h2>Preparando serviços padrão…</h2>
          <p>
            Este contrato receberá automaticamente todos os tipos de serviço (Coleta, Roçada, Capina, Varrição, Poda, Pintura e Remoção).
          </p>
          <div className="welcome-actions">
            <button className="btn-welcome" onClick={() => void carregarDados()}>
              <FiRefreshCw size={18} /> Tentar novamente
            </button>
          </div>
        </div>
      ) : (
        <section className="servicos-bloco">
          <div className="servicos-topo">
            <div className="servicos-topo-left">
              <h2>Serviços</h2>
              <span className="servicos-count">{totalServicos}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm contrato-btn-ghost"
              onClick={abrirModalCriacao}
              title="Adicionar serviço genérico ou cópia adicional"
            >
              <FiPlus size={14} /> Extra
            </button>
          </div>

          <div className="contrato-servicos-tiles">
            {servicos.map((servico) => {
              const etapas = servico.etapasStatus || {
                upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending',
              };
              const temUpload = (servico.totalRegistros || 0) > 0 || (servico.planilhas?.length || 0) > 0;
              const temKpi = etapas.config === 'done';
              const selecionado = servicoRegistrosId === servico.id;
              const statusCls = !temUpload ? 'is-empty' : temKpi ? 'is-ok' : 'is-warn';

              return (
                <article
                  key={servico.id}
                  className={`contrato-servico-tile ${statusCls}${selecionado ? ' is-selected' : ''}`}
                >
                  <button
                    type="button"
                    className="contrato-servico-tile-main"
                    onClick={() => setServicoRegistrosId((atual) => (atual === servico.id ? null : servico.id))}
                    title={`Ver registros de ${servico.nome}`}
                  >
                    <strong>{servico.nome}</strong>
                    <span className="contrato-servico-tile-meta">
                      {temUpload
                        ? `${(servico.totalRegistros || 0).toLocaleString('pt-BR')} reg.`
                        : 'Sem planilha'}
                    </span>
                  </button>
                  <div className="contrato-servico-tile-actions">
                    <button
                      type="button"
                      title="Abrir dashboard"
                      onClick={() => navigate(`/contratos/${id}/servicos/${servico.id}`)}
                    >
                      <FiBarChart2 size={13} />
                    </button>
                    <button
                      type="button"
                      title="Configurar"
                      onClick={() => navigate(`/contratos/${id}/servicos/${servico.id}/configurar`)}
                    >
                      <FiSettings size={13} />
                    </button>
                    <button
                      type="button"
                      title="Excluir tipo de serviço e dados"
                      className="is-danger"
                      onClick={() => prepararExclusao(servico)}
                    >
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {servicoRegistrosId && id && (() => {
            const servicoSel = servicos.find((s) => s.id === servicoRegistrosId);
            if (!servicoSel) return null;
            const qtd = servicoSel.totalRegistros || 0;
            return (
              <div className="contrato-registros-panel">
                <div className="contrato-registros-panel-head">
                  <div>
                    <strong>{servicoSel.nome}</strong>
                    <span>
                      {qtd > 0
                        ? `${qtd.toLocaleString('pt-BR')} registro(s)`
                        : 'Nenhum registro importado ainda'}
                    </span>
                  </div>
                  <div className="contrato-registros-panel-actions">
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => navigate(`/contratos/${id}/servicos/${servicoSel.id}`)}
                    >
                      <FiBarChart2 size={13} /> Dashboard
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-ghost"
                      onClick={() => setServicoRegistrosId(null)}
                      title="Fechar"
                    >
                      <FiX size={16} />
                    </button>
                  </div>
                </div>
                {qtd > 0 ? (
                  <DataTable
                    key={servicoSel.id}
                    servicoId={servicoSel.id}
                    contractId={id}
                    token={token}
                    adicionarToast={adicionarToast}
                    colunasPadrao={[]}
                  />
                ) : (
                  <div className="contrato-registros-vazio">
                    <FiUpload size={22} />
                    <p>Envie uma planilha no upload automático acima para popular este serviço.</p>
                  </div>
                )}
              </div>
            );
          })()}

        </section>
      ))}

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
        <div className="modal-overlay" onClick={fecharModalExclusao}>
          <div
            className="modal-card modal-exclusao-detalhada"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-excluir-servico"
          >
            <div className="exclusao-header">
              <div className="exclusao-icon">
                <FiTrash2 size={24} />
              </div>
              <h3 id="titulo-excluir-servico">Excluir serviço?</h3>
              <p className="exclusao-sub">
                {servicoExclusaoInfo.temDados
                  ? 'Isso apaga o tipo de serviço, planilhas, registros e totais do banco. Não será recriado ao reabrir o contrato.'
                  : 'Este tipo ainda não tem dados importados. A exclusão é permanente e o card não volta sozinho.'}
              </p>
            </div>

            <div className="exclusao-servico-nome">{servicoExclusaoInfo.nome}</div>
            <div className="exclusao-servico-tipo">{servicoExclusaoInfo.tipoLabel}</div>

            <div className={'exclusao-detalhes' + (servicoExclusaoInfo.temDados ? ' com-dados' : '')}>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiUpload size={13} /> Planilhas</span>
                <span className={'value' + (servicoExclusaoInfo.qtdPlanilhas > 0 ? ' destaque' : '')}>
                  {servicoExclusaoInfo.qtdPlanilhas}
                </span>
              </div>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiDatabase size={13} /> Registros</span>
                <span className={'value' + (servicoExclusaoInfo.qtdRegistros > 0 ? ' destaque' : '')}>
                  {servicoExclusaoInfo.qtdRegistros.toLocaleString('pt-BR')}
                </span>
              </div>
              <div className="exclusao-detalhe-item">
                <span className="label"><FiBarChart2 size={13} /> KPIs</span>
                <span className="value">{servicoExclusaoInfo.temKpis ? 'Configurados' : 'Não configurados'}</span>
              </div>
            </div>

            {servicoExclusaoInfo.temDados ? (
              <>
                <div className="exclusao-confirmacao">
                  Para confirmar, digite <strong>{TEXTO_CONFIRMA_EXCLUSAO}</strong>
                </div>
                <input
                  className={'exclusao-input' + (confirmacaoExclusaoOk ? ' correto' : '')}
                  type="text"
                  value={confirmacaoExclusao}
                  onChange={e => setConfirmacaoExclusao(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && confirmacaoExclusaoOk && !excluindoServico) {
                      e.preventDefault();
                      void excluirServico();
                    }
                    if (e.key === 'Escape') fecharModalExclusao();
                  }}
                  placeholder={`Digite ${TEXTO_CONFIRMA_EXCLUSAO}`}
                  autoFocus
                  disabled={excluindoServico}
                  autoComplete="off"
                />
              </>
            ) : (
              <label className="exclusao-check">
                <input
                  type="checkbox"
                  checked={confirmacaoExclusao === TEXTO_CONFIRMA_EXCLUSAO}
                  onChange={(e) => setConfirmacaoExclusao(e.target.checked ? TEXTO_CONFIRMA_EXCLUSAO : '')}
                  disabled={excluindoServico}
                />
                Confirmo que quero excluir este serviço
              </label>
            )}

            <div className="modal-actions exclusao-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fecharModalExclusao}
                disabled={excluindoServico}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => void excluirServico()}
                disabled={!confirmacaoExclusaoOk || excluindoServico}
              >
                {excluindoServico ? (
                  <><FiRefreshCw size={14} className="spin" /> Excluindo...</>
                ) : (
                  <><FiTrash2 size={14} /> Excluir definitivamente</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
