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
  const validacaoInputRef = useRef<HTMLInputElement>(null);


  const importarPlanilhaValidada = async (file: File, relatorio?: any): Promise<boolean> => {
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
        const registrosPreservados = data.consolidacao?.registrosPreservados ?? 0;

        setResumoImportacao({
          importados,
          validasDashboard,
          inconsistentes,
          uploadsRemovidos,
          registrosPreservados,
        });
        setImportacaoConcluida(true);
        onSetStatus(prev => ({ ...prev, upload: 'done', revisao: 'done' }));
        onSetEtapa('revisao');
        onRefreshData();

        const extras: string[] = [];
        if (uploadsRemovidos > 0) extras.push(`${uploadsRemovidos} planilha(s) antiga(s) removida(s)`);
        if (registrosPreservados > 0) extras.push(`${registrosPreservados} registro(s) de dias só no sistema preservados`);
        const sufixo = extras.length ? ` ${extras.join('; ')}.` : '';

        if (inconsistentes > 0) {
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

  // ─── Roçada: preview multi-modelo → importação (sem validação de viagem) ───
  const handleValidarRocada = async (file: File) => {
    setArquivoValidacao(file);
    setValidando(true);
    setValidacaoData(null);
    setDadosViagens(null);
    setConferenciaDiaria(null);
    setImportacaoConcluida(false);
    setResumoImportacao(null);
    setModoValidacao(true);
    try {
      const preview = await coletaService.previewRocada(file, servicoId);
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
        modelo: preview.modelo,
        linhasSemArea: preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0,
        semColunaArea: preview.semColunaArea ?? preview.resumo?.semColunaArea ?? false,
        amostraSemArea: preview.amostraSemArea || [],
        filtroTipoAplicado: preview.filtroTipoAplicado,
        porTipoExecucao: preview.porTipoExecucao || preview.resumo?.porTipoExecucao,
        podeImportar,
      } as any);

      if (!podeImportar) {
        const msg = preview.semColunaArea || preview.resumo?.semColunaArea
          ? 'Planilha sem coluna de metragem (m²/área). Inclua a coluna e envie novamente.'
          : preview.mensagem || 'Nenhuma linha com m²/área válida nesta planilha.';
        adicionarToast(msg, 'error');
        return;
      }

      const semArea = preview.linhasSemArea ?? preview.resumo?.linhasSemArea ?? 0;
      const porTipo = preview.porTipoExecucao || preview.resumo?.porTipoExecucao;
      const splitInfo = porTipo && (porTipo.manual?.registros || porTipo.mecanizada?.registros)
        ? ` Manual ${porTipo.manual.registros} · Mecanizada ${porTipo.mecanizada.registros}.`
        : '';
      adicionarToast(
        `Modelo ${preview.resumo.modelo}: ${preview.resumo.registros} registro(s), `
        + `${preview.resumo.areaTotalM2.toLocaleString('pt-BR')} m², ${preview.resumo.dias} dia(s).`
        + splitInfo
        + (semArea > 0 ? ` ${semArea} linha(s) sem m² ignorada(s).` : ''),
        semArea > 0 ? 'warning' : 'success',
      );

      const importou = await importarPlanilhaValidada(file, {
        viagensValidasDashboard: preview.resumo.registros,
        viagensCompletas: preview.resumo.registros,
      });
      if (importou) {
        adicionarToast(
          splitInfo
            ? 'Planilha importada: dashboards Manual e Mecanizada atualizados com os dados da planilha.'
            : 'Planilha de roçada importada. Dashboard atualizado com área (m²) por dia/bairro.',
          'info',
        );
      }
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
    const dataRelatorio = formatarDataArquivoPdf();
    const tipoLabel = labelTipoServicoArquivo(tipoServico, TIPOS_SERVICO_LABELS as Record<string, string>);

    const filtrarProblemasDashboard = (problemas: string[] | undefined) =>
      (problemas || []).filter((p) => {
        const pl = p.toLowerCase();
        return !pl.includes('placa será unificada') && !pl.startsWith('corrigido automaticamente');
      });

    const linhasTabela = viagens.map((v: any) => {
      const probs = filtrarProblemasDashboard(v.problemas);
      return `
      <tr>
        <td>${v.linha}</td>
        <td>${v.data || '—'}</td>
        <td>${v.placa || '—'}</td>
        <td>${v.motorista || '—'}</td>
        <td>${v.rota || '—'}</td>
        <td>${v.kmTotal != null ? v.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : (v.kmTotalCalculado != null ? v.kmTotalCalculado.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '*' : '—')}</td>
        <td>${v.pesoTotal != null ? Number(v.pesoTotal).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
        <td style="color:#b45309; font-size:9px">${probs.join('; ') || '—'}</td>
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
    <div class="card"><div class="num">${relatorio.totalViagens || 0}</div><div class="label">Total de Viagens</div></div>
    <div class="card completas"><div class="num">${validas}</div><div class="label">Válidas (dashboard)</div></div>
    <div class="card incompletas"><div class="num">${inconsistentes}</div><div class="label">Inconsistentes</div></div>
    ${descartadas > 0 ? `<div class="card"><div class="num">${descartadas}</div><div class="label">Ignoradas (sem dados)</div></div>` : ''}
    <div class="card"><div class="num">${relatorio.percentualCompleto || 0}%</div><div class="label">% Válidas</div></div>
  </div>

  <div class="aviso">
    As ${validas} viagem(ns) válidas entram no dashboard. As ${inconsistentes} inconsistente(s) ficam fora dos KPIs.
    ${descartadas > 0 ? `${descartadas} linha(s) sem placa, KM Total e Peso Total foram ignoradas e não entram no sistema. ` : ''}
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
  <div class="section-title">Amostra — viagens fora do dashboard (${viagens.length}${viagens.length >= 500 ? '+' : ''})</div>
  <table>
    <thead>
      <tr>
        <th>Linha</th><th>Data</th><th>Placa</th><th>Motorista</th><th>Rota</th>
        <th>KM Total</th><th>Peso (t)</th><th>Problemas</th>
      </tr>
    </thead>
    <tbody>
      ${linhasTabela}
    </tbody>
  </table>
  <div class="obs">* KM Total calculado a partir de KM Saída e KM Chegada quando ausente na planilha</div>
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
    if (validando) return 'Validando estrutura da planilha...';
    if (analisandoViagens) return 'Analisando viagens (KM, peso, rota)...';
    if (conferindoDiaria) return 'Conferindo planilha vs sistema (dia a dia)...';
    if (gerandoPdfViagens) return 'Gerando PDF de saúde dos dados...';
    if (uploading) return 'Importando viagens válidas para o dashboard...';
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

      adicionarToast('Planilha excluída!', 'success');
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

          {/* Preview de qualidade (coleta) ou resumo multi-modelo (roçada) */}
          {ehRocada && (validacaoData?.resumoRocada || validacaoData?.semColunaArea || (validacaoData?.linhasSemArea ?? 0) > 0) ? (
            <div style={{
              background: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fff7ed' : '#f0fdf4',
              border: `1px solid ${validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#fdba74' : '#86efac'}`,
              borderRadius: '10px',
              padding: '0.75rem 1rem', marginBottom: '0.5rem', fontSize: '0.78rem',
              color: validacaoData?.podeImportar === false || validacaoData?.sucesso === false ? '#9a3412' : '#166534',
            }}>
              <strong>
                {validacaoData?.podeImportar === false || validacaoData?.sucesso === false
                  ? 'Roçada — metragem obrigatória'
                  : `Modelo ${validacaoData.modelo || validacaoData.resumoRocada?.modelo}`}
              </strong>
              {validacaoData?.resumoRocada && (
                <div style={{ marginTop: '0.35rem', color: validacaoData?.sucesso === false ? '#c2410c' : '#15803d' }}>
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
              {Array.isArray(validacaoData.avisos) && validacaoData.avisos.length > 0 && (
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
                {ehRocada ? `Importando registros de roçada... ${uploadPct}%` : `Importando viagens válidas... ${uploadPct}%`}
              </div>
            </div>
          )}

          {importacaoConcluida && resumoImportacao && (
            <div style={{
              background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px',
              padding: '0.6rem 0.75rem', marginTop: '0.5rem', fontSize: '0.75rem', color: '#166534',
            }}>
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
                      <div style={{ fontSize: '0.58rem', color: '#1e40af' }}>Soma contador</div>
                    </div>
                    <div style={{ background: '#f0fdf4', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>{dadosViagens.viagensCalculadasDashboard ?? dadosViagens.viagensCompletas ?? 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#166534' }}>Viagens KPI</div>
                    </div>
                    <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '0.4rem 0.5rem', textAlign: 'center' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>{(dadosViagens.viagensInconsistentesTotal ?? dadosViagens.viagensIncompletas) || 0}</div>
                      <div style={{ fontSize: '0.58rem', color: '#991b1b' }}>Fora do dashboard</div>
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

                  {/* Preview das primeiras viagens incompletas */}
                  {dadosViagens.viagens && dadosViagens.viagens.length > 0 && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#475569', marginBottom: '0.25rem' }}>
                        Amostra — viagens fora do dashboard (até 10):
                      </div>
                      <div style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.6rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#1e293b', color: '#fff' }}>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Linha</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Data</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Placa</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Motorista</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>KM</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Peso</th>
                              <th style={{ padding: '3px 5px', textAlign: 'left' }}>Problemas</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(dadosViagens.viagens || []).filter((v: any) => !v.completa).slice(0, 10).map((v: any, i: number) => (
                              <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', background: v.temValorNegativo ? '#fef2f2' : undefined }}>
                                <td style={{ padding: '3px 5px' }}>{v.linha}</td>
                                <td style={{ padding: '3px 5px' }}>{v.data || '—'}</td>
                                <td style={{ padding: '3px 5px' }}>{v.placa || '—'}</td>
                                <td style={{ padding: '3px 5px' }}>{v.motorista || '—'}</td>
                                <td style={{ padding: '3px 5px', color: !v.kmTotal && !v.kmTotalCalculado ? '#dc2626' : '#16a34a' }}>
                                  {v.kmTotal != null ? v.kmTotal : (v.kmTotalCalculado != null ? v.kmTotalCalculado + '*' : '—')}
                                </td>
                                <td style={{ padding: '3px 5px', color: v.pesoTotal == null || Number(v.pesoTotal) <= 0 ? '#dc2626' : '#16a34a' }}>
                                  {v.pesoTotal != null ? Number(v.pesoTotal).toFixed(1) : '—'}
                                </td>
                                <td style={{ padding: '3px 5px', color: '#b45309', fontSize: '0.55rem' }}>
                                  {(v.problemas || [])
                                    .filter((p: string) => !p.toLowerCase().includes('placa será unificada') && !p.toLowerCase().startsWith('corrigido automaticamente'))
                                    .join('; ') || '—'}
                                </td>
                              </tr>
                            ))}
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
                  <div style={{ background: '#fff', borderRadius: '6px', padding: '0.35rem', textAlign: 'center', border: '1px solid #c7d2fe' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#4f46e5' }}>{conferenciaDiaria.diasSomenteSistema}</div>
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
                            : d.status === 'somente_sistema' ? '#4f46e5'
                            : '#dc2626';
                          const lbl = d.status === 'novo' ? 'Novo'
                            : d.status === 'divergente' ? 'Diverge'
                            : d.status === 'somente_sistema' ? 'Preservar'
                            : 'Bloqueado';
                          return (
                            <tr key={d.data} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '3px 6px', fontWeight: 600 }}>{d.dataBr}</td>
                              <td style={{ padding: '3px 6px', textAlign: 'center', color: cor, fontWeight: 700 }}>{lbl}</td>
                              <td style={{ padding: '3px 6px', color: '#475569' }}>
                                {d.status === 'novo' && d.planilha ? (
                                  `${d.planilha.rotas} rotas · ${d.planilha.viagens} viagens`
                                ) : d.status === 'somente_sistema' && d.sistema ? (
                                  `${d.sistema.rotas} rotas · ${d.sistema.viagens} viagens (mantidos)`
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
            ? 'Roçada: detecta o modelo automaticamente, importa área (m²) por dia/bairro e atualiza o dashboard.'
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
