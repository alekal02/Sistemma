import { useMemo, useRef, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import { FiTruck, FiBarChart2 } from 'react-icons/fi';

import type { KpiValor } from '../hooks/useKpiCalculator';

import { analisarOperacaoDia, isKpiMetricaBaseOperacao } from '../utils/operacaoDia';

import { fmtNum } from '../utils/relatorioDiario';

import type { RegistroDiaLinha } from '../utils/dadosPorDia';

import { formatarIsoParaBr } from '../utils/periodoDados';

import { ehPlacaReserva, resumirFrotaOperacao } from '../utils/placasReserva';

import GraficosOperacaoDia from './GraficosOperacaoDia';

import { GraficoOperacaoPorPlaca } from './GraficosSvg';



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

}



const CORES = ['#059669', '#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#14b8a6', '#3b82f6', '#ec4899'];



export default function OperacaoDiaPanel({

  dataIso,

  registros,

  linhas,

  kpisOperacao,

  loadingKpis = false,

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



  const kpisAvancados = useMemo(

    () => kpisOperacao.filter((k) => !isKpiMetricaBaseOperacao(k.nome)),

    [kpisOperacao],

  );



  if (!temDados && !carregandoRegistros) {

    return (

      <div style={{

        textAlign: 'center', padding: '1.5rem', color: '#94a3b8',

        background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',

      }}>

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

        border: '1px solid #c7d2fe', borderRadius: '10px',

        padding: '0.65rem 0.85rem', marginBottom: '0.75rem',

        fontSize: '0.72rem', color: '#4338ca',

      }}>

        <strong>{fmtNum(resumo.viagens, 0)} viagem{resumo.viagens !== 1 ? 's' : ''}</strong>

        {' '}em {formatarIsoParaBr(dataIso)}

        {' · '}{resumo.registros} registro{resumo.registros !== 1 ? 's' : ''} na planilha

        {' · '}{resumo.caminhoes} caminh{resumo.caminhoes !== 1 ? 'ões' : 'ão'} (placas únicas)
        {placasReserva.length > 0 && (
          <>
            {' · '}{frotaResumo.titulares} titular{frotaResumo.titulares !== 1 ? 'es' : ''}
            {frotaResumo.reserva > 0 && ` + ${frotaResumo.reserva} reserva`}
          </>
        )}

        {' · '}{resumo.motoristas} motorista{resumo.motoristas !== 1 ? 's' : ''}

      </div>



      <div style={{

        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',

        borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '0.75rem',

        border: '1px solid #334155', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap',

      }}>

        <div style={{ flex: 1, minWidth: '180px' }}>

          <div style={{ fontSize: '0.6rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>

            Viagens do dia

          </div>

          <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#a5b4fc', marginTop: '0.15rem', fontFamily: 'monospace' }}>

            {fmtNum(resumo.viagens, 0)}

          </div>

          <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.25rem' }}>

            {resumo.caminhoes} caminh{resumo.caminhoes !== 1 ? 'ões' : 'ão'} · {resumo.motoristas} motorista(s) · {resumo.registros} registro(s)

          </div>

        </div>

        <div style={{

          display: 'grid', gridTemplateColumns: 'repeat(2, minmax(90px, 1fr))', gap: '0.4rem',

          minWidth: '200px',

        }}>

          <MiniStat label="Caminhões" valor={fmtNum(resumo.caminhoes, 0)} />

          <MiniStat label="Toneladas" valor={`${fmtNum(resumo.toneladas, 1)} t`} />

          <MiniStat label="KM total" valor={`${fmtNum(resumo.km, 0)} km`} />

          <MiniStat label="Horas" valor={`${fmtNum(resumo.horas, 1)} h`} />

          <MiniStat label="Ton./viagem" valor={`${fmtNum(resumo.tonMediaColeta, 2)} t`} />

        </div>

      </div>



      <GraficosOperacaoDia analise={analise} />



      {analise.porPlaca.filter((l) => l.chave !== '—').length > 0 && (

        <>

          <SecaoTitulo icone={<FiTruck size={12} />} titulo="Produção por veículo (PLACA)" />

          <GraficoOperacaoPorPlaca

            titulo="Toneladas por placa"

            linhas={analise.porPlaca

              .filter((l) => l.chave !== '—')

              .map((l) => ({

                placa: l.chave,

                viagens: l.viagens,

                toneladas: l.toneladas,

                km: l.km,

                horas: l.horas,

                ehReserva: ehPlacaReserva(l.chave, placasReserva),

              }))}

            formatoNum={fmtNum}

          />

        </>

      )}



      {(resumo.caminhoes > 0 || kpisAvancados.length > 0) && (

        <div style={{ marginBottom: '1rem' }}>

          <SecaoTitulo icone={<FiBarChart2 size={12} />} titulo="Indicadores do dia" />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.5rem' }}>

            <KpiCard label="Caminhões (placas únicas)" valor={fmtNum(resumo.caminhoes, 0)} cor="#6366f1" />

            {loadingKpis && kpisAvancados.length === 0 ? (
              <KpiCard label="Indicadores" valor="Carregando..." cor="#94a3b8" />
            ) : (
              kpisAvancados.map((kpi, idx) => (
                <KpiCard
                  key={kpi.id || kpi.nome}
                  label={kpi.nome}
                  valor={kpi.formatado || '—'}
                  cor={CORES[idx % CORES.length]}
                />
              ))
            )}

          </div>

        </div>

      )}



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

  );

}



function KpiCard({ label, valor, cor }: { label: string; valor: string; cor: string }) {

  return (

    <div style={{

      background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0',

      borderTop: `3px solid ${cor}`, padding: '0.6rem 0.75rem',

    }}>

      <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#64748b' }}>{label}</div>

      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>{valor}</div>

    </div>

  );

}



function SecaoTitulo({ icone, titulo }: { icone: ReactNode; titulo: string }) {

  return (

    <div style={{

      fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase',

      marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem',

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

    <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>

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

        Registros da planilha ({totalLabel.toLocaleString('pt-BR')})

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

                <span>Página {pagina} de {totalPaginas}</span>

                <button type="button" disabled={pagina >= totalPaginas || carregando} onClick={() => onPaginaChange(pagina + 1)} style={btnSec}>Próxima</button>

              </div>

            )}

          </div>



          {validacao && (

            <div style={{

              borderRadius: '8px', padding: '0.6rem 0.75rem', marginBottom: '0.75rem',

              border: `1px solid ${validacao.ok ? '#bbf7d0' : '#fde68a'}`,

              background: validacao.ok ? '#f0fdf4' : '#fffbeb', fontSize: '0.68rem', color: '#475569',

            }}>

              {validacao.mensagens[0]}

            </div>

          )}



          {carregando ? (

            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Carregando viagens...</p>

          ) : linhas.length === 0 ? (

            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>Nenhum registro para esta data.</p>

          ) : (

            <div ref={scrollRef} style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'min(480px, 55vh)' }}>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '900px' }}>

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
                              borderRadius: '4px',
                              verticalAlign: 'middle',
                            }}>
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

                            padding: '0.1rem 0.35rem', borderRadius: '4px',

                          }}>

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



const th: React.CSSProperties = { padding: '0.45rem 0.55rem', textAlign: 'left', fontWeight: 600, fontSize: '0.65rem' };

const td: React.CSSProperties = { padding: '0.4rem 0.55rem' };

const btnSec: React.CSSProperties = {

  fontSize: '0.72rem', padding: '0.3rem 0.6rem', borderRadius: '6px',

  border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer',

};


