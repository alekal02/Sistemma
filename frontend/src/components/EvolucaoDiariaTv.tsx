/**
 * Evolucao diaria da operacao — leitura executiva (diretoria).
 * Janela movel com um mini-grafico por contrato; seletor de metrica
 * (peso ideal, tempo TOCO/TRUCADO/MINI, velocidade, km/t, HR/t).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { FiX, FiRefreshCw, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DefFaixaEvolucao,
  EvolucaoOperacionalResponse,
  MetricaEvolucaoId,
  SerieEvolucaoOperacional,
} from '../services/servicoService';
import { listarDatasIntervalo } from '../utils/periodoCicloContrato';

const JANELAS = [
  { valor: 7, label: 'Última semana' },
  { valor: 15, label: 'Últimos 15 dias' },
  { valor: 0, label: 'Por ciclo' },
];

const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

type Contagem = Record<string, number>;

interface LinhaDia {
  data: string;
  dia: string;
  labelEixo: string;
  viagens: number;
  valores: Record<string, number | null>;
}

interface BlocoContrato {
  id: string;
  contratoId?: string;
  nome: string;
  linhas: LinhaDia[];
  total: Contagem;
  viagens: number;
  caixaMediaL?: number;
  cicloInicio: string;
  cicloFim: string;
}

function diaDaSemana(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return '';
  return DIAS_SEMANA[new Date(y, m - 1, d, 12).getDay()] || '';
}

function fmtDataBr(iso: string): string {
  const [, m, d] = iso.split('-');
  return m && d ? `${d}/${m}` : iso;
}

function fmtEixoX(iso: string): string {
  const semana = diaDaSemana(iso);
  const data = fmtDataBr(iso);
  return semana ? `${semana} ${data}` : data;
}

function fmtInt(n: number): string {
  return Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function layoutGrade(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 8) return { cols: 4, rows: 2 };
  if (n <= 9) return { cols: 3, rows: 3 };
  if (n <= 12) return { cols: 4, rows: 3 };
  return { cols: 4, rows: Math.ceil(n / 4) };
}

function zerado(faixas: DefFaixaEvolucao[]): Contagem {
  return Object.fromEntries(faixas.map((f) => [f.id, 0]));
}

function contagemFaixas(
  p: { faixas?: Contagem; faixaDominante?: string; viagens: number },
  faixas: DefFaixaEvolucao[],
): Contagem {
  const base = zerado(faixas);
  if (p.faixas) {
    for (const f of faixas) {
      base[f.id] = Number(p.faixas[f.id]) || 0;
    }
    return base;
  }
  if (p.faixaDominante && base[p.faixaDominante] !== undefined) {
    base[p.faixaDominante] = p.viagens || 0;
  }
  return base;
}

function montarLinhas(
  porDia: Map<string, Contagem>,
  dias: string[],
  faixas: DefFaixaEvolucao[],
): LinhaDia[] {
  return dias.map((data) => {
    const c = porDia.get(data);
    const viagens = c ? faixas.reduce((s, f) => s + (c[f.id] || 0), 0) : 0;
    const base = { data, dia: fmtDataBr(data), labelEixo: fmtEixoX(data) };
    if (!c || viagens === 0) {
      return {
        ...base,
        viagens: 0,
        valores: Object.fromEntries(faixas.map((f) => [f.id, null])),
      };
    }
    const pct = (n: number) => Math.round((n / viagens) * 1000) / 10;
    return {
      ...base,
      viagens,
      valores: Object.fromEntries(faixas.map((f) => [f.id, pct(c[f.id] || 0)])),
    };
  });
}

function TooltipDia({
  active,
  payload,
  faixas,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Record<string, unknown> }>;
  faixas: DefFaixaEvolucao[];
}) {
  const raw = active ? payload?.[0]?.payload : null;
  if (!raw) return null;
  const data = String(raw.data || '');
  const dia = String(raw.dia || fmtDataBr(data));
  const viagens = Number(raw.viagens) || 0;
  const semana = diaDaSemana(data);
  const titulo = semana ? `${semana}, ${dia}` : dia;
  const valores = (raw.valores && typeof raw.valores === 'object')
    ? raw.valores as Record<string, number | null>
    : null;

  if (viagens === 0) {
    return (
      <div className="vg-tv-ed-tooltip">
        <div className="t-dia">{titulo}</div>
        <div>Sem viagens</div>
      </div>
    );
  }
  return (
    <div className="vg-tv-ed-tooltip">
      <div className="t-dia">{titulo} · {fmtInt(viagens)} viagens</div>
      {faixas.map((f) => {
        const n = valores
          ? Number(valores[f.id] ?? 0)
          : Number(raw[f.id] ?? 0);
        return (
          <div key={f.id} className="t-linha">
            <i style={{ background: f.cor }} />
            {f.label}: <b>{(Number.isFinite(n) ? n : 0).toFixed(0)}%</b>
          </div>
        );
      })}
    </div>
  );
}

function intervaloEixoX(n: number): number {
  if (n <= 10) return 0;
  if (n <= 16) return 1;
  if (n <= 24) return 2;
  return Math.max(2, Math.ceil(n / 10) - 1);
}

function TickEixoX({ x, y, payload }: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const iso = String(payload?.value || '');
  const semana = diaDaSemana(iso);
  const data = fmtDataBr(iso);
  const [, mes, dia] = iso.split('-');
  const ehFimDeSemana = semana === 'sáb' || semana === 'dom';
  const cor = ehFimDeSemana ? '#fde68a' : '#f8fafc';
  const diaNum = dia ? String(Number(dia)).padStart(2, '0') : data;
  const mesNum = mes || '';
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <text textAnchor="middle" fill={cor} fontFamily="Segoe UI, sans-serif">
        <tspan x={0} dy="1.05em" fontSize={10} fontWeight={800} letterSpacing="0.02em">
          {semana || '—'}
        </tspan>
        <tspan x={0} dy="1.2em" fontSize={10} fontWeight={700} fill={ehFimDeSemana ? '#fef9c3' : '#cbd5e1'}>
          {mesNum ? `${diaNum}/${mesNum}` : diaNum}
        </tspan>
      </text>
    </g>
  );
}

/** Flatten valores.* into top-level keys for Recharts Line dataKey. */
function linhasParaChart(linhas: LinhaDia[], faixas: DefFaixaEvolucao[]) {
  return linhas.map((l) => {
    const row: Record<string, string | number | null> = {
      data: l.data,
      dia: l.dia,
      labelEixo: l.labelEixo,
      viagens: l.viagens,
    };
    for (const f of faixas) row[f.id] = l.valores[f.id];
    return row;
  });
}

