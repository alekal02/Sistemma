import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  FiArrowLeft, FiCalendar, FiDownload,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { useKpiCalculator } from '../hooks/useKpiCalculator';
import servicoService from '../services/servicoService';
import contractService from '../services/contractService';
import { isRequestAborted } from '../services/abortableRequest';
import pdfService from '../services/pdfService';
import { formatarIsoParaBr } from '../utils/periodoDados';
import type { DadoDiario } from '../utils/relatorioDiario';
import {
  isDataIsoValida,
  listarLinhasDia,
  validarDadosDia,
  filtrarRegistrosPorDia,
} from '../utils/dadosPorDia';
import { analisarOperacaoDia, analiseOperacaoDeAgregacaoSql, isKpiMetricaBaseOperacao, type OperacaoDiaAnalise } from '../utils/operacaoDia';
import { analisarEstudoRotasDia } from '../utils/estudoRotasDia';
import { gerarHtmlRelatorioDia } from '../utils/gerarHtmlRelatorioDia';
import { gerarHtmlRelatorioRocadaDia } from '../utils/gerarHtmlRelatorioRocadaDia';
import { gerarNomePdfRelatorioDia, gerarNomePdfRelatorioRocadaDia } from '../utils/gerarNomePdf';
import { extrairPlacasReservaContrato } from '../utils/placasReserva';
import SkeletonLoader from '../components/SkeletonLoader';
import OperacaoDiaPanel from '../components/OperacaoDiaPanel';
import RocadaDiaPanel, { type BlocoTipoRocadaUi } from '../components/RocadaDiaPanel';
import VerificacaoViagensPanel, { type VerificacaoViagensData } from '../components/VerificacaoViagensPanel';
import type { AnaliseRocadaDia, LinhaRocadaAgrupada } from '../utils/operacaoRocada';

const DIAS_SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PAGE_SIZE = 100;

interface LocationState {
  resumoDia?: DadoDiario;
}

function isKpiReceita(nome: string, formato: string): boolean {
  if (formato === 'moeda') return true;
  const n = nome.toLowerCase();
  return ['faturamento', 'receita', 'financeiro', 'valor', 'custo', 'lucro', 'preco', 'r$'].some((p) => n.includes(p));
}

