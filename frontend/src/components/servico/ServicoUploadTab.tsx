import { memo, useState, useRef } from 'react';
import {
  FiUpload, FiFileText, FiTrash2, FiRefreshCw, FiDownload,
  FiSearch, FiShield, FiCheckCircle,
} from 'react-icons/fi';
import { useToast } from '../../contexts/ToastContext';
import coletaService from '../../services/coletaService';
import qualidadeColetaService from '../../services/qualidadeColetaService';
import servicoService, { invalidateCachesServico } from '../../services/servicoService';
import pdfService from '../../services/pdfService';
import { isAxiosError } from 'axios';
import RelatorioQualidade from '../RelatorioQualidade';
import QualidadePlanilhaPreview from '../QualidadePlanilhaPreview';
import { TIPOS_SERVICO_LABELS } from '../../types';
import { gerarNomePdfArquivo, labelTipoServicoArquivo, formatarDataArquivoPdf } from '../../utils/gerarNomePdf';
import type { EtapasStatus, PlanilhaItem, ConferenciaDiaria, ResumoImportacao, EtapaMiniFlow } from './servicoTypes';
import { labelModeloRocada, MODELOS_ROCADA_OPCOES } from './servicoUtils';

export interface ServicoUploadTabProps {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  tipoServico: string;
  contratoNome: string;
  temPlanilha: boolean;
  planilhas: PlanilhaItem[];
  onSetEtapa: (etapa: EtapaMiniFlow) => void;
  onSetStatus: (fn: (prev: EtapasStatus) => EtapasStatus) => void;
  onRefreshData: () => void;
  onPlanilhaExcluida: (temUpload: boolean) => Promise<void>;
}

