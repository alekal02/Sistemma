/**
 * CicloDateSelector — visão do ciclo com resumo e navegação por dia.
 */
import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCalendar, FiChevronLeft, FiChevronRight, FiList, FiDownload,
  FiTruck, FiTrendingUp, FiArrowRight, FiEye, FiEyeOff, FiLock,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import pdfService from '../services/pdfService';
import { gerarHtmlRelatorioOperacionalPeriodo } from '../utils/gerarHtmlRelatorioOperacionalPeriodo';
import { gerarHtmlRelatorioRocadaCiclo } from '../utils/gerarHtmlRelatorioRocadaCiclo';
import { gerarHtmlRelatorioUnidadeCiclo } from '../utils/gerarHtmlRelatorioUnidadeCiclo';
import { gerarHtmlRelatorioHodometroSaude } from '../utils/gerarHtmlRelatorioHodometroSaude';
import { analisarHodometroSaude } from '../utils/relatorioHodometroSaude';
import { analisarOperacaoDia } from '../utils/operacaoDia';
import type { MapaLimiteCaminhao } from '../utils/limitesCaminhaoContrato';
import { analisarCapacidadeViagensDia } from '../utils/capacidadeViagemDia';
import {
  calcularPeriodoOperacional,
  inferirReferenciaPeriodoOperacional,
  type TipoPeriodoOperacional,
} from '../utils/periodoRelatorioOperacional';
import { formatarIsoParaBr } from '../utils/periodoDados';
import { extrairValoresFaturamento } from '../utils/receitaDia';
import {
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  inferirMesReferenciaAtual,
  inferirMesReferenciaDeData,
  type PeriodoCicloContrato,
} from '../utils/periodoCicloContrato';
import { agruparCicloPorDiaFromApi, fmtNum, type DadoDiario } from '../utils/relatorioDiario';
import {
  formatarMetricaUnidade,
  unidadeOperacionalDoTipo,
} from '../utils/unidadeServico';
import {
  gerarNomePdfRelatorioOperacionalPeriodo,
  gerarNomePdfRelatorioRocadaCiclo,
  gerarNomePdfRelatorioUnidadeCiclo,
  gerarNomePdfRelatorioHodometroSaude,
} from '../utils/gerarNomePdf';
import servicoService from '../services/servicoService';

type ExportandoPdf = TipoPeriodoOperacional | 'hodometro' | null;

interface CicloDateSelectorProps {
  diaInicioCiclo: number;
  /** Período das viagens válidas (API) — usado para abrir o ciclo correto após upload */
  periodoDados?: { dataInicio: string; dataFim: string } | null;
  /** @deprecated Evite passar 20k linhas — o ciclo usa agregação SQL */
  dadosBrutos?: Record<string, unknown>[];
  contractId?: string;
  servicoId?: string;
  servicoNome?: string;
  tipoServico?: string;
  configFaturamento?: {
    ativo?: boolean;
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
    valorM2?: number | null;
    tipoCobranca?: string | null;
  } | null;
  contratoTarifas?: {
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null;
  placasReserva?: string[];
  limitesPesoKg?: MapaLimiteCaminhao | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  dataSelecionada?: string;
  onOpenDia?: (data: string, resumo: DadoDiario) => void;
  onClearDia?: () => void;
  onCicloChange?: (ciclo: PeriodoCicloContrato) => void;
  onCicloFechado?: () => void;
}

const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function diaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return DIAS_SEM[new Date(y, m - 1, d).getDay()];
}

function hojeISO(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
}

function KpiCard({ label, valor, cor, icone }: { label: string; valor: string; cor: string; icone: ReactNode }) {
  return (
    <div style={{
      flex: '1 1 140px',
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '0.65rem 0.75rem',
      borderTop: `3px solid ${cor}`,
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.3rem',
        fontSize: '0.62rem', fontWeight: 700, color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem',
      }}>
        {icone} {label}
      </div>
      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{valor}</div>
    </div>
  );
}