export default function ServicoDiaDetalhe() {
  const { contractId, servicoId, data } = useParams<{
    contractId: string;
    servicoId: string;
    data: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();

  const resumoCiclo = (location.state as LocationState | null)?.resumoDia ?? null;

  const [servicoNome, setServicoNome] = useState('Serviço');
  const [contratoNome, setContratoNome] = useState('');
  const [tipoServico, setTipoServico] = useState<string>('coleta_caminhao');
  const [configFaturamento, setConfigFaturamento] = useState<{
    valorM2?: number | null;
    valorM2Manual?: number | null;
    valorM2Mecanizada?: number | null;
  } | null>(null);
  const [placasReserva, setPlacasReserva] = useState<string[]>([]);
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [analiseRocada, setAnaliseRocada] = useState<AnaliseRocadaDia | null>(null);
  const [blocoManualRocada, setBlocoManualRocada] = useState<BlocoTipoRocadaUi | null>(null);
  const [blocoMecanizadaRocada, setBlocoMecanizadaRocada] = useState<BlocoTipoRocadaUi | null>(null);
  const [porTipoRocada, setPorTipoRocada] = useState<LinhaRocadaAgrupada[]>([]);
  const [analiseColeta, setAnaliseColeta] = useState<OperacaoDiaAnalise | null>(null);
  const [totalRegistrosDia, setTotalRegistrosDia] = useState(0);
  const [paginaRegistros, setPaginaRegistros] = useState(1);
  const [totalPaginasRegistros, setTotalPaginasRegistros] = useState(1);
  const [incluirTodos, setIncluirTodos] = useState(false);
  const [carregandoRegistros, setCarregandoRegistros] = useState(true);
  const [mostrarRegistros, setMostrarRegistros] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [verificacaoViagens, setVerificacaoViagens] = useState<VerificacaoViagensData | null>(null);
  const ehRocada = tipoServico === 'rocadeira';

  const dataIso = data ?? '';
  const dataValida = isDataIsoValida(dataIso);

  const filtrosDia = useMemo(
    () => (dataValida ? { dataInicio: dataIso, dataFim: dataIso } : undefined),
    [dataIso, dataValida],
  );

  const {
    kpiValores,
    loading: loadingKpis,
  } = useKpiCalculator({
    contractId: contractId || '',
    servicoId: servicoId || '',
    filtros: filtrosDia,
  });

  const diaSemana = useMemo(() => {
    if (!dataValida) return '';
    const [y, m, d] = dataIso.split('-').map(Number);
    return DIAS_SEM[new Date(y, m - 1, d).getDay()];
  }, [dataIso, dataValida]);

  const kpisOperacao = useMemo(
    () => kpiValores.filter((k) => !isKpiReceita(k.nome, k.formato)),
    [kpiValores],
  );

  const kpisOperacaoAvancados = useMemo(
    () => kpisOperacao.filter((k) => !isKpiMetricaBaseOperacao(k.nome)),
    [kpisOperacao],
  );

  const voltar = useCallback(() => {
    navigate(`/contratos/${contractId}/servicos/${servicoId}`);
  }, [navigate, contractId, servicoId]);

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Visão Geral', href: '/visao-geral' },
      { label: 'Contratos', href: '/contratos' },
      { label: servicoNome, href: `/contratos/${contractId}/servicos/${servicoId}` },
      { label: dataValida ? formatarIsoParaBr(dataIso) : 'Dia' },
    ]);
  }, [servicoNome, contractId, servicoId, dataIso, dataValida, setBreadcrumbs]);

  const carregarMeta = useCallback(async () => {
    if (!contractId || !servicoId || !dataValida) return;
    setCarregandoRegistros(true);
    try {
      const [padrao, contrato] = await Promise.all([
        servicoService.getPadrao(contractId, servicoId),
        contractService.buscar(contractId),
      ]);
      const tipo = padrao?.servico?.tipo || 'coleta_caminhao';
      setServicoNome(padrao?.servico?.nome || 'Serviço');
      setTipoServico(tipo);
      setContratoNome((contrato as { nome?: string })?.nome || '');
      setConfigFaturamento(
        (padrao?.servico as { configFaturamento?: typeof configFaturamento } | undefined)?.configFaturamento
        || null,
      );
      setPlacasReserva(extrairPlacasReservaContrato(contrato));

      if (tipo === 'rocadeira') {
        const agg = await servicoService.getRocadaAgregacao(contractId, servicoId, { data: dataIso });
        setAnaliseRocada({
          resumo: {
            ...agg.resumo,
            areaManualM2: agg.resumo.areaManualM2,
            areaMecanizadaM2: agg.resumo.areaMecanizadaM2,
            registrosManual: agg.resumo.registrosManual,
            registrosMecanizada: agg.resumo.registrosMecanizada,
          },
          porBairro: agg.porBairro,
          porOperador: agg.porOperador,
          porEquipe: agg.porEquipe,
          porEquipamento: agg.porEquipamento,
        });
        setBlocoManualRocada(agg.manual || null);
        setBlocoMecanizadaRocada(agg.mecanizada || null);
        setPorTipoRocada(agg.porTipo || []);
        setAnaliseColeta(null);
        setTotalRegistrosDia(agg.resumo.registros);
        setRegistros([]);
        setPaginaRegistros(1);
        setTotalPaginasRegistros(1);
      } else {
        setAnaliseRocada(null);
        setBlocoManualRocada(null);
        setBlocoMecanizadaRocada(null);
        setPorTipoRocada([]);
        const agg = await servicoService.getColetaAgregacao(contractId, servicoId, { data: dataIso });
        setAnaliseColeta(analiseOperacaoDeAgregacaoSql(agg));
        setTotalRegistrosDia(agg.resumo.registros);
        setRegistros([]);
        setPaginaRegistros(1);
        setTotalPaginasRegistros(Math.max(1, Math.ceil((agg.resumo.registros || 0) / PAGE_SIZE)));
      }
    } catch (err) {
      if (isRequestAborted(err)) return;
      adicionarToast('Erro ao carregar registros do dia', 'error');
      setRegistros([]);
      setAnaliseRocada(null);
      setBlocoManualRocada(null);
      setBlocoMecanizadaRocada(null);
      setPorTipoRocada([]);
      setAnaliseColeta(null);
    } finally {
      setCarregandoRegistros(false);
    }
  }, [contractId, servicoId, dataIso, dataValida, adicionarToast]);

  const carregarPaginaRegistros = useCallback(async (pagina: number) => {
    if (!contractId || !servicoId || !dataValida) return;
    setCarregandoRegistros(true);
    try {
      const resultado = await servicoService.buscarRegistrosDia(contractId, servicoId, dataIso, {
        pagina,
        limite: PAGE_SIZE,
        incluirInconsistentes: incluirTodos,
      });
      setRegistros(resultado.dados || []);
      setPaginaRegistros(resultado.pagina || pagina);
      setTotalPaginasRegistros(resultado.totalPaginas || 1);
      setTotalRegistrosDia(resultado.total || 0);
    } catch {
      adicionarToast('Erro ao carregar página de registros', 'error');
    } finally {
      setCarregandoRegistros(false);
    }
  }, [contractId, servicoId, dataIso, dataValida, incluirTodos, adicionarToast]);

  useEffect(() => {
    carregarMeta();
  }, [carregarMeta]);

  useEffect(() => {
    if (!mostrarRegistros) return;
    carregarPaginaRegistros(paginaRegistros);
  }, [mostrarRegistros, paginaRegistros, carregarPaginaRegistros]);

  useEffect(() => {
    if (!contractId || !servicoId || !dataValida || ehRocada) {
      setVerificacaoViagens(null);
      return;
    }
    let cancelado = false;
    const timer = window.setTimeout(() => {
      servicoService.getVerificacaoViagens(contractId, servicoId, {
        dataInicio: dataIso,
        dataFim: dataIso,
      }).then((d) => { if (!cancelado) setVerificacaoViagens(d); })
        .catch(() => { if (!cancelado) setVerificacaoViagens(null); });
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [contractId, servicoId, dataIso, dataValida, ehRocada]);

  const registrosDia = useMemo(
    () => filtrarRegistrosPorDia(registros, dataIso),
    [registros, dataIso],
  );

  const linhas = useMemo(() => listarLinhasDia(registrosDia), [registrosDia]);
  const validacao = useMemo(
    () => (dataValida && registrosDia.length > 0 ? validarDadosDia(registrosDia, dataIso, resumoCiclo) : null),
    [registrosDia, dataIso, dataValida, resumoCiclo],
  );

  const exportarPdfDia = useCallback(async () => {
    if (ehRocada) {
      if (!analiseRocada || analiseRocada.resumo.areaM2 <= 0) {
        adicionarToast('Nenhuma área (m²) para exportar neste dia', 'warning');
        return;
      }
      setExportandoPdf(true);
      try {
        const html = gerarHtmlRelatorioRocadaDia({
          servicoNome,
          contratoNome: contratoNome || undefined,
          dataIso,
          diaSemana,
          analise: analiseRocada,
          porTipo: porTipoRocada,
          blocoManual: blocoManualRocada,
          blocoMecanizada: blocoMecanizadaRocada,
          valorM2: configFaturamento?.valorM2 ?? null,
          valorM2Manual: configFaturamento?.valorM2Manual ?? null,
          valorM2Mecanizada: configFaturamento?.valorM2Mecanizada ?? null,
        });
        const nomeArquivo = gerarNomePdfRelatorioRocadaDia({
          servicoNome,
          dataIso,
        });
        await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
        adicionarToast('PDF diário de roçada exportado', 'success');
      } catch {
        adicionarToast('Erro ao gerar PDF de roçada', 'error');
      } finally {
        setExportandoPdf(false);
      }
      return;
    }

    const operacao = analiseColeta || (registrosDia.length ? analisarOperacaoDia(registrosDia) : null);
    if (!operacao || operacao.resumo.viagens <= 0) {
      adicionarToast('Nenhum dado operacional para exportar', 'warning');
      return;
    }

    const estudoRotas = registrosDia.length ? analisarEstudoRotasDia(registrosDia) : null;

    setExportandoPdf(true);
    try {
      const html = gerarHtmlRelatorioDia({
        aba: 'operacao',
        servicoNome,
        dataIso,
        diaSemana,
        operacao,
        receita: null,
        linhas,
        kpisOperacao: kpisOperacaoAvancados.slice(0, 8),
        placasReserva,
        estudoRotas,
      });
      const nomeArquivo = gerarNomePdfRelatorioDia({
        servicoNome,
        aba: 'operacao',
        dataIso,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      adicionarToast('PDF de operação exportado', 'success');
    } catch {
      adicionarToast('Erro ao gerar PDF', 'error');
    } finally {
      setExportandoPdf(false);
    }
  }, [
    registrosDia, linhas, adicionarToast, ehRocada, analiseRocada, analiseColeta,
    servicoNome, contratoNome, dataIso, diaSemana, kpisOperacaoAvancados, placasReserva,
    porTipoRocada, blocoManualRocada, blocoMecanizadaRocada, configFaturamento,
  ]);

  const carregandoPainel = ehRocada
    ? (!analiseRocada && carregandoRegistros)
    : (!analiseColeta && carregandoRegistros);

  if (!dataValida) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1rem' }}>
        <p>Data inválida na URL.</p>
        <button type="button" onClick={voltar} className="btn btn-secondary">Voltar</button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <button
        type="button"
        onClick={voltar}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          border: 'none', background: 'none', color: '#6366f1',
          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', marginBottom: '0.75rem',
        }}
      >
        <FiArrowLeft size={14} /> Voltar ao serviço
      </button>

      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1rem',
        border: '1px solid #334155', color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <FiCalendar size={18} color="#a5b4fc" />
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                {formatarIsoParaBr(dataIso)}
              </h1>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{diaSemana}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {servicoNome} · {ehRocada ? 'roçada do dia' : 'operação do dia'}
            </div>
          </div>
          <button
            type="button"
            onClick={exportarPdfDia}
            disabled={
              exportandoPdf
              || carregandoPainel
              || (ehRocada
                ? !(analiseRocada?.resumo.areaM2)
                : !(analiseColeta?.resumo.viagens))
            }
            title={ehRocada ? 'Exportar PDF diário de roçada' : 'Exportar PDF da operação do dia'}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.72rem', fontWeight: 600, padding: '0.45rem 0.75rem',
              borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)',
              background: exportandoPdf ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
              color: (ehRocada ? !(analiseRocada?.resumo.areaM2) : !(analiseColeta?.resumo.viagens))
                ? '#64748b'
                : '#fff',
              cursor: exportandoPdf || carregandoPainel
                || (ehRocada ? !(analiseRocada?.resumo.areaM2) : !(analiseColeta?.resumo.viagens))
                ? 'not-allowed'
                : 'pointer',
            }}
          >
            <FiDownload size={14} />
            {exportandoPdf ? 'Gerando...' : (ehRocada ? 'PDF Roçada' : 'PDF Operação')}
          </button>
        </div>
      </div>

      {carregandoPainel ? (
        <SkeletonLoader tipo="kpi-grid" quantidade={6} />
      ) : ehRocada ? (
        <RocadaDiaPanel
          dataIso={dataIso}
          analise={analiseRocada}
          blocoManual={blocoManualRocada}
          blocoMecanizada={blocoMecanizadaRocada}
          porTipo={porTipoRocada}
          registros={registros}
          totalRegistros={totalRegistrosDia}
          carregandoRegistros={carregandoRegistros}
          mostrarRegistros={mostrarRegistros}
          onToggleRegistros={() => {
            setMostrarRegistros((v) => {
              if (!v) setPaginaRegistros(1);
              return !v;
            });
          }}
          pagina={paginaRegistros}
          totalPaginas={totalPaginasRegistros}
          onPaginaChange={setPaginaRegistros}
        />
      ) : (
        <>
          {verificacaoViagens && (
            <VerificacaoViagensPanel dados={verificacaoViagens} compacto />
          )}
          <OperacaoDiaPanel
            dataIso={dataIso}
            registros={registrosDia}
            linhas={linhas}
            kpisOperacao={kpisOperacao}
            loadingKpis={loadingKpis}
            carregandoRegistros={carregandoRegistros}
            mostrarRegistros={mostrarRegistros}
            onToggleRegistros={() => {
              setMostrarRegistros((v) => {
                if (!v) setPaginaRegistros(1);
                return !v;
              });
            }}
            incluirTodos={incluirTodos}
            onIncluirTodos={(v) => {
              setIncluirTodos(v);
              setPaginaRegistros(1);
            }}
            onRecarregar={carregarMeta}
            validacao={validacao}
            placasReserva={placasReserva}
            analiseSql={analiseColeta}
            totalRegistros={totalRegistrosDia}
            pagina={paginaRegistros}
            totalPaginas={totalPaginasRegistros}
            onPaginaChange={setPaginaRegistros}
          />
        </>
      )}
    </div>
  );
}
