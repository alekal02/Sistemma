import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiBarChart2, FiDatabase, FiSettings,
  FiArrowLeft, FiRefreshCw, FiDownload,
  FiZap, FiDollarSign, FiTruck, FiClock,
  FiMapPin, FiUsers, FiExternalLink, FiSend, FiAlertTriangle,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { useKpiCalculator } from '../hooks/useKpiCalculator';
import GoogleFilterBar from '../components/GoogleFilterBar';
import { useGoogleFilters } from '../hooks/useGoogleFilters';
import ChartGrid from '../components/ChartGrid';
import EmptyState from '../components/EmptyState';
import SkeletonLoader from '../components/SkeletonLoader';
import ExportPdfModal from '../components/ExportPdfModal';
import DataTable from '../components/DataTable';
import type { KpiFiltros } from '../hooks/useKpiCalculator';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from '../components/KpiEditor/KpiEditorTypes';

const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899', '#84cc16', '#06b6d4'];

type Aba = 'dashboard' | 'receita' | 'operacao' | 'dados';

export default function ServicoVisao() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [abaAtiva, setAbaAtiva] = useState<Aba>('dashboard');
  const [carregando, setCarregando] = useState(true);
  const [servicoNome, setServicoNome] = useState('Servico');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalUploads, setTotalUploads] = useState(0);
  const [inconsistencias, setInconsistencias] = useState<{
    viagensInconsistentes: number;
    viagensValidas: number;
    totalViagens: number;
    percentualValido: number;
    impactoDashboard: string;
    resumoPorMotivo: { motivo: string; quantidade: number }[];
    amostra: { id: number; data: string | null; placa: string | null; motorista: string | null; motivos: string[] }[];
  } | null>(null);
  const [mostrarDetalheInconsistencias, setMostrarDetalheInconsistencias] = useState(false);

  const [kpis, setKpis] = useState<KpiConfig[]>([]);
  const [graficos, setGraficos] = useState<GraficoConfig[]>([]);

  // ═══ Google Filters ═══
  const filtrosGA = useGoogleFilters();

  const [showExportModal, setShowExportModal] = useState(false);
  const [tipoExport, setTipoExport] = useState<'completo' | 'receita' | 'operacao'>('completo');

  // === Estado para analise de viagens (aba Operacao) ===
  const [analisePlaca, setAnalisePlaca] = useState('');
  const [analiseExpandida, setAnaliseExpandida] = useState(true);
  const [exportandoPdfViagens, setExportandoPdfViagens] = useState(false);

  // Estado do modal WhatsApp — REMOVIDO

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Visao Geral', href: '/visao-geral' },
      { label: 'Contratos', href: '/contratos' },
      { label: servicoNome !== 'Servico' ? servicoNome : 'Servico' },
    ]);
  }, [servicoNome, setBreadcrumbs]);

  const colunasHoraSet = useMemo(() => new Set<string>(
    colunas.filter(c => c.tipo === 'hora').map(c => c.nome)
  ), [colunas]);

  const colunasNumSet = useMemo(() => new Set<string>(
    colunas.filter(c => c.tipo === 'numero').map(c => c.nome)
  ), [colunas]);

  // Filtros completos convertidos do GoogleFilterBar para o KPI Calculator
  const filtrosCompletos = useMemo<KpiFiltros>(() => {
    const params = filtrosGA.toApiParams();
    const din: Record<string, string> = {};
    for (const dim of filtrosGA.dimensoes) {
      if (dim.selecionados.length > 0) {
        din[dim.nome] = dim.selecionados.join(',');
      }
    }
    return {
      dataInicio: params.dataInicio,
      dataFim: params.dataFim,
      filtrosDinamicos: Object.keys(din).length > 0 ? din : undefined,
    };
  }, [filtrosGA]);

  const { kpiValores, execMetrics, loading: loadingKpis, reload: reloadKpis } = useKpiCalculator({
    contractId: contractId!, servicoId: servicoId!, filtros: filtrosCompletos,
  });

  // WhatsApp removido

  const dadosFiltradosGraficos = useMemo(() => {
    if (!dadosBrutos.length) return [];
    // Construir filtros dinâmicos a partir das dimensões ativas do GoogleFilterBar
    const dimAtivas: Record<string, string> = {};
    for (const dim of filtrosGA.dimensoes) {
      if (dim.selecionados.length > 0) {
        dimAtivas[dim.nome] = dim.selecionados.join(',');
      }
    }
    if (Object.keys(dimAtivas).length === 0) return dadosBrutos;
    const removerAcentos = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return dadosBrutos.filter(d => {
      for (const [coluna, valor] of Object.entries(dimAtivas)) {
        if (!valor) continue;
        let valorDado: any = d[coluna];
        if (valorDado === undefined || valorDado === null) {
          const colunaNorm = removerAcentos(coluna.toUpperCase().replace(/\s+/g, ''));
          for (const [k, v] of Object.entries(d)) {
            const kNorm = removerAcentos(k.toUpperCase().replace(/\s+/g, ''));
            if (kNorm === colunaNorm) { valorDado = v; break; }
          }
        }
        if (valorDado === undefined || valorDado === null || valorDado === '') return false;
        const dadoNorm = removerAcentos(String(valorDado).toUpperCase().trim());
        const valoresList = valor.split(',').map(v => removerAcentos(v.toUpperCase().trim())).filter(Boolean);
        if (valoresList.length > 1) {
          if (!valoresList.includes(dadoNorm)) return false;
        } else {
          if (dadoNorm !== valoresList[0]) return false;
        }
      }
      return true;
    });
  }, [dadosBrutos, filtrosGA.dimensoes]);

  // === Exportar PDF de Analise de Viagens ===
  const exportarPdfViagens = useCallback(async () => {
    if (!contractId || !servicoId || dadosFiltradosGraficos.length === 0) return;
    setExportandoPdfViagens(true);
    try {
      const hoje = new Date();
      const dataStr = hoje.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
      const horaStr = hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const primeiroRegistro = dadosFiltradosGraficos[0] || {};
      const chaves = Object.keys(primeiroRegistro);
      const normalizar = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      const colPeso = chaves.find(k => normalizar(k).includes('PESO'));
      const colKmTotal = chaves.find(k => { const n = normalizar(k); return n.includes('KMTOTAL') || n === 'KM TOTAL' || n.includes('KMTOTAL') || (n.includes('KM') && (n.includes('TOTAL') || !n.includes('SAIDA') && !n.includes('CHEGADA') && !n.includes('INICIAL') && !n.includes('FINAL'))); });
      const colKmSaida = chaves.find(k => { const n = normalizar(k); return n.includes('KMSAIDA') || n.includes('KM_SAIDA') || n.includes('KMSAIDA') || n.includes('KMINICIAL') || n.includes('KM INICIAL') || (n.includes('KM') && n.includes('SAIDA')); });
      const colKmChegada = chaves.find(k => { const n = normalizar(k); return n.includes('KMCHEGADA') || n.includes('KM_CHEGADA') || n.includes('KMCHEGADA') || n.includes('KMFINAL') || n.includes('KM FINAL') || (n.includes('KM') && n.includes('CHEGADA')); });
      const colPlaca = chaves.find(k => normalizar(k) === 'PLACA' || normalizar(k).includes('CAMINHAO'));
      const colMotorista = chaves.find(k => normalizar(k).includes('MOTORISTA'));
      const colHoraSaida = chaves.find(k => { const n = normalizar(k); return n.includes('HORASAIDA') || n.includes('HORA_SAIDA') || n.includes('HORASAIDA') || (n.includes('HORA') && n.includes('SAIDA')); });
      const colHoraChegada = chaves.find(k => { const n = normalizar(k); return n.includes('HORACHEGADA') || n.includes('HORA_CHEGADA') || n.includes('HORACHEGADA') || (n.includes('HORA') && n.includes('CHEGADA')); });
      const colData = chaves.find(k => normalizar(k).includes('DATA'));
      const colTurno = chaves.find(k => normalizar(k).includes('TURNO'));
      const colRegional = chaves.find(k => normalizar(k).includes('REGIONAL'));
      const colDistrito = chaves.find(k => normalizar(k).includes('DISTRITO'));

      const obterValor = (dado: any, chave: string | undefined): any => {
        if (!chave) return undefined;
        if (dado[chave] !== undefined && dado[chave] !== null) return dado[chave];
        const norm = normalizar(chave);
        for (const k of Object.keys(dado)) {
          if (normalizar(k) === norm && dado[k] !== null && dado[k] !== undefined) return dado[k];
        }
        return undefined;
      };
      const paraNumero = (v: any): number => {
        if (v === null || v === undefined || v === '') return 0;
        if (typeof v === 'number') return v;
        const parsed = parseFloat(String(v).replace(',', '.'));
        return isNaN(parsed) ? 0 : parsed;
      };
      const serialParaMin = (v: any): number => {
        if (typeof v === 'number' && v > 0) { const dias = Math.floor(v); const fracao = v - dias; return Math.round(dias * 24 * 60 + fracao * 24 * 60); }
        if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) { const [h, m] = v.split(':').map(Number); return h * 60 + (m || 0); }
        return 0;
      };
      const fmtMin = (min: number): string => {
        const h = Math.floor(Math.abs(min) / 60);
        const m = Math.round(Math.abs(min) % 60);
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      };
      const fmtNum = (n: number, dec: number = 2): string => {
        return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
      };

      const dadosExport = dadosFiltradosGraficos.slice(0, 200);
      const totalPeso = dadosExport.reduce((s, d) => s + paraNumero(obterValor(d, colPeso)), 0) / 1000;
      const totalKm = dadosExport.reduce((s, d) => {
        const kmT = paraNumero(obterValor(d, colKmTotal));
        const kmS = paraNumero(obterValor(d, colKmSaida));
        const kmC = paraNumero(obterValor(d, colKmChegada));
        const kmCalc = kmC > kmS ? kmC - kmS : 0;
        return s + (kmCalc || kmT || 0);
      }, 0);
      const totalHoras = dadosExport.reduce((s, d) => {
        const hS = serialParaMin(obterValor(d, colHoraSaida));
        const hC = serialParaMin(obterValor(d, colHoraChegada));
        return s + (hC > hS ? hC - hS : 0);
      }, 0) / 60;

      const linhasHtml = dadosExport.map(function(dado: any, idx: number) {
        const peso = paraNumero(obterValor(dado, colPeso));
        const kmT = paraNumero(obterValor(dado, colKmTotal));
        const kmS = paraNumero(obterValor(dado, colKmSaida));
        const kmC = paraNumero(obterValor(dado, colKmChegada));
        const kmCalc = kmC > kmS ? kmC - kmS : 0;
        const kmFinal = kmCalc || kmT || 0;
        const hS = serialParaMin(obterValor(dado, colHoraSaida));
        const hC = serialParaMin(obterValor(dado, colHoraChegada));
        const horasTrab = hC > hS ? (hC - hS) / 60 : 0;
        const placa = String(obterValor(dado, colPlaca) || '-').toUpperCase();
        const motorista = String(obterValor(dado, colMotorista) || '-').toUpperCase();
        const data = obterValor(dado, colData);
        const dataStr = data ? (typeof data === 'string' ? data.split('T')[0] : String(data)) : '-';
        const turno = String(obterValor(dado, colTurno) || '-');
        const toneladas = peso / 1000;
        const eficiencia = peso > 0 && kmFinal > 0 ? (peso / kmFinal) : 0;
        var corLinha = idx % 2 === 0 ? '#f8fafc' : '#ffffff';
        return '<tr style="background:' + corLinha + '"><td style="padding:4px 6px;font-weight:700;color:#1e293b">' + placa + '</td><td style="padding:4px 6px;color:#475569">' + dataStr + '</td><td style="padding:4px 6px;color:#475569">' + motorista + '</td><td style="padding:4px 6px;color:#475569">' + turno + '</td><td style="padding:4px 6px;text-align:right;font-weight:600">' + fmtNum(toneladas, 1) + ' t</td><td style="padding:4px 6px;text-align:right;font-weight:600">' + fmtNum(kmFinal, 1) + '</td><td style="padding:4px 6px;text-align:right;font-weight:600">' + fmtMin(Math.round(horasTrab * 60)) + '</td><td style="padding:4px 6px;text-align:right;font-weight:600">' + fmtNum(eficiencia, 1) + '</td></tr>';
      }).join('\n');

      var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
        '*{box-sizing:border-box;margin:0;padding:0;overflow:visible}' +
        'body{font-family:Arial,sans-serif;color:#1e293b;font-size:9px;padding:10px}' +
        '.header{background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);border-radius:6px;padding:8px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}' +
        '.header h1{font-size:14px;font-weight:800;color:#fbbf24;margin:0}' +
        '.header .sub{font-size:6.5px;color:#94a3b8}' +
        '.header .right{text-align:right;font-size:6.5px;color:#64748b}' +
        '.resumo{background:#fefce8;border:1px solid #fde68a;border-radius:6px;padding:6px 10px;margin-bottom:8px;display:flex;gap:12px;flex-wrap:wrap}' +
        '.resumo-item{text-align:center}' +
        '.resumo-item .v{font-size:12px;font-weight:700;color:#92400e}' +
        '.resumo-item .l{font-size:5.5px;color:#a16207;font-weight:600;text-transform:uppercase}' +
        '.sec-title{font-size:7.5px;font-weight:700;color:#0f172a;text-transform:uppercase;padding-bottom:3px;margin-bottom:4px;border-bottom:1.5px solid #22c55e}' +
        'table{width:100%;border-collapse:collapse;font-size:7px}' +
        'th{padding:4px 6px;background:#1e293b;color:white;font-size:6px;text-transform:uppercase;text-align:left}' +
        'th.r{text-align:right}' +
        'td{padding:4px 6px;border-bottom:1px solid #e2e8f0}' +
        'tr{break-inside:avoid;page-break-inside:avoid}' +
        '.footer{text-align:center;font-size:6px;color:#94a3b8;margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0}' +
        '@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}' +
        '</style></head><body>' +
        '<div class="header"><div><h1>' + servicoNome + '</h1><div class="sub">Analise de Viagens</div></div><div class="right"><div>' + dataStr + '</div><div>' + horaStr + '</div></div></div>' +
        '<div class="resumo">' +
        '<div class="resumo-item"><div class="v">' + dadosExport.length + '</div><div class="l">Registros</div></div>' +
        '<div class="resumo-item"><div class="v">' + fmtNum(totalPeso, 1) + ' t</div><div class="l">Peso Total</div></div>' +
        '<div class="resumo-item"><div class="v">' + fmtNum(totalKm, 0) + ' km</div><div class="l">KM Total</div></div>' +
        '<div class="resumo-item"><div class="v">' + fmtMin(Math.round(totalHoras * 60)) + '</div><div class="l">Horas Total</div></div>' +
        '<div class="resumo-item"><div class="v">' + fmtNum(totalPeso / Math.max(dadosExport.length, 1), 1) + ' t</div><div class="l">Media/Reg.</div></div>' +
        '</div>' +
        '<div class="sec-title">Detalhamento de Viagens (' + dadosExport.length + ' registros)</div>' +
        '<table><thead><tr><th>Placa</th><th>Data</th><th>Motorista</th><th>Turno</th><th class="r">Peso</th><th class="r">KM</th><th class="r">Horas</th><th class="r">Efic.</th></tr></thead><tbody>' +
        linhasHtml +
        '</tbody></table>' +
        '<div class="footer">Sistemma - Relatorio gerado em ' + dataStr + ' as ' + horaStr + '</div>' +
        '</body></html>';

      const res = await fetch('/api/dashboard/generate-pdf', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: html, filename: 'analise_viagens_' + servicoNome.replace(/\s+/g, '_') }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'analise_viagens_' + servicoNome.replace(/\s+/g, '_') + '.pdf';
        a.click();
        window.URL.revokeObjectURL(url);
        adicionarToast('PDF - Analise de Viagens exportado!', 'success');
      } else {
        const text = await res.text();
        let msg = 'Erro ao gerar PDF';
        try { const parsed = JSON.parse(text); msg = parsed.error || msg; } catch {}
        adicionarToast(msg, 'error');
      }
    } catch (err) {
      console.error('[exportarPdfViagens] Erro:', err);
      adicionarToast('Erro ao exportar PDF de viagens', 'error');
    } finally {
      setExportandoPdfViagens(false);
    }
  }, [contractId, servicoId, servicoNome, dadosFiltradosGraficos, token, adicionarToast]);

  // === FILTRAGEM DE KPIS POR CATEGORIA (Receita vs OperaÃ§Ã£o) ===
  const isKpiReceita = useCallback((kpi: KpiConfig): boolean => {
    if (kpi.formato === 'moeda') return true;
    if (kpi.categoria === 'Financeiro') return true;
    const nomeLabel = (kpi.nome + ' ' + (kpi.label || '')).toLowerCase();
    const palavrasReceita = ['faturamento', 'receita', 'financeiro', 'valor', 'custo', 'lucro', 'preco', 'r$'];
    return palavrasReceita.some(p => nomeLabel.includes(p));
  }, []);

  const kpisReceita = useMemo(() => {
    return kpis.filter(k => k.ativo && isKpiReceita(k));
  }, [kpis, isKpiReceita]);

  const kpisOperacao = useMemo(() => {
    return kpis.filter(k => k.ativo && !isKpiReceita(k));
  }, [kpis, isKpiReceita]);

  // === FILTRAGEM DE GRAFICOS POR CATEGORIA (Receita vs OperaÃ§Ã£o) ===
  
  // === FILTRAGEM DE GRAFICOS POR CATEGORIA (Receita vs Operacao) ===
  const isGraficoReceita = useCallback((g: GraficoConfig): boolean => {
    const titulo = (g.titulo + ' ' + (g.descricao || '')).toLowerCase();
    const palavrasReceita = ['faturamento', 'receita', 'financeiro', 'valor', 'custo', 'lucro', 'preco', 'r$', 'moeda'];
    if (palavrasReceita.some(p => titulo.includes(p))) return true;
    const eixos = ((g.eixoX || '') + ' ' + (g.eixoY || '')).toLowerCase();
    const colunasFinanceiras = ['valor', 'preco', 'custo', 'faturamento', 'receita', 'venda', 'total_r', 'total_v', 'moeda'];
    return colunasFinanceiras.some(c => eixos.includes(c));
  }, []);

  const graficosReceita = useMemo(() => {
    return graficos.filter(g => g.ativo && isGraficoReceita(g));
  }, [graficos, isGraficoReceita]);

  const graficosOperacao = useMemo(() => {
    return graficos.filter(g => g.ativo && !isGraficoReceita(g));
  }, [graficos, isGraficoReceita]);
