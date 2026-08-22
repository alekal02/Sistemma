import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiAlertCircle, FiChevronLeft, FiChevronRight, FiMaximize2, FiMinimize2,
  FiRefreshCw, FiSettings, FiTrendingUp,
} from 'react-icons/fi';
import servicoService from '../services/servicoService';
import { isRequestAborted } from '../services/abortableRequest';
import type {
  AnalisePesoColeta,
  CompararPorTipoResponse,
  CompararPorTipoServico,
  FiltrosComparacao,
  EvolucaoOperacionalResponse,
} from '../services/servicoService';
import CompararPorTipo from './CompararPorTipo';
import EvolucaoDiariaTv from './EvolucaoDiariaTv';
import EvolucaoDiariaErrorBoundary from './EvolucaoDiariaErrorBoundary';
import {
  buildPeriodosPorContratoQuery,
  calcularCicloMensalContrato,
  deslocarMesReferencia,
  inferirMesReferenciaAtual,
  inferirMesReferenciaDeData,
  mesInputParaReferencia,
  normalizarDiaInicioCiclo,
  referenciaParaMesInput,
  type PeriodoContratoState,
} from '../utils/periodoCicloContrato';
import { fmtIntPeso, fmtNumPeso, fmtPctPeso } from '../utils/analisePesoComparativoMetricas';

const POLL_MS = 60_000;
const GRAFICO_POLL_MS = 5 * 60_000;

const TIPOS_LABEL: Record<string, string> = {
  coleta_caminhao: 'Coleta com Caminhao',
  rocadeira: 'Rocada',
  poda: 'Poda',
  varricao: 'Varricao',
  pintura_meio_fio: 'Pintura',
  remocao: 'Remocao',
  capina: 'Capina',
  geral: 'Geral',
};

interface ServicoCatalogo {
  id: string;
  nome: string;
  contratoId: string;
  contratoNome: string;
  tipoServico?: string;
}

interface ContratoOpcao {
  id: string;
  nome: string;
  diaInicioCiclo?: number;
}

interface CompararPorTipoTvProps {
  contratos: ContratoOpcao[];
  servicosCatalogo?: ServicoCatalogo[];
  selecaoInicial?: string[];
  onSelecaoConsumida?: () => void;
  onAbrirContrato?: (contratoId: string) => void;
  /** Último upload conhecido — abre no ciclo dos dados, não no mês corrente. */
  dataReferenciaHint?: string | null;
}

function labelTipo(tipo: string): string {
  return TIPOS_LABEL[tipo] || tipo.replace(/_/g, ' ');
}

function fmtHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function labelMesRef(mesInput: string): string {
  const ref = mesInputParaReferencia(mesInput);
  if (!ref) return mesInput;
  const d = new Date(ref.ano, ref.mes - 1, 1);
  const txt = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function periodoMedicao(diaInicio: number, mes: number, ano: number): PeriodoContratoState {
  const ciclo = calcularCicloMensalContrato(ano, mes, diaInicio);
  return {
    modo: 'mediacao',
    mes,
    ano,
    dataInicio: ciclo.dataInicio,
    dataFim: ciclo.dataFim,
  };
}

function resumoFaixas(a: AnalisePesoColeta) {
  const pessimo = a.faixas?.[0]?.quantidade ?? 0;
  const ruim = a.faixas?.[1]?.quantidade ?? 0;
  const otimo = a.faixas?.[2]?.quantidade ?? 0;
  const excedido = a.faixas?.[3]?.quantidade ?? 0;
  const favoravel = otimo;
  const desfavoravel = pessimo + ruim + excedido;
  const total = favoravel + desfavoravel;
  return { pessimo, ruim, otimo, excedido, favoravel, desfavoravel, total };
}

function fmtCenarioCurto(a: AnalisePesoColeta): string {
  if (a.perdaTon < 0) return 'PERDA';
  if (a.perdaTon > 0) return 'SUPERÁVIT';
  return 'NEUTRO';
}

function fmtResultadoCurto(a: AnalisePesoColeta): string {
  const abs = fmtNumPeso(Math.abs(a.perdaTon), 2);
  if (a.perdaTon < 0) return `−${abs} t`;
  if (a.perdaTon > 0) return `+${abs} t`;
  return `${abs} t`;
}

/** Eficiência = peso médio / peso ideal × 100 */
function fmtEficiencia(a: AnalisePesoColeta): string {
  const ideal = a.mediaIdealKg > 0 ? a.mediaIdealKg : (a.caixaMediaKg * a.densidadeOtima);
  if (!ideal || ideal <= 0 || !(a.pesoMedioKg > 0)) return '—';
  return `${fmtPctPeso((a.pesoMedioKg / ideal) * 100)}`;
}

function mesInicialTv(contratos: ContratoOpcao[], dataReferenciaHint?: string | null): string {
  const dia = normalizarDiaInicioCiclo(contratos[0]?.diaInicioCiclo);
  const iso = dataReferenciaHint?.slice(0, 10);
  const ref = iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? inferirMesReferenciaDeData(iso, dia)
    : inferirMesReferenciaAtual(dia);
  return referenciaParaMesInput(ref.ano, ref.mes);
}

export default function CompararPorTipoTv({
  contratos,
  servicosCatalogo = [],
  selecaoInicial,
  onSelecaoConsumida,
  onAbrirContrato,
  dataReferenciaHint = null,
}: CompararPorTipoTvProps) {
  const [modoAnalitico, setModoAnalitico] = useState(false);
  const [tipoServico, setTipoServico] = useState('');
  const [dados, setDados] = useState<CompararPorTipoResponse | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState('');
  const [ultimoRefresh, setUltimoRefresh] = useState<Date | null>(null);
  const [modoTvFullscreen, setModoTvFullscreen] = useState(false);
  const [modoGrafico3d, setModoGrafico3d] = useState(false);
  const [dados3d, setDados3d] = useState<EvolucaoOperacionalResponse | null>(null);
  const [carregando3d, setCarregando3d] = useState(false);
  const [atualizando3d, setAtualizando3d] = useState(false);
  const [erro3d, setErro3d] = useState('');
  const [ultimoRefresh3d, setUltimoRefresh3d] = useState<Date | null>(null);
  const [medicaoRef, setMedicaoRef] = useState(() => mesInicialTv(contratos, dataReferenciaHint));
  const emVoo = useRef(false);
  const emVoo3d = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const tiposFromCatalogo = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of servicosCatalogo) {
      const t = s.tipoServico || 'geral';
      map.set(t, (map.get(t) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([tipo, qtd]) => ({ tipo, label: labelTipo(tipo), qtd }))
      .sort((a, b) => {
        if (a.tipo === 'coleta_caminhao') return -1;
        if (b.tipo === 'coleta_caminhao') return 1;
        return b.qtd - a.qtd || a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [servicosCatalogo]);

  useEffect(() => {
    if (tipoServico || tiposFromCatalogo.length === 0) return;
    const coleta = tiposFromCatalogo.find(t => t.tipo === 'coleta_caminhao');
    setTipoServico(coleta?.tipo || tiposFromCatalogo[0].tipo);
  }, [tiposFromCatalogo, tipoServico]);

  useEffect(() => {
    if (selecaoInicial && selecaoInicial.length >= 2) {
      setModoAnalitico(true);
    }
  }, [selecaoInicial]);

  const ehColeta = tipoServico === 'coleta_caminhao';

  const carregar = useCallback(async (silencioso = false) => {
    if (!tipoServico || emVoo.current) return;
    emVoo.current = true;
    if (silencioso) setAtualizando(true);
    else {
      setCarregando(true);
      setErro('');
    }
    try {
      const tentarMes = async (mesInput: string) => {
        const ref = mesInputParaReferencia(mesInput);
        if (!ref) return null;
        const periodos: Record<string, PeriodoContratoState> = {};
        const ids = contratos.length
          ? contratos.map(c => c.id)
          : [...new Set(servicosCatalogo.map(s => s.contratoId))];
        for (const cid of ids) {
          const contrato = contratos.find(c => c.id === cid);
          const dia = normalizarDiaInicioCiclo(contrato?.diaInicioCiclo);
          periodos[cid] = periodoMedicao(dia, ref.mes, ref.ano);
        }
        const query = buildPeriodosPorContratoQuery(periodos);
        const filtros: FiltrosComparacao = ehColeta
          ? (Object.keys(query).length > 0
            ? { periodosPorContrato: query }
            : { mesReferencia: ref.mes, anoReferencia: ref.ano })
          : { perfil: 'tv', mesReferencia: ref.mes, anoReferencia: ref.ano };
        return servicoService.compararGlobal(tipoServico, [], filtros);
      };

      let mesUsado = medicaoRef;
      let res = await tentarMes(mesUsado);

      // Coleta sem peso: tenta até 5 ciclos anteriores (ex.: dados em junho, hoje agosto)
      if (ehColeta && res && !res.servicos.some(s => s.analisePeso)) {
        let ref = mesInputParaReferencia(mesUsado);
        for (let i = 0; i < 5 && ref; i++) {
          const prev = deslocarMesReferencia(ref.mes, ref.ano, -1);
          const prevInput = referenciaParaMesInput(prev.ano, prev.mes);
          const tentativa = await tentarMes(prevInput);
          if (tentativa?.servicos.some(s => s.analisePeso)) {
            res = tentativa;
            mesUsado = prevInput;
            setMedicaoRef(prevInput);
            break;
          }
          ref = prev;
        }
      }

      if (!res) {
        setErro('Erro ao carregar comparacao');
        setDados(null);
        return;
      }

      setDados(res);
      setUltimoRefresh(new Date());
      if (res.mensagem && res.servicos.length < 2) {
        setErro(res.mensagem);
      } else if (ehColeta && !res.servicos.some(s => s.analisePeso)) {
        setErro('Sem análise de peso neste ciclo. Use as setas para mudar o mês de medição.');
      } else {
        setErro('');
      }
    } catch (err) {
      if (isRequestAborted(err)) return;
      if (!silencioso) {
        setErro('Erro ao carregar comparacao');
        setDados(null);
      }
    } finally {
      emVoo.current = false;
      setCarregando(false);
      setAtualizando(false);
    }
  }, [tipoServico, ehColeta, medicaoRef, contratos, servicosCatalogo]);

  const periodosPorContrato = useMemo(() => {
    const ref = mesInputParaReferencia(medicaoRef);
    const map: Record<string, { dataInicio: string; dataFim: string }> = {};
    if (ref) {
      for (const c of contratos) {
        const ciclo = calcularCicloMensalContrato(
          ref.ano,
          ref.mes,
          normalizarDiaInicioCiclo(c.diaInicioCiclo),
        );
        map[c.id] = { dataInicio: ciclo.dataInicio, dataFim: ciclo.dataFim };
      }
    }
    for (const s of dados?.servicos || []) {
      if (s.contratoId && s.periodo?.dataInicio && s.periodo?.dataFim) {
        map[s.contratoId] = { dataInicio: s.periodo.dataInicio, dataFim: s.periodo.dataFim };
      }
    }
    return map;
  }, [contratos, medicaoRef, dados?.servicos]);

  const carregar3d = useCallback(async (silencioso = false) => {
    if (!ehColeta || !modoGrafico3d || emVoo3d.current) return;
    const ids = (dados?.servicos || [])
      .filter((s) => s.analisePeso)
      .map((s) => s.id);
    if (ids.length === 0) return;

    emVoo3d.current = true;
    if (silencioso) setAtualizando3d(true);
    else {
      setCarregando3d(true);
      setErro3d('');
    }
    try {
      const periodos = Object.values(periodosPorContrato);
      let dataInicio = periodos[0]?.dataInicio;
      let dataFim = periodos[0]?.dataFim;
      for (const p of periodos) {
        if (p.dataInicio && (!dataInicio || p.dataInicio < dataInicio)) dataInicio = p.dataInicio;
        if (p.dataFim && (!dataFim || p.dataFim > dataFim)) dataFim = p.dataFim;
      }
      for (const s of dados?.servicos || []) {
        if (!s.periodo) continue;
        if (!dataInicio || s.periodo.dataInicio < dataInicio) dataInicio = s.periodo.dataInicio;
        if (!dataFim || s.periodo.dataFim > dataFim) dataFim = s.periodo.dataFim;
      }
      if (!dataInicio || !dataFim) return;
      let res: EvolucaoOperacionalResponse;
      try {
        res = await servicoService.getEvolucaoOperacional({
          servicoIds: ids,
          dataInicio,
          dataFim,
          tipoServico: 'coleta_caminhao',
        });
      } catch (errPrimario) {
        // Fallback: mantém pelo menos o gráfico de peso ideal se a série completa falhar
        if (isRequestAborted(errPrimario)) throw errPrimario;
        const legado = await servicoService.getQualidadeIdeal3d({
          servicoIds: ids,
          dataInicio,
          dataFim,
          tipoServico: 'coleta_caminhao',
        });
        res = {
          tipoServico: legado.tipoServico,
          tipoServicoLabel: legado.tipoServicoLabel,
          dataInicio: legado.dataInicio,
          dataFim: legado.dataFim,
          dias: legado.dias || [],
          series: [{
            id: 'peso_ideal',
            label: 'Qualidade vs peso ideal',
            descricao: 'Aderência ao peso ideal por viagem',
            faixas: [
              { id: 'otimo', label: 'Ótimo', cor: '#22c55e', regra: '90–110% do ideal' },
              { id: 'ruim', label: 'Ruim', cor: '#facc15', regra: '50–90% do ideal' },
              { id: 'pessimo', label: 'Péssimo', cor: '#ef4444', regra: 'abaixo de 50%' },
              { id: 'excedido', label: 'Excedido', cor: '#a855f7', regra: 'acima de 110%' },
            ],
            totalPontos: legado.totalPontos,
            totalViagens: legado.totalViagens,
            pontos: (legado.pontos || []).map((p) => ({
              data: p.data,
              rota: p.rota,
              viagens: p.viagens,
              faixaDominante: p.faixaDominante,
              faixas: p.faixas as Record<string, number>,
              servicoId: p.servicoId,
              servicoNome: p.servicoNome,
              contratoId: p.contratoId,
              contratoNome: p.contratoNome,
            })),
          }],
        };
      }
      if (!res || !Array.isArray(res.series)) {
        throw new Error('Resposta inválida da evolução operacional');
      }
      setDados3d(res);
      setUltimoRefresh3d(new Date());
      setErro3d('');
    } catch (err) {
      if (isRequestAborted(err)) return;
      if (!silencioso) setErro3d('Erro ao carregar evolução diária');
    } finally {
      emVoo3d.current = false;
      setCarregando3d(false);
      setAtualizando3d(false);
    }
  }, [ehColeta, modoGrafico3d, dados, periodosPorContrato]);

  useEffect(() => {
    if (modoAnalitico || !tipoServico) return;
    void carregar(false);
  }, [tipoServico, modoAnalitico, medicaoRef, carregar]);

  useEffect(() => {
    if (!modoGrafico3d || !ehColeta) return;
    void carregar3d(false);
  }, [modoGrafico3d, ehColeta, medicaoRef, dados?.servicos, carregar3d]);

  useEffect(() => {
    if (modoAnalitico || !tipoServico) return;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void carregar(true);
    };
    const id = window.setInterval(tick, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void carregar(true);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tipoServico, modoAnalitico, carregar]);

  // O gráfico atualiza sozinho a cada 5 min. Quando chega uma nova
  // planilha/dia, o endpoint é consultado novamente e o eixo X se recompõe.
  useEffect(() => {
    if (!modoGrafico3d || !ehColeta) return;
    const atualizar = () => {
      if (document.visibilityState === 'visible') void carregar3d(true);
    };
    const id = window.setInterval(atualizar, GRAFICO_POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void carregar3d(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [modoGrafico3d, ehColeta, carregar3d]);

  useEffect(() => {
    if (!modoTvFullscreen && !modoGrafico3d) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (modoGrafico3d) setModoGrafico3d(false);
      else setModoTvFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modoTvFullscreen, modoGrafico3d]);

  const deslocarMes = (delta: number) => {
    const ref = mesInputParaReferencia(medicaoRef);
    if (!ref) return;
    const next = deslocarMesReferencia(ref.mes, ref.ano, delta);
    setMedicaoRef(referenciaParaMesInput(next.ano, next.mes));
  };

  const servicosComPeso = useMemo(
    () => (dados?.servicos || []).filter((s): s is CompararPorTipoServico & { analisePeso: AnalisePesoColeta } => !!s.analisePeso),
    [dados],
  );

  const temAnalisePeso = ehColeta && servicosComPeso.length > 0;

  if (modoAnalitico) {
    return (
      <div className="vg-tv-wrap">
        <div className="vg-tv-toolbar analitico">
          <button type="button" className="btn btn-sm btn-secondary" onClick={() => setModoAnalitico(false)}>
            Voltar ao painel TV
          </button>
        </div>
        <CompararPorTipo
          contratos={contratos}
          servicosCatalogo={servicosCatalogo}
          selecaoInicial={selecaoInicial}
          onSelecaoConsumida={onSelecaoConsumida}
        />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={
        'vg-tv-wrap'
        + (modoTvFullscreen ? ' vg-tv-fullscreen' : '')
        + (ehColeta ? ' vg-tv-modo-peso' : '')
      }
    >
      <div className="vg-tv-header">
        <div className="vg-tv-header-left">
          <h3 className="vg-tv-titulo">
            {ehColeta
              ? 'Comparativo de análise de peso'
              : `Comparativo · ${dados?.tipoServicoLabel || labelTipo(tipoServico) || '…'}`}
          </h3>
          <div className="vg-tv-meta">
            <span>Medição: {labelMesRef(medicaoRef)}</span>
            <span>
              {dados?.resumo?.totalContratos ?? '—'} contratos · {servicosComPeso.length || dados?.resumo?.totalServicos || '—'} serviços
            </span>
            {ultimoRefresh && (
              <span className={'vg-tv-live' + (atualizando ? ' pulse' : '')}>
                Atualizado às {fmtHora(ultimoRefresh)}
                {atualizando ? ' · sync…' : ' · auto 60s'}
              </span>
            )}
          </div>
        </div>
        <div className="vg-tv-header-right">
          <div className="vg-tv-mes-nav" role="group" aria-label="Mês de medição">
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => deslocarMes(-1)} title="Ciclo anterior">
              <FiChevronLeft size={14} />
            </button>
            <span className="vg-tv-mes-label">{labelMesRef(medicaoRef)}</span>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => deslocarMes(1)} title="Próximo ciclo">
              <FiChevronRight size={14} />
            </button>
          </div>
          <select
            className="filtro-input vg-tv-tipo"
            value={tipoServico}
            onChange={e => setTipoServico(e.target.value)}
            aria-label="Tipo de serviço"
          >
            {tiposFromCatalogo.map(t => (
              <option key={t.tipo} value={t.tipo}>{t.label} ({t.qtd})</option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => void carregar(false)}
            disabled={carregando || atualizando}
            title="Atualizar agora"
          >
            <FiRefreshCw size={14} className={carregando || atualizando ? 'spin' : ''} />
          </button>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setModoTvFullscreen(v => !v)}
            title={modoTvFullscreen ? 'Sair do modo TV' : 'Modo TV tela cheia'}
          >
            {modoTvFullscreen ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
            {modoTvFullscreen ? ' Sair TV' : ' Modo TV'}
          </button>
          {ehColeta && (
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setModoGrafico3d(true)}
              disabled={!temAnalisePeso}
              title="Viagens por dia · peso ideal, tempo TOCO/TRUCADO/MINI, velocidade, km/t e HR/t"
            >
              <FiTrendingUp size={14} /> Evolução Diária
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => setModoAnalitico(true)}
            title="Comparativo de análise de peso, filtros e tabela detalhada"
          >
            <FiSettings size={14} /> Analítico
          </button>
        </div>
      </div>

      {modoGrafico3d && (
        <EvolucaoDiariaErrorBoundary onFechar={() => setModoGrafico3d(false)}>
          <EvolucaoDiariaTv
            dados={dados3d}
            carregando={carregando3d}
            atualizando={atualizando3d}
            atualizadoEm={ultimoRefresh3d}
            erro={erro3d}
            cicloLabel={labelMesRef(medicaoRef)}
            periodosPorContrato={periodosPorContrato}
            onCicloAnterior={() => deslocarMes(-1)}
            onCicloProximo={() => deslocarMes(1)}
            onFechar={() => setModoGrafico3d(false)}
            onAtualizar={() => void carregar3d(false)}
          />
        </EvolucaoDiariaErrorBoundary>
      )}

      {erro && !carregando && (
        <div className="vg-tv-empty">
          <FiAlertCircle size={32} />
          <p>{erro}</p>
        </div>
      )}

      {carregando && !dados && (
        <div className="vg-tv-grid">
          {[1, 2].map(i => (
            <div key={i} className="skeleton vg-tv-card-skel" />
          ))}
        </div>
      )}

      {/* Coleta: cards resumo + painel completo de análise de peso */}
      {!carregando && dados && ehColeta && temAnalisePeso && (
        <>
          <div className="vg-tv-peso-resumo">
            {servicosComPeso.map((s) => {
              const a = s.analisePeso;
              const f = resumoFaixas(a);
              return (
                <div
                  key={s.id}
                  className={'vg-tv-peso-card' + (onAbrirContrato && s.contratoId ? ' clicavel' : '')}
                  role={onAbrirContrato && s.contratoId ? 'button' : undefined}
                  tabIndex={onAbrirContrato && s.contratoId ? 0 : undefined}
                  onClick={() => { if (s.contratoId) onAbrirContrato?.(s.contratoId); }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && s.contratoId) {
                      e.preventDefault();
                      onAbrirContrato?.(s.contratoId);
                    }
                  }}
                  title={onAbrirContrato ? 'Abrir somente esta unidade' : undefined}
                >
                  <div className="vg-tv-peso-card-head">
                    <span className="vg-tv-peso-card-contrato">{s.contratoNome || '—'}</span>
                    <span className="vg-tv-peso-card-servico">{s.nome}</span>
                  </div>
                  <div className="vg-tv-peso-metrics">
                    <div className="vg-tv-peso-m">
                      <span className="lbl">Viagens</span>
                      <span className="val">{fmtIntPeso(a.numeroViagens)}</span>
                    </div>
                    <div className="vg-tv-peso-m">
                      <span className="lbl">Menor peso</span>
                      <span className="val">{a.rotaMinima ? `${fmtNumPeso(a.rotaMinima.pesoMedioKg, 0)} kg` : '—'}</span>
                      {a.rotaMinima && <span className="sub">{a.rotaMinima.nome}</span>}
                    </div>
                    <div className="vg-tv-peso-m">
                      <span className="lbl">Maior peso</span>
                      <span className="val">{a.rotaMaxima ? `${fmtNumPeso(a.rotaMaxima.pesoMedioKg, 0)} kg` : '—'}</span>
                      {a.rotaMaxima && <span className="sub">{a.rotaMaxima.nome}</span>}
                    </div>
                    <div className="vg-tv-peso-m">
                      <span className="lbl">Eficiência</span>
                      <span className="val">{fmtEficiencia(a)}</span>
                      <span className="sub">médio ÷ ideal</span>
                    </div>
                    <div className={'vg-tv-peso-m' + (a.perdaTon < 0 ? ' perda' : a.perdaTon > 0 ? ' ganho' : '')}>
                      <span className="lbl">{fmtCenarioCurto(a)}</span>
                      <span className="val">{fmtResultadoCurto(a)}</span>
                    </div>
                    <div className="vg-tv-peso-m ok">
                      <span className="lbl">Favoráveis</span>
                      <span className="val">{fmtIntPeso(f.favoravel)}</span>
                      <span className="sub">ótimo {f.total > 0 ? fmtPctPeso((f.favoravel / f.total) * 100) : '—'}</span>
                    </div>
                    <div className="vg-tv-peso-m ruim">
                      <span className="lbl">Desfavoráveis</span>
                      <span className="val">{fmtIntPeso(f.desfavoravel)}</span>
                      <span className="sub">péssimo {f.pessimo} · ruim {f.ruim} · exced. {f.excedido}</span>
                    </div>
                    <div className="vg-tv-peso-m">
                      <span className="lbl">Frota</span>
                      <span className="val frota">
                        M{fmtIntPeso(a.tiposCaminhao.MINI)} · T{fmtIntPeso(a.tiposCaminhao.TOCO)} · Tk{fmtIntPeso(a.tiposCaminhao.TRUCK)}
                      </span>
                      <span className="sub">{fmtIntPeso(a.caminhoesUnicos)} placas</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
