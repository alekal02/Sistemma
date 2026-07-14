import { memo, useState, useEffect, useCallback, useMemo } from 'react';
import { FiActivity, FiDatabase, FiX } from 'react-icons/fi';
import { useToast } from '../../contexts/ToastContext';
import contractService from '../../services/contractService';
import servicoService from '../../services/servicoService';
import ExecutivoCicloSelector from '../ExecutivoCicloSelector';
import GoogleFilterBar from '../GoogleFilterBar';
import {
  inferirMesReferenciaAtual,
} from '../../utils/periodoCicloContrato';
import {
  STORAGE_EXECUTIVO_CONTRATO,
  STORAGE_EXECUTIVO_SERVICO,
} from './dashboardUtils';
import type { DashboardFiltrosState, ContratoOpcao, ServicoOpcao } from './dashboardTypes';
import type { useGoogleFilters } from '../../hooks/useGoogleFilters';

export interface DashboardFiltrosProps {
  carregando: boolean;
  filtrosGA: ReturnType<typeof useGoogleFilters>;
  periodoExibicao: {
    preset: 'personalizado';
    dataInicio: string;
    dataFim: string;
    label: string;
  };
  onFiltrosChange: (filtros: DashboardFiltrosState) => void;
  onRefresh: () => void;
  onReadyChange?: (ready: boolean) => void;
}