const ServicoUploadTab = memo(function ServicoUploadTab({
  contractId,
  servicoId,
  servicoNome,
  tipoServico,
  contratoNome,
  temPlanilha,
  planilhas,
  onSetEtapa,
  onSetStatus,
  onRefreshData,
  onPlanilhaExcluida,
}: ServicoUploadTabProps) {
  const { adicionarToast } = useToast();
  const ehRocada = tipoServico === 'rocadeira';
  /** Tipos que podem receber o layout unificado (não altera fluxo legado de roçada) */
  const aceitaUnificado = ['rocadeira', 'capina', 'varricao', 'poda', 'geral'].includes(tipoServico);

  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [excluindoPlanilhaId, setExcluindoPlanilhaId] = useState<number | null>(null);
  const [qualidadeAberta, setQualidadeAberta] = useState(false);
  const [qualidadeUploadId, setQualidadeUploadId] = useState<number | null>(null);
  const [modoValidacao, setModoValidacao] = useState(false);
  const [validando, setValidando] = useState(false);
  const [validacaoData, setValidacaoData] = useState<any>(null);
  const [arquivoValidacao, setArquivoValidacao] = useState<File | null>(null);
  const [analisandoViagens, setAnalisandoViagens] = useState(false);
  const [dadosViagens, setDadosViagens] = useState<any>(null);
  const [gerandoPdfViagens, setGerandoPdfViagens] = useState(false);
  const [importacaoConcluida, setImportacaoConcluida] = useState(false);
  const [conferindoDiaria, setConferindoDiaria] = useState(false);
  const [conferenciaDiaria, setConferenciaDiaria] = useState<ConferenciaDiaria | null>(null);
  const [resumoImportacao, setResumoImportacao] = useState<ResumoImportacao | null>(null);
  const [modeloRocadaUi, setModeloRocadaUi] = useState<{ modelo: string; label: string } | null>(null);
  const validacaoInputRef = useRef<HTMLInputElement>(null);


  const importarPlanilhaValidada = async (
    file: File,
    relatorio?: any,
    optsRocada?: { modelo?: string; modeloLabel?: string; areaTotalM2?: number },
  ): Promise<boolean> => {
    setUploading(true);
    setUploadPct(0);
    const iv = setInterval(() => setUploadPct(p => Math.min(p + 15, 85)), 200);
    try {
      const estrategia = temPlanilha ? 'atualizar_data' as const : undefined;
      const data = await coletaService.uploadPlanilha(file, servicoId, estrategia);
      clearInterval(iv);
      setUploadPct(100);
      {
        const inconsistentes = data.viagensInconsistentes
          ?? data.resumo?.viagensInconsistentes
          ?? relatorio?.viagensInconsistentesTotal
          ?? relatorio?.viagensIncompletas
          ?? 0;
        const corrigidas = data.viagensCorrigidas
          ?? data.resumo?.viagensCorrigidas
          ?? 0;
        const validasDashboard = data.viagensValidasDashboard
          ?? data.resumo?.viagensValidasDashboard
          ?? relatorio?.viagensValidasDashboard
          ?? relatorio?.viagensCompletas
          ?? (data.importados - inconsistentes);
        const importados = data.importados ?? data.importadas ?? 0;
        const uploadsRemovidos = data.consolidacao?.uploadsRemovidos ?? 0;
        const registrosRemovidosAusentes = data.consolidacao?.registrosRemovidosAusentes ?? 0;
        const modeloRocada = (data as { modelo?: string }).modelo || optsRocada?.modelo || null;
        const modeloRocadaLabel = optsRocada?.modeloLabel
          || (modeloRocada ? labelModeloRocada(modeloRocada) : null);
        const areaTotalM2 = (data as { areaTotalM2?: number }).areaTotalM2
          ?? optsRocada?.areaTotalM2
          ?? null;

        const modoUnificado = (data as { modo?: string }).modo === 'servicos_unificados'
          || modeloRocada === 'servicos_unificados';

        if (ehRocada && modeloRocada && !modoUnificado) {
          setModeloRocadaUi({ modelo: modeloRocada, label: modeloRocadaLabel || labelModeloRocada(modeloRocada) });
        }
        if (modoUnificado) {
          setModeloRocadaUi({ modelo: 'servicos_unificados', label: 'Serviços unificados' });
        }

        setResumoImportacao({
          importados,
          validasDashboard,
          inconsistentes,
          uploadsRemovidos,
          registrosRemovidosAusentes,
          modeloRocada: modoUnificado ? 'servicos_unificados' : modeloRocada,
          modeloRocadaLabel: modoUnificado ? 'Serviços unificados' : modeloRocadaLabel,
          areaTotalM2,
        });
        setImportacaoConcluida(true);
        onSetStatus(prev => ({ ...prev, upload: 'done', revisao: 'done' }));
        // Roçada / unificado: permanece no Upload para o usuário ver o resumo
        if (!ehRocada && !modoUnificado) onSetEtapa('revisao');
        onRefreshData();

        const extras: string[] = [];
        if (uploadsRemovidos > 0) extras.push(`${uploadsRemovidos} planilha(s) antiga(s) removida(s)`);
        if (registrosRemovidosAusentes > 0) extras.push(`${registrosRemovidosAusentes} registro(s) de dias só no sistema removidos`);
        const sufixo = extras.length ? ` ${extras.join('; ')}.` : '';

        if (modoUnificado) {
          adicionarToast(data.mensagem || `Planilha unificada: ${importados} registro(s) importado(s).${sufixo}`, 'success');
        } else if (ehRocada) {
          const label = modeloRocadaLabel || 'desconhecido';
          adicionarToast(
            `Modelo detectado: ${label}. ${importados} registro(s) importado(s)`
            + (areaTotalM2 != null ? ` · ${Number(areaTotalM2).toLocaleString('pt-BR')} m²` : '')
            + `.${sufixo}`,
            'success',
          );
        } else if (inconsistentes > 0) {
          adicionarToast(
            `${validasDashboard} viagem(ns) na planilha ativa. ${inconsistentes} linha(s) rejeitada(s).${sufixo}`,
            'warning'
          );
        } else if (corrigidas > 0) {
          adicionarToast(
            `${validasDashboard} viagem(ns) importada(s). ${corrigidas} linha(s) corrigida(s) automaticamente.${sufixo}`,
            'success'
          );
        } else {
          adicionarToast(
            data.mensagem || `${validasDashboard} viagem(ns) importada(s) com sucesso.${sufixo}`,
            'success'
          );
        }
        const avisos = (data as { avisos?: string[] }).avisos || [];
        const avisoCiclo = avisos.find((a) => a.includes('ciclo já fechado') || a.includes('ciclo anterior'));
        if (avisoCiclo) adicionarToast(avisoCiclo, 'warning');
      }
      return true;
    } catch (err) {
      const data = isAxiosError(err) ? (err.response?.data as { error?: string; detalhe?: string }) : null;
      const msg = data?.error || (isAxiosError(err) ? 'Erro no upload' : 'Erro no upload');
      const detalhe = data?.detalhe && data.detalhe !== msg ? ` (${data.detalhe})` : '';
      adicionarToast(`${msg}${detalhe}`, 'error');
      return false;
    } finally {
      clearInterval(iv);
      setUploading(false);
      setUploadPct(0);
    }
  };

  // ─── Análise viagem por viagem (somente coleta — não se aplica a roçada) ───
  const analisarViagensArquivo = async (file: File): Promise<any | null> => {
    if (ehRocada) return null;
    setAnalisandoViagens(true);
    setDadosViagens(null);
    try {
      const data = await qualidadeColetaService.analisarViagens(file, contractId);
      setDadosViagens(data);
      return data;
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao analisar viagens'
        : 'Erro ao analisar viagens';
      adicionarToast(msg, 'error');
      return null;
    } finally {
      setAnalisandoViagens(false);
    }
  };

  // ─── Layout unificado (roçada/capina/varrição/poda) — não passa pelo parser de roçada legado ───
  const handleValidarUnificado = async (file: File): Promise<boolean> => {
    if (!aceitaUnificado) return false;
    try {
      const preview = await coletaService.previewServicosUnificados(file, servicoId);
      if (!preview.ehUnificado) return false;

      setArquivoValidacao(file);
      setValidando(true);
      setValidacaoData(null);
      setDadosViagens(null);
      setConferenciaDiaria(null);
      setImportacaoConcluida(false);
      setResumoImportacao(null);
      setModeloRocadaUi({ modelo: 'servicos_unificados', label: 'Serviços unificados' });
      setModoValidacao(true);

      const podeImportar = preview.podeImportar !== false && preview.sucesso && (preview.resumo?.registros ?? 0) > 0;
      setValidacaoData({
        sucesso: podeImportar,
        ehUnificado: true,
        mensagem: preview.mensagem,
        arquivo: preview.arquivo,
        avisos: preview.avisos,
        abasUsadas: preview.abasUsadas,
        modelo: 'servicos_unificados',
        modeloLabel: 'Serviços unificados',
        porTipo: preview.porTipo || preview.resumo?.porTipo || [],
        podeImportar,
        resumoUnificado: preview.resumo,
      } as any);

      if (!podeImportar) {
        adicionarToast(preview.mensagem || 'Layout unificado sem linhas válidas.', 'error');
        setValidando(false);
        return true; // detectou unificado, não cair no fluxo legado
      }

      const partes = (preview.porTipo || []).map((p) =>
        `${p.tipoLabel}: ${p.registros}`,
      ).join(' · ');
      adicionarToast(
        `Layout unificado detectado. ${preview.resumo?.registros ?? 0} registro(s)${partes ? ` (${partes})` : ''}.`,
        'success',
      );

      await importarPlanilhaValidada(
        file,
        {
          viagensValidasDashboard: preview.resumo?.registros ?? 0,
          viagensCompletas: preview.resumo?.registros ?? 0,
        },
        {
          modelo: 'servicos_unificados',
          modeloLabel: 'Serviços unificados',
        },
      );
      setValidando(false);
      return true;
    } catch {
      return false;
    }
  };

  // ─── Roçada: preview multi-modelo → importação (sem validação de viagem) ───
  const handleValidarRocada = async (file: File) => {
    // Se for o layout unificado, usa pipeline próprio (preserva Londrina/QGIS/etc.)
    if (await handleValidarUnificado(file)) return;

    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModeloRocadaUi(null);
    setModoValidacao(true);
    try {
      const preview = await coletaService.previewRocada(file, servicoId);
      const modeloKey = preview.modelo || preview.resumo?.modelo || '';
      const modeloLabel = preview.resumo?.modeloLabel || labelModeloRocada(modeloKey);
      if (modeloKey) setModeloRocadaUi({ modelo: modeloKey, label: modeloLabel });

      const podeImportar = preview.podeImportar !== false
        && preview.sucesso
        && (preview.resumo?.registros ?? 0) > 0
        && (preview.resumo?.areaTotalM2 ?? 0) > 0;

      setValidacaoData({
        sucesso: podeImportar,
        mensagem: preview.mensagem,
        arquivo: preview.arquivo,
        resumoRocada: preview.resumo,
        avisos: preview.avisos,
        abasUsadas: preview.abasUsadas,
        modelo: modeloKey,
        modeloLabel,
        linhasSemArea: preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0,
        semColunaArea: preview.semColunaArea ?? preview.resumo?.semColunaArea ?? false,
        amostraSemArea: preview.amostraSemArea || [],
        filtroTipoAplicado: preview.filtroTipoAplicado,
        porTipoExecucao: preview.porTipoExecucao || preview.resumo?.porTipoExecucao,
        podeImportar,
      } as any);

      if (!podeImportar) {
        const msg = preview.semColunaArea || preview.resumo?.semColunaArea
          ? `Modelo ${modeloLabel}: planilha sem coluna de metragem (m²/área). Inclua a coluna e envie novamente.`
          : preview.mensagem || `Modelo ${modeloLabel}: nenhuma linha com m²/área válida.`;
        adicionarToast(msg, 'error');
        return;
      }

      const semArea = preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0;
      const porTipo = preview.porTipoExecucao || preview.resumo?.porTipoExecucao;
      const splitInfo = porTipo && (porTipo.manual?.registros || porTipo.mecanizada?.registros)
        ? ` Manual ${porTipo.manual.registros} · Mecanizada ${porTipo.mecanizada.registros}.`
        : '';
      adicionarToast(
        `Modelo detectado: ${modeloLabel}. ${preview.resumo.registros} registro(s), `
        + `${preview.resumo.areaTotalM2.toLocaleString('pt-BR')} m², ${preview.resumo.dias} dia(s).`
        + splitInfo
        + (semArea > 0 ? ` ${semArea} linha(s) sem m² ignorada(s).` : ''),
        semArea > 0 ? 'warning' : 'success',
      );

      await importarPlanilhaValidada(
        file,
        {
          viagensValidasDashboard: preview.resumo.registros,
          viagensCompletas: preview.resumo.registros,
        },
        {
          modelo: modeloKey,
          modeloLabel,
          areaTotalM2: preview.resumo.areaTotalM2,
        },
      );
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao validar planilha de roçada'
        : 'Erro ao conectar com o servidor';
      adicionarToast(msg, 'error');
      setModoValidacao(false);
    } finally {
      setValidando(false);
    }
  };

  // ─── Validação → PDF de saúde → importação automática ───
  const handleValidarDados = async (file: File) => {
    if (ehRocada) {
      await handleValidarRocada(file);
      return;
    }

    // Capina/varrição/poda: tenta layout unificado antes do pipeline de coleta/viagem
    if (aceitaUnificado && await handleValidarUnificado(file)) return;

    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModoValidacao(true);
    try {
      const data = await qualidadeColetaService.preview(file, { servico_id: servicoId });
      setValidacaoData(data);
      if (!data.sucesso) {
        adicionarToast(data.mensagem || data.erro || 'Planilha com problemas de estrutura. Corrija e tente novamente.', 'error');
        setModoValidacao(false);
        return;
      }

      const relatorio = await analisarViagensArquivo(file);
      if (!relatorio || relatorio.sucesso === false) {
        adicionarToast(
          relatorio?.mensagem || 'Análise de viagens indisponível.',
          'warning',
        );
        return;
      }

      const pdfOk = await gerarPdfViagensDeRelatorio(relatorio, { silencioso: true });
      if (!pdfOk) {
        adicionarToast('Não foi possível gerar o PDF de saúde dos dados.', 'warning');
      }

      let conf: typeof conferenciaDiaria = null;
      if (temPlanilha) {
        setConferindoDiaria(true);
        try {
          conf = await coletaService.conferenciaDiaria(file, servicoId);
          setConferenciaDiaria(conf);
          if (conf.diasDivergentes > 0) {
            adicionarToast(
              `${conf.diasDivergentes} dia(s) diferem do sistema — a importação atualizará conforme a planilha.`,
              'warning',
            );
          } else if (conf.diasNovos > 0) {
            adicionarToast(`${conf.diasNovos} dia(s) novo(s) serão importados.`, 'info');
          }
        } catch (err) {
          const msg = isAxiosError(err)
            ? (err.response?.data as { error?: string })?.error || 'Erro na conferência diária'
            : 'Erro na conferência diária';
          adicionarToast(msg, 'warning');
        } finally {
          setConferindoDiaria(false);
        }
      }

      if ((conf?.diasBloqueados ?? 0) > 0) {
        adicionarToast('Importação bloqueada: há dias em ciclo fechado. Revise o relatório.', 'error');
        if (pdfOk) adicionarToast('PDF de saúde dos dados baixado — corrija os bloqueios e envie novamente.', 'info');
        return;
      }

      const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;
      if (validas <= 0) {
        adicionarToast('Nenhuma viagem válida para importar. Veja o PDF de saúde baixado.', 'warning');
        return;
      }

      const importou = await importarPlanilhaValidada(file, relatorio);
      if (importou && pdfOk) {
        adicionarToast('PDF de saúde dos dados baixado automaticamente.', 'info');
      }
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao validar planilha'
        : 'Erro ao conectar com o servidor para validação';
      adicionarToast(msg, 'error');
      setModoValidacao(false);
    } finally {
      setValidando(false);
    }
  };

  const handleSelecionarPlanilha = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls|xlsm)$/i)) {
      adicionarToast('Selecione um arquivo .xlsx, .xls ou .xlsm', 'error');
      return;
    }
    handleValidarDados(file);
  };

  const handleAnalisarViagens = async () => {
    if (!arquivoValidacao) return;
    await analisarViagensArquivo(arquivoValidacao);
  };

  const limparValidacao = () => {
    setModoValidacao(false);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setArquivoValidacao(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
  };

  const obterNomePdfSaudeDados = () => gerarNomePdfArquivo({
    contratoNome,
    tipoServico: labelTipoServicoArquivo(tipoServico, TIPOS_SERVICO_LABELS as Record<string, string>),
    sufixo: 'Saude_Dados',
  });

  const montarHtmlPdfViagens = (relatorio: any) => {
    const viagens = relatorio.viagens || [];
    const inconsistentes = (relatorio.viagensInconsistentesTotal ?? relatorio.viagensIncompletas) || 0;
    const validas = relatorio.viagensValidasDashboard ?? relatorio.viagensCompletas ?? 0;
    const descartadas = relatorio.linhasDescartadasSemDados ?? 0;
    const emBranco = relatorio.linhasEmBrancoIgnoradas ?? 0;
    const tDash = (Number(relatorio.pesoKgDashboard || 0) / 1000);
    const tFora = (Number(relatorio.pesoKgForaDashboard || 0) / 1000);
    const fmtTon = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 1 });
    const fmtPesoTon = (kg: unknown) => {
      if (kg == null || kg === '') return '—';
      const n = Number(kg);
      if (Number.isNaN(n)) return '—';
      return fmtTon(n / 1000);
    };
    // A linha da planilha pode ter várias pesagens (PESO 1–5). O total sozinho
    // parece uma pesagem absurda, então detalhamos cada carga da linha.
    const celulaPeso = (v: any) => {
      if (v.pesoTotal == null) return '—';
      const total = fmtPesoTon(v.pesoTotal);
      const pesagens: number[] = Array.isArray(v.pesagensKg) ? v.pesagensKg : [];
      if (pesagens.length <= 1) return total;
      const detalhe = pesagens.map((p) => fmtTon(p / 1000)).join(' + ');
      return `${total}<br/><span style="font-size:8px;color:#64748b">${pesagens.length} pesagens: ${detalhe}</span>`;
    };
    const dataRelatorio = formatarDataArquivoPdf();
    const tipoLabel = labelTipoServicoArquivo(tipoServico, TIPOS_SERVICO_LABELS as Record<string, string>);

    const filtrarProblemasDashboard = (problemas: string[] | undefined) =>
      (problemas || []).filter((p) => {
        const pl = p.toLowerCase();
        return !pl.includes('placa será unificada') && !pl.startsWith('corrigido automaticamente');
      });

    const linhasTabela = viagens.map((v: any) => {
      const probs = filtrarProblemasDashboard(v.problemas);
      const fora = v.foraDashboard || v.descartada || !v.completa;
      const status = fora
        ? `<strong style="color:#dc2626">FORA DO DASH</strong>${v.motivoForaDashboard ? ` — ${v.motivoForaDashboard}` : ''}${probs.length ? `<br/>${probs.join('; ')}` : ''}`
        : (probs.join('; ') || (v.corrigidaHodometro ? 'No dash (KM tratado)' : (v.alertaSemPesagem ? 'No dash — viagem sem pesagem' : '—')));
      return `
      <tr>
        <td>${v.linha}</td>
        <td>${v.data || '—'}</td>
        <td>${v.placa || '—'}</td>
        <td>${v.motorista || '—'}</td>
        <td style="text-align:center;font-weight:700;color:${fora ? '#dc2626' : '#16a34a'}">${v.contadorViagens ?? '—'}</td>
        <td>${v.kmTotal != null ? v.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : (v.kmTotalCalculado != null ? v.kmTotalCalculado.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '*' : '—')}</td>
        <td>${celulaPeso(v)}</td>
        <td style="color:${fora ? '#dc2626' : '#b45309'}; font-size:9px">${status}</td>
      </tr>
    `;
    }).join('');

    const ap = relatorio.resumoPlacas;
    const resumoPlacasHtml = ap?.alerta ? `
  <div class="aviso" style="background:#fef2f2;border-color:#fecaca;color:#991b1b">
    <strong>Placas:</strong> ${ap.alerta}
  </div>` : '';

    const problemasLista = relatorio.problemasDashboard || relatorio.problemasAgrupados || [];
    const problemasHtml = problemasLista.map((p: any) => `
      <div style="display:flex; justify-content:space-between; padding:6px 10px; background:#fef2f2; border-radius:6px; margin-bottom:4px; font-size:13px;">
        <span>${p.tipo}</span>
        <span style="font-weight:700; color:#dc2626">${p.quantidade} viagem(ns)</span>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; overflow: visible; }
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: #f1f5f9; }
    .header { text-align: center; padding: 20px 0 10px; }
    .header h1 { margin: 0; font-size: 20px; color: #1e293b; }
    .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
    .card { background: #fff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .card .num { font-size: 22px; font-weight: 700; color: #1e293b; }
    .card .label { font-size: 10px; color: #64748b; margin-top: 2px; }
    .card.completas .num { color: #16a34a; }
    .card.incompletas .num { color: #dc2626; }
    .section-title { font-size: 14px; font-weight: 700; color: #334155; margin: 16px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #6366f1; }
    .problemas-box { background: #fff; border-radius: 8px; padding: 10px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .aviso { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size: 12px; color: #1e40af; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; }
    th { background: #1e293b; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
    td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) { background: #f8fafc; }
    tr { break-inside: avoid; }
    .footer { text-align: center; font-size: 10px; color: #94a3b8; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
    .obs { font-size: 10px; color: #64748b; font-style: italic; margin-top: 4px; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Relatório de Saúde dos Dados</h1>
    <p style="font-size:13px; font-weight:600; color:#334155; margin:6px 0 2px">
      Contrato: ${contratoNome} • Tipo: ${tipoLabel} • Data: ${dataRelatorio}
    </p>
    <p>Serviço: ${servicoNome} • Arquivo: ${relatorio.nomeArquivo || '—'} • Aba: ${relatorio.aba || '—'}</p>
  </div>

  <div class="summary">
    <div class="card"><div class="num">${relatorio.somaContadorViagens ?? relatorio.totalViagens ?? 0}</div><div class="label">CONTADOR planilha</div></div>
    <div class="card completas"><div class="num">${relatorio.somaContadorNoDashboard ?? validas}</div><div class="label">CONTADOR no dashboard</div></div>
    <div class="card incompletas"><div class="num">${relatorio.somaContadorForaDashboard ?? inconsistentes}</div><div class="label">CONTADOR fora do dash</div></div>
    ${tDash > 0 ? `<div class="card completas"><div class="num">${fmtTon(tDash)}</div><div class="label">t no ciclo/dashboard</div></div>` : ''}
    ${tFora > 0 ? `<div class="card incompletas"><div class="num">${fmtTon(tFora)}</div><div class="label">t FORA do ciclo</div></div>` : ''}
    ${descartadas > 0 ? `<div class="card"><div class="num">${descartadas}</div><div class="label">Linhas ignoradas</div></div>` : ''}
    ${emBranco > 0 ? `<div class="card"><div class="num">${emBranco}</div><div class="label">Linhas em branco</div></div>` : ''}
    <div class="card"><div class="num">${relatorio.percentualCompleto || 0}%</div><div class="label">% Linhas válidas</div></div>
  </div>

  <div class="aviso">
    CONTADOR DE VIAGENS na planilha: <strong>${relatorio.somaContadorViagens ?? '—'}</strong>.
    Entram no dashboard: <strong>${relatorio.somaContadorNoDashboard ?? validas}</strong>.
    Ficam fora: <strong>${relatorio.somaContadorForaDashboard ?? 0}</strong>
    (${inconsistentes} linha(s) inconsistente(s)${descartadas > 0 ? ` + ${descartadas} ignorada(s)` : ''}).
    ${tDash > 0
      ? `A coluna Toneladas do ciclo soma só as viagens válidas: <strong>${fmtTon(tDash)} t</strong>. `
      : ''}
    ${tFora > 0
      ? `<strong>${fmtTon(tFora)} t</strong> ficaram FORA DO DASH e não entram no total. Planilha ≈ ciclo + toneladas fora. `
      : ''}
    ${descartadas > 0 ? `${descartadas} linha(s) sem placa, KM Total e Peso Total foram ignoradas. ` : ''}
    ${emBranco > 0 ? `${emBranco} linha(s) em branco da planilha foram ignoradas (não contam como problema). ` : ''}
    ${(relatorio.viagensSemPesagem || 0) > 0
      ? `${relatorio.viagensSemPesagem} viagem(ns) sem pesagem (trecho com horário e PESO vazio) sobem no dashboard; o peso dessa faixa não soma. `
      : ''}
    Regras: KM máx. 300, peso &gt; 0, sem negativos, horas com ":" (não ";").
  </div>

  ${(relatorio.regrasSaude || []).length > 0 ? `
  <div class="section-title">O que precisa para entrar no dashboard</div>
  <ul style="font-size:11px; color:#475569; margin:0 0 12px 18px; padding:0;">
    ${(relatorio.regrasSaude || []).map((r: string) => `<li>${r}</li>`).join('')}
  </ul>
  ` : ''}

  <div class="section-title">Problemas que excluem viagens do dashboard</div>
  <div class="problemas-box">
    ${problemasHtml || '<p style="color:#16a34a; font-weight:600">Nenhum bloqueio — todas as viagens identificadas entram no dashboard.</p>'}
  </div>

  ${resumoPlacasHtml}

  ${viagens.length > 0 ? `
  <div class="section-title">Viagens que NÃO sobem / tratadas (${viagens.length}${viagens.length >= 500 ? '+' : ''})</div>
  <table>
    <thead>
      <tr>
        <th>Linha</th><th>Data</th><th>Placa</th><th>Motorista</th><th>Contador</th>
        <th>KM Total</th><th>Peso da linha (t)</th><th>Status / Problemas</th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela}
    </tbody>
  </table>
  <div class="obs">
    * Contador = CONTADOR DE VIAGENS. O peso é o total da linha em toneladas (kg ÷ 1000) —
    quando a linha tem mais de uma viagem, cada pesagem (PESO 1–5) aparece detalhada abaixo do total.
    Linhas FORA DO DASH não entram na coluna Toneladas do ciclo.
  </div>
  ` : ''}

  <div class="footer">
    Relatório gerado automaticamente • Sistemma • ${new Date().toLocaleString('pt-BR')}
  </div>
</body>
</html>`;
  };

  const gerarPdfViagensDeRelatorio = async (relatorio: any, opts?: { silencioso?: boolean }): Promise<boolean> => {
    setGerandoPdfViagens(true);
    try {
      const html = montarHtmlPdfViagens(relatorio);
      const filename = obterNomePdfSaudeDados();
      await pdfService.gerarEBaixar(html, filename, 'default');
      if (!opts?.silencioso) {
        adicionarToast('PDF com dados inconsistentes gerado!', 'success');
      }
      return true;
    } catch (err) {
      if (!opts?.silencioso) {
        const msg = isAxiosError(err)
          ? (err.response?.data as { error?: string })?.error || 'Erro ao gerar PDF'
          : 'Erro ao gerar PDF';
        adicionarToast(msg, 'error');
      }
      return false;
    } finally {
      setGerandoPdfViagens(false);
    }
  };

  const handleGerarPdfViagens = async () => {
    if (!dadosViagens) return;
    await gerarPdfViagensDeRelatorio(dadosViagens);
  };

  const mensagemProcessamentoUpload = () => {
    const ehUnif = modeloRocadaUi?.modelo === 'servicos_unificados' || validacaoData?.ehUnificado;
    if (validando) {
      if (ehUnif) return 'Detectando layout unificado (tipos de serviço)...';
      return ehRocada
        ? 'Identificando modelo da planilha (Londrina, Pinda, QGIS, Betim ou Padrão)...'
        : 'Validando estrutura da planilha...';
    }
    if (analisandoViagens) return 'Analisando viagens (KM, peso, rota)...';
    if (conferindoDiaria) return 'Conferindo planilha vs sistema (dia a dia)...';
    if (gerandoPdfViagens) return 'Gerando PDF de saúde dos dados...';
    if (uploading) {
      if (ehUnif) return 'Importando e distribuindo por tipo de serviço...';
      if (ehRocada && modeloRocadaUi) {
        return `Importando com modelo ${modeloRocadaUi.label}...`;
      }
      return ehRocada
        ? 'Importando registros de roçada para o dashboard...'
        : 'Importando viagens válidas para o dashboard...';
    }
    return '';
  };

  const excluirPlanilha = async (uploadId: number) => {
    const id = Number(uploadId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (excluindoPlanilhaId === id) return;

    setExcluindoPlanilhaId(id);
    try {
      await coletaService.excluirUpload(id);
      invalidateCachesServico(contractId, servicoId);
      const data = await servicoService.getPadrao(contractId, servicoId, { force: true });
      const ups = data.uploads?.ultimos || [];
      const cols = data.servico?.padraoPlanilha?.colunas || [];
      const temUpload = cols.length > 0 || ups.length > 0;

      await onPlanilhaExcluida(temUpload);
      if (!temUpload) onSetEtapa('upload');

      if (qualidadeUploadId === id) {
        setQualidadeAberta(false);
        setQualidadeUploadId(null);
      }

      adicionarToast('Planilha e registros removidos do banco', 'success');
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao excluir planilha'
        : 'Erro ao excluir planilha';
      adicionarToast(msg, 'error');
    } finally {
      setExcluindoPlanilhaId(null);
    }
  };

  // ─── Modo validação: mostra preview da qualidade antes de importar ───
  if (modoValidacao) {
      return (
        <div>
          {/* Informação do arquivo selecionado */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.5rem 0.75rem', background: '#f8fafc',
            borderRadius: '8px', border: '1px solid #e2e8f0',
            marginBottom: '0.75rem',
          }}>
            <FiFileText size={18} style={{ color: '#6366f1' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1e293b' }}>
                {arquivoValidacao?.name || 'Arquivo selecionado'}
              </div>
              <div style={{ fontSize: '0.65rem', color: '#64748b' }}>
                {arquivoValidacao ? (arquivoValidacao.size / 1024).toFixed(1) + ' KB' : ''}
              </div>
            </div>
            {(validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading) && (
              <div style={{
                width: '18px', height: '18px',
                border: '2px solid #e2e8f0', borderTopColor: '#6366f1',
                borderRadius: '50%', animation: 'spin 0.7s linear infinite',
              }} />
            )}
          </div>

          {(validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading) && mensagemProcessamentoUpload() && (
            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0 0 0.5rem' }}>
              {mensagemProcessamentoUpload()}
            </p>
          )}

          {/* Preview layout unificado */}
          {validacaoData?.ehUnificado ? (
            <div style={{
              background: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fff7ed' : '#eff6ff',
              border: `1px solid ${validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fdba74' : '#93c5fd'}`,
              borderRadius: '10px',
              padding: '0.75rem 1rem', marginBottom: '0.5rem', fontSize: '0.78rem',
              color: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#9a3412' : '#1e3a8a',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.85rem' }}>Aba CONSOLIDADO</strong>
                <span style={{
                  background: '#1e3a8a', color: '#bfdbfe',
                  fontWeight: 800, fontSize: '0.72rem',
                  padding: '0.28rem 0.65rem', borderRadius: '999px',
                }}>
                  Distribui por tipo de serviço
                </span>
              </div>
              <div style={{ marginTop: '0.45rem' }}>
                {validacaoData.mensagem}
              </div>
              <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.9 }}>
                Só a aba CONSOLIDADO é importada. Cada linha vai para o serviço do contrato
                com o mesmo tipo (ROÇADA → Roçada, CAPINA → Capina, etc.).
              </div>
              {Array.isArray(validacaoData.porTipo) && validacaoData.porTipo.length > 0 && (
                <ul style={{ margin: '0.45rem 0 0', paddingLeft: '1.1rem' }}>
                  {validacaoData.porTipo.map((p: any, i: number) => (
                    <li key={i}>
                      <strong>{p.tipoLabel}</strong>: {p.registros} reg. ·{' '}
                      {Number(p.quantitativoTotal || 0).toLocaleString('pt-BR')}
                      {p.undPrincipal ? ` ${p.undPrincipal}` : ''} · {p.dias} dia(s)
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(validacaoData.abasUsadas) && validacaoData.abasUsadas.length > 0 && (
                <div style={{ marginTop: '0.35rem', fontSize: '0.7rem', opacity: 0.85 }}>
                  Fonte: {validacaoData.abasUsadas.join(', ')}
                </div>
              )}
              {Array.isArray(validacaoData?.avisos) && validacaoData.avisos.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.72rem' }}>
                  {validacaoData.avisos.slice(0, 4).map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : /* Preview de qualidade (coleta) ou resumo multi-modelo (roçada) */
          ehRocada && (validando || modeloRocadaUi || validacaoData?.resumoRocada || validacaoData?.semColunaArea || (validacaoData?.linhasSemArea ?? 0) > 0) ? (
            <div style={{
              background: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fff7ed' : '#f0fdf4',
              border: `1px solid ${validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fdba74' : '#86efac'}`,
              borderRadius: '10px',
              padding: '0.75rem 1rem', marginBottom: '0.5rem', fontSize: '0.78rem',
              color: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#9a3412' : '#166534',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.85rem' }}>
                  {validando && !modeloRocadaUi
                    ? 'Detectando modelo...'
                    : validacaoData?.podeImportar === false || validacaoData?.sucesso === false
                      ? 'Roçada — metragem obrigatória'
                      : 'Modelo da planilha'}
                </strong>
                {(modeloRocadaUi || validacaoData?.modeloLabel || validacaoData?.resumoRocada?.modeloLabel) && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                    background: '#14532d', color: '#bbf7d0',
                    fontWeight: 800, fontSize: '0.78rem',
                    padding: '0.28rem 0.65rem', borderRadius: '999px',
                    letterSpacing: '0.02em',
                  }}>
                    {modeloRocadaUi?.label
                      || validacaoData?.modeloLabel
                      || validacaoData?.resumoRocada?.modeloLabel
                      || labelModeloRocada(validacaoData?.modelo || validacaoData?.resumoRocada?.modelo)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.55rem' }}>
                {MODELOS_ROCADA_OPCOES.filter((m, i, arr) => arr.findIndex((x) => x.label === m.label) === i).map((m) => {
                  const ativo = (modeloRocadaUi?.modelo || validacaoData?.modelo || validacaoData?.resumoRocada?.modelo) === m.id
                    || (m.id === 'modelo_trecho' && (modeloRocadaUi?.modelo || validacaoData?.modelo) === 'generico');
                  return (
                    <span
                      key={m.id}
                      style={{
                        fontSize: '0.65rem', fontWeight: ativo ? 800 : 600,
                        padding: '0.18rem 0.45rem', borderRadius: '999px',
                        border: ativo ? '1px solid #166534' : '1px solid #cbd5e1',
                        background: ativo ? '#dcfce7' : '#f8fafc',
                        color: ativo ? '#14532d' : '#64748b',
                      }}
                    >
                      {m.label}{ativo ? ' ✓' : ''}
                    </span>
                  );
                })}
              </div>

              {validacaoData?.resumoRocada && (
                <div style={{ marginTop: '0.45rem', color: validacaoData?.sucesso === false ? '#c2410c' : '#15803d' }}>
                  {validacaoData.resumoRocada.registros} registro(s) com m² ·{' '}
                  {Number(validacaoData.resumoRocada.areaTotalM2 || 0).toLocaleString('pt-BR')} m² ·{' '}
                  {validacaoData.resumoRocada.dias} dia(s)
                  {Array.isArray(validacaoData.abasUsadas) && validacaoData.abasUsadas.length > 0 && (
                    <> · abas: {validacaoData.abasUsadas.join(', ')}</>
                  )}
                </div>
              )}
              {(validacaoData?.semColunaArea || (validacaoData?.linhasSemArea ?? 0) > 0) && (
                <div style={{
                  marginTop: '0.45rem', padding: '0.45rem 0.55rem', borderRadius: '8px',
                  background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', fontSize: '0.72rem',
                }}>
                  {validacaoData.semColunaArea
                    ? 'Não foi encontrada coluna de metragem/área (m²). Inclua METRAGEM, TOTAL (M²), Área ou EXECUTADO.'
                    : `${validacaoData.linhasSemArea} linha(s) sem m²/área — essas linhas não entram no dashboard.`}
                </div>
              )}
              {Array.isArray(validacaoData?.amostraSemArea) && validacaoData.amostraSemArea.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.7rem' }}>
                  {validacaoData.amostraSemArea.slice(0, 5).map((a: any, i: number) => (
                    <li key={i}>
                      Aba {a.aba}, linha {a.linha}
                      {a.bairro ? ` (${a.bairro})` : ''}
                      {a.data ? ` · ${a.data}` : ''}: {a.motivo}
                    </li>
                  ))}
                </ul>
              )}
              {Array.isArray(validacaoData?.avisos) && validacaoData.avisos.length > 0 && (
                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', color: '#b45309', fontSize: '0.72rem' }}>
                  {validacaoData.avisos.slice(0, 4).map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <QualidadePlanilhaPreview
              dados={validacaoData}
              carregando={validando || analisandoViagens || conferindoDiaria || gerandoPdfViagens || uploading}
            />
          )}

          {uploading && (
            <div className="upload-progress" style={{ marginTop: '0.5rem' }}>
              <div className="upload-bar"><div className="upload-fill" style={{ width: `${uploadPct}%` }} /></div>
              <div className="upload-pct">
                {ehRocada
                  ? `Importando${modeloRocadaUi ? ` (${modeloRocadaUi.label})` : ''}... ${uploadPct}%`
                  : `Importando viagens válidas... ${uploadPct}%`}
              </div>
            </div>
          )}

          {importacaoConcluida && resumoImportacao && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px',
              padding: '0.6rem 0.75rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#166534',
            }}>
              {ehRocada ? (
                <>
                  <strong>Importação concluída</strong>
                  {(resumoImportacao.modeloRocadaLabel || modeloRocadaUi?.label) && (
                    <span style={{
                      display: 'inline-block', marginLeft: '0.4rem',
                      background: '#14532d', color: '#bbf7d0',
                      fontWeight: 800, fontSize: '0.72rem',
                      padding: '0.15rem 0.5rem', borderRadius: '999px',
                    }}>
                      Modelo {resumoImportacao.modeloRocadaLabel || modeloRocadaUi?.label}
                    </span>
                  )}
                  <div style={{ color: '#15803d', marginTop: '0.3rem' }}>
                    {resumoImportacao.importados} registro(s) no dashboard
                    {resumoImportacao.areaTotalM2 != null
                      ? ` · ${Number(resumoImportacao.areaTotalM2).toLocaleString('pt-BR')} m²`
                      : ''}
                    .
                  </div>
                  <button
                    type="button"
                    onClick={() => onSetEtapa('revisao')}
                    style={{
                      marginTop: '0.45rem', fontSize: '0.72rem', fontWeight: 700,
                      padding: '0.35rem 0.7rem', borderRadius: '6px',
                      border: '1px solid #86efac', background: '#fff', color: '#166534',
                      cursor: 'pointer',
                    }}
                  >
                    Ir para Dados →
                  </button>
                </>
              ) : (
                <>
                  <strong>Importação concluída.</strong>{' '}
                  <span style={{ color: '#15803d' }}>
                    {resumoImportacao.validasDashboard} viagem(ns) alimentam o dashboard.
                  </span>
                  {resumoImportacao.inconsistentes > 0 && (
                    <span style={{ color: '#b45309', display: 'block', marginTop: '0.2rem' }}>
                      {resumoImportacao.inconsistentes} viagem(ns) inconsistente(s) ficaram fora dos cálculos. O PDF de saúde foi baixado automaticamente.
                    </span>
                  )}
                  {resumoImportacao.inconsistentes === 0 && (
                    <span style={{ color: '#15803d', display: 'block', marginTop: '0.2rem' }}>
                      PDF de saúde baixado automaticamente.
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── Análise Viagem por Viagem (somente coleta) ─── */}
          {!ehRocada && !validando && validacaoData && validacaoData.sucesso && (
            <div style={{
              marginTop: '0.75rem',
              background: '#fff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              padding: '0.75rem',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '0.5rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 700, color: '#1e293b' }}>
                  <FiSearch size={14} style={{ color: '#6366f1' }} />
                  <span>Relatório de Inconsistências {analisandoViagens ? '(analisando...)' : gerandoPdfViagens ? '(gerando PDF...)' : uploading ? '(importando...)' : ''}</span>
                </div>
                {!analisandoViagens && dadosViagens && (
                  <button
                    type="button"
                    onClick={handleAnalisarViagens}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 600,
                      background: '#f1f5f9', color: '#475569',
                      border: '1px solid #e2e8f0', borderRadius: '5px', cursor: 'pointer',
                    }}
                  >
                    <FiRefreshCw size={11} /> Reanalisar
                  </button>
                )}
              </div>

              {analisandoViagens && !dadosViagens && (
                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '0.25rem 0 0.5rem' }}>
                  Verificando cada linha: KM (máx. 300), peso, horas, rota, placas e negativos...
                </p>
              )}

              {dadosViagens?.avisoDashboard && (
                <div style={{
                  background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
                  padding: '0.5rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.72rem', color: '#92400e',
                }}>
                  {dadosViagens.avisoDashboard}
                </div>
              )}

              {dadosViagens && (dadosViagens.viagensIncompletas > 0 || (dadosViagens.viagensComValorNegativo ?? 0) > 0) && (
                <div style={{
                  background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
                  padding: '0.5rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.72rem', color: '#1e40af',
                }}>
                  Regras do dashboard: <strong>KM ≤ 300</strong>, <strong>peso &gt; 0</strong>,{' '}
                  <strong>sem valores negativos</strong>, horas com <strong>:</strong> (não <strong>;</strong>).
                  Linhas fora dessas regras ficam importadas só para consulta, não nos KPIs.
                </div>
              )}

              {/* Resultados da análise */}
              {dadosViagens && (
                <div>
                  {/* Cards resumo — linhas vs soma contador vs viagens KPI */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.35rem',
                    marginBottom: '0.5rem',
                  }}>
                    <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b' }}>{dadosViagens.totalViagens || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Linhas (rotas)</div>
                    </div>
                    <div style={{ background: '#eff6ff', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{dadosViagens.somaContadorViagens ?? '—'}</div>
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>CONTADOR planilha</div>
                    </div>
                    <div style={{ background: '#f0fdf4', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{dadosViagens.somaContadorNoDashboard ?? dadosViagens.viagensCalculadasDashboard ?? 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#166534' }}>CONTADOR no dash</div>
                    </div>
                    <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>{dadosViagens.somaContadorForaDashboard ?? (dadosViagens.viagensInconsistentesTotal ?? 0)}</div>
                      <div style={{ fontSize: '0.58rem', color: '#991b1b' }}>CONTADOR fora</div>
                    </div>
                    {(dadosViagens.linhasSemContador ?? 0) > 0 && (
                      <div style={{ background: '#fffbeb', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#d97706' }}>{dadosViagens.linhasSemContador}</div>
                        <div style={{ fontSize: '0.58rem', color: '#92400e' }}>Sem contador</div>
                      </div>
                    )}
                    <div style={{ background: '#f0f9ff', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563eb' }}>{dadosViagens.percentualCompleto || 0}%</div>
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>% Válidas</div>
                    </div>
                  </div>

                  {dadosViagens.somaContadorViagens != null
                    && dadosViagens.viagensCalculadasDashboard != null
                    && dadosViagens.somaContadorViagens !== dadosViagens.viagensCalculadasDashboard && (
                    <div style={{
                      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#92400e',
                    }}>
                      Soma do CONTADOR DE VIAGENS ({dadosViagens.somaContadorViagens}) ≠ viagens calculadas ({dadosViagens.viagensCalculadasDashboard}) — linhas sem contador usam PESO 1–4 ou 1 viagem operacional.
                    </div>
                  )}

                  {(dadosViagens.viagensCorrigidasHodometro ?? 0) > 0 && (
                    <div style={{
                      background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#166534',
                    }}>
                      <strong>{dadosViagens.viagensCorrigidasHodometro}</strong> viagem(ns) com hodômetro inconsistente
                      (KM inicial = final / quebrado) foram tratadas: KM zerado, peso e viagens mantidos no dashboard.
                    </div>
                  )}

                  {(dadosViagens.pesagensAltas ?? 0) > 0 && (
                    <div style={{
                      background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#9a3412',
                    }}>
                      <strong>{dadosViagens.pesagensAltas}</strong> pesagem(ns) acima de 15.000 kg/viagem
                      (até 1.000 t) em {dadosViagens.linhasComPesagemAlta ?? '—'} linha(s) —
                      alerta de saúde; <strong>não bloqueia</strong> a subida para o dashboard.
                    </div>
                  )}

                  {(dadosViagens.linhasDescartadasSemDados ?? 0) > 0 && (
                    <div style={{
                      background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#475569',
                    }}>
                      <strong>{dadosViagens.linhasDescartadasSemDados}</strong> linha(s) ignorada(s) — sem placa, KM Total e Peso Total (não entram no sistema).
                    </div>
                  )}

                  {(dadosViagens.resumoPlacas?.alerta) && (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px',
                      padding: '0.45rem 0.65rem', marginBottom: '0.5rem', fontSize: '0.68rem', color: '#991b1b',
                    }}>
                      <strong>Placas:</strong> {dadosViagens.resumoPlacas.alerta}
                    </div>
                  )}

                  {dadosViagens.conferenciaCadastro?.ativa && (
                    <div style={{
                      background: dadosViagens.conferenciaCadastro.temDivergencia ? '#fffbeb' : '#f0fdf4',
                      border: `1px solid ${dadosViagens.conferenciaCadastro.temDivergencia ? '#fde68a' : '#bbf7d0'}`,
                      borderRadius: '6px', padding: '0.45rem 0.65rem', marginBottom: '0.5rem',
                      fontSize: '0.68rem',
                      color: dadosViagens.conferenciaCadastro.temDivergencia ? '#92400e' : '#166534',
                    }}>
                      <strong>Cadastro × planilha:</strong> {dadosViagens.conferenciaCadastro.resumo}
                      {(['placas', 'motoristas', 'coletores'] as const).map((tipo) => {
                        const ent = dadosViagens.conferenciaCadastro[tipo];
                        if (!ent || ent.cadastroVazio) return null;
                        const label = tipo === 'placas' ? 'Placas' : tipo === 'motoristas' ? 'Motoristas' : 'Coletores';
                        const extras: string[] = [];
                        if (ent.soPlanilha.length) extras.push(`fora do cadastro: ${ent.soPlanilha.slice(0, 8).join(', ')}${ent.soPlanilha.length > 8 ? '…' : ''}`);
                        if (ent.soCadastro.length) extras.push(`cadastrado(s) ausente(s): ${ent.soCadastro.slice(0, 8).join(', ')}${ent.soCadastro.length > 8 ? '…' : ''}`);
                        if (!extras.length) return null;
                        return (
                          <div key={tipo} style={{ marginTop: '0.25rem' }}>
                            <strong>{label}:</strong> {extras.join(' · ')}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {dadosViagens && !dadosViagens.conferenciaCadastro?.ativa && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                      padding: '0.4rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.65rem', color: '#64748b',
                    }}>
                      Cadastre placas, motoristas e coletores no contrato para conferir automaticamente com a planilha.
                    </div>
                  )}

                  {(dadosViagens.regrasSaude || []).length > 0 && (
                    <div style={{
                      background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px',
                      padding: '0.45rem 0.6rem', marginBottom: '0.5rem', fontSize: '0.62rem', color: '#475569',
                    }}>
                      <strong>Requisitos do dashboard:</strong>
                      <span style={{ marginLeft: '0.35rem' }}>
                        {(dadosViagens.regrasSaude as string[]).join(' · ')}
                      </span>
                    </div>
                  )}

                  {((dadosViagens.problemasDashboard || dadosViagens.problemasAgrupados || []).length > 0) && (
                    <div style={{ marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, color: '#dc2626', marginBottom: '0.2rem' }}>
                        Fora do dashboard:
                      </div>
                      {(dadosViagens.problemasDashboard || dadosViagens.problemasAgrupados).map((p: any, i: number) => (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between',
                          padding: '0.25rem 0.5rem', background: '#fef2f2',
                          borderRadius: '4px', marginBottom: '0.15rem',
                          fontSize: '0.65rem',
                        }}>
                          <span style={{ color: '#7f1d1d' }}>{p.tipo}</span>
                          <span style={{ fontWeight: 700, color: '#dc2626' }}>{p.quantidade} viagem(ns)</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Botão gerar PDF */}
                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                    <button
                      onClick={handleGerarPdfViagens}
                      disabled={gerandoPdfViagens}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                        padding: '0.35rem 0.7rem', fontSize: '0.68rem', fontWeight: 600,
                        background: gerandoPdfViagens ? '#e2e8f0' : '#dc2626',
                        color: gerandoPdfViagens ? '#94a3b8' : '#fff',
                        border: 'none', borderRadius: '5px', cursor: gerandoPdfViagens ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {gerandoPdfViagens ? (
                        <><div className="spin" style={{width:12,height:12,border:'2px solid #fca5a5',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}} /> Gerando PDF...</>
                      ) : (
                        <><FiDownload size={11} /> Baixar PDF novamente</>
                      )}
                    </button>
                  </div>

                  {/* Preview: inconsistentes + tratadas por hodômetro */}
                  {dadosViagens.viagens && dadosViagens.viagens.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Amostra — viagens FORA DO DASH / tratadas (até 10):
                      </div>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.6rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#1e293b', color: '#fff' }}>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Linha</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Data</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Placa</th>
                              <th style={{ padding: '3px 5px', textAlign: 'center' }}>Cont.</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>KM</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Peso</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dadosViagens.viagens || []).slice(0, 10).map((v: any, i: number) => {
                              const fora = v.foraDashboard || v.descartada || v.completa === false;
                              return (
                              <tr
                                key={i}
                                style={{
                                  borderBottom: '1px solid #e2e8f0',
                                  background: fora
                                    ? '#fef2f2'
                                    : v.alertaPesagemAlta
                                      ? '#fff7ed'
                                      : v.alertaSemPesagem
                                        ? '#fffbeb'
                                        : (v.corrigidaHodometro ? '#f0fdf4' : undefined),
                                }}
                              >
                                <td style={{ padding: '3px 5px' }}>{v.linha}</td>
                                <td style={{ padding: '3px 5px' }}>{v.data || '—'}</td>
                                <td style={{ padding: '3px 5px' }}>{v.placa || '—'}</td>
                                <td style={{ padding: '3px 5px', textAlign: 'center', fontWeight: 700, color: fora ? '#dc2626' : '#16a34a' }}>{v.contadorViagens ?? '—'}</td>
                                <td style={{ padding: '3px 5px', color: v.corrigidaHodometro ? '#166534' : (!v.kmTotal && !v.kmTotalCalculado ? '#dc2626' : '#16a34a') }}>
                                  {(() => {
                                    if (!v.corrigidaHodometro) {
                                      return v.kmTotal != null ? v.kmTotal : (v.kmTotalCalculado != null ? `${v.kmTotalCalculado}*` : '—');
                                    }
                                    const kmFinal = (v.kmTotalCalculado != null && Number(v.kmTotalCalculado) > 0)
                                      ? Number(v.kmTotalCalculado)
                                      : (v.kmTotal != null && Number(v.kmTotal) > 0 ? Number(v.kmTotal) : null);
                                    if (kmFinal != null && kmFinal > 0) {
                                      return `${kmFinal} (ajustado)`;
                                    }
                                    return '0 (tratado)';
                                  })()}
                                </td>
                                <td style={{
                                  padding: '3px 5px',
                                  color: v.alertaPesagemAlta
                                    ? '#9a3412'
                                    : (v.pesoTotal == null || Number(v.pesoTotal) <= 0 ? '#dc2626' : '#16a34a'),
                                  fontWeight: v.alertaPesagemAlta ? 700 : undefined,
                                }}>
                                  {v.pesoTotal != null ? `${(Number(v.pesoTotal) / 1000).toFixed(1)} t` : '—'}
                                </td>
                                <td style={{
                                  padding: '3px 5px',
                                  color: fora ? '#dc2626' : (v.corrigidaHodometro ? '#166534' : '#b45309'),
                                  fontSize: '0.55rem',
                                }}>
                                  {fora
                                    ? (v.motivoForaDashboard || 'FORA DO DASH')
                                    : ((v.problemas || [])
                                      .filter((p: string) => {
                                        const pl = p.toLowerCase();
                                        if (v.corrigidaHodometro && (
                                          pl.includes('hodômetro')
                                          || pl.includes('hodometro')
                                          || pl.includes('km zerado')
                                          || pl.includes('km total')
                                        )) return true;
                                        if (v.alertaPesagemAlta && pl.includes('pesagem alta')) return true;
                                        if (v.alertaSemPesagem && pl.includes('sem pesagem')) return true;
                                        return !pl.includes('placa será unificada') && !pl.startsWith('corrigido automaticamente');
                                      })
                                      .join('; ') || (v.corrigidaHodometro ? 'No dash (KM tratado)' : (v.alertaSemPesagem ? 'No dash — viagem sem pesagem' : '—')))}
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {dadosViagens.viagens.length > 10 && (
                        <div style={{ fontSize: '0.6rem', color: '#94a3b8', textAlign: 'center', marginTop: '0.15rem' }}>
                          + {dadosViagens.viagens.length - 10} viagens — veja o PDF completo
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ─── Conferência diária: planilha vs sistema ─── */}
          {!validando && !conferindoDiaria && conferenciaDiaria && (
            <div style={{
              marginTop: '0.75rem',
              background: conferenciaDiaria.temDivergencia ? '#fffbeb' : '#f0fdf4',
              borderRadius: '10px',
              border: `1px solid ${conferenciaDiaria.temDivergencia ? '#fde68a' : '#bbf7d0'}`,
              padding: '0.75rem',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                fontSize: '0.78rem', fontWeight: 700,
                color: conferenciaDiaria.temDivergencia ? '#92400e' : '#166534',
                marginBottom: '0.45rem',
              }}>
                <FiCheckCircle size={14} />
                Conferência diária — planilha vs sistema
              </div>
              <p style={{ fontSize: '0.68rem', color: '#475569', margin: '0 0 0.5rem' }}>
                {conferenciaDiaria.recomendacao}
                {conferenciaDiaria.ultimaDataSistema && (
                  <span style={{ display: 'block', marginTop: '0.2rem', color: '#64748b' }}>
                    Último dia no sistema: {conferenciaDiaria.ultimaDataSistema.split('-').reverse().join('/')}
                    {conferenciaDiaria.ultimaDataPlanilha && (
                      <> · Planilha até: {conferenciaDiaria.ultimaDataPlanilha.split('-').reverse().join('/')}</>
                    )}
                  </span>
                )}
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
                gap: '0.35rem', marginBottom: '0.55rem',
              }}>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#16a34a' }}>{conferenciaDiaria.diasNovos}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Novos</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#2563eb' }}>{conferenciaDiaria.diasIguais}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Conferem</div>
                </div>
                <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: '#d97706' }}>{conferenciaDiaria.diasDivergentes}</div>
                  <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Diferem</div>
                </div>
                {(conferenciaDiaria.diasSomenteSistema ?? 0) > 0 && (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #fed7aa' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#c2410c' }}>{conferenciaDiaria.diasSomenteSistema}</div>
                    <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Só no sistema</div>
                  </div>
                )}
                {conferenciaDiaria.diasBloqueados > 0 && (
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #fecaca' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#dc2626' }}>{conferenciaDiaria.diasBloqueados}</div>
                    <div style={{ fontSize: '0.58rem', color: '#64748b' }}>Bloqueados</div>
                  </div>
                )}
              </div>
              {(conferenciaDiaria.diasDivergentes > 0 || conferenciaDiaria.diasNovos > 0 || (conferenciaDiaria.diasSomenteSistema ?? 0) > 0) && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9', position: 'sticky', top: 0 }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Data</th>
                        <th style={{ padding: '4px 6px', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '4px 6px', textAlign: 'left' }}>Planilha / Sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conferenciaDiaria.dias
                        .filter(d => d.status !== 'igual')
                        .slice(0, 25)
                        .map((d) => {
                          const cor = d.status === 'novo' ? '#16a34a'
                            : d.status === 'divergente' ? '#d97706'
                            : d.status === 'somente_sistema' ? '#c2410c'
                            : '#dc2626';
                          const lbl = d.status === 'novo' ? 'Novo'
                            : d.status === 'divergente' ? 'Diverge'
                            : d.status === 'somente_sistema' ? 'Remover'
                            : 'Bloqueado';
                          return (
                            <tr key={d.data} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 6px', fontWeight: 600 }}>{d.dataBr}</td>
                              <td style={{ padding: '3px 6px', textAlign: 'center', color: cor, fontWeight: 700 }}>{lbl}</td>
                              <td style={{ padding: '3px 6px', color: '#475569' }}>
                                {d.status === 'novo' && d.planilha ? (
                                  `${d.planilha.rotas} rotas · ${d.planilha.viagens} viagens`
                                ) : d.status === 'somente_sistema' && d.sistema ? (
                                  `${d.sistema.rotas} rotas · ${d.sistema.viagens} viagens (serão removidos)`
                                ) : d.sistema && d.planilha ? (
                                  <>
                                    {d.diferencas.join(' · ') || `${d.planilha.viagens} vs ${d.sistema.viagens} viagens`}
                                  </>
                                ) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Ações após validação + importação */}
          {!validando && !analisandoViagens && !conferindoDiaria && !uploading && validacaoData && validacaoData.sucesso && dadosViagens && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem',
              justifyContent: 'flex-end', flexWrap: 'wrap',
            }}>
              {!importacaoConcluida && arquivoValidacao && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => importarPlanilhaValidada(arquivoValidacao, dadosViagens)}
                  disabled={(conferenciaDiaria?.diasBloqueados ?? 0) > 0}
                  title={
                    (conferenciaDiaria?.diasBloqueados ?? 0) > 0
                      ? 'Há dias em ciclo fechado — não é possível importar'
                      : temPlanilha
                        ? 'Atualiza os dias da planilha, preserva dias só no sistema e remove a planilha antiga'
                        : 'Importar viagens válidas'
                  }
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    background: (conferenciaDiaria?.diasBloqueados ?? 0) > 0 ? '#94a3b8' : '#16a34a',
                    border: 'none', color: '#fff',
                    padding: '0.4rem 0.85rem', borderRadius: '6px',
                    fontSize: '0.75rem', fontWeight: 600,
                    cursor: (conferenciaDiaria?.diasBloqueados ?? 0) > 0 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <FiUpload size={12} />
                  Tentar importar novamente
                </button>
              )}
              <button
                className="btn btn-secondary btn-sm"
                onClick={limparValidacao}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.4rem 0.85rem', borderRadius: '6px',
                  fontSize: '0.75rem', cursor: 'pointer',
                }}
              >
                {importacaoConcluida ? 'Fechar relatório' : 'Cancelar'}
              </button>
            </div>
          )}

          {/* Se houve erro na validação ou dados inválidos */}
          {!validando && validacaoData && !validacaoData.sucesso && (
            <div style={{
              display: 'flex', gap: '0.5rem', marginTop: '0.5rem',
              justifyContent: 'flex-end',
            }}>
              <button className="btn btn-secondary btn-sm" onClick={limparValidacao}>
                Voltar
              </button>
            </div>
          )}

          {/* Input oculto para re-selecionar (caso queira trocar) */}
          <input
            type="file" accept=".xlsx,.xls,.xlsm"
            ref={validacaoInputRef}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleSelecionarPlanilha(f);
              if (e.target) e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </div>
      );
    }

    // ─── Seleção de planilha → validação + relatório de viagens automático ───
    return (
      <div>
        <div className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleSelecionarPlanilha(f); }}
          onClick={() => { const el = document.createElement('input'); el.type = 'file'; el.accept = '.xlsx,.xls,.xlsm'; el.onchange = (ev: any) => { const f = ev?.target?.files?.[0]; if (f) handleSelecionarPlanilha(f); }; el.click(); }}
        >
          <div className="upload-zone-icon">{(validando || analisandoViagens || gerandoPdfViagens || uploading) ? <FiRefreshCw className="spin" /> : <FiShield />}</div>
          <p>{mensagemProcessamentoUpload() || 'Arraste ou clique para enviar a planilha'}</p>
          <small>
            {ehRocada
              ? '.xlsx, .xls, .xlsm — modelos Londrina, Pinda, QGIS, Betim e padrão (área m²)'
              : '.xlsx, .xls, .xlsm — valida, baixa PDF de saúde e importa viagens válidas'}
          </small>
        </div>
        <p style={{
          fontSize: '0.62rem', color: '#94a3b8', margin: '0.35rem 0 0',
          textAlign: 'center',
        }}>
          {ehRocada
            ? 'Roçada: ao enviar, o sistema identifica o modelo (Londrina, Pinda, QGIS, Betim ou Padrão) e mostra qual foi usado.'
            : 'Fluxo automático: validação → PDF de saúde → importação (KM≤300, peso > 0; só viagens válidas entram no dashboard).'}
        </p>
        {uploading && (
          <div className="upload-progress">
            <div className="upload-bar"><div className="upload-fill" style={{ width: `${uploadPct}%` }} /></div>
            <div className="upload-pct">{uploadPct}%</div>
          </div>
        )}
        {planilhas.length > 0 && (
          <div className="planilhas-lista">
            <p className="planilhas-titulo">Planilhas ({planilhas.length})</p>
            {planilhas.map(p => (
              <div key={p.id} className="planilha-item">
                <FiFileText size={14} className="planilha-icon" />
                <div className="planilha-info">
                  <div className="planilha-nome">{p.nomeArquivo}</div>
                  <div className="planilha-data">{new Date(p.criadoEm).toLocaleDateString('pt-BR')} &bull; {p.linhasImportadas}/{p.totalLinhas} linhas</div>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <button
                    className="planilha-qualidade"
                    onClick={() => { setQualidadeUploadId(p.id); setQualidadeAberta(true); }}
                    title="Ver relatório de qualidade"
                    style={{
                      background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px',
                      padding: '0.2rem 0.35rem', cursor: 'pointer', color: '#64748b',
                      fontSize: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.15rem',
                      fontWeight: 600,
                    }}
                  >
                    <FiSearch size={9} /> Qualidade
                  </button>
                  <button
                    type="button"
                    className="planilha-excluir"
                    onClick={() => excluirPlanilha(p.id)}
                    disabled={excluindoPlanilhaId === p.id}
                    title="Excluir planilha e registros importados"
                  >
                    {excluindoPlanilhaId === p.id ? <FiRefreshCw size={12} className="spin" /> : <FiTrash2 size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <RelatorioQualidade
          uploadId={qualidadeUploadId}
          aberto={qualidadeAberta}
          onFechar={() => { setQualidadeAberta(false); setQualidadeUploadId(null); }}
        />
      </div>
    );

});

export default ServicoUploadTab;
