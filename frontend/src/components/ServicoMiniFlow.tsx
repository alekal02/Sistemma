/* ============================================
   ServicoMiniFlow — Mini Fluxo Interno
   Upload → Indicadores Auto → Revisão → Config (inline)
   Orquestrador com sub-componentes memoizados
   ============================================ */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import servicoService, { invalidateCachesServico } from '../services/servicoService';
import contractService from '../services/contractService';
import type { KpiConfig, GraficoConfig, ColunaDetectada } from './KpiEditor/KpiEditorTypes';
import ServicoHeader from './servico/ServicoHeader';
import ServicoUploadTab from './servico/ServicoUploadTab';
import ServicoDashboardTab from './servico/ServicoDashboardTab';
import ServicoConfigTab from './servico/ServicoConfigTab';
import {
  filtrarColunasValidas,
  normalizarPlanilhasUploads,
} from './servico/servicoUtils';
import type {
  EtapasStatus,
  EtapaMiniFlow,
  ServicoMiniFlowProps,
} from './servico/servicoTypes';

export type { EtapasStatus } from './servico/servicoTypes';

export default function ServicoMiniFlow({
  contractId,
  servicoId,
  servicoNome,
  tipoServico: tipoServicoProp,
  onStatusChange,
  onPlanilhasChange,
}: ServicoMiniFlowProps) {
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [etapa, setEtapa] = useState<EtapaMiniFlow>('upload');
  const [status, setStatus] = useState<EtapasStatus>({
    upload: 'pending', indicadoresAuto: 'pending', revisao: 'pending', config: 'pending',
  });
  const [tipoServico, setTipoServico] = useState<string>(tipoServicoProp || '');
  const [contratoNome, setContratoNome] = useState('Contrato');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [planilhas, setPlanilhas] = useState(normalizarPlanilhasUploads([]));
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [totalImportados, setTotalImportados] = useState(0);
  const [kpis, setKpis] = useState<KpiConfig[]>([]);
  const [graficos, setGraficos] = useState<GraficoConfig[]>([]);
  const [recargaKey, setRecargaKey] = useState(0);

  const temPlanilha = colunas.length > 0;
  const statusRef = useRef(status);
  const onStatusChangeRef = useRef(onStatusChange);
  const onPlanilhasChangeRef = useRef(onPlanilhasChange);
  const aplicarDadosPadraoRef = useRef<(data: Awaited<ReturnType<typeof servicoService.getPadrao>>) => {
    cols: ColunaDetectada[];
    ups: ReturnType<typeof normalizarPlanilhasUploads>;
    registros: number;
    temUpload: boolean;
    cfg: Awaited<ReturnType<typeof servicoService.getPadrao>>['servico']['configDashboard'];
  }>(() => ({
    cols: [],
    ups: [],
    registros: 0,
    temUpload: false,
    cfg: undefined,
  }));

  onStatusChangeRef.current = onStatusChange;
  onPlanilhasChangeRef.current = onPlanilhasChange;

  useEffect(() => {
    if (tipoServicoProp) setTipoServico(tipoServicoProp);
  }, [tipoServicoProp]);

  const kpisUniversalIds = useMemo(
    () => kpis.filter(k => (k as any).origemUniversal).map(k => (k as any).origemUniversal as string).filter(Boolean),
    [kpis],
  );

  const aplicarDadosPadraoInterno = useCallback((data: Awaited<ReturnType<typeof servicoService.getPadrao>>) => {
    const cfg = data.servico?.configDashboard;
    const cols = filtrarColunasValidas(data.servico?.padraoPlanilha?.colunas || []);
    const ups = normalizarPlanilhasUploads(data.uploads?.ultimos);
    const registros = data.uploads?.registrosValidos ?? data.uploads?.totalImportados ?? 0;

    setColunas(cols);
    setPlanilhas(ups);
    setTotalLinhas(data.uploads?.totalLinhas || 0);
    setTotalImportados(registros);
    setTipoServico(data.servico?.tipo || '');

    const temKpisAuto = cfg?.indicadoresAutomaticosConfirmados;
    const temKpis = (cfg?.kpis?.length || 0) > 0;
    const temUpload = cols.length > 0 || ups.length > 0;
    const novoStatus: EtapasStatus = {
      upload: temUpload ? 'done' : 'pending',
      indicadoresAuto: temKpisAuto ? 'done' : 'pending',
      revisao: temUpload ? 'done' : 'pending',
      config: temKpis ? 'done' : 'pending',
    };
    if (temKpisAuto && temUpload) novoStatus.config = 'done';

    setStatus((prev) => {
      if (
        prev.upload === novoStatus.upload
        && prev.indicadoresAuto === novoStatus.indicadoresAuto
        && prev.revisao === novoStatus.revisao
        && prev.config === novoStatus.config
      ) {
        return prev;
      }
      return novoStatus;
    });

    onPlanilhasChangeRef.current?.({ totalRegistros: registros, planilhas: ups, temUpload });
    return { cols, ups, registros, temUpload, cfg };
  }, []);

  aplicarDadosPadraoRef.current = aplicarDadosPadraoInterno;

  const aplicarDadosPadrao = aplicarDadosPadraoInterno;

  useEffect(() => {
    const prev = statusRef.current;
    if (
      prev.upload === status.upload
      && prev.indicadoresAuto === status.indicadoresAuto
      && prev.revisao === status.revisao
      && prev.config === status.config
    ) {
      return;
    }
    statusRef.current = status;
    onStatusChangeRef.current?.(status);
  }, [status]);

  const ultimaCargaRef = useRef('');

  useEffect(() => {
    const chaveCarga = `${contractId}:${servicoId}:${recargaKey}`;
    if (ultimaCargaRef.current === chaveCarga) return;
    ultimaCargaRef.current = chaveCarga;

    let cancelado = false;
    (async () => {
      try {
        const [data, contrato] = await Promise.all([
          servicoService.getPadrao(contractId, servicoId),
          contractService.buscar(contractId),
        ]);
        if (cancelado) return;
        setContratoNome(contrato.numeroContrato || 'Contrato');
        const { cfg, temUpload } = aplicarDadosPadraoRef.current(data);
        if (cfg?.kpis?.length) setKpis(JSON.parse(JSON.stringify(cfg.kpis)));
        if (cfg?.graficos?.length) setGraficos(JSON.parse(JSON.stringify(cfg.graficos)));
        if (cfg?.indicadoresAutomaticosConfirmados && temUpload) setEtapa('revisao');
      } catch { /* silent */ }
    })();

    return () => { cancelado = true; };
  }, [contractId, servicoId, recargaKey]);

  const refreshData = useCallback(() => {
    invalidateCachesServico(contractId, servicoId);
    ultimaCargaRef.current = '';
    setRecargaKey(k => k + 1);
  }, [contractId, servicoId]);

  const salvarConfig = useCallback(async (novosKpis: KpiConfig[], novosGraficos: GraficoConfig[]) => {
    try {
      await servicoService.saveConfigDashboard(contractId, servicoId, {
        kpis: novosKpis.filter(k => k.ativo !== false),
        graficos: novosGraficos.filter(g => g.ativo),
      });
      if (novosKpis.filter(k => k.ativo !== false).length > 0) {
        setStatus(prev => ({ ...prev, config: 'done' }));
      }
    } catch { /* silent */ }
  }, [contractId, servicoId]);

  const handleAutoSkip = useCallback(() => {
    setStatus(prev => ({ ...prev, indicadoresAuto: 'skipped' }));
    setEtapa('revisao');
    adicionarToast('\u23ed Indicadores autom\u00e1ticos pulados. Configure manualmente depois.', 'info');
  }, [adicionarToast]);

  const alterarTipoColuna = useCallback(async (nome: string, tipo: string) => {
    try {
      await servicoService.updateColunasTipo(contractId, servicoId, { nome, tipo });
      adicionarToast(`Coluna "${nome}" \u2192 ${tipo}`, 'success');
      refreshData();
    } catch {
      adicionarToast('Erro ao alterar tipo', 'error');
    }
  }, [contractId, servicoId, adicionarToast, refreshData]);

  const handlePlanilhaExcluida = useCallback(async (temUpload: boolean) => {
    invalidateCachesServico(contractId, servicoId);
    const data = await servicoService.getPadrao(contractId, servicoId, { force: true });
    aplicarDadosPadrao(data);
    if (!temUpload) {
      setKpis([]);
      setGraficos([]);
    }
  }, [contractId, servicoId, aplicarDadosPadrao]);

  const irPara = useCallback((e: EtapaMiniFlow) => {
    if (e === 'indicadoresAuto' && status.upload !== 'done') {
      adicionarToast('Fa\u00e7a upload primeiro', 'warning');
      return;
    }
    if ((e === 'revisao' || e === 'config') && !temPlanilha) {
      adicionarToast('Fa\u00e7a upload primeiro', 'warning');
      return;
    }
    setEtapa(e);
  }, [status.upload, temPlanilha, adicionarToast]);

  const handleConfigStatusChange = useCallback((done: boolean) => {
    if (done) setStatus(prev => ({ ...prev, config: 'done' }));
  }, []);

  return (
    <div className="mini-flow">
      <ServicoHeader etapa={etapa} status={status} onIrPara={irPara} />
      <div className="etapa-conteudo">
        {etapa === 'upload' && (
          <ServicoUploadTab
            contractId={contractId}
            servicoId={servicoId}
            servicoNome={servicoNome}
            tipoServico={tipoServico}
            contratoNome={contratoNome}
            temPlanilha={temPlanilha}
            planilhas={planilhas}
            onSetEtapa={setEtapa}
            onSetStatus={setStatus}
            onRefreshData={refreshData}
            onPlanilhaExcluida={handlePlanilhaExcluida}
          />
        )}
        {(etapa === 'revisao' || etapa === 'indicadoresAuto') && (
          <ServicoDashboardTab
            mode={etapa === 'indicadoresAuto' ? 'indicadoresAuto' : 'revisao'}
            contractId={contractId}
            servicoId={servicoId}
            servicoNome={servicoNome}
            tipoServico={tipoServico}
            token={token}
            colunas={colunas}
            temPlanilha={temPlanilha}
            totalLinhas={totalLinhas}
            totalImportados={totalImportados}
            kpis={kpis}
            graficos={graficos}
            kpisUniversalIds={kpisUniversalIds}
            onSetKpis={setKpis}
            onSetEtapa={setEtapa}
            onSetStatus={setStatus}
            onSalvarConfig={salvarConfig}
            onAlterarTipoColuna={alterarTipoColuna}
            onAutoSkip={handleAutoSkip}
          />
        )}
        {etapa === 'config' && (
          <ServicoConfigTab
            contractId={contractId}
            servicoId={servicoId}
            tipoServico={tipoServico}
            colunas={colunas}
            temPlanilha={temPlanilha}
            kpis={kpis}
            graficos={graficos}
            onKpisChange={setKpis}
            onGraficosChange={setGraficos}
            onConfigStatusChange={handleConfigStatusChange}
          />
        )}
      </div>
    </div>
  );
}
