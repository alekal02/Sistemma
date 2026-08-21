import { useMemo, useRef, type CSSProperties } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FiTruck } from 'react-icons/fi';
import type { KpiValor } from '../hooks/useKpiCalculator';
import { analisarOperacaoDia } from '../utils/operacaoDia';
import { fmtNum } from '../utils/relatorioDiario';
import type { RegistroDiaLinha } from '../utils/dadosPorDia';
import { formatarIsoParaBr } from '../utils/periodoDados';
import { ehPlacaReserva, resumirFrotaOperacao } from '../utils/placasReserva';
import type { CenarioCaixaMediaDia } from '../utils/cenarioCaixaMediaDia';
import type { MapaLimiteCaminhao } from '../utils/limitesCaminhaoContrato';
import OperacaoDiaLayoutRelatorio from './OperacaoDiaLayoutRelatorio';
import MapeamentoOperacionalPainel from './MapeamentoOperacionalPainel';

interface OperacaoDiaPanelProps {
  dataIso: string;
  registros: Record<string, unknown>[];
  linhas: RegistroDiaLinha[];
  kpisOperacao: KpiValor[];
  loadingKpis?: boolean;
  carregandoRegistros: boolean;
  mostrarRegistros: boolean;
  onToggleRegistros: () => void;
  incluirTodos: boolean;
  onIncluirTodos: (v: boolean) => void;
  onRecarregar: () => void;
  validacao: { ok: boolean; mensagens: string[] } | null;
  placasReserva?: string[];
  /** Quando presente, usa agregação SQL (escala 600k) em vez de analisar registros. */
  analiseSql?: ReturnType<typeof analisarOperacaoDia> | null;
  totalRegistros?: number;
  pagina?: number;
  totalPaginas?: number;
  onPaginaChange?: (pagina: number) => void;
  cenarioCaixaMedia?: CenarioCaixaMediaDia | null;
  volumeL?: MapaLimiteCaminhao | null;
  densidadeResiduoKgL?: number | null;
  densidadeKgL?: MapaLimiteCaminhao | null;
  densidadeKgLPorPlaca?: Record<string, number> | null;
  limitesPesoKg?: MapaLimiteCaminhao | null;
  contractId?: string;
  servicoId?: string;
}