const DashboardFiltros = memo(function DashboardFiltros({
  carregando,
  filtrosGA,
  periodoExibicao,
  onFiltrosChange,
  onRefresh,
  onReadyChange,
}: DashboardFiltrosProps) {
  const { adicionarToast } = useToast();

  const [contratos, setContratos] = useState<ContratoOpcao[]>([]);
  const [servicos, setServicos] = useState<ServicoOpcao[]>([]);
  const [contratoId, setContratoId] = useState('');
  const [servicoId, setServicoId] = useState('');
  const [carregandoContratos, setCarregandoContratos] = useState(true);
  const refCicloInicial = useMemo(() => inferirMesReferenciaAtual(1), []);
  const [diaInicioCiclo, setDiaInicioCiclo] = useState(1);
  const [mesRef, setMesRef] = useState(refCicloInicial.mes);
  const [anoRef, setAnoRef] = useState(refCicloInicial.ano);

  const emitirFiltros = useCallback((
    cId: string,
    sId: string,
    mes: number,
    ano: number,
    dia: number,
    cLabel?: string,
    sLabel?: string,
  ) => {
    onFiltrosChange({
      contratoId: cId,
      servicoId: sId,
      mesRef: mes,
      anoRef: ano,
      diaInicioCiclo: dia,
      contratoLabel: cLabel,
      servicoLabel: sLabel,
    });
  }, [onFiltrosChange]);

  useEffect(() => {
    (async () => {
      try {
        const lista = await contractService.listar();
        setContratos(lista);
        const salvo = localStorage.getItem(STORAGE_EXECUTIVO_CONTRATO) || '';
        if (salvo && lista.some(c => c.id === salvo)) {
          setContratoId(salvo);
        }
      } catch {
        adicionarToast('Erro ao carregar lista de contratos', 'error');
      } finally {
        setCarregandoContratos(false);
        onReadyChange?.(true);
      }
    })();
  }, [adicionarToast, onReadyChange]);

  useEffect(() => {
    if (!contratoId) {
      setServicos([]);
      setServicoId('');
      return;
    }
    (async () => {
      try {
        const lista = await servicoService.listarServicosContrato(contratoId);
        setServicos(lista);
        const salvo = localStorage.getItem(STORAGE_EXECUTIVO_SERVICO) || '';
        if (salvo && lista.some(s => s.id === salvo)) {
          setServicoId(salvo);
        } else {
          setServicoId('');
        }
      } catch {
        setServicos([]);
        setServicoId('');
      }
    })();
  }, [contratoId]);

  const handleContratoChange = useCallback((id: string) => {
    setContratoId(id);
    setServicoId('');
    try {
      if (id) localStorage.setItem(STORAGE_EXECUTIVO_CONTRATO, id);
      else localStorage.removeItem(STORAGE_EXECUTIVO_CONTRATO);
      localStorage.removeItem(STORAGE_EXECUTIVO_SERVICO);
    } catch { /* storage indisponível */ }
  }, []);

  const handleServicoChange = useCallback((id: string) => {
    setServicoId(id);
    try {
      if (id) localStorage.setItem(STORAGE_EXECUTIVO_SERVICO, id);
      else localStorage.removeItem(STORAGE_EXECUTIVO_SERVICO);
    } catch { /* storage indisponível */ }
  }, []);

  useEffect(() => {
    if (carregandoContratos || contratoId || contratos.length === 0) return;
    handleContratoChange(contratos[0].id);
  }, [carregandoContratos, contratoId, contratos, handleContratoChange]);

  useEffect(() => {
    if (!contratoId) {
      setDiaInicioCiclo(1);
      const ref = inferirMesReferenciaAtual(1);
      setMesRef(ref.mes);
      setAnoRef(ref.ano);
      return;
    }
    contractService.buscar(contratoId)
      .then((c) => {
        const dia = c.diaInicioCiclo ?? 1;
        setDiaInicioCiclo(dia);
        const ref = inferirMesReferenciaAtual(dia);
        setMesRef(ref.mes);
        setAnoRef(ref.ano);
      })
      .catch(() => {
        setDiaInicioCiclo(1);
      });
  }, [contratoId]);

  const contratoSelecionado = useMemo(
    () => contratos.find(c => c.id === contratoId),
    [contratos, contratoId],
  );

  const servicoSelecionado = useMemo(
    () => servicos.find(s => s.id === servicoId),
    [servicos, servicoId],
  );

  useEffect(() => {
    if (carregandoContratos) return;
    if (contratos.length > 0 && !contratoId) return;
    emitirFiltros(
      contratoId,
      servicoId,
      mesRef,
      anoRef,
      diaInicioCiclo,
      contratoSelecionado?.numeroContrato,
      servicoSelecionado?.nome,
    );
  }, [
    carregandoContratos,
    contratoId,
    contratos.length,
    servicoId,
    mesRef,
    anoRef,
    diaInicioCiclo,
    emitirFiltros,
    contratoSelecionado?.numeroContrato,
    servicoSelecionado?.nome,
  ]);

  const handleCicloChange = useCallback((mes: number, ano: number) => {
    setMesRef(mes);
    setAnoRef(ano);
  }, []);

  return (
    <>
      <div className="exec-filtros-bar exec-contexto-bar">
        <div className="exec-filtro-group exec-filtro-contrato">
          <label><FiDatabase size={10} style={{ marginRight: 4 }} />Contrato</label>
          <select
            value={contratoId}
            disabled={carregandoContratos}
            onChange={e => handleContratoChange(e.target.value)}
          >
            <option value="">Todos os contratos</option>
            {contratos.map(c => (
              <option key={c.id} value={c.id}>{c.numeroContrato}</option>
            ))}
          </select>
        </div>

        <div className="exec-filtro-group exec-filtro-servico">
          <label><FiActivity size={10} style={{ marginRight: 4 }} />Serviço</label>
          <select
            value={servicoId}
            disabled={!contratoId || servicos.length === 0}
            onChange={e => handleServicoChange(e.target.value)}
          >
            <option value="">
              {!contratoId
                ? 'Selecione um contrato'
                : servicos.length === 0
                  ? 'Nenhum serviço'
                  : 'Todos os serviços do contrato'}
            </option>
            {servicos.map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </div>

        <div className="exec-contexto-resumo">
          <span className="exec-contexto-badge">
            {servicoSelecionado
              ? `${contratoSelecionado?.numeroContrato || 'Contrato'} → ${servicoSelecionado.nome}`
              : contratoSelecionado
                ? `Contrato: ${contratoSelecionado.numeroContrato}`
                : 'Visão consolidada (todos os contratos)'}
          </span>
          {(contratoId || servicoId) && (
            <button
              type="button"
              className="exec-contexto-limpar"
              onClick={() => handleContratoChange('')}
            >
              <FiX size={12} /> Limpar
            </button>
          )}
        </div>
      </div>

      <ExecutivoCicloSelector
        diaInicioCiclo={diaInicioCiclo}
        mes={mesRef}
        ano={anoRef}
        onChange={handleCicloChange}
        disabled={carregando}
      />

      <GoogleFilterBar
        periodo={periodoExibicao}
        comparacao={filtrosGA.comparacao}
        dimensoes={filtrosGA.dimensoes}
        totalRegistros={filtrosGA.totalRegistros}
        totalFiltrado={filtrosGA.totalFiltrado}
        variacaoPeriodo={filtrosGA.variacaoPeriodo}
        carregando={carregando}
        omitirSeletorPeriodo
        onSetPeriodo={filtrosGA.setPeriodo}
        onToggleComparacao={filtrosGA.toggleComparacao}
        onAdicionarFiltro={filtrosGA.adicionarFiltro}
        onRemoverFiltro={filtrosGA.removerFiltro}
        onLimparDimensao={filtrosGA.limparDimensao}
        onLimparTodos={() => {
          filtrosGA.limparTodos();
          onRefresh();
        }}
        onRefresh={onRefresh}
      />
    </>
  );
});

export default DashboardFiltros;
