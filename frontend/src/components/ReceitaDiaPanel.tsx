import { useMemo, type ReactNode } from 'react';
import { FiDollarSign, FiTruck, FiMapPin, FiClock, FiTrendingUp, FiInfo } from 'react-icons/fi';
import {
  analisarReceitaDia,
  extrairValoresFaturamento,
  type LinhaReceitaGrupo,
} from '../utils/receitaDia';
import { fmtMoeda, fmtNum } from '../utils/relatorioDiario';
import { formatarIsoParaBr } from '../utils/periodoDados';
import GraficosReceitaDia from './GraficosReceitaDia';
import { GraficoReceitaPorPlaca } from './GraficosSvg';

interface ReceitaDiaPanelProps {
  dataIso: string;
  registros: Record<string, unknown>[];
  configFaturamento?: {
    ativo?: boolean;
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null;
  contrato?: {
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null;
}

export default function ReceitaDiaPanel({
  dataIso,
  registros,
  configFaturamento,
  contrato,
}: ReceitaDiaPanelProps) {
  const analise = useMemo(() => {
    const tarifas = extrairValoresFaturamento(configFaturamento, contrato);
    return analisarReceitaDia(registros, tarifas);
  }, [registros, configFaturamento, contrato]);

  const { resumo, tarifas } = analise;
  const temReceita = resumo.faturamento > 0 || resumo.toneladas > 0;

  if (!temReceita) {
    return (
      <div style={{
        textAlign: 'center', padding: '1.5rem', color: '#94a3b8',
        background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
      }}>
        <FiDollarSign size={28} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
        <div>Nenhum dado financeiro para {formatarIsoParaBr(dataIso)}.</div>
        <div style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
          A receita é calculada somente com os registros upados nesta data (PESO TOTAL × tarifa).
        </div>
      </div>
    );
  }

  const pctTipo = (fat: number) => (resumo.faturamento > 0 ? (fat / resumo.faturamento) * 100 : 0);

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
        border: '1px solid #fde68a', borderRadius: '10px',
        padding: '0.65rem 0.85rem', marginBottom: '0.75rem',
        fontSize: '0.72rem', color: '#92400e',
      }}>
        Receita de <strong>{fmtNum(resumo.viagens, 0)} viagem{resumo.viagens !== 1 ? 's' : ''}</strong>
        {' '}em {formatarIsoParaBr(dataIso)}
        {' · '}{analise.registrosConsiderados} registro{analise.registrosConsiderados !== 1 ? 's' : ''}
      </div>
      {/* Faturamento principal */}
      <div style={{
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem',
        border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '180px' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
            Faturamento estimado do dia
          </div>
          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#fbbf24', marginTop: '0.15rem', fontFamily: 'monospace' }}>
            {fmtMoeda(resumo.faturamento)}
          </div>
          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem' }}>
            {analise.registrosConsiderados} registro(s) · PESO TOTAL × tarifa por tipo de caminhão
          </div>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(90px, 1fr))', gap: '0.4rem',
          minWidth: '200px',
        }}>
          <MiniStat label="R$/ton" valor={fmtMoeda(resumo.receitaTon)} />
          <MiniStat label="R$/km" valor={fmtMoeda(resumo.receitaKm)} />
          <MiniStat label="R$/h" valor={fmtMoeda(resumo.receitaHora)} />
          <MiniStat label="R$/viagem" valor={fmtMoeda(resumo.receitaViagem)} />
        </div>
      </div>

      <GraficosReceitaDia analise={analise} />

      {/* Indicadores vitais — base operacional da planilha */}
      <SecaoTitulo icone={<FiTrendingUp size={12} />} titulo="Base operacional do dia" />
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
        gap: '0.45rem', marginBottom: '1rem',
      }}>
        {[
          { label: 'Viagens', valor: fmtNum(resumo.viagens, 0), cor: '#3b82f6', icone: <FiTruck size={11} /> },
          { label: 'Toneladas', valor: `${fmtNum(resumo.toneladas, 1)} t`, cor: '#16a34a', icone: null },
          { label: 'KM TOTAL', valor: `${fmtNum(resumo.km, 0)} km`, cor: '#d97706', icone: <FiMapPin size={11} /> },
          { label: 'Horas', valor: `${fmtNum(resumo.horas, 1)} h`, cor: '#7c3aed', icone: <FiClock size={11} /> },
          { label: 'Veículos', valor: String(resumo.coletores), cor: '#0891b2', icone: null },
          { label: 'Motoristas', valor: String(resumo.motoristas), cor: '#6366f1', icone: null },
          { label: 'Ton./KM', valor: fmtNum(resumo.tonKm, 3), cor: '#f97316', icone: null },
          { label: 'Ton./veículo', valor: `${fmtNum(resumo.prodColetor, 2)} t`, cor: '#22c55e', icone: null },
        ].map((c) => (
          <div key={c.label} style={{
            background: '#fff', borderRadius: '8px', padding: '0.5rem 0.65rem',
            border: '1px solid #e2e8f0', borderTop: `3px solid ${c.cor}`,
          }}>
            <div style={{ fontSize: '0.55rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
              {c.icone} {c.label}
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.1rem' }}>{c.valor}</div>
          </div>
        ))}
      </div>

      {/* Tarifas */}
      <div style={{
        background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
        padding: '0.55rem 0.75rem', marginBottom: '1rem', fontSize: '0.72rem', color: '#92400e',
        display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
      }}>
        <FiInfo size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <strong>Tarifas aplicadas</strong>
          {!tarifas.temValorConfigurado && ' (padrão estimado)'}:{' '}
          Geral {fmtMoeda(tarifas.valorTonelada)}/t
          {' · '}Mini {fmtMoeda(tarifas.valorMini || tarifas.valorTonelada)}/t
          {' · '}Truck {fmtMoeda(tarifas.valorTruck || tarifas.valorTonelada)}/t
          {' · '}Toco {fmtMoeda(tarifas.valorToco || tarifas.valorTonelada)}/t
          {' · '}Basculante {fmtMoeda(tarifas.valorBasculante || tarifas.valorTonelada)}/t
        </div>
      </div>

      {/* Por tipo de caminhão */}
      {analise.porTipoCaminhao.length > 0 && (
        <BlocoTabela
          titulo="Faturamento por tipo de caminhão"
          icone={<FiTruck size={12} />}
          linhas={analise.porTipoCaminhao}
          colChave="Tipo"
          destaque
          pctTotal={pctTipo}
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {analise.porTurno.filter((l) => l.chave !== '—').length > 0 && (
          <BlocoTabela titulo="Por turno" icone={<FiClock size={12} />} linhas={analise.porTurno} colChave="Turno" compacto />
        )}
        {analise.porRegional.filter((l) => l.chave !== '—').length > 0 && (
          <BlocoTabela titulo="Por regional" icone={<FiMapPin size={12} />} linhas={analise.porRegional} colChave="Regional" compacto />
        )}
      </div>

      {/* Por placa — gráfico */}
      {analise.porPlaca.filter((l) => l.chave !== '—').length > 0 && (
        <>
          <SecaoTitulo icone={<FiTruck size={12} />} titulo="Receita por veículo (PLACA)" />
          <GraficoReceitaPorPlaca
            titulo="Faturamento por placa"
            linhas={analise.porPlaca
              .filter((l) => l.chave !== '—')
              .map((l) => ({
                placa: l.chave,
                viagens: l.viagens,
                toneladas: l.toneladas,
                km: l.km,
                faturamento: l.faturamento,
                receitaTon: l.receitaTon,
              }))}
            formatoMoeda={fmtMoeda}
            formatoNum={fmtNum}
          />
        </>
      )}
    </div>
  );
}

function SecaoTitulo({ icone, titulo }: { icone: ReactNode; titulo: string }) {
  return (
    <div style={{
      fontSize: '0.7rem', fontWeight: 700, color: '#64748b',
      textTransform: 'uppercase', marginBottom: '0.5rem',
      display: 'flex', alignItems: 'center', gap: '0.3rem',
    }}>
      {icone} {titulo}
    </div>
  );
}

function MiniStat({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '6px', padding: '0.35rem 0.5rem' }}>
      <div style={{ fontSize: '0.52rem', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#e2e8f0', fontFamily: 'monospace' }}>{valor}</div>
    </div>
  );
}

function BlocoTabela({
  titulo,
  icone,
  linhas,
  colChave,
  destaque = false,
  compacto = false,
  pctTotal,
}: {
  titulo: string;
  icone: ReactNode;
  linhas: LinhaReceitaGrupo[];
  colChave: string;
  destaque?: boolean;
  compacto?: boolean;
  pctTotal?: (fat: number) => number;
}) {
  const maxFat = Math.max(...linhas.map((l) => l.faturamento), 0.01);

  return (
    <div style={{
      background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
      overflow: 'hidden', marginBottom: compacto ? 0 : '1rem',
      boxShadow: destaque ? '0 1px 4px rgba(0,0,0,0.04)' : undefined,
    }}>
      <div style={{
        padding: '0.55rem 0.75rem', background: destaque ? '#fefce8' : '#f8fafc',
        borderBottom: '1px solid #e2e8f0', fontSize: '0.72rem', fontWeight: 700, color: '#475569',
        display: 'flex', alignItems: 'center', gap: '0.35rem',
      }}>
        {icone} {titulo}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: compacto ? '0.68rem' : '0.72rem', minWidth: compacto ? '320px' : '520px' }}>
          <thead>
            <tr style={{ background: '#1e293b', color: '#fff' }}>
              <th style={th}>{colChave}</th>
              {!compacto && <th style={{ ...th, textAlign: 'center' }}>Viagens</th>}
              <th style={{ ...th, textAlign: 'right' }}>Toneladas</th>
              {!compacto && <th style={{ ...th, textAlign: 'right' }}>KM</th>}
              <th style={{ ...th, textAlign: 'right', background: '#065f46', color: '#6ee7b7' }}>Faturamento</th>
              {pctTotal && <th style={{ ...th, textAlign: 'right' }}>%</th>}
              {!compacto && <th style={{ ...th, textAlign: 'right' }}>R$/ton</th>}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, idx) => (
              <tr key={l.chave} style={{ borderTop: '1px solid #e2e8f0', background: idx % 2 === 0 ? '#f8fafc' : '#fff' }}>
                <td style={{ ...td, fontWeight: 700, color: '#1e293b' }}>{l.chave}</td>
                {!compacto && <td style={{ ...td, textAlign: 'center' }}>{fmtNum(l.viagens, 0)}</td>}
                <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.toneladas, 1)} t</td>
                {!compacto && <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.km, 0)}</td>}
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: '#065f46', fontFamily: 'monospace' }}>
                  {fmtMoeda(l.faturamento)}
                  {destaque && (
                    <div style={{
                      width: `${Math.max(4, (l.faturamento / maxFat) * 100)}%`,
                      maxWidth: '60px', height: '3px', background: '#10b981',
                      borderRadius: '2px', margin: '3px 0 0 auto', opacity: 0.5,
                    }} />
                  )}
                </td>
                {pctTotal && (
                  <td style={{ ...td, textAlign: 'right', color: '#64748b' }}>{fmtNum(pctTotal(l.faturamento), 1)}%</td>
                )}
                {!compacto && (
                  <td style={{ ...td, textAlign: 'right', color: '#92400e', fontSize: '0.68rem' }}>
                    {fmtMoeda(l.receitaTon)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '0.45rem 0.55rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.65rem',
};

const td: React.CSSProperties = { padding: '0.4rem 0.55rem' };
