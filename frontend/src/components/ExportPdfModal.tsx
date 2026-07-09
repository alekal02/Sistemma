/* ============================================
   ExportPdfModal - Modal de exportacao do dashboard para PDF
   Gera um PDF completo com TODOS os KPIs, TODOS os graficos e metricas executivas
   ============================================ */

import { useState, useEffect, useRef, useMemo } from 'react';
import { FiDownload, FiX, FiFileText, FiBarChart2, FiPieChart, FiTrendingUp } from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { gerarNomePdfArquivo, labelTipoServicoArquivo, formatarDataArquivoPdf, sufixoPeriodoPdf } from '../utils/gerarNomePdf';
import { TIPOS_SERVICO_LABELS } from '../types';
import contractService from '../services/contractService';
import servicoService from '../services/servicoService';
import pdfService from '../services/pdfService';
import { isAxiosError } from 'axios';
import type { KpiValor, ExecMetrics, KpiFiltros } from '../hooks/useKpiCalculator';

interface GraficoConfig {
  tipo: string;
  titulo: string;
  eixoX: string;
  eixoY: string;
  ativo: boolean;
}

interface ColunaDetectada {
  nome: string;
  tipo: string;
}

interface ExportPdfModalProps {
  contractId: string;
  servicoId: string;
  servicoNome: string;
  kpiValores: KpiValor[];
  execMetrics: ExecMetrics | null;
  graficosAtivos?: GraficoConfig[];
  colunas?: ColunaDetectada[];
  tipoExport?: 'completo' | 'receita' | 'operacao';
  contratoNome?: string;
  tipoServico?: string;
  receitaPorHora?: number;
  dadosViagens?: Record<string, unknown>[];
  periodoPdf?: { label: string; dataInicio?: string; dataFim?: string } | null;
  filtrosPdf?: KpiFiltros;
  onClose: () => void;
}