export default function OperacaoDiaPanel({
  dataIso,
  registros,
  linhas,
  carregandoRegistros,
  mostrarRegistros,
  onToggleRegistros,
  incluirTodos,
  onIncluirTodos,
  onRecarregar,
  validacao,
  placasReserva = [],
  analiseSql = null,
  totalRegistros,
  pagina = 1,
  totalPaginas = 1,
  onPaginaChange,
  cenarioCaixaMedia = null,
  volumeL = null,
  densidadeResiduoKgL = null,
  densidadeKgL = null,
  densidadeKgLPorPlaca = null,
  limitesPesoKg = null,
  contractId,
  servicoId,
}: OperacaoDiaPanelProps) {
  const analise = useMemo(() => {
    if (analiseSql) return analiseSql;
    return analisarOperacaoDia(registros);
  }, [analiseSql, registros]);

  const { resumo } = analise;

  const frotaResumo = useMemo(
    () => resumirFrotaOperacao(
      analise.porPlaca.filter((p) => p.chave !== '—').map((p) => p.chave),
      placasReserva,
    ),
    [analise.porPlaca, placasReserva],
  );

  const temDados = resumo.viagens > 0 || registros.length > 0;

  if (!temDados && !carregandoRegistros) {
    return (
      <div style={{
        textAlign: 'center', padding: '1.5rem', color: '#94a3b8',
        background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',
      }}
      >
        <FiTruck size={28} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
        <div>Nenhuma viagem em {formatarIsoParaBr(dataIso)}.</div>
        <div style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
          Os dados exibidos aqui são sempre filtrados pela data selecionada no calendário.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{
        background: 'linear-gradient(135deg, #eff6ff 0%, #eef2ff 100%)',
        border: '1px solid #c7d2fe',
        borderRadius: 10,
        padding: '0.65rem 0.85rem',
        marginBottom: '0.75rem',
        fontSize: '0.72rem',
        color: '#4338ca',
      }}
      >
        <strong>
          {fmtNum(resumo.viagens, 0)}
          {' '}
          viagem
          {resumo.viagens !== 1 ? 's' : ''}
        </strong>
        {' '}
        em
        {' '}
        {formatarIsoParaBr(dataIso)}
        {' · '}
        {resumo.registros}
        {' '}
        registro
        {resumo.registros !== 1 ? 's' : ''}
        {' · '}
        {resumo.caminhoes}
        {' '}
        caminh
        {resumo.caminhoes !== 1 ? 'ões' : 'ão'}
        {placasReserva.length > 0 && (
          <>
            {' · '}
            {frotaResumo.titulares}
            {' '}
            titular
            {frotaResumo.titulares !== 1 ? 'es' : ''}
            {frotaResumo.reserva > 0 && ` + ${frotaResumo.reserva} reserva`}
          </>
        )}
      </div>

      {/* Layout alinhado ao PDF Relatório de Operação do Dia */}
      <OperacaoDiaLayoutRelatorio
        analise={analise}
        registros={registros}
        cenarioCaixaMedia={cenarioCaixaMedia}
        placasReserva={placasReserva}
        volumeL={volumeL}
        densidadeResiduoKgL={densidadeResiduoKgL}
        densidadeKgL={densidadeKgL}
        densidadeKgLPorPlaca={densidadeKgLPorPlaca}
        limitesPesoKg={limitesPesoKg}
      />

      {contractId && servicoId ? (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '0.45rem',
          }}
          >
            Estudo de hora produtiva
          </div>
          <MapeamentoOperacionalPainel
            contractId={contractId}
            servicoId={servicoId}
            dataInicio={dataIso}
            dataFim={dataIso}
          />
        </div>
      ) : null}

      <div style={{ marginTop: '1.25rem' }}>
        <PainelViagens
          resumo={resumo}
          linhas={linhas}
          registros={registros}
          carregando={carregandoRegistros}
          mostrar={mostrarRegistros}
          onToggle={onToggleRegistros}
          incluirTodos={incluirTodos}
          onIncluirTodos={onIncluirTodos}
          onRecarregar={onRecarregar}
          validacao={validacao}
          placasReserva={placasReserva}
          totalRegistros={totalRegistros ?? resumo.registros}
          pagina={pagina}
          totalPaginas={totalPaginas}
          onPaginaChange={onPaginaChange}
        />
      </div>
    </div>
  );
}