// === CARREGAR DADOS ===
  const carregarDados = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    try {
      const [resPadrao, resBrutos, resInconsistencias] = await Promise.all([
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/padrao', {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/dados-brutos?limite=500', {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/inconsistencias-viagens?revalidar=1', {
          headers: { Authorization: 'Bearer ' + token },
        }),
      ]);

      if (resPadrao.ok) {
        const data = await resPadrao.json();
        setServicoNome(data.servico?.nome || 'Servico');
        const cols: ColunaDetectada[] = data.servico?.padraoPlanilha?.colunas || [];
        setColunas(cols);
        setTotalRegistros(data.uploads?.totalImportados || 0);
        setTotalUploads(data.uploads?.total || 0);
        const cfg = data.servico?.configDashboard;
        if (cfg?.kpis?.length) setKpis(JSON.parse(JSON.stringify(cfg.kpis)));
        if (cfg?.graficos?.length) setGraficos(JSON.parse(JSON.stringify(cfg.graficos)));
      }

      if (resBrutos.ok) {
        setDadosBrutos((await resBrutos.json()).dados || []);
      }

      if (resInconsistencias.ok) {
        setInconsistencias(await resInconsistencias.json());
      }
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  // ═══ Registrar dimensões detectadas no GoogleFilterBar ═══
  useEffect(() => {
    if (dadosBrutos.length === 0 || colunas.length === 0) return;

    const colunasTexto = colunas.filter(c => c.tipo === 'texto' || c.tipo === 'desconhecido').map(c => c.nome);
    const colunasPrioritarias = ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipoCaminhao',
      'PLACA', 'REGIONAL', 'REGIAO', 'MOTORISTA', 'TURNO', 'STATUS', 'PRODUTO', 'MATERIAL'];

    const dimensoes = [];
    for (const coluna of colunasPrioritarias) {
      const chaveReal = colunasTexto.find(c => {
        const cNorm = c.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const colNorm = coluna.toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return cNorm === colNorm;
      });
      if (!chaveReal) continue;

      const valores = new Set<string>();
      for (const d of dadosBrutos) {
        const v = d[chaveReal];
        if (v !== null && v !== undefined && v !== '') {
          valores.add(String(v).trim());
        }
        if (valores.size > 30) break;
      }

      if (valores.size >= 2 && valores.size <= 30) {
        dimensoes.push({
          nome: chaveReal,
          label: chaveReal.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          totalOpcoes: valores.size,
          opcoes: Array.from(valores).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        });
      }
    }

    if (dimensoes.length > 0) {
      filtrosGA.registrarDimensoes(dimensoes);
    }

    // Atualizar métricas de contexto
    filtrosGA.setTotalRegistros(dadosBrutos.length);
  }, [dadosBrutos, colunas]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza total filtrado conforme dados filtrados mudam
  useEffect(() => {
    filtrosGA.setTotalFiltrado(dadosFiltradosGraficos.length);
  }, [dadosFiltradosGraficos]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPlanilha = colunas.length > 0;

  const renderBannerInconsistencias = () => {
    if (!inconsistencias || inconsistencias.viagensInconsistentes <= 0) return null;

    return (
      <div style={{
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <FiAlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e', marginBottom: '0.2rem' }}>
              Dados inconsistentes na planilha
            </div>
            <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0, lineHeight: 1.45 }}>
              {inconsistencias.impactoDashboard}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.45rem', fontSize: '0.72rem', color: '#a16207' }}>
              <span><strong>{inconsistencias.viagensInconsistentes}</strong> viagem(ns) excluída(s) do dashboard</span>
              <span><strong>{inconsistencias.viagensValidas}</strong> viagem(ns) válida(s)</span>
              <span><strong>{inconsistencias.percentualValido}%</strong> dos dados utilizáveis</span>
            </div>
            <button
              type="button"
              onClick={() => setMostrarDetalheInconsistencias(v => !v)}
              style={{
                marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
                fontSize: '0.72rem', fontWeight: 600, color: '#b45309', cursor: 'pointer',
              }}
            >
              {mostrarDetalheInconsistencias ? 'Ocultar detalhes' : 'Ver viagens com problema'}
            </button>
            {mostrarDetalheInconsistencias && (
              <div style={{ marginTop: '0.6rem' }}>
                {(inconsistencias.resumoPorMotivo || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {inconsistencias.resumoPorMotivo.map((p, i) => (
                      <span key={i} style={{
                        background: '#fef3c7', border: '1px solid #fde68a',
                        borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.68rem', color: '#92400e',
                      }}>
                        {p.motivo} ({p.quantidade})
                      </span>
                    ))}
                  </div>
                )}
                {(inconsistencias.amostra || []).length > 0 && (
                  <div style={{ overflowX: 'auto', border: '1px solid #fde68a', borderRadius: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                      <thead>
                        <tr style={{ background: '#fef3c7' }}>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Data</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Placa</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Motorista</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Problemas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inconsistencias.amostra.map((v) => (
                          <tr key={v.id} style={{ borderTop: '1px solid #fde68a' }}>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.data || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.placa || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.motorista || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem', color: '#b45309' }}>{(v.motivos || []).join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // === RENDER ABAS ===
  const renderAbas = () => {
    const abas: { id: Aba; label: string; icon: JSX.Element }[] = [
      { id: 'dashboard', label: 'Dashboard', icon: <FiBarChart2 size={14} /> },
      { id: 'receita', label: 'Receita', icon: <FiDollarSign size={14} /> },
      { id: 'operacao', label: 'Operacao', icon: <FiTruck size={14} /> },
      { id: 'dados', label: 'Dados', icon: <FiDatabase size={14} /> },
    ];

    return (
      <div style={{
        display: 'flex', gap: '0.25rem', marginBottom: '0.75rem',
        borderBottom: '2px solid #e2e8f0', paddingBottom: 0,
        overflowX: 'auto', flexShrink: 0,
      }}>
        {abas.map(aba => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.55rem 0.85rem', fontSize: '0.78rem', fontWeight: 600,
              border: 'none', background: 'none', cursor: 'pointer',
              color: abaAtiva === aba.id ? '#6366f1' : '#64748b',
              borderBottom: abaAtiva === aba.id ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.15s',
              whiteSpace: 'nowrap', opacity: abaAtiva === aba.id ? 1 : 0.7,
            }}
          >
            {aba.icon} {aba.label}
          </button>
        ))}
        {/* Link externo para Configuracao */}
        <button
          onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/configurar')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            padding: '0.55rem 0.85rem', fontSize: '0.78rem', fontWeight: 600,
            border: 'none', background: 'none', cursor: 'pointer',
            color: '#16a34a', borderBottom: '2px solid transparent',
            marginBottom: '-2px', transition: 'all 0.15s',
            whiteSpace: 'nowrap', opacity: 0.8, marginLeft: 'auto',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = '#f0fdf4'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.background = 'none'; }}
        >
          <FiSettings size={13} /> Configuracao <FiExternalLink size={10} />
        </button>
      </div>
    );
  };

  // === RENDER KPI CARDS (reutilizado nas abas) ===
  const renderKpiCards = (kpisFiltrados: KpiConfig[], kpiValoresFiltrados: typeof kpiValores) => {
    if (kpisFiltrados.length === 0) {
      return (
        <div style={{
          background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0',
          textAlign: 'center', padding: '1.5rem', marginBottom: '0.75rem',
        }}>
          <FiBarChart2 size={32} style={{ opacity: 0.15, color: '#6366f1', marginBottom: '0.5rem' }} />
          <h3 style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
            Nenhum indicador nesta categoria
          </h3>
          <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
            Configure indicadores na pagina de Configuracao.
          </p>
          <div style={{ marginTop: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/configurar')}>
              <FiSettings size={12} /> Configurar Indicadores
            </button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>
          Indicadores ({kpisFiltrados.length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
          {kpiValoresFiltrados.map(function(kpiVal, idx) {
            return (
              <div key={kpiVal.id || kpiVal.nome + idx} style={{
                background: '#fff', borderRadius: '10px',
                border: '1px solid #e2e8f0', borderTop: '3px solid ' + CORES[idx % CORES.length],
                padding: '0.65rem 0.75rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 600, color: '#64748b', marginBottom: '0.15rem' }}>
                  {kpiVal.nome || 'KPI'}
                </div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  {kpiVal.formatado || '-'}
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  };



  // === FILTRAR KPI VALORES POR CATEGORIA ===
  const kpiValoresReceita = useMemo(() => {
    const nomesReceita = new Set(kpisReceita.map(k => k.nome));
    return kpiValores.filter(v => nomesReceita.has(v.nome));
  }, [kpiValores, kpisReceita]);

  const kpiValoresOperacao = useMemo(() => {
    const nomesOperacao = new Set(kpisOperacao.map(k => k.nome));
    return kpiValores.filter(v => nomesOperacao.has(v.nome));
  }, [kpiValores, kpisOperacao]);

  /** Receita/Hora unificada — prioriza KPI configurado (mesma fórmula canônica) */
  const receitaPorHora = useMemo(() => {
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const kpiRh = kpiValores.find(v => {
      const n = norm(v.nome || '');
      return n.includes('receita') && (n.includes('hora') || n.includes('/h'));
    });
    if (kpiRh?.valor != null && Number(kpiRh.valor) > 0) return Number(kpiRh.valor);
    return execMetrics?.receitaHora || 0;
  }, [kpiValores, execMetrics]);

  const formatarReceitaPorHora = (valor: number) =>
    valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h';

  // === RENDER DASHBOARD (visÃ£o geral completa) ===
  const renderDashboard = () => {
    if (carregando) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SkeletonLoader tipo="kpi-grid" quantidade={4} />
          <SkeletonLoader tipo="chart" quantidade={2} />
        </div>
      );
    }

    if (!temPlanilha) {
      return (
        <EmptyState
          icone="upload"
          titulo="Nenhum dado ainda"
          descricao="Faca upload de uma planilha para comecar. Va para a aba Dados."
          acoes={[
            { label: 'Ir para Dados', onClick: () => setAbaAtiva('dados'), variante: 'primary' },
          ]}
        />
      );
    }

    const kpisAtivos = kpis.filter(k => k.ativo);
    const graficosAtivos = graficos.filter(g => g.ativo);

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <GoogleFilterBar
          periodo={filtrosGA.periodo}
          comparacao={filtrosGA.comparacao}
          dimensoes={filtrosGA.dimensoes}
          totalRegistros={filtrosGA.totalRegistros}
          totalFiltrado={filtrosGA.totalFiltrado}
          variacaoPeriodo={filtrosGA.variacaoPeriodo}
          onSetPeriodo={filtrosGA.setPeriodo}
          onToggleComparacao={filtrosGA.toggleComparacao}
          onAdicionarFiltro={filtrosGA.adicionarFiltro}
          onRemoverFiltro={filtrosGA.removerFiltro}
          onLimparDimensao={filtrosGA.limparDimensao}
          onLimparTodos={filtrosGA.limparTodos}
          onRefresh={() => reloadKpis()}
        />

        {/* Destaques Financeiros */}
        {execMetrics && (execMetrics.faturamento || 0) > 0 && kpisAtivos.some(k => k.formato === 'moeda') && (
          <>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}>
              <FiDollarSign size={12} /> Destaques Financeiros
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: '0.6rem', marginBottom: '1rem',
            }}>
              <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '10px', padding: '0.7rem 0.85rem', border: '1px solid #334155',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Faturamento Total
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.1rem' }}>
                  {(execMetrics.faturamento || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #f59e0b',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por KM
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {(execMetrics.receitaKm || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/km'}
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #ef4444',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por Hora
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {formatarReceitaPorHora(receitaPorHora)}
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #22c55e',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Ton. Media/Coleta
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {execMetrics.tonMediaColeta.toFixed(2)} t
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #06b6d4',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  KM Medio/Viagem
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {execMetrics.kmMedioViagem.toFixed(1)} km
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #8b5cf6',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Prod./Coletor
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {execMetrics.prodColetor.toFixed(2)} t
                </div>
              </div>
            </div>
          </>
        )}

        {/* Indicadores */}
        {kpisAtivos.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0',
            textAlign: 'center', padding: '1.5rem', marginBottom: '0.75rem',
          }}>
            <FiBarChart2 size={32} style={{ opacity: 0.15, color: '#6366f1', marginBottom: '0.5rem' }} />
            <h3 style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
              {totalRegistros > 0 ? 'Dados importados' : 'Nenhum dado'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
              {totalRegistros > 0
                ? totalRegistros.toLocaleString('pt-BR') + ' registros. Configure indicadores na pagina de Configuracao.'
                : 'Faca upload de uma planilha na aba Dados.'}
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/configurar')}>
                <FiSettings size={12} /> Configurar Indicadores
              </button>
              <button className="btn btn-sm" onClick={async () => {
                try {
                  const res = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/aplicar-modelo-executivo', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ substituir: false }),
                  });
                  if (res.ok) {
                    adicionarToast('Modelo Executivo aplicado!', 'success');
                    carregarDados();
                    setTimeout(() => reloadKpis(), 300);
                  } else {
                    const err = await res.text();
                    adicionarToast('Erro: ' + (JSON.parse(err).error || err), 'error');
                  }
                } catch {
                  adicionarToast('Erro ao aplicar modelo executivo', 'error');
                }
              }} style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: '#f0fdf4', border: '1px solid #bbf7d0',
                borderRadius: '6px', padding: '0.3rem 0.6rem',
                fontSize: '0.7rem', fontWeight: 600, color: '#15803d', cursor: 'pointer',
              }}>
                <FiZap size={12} /> Aplicar Modelo Executivo
              </button>
            </div>
          </div>
        ) : (
          renderKpiCards(kpisAtivos, kpiValores)
        )}

        {/* Graficos */}
        {graficosAtivos.length > 0 && (
          <ChartGrid
            graficos={graficosAtivos}
            dadosBrutos={dadosFiltradosGraficos}
            colunasHoraSet={new Set()}
            CORES={CORES}
            contractId={contractId}
            servicoId={servicoId}
            filtrosAtivos={filtrosCompletos}
          />
        )}
      </div>
    );
  };

  // === RENDER RECEITA (apenas KPIs financeiros) ===
  const renderReceita = () => {
    if (carregando) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SkeletonLoader tipo="kpi-grid" quantidade={3} />
        </div>
      );
    }

    if (!temPlanilha) {
      return (
        <EmptyState icone="upload" titulo="Nenhum dado ainda" descricao="Faca upload de uma planilha para comecar." acoes={[]} />
      );
    }

    // Destaque do faturamento (prioridade: KPI configurado > execMetrics)
    const faturamentoKpi = kpiValoresReceita.find(v => v.nome.toLowerCase().includes('faturamento') || v.formato === 'moeda');
    const temFaturamentoAuto = execMetrics && (execMetrics.faturamento || 0) > 0;

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <GoogleFilterBar
          periodo={filtrosGA.periodo}
          comparacao={filtrosGA.comparacao}
          dimensoes={filtrosGA.dimensoes}
          totalRegistros={filtrosGA.totalRegistros}
          totalFiltrado={filtrosGA.totalFiltrado}
          variacaoPeriodo={filtrosGA.variacaoPeriodo}
          onSetPeriodo={filtrosGA.setPeriodo}
          onToggleComparacao={filtrosGA.toggleComparacao}
          onAdicionarFiltro={filtrosGA.adicionarFiltro}
          onRemoverFiltro={filtrosGA.removerFiltro}
          onLimparDimensao={filtrosGA.limparDimensao}
          onLimparTodos={filtrosGA.limparTodos}
          onRefresh={() => reloadKpis()}
        />

        {/* === DESTAQUES FINANCEIROS (sempre visÃ­vel se houver dados) === */}
        {temFaturamentoAuto && (
          <>
            <div style={{
              fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
              textTransform: 'uppercase', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.3rem',
            }}>
              <FiDollarSign size={12} /> Destaques de Receita
            </div>

            {/* Card de faturamento principal */}
            {faturamentoKpi ? (
              <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem',
                border: '1px solid #334155',
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Faturamento
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.1rem' }}>
                  {faturamentoKpi.formatado || '-'}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem',
                border: '1px solid #334155',
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Faturamento Total
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.1rem' }}>
                  {execMetrics!.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            )}

            {/* Cards secundÃ¡rios de receita */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '0.6rem', marginBottom: '1rem',
            }}>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #f59e0b',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por KM
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {(execMetrics!.receitaKm || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} /km
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #ef4444',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por Hora
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {formatarReceitaPorHora(receitaPorHora)}
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #22c55e',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por Tonelada
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {execMetrics!.pesoTotalTon > 0
                    ? (execMetrics!.faturamento / execMetrics!.pesoTotalTon).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : 'N/D'}
                </div>
              </div>
              <div style={{
                background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem',
                border: '1px solid #e2e8f0', borderTop: '3px solid #8b5cf6',
              }}>
                <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Receita por Viagem
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>
                  {execMetrics!.viagens > 0
                    ? (execMetrics!.faturamento / execMetrics!.viagens).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    : 'N/D'}
                </div>
              </div>
            </div>
          </>
        )}

        {/* === KPIS DE RECEITA CONFIGURADOS === */}
        {kpisReceita.length > 0 ? (
          renderKpiCards(kpisReceita, kpiValoresReceita)
        ) : !temFaturamentoAuto ? (
          /* Se nÃ£o tem faturamento automÃ¡tico nem KPIs configurados */
          <div style={{
            background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0',
            textAlign: 'center', padding: '1.5rem', marginBottom: '0.75rem',
          }}>
            <FiDollarSign size={32} style={{ opacity: 0.15, color: '#f59e0b', marginBottom: '0.5rem' }} />
            <h3 style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '0.25rem' }}>
              Nenhum indicador financeiro
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
              Configure KPIs de receita na pagina de Configuracao ou aplique o modelo executivo automatico.
            </p>
            <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              <button className="btn btn-primary btn-sm" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/configurar')}>
                <FiSettings size={12} /> Configurar Indicadores
              </button>
              <button className="btn btn-sm" onClick={async () => {
                try {
                  const res = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/aplicar-modelo-executivo', {
                    method: 'POST',
                    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ substituir: false }),
                  });
                  if (res.ok) {
                    adicionarToast('Modelo Executivo aplicado!', 'success');
                    carregarDados();
                    setTimeout(() => reloadKpis(), 300);
                  } else {
                    const err = await res.text();
                    adicionarToast('Erro: ' + (JSON.parse(err).error || err), 'error');
                  }
                } catch {
                  adicionarToast('Erro ao aplicar modelo executivo', 'error');
                }
              }} style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: '#fffbeb', border: '1px solid #fde68a',
                borderRadius: '6px', padding: '0.3rem 0.6rem',
                fontSize: '0.7rem', fontWeight: 600, color: '#b45309', cursor: 'pointer',
              }}>
                <FiZap size={12} /> Aplicar Modelo Financeiro
              </button>
            </div>
          </div>
        ) : null}

        {/* Graficos financeiros */}
        {graficosReceita.length > 0 && (
          <ChartGrid
            graficos={graficosReceita}
            dadosBrutos={dadosFiltradosGraficos}
            colunasHoraSet={new Set()}
            CORES={['#f59e0b', '#fbbf24', '#fef3c7', '#b45309', '#d97706']}
            contractId={contractId}
            servicoId={servicoId}
            filtrosAtivos={filtrosCompletos}
          />
        )}

        {/* Mensagem se não houver gráficos de receita */}
        {graficosReceita.length === 0 && graficos.filter(g => g.ativo).length > 0 && (
          <div style={{
            textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.78rem',
            background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.75rem',
          }}>
            Nenhum grafico financeiro encontrado. Os graficos atuais estao classificados como operacionais.
          </div>
        )}

        {/* Botao PDF especifico para Receita */}
        <div style={{ textAlign: 'center', marginTop: '1rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => { setTipoExport('receita'); setShowExportModal(true); }}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
          >
            <FiDownload size={13} /> Exportar PDF - Receita
          </button>
        </div>
      </div>
    );
  };

  // === RENDER OPERACAO (apenas KPIs operacionais) ===
  const renderOperacao = () => {
    if (carregando) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SkeletonLoader tipo="kpi-grid" quantidade={4} />
        </div>
      );
    }

    if (!temPlanilha) {
      return (
        <EmptyState icone="upload" titulo="Nenhum dado ainda" descricao="Faca upload de uma planilha para comecar." acoes={[]} />
      );
    }

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <GoogleFilterBar
          periodo={filtrosGA.periodo}
          comparacao={filtrosGA.comparacao}
          dimensoes={filtrosGA.dimensoes}
          totalRegistros={filtrosGA.totalRegistros}
          totalFiltrado={filtrosGA.totalFiltrado}
          variacaoPeriodo={filtrosGA.variacaoPeriodo}
          onSetPeriodo={filtrosGA.setPeriodo}
          onToggleComparacao={filtrosGA.toggleComparacao}
          onAdicionarFiltro={filtrosGA.adicionarFiltro}
          onRemoverFiltro={filtrosGA.removerFiltro}
          onLimparDimensao={filtrosGA.limparDimensao}
          onLimparTodos={filtrosGA.limparTodos}
          onRefresh={() => reloadKpis()}
        />

        {/* MÃ©tricas operacionais rÃ¡pidas */}
        {execMetrics && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
            gap: '0.6rem', marginBottom: '1rem',
          }}>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0', borderTop: '3px solid #3b82f6' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Viagens</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{execMetrics.viagens.toLocaleString('pt-BR')}</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0', borderTop: '3px solid #22c55e' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Toneladas</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{execMetrics.pesoTotalTon.toFixed(1)} t</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0', borderTop: '3px solid #06b6d4' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>KM Total</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{execMetrics.kmTotal.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km</div>
            </div>
            <div style={{ background: '#fff', borderRadius: '10px', padding: '0.65rem 0.75rem', border: '1px solid #e2e8f0', borderTop: '3px solid #8b5cf6' }}>
              <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Prod./Coletor</div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{execMetrics.prodColetor.toFixed(2)} t</div>
            </div>
          </div>
        )}

        {renderKpiCards(kpisOperacao, kpiValoresOperacao)}

        {/* Graficos operacionais */}
        {graficosOperacao.length > 0 && (
          <ChartGrid
            graficos={graficosOperacao}
            dadosBrutos={dadosFiltradosGraficos}
            colunasHoraSet={new Set()}
            CORES={CORES}
            contractId={contractId}
            servicoId={servicoId}
            filtrosAtivos={filtrosCompletos}
          />
        )}

        {/* Mensagem se não houver gráficos operacionais */}
        {graficosOperacao.length === 0 && graficos.filter(g => g.ativo).length > 0 && (
          <div style={{
            textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.78rem',
            background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '0.75rem',
          }}>
            Nenhum grafico operacional encontrado. Os graficos atuais estao classificados como financeiros.
          </div>
        )}

        {/* === ANÁLISE DE VIAGENS (linha a linha) === */}
        <div style={{ marginTop: '1.5rem', marginBottom: '0.5rem' }}>
          <button
            onClick={() => setAnaliseExpandida(!analiseExpandida)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: 700, color: '#1e293b',
              padding: '0.3rem 0',
            }}
          >
            <FiTruck size={14} />
            Analise de Viagens
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', fontWeight: 400 }}>
              ({dadosFiltradosGraficos.length} registros)
            </span>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#6366f1' }}>
              {analiseExpandida ? 'Recolher â–²' : 'Expandir â–¼'}
            </span>
          </button>
        </div>

        {analiseExpandida && dadosFiltradosGraficos.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
            overflow: 'hidden', marginBottom: '1rem',
          }}>
            {/* Detectar colunas disponÃ­veis dinamicamente */}
            {(() => {
              const primeiroRegistro = dadosFiltradosGraficos[0] || {};
              const chaves = Object.keys(primeiroRegistro);

              // FunÃ§Ã£o para normalizar nome de coluna
              const normalizar = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

              // Detectar colunas importantes
              const colPeso = chaves.find(k => normalizar(k).includes('PESO'));
              const colKmTotal = chaves.find(k => {
                const n = normalizar(k);
                return n.includes('KMTOTAL') || n === 'KM TOTAL' || n.includes('KMTOTAL') || (n.includes('KM') && (n.includes('TOTAL') || !n.includes('SAIDA') && !n.includes('CHEGADA') && !n.includes('INICIAL') && !n.includes('FINAL')));
              });
              const colKmSaida = chaves.find(k => { const n = normalizar(k); return n.includes('KMSAIDA') || n.includes('KM_SAIDA') || n.includes('KMSAIDA') || n.includes('KMINICIAL') || n.includes('KM INICIAL') || (n.includes('KM') && n.includes('SAIDA')); });
              const colKmChegada = chaves.find(k => { const n = normalizar(k); return n.includes('KMCHEGADA') || n.includes('KM_CHEGADA') || n.includes('KMCHEGADA') || n.includes('KMFINAL') || n.includes('KM FINAL') || (n.includes('KM') && n.includes('CHEGADA')); });
              const colPlaca = chaves.find(k => normalizar(k) === 'PLACA' || normalizar(k).includes('CAMINHAO'));
              const colMotorista = chaves.find(k => normalizar(k).includes('MOTORISTA'));
              const colHoraSaida = chaves.find(k => { const n = normalizar(k); return n.includes('HORASAIDA') || n.includes('HORA_SAIDA') || n.includes('HORASAIDA') || (n.includes('HORA') && n.includes('SAIDA')); });
              const colHoraChegada = chaves.find(k => { const n = normalizar(k); return n.includes('HORACHEGADA') || n.includes('HORA_CHEGADA') || n.includes('HORACHEGADA') || (n.includes('HORA') && n.includes('CHEGADA')); });
              const colData = chaves.find(k => normalizar(k).includes('DATA'));
              const colTurno = chaves.find(k => normalizar(k).includes('TURNO'));
              const colViagens = chaves.find(k => normalizar(k).includes('VIAGEN'));
              const colRegional = chaves.find(k => normalizar(k).includes('REGIONAL'));
              const colDistrito = chaves.find(k => normalizar(k).includes('DISTRITO'));

              // Obter valor de forma segura
              const obterValor = (dado: any, chave: string | undefined): any => {
                if (!chave) return undefined;
                if (dado[chave] !== undefined && dado[chave] !== null) return dado[chave];
                const norm = normalizar(chave);
                for (const k of Object.keys(dado)) {
                  if (normalizar(k) === norm && dado[k] !== null && dado[k] !== undefined) return dado[k];
                }
                return undefined;
              };

              // Converter valor para nÃºmero
              const paraNumero = (v: any): number => {
                if (v === null || v === undefined || v === '') return 0;
                if (typeof v === 'number') return v;
                const parsed = parseFloat(String(v).replace(',', '.'));
                return isNaN(parsed) ? 0 : parsed;
              };

              // Serial Excel para minutos
              const serialParaMin = (v: any): number => {
                if (typeof v === 'number' && v > 0) {
                  const dias = Math.floor(v);
                  const fracao = v - dias;
                  return Math.round(dias * 24 * 60 + fracao * 24 * 60);
                }
                if (typeof v === 'string' && /^\d{1,2}:\d{2}/.test(v)) {
                  const [h, m] = v.split(':').map(Number);
                  return h * 60 + (m || 0);
                }
                return 0;
              };

              // Formatar minutos como HH:MM
              const fmtMin = (min: number): string => {
                const h = Math.floor(Math.abs(min) / 60);
                const m = Math.round(Math.abs(min) % 60);
                return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
              };

              // Formatar nÃºmero
              const fmtNum = (n: number, dec: number = 2): string => {
                return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
              };

              // Filtrar por placa se definido
              const dadosFiltrados = analisePlaca
                ? dadosFiltradosGraficos.filter(d => {
                    const placa = String(obterValor(d, colPlaca) || '').toUpperCase();
                    return placa.includes(analisePlaca.toUpperCase());
                  })
                : dadosFiltradosGraficos;

              // Lista de placas Ãºnicas
              const placasUnicas = [...new Set(
                dadosFiltradosGraficos
                  .map(d => String(obterValor(d, colPlaca) || ''))
                  .filter(Boolean)
              )].sort();

              return (
                <>
                  {/* Filtro por placa */}
                  {placasUnicas.length > 1 && (
                    <div style={{ padding: '0.6rem 0.75rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <FiMapPin size={13} style={{ color: '#64748b' }} />
                      <select value={analisePlaca} onChange={e => setAnalisePlaca(e.target.value)}
                        style={{
                          fontSize: '0.78rem', padding: '0.25rem 0.5rem', border: '1px solid #d1d5db',
                          borderRadius: '5px', background: '#fff', maxWidth: '200px',
                        }}>
                        <option value="">Todas as Placas</option>
                        {placasUnicas.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                        {dadosFiltrados.length} registro{dadosFiltrados.length !== 1 ? 's' : ''}
                      </span>
                      {analisePlaca && (
                        <button onClick={() => setAnalisePlaca('')}
                          style={{ fontSize: '0.65rem', color: '#ef4444', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '4px', padding: '0.15rem 0.4rem', cursor: 'pointer' }}>
                          Limpar
                        </button>
                      )}
                    </div>
                  )}

                  {/* Cards de viagem */}
                  <div style={{ padding: '0.5rem 0.75rem 0.75rem', maxHeight: '600px', overflow: 'auto' }}>
                    {dadosFiltrados.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                        Nenhum registro encontrado para esta placa.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '0.5rem' }}>
                        {dadosFiltrados.slice(0, 100).map((dado: any, idx: number) => {
                          // Calcular mÃ©tricas derivadas
                          const peso = paraNumero(obterValor(dado, colPeso));
                          const kmTotal = paraNumero(obterValor(dado, colKmTotal));
                          const kmSaida = paraNumero(obterValor(dado, colKmSaida));
                          const kmChegada = paraNumero(obterValor(dado, colKmChegada));
                          const kmCalculado = kmChegada > kmSaida ? kmChegada - kmSaida : (kmTotal || 0);
                          const kmFinal = kmCalculado || kmTotal || 0;

                          const horaSaida = serialParaMin(obterValor(dado, colHoraSaida));
                          const horaChegada = serialParaMin(obterValor(dado, colHoraChegada));
                          const horasTrabalhadas = horaChegada > horaSaida ? (horaChegada - horaSaida) / 60 : 0;

                          const placa = String(obterValor(dado, colPlaca) || '-').toUpperCase();
                          const motorista = String(obterValor(dado, colMotorista) || '-').toUpperCase();
                          const data = obterValor(dado, colData);
                          const dataStr = data ? (typeof data === 'string' ? data.split('T')[0] : String(data)) : '-';
                          const turno = String(obterValor(dado, colTurno) || '-');
                          const viagens = paraNumero(obterValor(dado, colViagens)) || 1;
                          const regional = String(obterValor(dado, colRegional) || '-');
                          const distrito = String(obterValor(dado, colDistrito) || '-');

                          // MÃ©tricas derivadas
                          const toneladas = peso / 1000;
                          const tonKm = kmFinal > 0 ? (toneladas / kmFinal) * 100 : 0;
                          const eficiencia = peso > 0 && kmFinal > 0 ? (peso / kmFinal) : 0;

                          return (
                            <div key={idx} style={{
                              background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0',
                              padding: '0.65rem', fontSize: '0.75rem',
                              borderLeft: '4px solid ' + CORES[idx % CORES.length],
                              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            }}>
                              {/* CabeÃ§alho do card */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <strong style={{ fontSize: '0.78rem', color: '#1e293b' }}>
                                  {placa !== '-' ? placa : 'Registro #' + (idx + 1)}
                                </strong>
                                {dataStr !== '-' && (
                                  <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{dataStr}</span>
                                )}
                              </div>

                              {/* Motorista / Turno */}
                              {(motorista !== '-' || turno !== '-') && (
                                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                                  {motorista !== '-' && (
                                    <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                      <FiUsers size={10} /> {motorista}
                                    </span>
                                  )}
                                  {turno !== '-' && (
                                    <span style={{ fontSize: '0.65rem', color: '#64748b' }}>Turno: {turno}</span>
                                  )}
                                  {viagens > 1 && (
                                    <span style={{ fontSize: '0.65rem', color: '#6366f1' }}>{viagens} viagens</span>
                                  )}
                                </div>
                              )}

                              {/* MÃ©tricas em grid */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.2rem', marginTop: '0.25rem' }}>
                                {peso > 0 && (
                                  <div style={{ background: '#f0fdf4', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.55rem', color: '#15803d', fontWeight: 600 }}>PESO</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{fmtNum(toneladas, 1)} t</div>
                                  </div>
                                )}
                                {kmFinal > 0 && (
                                  <div style={{ background: '#eff6ff', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.55rem', color: '#1d4ed8', fontWeight: 600 }}>KM</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{fmtNum(kmFinal, 1)} km</div>
                                  </div>
                                )}
                                {horasTrabalhadas > 0 && (
                                  <div style={{ background: '#fdf4ff', borderRadius: '4px', padding: '0.2rem 0.35rem', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.55rem', color: '#a21caf', fontWeight: 600 }}>HORAS</div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0f172a' }}>{fmtNum(horasTrabalhadas, 1)} h</div>
                                  </div>
                                )}
                              </div>

                              {/* MÃ©tricas calculadas */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.2rem', marginTop: '0.2rem' }}>
                                {eficiencia > 0 && (
                                  <div style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center', background: '#f8fafc', borderRadius: '4px', padding: '0.15rem 0.3rem' }}>
                                    <strong>Eficiencia:</strong> {fmtNum(eficiencia, 1)} kg/km
                                  </div>
                                )}
                                {tonKm > 0 && (
                                  <div style={{ fontSize: '0.6rem', color: '#64748b', textAlign: 'center', background: '#f8fafc', borderRadius: '4px', padding: '0.15rem 0.3rem' }}>
                                    <strong>Ton.KM:</strong> {fmtNum(tonKm, 2)}
                                  </div>
                                )}
                              </div>

                              {/* Regional / Distrito */}
                              {(regional !== '-' || distrito !== '-') && (
                                <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.2rem', textAlign: 'center' }}>
                                  {regional !== '-' && regional} {regional !== '-' && distrito !== '-' && ' > '} {distrito !== '-' && distrito}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {dadosFiltrados.length > 100 && (
                      <div style={{ textAlign: 'center', padding: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                        Mostrando 100 de {dadosFiltrados.length} registros.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Botoes PDF para Operacao */}
        <div style={{ textAlign: 'center', marginTop: '0.5rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => { setTipoExport('operacao'); setShowExportModal(true); }}
            className="btn btn-primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}
          >
            <FiDownload size={13} /> Exportar PDF - Operacao
          </button>
          <button
            onClick={exportarPdfViagens}
            disabled={exportandoPdfViagens || dadosFiltradosGraficos.length === 0}
            className="btn btn-primary"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.78rem', fontWeight: 600,
              background: '#1e293b', border: '1px solid #334155',
              opacity: (exportandoPdfViagens || dadosFiltradosGraficos.length === 0) ? 0.6 : 1,
              cursor: (exportandoPdfViagens || dadosFiltradosGraficos.length === 0) ? 'not-allowed' : 'pointer',
            }}
          >
            <FiDownload size={13} /> {exportandoPdfViagens ? 'Gerando...' : 'PDF - Analise de Viagens'}
          </button>
        </div>
      </div>
    );
  };

  // === RENDER DADOS ===
  const renderDados = () => {
    if (carregando) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SkeletonLoader tipo="table" quantidade={5} />
        </div>
      );
    }

    if (!temPlanilha) {
      return (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <FiDatabase size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <h3>Nenhum dado disponivel</h3>
          <p style={{ fontSize: '0.85rem' }}>Faca upload de uma planilha para visualizar os dados.</p>
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          marginBottom: '0.75rem', fontSize: '0.78rem', color: '#64748b',
        }}>
          <FiDatabase size={14} />
          <span>{totalUploads} upload{totalUploads !== 1 ? 's' : ''}</span>
          <span style={{ color: '#cbd5e1' }}>.</span>
          <span>{totalRegistros.toLocaleString('pt-BR')} registro{totalRegistros !== 1 ? 's' : ''}</span>
          <span style={{ color: '#cbd5e1' }}>.</span>
          <span>{colunas.length} colunas</span>
        </div>
        <DataTable
          servicoId={servicoId!}
          contractId={contractId!}
          token={token}
          adicionarToast={adicionarToast}
          colunasPadrao={colunas}
        />
      </div>
    );
  };

  // === RENDER PRINCIPAL ===
  return (
    <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Topo */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.35rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/contratos/' + contractId)}
            style={{ fontSize: '0.72rem', padding: '0.1rem 0.3rem', color: '#6366f1' }}>
            <FiArrowLeft size={12} /> Contrato
          </button>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
            {totalRegistros.toLocaleString('pt-BR')} registros
          </span>
          {temPlanilha && (
            <>
              <button className="btn btn-sm" onClick={() => setShowExportModal(true)} style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                background: '#fefce8', border: '1px solid #f59e0b',
                borderRadius: '6px', padding: '0.3rem 0.6rem',
                fontSize: '0.7rem', fontWeight: 600, color: '#b45309', cursor: 'pointer',
              }}>
                <FiDownload size={11} /> PDF
              </button>
            </>
          )}
          <button className="btn btn-sm btn-ghost" onClick={() => { carregarDados(); reloadKpis(); }} title="Recarregar">
            <FiRefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Abas */}
      {renderAbas()}

      {renderBannerInconsistencias()}

      {/* Conteudo */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {abaAtiva === 'dashboard' && renderDashboard()}
        {abaAtiva === 'receita' && renderReceita()}
        {abaAtiva === 'operacao' && renderOperacao()}
        {abaAtiva === 'dados' && renderDados()}
      </div>

      {showExportModal && contractId && servicoId && (
        <ExportPdfModal
          contractId={contractId}
          servicoId={servicoId}
          servicoNome={servicoNome}
          kpiValores={kpiValores}
          execMetrics={execMetrics}
          graficosAtivos={graficos.filter(g => g.ativo)}
          colunas={colunas}
          tipoExport={tipoExport}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