export default function CicloDateSelector({
  diaInicioCiclo,
  periodoDados = null,
  contractId,
  servicoId,
  servicoNome,
  tipoServico = 'coleta_caminhao',
  configFaturamento,
  contratoTarifas,
  placasReserva = [],
  limitesPesoKg = null,
  volumeL = null,
  densidadeResiduoKgL = null,
  densidadeKgL = null,
  dataSelecionada,
  onOpenDia,
  onClearDia,
  onCicloChange,
  onCicloFechado,
}: CicloDateSelectorProps) {
  const unidade = unidadeOperacionalDoTipo(tipoServico);
  const ehRocada = unidade.modo === 'rocada';
  const modoCiclo = unidade.modo;
  const ehPorUnidade = unidade.semViagemColeta;
  const ehUnidadeNaoRocada = ehPorUnidade && !ehRocada;
  const navigate = useNavigate();
  const { adicionarToast } = useToast();
  const [exportando, setExportando] = useState<ExportandoPdf>(null);
  const [mostrarSemDados, setMostrarSemDados] = useState(true);
  const [cicloFechado, setCicloFechado] = useState(false);
  const [fechandoCiclo, setFechandoCiclo] = useState(false);
  const refInicial = useMemo(() => inferirMesReferenciaAtual(diaInicioCiclo), [diaInicioCiclo]);
  const [mesRef, setMesRef] = useState(refInicial.mes);
  const [anoRef, setAnoRef] = useState(refInicial.ano);
  const cicloInicializadoRef = useRef(false);
  const [relatorioApi, setRelatorioApi] = useState<ReturnType<typeof agruparCicloPorDiaFromApi> | null>(null);
  const [carregandoResumo, setCarregandoResumo] = useState(false);
  const [rocadaSplit, setRocadaSplit] = useState<{
    areaManualM2: number;
    areaMecanizadaM2: number;
    registrosManual: number;
    registrosMecanizada: number;
  } | null>(null);

  useEffect(() => {
    cicloInicializadoRef.current = false;
  }, [contractId, servicoId, periodoDados?.dataInicio, periodoDados?.dataFim]);

  /** Abre no ciclo dos dados importados apenas na carga inicial — não bloqueia navegação manual */
  useEffect(() => {
    if (!diaInicioCiclo || cicloInicializadoRef.current) return;
    if (!periodoDados?.dataFim) return;

    const refDados = inferirMesReferenciaDeData(periodoDados.dataFim, diaInicioCiclo);
    setMesRef(refDados.mes);
    setAnoRef(refDados.ano);
    cicloInicializadoRef.current = true;
  }, [periodoDados, diaInicioCiclo]);

  const ciclo = useMemo(
    () => calcularCicloMensalContrato(anoRef, mesRef, diaInicioCiclo),
    [anoRef, mesRef, diaInicioCiclo],
  );

  useEffect(() => {
    onCicloChange?.(ciclo);
  }, [ciclo, onCicloChange]);

  useEffect(() => {
    if (!contractId || !servicoId) {
      setCicloFechado(false);
      return;
    }
    let cancelado = false;
    servicoService.getStatusCiclo(contractId, servicoId, {
      mesReferencia: mesRef,
      anoReferencia: anoRef,
    }).then((resp) => {
      if (!cancelado) setCicloFechado(!!resp.fechado);
    }).catch(() => {
      if (!cancelado) setCicloFechado(false);
    });
    return () => { cancelado = true; };
  }, [contractId, servicoId, mesRef, anoRef]);

  const tarifas = useMemo(
    () => extrairValoresFaturamento(configFaturamento, contratoTarifas),
    [configFaturamento, contratoTarifas],
  );

  useEffect(() => {
    if (!contractId || !servicoId) {
      setRelatorioApi(null);
      setRocadaSplit(null);
      return;
    }
    let cancelado = false;
    setCarregandoResumo(true);
    const promises: Promise<unknown>[] = [
      servicoService.getResumoCicloPorDia(contractId, servicoId, {
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      }).then((resp) => {
        if (cancelado) return;
        setRelatorioApi(agruparCicloPorDiaFromApi(
          resp.dias,
          ciclo.dataInicio,
          ciclo.dataFim,
          tarifas.valorTonelada,
          tarifas.valorMini,
          tarifas.valorTruck,
          tarifas.valorToco,
          tarifas.valorBasculante,
          {
            modo: modoCiclo,
            valorM2: configFaturamento?.valorM2 ?? null,
            tipoServico,
          },
        ));
      }),
    ];
    if (ehRocada) {
      promises.push(
        servicoService.getRocadaAgregacao(contractId, servicoId, {
          dataInicio: ciclo.dataInicio,
          dataFim: ciclo.dataFim,
        }).then((agg) => {
          if (cancelado) return;
          setRocadaSplit({
            areaManualM2: agg.resumo.areaManualM2 || 0,
            areaMecanizadaM2: agg.resumo.areaMecanizadaM2 || 0,
            registrosManual: agg.resumo.registrosManual || 0,
            registrosMecanizada: agg.resumo.registrosMecanizada || 0,
          });
        }).catch(() => {
          if (!cancelado) setRocadaSplit(null);
        }),
      );
    } else {
      setRocadaSplit(null);
    }
    Promise.all(promises).catch(() => {
      if (!cancelado) setRelatorioApi(null);
    }).finally(() => {
      if (!cancelado) setCarregandoResumo(false);
    });
    return () => { cancelado = true; };
  }, [contractId, servicoId, ciclo.dataInicio, ciclo.dataFim, tarifas, ehRocada, modoCiclo, tipoServico, configFaturamento?.valorM2]);

  const relatorioVazio = useMemo(
    () => agruparCicloPorDiaFromApi(
      [],
      ciclo.dataInicio,
      ciclo.dataFim,
      tarifas.valorTonelada,
      undefined,
      undefined,
      undefined,
      undefined,
      { modo: modoCiclo, valorM2: configFaturamento?.valorM2 ?? null, tipoServico },
    ),
    [ciclo.dataInicio, ciclo.dataFim, tarifas.valorTonelada, modoCiclo, tipoServico, configFaturamento?.valorM2],
  );
  const relatorio = relatorioApi ?? relatorioVazio;

  const { dias, totais } = relatorio;

  const handleFecharCiclo = useCallback(async () => {
    if (!contractId || !servicoId || cicloFechado || fechandoCiclo) return;
    const temOperacao = ehPorUnidade
      ? ((totais.metricaUnidade || 0) > 0 || totais.rotas > 0 || (totais.areaM2 || 0) > 0)
      : totais.viagens > 0;
    if (!temOperacao) {
      adicionarToast('Não há dados operacionais neste ciclo para fechar', 'warning');
      return;
    }
    const ok = window.confirm(
      `Fechar o ciclo "${ciclo.label}"?\n\n`
      + 'As planilhas deste período ficarão protegidas. '
      + 'Novos uploads não alterarão estes dados.\n'
      + 'Se houver pasta de backup no contrato, a última planilha será salva lá.',
    );
    if (!ok) return;

    setFechandoCiclo(true);
    try {
      const resp = await servicoService.fecharCiclo(contractId, servicoId, {
        mesReferencia: mesRef,
        anoReferencia: anoRef,
      });
      setCicloFechado(true);
      const backup = resp.backupPlanilha;
      if (backup?.ok && backup.caminho) {
        adicionarToast(`Ciclo fechado. Planilha salva em: ${backup.caminho}`, 'success');
      } else if (backup && !backup.ignorado && backup.erro) {
        adicionarToast(
          `${resp.message || 'Ciclo fechado'} — backup da planilha falhou: ${backup.erro}`,
          'warning',
        );
      } else {
        adicionarToast(resp.message || 'Ciclo fechado com sucesso', 'success');
      }
      onCicloFechado?.();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || 'Erro ao fechar ciclo';
      adicionarToast(msg, 'error');
    } finally {
      setFechandoCiclo(false);
    }
  }, [
    contractId, servicoId, cicloFechado, fechandoCiclo, totais.viagens,
    ciclo.label, mesRef, anoRef, adicionarToast, onCicloFechado, ehPorUnidade, totais,
  ]);

  const hoje = hojeISO();
  const tabelaOculta = Boolean(dataSelecionada && onOpenDia);
  const diaAtivo = useMemo(
    () => (dataSelecionada ? dias.find((d) => d.data === dataSelecionada) : undefined),
    [dias, dataSelecionada],
  );

  const diaTemOperacao = useCallback((d: DadoDiario) => (
    ehPorUnidade
      ? ((d.metricaUnidade || 0) > 0 || d.rotas > 0 || (d.areaM2 || 0) > 0)
      : d.viagens > 0
  ), [ehPorUnidade]);

  const diasExibidos = useMemo(
    () => (mostrarSemDados ? dias : dias.filter(diaTemOperacao)),
    [dias, mostrarSemDados, diaTemOperacao],
  );

  const diasSemOperacao = dias.length - relatorio.diasComDados;
  const pctCiclo = dias.length > 0 ? Math.round((relatorio.diasComDados / dias.length) * 100) : 0;
  const referenciaOperacional = useMemo(
    () => inferirReferenciaPeriodoOperacional(ciclo, dias),
    [ciclo, dias],
  );

  const navegar = useCallback((delta: number) => {
    const next = deslocarMesReferencia(mesRef, anoRef, delta);
    setMesRef(next.mes);
    setAnoRef(next.ano);
  }, [mesRef, anoRef]);

  const irParaCicloDosDados = useCallback(() => {
    if (!periodoDados?.dataFim) return;
    const ref = inferirMesReferenciaDeData(periodoDados.dataFim, diaInicioCiclo);
    setMesRef(ref.mes);
    setAnoRef(ref.ano);
  }, [periodoDados, diaInicioCiclo]);

  const abrirDia = useCallback((data: string, resumo: DadoDiario) => {
    if (onOpenDia) {
      onOpenDia(data, resumo);
      return;
    }
    if (contractId && servicoId) {
      navigate(`/contratos/${contractId}/servicos/${servicoId}/dia/${data}`, {
        state: { resumoDia: resumo },
      });
    }
  }, [onOpenDia, contractId, servicoId, navigate]);

  const handleRowClick = useCallback((d: DadoDiario) => {
    abrirDia(d.data, d);
  }, [abrirDia]);

  const exportarRelatorioRocadaCiclo = useCallback(async () => {
    if (!contractId || !servicoId) {
      adicionarToast('Contrato/serviço não disponível para exportar', 'warning');
      return;
    }

    setExportando('ciclo');
    try {
      const resumoApi = await servicoService.getResumoCicloPorDia(contractId, servicoId, {
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      const relatorioPeriodo = agruparCicloPorDiaFromApi(
        resumoApi.dias,
        ciclo.dataInicio,
        ciclo.dataFim,
        tarifas.valorTonelada,
        tarifas.valorMini,
        tarifas.valorTruck,
        tarifas.valorToco,
        tarifas.valorBasculante,
        {
          modo: 'rocada',
          valorM2: configFaturamento?.valorM2 ?? null,
        },
      );

      const areaTotal = relatorioPeriodo.totais.areaM2 || 0;
      if (areaTotal <= 0 && relatorioPeriodo.totais.rotas <= 0) {
        adicionarToast(
          `Nenhuma área (m²) entre ${formatarIsoParaBr(ciclo.dataInicio)} e ${formatarIsoParaBr(ciclo.dataFim)}`,
          'warning',
        );
        return;
      }

      // Agregação SQL do ciclo inteiro — não baixa linhas (escala 500k+)
      const agg = await servicoService.getRocadaAgregacao(contractId, servicoId, {
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
        topN: 50,
      });
      const analise = {
        resumo: agg.resumo,
        porBairro: agg.porBairro,
        porOperador: agg.porOperador,
        porEquipe: agg.porEquipe,
        porEquipamento: agg.porEquipamento,
      };

      const html = gerarHtmlRelatorioRocadaCiclo({
        servicoNome: servicoNome || 'Roçada',
        cicloLabel: ciclo.label,
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
        dias: relatorioPeriodo.dias,
        diasComDados: relatorioPeriodo.diasComDados,
        totais: relatorioPeriodo.totais,
        analise,
        valorM2: configFaturamento?.valorM2 ?? null,
      });
      const nomeArquivo = gerarNomePdfRelatorioRocadaCiclo({
        servicoNome: servicoNome || 'Rocada',
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      adicionarToast('Relatório de ciclo de roçada exportado em PDF', 'success');
    } catch (err) {
      console.error('Erro PDF ciclo roçada:', err);
      adicionarToast('Erro ao gerar relatório de ciclo de roçada', 'error');
    } finally {
      setExportando(null);
    }
  }, [
    adicionarToast, servicoNome, ciclo, tarifas, configFaturamento?.valorM2,
    contractId, servicoId,
  ]);

  const exportarRelatorioUnidadeCiclo = useCallback(async () => {
    if (!contractId || !servicoId) {
      adicionarToast('Contrato/serviço não disponível para exportar', 'warning');
      return;
    }
    setExportando('ciclo');
    try {
      const resumoApi = await servicoService.getResumoCicloPorDia(contractId, servicoId, {
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      const relatorioPeriodo = agruparCicloPorDiaFromApi(
        resumoApi.dias,
        ciclo.dataInicio,
        ciclo.dataFim,
        tarifas.valorTonelada,
        tarifas.valorMini,
        tarifas.valorTruck,
        tarifas.valorToco,
        tarifas.valorBasculante,
        {
          modo: modoCiclo === 'coleta' ? 'metro_linear' : modoCiclo,
          tipoServico,
        },
      );
      const metricaTotal = Number(relatorioPeriodo.totais.metricaUnidade || 0);
      if (metricaTotal <= 0 && relatorioPeriodo.totais.rotas <= 0) {
        adicionarToast(
          `Nenhum dado entre ${formatarIsoParaBr(ciclo.dataInicio)} e ${formatarIsoParaBr(ciclo.dataFim)}`,
          'warning',
        );
        return;
      }
      const html = gerarHtmlRelatorioUnidadeCiclo({
        servicoNome: servicoNome || 'Serviço',
        tipoServico,
        cicloLabel: ciclo.label,
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
        dias: relatorioPeriodo.dias,
        diasComDados: relatorioPeriodo.diasComDados,
        totais: relatorioPeriodo.totais,
      });
      const nomeArquivo = gerarNomePdfRelatorioUnidadeCiclo({
        servicoNome: servicoNome || 'Servico',
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      adicionarToast('Relatório de ciclo exportado em PDF', 'success');
    } catch (err) {
      console.error('Erro PDF ciclo unidade:', err);
      adicionarToast('Erro ao gerar relatório de ciclo', 'error');
    } finally {
      setExportando(null);
    }
  }, [
    adicionarToast, servicoNome, ciclo, tarifas, contractId, servicoId, modoCiclo, tipoServico,
  ]);

  const exportarRelatorioOperacional = useCallback(async (tipo: TipoPeriodoOperacional) => {
    if (ehRocada) {
      if (tipo === 'ciclo') await exportarRelatorioRocadaCiclo();
      else adicionarToast('Para roçada, use o PDF do ciclo completo', 'info');
      return;
    }
    if (ehUnidadeNaoRocada) {
      if (tipo === 'ciclo') await exportarRelatorioUnidadeCiclo();
      else adicionarToast('Para este serviço, use o PDF do ciclo ou abra o dia', 'info');
      return;
    }

    if (!contractId || !servicoId) {
      adicionarToast('Contrato/serviço não disponível para exportar', 'warning');
      return;
    }

    const referencia = inferirReferenciaPeriodoOperacional(ciclo, dias);
    const periodo = tipo === 'ciclo'
      ? calcularPeriodoOperacional('ciclo', ciclo)
      : calcularPeriodoOperacional(tipo, ciclo, referencia);

    setExportando(tipo);
    try {
      // Resumo do período via SQL (sem materializar 20k linhas no browser)
      const resumoApi = await servicoService.getResumoCicloPorDia(contractId, servicoId, {
        dataInicio: periodo.dataInicio,
        dataFim: periodo.dataFim,
      });
      const relatorioPeriodo = agruparCicloPorDiaFromApi(
        resumoApi.dias,
        periodo.dataInicio,
        periodo.dataFim,
        tarifas.valorTonelada,
        tarifas.valorMini,
        tarifas.valorTruck,
        tarifas.valorToco,
        tarifas.valorBasculante,
      );

      if (relatorioPeriodo.totais.viagens <= 0) {
        adicionarToast(
          `Nenhum dado operacional entre ${formatarIsoParaBr(periodo.dataInicio)} e ${formatarIsoParaBr(periodo.dataFim)}`,
          'warning',
        );
        return;
      }

      const datasAtivas = relatorioPeriodo.dias
        .filter((d) => d.viagens > 0)
        .map((d) => d.data);

      // Detalhe operacional: só os dias com dados, em lotes
      const dadosPeriodo = await servicoService.getDadosPorDatas(
        contractId,
        servicoId,
        datasAtivas,
        { concorrencia: 4 },
      );

      const limOpts = {
        limitesPesoKg,
        volumeL,
        densidadeResiduoKgL,
        densidadeKgL,
      };
      const operacao = analisarOperacaoDia(dadosPeriodo);
      const capacidade = analisarCapacidadeViagensDia(dadosPeriodo, limOpts);
      // Fonte canônica do período = SQL (CONTADOR). Detalhe operacional deve bater com ela.
      // Se ainda divergir (ex.: falha de carga parcial), prioriza o maior fidedigno do contador SQL.
      if (operacao.resumo.viagens !== relatorioPeriodo.totais.viagens) {
        console.warn(
          `[PDF operacional] Divergência de viagens: detalhe=${operacao.resumo.viagens} SQL=${relatorioPeriodo.totais.viagens}`,
        );
      }
      const html = gerarHtmlRelatorioOperacionalPeriodo({
        servicoNome: servicoNome || 'Serviço',
        periodo,
        operacao,
        dias: relatorioPeriodo.dias,
        diasComDados: relatorioPeriodo.diasComDados,
        totais: relatorioPeriodo.totais,
        placasReserva,
        capacidade,
        ...limOpts,
      });
      const nomeArquivo = gerarNomePdfRelatorioOperacionalPeriodo({
        servicoNome: servicoNome || 'Servico',
        tipo,
        dataInicio: periodo.dataInicio,
        dataFim: periodo.dataFim,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      const label = tipo === 'semanal' ? 'semanal' : tipo === 'quinzenal' ? 'quinzenal' : 'do ciclo completo';
      adicionarToast(`Relatório operacional ${label} exportado em PDF`, 'success');
    } catch (err) {
      console.error('Erro PDF operacional período:', err);
      const labelErro = tipo === 'semanal' ? 'semanal' : tipo === 'quinzenal' ? 'quinzenal' : 'do ciclo';
      adicionarToast(`Erro ao gerar relatório operacional ${labelErro}`, 'error');
    } finally {
      setExportando(null);
    }
  }, [
    adicionarToast, servicoNome, ciclo, dias, tarifas, ehRocada, ehUnidadeNaoRocada,
    contractId, servicoId, placasReserva, limitesPesoKg, volumeL, densidadeResiduoKgL, densidadeKgL,
    exportarRelatorioRocadaCiclo, exportarRelatorioUnidadeCiclo,
  ]);

  const exportarRelatorioHodometroSaude = useCallback(async () => {
    if (!contractId || !servicoId) {
      adicionarToast('Contrato/serviço não disponível para exportar', 'warning');
      return;
    }
    if (ehRocada) {
      adicionarToast('Relatório de hodômetro é para coleta com caminhão', 'info');
      return;
    }

    setExportando('hodometro');
    try {
      const resumoApi = await servicoService.getResumoCicloPorDia(contractId, servicoId, {
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      const datasAtivas = (resumoApi.dias || [])
        .filter((d: { data: string; viagens?: number }) => (d.viagens || 0) > 0)
        .map((d: { data: string }) => d.data);

      if (datasAtivas.length === 0) {
        adicionarToast('Nenhum dado no ciclo para análise de hodômetro', 'warning');
        return;
      }

      const dadosPeriodo = await servicoService.getDadosPorDatas(
        contractId,
        servicoId,
        datasAtivas,
        { concorrencia: 4 },
      );

      const relatorio = analisarHodometroSaude(dadosPeriodo as Record<string, unknown>[]);
      const html = gerarHtmlRelatorioHodometroSaude({
        servicoNome: servicoNome || 'Serviço',
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
        relatorio,
      });
      const nomeArquivo = gerarNomePdfRelatorioHodometroSaude({
        servicoNome: servicoNome || 'Servico',
        dataInicio: ciclo.dataInicio,
        dataFim: ciclo.dataFim,
      });
      await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
      adicionarToast(
        relatorio.caminhoesComHodometroQuebrado > 0
          ? `PDF gerado: ${relatorio.caminhoesComHodometroQuebrado} caminhão(ões) · ${relatorio.registrosCorrigidosAutomaticamente} correção(ões) automática(s)`
          : 'PDF gerado: nenhum caminhão com hodômetro quebrado no ciclo',
        'success',
      );
    } catch (err) {
      console.error('Erro PDF saúde hodômetro:', err);
      adicionarToast('Erro ao gerar relatório de hodômetro', 'error');
    } finally {
      setExportando(null);
    }
  }, [adicionarToast, contractId, servicoId, ciclo, servicoNome, ehRocada]);

  if (!diaInicioCiclo || diaInicioCiclo <= 0) return null;

  const maxVg = Math.max(
    ...diasExibidos.map((d) => (ehPorUnidade ? (d.metricaUnidade || d.areaM2 || 0) : d.viagens)),
    1,
  );

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      border: '1px solid #e2e8f0',
      marginBottom: '1rem',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
    }}>
      {/* Cabeçalho + navegação */}
      <div style={{
        padding: '1rem 1.1rem',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        color: '#fff',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
              <FiCalendar size={15} color="#a5b4fc" />
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Ciclo de medição
              </span>
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#f8fafc' }}>{ciclo.label}</div>
            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
              <span>{formatarIsoParaBr(ciclo.dataInicio)} → {formatarIsoParaBr(ciclo.dataFim)}</span>
              {cicloFechado && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                  fontSize: '0.62rem', fontWeight: 700, color: '#fde68a',
                  background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.35)',
                  borderRadius: '999px', padding: '0.12rem 0.45rem',
                }}>
                  <FiLock size={10} /> Ciclo fechado
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', justifyContent: 'flex-end', alignItems: 'center' }}>
            {(() => {
              const semDados = ehPorUnidade
                ? ((totais.metricaUnidade || 0) <= 0 && (totais.areaM2 || 0) <= 0 && totais.rotas <= 0)
                : totais.viagens <= 0;
              return (
            <>
            {!cicloFechado && contractId && servicoId && (
              <button
                type="button"
                onClick={handleFecharCiclo}
                disabled={fechandoCiclo || semDados}
                title={semDados ? 'Sem dados para fechar' : 'Proteger planilhas deste ciclo contra novos uploads'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.45)',
                  background: 'rgba(251,191,36,0.12)', color: '#fde68a', fontSize: '0.68rem',
                  fontWeight: 700, cursor: fechandoCiclo || semDados ? 'not-allowed' : 'pointer',
                  opacity: fechandoCiclo || semDados ? 0.55 : 1,
                }}
              >
                <FiLock size={12} />
                {fechandoCiclo ? 'Fechando...' : 'Fechar ciclo'}
              </button>
            )}
            {ehRocada ? (
              <button
                type="button"
                onClick={() => exportarRelatorioRocadaCiclo()}
                disabled={exportando !== null || semDados}
                title={semDados ? 'Sem área (m²) no ciclo' : `PDF do ciclo de roçada — ${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)}`}
                style={btnPdfHeader(exportando === 'ciclo', semDados, true)}
              >
                <FiDownload size={13} />
                {exportando === 'ciclo' ? 'Gerando...' : 'PDF Ciclo Roçada'}
              </button>
            ) : ehUnidadeNaoRocada ? (
              <button
                type="button"
                onClick={() => exportarRelatorioUnidadeCiclo()}
                disabled={exportando !== null || semDados}
                title={semDados ? 'Sem dados no ciclo' : `PDF do ciclo — ${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)}`}
                style={btnPdfHeader(exportando === 'ciclo', semDados, true)}
              >
                <FiDownload size={13} />
                {exportando === 'ciclo' ? 'Gerando...' : 'PDF Ciclo'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => exportarRelatorioOperacional('ciclo')}
                  disabled={exportando !== null || semDados}
                  title={semDados ? 'Sem dados no ciclo' : `PDF operacional completo — ${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)}`}
                  style={btnPdfHeader(exportando === 'ciclo', semDados, true)}
                >
                  <FiDownload size={13} />
                  {exportando === 'ciclo' ? 'Gerando...' : 'PDF Ciclo Operacional'}
                </button>
                <button
                  type="button"
                  onClick={() => exportarRelatorioOperacional('semanal')}
                  disabled={exportando !== null || semDados}
                  title={semDados ? 'Sem dados no ciclo' : `PDF operacional — 7 dias até ${formatarIsoParaBr(referenciaOperacional)}`}
                  style={btnPdfHeader(exportando === 'semanal', semDados)}
                >
                  <FiDownload size={13} />
                  {exportando === 'semanal' ? 'Gerando...' : 'PDF Semanal'}
                </button>
                <button
                  type="button"
                  onClick={() => exportarRelatorioOperacional('quinzenal')}
                  disabled={exportando !== null || semDados}
                  title={semDados ? 'Sem dados no ciclo' : `PDF operacional — 15 dias até ${formatarIsoParaBr(referenciaOperacional)}`}
                  style={btnPdfHeader(exportando === 'quinzenal', semDados)}
                >
                  <FiDownload size={13} />
                  {exportando === 'quinzenal' ? 'Gerando...' : 'PDF Quinzenal'}
                </button>
                <button
                  type="button"
                  onClick={() => exportarRelatorioHodometroSaude()}
                  disabled={exportando !== null || semDados}
                  title={semDados ? 'Sem dados no ciclo' : `Saúde dos dados — caminhões com hodômetro quebrado / KM não informado (${formatarIsoParaBr(ciclo.dataInicio)} a ${formatarIsoParaBr(ciclo.dataFim)})`}
                  style={btnPdfHeader(exportando === 'hodometro', semDados, true)}
                >
                  <FiTruck size={13} />
                  {exportando === 'hodometro' ? 'Gerando...' : 'PDF Saúde Hodômetro'}
                </button>
              </>
            )}
            </>
              );
            })()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" onClick={() => navegar(-1)} style={navBtnDark} title="Ciclo anterior">
            <FiChevronLeft size={16} />
          </button>
          <div style={{
            flex: 1, textAlign: 'center', fontSize: '0.72rem', color: '#cbd5e1',
            background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.4rem 0.6rem',
          }}>
            <strong style={{ color: '#e2e8f0' }}>{relatorio.diasComDados}</strong> de {dias.length} dias com operação
            <span style={{ margin: '0 0.4rem', opacity: 0.4 }}>·</span>
            {pctCiclo}% do ciclo
          </div>
          <button type="button" onClick={() => navegar(1)} style={navBtnDark} title="Próximo ciclo">
            <FiChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* KPIs do ciclo */}
      {((ehPorUnidade
        ? ((totais.metricaUnidade || 0) > 0 || totais.rotas > 0 || (totais.areaM2 || 0) > 0)
        : totais.viagens > 0)) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem',
          padding: '0.85rem 1.1rem',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}>
          {ehPorUnidade ? (
            <>
              <KpiCard label="Registros" valor={fmtNum(totais.rotas, 0)} cor="#6366f1" icone={<FiList size={11} />} />
              <KpiCard
                label={totais.metricaLabel || unidade.labelMetrica}
                valor={formatarMetricaUnidade(
                  totais.metricaUnidade || totais.areaM2 || 0,
                  totais.metricaSufixo || unidade.sufixo,
                )}
                cor="#22c55e"
                icone={<FiTrendingUp size={11} />}
              />
              {ehRocada && (rocadaSplit?.areaManualM2 || 0) > 0 && (
                <KpiCard
                  label={`Manual (${fmtNum(rocadaSplit?.registrosManual || 0, 0)})`}
                  valor={`${fmtNum(rocadaSplit?.areaManualM2 || 0, 0)} m²`}
                  cor="#0ea5e9"
                  icone={<FiTrendingUp size={11} />}
                />
              )}
              {ehRocada && (rocadaSplit?.areaMecanizadaM2 || 0) > 0 && (
                <KpiCard
                  label={`Mecanizada (${fmtNum(rocadaSplit?.registrosMecanizada || 0, 0)})`}
                  valor={`${fmtNum(rocadaSplit?.areaMecanizadaM2 || 0, 0)} m²`}
                  cor="#f59e0b"
                  icone={<FiTruck size={11} />}
                />
              )}
              <KpiCard
                label={`Média / dia`}
                valor={relatorio.diasComDados > 0
                  ? formatarMetricaUnidade(
                    (totais.metricaUnidade || totais.areaM2 || 0) / relatorio.diasComDados,
                    totais.metricaSufixo || unidade.sufixo,
                  )
                  : '—'}
                cor="#8b5cf6"
                icone={<FiCalendar size={11} />}
              />
              {totais.faturamento > 0 && (
                <KpiCard
                  label="Receita est."
                  valor={totais.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  cor="#0ea5e9"
                  icone={<FiTruck size={11} />}
                />
              )}
            </>
          ) : (
            <>
              <KpiCard label="Rotas" valor={fmtNum(totais.rotas, 0)} cor="#6366f1" icone={<FiList size={11} />} />
              <KpiCard
                label="Viagens"
                valor={fmtNum(totais.viagens, 0)}
                cor="#3b82f6"
                icone={<FiTruck size={11} />}
              />
              <KpiCard label="Toneladas" valor={`${fmtNum(totais.toneladas, 1)} t`} cor="#22c55e" icone={<FiTrendingUp size={11} />} />
              <KpiCard
                label="Média / dia ativo"
                valor={relatorio.diasComDados > 0 ? fmtNum(totais.viagens / relatorio.diasComDados, 1) : '—'}
                cor="#8b5cf6"
                icone={<FiCalendar size={11} />}
              />
            </>
          )}
        </div>
      )}

      {/* Instrução */}
      <div style={{
        padding: '0.55rem 1.1rem',
        background: '#eef2ff',
        borderBottom: '1px solid #c7d2fe',
        fontSize: '0.72rem',
        color: '#4338ca',
        display: 'flex',
        alignItems: 'center',
        gap: '0.4rem',
      }}>
        <FiArrowRight size={13} style={{ flexShrink: 0 }} />
        <span>
          <strong>Clique em um dia</strong> para abrir a operação detalhada.
          {' '}
          <span style={{ color: '#6366f1' }}>
            {ehRocada
              ? 'Registros = linhas da planilha; Área total e cards Manual/Mecanizada mostram a separação por tipo.'
              : 'Rotas = linhas da planilha; Viagens = soma do CONTADOR DE VIAGENS (1–4 por rota).'}
          </span>
        </span>
      </div>

      {tabelaOculta && dataSelecionada ? (
        <div style={{
          padding: '0.75rem 1.1rem',
          background: '#fff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#6366f1', textTransform: 'uppercase' }}>
              Dia selecionado
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', marginTop: '0.1rem' }}>
              {formatarIsoParaBr(dataSelecionada)}
              <span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b', marginLeft: '0.4rem' }}>
                {diaSemana(dataSelecionada)}
              </span>
            </div>
          </div>
          {onClearDia && (
            <button type="button" onClick={onClearDia} style={btnSecundario}>
              <FiList size={14} /> Ver lista do ciclo
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Controles da lista */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.55rem 1.1rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap', gap: '0.5rem',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>
              Dias do ciclo
              <span style={{ fontWeight: 500, color: '#94a3b8', marginLeft: '0.35rem' }}>
                ({dias.length} {dias.length === 1 ? 'dia' : 'dias'}
                {!mostrarSemDados && relatorio.diasComDados > 0 ? ` · ${relatorio.diasComDados} com dados` : ''})
              </span>
            </span>
            {diasSemOperacao > 0 && (
              <button
                type="button"
                onClick={() => setMostrarSemDados((v) => !v)}
                style={btnSecundario}
              >
                {mostrarSemDados ? <FiEyeOff size={13} /> : <FiEye size={13} />}
                {mostrarSemDados ? 'Ocultar dias vazios' : `Mostrar ${diasSemOperacao} dia(s) sem dados`}
              </button>
            )}
          </div>

          {/* Tabela */}
          <div style={{ overflowX: 'auto' }}>
            {diasExibidos.length === 0 ? (
              <div style={{ padding: '2rem 1.1rem', textAlign: 'center', color: '#94a3b8' }}>
                <FiCalendar size={28} style={{ opacity: 0.25, marginBottom: '0.5rem' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>Nenhum dia com operação neste ciclo</div>
                <div style={{ fontSize: '0.72rem', marginTop: '0.25rem' }}>
                  Navegue para outro ciclo ou faça upload de planilhas com dados neste período.
                </div>
                {periodoDados && (
                  <button
                    type="button"
                    onClick={irParaCicloDosDados}
                    style={{
                      marginTop: '0.65rem', fontSize: '0.72rem', fontWeight: 600,
                      padding: '0.35rem 0.75rem', borderRadius: '6px', border: 'none',
                      background: '#6366f1', color: '#fff', cursor: 'pointer',
                    }}
                  >
                    Ir para o ciclo dos dados importados
                  </button>
                )}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9', color: '#475569' }}>
                    <th style={thStyle}>Data</th>
                    <th style={{ ...thStyle, textAlign: 'center', width: '48px' }}>Dia</th>
                    <th style={{ ...thStyle, textAlign: 'center' }} title={ehPorUnidade ? 'Linhas importadas no dia' : 'Linhas (rotas) importadas no dia'}>
                      {ehPorUnidade ? 'Registros' : 'Rotas'}
                    </th>
                    {!ehPorUnidade && (
                      <th
                        style={{ ...thStyle, textAlign: 'center' }}
                        title="Soma da coluna CONTADOR DE VIAGENS da planilha (viagens dentro de cada rota)"
                      >
                        Viagens
                      </th>
                    )}
                    <th style={{ ...thStyle, textAlign: 'right' }}>
                      {ehPorUnidade
                        ? (totais.metricaLabel || unidade.labelMetrica)
                          + (totais.metricaSufixo || unidade.sufixo ? ` (${totais.metricaSufixo || unidade.sufixo})` : '')
                        : 'Toneladas'}
                    </th>
                    <th style={{ ...thStyle, width: '90px' }} />
                  </tr>
                </thead>
                <tbody>
                  {diasExibidos.map((d, idx) => (
                    <LinhaDia
                      key={d.data}
                      d={d}
                      idx={idx}
                      hoje={hoje}
                      selecionado={dataSelecionada === d.data}
                      maxVg={maxVg}
                      modoUnidade={ehPorUnidade}
                      onClick={() => handleRowClick(d)}
                    />
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff' }}>
                    <td colSpan={2} style={{ padding: '0.6rem 1.1rem', fontWeight: 800, color: '#4338ca' }}>
                      Total do ciclo
                    </td>
                    <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 800, color: '#4338ca' }}>
                      {fmtNum(totais.rotas, 0)}
                    </td>
                    {!ehPorUnidade && (
                      <td style={{ padding: '0.6rem', textAlign: 'center', fontWeight: 800, color: '#1e40af' }}>
                        {fmtNum(totais.viagens, 0)}
                      </td>
                    )}
                    <td style={{ padding: '0.6rem 1.1rem', textAlign: 'right', fontWeight: 800, color: '#166534' }}>
                      {ehPorUnidade
                        ? formatarMetricaUnidade(
                          totais.metricaUnidade || totais.areaM2 || 0,
                          totais.metricaSufixo || unidade.sufixo,
                        )
                        : `${fmtNum(totais.toneladas, 1)} t`}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: '0.5rem 1.1rem',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
};

function btnPdfHeader(ativo: boolean, desabilitado: boolean, destaque = false): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    fontSize: '0.68rem',
    fontWeight: 600,
    padding: '0.4rem 0.65rem',
    borderRadius: '8px',
    border: destaque ? '1px solid #a5b4fc' : '1px solid rgba(255,255,255,0.2)',
    background: ativo
      ? 'rgba(255,255,255,0.08)'
      : destaque
        ? 'rgba(99,102,241,0.35)'
        : 'rgba(255,255,255,0.12)',
    color: desabilitado ? '#64748b' : '#fff',
    cursor: ativo || desabilitado ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  };
}

const navBtnDark: CSSProperties = {
  background: 'rgba(255,255,255,0.1)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  padding: '0.4rem 0.55rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  color: '#e2e8f0',
};

const btnSecundario: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  padding: '0.35rem 0.65rem',
  borderRadius: '6px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
};

function LinhaDia({
  d, idx, hoje, selecionado, maxVg, modoUnidade, onClick,
}: {
  d: DadoDiario;
  idx: number;
  hoje: string;
  selecionado?: boolean;
  maxVg: number;
  modoUnidade?: boolean;
  onClick: () => void;
}) {
  const temResumo = modoUnidade
    ? ((d.metricaUnidade || 0) > 0 || d.rotas > 0 || (d.areaM2 || 0) > 0)
    : d.viagens > 0;
  const ehHoje = d.data === hoje;
  const metricaBarra = modoUnidade ? (d.metricaUnidade || d.areaM2 || 0) : d.viagens;

  let bg = idx % 2 === 0 ? '#fff' : '#fafbfc';
  if (ehHoje && temResumo) bg = '#f0fdf4';
  if (selecionado) bg = '#eef2ff';

  const barW = temResumo ? Math.max(8, (metricaBarra / maxVg) * 100) : 0;

  return (
    <tr
      onClick={onClick}
      style={{
        borderTop: '1px solid #f1f5f9',
        background: bg,
        cursor: 'pointer',
        transition: 'background 0.12s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#eef2ff'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = bg; }}
    >
      <td style={{ padding: '0.55rem 1.1rem' }}>
        <div style={{ fontWeight: 700, color: '#1e293b', fontSize: '0.82rem' }}>{d.label}</div>
        {ehHoje && (
          <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '0.05rem 0.35rem', borderRadius: '4px' }}>
            hoje
          </span>
        )}
      </td>
      <td style={{ padding: '0.55rem 0.4rem', textAlign: 'center', color: '#64748b', fontSize: '0.72rem' }}>
        {diaSemana(d.data)}
      </td>
      <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center', fontWeight: temResumo ? 700 : 400, color: temResumo ? '#4338ca' : '#cbd5e1' }}>
        {temResumo ? fmtNum(d.rotas, 0) : '—'}
      </td>
      {!modoUnidade && (
        <td style={{ padding: '0.55rem 0.6rem', textAlign: 'center' }}>
          {temResumo ? (
            <div>
              <span style={{ fontWeight: 700, color: '#1e40af' }}>{fmtNum(d.viagens, 0)}</span>
              <div style={{ height: '3px', background: '#e2e8f0', borderRadius: '2px', marginTop: '4px', maxWidth: '64px', margin: '4px auto 0' }}>
                <div style={{ width: `${barW}%`, height: '100%', background: '#3b82f6', borderRadius: '2px' }} />
              </div>
            </div>
          ) : (
            <span style={{ color: '#cbd5e1' }}>—</span>
          )}
        </td>
      )}
      <td style={{ padding: '0.55rem 1.1rem', textAlign: 'right', fontWeight: temResumo ? 700 : 400, color: temResumo ? '#166534' : '#cbd5e1' }}>
        {temResumo
          ? (modoUnidade
            ? formatarMetricaUnidade(d.metricaUnidade || d.areaM2 || 0, d.metricaSufixo || '')
            : `${fmtNum(d.toneladas, 1)} t`)
          : '—'}
        {modoUnidade && temResumo && (
          <div style={{ height: '3px', background: '#e2e8f0', borderRadius: '2px', marginTop: '4px', maxWidth: '80px', marginLeft: 'auto' }}>
            <div style={{ width: `${barW}%`, height: '100%', background: '#22c55e', borderRadius: '2px' }} />
          </div>
        )}
      </td>
      <td style={{ padding: '0.55rem 1.1rem 0.55rem 0', textAlign: 'right' }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
          fontSize: '0.68rem', fontWeight: 600,
          color: temResumo ? '#4338ca' : '#94a3b8',
        }}>
          {temResumo ? 'Abrir' : 'Ver'}
          <FiArrowRight size={12} />
        </span>
      </td>
    </tr>
  );
}
