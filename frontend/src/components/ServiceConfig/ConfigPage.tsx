/* ============================================
   ConfigPage — Página de configuração que USA KpiEditor
   Agora inclui indicadores automáticos do resumo executivo
   ============================================ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBarChart2, FiExternalLink } from 'react-icons/fi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import KpiEditor from '../KpiEditor/KpiEditor';
import type { KpiConfig, GraficoConfig, ColunaDetectada, ConstanteGlobal, IndicadorAutomatico } from '../KpiEditor/KpiEditorTypes';
import { CATALOGO_METRICAS } from '../ExecSummary';
import { FORMULAS_RESUMO_EXECUTIVO } from '../../data/formulasResumoExecutivo';
import '../../styles/ContratoDetalhe.css';

export default function ConfigPage() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [servicoNome, setServicoNome] = useState('');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [colunasNum, setColunasNum] = useState<ColunaDetectada[]>([]);
  const [colunasTexto, setColunasTexto] = useState<ColunaDetectada[]>([]);
  const [dadosBrutos, setDadosBrutos] = useState<any[]>([]);
  const [constantesGlobais, setConstantesGlobais] = useState<Record<string, ConstanteGlobal>>({});
  const [salvando, setSalvando] = useState(false);
  const [initialKpis, setInitialKpis] = useState<KpiConfig[] | undefined>();
  const [initialGraficos, setInitialGraficos] = useState<GraficoConfig[] | undefined>();
  const [contratoKpis, setContratoKpis] = useState<any[]>([]);

  // ═══ Indicadores automáticos ═══
  const [indicadoresAutomaticos, setIndicadoresAutomaticos] = useState<IndicadorAutomatico[]>([]);
  const [initialAutoMetricasVisiveis, setInitialAutoMetricasVisiveis] = useState<Record<string, boolean> | undefined>();
  const [initialAutoGraficosVisiveis, setInitialAutoGraficosVisiveis] = useState<Record<string, boolean> | undefined>();

  const carregarDados = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    try {
      // Carregar dados padrão + exec metrics + dados brutos em paralelo
      const [resPadrao, resBrutos, resExec] = await Promise.all([
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/padrao', {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/dados-brutos?limite=2000', {
          headers: { Authorization: 'Bearer ' + token },
        }),
        fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/kpi-exec-metrics', {
          headers: { Authorization: 'Bearer ' + token },
        }),
      ]);

      let configDashboard: any = null;
      let configResumo: any = null;

      if (resPadrao.ok) {
        const data = await resPadrao.json();
        setServicoNome(data.servico?.nome || 'Serviço');
        const cols = data.servico?.padraoPlanilha?.colunas || [];
        setColunas(cols);
        setColunasNum(cols.filter((c: ColunaDetectada) => c.tipo === 'numero'));
        setColunasTexto(cols.filter((c: ColunaDetectada) => c.tipo === 'texto' || c.tipo === 'desconhecido'));

        // Carregar configuração existente
        configDashboard = data.servico?.configDashboard;
        if (configDashboard?.kpis?.length) {
          setInitialKpis(JSON.parse(JSON.stringify(configDashboard.kpis)));
        }
        if (configDashboard?.graficos?.length) {
          setInitialGraficos(configDashboard.graficos);
        }

        // Contrato KPIs para importação
        if (data.contratoKpis?.length) {
          setContratoKpis(data.contratoKpis);
        }

        // Constantes globais
        if (data.valoresCaminhao) {
          const globs: Record<string, ConstanteGlobal> = {};
          for (const [k, v] of Object.entries(data.valoresCaminhao)) {
            if (v !== null && v !== undefined) globs[k] = { valor: Number(v), label: k };
          }
          setConstantesGlobais(globs);
        }

        // Config resumo (métricas ativas)
        configResumo = data.servico?.configDashboard?.configResumo;
      }

      if (resBrutos.ok) {
        setDadosBrutos((await resBrutos.json()).dados || []);
      }

      // ═══ Carregar indicadores automáticos ═══
      let execMetrics: any = null;
      if (resExec.ok) {
        execMetrics = await resExec.json();
      }

      // Mapear CATALOGO_METRICAS para IndicadorAutomatico[]
      const metricasFixadas = new Set(
        (configDashboard?.kpis || [])
          .filter((k: any) => k.metricaKey)
          .map((k: any) => k.metricaKey)
      );

      // Mapa de formato por key das fórmulas do resumo executivo
      const formatoPorKey = new Map(FORMULAS_RESUMO_EXECUTIVO.map(f => [f.key, f.formato]));

      const autoMetricasVisiveisConfig = configDashboard?.autoMetricasVisiveiles || {};

      const indicadores = CATALOGO_METRICAS.map(m => ({
        key: m.key,
        label: m.label,
        tipo: m.tipo as 'primaria' | 'secundaria',
        cor: m.cor,
        formato: (formatoPorKey.get(m.key) || 'numero') as 'numero' | 'moeda' | 'porcentagem',
        jaFixado: metricasFixadas.has(m.key),
        visivel: autoMetricasVisiveisConfig[m.key] !== undefined
          ? autoMetricasVisiveisConfig[m.key]
          : configResumo?.metricasAtivas
            ? configResumo.metricasAtivas.includes(m.key)
            : true,
      }));

      setIndicadoresAutomaticos(indicadores);

      // Visibilidade das métricas automáticas
      const visiveis: Record<string, boolean> = {};
      for (const m of indicadores) {
        visiveis[m.key] = m.visivel;
      }

      setInitialAutoMetricasVisiveis(
        Object.keys(visiveis).length > 0 ? visiveis : undefined
      );

      // Visibilidade dos gráficos automáticos (salvos no configDashboard)
      const autoGraficos = configDashboard?.autoGraficosVisiveiles || {};
      setInitialAutoGraficosVisiveis(
        Object.keys(autoGraficos).length > 0 ? autoGraficos : undefined
      );

    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const handleSave = async (
    kpis: KpiConfig[],
    graficos: GraficoConfig[],
    autoMetricasVisiveis?: Record<string, boolean>,
    autoGraficosVisiveis?: Record<string, boolean>
  ) => {
    if (!contractId || !servicoId) return;
    setSalvando(true);
    try {
      const configDashboard: any = {
        kpis: kpis.filter(k => k.ativo).map(k => ({
          ...k,
          colunasUsadas: k.expressao ? extrairColunasDaExpressao(k.expressao) : k.colunasUsadas || [],
        })),
        graficos: graficos.filter(g => g.ativo),
      };

      // Incluir visibilidade das métricas automáticas
      if (autoMetricasVisiveis && Object.keys(autoMetricasVisiveis).length > 0) {
        configDashboard.autoMetricasVisiveiles = autoMetricasVisiveis;
      }

      // Incluir visibilidade dos gráficos automáticos
      if (autoGraficosVisiveis && Object.keys(autoGraficosVisiveis).length > 0) {
        configDashboard.autoGraficosVisiveiles = autoGraficosVisiveis;
      }

      const r = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/config-dashboard', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ configDashboard }),
      });
      if (r.ok) {
        adicionarToast('Indicadores salvos com sucesso!', 'success');
        navigate('/dashboard?foco=' + servicoId);
      } else {
        adicionarToast('Erro ao salvar', 'error');
      }
    } catch {
      adicionarToast('Erro ao salvar', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const handleColunaTipoChange = async (nome: string, tipo: string) => {
    try {
      const r = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/colunas/tipo', {
        method: 'PUT',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, tipo }),
      });
      if (r.ok) {
        adicionarToast('Tipo atualizado!', 'success');
        carregarDados();
      } else {
        adicionarToast('Erro ao atualizar tipo', 'error');
      }
    } catch {
      adicionarToast('Erro de conexão', 'error');
    }
  };

  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '900px', margin: '0 auto' }}>
        <div className="skeleton" style={{ height: '24px', width: '200px', marginBottom: '1rem' }} />
        <div className="skeleton" style={{ height: '400px', borderRadius: '12px' }} />
      </div>
    );
  }

  return (
    <KpiEditor
      mode="page"
      contractId={contractId!}
      servicoId={servicoId!}
      token={token!}
      servicoNome={servicoNome}
      colunas={colunas}
      colunasNum={colunasNum}
      colunasTexto={colunasTexto}
      dadosBrutos={dadosBrutos}
      constantesGlobais={constantesGlobais}
      contratoKpis={contratoKpis}
      initialKpis={initialKpis}
      initialGraficos={initialGraficos}
      onSave={handleSave}
      onBack={() => navigate('/dashboard?foco=' + servicoId)}
      salvando={salvando}
      onColunaTipoChange={handleColunaTipoChange}
      indicadoresAutomaticos={indicadoresAutomaticos}
      initialAutoMetricasVisiveis={initialAutoMetricasVisiveis}
      initialAutoGraficosVisiveis={initialAutoGraficosVisiveis}
    />
  );
}

function extrairColunasDaExpressao(expressao: string): string[] {
  const colunas: string[] = [];
  const funcRegex = /(?:SUM|AVG|MIN|MAX|COUNT(?:\s+DISTINCT)?)\s*\(\s*([^)]+)\s*\)/gi;
  let match;
  while ((match = funcRegex.exec(expressao)) !== null) {
    const params = match[1].trim();
    if (params !== '*' && !colunas.includes(params)) colunas.push(params);
  }
  return colunas;
}