function PainelViagens({
  resumo, linhas, registros, carregando, mostrar, onToggle,
  incluirTodos, onIncluirTodos, onRecarregar, validacao, placasReserva = [],
  totalRegistros, pagina = 1, totalPaginas = 1, onPaginaChange,
}: {
  resumo: { viagens: number; registros: number };
  linhas: RegistroDiaLinha[];
  registros: Record<string, unknown>[];
  carregando: boolean;
  mostrar: boolean;
  onToggle: () => void;
  incluirTodos: boolean;
  onIncluirTodos: (v: boolean) => void;
  onRecarregar: () => void;
  validacao: { ok: boolean; mensagens: string[] } | null;
  placasReserva?: string[];
  totalRegistros?: number;
  pagina?: number;
  totalPaginas?: number;
  onPaginaChange?: (pagina: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: linhas.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 8,
  });

  const totalLabel = totalRegistros ?? resumo.registros;

  return (
    <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%',
          padding: '0.65rem 0.85rem', border: 'none', background: '#f8fafc',
          cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#475569',
        }}
      >
        <FiTruck size={14} />
        Registros da planilha (
        {totalLabel.toLocaleString('pt-BR')}
        )
        <span style={{ marginLeft: 'auto', fontSize: '0.68rem', color: '#94a3b8' }}>
          {mostrar ? 'Ocultar' : 'Expandir'}
        </span>
      </button>

      {mostrar && (
        <div style={{ padding: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#475569' }}>
              <input type="checkbox" checked={incluirTodos} onChange={(e) => onIncluirTodos(e.target.checked)} />
              Incluir registros com inconsistência
            </label>
            <button type="button" onClick={onRecarregar} style={btnSec}>Atualizar</button>
            {totalPaginas > 1 && onPaginaChange && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.72rem', color: '#64748b' }}>
                <button type="button" disabled={pagina <= 1 || carregando} onClick={() => onPaginaChange(pagina - 1)} style={btnSec}>Anterior</button>
                <span>
                  Página
                  {' '}
                  {pagina}
                  {' '}
                  de
                  {' '}
                  {totalPaginas}
                </span>
                <button type="button" disabled={pagina >= totalPaginas || carregando} onClick={() => onPaginaChange(pagina + 1)} style={btnSec}>Próxima</button>
              </div>
            )}
          </div>

          {validacao && (
            <div style={{
              borderRadius: 8, padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
              border: `1px solid ${validacao.ok ? '#bbf7d0' : '#fde68a'}`,
              background: validacao.ok ? '#f0fdf4' : '#fffbeb', fontSize: '0.68rem', color: '#475569',
            }}
            >
              {validacao.mensagens[0]}
            </div>
          )}

          {carregando ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Carregando viagens...</p>
          ) : linhas.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Nenhum registro para esta data.</p>
          ) : (
            <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(480px, 55vh)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: 900 }}>
                <thead>
                  <tr style={{ background: '#1e293b', color: '#fff' }}>
                    <th style={th}>Placa</th>
                    <th style={th}>Motorista</th>
                    <th style={th}>Turno</th>
                    <th style={th}>Regional</th>
                    <th style={{ ...th, textAlign: 'center' }}>Viagens</th>
                    <th style={{ ...th, textAlign: 'right' }}>Toneladas</th>
                    <th style={{ ...th, textAlign: 'right' }}>KM</th>
                    <th style={{ ...th, textAlign: 'center' }}>Saída</th>
                    <th style={{ ...th, textAlign: 'center' }}>Chegada</th>
                    <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const idx = virtualRow.index;
                    const l = linhas[idx];
                    const reg = registros[idx];
                    const valido = reg?._validoDashboard !== false;
                    return (
                      <tr
                        key={String(l.id)}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                          borderTop: '1px solid #e2e8f0',
                          background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                          display: 'table',
                          tableLayout: 'fixed',
                        }}
                      >
                        <td style={{ ...td, fontWeight: 700 }}>
                          {l.placa}
                          {ehPlacaReserva(l.placa, placasReserva) && (
                            <span style={{
                              marginLeft: '0.35rem',
                              fontSize: '0.55rem',
                              fontWeight: 700,
                              color: '#92400e',
                              background: '#fef3c7',
                              padding: '0.1rem 0.3rem',
                              borderRadius: 4,
                              verticalAlign: 'middle',
                            }}
                            >
                              RESERVA
                            </span>
                          )}
                        </td>
                        <td style={td}>{l.motorista}</td>
                        <td style={td}>{l.turno}</td>
                        <td style={td}>{l.regional}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: '#3b82f6' }}>{l.viagens}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.toneladas, 2)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.kmFinal, 0)}</td>
                        <td style={{ ...td, textAlign: 'center', fontSize: '0.65rem' }}>{l.horaSaidaFmt}</td>
                        <td style={{ ...td, textAlign: 'center', fontSize: '0.65rem' }}>{l.horaChegadaFmt}</td>
                        <td style={{ ...td, textAlign: 'center' }}>
                          <span style={{
                            fontSize: '0.58rem', fontWeight: 700,
                            color: valido ? '#166534' : '#b45309',
                            background: valido ? '#dcfce7' : '#fef3c7',
                            padding: '0.1rem 0.35rem', borderRadius: 4,
                          }}
                          >
                            {valido ? 'OK' : 'Atenção'}
                          </span>
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
    </div>
  );
}

const th: CSSProperties = { padding: '0.45rem 0.55rem', textAlign: 'left', fontWeight: 600, fontSize: '0.65rem' };
const td: CSSProperties = { padding: '0.4rem 0.55rem' };
const btnSec: CSSProperties = {
  fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: 6,
  border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',
};
