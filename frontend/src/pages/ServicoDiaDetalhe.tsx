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
import { analisarCenarioCaixaMediaDia } from '../utils/cenarioCaixaMediaDia';
import { gerarHtmlRelatorioRocadaDia } from '../utils/gerarHtmlRelatorioRocadaDia';
import { gerarHtmlRelatorioUnidadeDia } from '../utils/gerarHtmlRelatorioUnidadeDia';
import {
  gerarNomePdfRelatorioRocadaDia,
  gerarNomePdfRelatorioUnidadeDia,
} from '../utils/gerarNomePdf';
import { extrairPlacasReservaContrato } from '../utils/placasReserva';
import type { MapaLimiteCaminhao } from '../utils/limitesCaminhaoContrato';
import SkeletonLoader from '../components/SkeletonLoader';
import OperacaoDiaPanel from '../components/OperacaoDiaPanel';
import ReguaTemporalDiaPainel from '../components/ReguaTemporalDiaPainel';
import { useReguaDia } from '../hooks/useReguaDia';
import RocadaDiaPanel, { type BlocoTipoRocadaUi } from '../components/RocadaDiaPanel';
import ServicoUnidadeDiaPanel from '../components/ServicoUnidadeDiaPanel';
import VerificacaoViagensPanel, { type VerificacaoViagensData } from '../components/VerificacaoViagensPanel';
import type { AnaliseRocadaDia, LinhaRocadaAgrupada } from '../utils/operacaoRocada';
import {
  ehServicoPorUnidade,
  metricaPrincipalDoDia,
  unidadeOperacionalDoTipo,
} from '../utils/unidadeServico';

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
  const [limitesPesoKg, setLimitesPesoKg] = useState<MapaLimiteCaminhao | null>(null);
  const [volumeL, setVolumeL] = useState<MapaLimiteCaminhao | null>(null);
  const [densidadeResiduoKgL, setDensidadeResiduoKgL] = useState<number | null>(null);
  const [densidadeKgL, setDensidadeKgL] = useState<MapaLimiteCaminhao | null>(null);
  const [densidadeKgLPorPlaca, setDensidadeKgLPorPlaca] = useState<Record<string, number> | null>(null);
  const [registros, setRegistros] = useState<Record<string, unknown>[]>([]);
  const [analiseRocada, setAnaliseRocada] = useState<AnaliseRocadaDia | null>(null);
  const [blocoManualRocada, setBlocoManualRocada] = useState<BlocoTipoRocadaUi | null>(null);
  const [blocoMecanizadaRocada, setBlocoMecanizadaRocada] = useState<BlocoTipoRocadaUi | null>(null);
  const [porTipoRocada, setPorTipoRocada] = useState<LinhaRocadaAgrupada[]>([]);
  const [analiseColeta, setAnaliseColeta] = useState<OperacaoDiaAnalise | null>(null);
  const [totalRegistrosDia, setTotalRegistrosDia] = useState(0);
  const [agregacaoUnidadeDia, setAgregacaoUnidadeDia] = useState<{
    areaM2?: number;
    metroLinear?: number;
    kmLinear?: number;
    qtdArvore?: number;
    quantitativo?: number;
    rotas?: number;
  } | null>(null);
  const [paginaRegistros, setPaginaRegistros] = useState(1);
  const [totalPaginasRegistros, setTotalPaginasRegistros] = useState(1);
  const [incluirTodos, setIncluirTodos] = useState(false);
  const [carregandoRegistros, setCarregandoRegistros] = useState(true);
  const [mostrarRegistros, setMostrarRegistros] = useState(false);
  const [exportandoPdf, setExportandoPdf] = useState(false);
  const [verificacaoViagens, setVerificacaoViagens] = useState<VerificacaoViagensData | null>(null);
  const [diaInicioCiclo, setDiaInicioCiclo] = useState(1);
  const ehRocada = tipoServico === 'rocadeira';
  const ehPorUnidade = ehServicoPorUnidade(tipoServico);
  const unidade = unidadeOperacionalDoTipo(tipoServico);
  const ehUnidadeNaoRocada = ehPorUnidade && !ehRocada;

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
      setDiaInicioCiclo(Number((contrato as { diaInicioCiclo?: number })?.diaInicioCiclo) || 1);
      setConfigFaturamento(
        (padrao?.servico as { configFaturamento?: typeof configFaturamento } | undefined)?.configFaturamento
        || null,
      );
      setPlacasReserva(extrairPlacasReservaContrato(contrato));
      {
        const cfg = (contrato as {
          configOperacional?: {
            pesoMaximoKg?: MapaLimiteCaminhao;
            volumeL?: MapaLimiteCaminhao;
            densidadeResiduoKgL?: number | null;
            densidadeKgL?: MapaLimiteCaminhao | null;
            densidadeKgLPorPlaca?: Record<string, number> | null;
          };
        })?.configOperacional;
        setLimitesPesoKg(cfg?.pesoMaximoKg || null);
        setVolumeL(cfg?.volumeL || null);
        setDensidadeResiduoKgL(
          cfg?.densidadeResiduoKgL != null && cfg.densidadeResiduoKgL > 0
            ? cfg.densidadeResiduoKgL
            : null,
        );
        setDensidadeKgL(cfg?.densidadeKgL || null);
        setDensidadeKgLPorPlaca(cfg?.densidadeKgLPorPlaca || null);
      }

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
        setAgregacaoUnidadeDia(null);
        setTotalRegistrosDia(agg.resumo.registros);
        setRegistros([]);
        setPaginaRegistros(1);
        setTotalPaginasRegistros(1);
      } else if (
        tipo === 'capina' || tipo === 'varricao' || tipo === 'poda'
        || tipo === 'pintura_meio_fio'
      ) {
        // Capina / varrição / poda: métricas da planilha (não usa agregação de coleta)
        setAnaliseRocada(null);
        setBlocoManualRocada(null);
        setBlocoMecanizadaRocada(null);
        setPorTipoRocada([]);
        setAnaliseColeta(null);
        const [resumoApi, pagina1] = await Promise.all([
          servicoService.getResumoCicloPorDia(contractId, servicoId, {
            dataInicio: dataIso,
            dataFim: dataIso,
          }),
          servicoService.buscarRegistrosDia(contractId, servicoId, dataIso, {
            pagina: 1,
            limite: PAGE_SIZE,
            incluirInconsistentes: true,
          }),
        ]);
        const dia = (resumoApi.dias || []).find((d) => d.data === dataIso) || resumoApi.dias?.[0];
        const regs = Math.max(
          Number(dia?.rotas || 0),
          Number(pagina1.total || 0),
          (pagina1.dados || []).length,
        );
        setAgregacaoUnidadeDia({
          areaM2: Number(dia?.areaM2 || 0),
          metroLinear: Number(dia?.metroLinear || 0),
          kmLinear: Number(dia?.kmLinear || 0),
          qtdArvore: Number(dia?.qtdArvore || 0),
          quantitativo: Number(dia?.quantitativo || 0),
          rotas: regs,
        });
        setTotalRegistrosDia(regs);
        setRegistros(pagina1.dados || []);
        setPaginaRegistros(1);
        setTotalPaginasRegistros(Math.max(1, pagina1.totalPaginas || Math.ceil(regs / PAGE_SIZE) || 1));
      } else {
        setAnaliseRocada(null);
        setBlocoManualRocada(null);
        setBlocoMecanizadaRocada(null);
        setPorTipoRocada([]);
        setAgregacaoUnidadeDia(null);
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
      setAgregacaoUnidadeDia(null);
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
        // Serviços por unidade não passam por validação de viagem de coleta
        incluirInconsistentes: incluirTodos || ehServicoPorUnidade(tipoServico),
      });
      setRegistros(resultado.dados || []);
      setPaginaRegistros(resultado.pagina || pagina);
      setTotalPaginasRegistros(resultado.totalPaginas || 1);
      if (!ehServicoPorUnidade(tipoServico) || !agregacaoUnidadeDia) {
        setTotalRegistrosDia(resultado.total || 0);
      }
    } catch {
      adicionarToast('Erro ao carregar página de registros', 'error');
    } finally {
      setCarregandoRegistros(false);
    }
  }, [contractId, servicoId, dataIso, dataValida, incluirTodos, adicionarToast, tipoServico, agregacaoUnidadeDia]);

  useEffect(() => {
    carregarMeta();
  }, [carregarMeta]);

  useEffect(() => {
    if (!mostrarRegistros) return;
    // Capina/varrição/poda já carregam a 1ª página no meta; só busca de novo se mudar a página
    if (ehUnidadeNaoRocada && paginaRegistros === 1 && registros.length > 0) return;
    carregarPaginaRegistros(paginaRegistros);
  }, [mostrarRegistros, paginaRegistros, carregarPaginaRegistros, ehUnidadeNaoRocada, registros.length]);

  useEffect(() => {
    if (!contractId || !servicoId || !dataValida || ehPorUnidade) {
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
  }, [contractId, servicoId, dataIso, dataValida, ehPorUnidade]);

  // dados-dia já vem filtrado pela data; para unidade não refiltrar (evita perder linhas)
  const registrosDia = useMemo(
    () => (ehUnidadeNaoRocada ? registros : filtrarRegistrosPorDia(registros, dataIso)),
    [registros, dataIso, ehUnidadeNaoRocada],
  );

  const linhas = useMemo(() => listarLinhasDia(registrosDia), [registrosDia]);
  const validacao = useMemo(
    () => (dataValida && registrosDia.length > 0 && !ehPorUnidade
      ? validarDadosDia(registrosDia, dataIso, resumoCiclo)
      : null),
    [registrosDia, dataIso, dataValida, resumoCiclo, ehPorUnidade],
  );

  const cenarioCaixaMedia = useMemo(() => {
    if (ehPorUnidade) return null;
    const op = analiseColeta || (registrosDia.length ? analisarOperacaoDia(registrosDia) : null);
    if (!op || op.resumo.viagens <= 0) return null;
    return analisarCenarioCaixaMediaDia(op, {
      registros: registrosDia,
      volumeL,
      densidadeResiduoKgL,
      densidadeKgL,
      densidadeKgLPorPlaca,
    });
  }, [
    ehPorUnidade, analiseColeta, registrosDia, volumeL, densidadeResiduoKgL, densidadeKgL,
    densidadeKgLPorPlaca,
  ]);

  const regua = useReguaDia({
    contractId,
    servicoId,
    dataIso,
    diaInicioCiclo,
    ativo: dataValida && !ehPorUnidade,
  });

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

    if (ehUnidadeNaoRocada) {
      const agreg = agregacaoUnidadeDia || {
        metroLinear: 0,
        kmLinear: 0,
        qtdArvore: 0,
        quantitativo: 0,
        rotas: totalRegistrosDia,
      };
      const metrica = metricaPrincipalDoDia(tipoServico, agreg);
      if (metrica.valor <= 0 && totalRegistrosDia <= 0) {
        adicionarToast('Nenhum dado da planilha para exportar neste dia', 'warning');
        return;
      }
      setExportandoPdf(true);
      try {
        let regsExport = registrosDia;
        if (
          contractId && servicoId
          && (regsExport.length < totalRegistrosDia || totalRegistrosDia > regsExport.length)
        ) {
          const full = await servicoService.getDadosDia(contractId, servicoId, dataIso, {
            all: true,
            incluirInconsistentes: true,
          });
          regsExport = full?.dados || regsExport;
        }
        const html = gerarHtmlRelatorioUnidadeDia({
          servicoNome,
          contratoNome: contratoNome || undefined,
          dataIso,
          diaSemana,
          tipoServico,
          agregacao: agreg,
          registros: regsExport,
          totalRegistros: totalRegistrosDia || regsExport.length,
          kpisOperacao: kpisOperacao.slice(0, 8),
        });
        const nomeArquivo = gerarNomePdfRelatorioUnidadeDia({ servicoNome, dataIso });
        await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
        adicionarToast('PDF diário exportado', 'success');
      } catch {
        adicionarToast('Erro ao gerar PDF do dia', 'error');
      } finally {
        setExportandoPdf(false);
      }
      return;
    }

    if (!contractId || !servicoId) {
      adicionarToast('Contrato ou serviço não identificado', 'warning');
      return;
    }

    setExportandoPdf(true);
    try {
      const { blob, filename } = await servicoService.baixarRelatorioDiaOperacao(
        contractId,
        servicoId,
        dataIso,
      );
      pdfService.downloadBlob(blob, filename);
      adicionarToast('PDF de operação exportado', 'success');
    } catch {
      adicionarToast('Erro ao gerar PDF', 'error');
    } finally {
      setExportandoPdf(false);
    }
  }, [
    adicionarToast, ehRocada, ehUnidadeNaoRocada, analiseRocada,
    servicoNome, contratoNome, dataIso, diaSemana, kpisOperacao,
    porTipoRocada, blocoManualRocada, blocoMecanizadaRocada, configFaturamento,
    agregacaoUnidadeDia, totalRegistrosDia, tipoServico, registrosDia,
    contractId, servicoId,
  ]);

  const carregandoPainel = ehRocada
    ? (!analiseRocada && carregandoRegistros)
    : ehUnidadeNaoRocada
      ? carregandoRegistros && registros.length === 0
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
            <div style={{
              fontSize: '0.65rem', fontWeight: 800, color: '#a5b4fc',
              textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem',
            }}>
              Relatório de operação do dia
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <FiCalendar size={18} color="#a5b4fc" />
              <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>
                {formatarIsoParaBr(dataIso)}
              </h1>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{diaSemana}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
              {servicoNome}
              {contratoNome ? ` · ${contratoNome}` : ''}
              {' · '}
              {ehRocada ? 'roçada do dia' : ehUnidadeNaoRocada ? `${unidade.labelMetrica.toLowerCase()} do dia` : 'coleta · operação do dia'}
            </div>
          </div>
          {(() => {
            const semDadosPdf = ehRocada
              ? !(analiseRocada?.resumo.areaM2)
              : ehUnidadeNaoRocada
                ? !(
                  totalRegistrosDia > 0
                  || metricaPrincipalDoDia(tipoServico, agregacaoUnidadeDia || {}).valor > 0
                )
                : !(analiseColeta?.resumo.viagens);
            const tituloPdf = ehRocada
              ? 'Exportar PDF diário de roçada'
              : ehUnidadeNaoRocada
                ? `Exportar PDF diário de ${unidade.labelMetrica.toLowerCase()}`
                : 'Exportar PDF da operação do dia';
            const labelPdf = ehRocada
              ? 'PDF Roçada'
              : ehUnidadeNaoRocada
                ? 'PDF do Dia'
                : 'PDF Operação';
            return (
              <button
                type="button"
                onClick={exportarPdfDia}
                disabled={exportandoPdf || carregandoPainel || semDadosPdf}
                title={tituloPdf}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  fontSize: '0.72rem', fontWeight: 600, padding: '0.45rem 0.75rem',
                  borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)',
                  background: exportandoPdf ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.12)',
                  color: semDadosPdf ? '#64748b' : '#fff',
                  cursor: exportandoPdf || carregandoPainel || semDadosPdf
                    ? 'not-allowed'
                    : 'pointer',
                }}
              >
                <FiDownload size={14} />
                {exportandoPdf ? 'Gerando...' : labelPdf}
              </button>
            );
          })()}
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
          valorM2={configFaturamento?.valorM2 ?? null}
          valorM2Manual={configFaturamento?.valorM2Manual ?? null}
          valorM2Mecanizada={configFaturamento?.valorM2Mecanizada ?? null}
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
      ) : ehUnidadeNaoRocada ? (
        <ServicoUnidadeDiaPanel
          dataIso={dataIso}
          tipoServico={tipoServico}
          registros={registrosDia}
          totalRegistros={totalRegistrosDia || registrosDia.length}
          agregacaoDia={agregacaoUnidadeDia || resumoCiclo || null}
          carregandoRegistros={carregandoRegistros}
          mostrarRegistros={mostrarRegistros}
          onToggleRegistros={() => {
            setMostrarRegistros((v) => {
              if (!v) setPaginaRegistros(1);
              return !v;
            });
          }}
          kpisOperacao={kpisOperacao}
          loadingKpis={loadingKpis}
        />
      ) : (
        <>
          {verificacaoViagens && (
            <VerificacaoViagensPanel dados={verificacaoViagens} compacto />
          )}
          <ReguaTemporalDiaPainel baseline={regua.baseline} carregando={regua.carregando} />
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
            cenarioCaixaMedia={cenarioCaixaMedia}
            volumeL={volumeL}
            densidadeResiduoKgL={densidadeResiduoKgL}
            densidadeKgL={densidadeKgL}
            densidadeKgLPorPlaca={densidadeKgLPorPlaca}
            limitesPesoKg={limitesPesoKg}
            contractId={contractId}
            servicoId={servicoId}
          />
        </>
      )}
    </div>
  );
}