function MiniGrafico({
  linhas,
  faixas,
}: {
  linhas: LinhaDia[];
  faixas: DefFaixaEvolucao[];
}) {
  const data = linhasParaChart(linhas, faixas);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="data"
          stroke="rgba(255,255,255,0.3)"
          tick={<TickEixoX />}
          tickLine={false}
          interval={intervaloEixoX(data.length)}
          minTickGap={18}
          height={36}
          padding={{ left: 10, right: 10 }}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tickFormatter={(v: number) => `${v}%`}
          stroke="rgba(255,255,255,0.3)"
          tick={{ fill: '#cbd5e1', fontSize: 9 }}
          tickLine={false}
          axisLine={false}
          width={30}
        />
        <Tooltip
          content={({ active, payload }) => (
            <TooltipDia active={active} payload={payload as Array<{ payload?: Record<string, unknown> }>} faixas={faixas} />
          )}
          cursor={{ stroke: 'rgba(255,255,255,0.35)' }}
        />
        {faixas.map((f, idx) => (
          <Line
            key={f.id}
            type="monotone"
            dataKey={f.id}
            name={f.label}
            stroke={f.cor}
            strokeWidth={idx === 0 ? 3 : 2}
            dot={{ r: 2, fill: f.cor, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function recortarJanela(dias: string[], janela: number): string[] {
  if (janela <= 0 || dias.length <= janela) return dias;
  return dias.slice(-janela);
}

export interface PeriodoCicloTv {
  dataInicio: string;
  dataFim: string;
}

export interface EvolucaoDiariaTvProps {
  dados: EvolucaoOperacionalResponse | null;
  carregando?: boolean;
  atualizando?: boolean;
  atualizadoEm?: Date | null;
  erro?: string;
  cicloLabel?: string;
  /** Ciclo real de cada contrato (início de medição pode ser dia 1, 21, …) */
  periodosPorContrato?: Record<string, PeriodoCicloTv>;
  onCicloAnterior?: () => void;
  onCicloProximo?: () => void;
  onFechar: () => void;
  onAtualizar?: () => void;
}

export default function EvolucaoDiariaTv({
  dados,
  carregando,
  atualizando,
  atualizadoEm,
  erro,
  cicloLabel,
  periodosPorContrato,
  onCicloAnterior,
  onCicloProximo,
  onFechar,
  onAtualizar,
}: EvolucaoDiariaTvProps) {
  const [janela, setJanela] = useState(0);
  const [contratoFiltro, setContratoFiltro] = useState('todos');
  const [metricaId, setMetricaId] = useState<MetricaEvolucaoId>('peso_ideal');

  const seriesDisponiveis = useMemo(() => {
    const lista = Array.isArray(dados?.series) ? dados!.series : [];
    return lista.filter((s) => (s.pontos?.length ?? 0) > 0 || s.id === 'peso_ideal');
  }, [dados?.series]);

  const serieAtiva: SerieEvolucaoOperacional | null = useMemo(() => {
    const encontrada = seriesDisponiveis.find((s) => s.id === metricaId);
    if (encontrada) return encontrada;
    return seriesDisponiveis[0] || null;
  }, [seriesDisponiveis, metricaId]);

  const faixas = useMemo(
    () => (Array.isArray(serieAtiva?.faixas) ? serieAtiva!.faixas : []),
    [serieAtiva],
  );

  const todosBlocos = useMemo(() => {
    if (!serieAtiva || !faixas.length) return [] as BlocoContrato[];
    const porContrato = new Map<string, {
      contratoId?: string;
      nome: string;
      porDia: Map<string, Contagem>;
      total: Contagem;
      caixaMediaL?: number;
    }>();

    for (const p of serieAtiva.pontos || []) {
      const cont = contagemFaixas(p, faixas);
      const contratoId = p.contratoId || undefined;
      const chave = contratoId || p.servicoId;
      let bloco = porContrato.get(chave);
      if (!bloco) {
        const nome = String(p.contratoNome || 'Contrato').trim() || 'Contrato';
        const servico = String(p.servicoNome || '').trim();
        bloco = {
          contratoId,
          nome: servico ? `${nome} · ${servico}` : nome,
          porDia: new Map(),
          total: zerado(faixas),
          caixaMediaL: p.caixaMediaL,
        };
        porContrato.set(chave, bloco);
      } else if (bloco.caixaMediaL == null && p.caixaMediaL != null) {
        bloco.caixaMediaL = p.caixaMediaL;
      }

      const doDia = bloco.porDia.get(p.data) || zerado(faixas);
      for (const f of faixas) {
        doDia[f.id] += cont[f.id] || 0;
        bloco.total[f.id] += cont[f.id] || 0;
      }
      bloco.porDia.set(p.data, doDia);
    }

    return [...porContrato.entries()]
      .map(([id, b]) => {
        const datasPontos = [...b.porDia.keys()].sort();
        const periodoCfg = b.contratoId ? periodosPorContrato?.[b.contratoId] : undefined;
        const cicloInicio = periodoCfg?.dataInicio || datasPontos[0] || '';
        const cicloFim = periodoCfg?.dataFim || datasPontos[datasPontos.length - 1] || '';
        const diasCiclo = (cicloInicio && cicloFim)
          ? listarDatasIntervalo(cicloInicio, cicloFim)
          : datasPontos;
        const diasEixo = recortarJanela(diasCiclo, janela);
        const totalJanela = zerado(faixas);
        for (const data of diasEixo) {
          const c = b.porDia.get(data);
          if (!c) continue;
          for (const f of faixas) totalJanela[f.id] += c[f.id] || 0;
        }
        return {
          id,
          contratoId: b.contratoId,
          nome: b.nome,
          linhas: montarLinhas(b.porDia, diasEixo, faixas),
          total: totalJanela,
          viagens: faixas.reduce((s, f) => s + (totalJanela[f.id] || 0), 0),
          caixaMediaL: b.caixaMediaL,
          cicloInicio: diasEixo[0] || cicloInicio,
          cicloFim: diasEixo[diasEixo.length - 1] || cicloFim,
        };
      })
      .filter((b) => b.viagens > 0)
      .sort((a, b) => b.viagens - a.viagens);
  }, [serieAtiva, faixas, janela, periodosPorContrato]);

  const filtroAtivo = useMemo(() => {
    if (contratoFiltro === 'todos') return 'todos';
    return todosBlocos.some((b) => b.id === contratoFiltro) ? contratoFiltro : 'todos';
  }, [contratoFiltro, todosBlocos]);

  const blocos = useMemo(
    () => (filtroAtivo === 'todos' ? todosBlocos : todosBlocos.filter((b) => b.id === filtroAtivo)),
    [todosBlocos, filtroAtivo],
  );

  const totalGeral = useMemo(() => {
    const total = zerado(faixas);
    for (const b of blocos) {
      for (const f of faixas) total[f.id] += b.total[f.id] || 0;
    }
    return total;
  }, [blocos, faixas]);

  const viagensGerais = useMemo(
    () => faixas.reduce((s, f) => s + (totalGeral[f.id] || 0), 0),
    [totalGeral, faixas],
  );

  const pctDe = (c: Contagem, id: string, viagens: number) =>
    viagens > 0 ? ((c[id] || 0) / viagens) * 100 : 0;

  const grade = useMemo(() => layoutGrade(blocos.length), [blocos.length]);

  const nomeFiltro = filtroAtivo === 'todos'
    ? (todosBlocos.length > 1 ? 'Todos os contratos' : (todosBlocos[0]?.nome || ''))
    : (todosBlocos.find((b) => b.id === filtroAtivo)?.nome || 'Contrato');

  const blocoFiltro = filtroAtivo === 'todos'
    ? null
    : todosBlocos.find((b) => b.id === filtroAtivo);

  const ciclosDistintos = filtroAtivo === 'todos' && todosBlocos.length > 1
    && new Set(todosBlocos.map((b) => `${b.cicloInicio}|${b.cicloFim}`)).size > 1;

  const periodoLabel = blocoFiltro
    ? `${fmtDataBr(blocoFiltro.cicloInicio)} a ${fmtDataBr(blocoFiltro.cicloFim)}`
    : ciclosDistintos
      ? 'ciclo completo de cada contrato'
      : (todosBlocos[0]?.cicloInicio
        ? `${fmtDataBr(todosBlocos[0].cicloInicio)} a ${fmtDataBr(todosBlocos[0].cicloFim)}`
        : '');

  const semDados = !carregando && todosBlocos.length === 0;
  const tituloMetrica = serieAtiva?.label || 'Evolução diária';

  return (
    <div className="vg-tv-ed-overlay" role="dialog" aria-label="Evolucao diaria da operacao">
      <div className="vg-tv-ed-panel">
        <div className="vg-tv-ed-toolbar">
          <div className="vg-tv-ed-title">
            <strong>Evolução diária · {tituloMetrica}</strong>
            <span>
              {nomeFiltro ? `${nomeFiltro} · ` : ''}
              {periodoLabel}
              {viagensGerais > 0 ? ` · ${fmtInt(viagensGerais)} viagens` : ''}
              {filtroAtivo === 'todos' && blocos.length > 1 ? ` · ${blocos.length} contratos` : ''}
            </span>
            {serieAtiva?.descricao && (
              <span className="vg-tv-ed-desc">{serieAtiva.descricao}</span>
            )}
            <span className={'vg-tv-ed-live' + (atualizando ? ' atualizando' : '')}>
              {atualizando
                ? 'Sincronizando novos dados…'
                : `Ao vivo · atualização automática a cada 5 min${atualizadoEm ? ` · ${atualizadoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}`}
            </span>
          </div>
          <div className="vg-tv-ed-actions">
            {(onCicloAnterior || onCicloProximo) && (
              <div className="vg-tv-ed-ciclo-nav" role="group" aria-label="Ciclo de medição">
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={onCicloAnterior}
                  disabled={!onCicloAnterior || carregando || atualizando}
                  title="Ciclo anterior"
                >
                  <FiChevronLeft size={14} />
                </button>
                <span className="vg-tv-ed-ciclo-label" title="Ciclo de medição">
                  {cicloLabel || 'Ciclo'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={onCicloProximo}
                  disabled={!onCicloProximo || carregando || atualizando}
                  title="Próximo ciclo"
                >
                  <FiChevronRight size={14} />
                </button>
              </div>
            )}
            <select
              className="filtro-input vg-tv-ed-select vg-tv-ed-select-metrica"
              value={serieAtiva?.id || metricaId}
              onChange={(e) => setMetricaId(e.target.value as MetricaEvolucaoId)}
              aria-label="Métrica do gráfico"
              title="Escolher gráfico"
            >
              {(dados?.series || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}{s.totalViagens > 0 ? '' : ' (sem dados)'}
                </option>
              ))}
            </select>
            <select
              className="filtro-input vg-tv-ed-select"
              value={janela}
              onChange={(e) => setJanela(Number(e.target.value))}
              aria-label="Janela de dias"
            >
              {JANELAS.map((j) => (
                <option key={j.valor} value={j.valor}>
                  {j.valor === 0 ? 'Ciclo completo' : j.label}
                </option>
              ))}
            </select>
            {todosBlocos.length > 1 && (
              <select
                className="filtro-input vg-tv-ed-select vg-tv-ed-select-contrato"
                value={filtroAtivo}
                onChange={(e) => {
                  const v = e.target.value;
                  setContratoFiltro(v);
                  if (v !== 'todos') setJanela(0);
                }}
                aria-label="Filtrar contrato"
              >
                <option value="todos">Todos os contratos</option>
                {todosBlocos.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            )}
            {onAtualizar && (
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={onAtualizar}
                disabled={carregando || atualizando}
                title="Atualizar agora"
              >
                <FiRefreshCw size={14} className={carregando || atualizando ? 'spin' : ''} />
              </button>
            )}
            <button type="button" className="btn btn-sm btn-secondary" onClick={onFechar} title="Fechar">
              <FiX size={16} /> Fechar
            </button>
          </div>
        </div>

        {erro && <div className="vg-tv-ed-msg erro">{erro}</div>}
        {carregando && !dados && <div className="vg-tv-ed-msg">Carregando evolução diária…</div>}
        {semDados && !erro && (
          <div className="vg-tv-ed-msg">
            Sem dados para “{tituloMetrica}” neste ciclo.
          </div>
        )}

        {blocos.length > 0 && faixas.length > 0 && (
          <>
            <div className="vg-tv-ed-chips">
              {faixas.map((f) => (
                <div key={f.id} className="vg-tv-ed-chip">
                  <i style={{ background: f.cor }} />
                  <span className="c-lbl">{f.label}</span>
                  <span className="c-val">{pctDe(totalGeral, f.id, viagensGerais).toFixed(0)}%</span>
                  <span className="c-regra">{f.regra}</span>
                </div>
              ))}
            </div>

            <div
              className="vg-tv-ed-grid"
              data-n={blocos.length}
              style={{
                '--ed-cols': grade.cols,
                '--ed-rows': grade.rows,
              } as CSSProperties}
            >
              {blocos.map((b) => (
                <div key={b.id} className="vg-tv-ed-cardg">
                  <div className="vg-tv-ed-cardg-head">
                    <span className="g-nome" title={b.nome}>{b.nome}</span>
                    <span className="g-viagens">
                      {b.cicloInicio && b.cicloFim
                        ? `${fmtDataBr(b.cicloInicio)} → ${fmtDataBr(b.cicloFim)} · `
                        : ''}
                      {fmtInt(b.viagens)} viagens
                      {serieAtiva?.id === 'tempo_encher' && b.caixaMediaL
                        ? ` · caixa ${fmtInt(b.caixaMediaL)} L`
                        : ''}
                    </span>
                  </div>
                  <div className="vg-tv-ed-minipct">
                    {faixas.map((f) => (
                      <span key={f.id} className="p-item">
                        <i style={{ background: f.cor }} />
                        {pctDe(b.total, f.id, b.viagens).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                  <div className="vg-tv-ed-mini">
                    <MiniGrafico linhas={b.linhas} faixas={faixas} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