export default function ExportPdfModal({
  contractId,
  servicoId,
  servicoNome,
  kpiValores,
  execMetrics,
  graficosAtivos = [],
  colunas = [],
  tipoExport = 'completo',
  contratoNome: contratoNomeProp,
  tipoServico: tipoServicoProp,
  receitaPorHora: receitaPorHoraProp,
  dadosViagens = [],
  periodoPdf = null,
  filtrosPdf,
  onClose,
}: ExportPdfModalProps) {
  const { adicionarToast } = useToast();
  const { token } = useAuth();
  const [exportando, setExportando] = useState(false);
  const [dadosGraficos, setDadosGraficos] = useState<Record<string, { name: string; value: number }[]>>({});
  const [carregandoGraficos, setCarregandoGraficos] = useState(false);
  const loadRequestRef = useRef(0);

  const kpisFinanceiros = kpiValores.filter(k => k.formato === 'moeda');
  const kpisOperacionais = kpiValores.filter(k => k.formato !== 'moeda');

  const labelExport = tipoExport === 'receita' ? 'Exportar PDF - Receita' :
                      tipoExport === 'operacao' ? 'Exportar PDF - Operacao' :
                      'Exportar PDF Completo';

  const sufixoExport = tipoExport === 'receita' ? 'Receita' :
                       tipoExport === 'operacao' ? 'Operacao' :
                       'Dashboard';

  const [nomeArquivoPreview, setNomeArquivoPreview] = useState('');

  const sufixoPeriodo = useMemo(
    () => (periodoPdf ? sufixoPeriodoPdf({ dataInicio: periodoPdf.dataInicio, dataFim: periodoPdf.dataFim }) : undefined),
    [periodoPdf],
  );

  const filtrosPdfChave = useMemo(
    () => JSON.stringify(filtrosPdf ?? {}),
    [filtrosPdf],
  );

  useEffect(function() {
    let cancelado = false;
    async function carregarPreview() {
      try {
        const [contrato, servicoData] = await Promise.all([
          contractService.buscar(contractId),
          servicoService.getPadrao(contractId, servicoId),
        ]);
        const tipo = servicoData?.servico?.tipo || servicoData?.tipoServico || 'geral';
        const tipoLabel = labelTipoServicoArquivo(tipo, TIPOS_SERVICO_LABELS as Record<string, string>);
        if (!cancelado) {
          setNomeArquivoPreview(gerarNomePdfArquivo({
            contratoNome: contrato.numeroContrato || 'Contrato',
            tipoServico: tipoLabel,
            sufixo: sufixoExport,
            periodo: sufixoPeriodo,
          }));
        }
      } catch {
        if (!cancelado) {
          setNomeArquivoPreview(gerarNomePdfArquivo({
            contratoNome: 'Contrato',
            tipoServico: servicoNome,
            sufixo: sufixoExport,
            periodo: sufixoPeriodo,
          }));
        }
      }
    }
    carregarPreview();
    return function() { cancelado = true; };
  }, [contractId, servicoId, servicoNome, sufixoExport, sufixoPeriodo, token]);

  /** Chave estável — evita re-disparar o efeito a cada render do pai */
  const graficosChave = useMemo(
    () => graficosAtivos.map(g => `${g.titulo}|${g.eixoX}|${g.eixoY}|${g.tipo}`).join(';;'),
    [graficosAtivos],
  );

  // Pré-carrega gráficos em background (não bloqueia o botão de exportar)
  useEffect(function() {
    if (graficosAtivos.length === 0) {
      setDadosGraficos({});
      setCarregandoGraficos(false);
      return;
    }

    const requestId = ++loadRequestRef.current;
    setCarregandoGraficos(true);
    const TIMEOUT_MS = 25000;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    const payloadGraficos = graficosAtivos.map(function(g, idx) {
      return {
        idx,
        eixoX: g.eixoX,
        eixoY: g.tipo === 'pizza' ? undefined : (g.eixoY || ''),
        tipo: g.tipo,
        topN: g.tipo === 'pizza' ? 8 : 10,
      };
    });

    const body: { graficos: typeof payloadGraficos; filtros?: KpiFiltros } = { graficos: payloadGraficos };
    if (filtrosPdf && (filtrosPdf.dataInicio || filtrosPdf.dataFim || filtrosPdf.filtrosDinamicos)) {
      body.filtros = filtrosPdf;
    }

    servicoService.getGraficosAgregados(contractId, servicoId, body, controller.signal)
      .then(function(data) {
        if (loadRequestRef.current !== requestId) return;
        const resultados: Record<string, { name: string; value: number }[]> = {};
        for (const item of data.graficos || []) {
          resultados['g_' + item.idx] = (item.dados || []).map(function(d: any) {
            return { name: d.name, value: Math.round(d.value * 100) / 100 };
          });
        }
        graficosAtivos.forEach(function(_g, idx) {
          if (!resultados['g_' + idx]) {
            resultados['g_' + idx] = [];
          }
        });
        setDadosGraficos(resultados);
      })
      .catch(function() {
        if (loadRequestRef.current !== requestId) return;
        const resultados: Record<string, { name: string; value: number }[]> = {};
        graficosAtivos.forEach(function(_g, idx) {
          resultados['g_' + idx] = [];
        });
        setDadosGraficos(resultados);
      })
      .finally(function() {
        window.clearTimeout(timeoutId);
        if (loadRequestRef.current === requestId) {
          setCarregandoGraficos(false);
        }
      });
  }, [graficosChave, filtrosPdfChave, contractId, servicoId, token, filtrosPdf]);

  const handleExport = async () => {
    setExportando(true);
    try {
      const [contrato, servicoData] = await Promise.all([
        contractService.buscar(contractId),
        servicoService.getPadrao(contractId, servicoId),
      ]);
      const tipo = servicoData?.servico?.tipo || servicoData?.tipoServico || 'geral';
      const tipoLabel = labelTipoServicoArquivo(tipo, TIPOS_SERVICO_LABELS as Record<string, string>);

      const html = gerarHtmlDashboard({
        contratoNome: contrato.numeroContrato || contratoNomeProp || 'Contrato',
        servicoNome,
        tipoServicoLabel: tipoLabel,
        kpiValores,
        execMetrics,
        graficosAtivos,
        dadosGraficos,
        tipoExport,
        receitaPorHora: receitaPorHoraProp,
        dadosViagens: tipoExport === 'operacao' ? dadosViagens : [],
        periodoLabel: periodoPdf?.label,
      });

      const filename = gerarNomePdfArquivo({
        contratoNome: contrato.numeroContrato || 'Contrato',
        tipoServico: tipoLabel,
        sufixo: sufixoExport,
        periodo: sufixoPeriodo,
      });
      await pdfService.gerarEBaixar(html, filename, 'full');
      adicionarToast('PDF exportado com sucesso!', 'success');
      onClose();
    } catch (err) {
      console.error('[ExportPdf] Erro:', err);
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro ao gerar PDF'
        : 'Erro ao exportar PDF';
      adicionarToast(msg, 'error');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(15,23,42,0.5)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={function(e) { e.stopPropagation(); }}
        style={{
          background: '#fff', borderRadius: '12px',
          width: '100%', maxWidth: '440px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '0.85rem 1rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <FiFileText size={16} /> {tipoExport === 'receita' ? 'Exportar Receita' : tipoExport === 'operacao' ? 'Exportar Operacao' : 'Exportar Dashboard'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '0.2rem' }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1rem' }}>
          <div style={{ marginBottom: '0.75rem', fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
            Sera gerado um PDF{' '}
            {periodoPdf?.label ? (
              <>referente a <strong>{periodoPdf.label}</strong>{' '}</>
            ) : null}
            {tipoExport === 'receita' ? 'com os dados de <strong>Receita</strong>' :
             tipoExport === 'operacao' ? 'com os dados de <strong>Operacao</strong>' :
             'com <strong>todos os dados do dashboard</strong>'}{':'}
          </div>
          <ul style={{ fontSize: '0.8rem', color: '#64748b', paddingLeft: '1.25rem', margin: '0 0 1rem', lineHeight: 1.7 }}>
            {tipoExport === 'receita' ? (
              <>
                {kpisFinanceiros.length > 0 ? <li>Indicadores financeiros ({kpisFinanceiros.length})</li> : null}
                {execMetrics && execMetrics.faturamento > 0 ? <li>Destaques de faturamento e receita</li> : null}
                <li>Resumo financeiro completo</li>
              </>
            ) : tipoExport === 'operacao' ? (
              <>
                {kpisOperacionais.length > 0 ? <li>Indicadores operacionais ({kpisOperacionais.length})</li> : null}
                {execMetrics && execMetrics.viagens > 0 ? <li>Metricas operacionais (viagens, peso, KM, horas)</li> : null}
                <li>Tabela resumo operacional</li>
                <li>Analise detalhada de viagens</li>
              </>
            ) : (
              <>
                {kpisFinanceiros.length > 0 ? <li>Destaques financeiros (faturamento, receita/KM, receita/hora)</li> : null}
                {kpisFinanceiros.length > 0 ? <li>Indicadores financeiros ({kpisFinanceiros.length})</li> : null}
                {kpisOperacionais.length > 0 ? <li>Indicadores operacionais ({kpisOperacionais.length})</li> : null}
                {graficosAtivos.length > 0 ? <li>Todos os graficos ativos ({graficosAtivos.length}) com dados reais</li> : null}
                {kpisFinanceiros.length > 0 ? <li>Tabela resumo operacional (viagens, peso, KM, horas)</li> : null}
              </>
            )}
          </ul>

          <div style={{
            background: '#f8fafc', borderRadius: '8px', padding: '0.6rem 0.75rem',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: '1px solid #e2e8f0', marginBottom: '0.75rem',
          }}>
            <span style={{ fontSize: '0.78rem', color: '#475569', fontWeight: 600 }}>{servicoNome}</span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{kpiValores.length} KPIs - {graficosAtivos.length} graficos</span>
          </div>

          {nomeArquivoPreview && (
            <div style={{
              background: '#f0fdf4', borderRadius: '8px', padding: '0.5rem 0.75rem',
              border: '1px solid #bbf7d0', marginBottom: '0.75rem',
            }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', marginBottom: '0.15rem' }}>
                Nome do arquivo
              </div>
              <div style={{ fontSize: '0.72rem', color: '#15803d', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                {nomeArquivoPreview}.pdf
              </div>
            </div>
          )}

          {carregandoGraficos && graficosAtivos.length > 0 && (
            <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'center', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}>
              <div style={{ width: '12px', height: '12px', border: '2px solid #e2e8f0', borderTopColor: '#22c55e', borderRadius: '50%', animation: 'pdfspin 0.8s linear infinite' }} />
              <style dangerouslySetInnerHTML={{ __html: "@keyframes pdfspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }" }} />
              Carregando graficos em segundo plano (voce ja pode exportar)...
            </div>
          )}

          <button
            onClick={handleExport}
            disabled={exportando}
            className="btn btn-primary"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.4rem', padding: '0.55rem',
              fontSize: '0.85rem', fontWeight: 600,
              opacity: exportando ? 0.6 : 1,
              cursor: exportando ? 'not-allowed' : 'pointer',
            }}
          >
            <FiDownload size={15} />
            {exportando ? 'Gerando PDF...' : labelExport}
          </button>
        </div>
      </div>
    </div>
  );
}

/// ============================================
/// Geracao do HTML para PDF - VERSAO COMPLETA
/// Layout profissional com TODOS os KPIs + TODOS os graficos
/// ============================================

function gerarHtmlDashboard(data: {
  contratoNome: string;
  servicoNome: string;
  tipoServicoLabel?: string;
  kpiValores: KpiValor[];
  execMetrics: ExecMetrics | null;
  graficosAtivos: GraficoConfig[];
  dadosGraficos: Record<string, { name: string; value: number }[]>;
  tipoExport?: 'completo' | 'receita' | 'operacao';
  receitaPorHora?: number;
  dadosViagens?: Record<string, unknown>[];
  periodoLabel?: string;
}): string {
  const {
    contratoNome, servicoNome, tipoServicoLabel = '',
    kpiValores, execMetrics, graficosAtivos, dadosGraficos,
    tipoExport = 'completo', receitaPorHora: receitaPorHoraIn, dadosViagens = [],
    periodoLabel = '',
  } = data;
  const em = execMetrics;
  const hoje = new Date();
  const dataStr = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const dataArquivo = formatarDataArquivoPdf(hoje);
  const horaStr = hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  // KPIs já vêm filtrados pelo pai quando export é receita/operacao
  const kpisFinanceirosFiltrados = tipoExport === 'operacao'
    ? []
    : tipoExport === 'receita'
      ? kpiValores
      : kpiValores.filter(k => k.formato === 'moeda');

  const kpisOperacionaisFiltrados = tipoExport === 'receita'
    ? []
    : tipoExport === 'operacao'
      ? kpiValores
      : kpiValores.filter(k => k.formato !== 'moeda');

  const kpisFinanceiros = kpisFinanceirosFiltrados;
  const kpisOperacionais = kpisOperacionaisFiltrados;

  const fatPorTipoEntries = em && Object.keys(em.fatPorTipo).length > 0
    ? Object.entries(em.fatPorTipo).filter(([_, valor]) => valor > 0)
    : [];

  // Filtrar por tipo de exportação
  const mostraFinanceiro = tipoExport === 'completo' || tipoExport === 'receita';
  const mostraOperacional = tipoExport === 'completo' || tipoExport === 'operacao';

  const receitaHoraVal = receitaPorHoraIn ?? em?.receitaHora ?? 0;
  const receitaPorTon = em && em.pesoTotalTon > 0 && em.faturamento > 0
    ? em.faturamento / em.pesoTotalTon
    : 0;
  const receitaPorViagem = em && (em.viagens ?? 0) > 0 && em.faturamento > 0
    ? em.faturamento / (em.viagens ?? 1)
    : 0;

  // --- Hero Faturamento ---
  const temDadosFinanceiros = mostraFinanceiro && em && em.faturamento > 0;
  const tituloRelatorio = tipoExport === 'receita' ? 'Relatorio de Receita' :
                          tipoExport === 'operacao' ? 'Relatorio Operacional' :
                          'Relatorio Executivo';

  function escapeXml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  const heroHtml = temDadosFinanceiros ? `
    <div class="hero-compact">
      <div>
        <div class="hero-fat-label">Faturamento Total</div>
        <div class="hero-fat">${em!.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>
      </div>
      <div class="hero-metas">
        ${mostraFinanceiro && em!.receitaKm > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${em!.receitaKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div><div class="hero-meta-l">Rec/KM</div></div>` : ''}
        ${mostraFinanceiro && receitaHoraVal > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${receitaHoraVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div><div class="hero-meta-l">Rec/Hora</div></div>` : ''}
        ${mostraOperacional && em!.viagens > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${em!.viagens.toLocaleString('pt-BR')}</div><div class="hero-meta-l">Viagens</div></div>` : ''}
        ${mostraOperacional && em!.qtdColetores > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${em!.qtdColetores}</div><div class="hero-meta-l">Coletores</div></div>` : ''}
        ${mostraOperacional && em!.kmTotal > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${em!.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div><div class="hero-meta-l">KM</div></div>` : ''}
        ${mostraOperacional && em!.pesoTotalTon > 0 ? `<div class="hero-meta"><div class="hero-meta-v">${em!.pesoTotalTon.toFixed(1)}</div><div class="hero-meta-l">Ton</div></div>` : ''}
      </div>
    </div>` : '';

  // --- Destaques de Receita (aba Receita) ---
  const receitaDestaquesHtml = (tipoExport === 'receita' && temDadosFinanceiros) ? `
    <div class="sec">
      <div class="sec-h" style="border-bottom-color:#f59e0b">Destaques de Receita</div>
      <div class="cards-row">
        ${em!.receitaKm > 0 ? `<div class="card-item" style="border-top-color:#f59e0b"><div class="card-l">Receita por KM</div><div class="card-v">${em!.receitaKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/km</div></div>` : ''}
        ${receitaHoraVal > 0 ? `<div class="card-item" style="border-top-color:#ef4444"><div class="card-l">Receita por Hora</div><div class="card-v">${receitaHoraVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/h</div></div>` : ''}
        ${receitaPorTon > 0 ? `<div class="card-item" style="border-top-color:#22c55e"><div class="card-l">Receita por Tonelada</div><div class="card-v">${receitaPorTon.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/t</div></div>` : ''}
        ${receitaPorViagem > 0 ? `<div class="card-item" style="border-top-color:#8b5cf6"><div class="card-l">Receita por Viagem</div><div class="card-v">${receitaPorViagem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/viagem</div></div>` : ''}
      </div>
    </div>` : '';

  // --- Destaques Operacionais (aba Operacao) ---
  const operacaoDestaquesHtml = (tipoExport === 'operacao' && em) ? `
    <div class="sec">
      <div class="sec-h" style="border-bottom-color:#3b82f6">Metricas Operacionais</div>
      <div class="cards-row">
        ${(em.viagens ?? 0) > 0 ? `<div class="card-item" style="border-top-color:#3b82f6"><div class="card-l">Viagens</div><div class="card-v">${em.viagens.toLocaleString('pt-BR')}</div></div>` : ''}
        ${em.pesoTotalTon > 0 ? `<div class="card-item" style="border-top-color:#22c55e"><div class="card-l">Toneladas</div><div class="card-v">${em.pesoTotalTon.toFixed(1)} t</div></div>` : ''}
        ${em.kmTotal > 0 ? `<div class="card-item" style="border-top-color:#06b6d4"><div class="card-l">KM Total</div><div class="card-v">${em.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</div></div>` : ''}
        ${em.prodColetor > 0 ? `<div class="card-item" style="border-top-color:#8b5cf6"><div class="card-l">Prod./Coletor</div><div class="card-v">${em.prodColetor.toFixed(2)} t</div></div>` : ''}
      </div>
    </div>` : '';

  // --- Tabela de viagens (Operacao) ---
  const normCol = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  const acharCol = (reg: Record<string, unknown>, termos: string[]) => {
    const chaves = Object.keys(reg);
    for (const t of termos) {
      const tn = normCol(t);
      const k = chaves.find(c => normCol(c) === tn || normCol(c).includes(tn));
      if (k) return k;
    }
    return undefined;
  };
  const valStr = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const viagensLinhas = (tipoExport === 'operacao' ? dadosViagens.slice(0, 100) : []).map((reg, idx) => {
    const colPlaca = acharCol(reg, ['PLACA', 'CAMINHAO']);
    const colData = acharCol(reg, ['DATA SAIDA', 'DATA', 'DIA']);
    const colMotorista = acharCol(reg, ['MOTORISTA']);
    const colPeso = acharCol(reg, ['PESO TOTAL', 'PESO']);
    const colKm = acharCol(reg, ['KM TOTAL', 'KM']);
    const peso = reg[colPeso || ''] != null ? Number(reg[colPeso || '']) : null;
    const km = reg[colKm || ''] != null ? Number(reg[colKm || '']) : null;
    return '<tr><td>' + (idx + 1) + '</td><td>' + escapeXml(valStr(reg[colPlaca || ''])) + '</td><td>' + escapeXml(valStr(reg[colData || ''])) + '</td><td>' + escapeXml(valStr(reg[colMotorista || ''])) + '</td><td class="r">' + (peso && !isNaN(peso) ? (peso / 1000).toFixed(2) + ' t' : '—') + '</td><td class="r">' + (km && !isNaN(km) ? km.toFixed(1) + ' km' : '—') + '</td></tr>';
  }).join('');

  const viagensTableHtml = viagensLinhas ? `
    <div class="sec">
      <div class="sec-h">Analise de Viagens <span class="badge">${Math.min(dadosViagens.length, 100)}</span></div>
      <table class="tbl">
        <thead><tr><th>#</th><th>Placa</th><th>Data</th><th>Motorista</th><th style="text-align:right">Peso</th><th style="text-align:right">KM</th></tr></thead>
        <tbody>${viagensLinhas}</tbody>
      </table>
      ${dadosViagens.length > 100 ? '<div style="font-size:5.5px;color:#94a3b8;margin-top:3px">Exibindo 100 de ' + dadosViagens.length + ' registros</div>' : ''}
    </div>` : '';

  const cabecalhoMeta = escapeXml(contratoNome) + (tipoServicoLabel ? ' • ' + escapeXml(tipoServicoLabel) : '') + ' • ' + dataArquivo
    + (periodoLabel ? ' • Período: ' + escapeXml(periodoLabel) : '');

  // --- Cards de metricas executivas ---
  const metricCards: { label: string; value: string; color: string }[] = [
    ...(mostraOperacional && em && em.viagens > 0 ? [{ label: 'Viagens', value: em.viagens.toLocaleString('pt-BR'), color: '#3b82f6' }] : []),
    ...(mostraOperacional && em && em.qtdColetores > 0 ? [{ label: 'Coletores', value: em.qtdColetores.toLocaleString('pt-BR'), color: '#8b5cf6' }] : []),
    ...(mostraOperacional && em && em.pesoTotalTon > 0 ? [{ label: 'Peso Total', value: em.pesoTotalTon.toFixed(1) + ' t', color: '#10b981' }] : []),
    ...(mostraOperacional && em && em.kmTotal > 0 ? [{ label: 'KM Rodados', value: em.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km', color: '#06b6d4' }] : []),
    ...(mostraOperacional && em && em.horasProdutivas > 0 ? [{ label: 'Horas Prod.', value: em.horasProdutivas.toFixed(1) + 'h', color: '#f59e0b' }] : []),
    ...(mostraOperacional && em && em.kmMedioViagem > 0 ? [{ label: 'KM Medio/Viagem', value: em.kmMedioViagem.toFixed(1) + ' km', color: '#f97316' }] : []),
    ...(mostraOperacional && em && em.tonMediaColeta > 0 ? [{ label: 'Ton Media/Coleta', value: em.tonMediaColeta.toFixed(2) + ' t', color: '#14b8a6' }] : []),
    ...(mostraOperacional && em && em.prodColetor > 0 ? [{ label: 'Prod./Coletor', value: em.prodColetor.toFixed(2) + ' t', color: '#ec4899' }] : []),
    ...(mostraOperacional && em && em.tonKm > 0 ? [{ label: 'Ton/KM', value: em.tonKm.toFixed(4), color: '#84cc16' }] : []),
    ...(mostraFinanceiro && em && em.receitaKm > 0 ? [{ label: 'Receita/KM', value: em.receitaKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), color: '#a855f7' }] : []),
    ...(mostraFinanceiro && em && em.receitaHora > 0 ? [{ label: 'Receita/Hora', value: em.receitaHora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), color: '#ef4444' }] : []),
  ];

  const metade = Math.ceil(metricCards.length / 2);
  const cardsLinha1 = metricCards.slice(0, metade);
  const cardsLinha2 = metricCards.slice(metade);

  // --- Faturamento por tipo ---
  const fatPorTipoRows = fatPorTipoEntries.map(function([tipo, valor], i) {
    var total = fatPorTipoEntries.reduce(function(s, [, v]) { return s + v; }, 0);
    var pct = total > 0 ? (valor / total) * 100 : 0;
    var cor = ['#10b981','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16'][i % 8];
    return { tipo: tipo, valor: valor, pct: pct, cor: cor };
  });

  // --- KPIs Financeiros ---
  const kpisFinHtml = kpisFinanceirosFiltrados.map(function(k) {
    return '<div class="kpi-c fin"><div class="kpi-l">' + k.nome + '</div><div class="kpi-v fin-v">' + (k.formatado || '-') + '</div></div>';
  }).join('');

  // --- KPIs Operacionais ---
  const kpisOpHtml = kpisOperacionaisFiltrados.map(function(k) {
    var isPct = k.formato === 'porcentagem';
    return '<div class="kpi-c ' + (isPct ? 'pct' : 'op') + '"><div class="kpi-l">' + k.nome + '</div><div class="kpi-v ' + (isPct ? 'pct-v' : '') + '">' + (k.formatado || '-') + '</div></div>';
  }).join('');

  // --- Tabela Resumo ---
  const metricsRowsRaw: { label: string; value: string }[] = em ? [
    ...(mostraFinanceiro && em.faturamento > 0 ? [{ label: 'Faturamento Total', value: em.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }] : []),
    ...(mostraOperacional ? [
      { label: 'Viagens Realizadas', value: em.viagens.toLocaleString('pt-BR') },
      { label: 'Coletores Ativos', value: em.qtdColetores.toLocaleString('pt-BR') },
      ...(em.pesoTotalTon > 0 ? [{ label: 'Peso Total', value: em.pesoTotalTon.toFixed(2) + ' t' }] : []),
      ...(em.kmTotal > 0 ? [{ label: 'KM Rodados', value: em.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km' }] : []),
      ...(em.horasProdutivas > 0 ? [{ label: 'Horas Produtivas', value: em.horasProdutivas.toFixed(1) + 'h' }] : []),
      ...(em.kmMedioViagem > 0 ? [{ label: 'KM Medio por Viagem', value: em.kmMedioViagem.toFixed(1) + ' km' }] : []),
      ...(em.tonMediaColeta > 0 ? [{ label: 'Tonelada Media por Coleta', value: em.tonMediaColeta.toFixed(2) + ' t' }] : []),
      ...(em.prodColetor > 0 ? [{ label: 'Ton./Coletor', value: em.prodColetor.toFixed(2) + ' t' }] : []),
      ...(em.tonKm > 0 ? [{ label: 'Ton./KM', value: em.tonKm < 0.001 ? (em.tonKm * 1000).toFixed(2) + ' kg' : em.tonKm.toFixed(4) + ' t' }] : []),
    ] : []),
    ...(mostraFinanceiro && em.receitaKm > 0 ? [{ label: 'Receita/KM', value: em.receitaKm.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }] : []),
    ...(mostraFinanceiro && em.receitaHora > 0 ? [{ label: 'Receita/Hora', value: em.receitaHora.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }] : []),
  ] : [];

  // Filtrar linhas da tabela conforme o tipo de exportação
  const metricsRows = metricsRowsRaw.filter(function(row) {
    if (tipoExport === 'receita') {
      // Só métricas financeiras
      return row.label.includes('Receita') || row.label.includes('Faturamento');
    }
    if (tipoExport === 'operacao') {
      // Só métricas operacionais
      return !row.label.includes('Receita') && !row.label.includes('Faturamento');
    }
    return true; // completo = todas
  });

  // --- Constantes SVG ---
  const SVG_W = 280;
  const SVG_H = 100;
  const BAR_MAX_H = 60;
  const BAR_BASE_Y = SVG_H - 15;
  const LABEL_MAX_LEN = 10;

  function truncLabel(s: string) {
    return s.length > LABEL_MAX_LEN ? s.substring(0, LABEL_MAX_LEN) + '...' : s;
  }

  // --- Graficos Financeiros auto-gerados para o PDF ---
  var finChartsHtml = '';

  // 1. Doughnut: Faturamento por Tipo de Caminhao
  if (mostraFinanceiro && fatPorTipoRows.length > 1) {
    var totalFat = fatPorTipoRows.reduce(function(s, r) { return s + r.valor; }, 0);
    var cx = 60, cy = 55, r = 30, sw = 13;
    var segs = [], accPct = 0;
    for (var fi = 0; fi < fatPorTipoRows.length; fi++) {
      var row = fatPorTipoRows[fi];
      var pct = row.valor / totalFat;
      var dashLen = pct * 100;
      var dashOffset = 25 - accPct;
      accPct += pct * 100;
      segs.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + row.cor + '" stroke-width="' + sw + '" stroke-dasharray="' + dashLen.toFixed(1) + ' ' + (100 - dashLen).toFixed(1) + '" stroke-dashoffset="' + dashOffset.toFixed(1) + '"/>');
    }
    var legSvg = '';
    var legY = 8;
    var legX = 125;
    var legCol = 0;
    var nf = fatPorTipoRows.length;
    var maxPerCol = Math.ceil(nf / 2);
    for (var fi2 = 0; fi2 < nf; fi2++) {
      if (fi2 > 0 && fi2 % maxPerCol === 0) { legX = 195; legY = 8; legCol = 1; }
      var rowLeg = fatPorTipoRows[fi2];
      let pctStr = ((rowLeg.valor / totalFat) * 100).toFixed(1);
      legSvg += '<rect x="' + legX + '" y="' + (legY + 2) + '" width="5" height="5" rx="2" fill="' + rowLeg.cor + '"/>';
      legSvg += '<text x="' + (legX + 7) + '" y="' + (legY + 7) + '" font-size="5.5" fill="#334155">' + escapeXml(truncLabel(rowLeg.tipo)) + ' ' + pctStr + '%</text>';
      legY += 11;
    }
    var svgW = legCol === 1 ? 250 : 190;

    finChartsHtml += '\n      <div class="chart-box" style="min-height:110px">\n        <h4>Receita por Tipo de Caminhao</h4>\n        <svg width="100%" height="105" viewBox="0 0 ' + svgW + ' 105" style="display:block">\n          <circle cx="60" cy="55" r="30" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="13"/>\n          ' + segs.join('\n          ') + '\n          <text x="60" y="58" text-anchor="middle" font-size="14" font-weight="700" fill="#334155">R$</text>\n          ' + legSvg + '\n        </svg>\n      </div>';
  }

  // 2. Bar chart: KPIs Financeiros comparados
  if (mostraFinanceiro && kpisFinanceirosFiltrados.length >= 2) {
    var finKpiData = kpisFinanceirosFiltrados.map(function(k) {
      var num = parseFloat(String(k.valor || '0').replace(/[^0-9.,]/g, '').replace('.', '').replace(',', '.'));
      return { label: k.nome, valor: isNaN(num) ? 0 : num, formatado: k.formatado || '-' };
    }).filter(function(d) { return d.valor > 0; });

    if (finKpiData.length >= 2) {
      var maxFin = finKpiData.reduce(function(s, d) { return Math.max(s, d.valor); }, 0);
      var fBarCount = Math.min(finKpiData.length, 8);
      var fBarW = Math.max(14, Math.min(28, (SVG_W - 10) / fBarCount - 3));
      var fGap = Math.max(2, Math.min(5, (SVG_W - 10) / fBarCount - fBarW));
      var fStartX = (SVG_W - (fBarCount * (fBarW + fGap) - fGap)) / 2;
      var fBars = [], fLabels = [];
      var FIN_COLORS = ['#f59e0b','#a855f7','#ef4444','#3b82f6','#06b6d4','#ec4899','#84cc16','#14b8a6'];

      for (var fi = 0; fi < fBarCount; fi++) {
        var d = finKpiData[fi];
        var barH = (d.valor / maxFin) * BAR_MAX_H;
        var x = fStartX + fi * (fBarW + fGap);
        var y = BAR_BASE_Y - barH;
        var cor = FIN_COLORS[fi % FIN_COLORS.length];
        fBars.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + fBarW.toFixed(1) + '" height="' + barH.toFixed(1) + '" fill="' + cor + '" rx="1.5"/>');
        fLabels.push('<text x="' + (x + fBarW / 2).toFixed(1) + '" y="' + (SVG_H - 2) + '" text-anchor="end" font-size="5" fill="#64748b" transform="rotate(-35 ' + (x + fBarW / 2).toFixed(1) + ',' + (SVG_H - 2) + ')">' + escapeXml(truncLabel(d.label)) + '</text>');
      }
      var fGridLines = [];
      for (var gi2 = 0; gi2 <= 4; gi2++) {
        var gy = BAR_BASE_Y - (gi2 / 4) * BAR_MAX_H;
        var labelVal = (maxFin * gi2) / 4;
        var fLabelStr = labelVal >= 1000 ? 'R$ ' + (labelVal / 1000).toFixed(0) + 'k' : 'R$ ' + labelVal.toFixed(0);
        fGridLines.push('<line x1="30" y1="' + gy.toFixed(1) + '" x2="' + SVG_W + '" y2="' + gy.toFixed(1) + '" stroke="#e2e8f0" stroke-width="0.5"/>');
        fGridLines.push('<text x="28" y="' + (gy + 2).toFixed(1) + '" text-anchor="end" font-size="5" fill="#64748b">' + fLabelStr + '</text>');
      }

      finChartsHtml += '\n      <div class="chart-box" style="min-width:200px;flex:1.2">\n        <h4>Comparativo Financeiro</h4>\n        <svg width="100%" height="100%" viewBox="-5 0 ' + (SVG_W + 35) + ' ' + SVG_H + '" style="display:block">\n          ' + fGridLines.join('\n          ') + '\n          ' + fBars.join('\n          ') + '\n          ' + fLabels.join('\n          ') + '\n        </svg>\n      </div>';
    }
  }

  // --- Graficos configurados (dashboard) ---
  var chartsHtml = '';

  for (var gi = 0; gi < graficosAtivos.length; gi++) {
    var g = graficosAtivos[gi];
    if (!g.eixoX) continue;

    var dados = dadosGraficos['g_' + gi] || [];
    if (dados.length === 0) continue;

    var titulo = g.titulo || 'Grafico ' + (gi + 1);
    var COLORS_SVG = ['#059669','#22c55e','#f59e0b','#a855f7','#ef4444','#14b8a6','#3b82f6','#ec4899','#84cc16','#06b6d4'];
    var isPizza = g.tipo === 'pizza';

    if (isPizza) {
      var total = dados.reduce(function(s, d) { return s + d.value; }, 0);
      if (total === 0) continue;
      var cx = 60, cy = 55, r = 30, sw = 13, offset = -90;
      var segs = [];
      var accPct = 0;
      var nd = Math.min(dados.length, 10);
      for (var di = 0; di < nd; di++) {
        var pct = dados[di].value / total;
        var dashLen = pct * 100;
        var dashOffset = 25 - accPct;
        accPct += pct * 100;
        var cor = COLORS_SVG[di % COLORS_SVG.length];
        segs.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + cor + '" stroke-width="' + sw + '" stroke-dasharray="' + dashLen.toFixed(1) + ' ' + (100 - dashLen).toFixed(1) + '" stroke-dashoffset="' + dashOffset.toFixed(1) + '"/>');
      }

      var legSvg = '';
      var legY = 8;
      var legX = 125;
      var legCol = 0;
      var maxPerCol = Math.ceil(nd / 2);
      for (var li = 0; li < nd; li++) {
        if (li > 0 && li % maxPerCol === 0) { legX = 195; legY = 8; legCol = 1; }
        let itemLeg = dados[li];
        let pctStr2 = total > 0 ? ((itemLeg.value / total) * 100).toFixed(1) : '0';
        var cor = COLORS_SVG[li % COLORS_SVG.length];
        legSvg += '<rect x="' + legX + '" y="' + (legY + 2) + '" width="5" height="5" rx="2" fill="' + cor + '"/>';
        legSvg += '<text x="' + (legX + 7) + '" y="' + (legY + 7) + '" font-size="5.5" fill="#334155">' + escapeXml(truncLabel(itemLeg.name)) + ' ' + pctStr2 + '%</text>';
        legY += 11;
      }
      var svgW = legCol === 1 ? 250 : 190;

      chartsHtml += '\n      <div class="chart-box" style="min-height:110px">\n        <h4>' + escapeXml(titulo) + '</h4>\n        <svg width="100%" height="105" viewBox="0 0 ' + svgW + ' 105" style="display:block">\n          <circle cx="60" cy="55" r="30" fill="#f1f5f9" stroke="#e2e8f0" stroke-width="13"/>\n          ' + segs.join('\n          ') + '\n          <text x="60" y="58" text-anchor="middle" font-size="14" font-weight="700" fill="#334155">' + total.toLocaleString('pt-BR', {maximumFractionDigits:0}) + '</text>\n          ' + legSvg + '\n        </svg>\n      </div>';
    } else {
      var maxVal = dados.reduce(function(s, item) { return Math.max(s, item.value); }, 0);
      if (maxVal === 0) continue;
      var barCount = Math.min(dados.length, 12);
      var barW = Math.max(8, Math.min(20, (SVG_W - 10) / barCount - 2));
      var gap = Math.max(1, Math.min(4, (SVG_W - 10) / barCount - barW));
      var startX = (SVG_W - (barCount * (barW + gap) - gap)) / 2;

      var bars = [];
      var xLabels = [];
      for (var di = 0; di < barCount; di++) {
        var item = dados[di];
        var barH = (item.value / maxVal) * BAR_MAX_H;
        var x = startX + di * (barW + gap);
        var y = BAR_BASE_Y - barH;
        var cor = COLORS_SVG[di % COLORS_SVG.length];
        bars.push('<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + barH.toFixed(1) + '" fill="' + cor + '" rx="1.5"/>');
        xLabels.push('<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (SVG_H - 2) + '" text-anchor="end" font-size="5" fill="#64748b" transform="rotate(-35 ' + (x + barW / 2).toFixed(1) + ',' + (SVG_H - 2) + ')">' + escapeXml(truncLabel(item.name)) + '</text>');
      }

      var gridLines = [];
      for (var gi2 = 0; gi2 <= 4; gi2++) {
        var gy = BAR_BASE_Y - (gi2 / 4) * BAR_MAX_H;
        var labelVal = (maxVal * gi2) / 4;
        var labelStr = labelVal >= 1000 ? (labelVal / 1000).toFixed(1) + 'k' : labelVal >= 100 ? labelVal.toFixed(0) : labelVal.toFixed(1);
        gridLines.push('<line x1="30" y1="' + gy.toFixed(1) + '" x2="' + SVG_W + '" y2="' + gy.toFixed(1) + '" stroke="#e2e8f0" stroke-width="0.5"/>');
        gridLines.push('<text x="28" y="' + (gy + 2).toFixed(1) + '" text-anchor="end" font-size="5" fill="#64748b">' + labelStr + '</text>');
      }

      chartsHtml += '\n      <div class="chart-box">\n        <h4>' + escapeXml(titulo) + '</h4>\n        <svg width="100%" height="100%" viewBox="-5 0 ' + (SVG_W + 35) + ' ' + SVG_H + '" style="display:block">\n          ' + gridLines.join('\n          ') + '\n          ' + bars.join('\n          ') + '\n          ' + xLabels.join('\n          ') + '\n        </svg>\n      </div>';
    }
  }

  // ============================================
  // GERACAO DO HTML
  // ============================================

  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n  <style>\n    * { box-sizing: border-box; margin: 0; padding: 0; overflow: visible; }\n    body {\n      font-family: \'Inter\', \'Segoe UI\', -apple-system, Arial, sans-serif;\n      background: #ffffff;\n      color: #1e293b;\n      font-size: 8px;\n      line-height: 1.3;\n      padding: 0;\n    }\n    .page {\n      padding: 10px 12px 12px;\n      position: relative;\n    }\n\n    .top-bar {\n      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);\n      border-radius: 6px; padding: 7px 10px; margin-bottom: 5px;\n      display: flex; justify-content: space-between; align-items: center;\n    }\n    .top-bar-title { font-size: 13px; font-weight: 800; color: #fbbf24; }\n    .top-bar-sub { font-size: 6.5px; color: #94a3b8; }\n    .top-bar-right { text-align: right; font-size: 6.5px; color: #64748b; }\n\n    .hero-compact {\n      background: linear-gradient(90deg, #fefce8 0%, #fef9c3 100%);\n      border: 1px solid #fde68a; border-radius: 6px;\n      padding: 5px 8px; margin-bottom: 6px;\n      display: flex; align-items: center; gap: 8px;\n    }\n    .hero-fat { font-size: 18px; font-weight: 800; color: #92400e; white-space: nowrap; }\n    .hero-fat-label { font-size: 5.5px; color: #a16207; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }\n    .hero-metas { display: flex; gap: 6px; flex: 1; justify-content: flex-end; flex-wrap: wrap; }\n    .hero-meta { text-align: center; min-width: 35px; }\n    .hero-meta-v { font-size: 10px; font-weight: 700; color: #1e293b; }\n    .hero-meta-l { font-size: 5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }\n\n    .sec { margin-bottom: 6px; }\n    .sec-h {\n      font-size: 7px; font-weight: 700; color: #0f172a;\n      text-transform: uppercase; letter-spacing: 0.5px;\n      padding-bottom: 3px; margin-bottom: 4px;\n      border-bottom: 1.5px solid #22c55e;\n      display: flex; align-items: center; gap: 4px;\n    }\n    .sec-h .badge { background: #1e293b; color: white; font-size: 5.5px; padding: 0 5px; border-radius: 8px; font-weight: 600; margin-left: auto; }\n\n    .cards-row { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 6px; }\n    .card-item {\n      flex: 1; min-width: 60px; background: white; border: 1px solid #e2e8f0; border-radius: 5px;\n      padding: 4px 6px; border-top: 3px solid #cbd5e1;\n    }\n    .card-l { font-size: 5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n    .card-v { font-size: 10px; font-weight: 700; color: #0f172a; margin-top: 1px; }\n\n    .kpi-grid { display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 4px; }\n    .kpi-c {\n      flex: 1; min-width: 75px; background: white; border: 1px solid #e2e8f0;\n      border-radius: 4px; padding: 4px 6px; border-left: 3px solid #cbd5e1;\n    }\n    .kpi-c.fin { border-left-color: #f59e0b; background: #fffbeb; }\n    .kpi-c.op { border-left-color: #3b82f6; background: #f8fafc; }\n    .kpi-c.pct { border-left-color: #8b5cf6; background: #faf5ff; }\n    .kpi-l { font-size: 5.5px; color: #475569; font-weight: 600; text-transform: uppercase; letter-spacing: 0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n    .kpi-v { font-size: 10px; font-weight: 700; color: #0f172a; }\n    .kpi-v.fin-v { color: #b45309; }\n    .kpi-v.pct-v { color: #7c3aed; }\n\n    table.tbl { width: 100%; border-collapse: collapse; font-size: 7px; }\n    table.tbl th { padding: 3px 5px; background: #1e293b; color: white; font-size: 6px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 600; text-align: left; }\n    table.tbl td { padding: 3px 5px; border-bottom: 1px solid #e2e8f0; }\n    table.tbl .r { text-align: right; font-weight: 700; color: #0f172a; }\n    table.tbl tr:nth-child(even) td { background: #f8fafc; }\n    table.tbl tr { break-inside: avoid; page-break-inside: avoid; }\n\n    .fat-bar-container { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; margin-bottom: 4px; }\n    .fat-bar-row { display: flex; align-items: center; gap: 4px; margin: 3px 0; font-size: 6.5px; }\n    .fat-bar-label { width: 55px; font-weight: 600; color: #334155; text-align: right; font-size: 6px; }\n    .fat-bar-track { flex: 1; height: 12px; background: #e2e8f0; border-radius: 6px; overflow: hidden; }\n    .fat-bar-fill { height: 100%; border-radius: 6px; }\n    .fat-bar-value { width: 70px; font-weight: 700; color: #0f172a; text-align: right; font-size: 6px; }\n    .fat-bar-pct { width: 30px; font-weight: 600; color: #64748b; text-align: right; font-size: 5.5px; }\n\n    .chart-row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }\n    .chart-box {\n      flex: 1; min-width: 160px; background: white; border: 1px solid #e2e8f0;\n      border-radius: 5px; padding: 4px 6px;\n    }\n    .chart-box h4 { font-size: 6px; font-weight: 600; color: #334155; margin-bottom: 2px; }\n    .chart-box svg { max-height: 105px; }\n\n    .page-break { page-break-before: always; break-before: page; }\n\n    @media print {\n      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n      .card-item, .kpi-c, .chart-box, table.tbl tr { break-inside: avoid; page-break-inside: avoid; }\n    }\n  </style>\n</head>\n<body>\n\n  <!-- PAGINA 1 - DADOS DESCRITIVOS -->\n  <div class="page">\n\n    <div class="top-bar">\n      <div>\n        <div class="top-bar-title">' + escapeXml(servicoNome) + '</div>\n        <div class="top-bar-sub">' + cabecalhoMeta + '</div>\n      </div>\n      <div class="top-bar-right">\n        <div>' + dataStr + ' ' + horaStr + '</div>\n        <div>Sistemma - ' + escapeXml(tituloRelatorio) + '</div>\n      </div>\n    </div>\n\n    ' + heroHtml + '\n\n    ' + receitaDestaquesHtml + '\n\n    ' + operacaoDestaquesHtml + '\n\n    ' + (metricCards.length > 0 ? '\n    <div class="sec">\n      <div class="sec-h">Metricas Executivas</div>\n      <div class="cards-row">\n        ' + cardsLinha1.map(function(c) { return '<div class="card-item" style="border-top-color:' + c.color + '"><div class="card-l">' + c.label + '</div><div class="card-v">' + c.value + '</div></div>'; }).join('') + '\n      </div>\n      <div class="cards-row">\n        ' + cardsLinha2.map(function(c) { return '<div class="card-item" style="border-top-color:' + c.color + '"><div class="card-l">' + c.label + '</div><div class="card-v">' + c.value + '</div></div>'; }).join('') + '\n      </div>\n    </div>\n' : '') + '\n\n    ' + (mostraFinanceiro && fatPorTipoRows.length > 0 ? '\n    <div class="sec">\n      <div class="sec-h">Faturamento por Tipo de Caminhao</div>\n      <div class="fat-bar-container">\n        ' + fatPorTipoRows.map(function(r) { return '<div class="fat-bar-row"><span class="fat-bar-label">' + r.tipo + '</span><div class="fat-bar-track"><div class="fat-bar-fill" style="width:' + r.pct.toFixed(1) + '%;background:' + r.cor + '"></div></div><span class="fat-bar-value">' + r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '</span><span class="fat-bar-pct">' + r.pct.toFixed(1) + '%</span></div>'; }).join('') + '\n        <div style="margin-top:4px;font-size:5.5px;color:#94a3b8;text-align:right">* Dados referentes ao servico: ' + escapeXml(servicoNome) + '</div>\n      </div>\n    </div>\n' : '') + '\n\n    ' + (kpisFinanceirosFiltrados.length > 0 || kpisOperacionaisFiltrados.length > 0 ? '\n    <div style="display:flex;gap:6px">\n      ' + (kpisFinanceirosFiltrados.length > 0 ? '\n      <div style="flex:1;min-width:0">\n        <div class="sec-h" style="border-bottom-color:#f59e0b">Financeiros <span class="badge">' + kpisFinanceirosFiltrados.length + '</span></div>\n        <div class="kpi-grid">\n          ' + kpisFinHtml + '\n        </div>\n      </div>\n' : '') + '\n      ' + (kpisOperacionaisFiltrados.length > 0 ? '\n      <div style="flex:1;min-width:0">\n        <div class="sec-h" style="border-bottom-color:#3b82f6">Operacionais <span class="badge">' + kpisOperacionaisFiltrados.length + '</span></div>\n        <div class="kpi-grid">\n          ' + kpisOpHtml + '\n        </div>\n      </div>\n' : '') + '\n    </div>\n' : '') + '\n\n    ' + (metricsRows.length > 0 ? '\n    <div class="sec">\n      <div class="sec-h">' + (tipoExport === 'receita' ? 'Resumo Financeiro' : tipoExport === 'operacao' ? 'Resumo Operacional' : 'Resumo Geral') + '</div>\n      <table class="tbl">\n        <thead><tr><th style="width:65%">Metrica</th><th style="width:35%;text-align:right">Valor</th></tr></thead>\n        <tbody>\n          ' + metricsRows.map(function(row, i) { return '<tr' + (i % 2 === 0 ? ' class="even"' : '') + '><td>' + row.label + '</td><td class="r">' + row.value + '</td></tr>'; }).join('') + '\n        </tbody>\n      </table>\n    </div>\n' : '') + '\n\n    ' + viagensTableHtml + '\n\n  </div>\n\n  <!-- PAGINA 2 - GRAFICOS -->\n  ' + ((mostraFinanceiro && finChartsHtml) || (mostraOperacional && chartsHtml) ? '\n  <div class="page page-break">\n    <div class="top-bar">\n      <div>\n        <div class="top-bar-title">' + servicoNome + '</div>\n        <div class="top-bar-sub">Graficos - ' + cabecalhoMeta + '</div>\n      </div>\n      <div class="top-bar-right">\n        <div>Sistemma - ' + escapeXml(tituloRelatorio) + '</div>\n      </div>\n    </div>\n    ' + (mostraFinanceiro && finChartsHtml ? '\n    <div class="sec">\n      <div class="sec-h">Graficos Financeiros</div>\n      <div class="chart-row">\n        ' + finChartsHtml + '\n      </div>\n    </div>\n' : '') + '\n    ' + (mostraOperacional && chartsHtml ? '\n    <div class="sec">\n      <div class="sec-h">Graficos do Dashboard</div>\n      <div class="chart-row">\n        ' + chartsHtml + '\n      </div>\n    </div>\n' : '') + '\n  </div>\n' : '') + '\n\n</body>\n</html>';
}
