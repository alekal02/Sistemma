/**
 * Gráficos SVG leves — compartilhados entre relatório diário e detalhe do dia.
 */

export interface BarraDado {
  label: string;
  valor: number;
}

export interface PizzaDado {
  label: string;
  valor: number;
  pct: number;
}

const PALETA_PADRAO = [
  '#059669', '#f59e0b', '#a855f7', '#ef4444',
  '#3b82f6', '#06b6d4', '#ec4899', '#84cc16',
];

export function GraficoBarras({
  titulo,
  dados,
  cor,
  unidade = '',
  formato,
  formatoTooltip,
}: {
  titulo: string;
  dados: BarraDado[];
  cor: string;
  unidade?: string;
  formato: (v: number) => string;
  formatoTooltip?: (v: number) => string;
}) {
  if (!dados.length) return null;

  const SVG_W = 400;
  const SVG_H = 180;
  const MARGEM = { top: 10, right: 10, bottom: 40, left: 20 };
  const CHART_W = SVG_W - MARGEM.left - MARGEM.right;
  const CHART_H = SVG_H - MARGEM.top - MARGEM.bottom;
  const BAR_BASE_Y = MARGEM.top + CHART_H;

  const maxVal = Math.max(...dados.map(d => d.valor), 0.1);
  const barCount = Math.min(dados.length, 31);
  const barGap = barCount > 15 ? 1 : 2;
  const barW = Math.max(6, Math.min(22, (CHART_W - barGap * (barCount - 1)) / barCount));
  const startX = MARGEM.left + (CHART_W - (barCount * barW + (barCount - 1) * barGap)) / 2;
  const maxLabel = formatoTooltip ? formatoTooltip(maxVal) : formato(maxVal);

  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const y = BAR_BASE_Y - (i / 4) * CHART_H;
    gridLines.push(
      <line key={`grid-${i}`} x1={MARGEM.left} y1={y} x2={SVG_W - MARGEM.right} y2={y}
        stroke="#e2e8f0" strokeWidth="0.5" />,
    );
  }

  return (
    <div style={cardStyle}>
      <div style={tituloStyle}>
        <span>{titulo}</span>
        <span style={{ ...badgeStyle, color: cor, background: `${cor}15` }}>
          Max: {maxLabel}{unidade}
        </span>
      </div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        {gridLines}
        <line x1={MARGEM.left} y1={BAR_BASE_Y} x2={SVG_W - MARGEM.right} y2={BAR_BASE_Y}
          stroke="#cbd5e1" strokeWidth="1" />
        {dados.map((d, i) => {
          const h = (d.valor / maxVal) * CHART_H;
          const x = startX + i * (barW + barGap);
          const y = BAR_BASE_Y - h;
          const corOpaca = i === dados.length - 1 ? cor : `${cor}CC`;
          const fmt = formatoTooltip ?? formato;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={Math.max(h, 1)} fill={corOpaca} rx="2" opacity={0.85}>
                <title>{d.label}: {fmt(d.valor)}{unidade}</title>
              </rect>
              <text x={x + barW / 2} y={BAR_BASE_Y + 12} textAnchor="end"
                fontSize={barCount > 15 ? 6 : barCount > 10 ? 7 : 8} fill="#64748b"
                transform={`rotate(${barCount > 12 ? -40 : 0}, ${x + barW / 2}, ${BAR_BASE_Y + 12})`}>
                {d.label}
              </text>
              {barCount <= 10 && d.valor > maxVal * 0.05 && (
                <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="7" fontWeight="600" fill="#334155">
                  {fmt(d.valor)}
                </text>
              )}
            </g>
          );
        })}
        <text x={SVG_W - MARGEM.right} y={MARGEM.top + 4} textAnchor="end" fontSize="8" fontWeight="700" fill="#0f172a">
          Total: {formato(dados.reduce((s, d) => s + d.valor, 0))}{unidade}
        </text>
      </svg>
    </div>
  );
}

export function GraficoBarrasHorizontais({
  titulo,
  dados,
  cor,
  formato,
  maxItens = 8,
}: {
  titulo: string;
  dados: BarraDado[];
  cor: string;
  formato: (v: number) => string;
  maxItens?: number;
}) {
  const lista = dados.slice(0, maxItens);
  if (!lista.length) return null;

  const maxVal = Math.max(...lista.map(d => d.valor), 0.01);
  const SVG_W = 400;
  const rowH = 22;
  const SVG_H = 28 + lista.length * rowH;
  const labelW = 72;
  const chartX = labelW + 8;
  const chartW = SVG_W - chartX - 56;

  return (
    <div style={cardStyle}>
      <div style={{ ...tituloStyle, marginBottom: '0.35rem' }}>{titulo}</div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        {lista.map((d, i) => {
          const y = 24 + i * rowH;
          const barW = Math.max(2, (d.valor / maxVal) * chartW);
          const label = d.label.length > 9 ? d.label.slice(0, 9) + '…' : d.label;
          return (
            <g key={d.label + i}>
              <text x={labelW} y={y + 4} textAnchor="end" fontSize="8" fontWeight="600" fill="#475569">
                {label}
              </text>
              <rect x={chartX} y={y - 6} width={barW} height={12} fill={cor} rx="3" opacity={0.88}>
                <title>{d.label}: {formato(d.valor)}</title>
              </rect>
              <text x={chartX + barW + 4} y={y + 4} fontSize="7" fontWeight="700" fill="#065f46">
                {formato(d.valor)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function GraficoPizza({
  titulo,
  dados,
  paleta = PALETA_PADRAO,
  textoCentro,
  subtituloCentro = 'total',
  legendaValor,
}: {
  titulo: string;
  dados: PizzaDado[];
  paleta?: string[];
  textoCentro?: string;
  subtituloCentro?: string;
  legendaValor?: (valor: number, pct: number) => string;
}) {
  if (!dados.length) return null;

  const total = dados.reduce((s, d) => s + d.valor, 0);
  if (total <= 0) return null;

  const CX = 75;
  const CY = 80;
  const R = 50;
  const SW = 22;
  const CIRC = 2 * Math.PI * R;
  const SVG_W = 400;
  const SVG_H = 160;

  let accPct = 0;
  const segs = dados.map((d, i) => {
    const pct = d.valor / total;
    const dashLen = pct * CIRC;
    const dashOffset = -accPct * CIRC / 100;
    accPct += pct * 100;
    return { ...d, cor: paleta[i % paleta.length], dashLen, dashOffset, pct: pct * 100 };
  });

  const centro = textoCentro ?? total.toFixed(1);

  return (
    <div style={cardStyle}>
      <div style={{ ...tituloStyle, marginBottom: '0.25rem' }}>{titulo}</div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        <circle cx={CX} cy={CY} r={R} fill="#f1f5f9" stroke="#e2e8f0" strokeWidth={SW} />
        {segs.map((s, i) => (
          <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={s.cor} strokeWidth={SW}
            strokeDasharray={`${s.dashLen} ${CIRC}`} strokeDashoffset={s.dashOffset}
            transform={`rotate(-90, ${CX}, ${CY})`} opacity={0.85}>
            <title>{s.label}: {legendaValor ? legendaValor(s.valor, s.pct) : `${s.valor.toFixed(1)} (${s.pct.toFixed(0)}%)`}</title>
          </circle>
        ))}
        <text x={CX} y={CY - 3} textAnchor="middle" fontSize="11" fontWeight="800" fill="#1e293b">
          {centro}
        </text>
        <text x={CX} y={CY + 10} textAnchor="middle" fontSize="7" fill="#64748b">
          {subtituloCentro}
        </text>
        {segs.map((s, i) => {
          const col = Math.floor(i / 6);
          const row = i % 6;
          const x = 155 + col * 120;
          const y = 8 + row * 22;
          const legenda = legendaValor
            ? legendaValor(s.valor, s.pct)
            : `${s.valor.toFixed(1)} (${s.pct.toFixed(0)}%)`;
          return (
            <g key={i}>
              <rect x={x} y={y} width="8" height="8" rx="2" fill={s.cor} opacity="0.85" />
              <text x={x + 12} y={y + 7} fontSize="7" fill="#334155" fontWeight="600">
                {s.label.length > 10 ? s.label.slice(0, 10) + '…' : s.label}
              </text>
              <text x={x + 12} y={y + 14} fontSize="6.5" fill="#64748b">{legenda}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '10px',
  border: '1px solid #e2e8f0',
  padding: '0.75rem',
  boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
};

const tituloStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  color: '#334155',
  marginBottom: '0.5rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};

const badgeStyle: React.CSSProperties = {
  fontSize: '0.58rem',
  fontWeight: 600,
  padding: '0.08rem 0.45rem',
  borderRadius: '6px',
};

export interface LinhaReceitaPlacaGrafico {
  placa: string;
  viagens: number;
  toneladas: number;
  km: number;
  faturamento: number;
  receitaTon: number;
}

export interface LinhaOperacaoPlacaGrafico {
  placa: string;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  ehReserva?: boolean;
}

export interface LinhaDistritoRotaGrafico {
  distrito: string;
  viagens: number;
  toneladas: number;
  km: number;
}

/** Rotas por distrito — barra por KM, com viagens e toneladas no detalhe. */
export function GraficoRotasPorDistrito({
  titulo,
  linhas,
  formatoNum,
}: {
  titulo: string;
  linhas: LinhaDistritoRotaGrafico[];
  formatoNum: (v: number, dec?: number) => string;
}) {
  const lista = linhas.filter((l) => l.distrito !== '—' && (l.viagens > 0 || l.km > 0));
  if (!lista.length) return null;

  const usaKm = lista.some((l) => l.km > 0);
  const maxVal = Math.max(...lista.map((d) => (usaKm ? d.km : d.viagens)), 0.01);
  const SVG_W = 400;
  const rowH = 36;
  const headerH = 36;
  const SVG_H = headerH + lista.length * rowH + 8;
  const labelW = 82;
  const chartX = labelW + 6;
  const chartW = SVG_W - chartX - 62;
  const totalKm = lista.reduce((s, l) => s + l.km, 0);
  const totalViag = lista.reduce((s, l) => s + l.viagens, 0);

  return (
    <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
      <div style={tituloStyle}>
        <span>{titulo}</span>
        <span style={{ ...badgeStyle, color: '#0891b2', background: '#cffafe' }}>
          {formatoNum(totalKm, 0)} km · {formatoNum(totalViag, 0)} viag.
        </span>
      </div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        {lista.map((d, i) => {
          const y = headerH + i * rowH;
          const metrica = usaKm ? d.km : d.viagens;
          const barW = Math.max(3, (metrica / maxVal) * chartW);
          const pctKm = totalKm > 0 ? (d.km / totalKm) * 100 : 0;
          const detalhe = `${formatoNum(d.viagens, 0)} viag. · ${formatoNum(d.toneladas, 1)} t`;
          const lbl = d.distrito.length > 11 ? d.distrito.slice(0, 11) + '…' : d.distrito;
          return (
            <g key={d.distrito + i}>
              <text x={labelW} y={y + 6} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#1e293b">
                {lbl}
              </text>
              <text x={labelW} y={y + 16} textAnchor="end" fontSize="6.5" fill="#64748b">
                {formatoNum(pctKm, 1)}% km
              </text>
              <rect x={chartX} y={y - 2} width={barW} height={14} fill="#0891b2" rx="3" opacity={0.9}>
                <title>{d.distrito}: {formatoNum(d.km, 0)} km · {detalhe}</title>
              </rect>
              <text x={chartX + barW + 4} y={y + 8} fontSize="7.5" fontWeight="700" fill="#0e7490">
                {formatoNum(d.km, 0)} km
              </text>
              <text x={chartX} y={y + 24} fontSize="6.5" fill="#94a3b8">
                {detalhe}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Gráfico de produção por placa — viagens e toneladas. */
export function GraficoOperacaoPorPlaca({
  titulo,
  linhas,
  formatoNum,
}: {
  titulo: string;
  linhas: LinhaOperacaoPlacaGrafico[];
  formatoNum: (v: number, dec?: number) => string;
}) {
  const lista = linhas.filter((l) => l.placa !== '—' && l.toneladas > 0);
  if (!lista.length) return null;

  const maxVal = Math.max(...lista.map((d) => d.toneladas), 0.01);
  const SVG_W = 400;
  const rowH = 34;
  const headerH = 36;
  const SVG_H = headerH + lista.length * rowH + 8;
  const labelW = 76;
  const chartX = labelW + 6;
  const chartW = SVG_W - chartX - 8;
  const totalTon = lista.reduce((s, l) => s + l.toneladas, 0);

  return (
    <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
      <div style={tituloStyle}>
        <span>{titulo}</span>
        <span style={{ ...badgeStyle, color: '#1d4ed8', background: '#dbeafe' }}>
          Total: {formatoNum(totalTon, 1)} t
        </span>
      </div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        {lista.map((d, i) => {
          const y = headerH + i * rowH;
          const barW = Math.max(3, (d.toneladas / maxVal) * chartW);
          const pct = totalTon > 0 ? (d.toneladas / totalTon) * 100 : 0;
          const detalhe = `${formatoNum(d.viagens, 0)} viag. · ${formatoNum(d.km, 0)} km · ${formatoNum(d.horas, 1)} h`;
          return (
            <g key={d.placa + i}>
              <text x={labelW} y={y + 6} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#1e293b">
                {d.placa.length > 10 ? d.placa.slice(0, 10) + '…' : d.placa}
                {d.ehReserva ? ' (R)' : ''}
              </text>
              <text x={labelW} y={y + 16} textAnchor="end" fontSize="6.5" fill="#64748b">
                {formatoNum(pct, 1)}%
              </text>
              <rect x={chartX} y={y - 2} width={barW} height={14} fill="#3b82f6" rx="3" opacity={0.9}>
                <title>{d.placa}{d.ehReserva ? ' (reserva)' : ''}: {formatoNum(d.toneladas, 1)} t — {detalhe}</title>
              </rect>
              <text x={chartX + barW + 4} y={y + 8} fontSize="7.5" fontWeight="700" fill="#1d4ed8">
                {formatoNum(d.toneladas, 1)} t
              </text>
              <text x={chartX} y={y + 22} fontSize="6.5" fill="#94a3b8">
                {detalhe}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Gráfico completo de receita por placa — espelha a tabela BlocoTabela. */
export function GraficoReceitaPorPlaca({
  titulo,
  linhas,
  formatoMoeda,
  formatoNum,
}: {
  titulo: string;
  linhas: LinhaReceitaPlacaGrafico[];
  formatoMoeda: (v: number) => string;
  formatoNum: (v: number, dec?: number) => string;
}) {
  const lista = linhas.filter(l => l.placa !== '—' && l.faturamento > 0);
  if (!lista.length) return null;

  const maxVal = Math.max(...lista.map(d => d.faturamento), 0.01);
  const SVG_W = 400;
  const rowH = 34;
  const headerH = 36;
  const SVG_H = headerH + lista.length * rowH + 8;
  const labelW = 76;
  const chartX = labelW + 6;
  const chartW = SVG_W - chartX - 8;
  const totalFat = lista.reduce((s, l) => s + l.faturamento, 0);

  return (
    <div style={{ ...cardStyle, marginBottom: '0.75rem' }}>
      <div style={tituloStyle}>
        <span>{titulo}</span>
        <span style={{ ...badgeStyle, color: '#065f46', background: '#d1fae5' }}>
          Total: {formatoMoeda(totalFat)}
        </span>
      </div>
      <svg width="100%" height={SVG_H} viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ display: 'block' }}>
        {lista.map((d, i) => {
          const y = headerH + i * rowH;
          const barW = Math.max(3, (d.faturamento / maxVal) * chartW);
          const pct = totalFat > 0 ? (d.faturamento / totalFat) * 100 : 0;
          const detalhe = `${formatoNum(d.viagens, 0)} viag. · ${formatoNum(d.toneladas, 1)} t · ${formatoNum(d.km, 0)} km · ${formatoMoeda(d.receitaTon)}/t`;
          return (
            <g key={d.placa + i}>
              <text x={labelW} y={y + 6} textAnchor="end" fontSize="8.5" fontWeight="700" fill="#1e293b">
                {d.placa.length > 10 ? d.placa.slice(0, 10) + '…' : d.placa}
              </text>
              <text x={labelW} y={y + 16} textAnchor="end" fontSize="6.5" fill="#64748b">
                {formatoNum(pct, 1)}%
              </text>
              <rect x={chartX} y={y - 2} width={barW} height={14} fill="#10b981" rx="3" opacity={0.9}>
                <title>{d.placa}: {formatoMoeda(d.faturamento)} — {detalhe}</title>
              </rect>
              <text x={chartX + barW + 4} y={y + 8} fontSize="7.5" fontWeight="700" fill="#065f46">
                {formatoMoeda(d.faturamento)}
              </text>
              <text x={chartX} y={y + 22} fontSize="6.5" fill="#94a3b8">
                {detalhe}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
