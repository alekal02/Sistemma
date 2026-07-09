/**
 * Relatório operacional de um dia — resumo + lista de viagens/registros (sem dados financeiros).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  FiCalendar, FiTruck, FiX, FiRefreshCw, FiAlertTriangle, FiCheckCircle,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import servicoService from '../services/servicoService';
import { formatarIsoParaBr } from '../utils/periodoDados';
import { fmtNum, type DadoDiario } from '../utils/relatorioDiario';
import {
  listarLinhasDia,
  resumirRegistrosManual,
  validarDadosDia,
  filtrarRegistrosPorDia,
} from '../utils/dadosPorDia';

interface Props {
  contractId: string;
  servicoId: string;
  dataIso: string;
  resumoCiclo?: DadoDiario | null;
  registros?: Record<string, unknown>[];
  carregando?: boolean;
  onRecarregar?: () => void;
  onFechar?: () => void;
}

const DIAS_SEM = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export default function RelatorioOperacionalDia({
  contractId,
  servicoId,
  dataIso,
  resumoCiclo,
  registros: registrosExternos,
  carregando: carregandoExterno,
  onRecarregar,
  onFechar,
}: Props) {
  const { adicionarToast } = useToast();
  const [registrosInternos, setRegistrosInternos] = useState<Record<string, unknown>[]>([]);
  const [totalApi, setTotalApi] = useState(0);
  const [incluirTodos, setIncluirTodos] = useState(true);
  const [carregandoInterno, setCarregandoInterno] = useState(true);

  const usaRegistrosExternos = registrosExternos !== undefined;

  const diaSemana = useMemo(() => {
    const [y, m, d] = dataIso.split('-').map(Number);
    return DIAS_SEM[new Date(y, m - 1, d).getDay()];
  }, [dataIso]);

  const carregar = useCallback(async () => {
    if (usaRegistrosExternos) {
      onRecarregar?.();
      return;
    }
    setCarregandoInterno(true);
    try {
      const resultado = await servicoService.getDadosDia(contractId, servicoId, dataIso, {
        incluirInconsistentes: incluirTodos,
      });
      setRegistrosInternos(resultado.dados || []);
      setTotalApi(resultado.total ?? 0);
    } catch {
      adicionarToast('Erro ao carregar viagens do dia', 'error');
      setRegistrosInternos([]);
      setTotalApi(0);
    } finally {
      setCarregandoInterno(false);
    }
  }, [usaRegistrosExternos, onRecarregar, contractId, servicoId, dataIso, incluirTodos, adicionarToast]);

  useEffect(() => {
    if (usaRegistrosExternos) return;
    carregar();
  }, [carregar, usaRegistrosExternos]);

  useEffect(() => {
    if (!usaRegistrosExternos) return;
    setCarregandoInterno(false);
  }, [usaRegistrosExternos]);

  const registros = usaRegistrosExternos ? (registrosExternos ?? []) : registrosInternos;
  const carregando = usaRegistrosExternos ? (carregandoExterno ?? false) : carregandoInterno;

  const registrosDoDia = useMemo(
    () => filtrarRegistrosPorDia(registros, dataIso),
    [registros, dataIso],
  );

  const totalRegistros = registrosDoDia.length;

  const linhas = useMemo(() => listarLinhasDia(registrosDoDia), [registrosDoDia]);
  const resumo = useMemo(() => resumirRegistrosManual(registrosDoDia), [registrosDoDia]);
  const validacao = useMemo(
    () => (registrosDoDia.length > 0 ? validarDadosDia(registrosDoDia, dataIso, resumoCiclo) : null),
    [registrosDoDia, dataIso, resumoCiclo],
  );

  const validos = registrosDoDia.filter((r) => r._validoDashboard !== false).length;
  const invalidos = registrosDoDia.length - validos;

  return (
    <div style={{
      background: '#fff',
      borderRadius: '10px',
      border: '1px solid #c7d2fe',
      marginBottom: '1rem',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(99, 102, 241, 0.08)',
    }}>
      {/* Cabeçalho */}
      <div style={{
        padding: '0.75rem 1rem',
        background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        color: '#fff',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <FiCalendar size={16} color="#a5b4fc" />
            <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
              Relatório operacional do dia
            </span>
          </div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
            {formatarIsoParaBr(dataIso)}
            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#94a3b8', marginLeft: '0.5rem' }}>
              {diaSemana}
            </span>
          </h2>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '0.25rem' }}>
            Somente dados operacionais — viagens e registros de coleta
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button type="button" onClick={carregar} disabled={carregando} style={btnTopo}>
            <FiRefreshCw size={13} /> Atualizar
          </button>
          {onFechar && (
            <button type="button" onClick={onFechar} style={btnTopo}>
              <FiX size={14} /> Fechar
            </button>
          )}
        </div>
      </div>

      {carregando ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
          Carregando viagens do dia...
        </div>
      ) : (
        <>
          {/* Resumo operacional */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
          }}>
            <CardResumo label="Viagens" valor={fmtNum(resumo.viagens, 0)} cor="#3b82f6" />
            <CardResumo label="Toneladas" valor={`${fmtNum(resumo.toneladas, 1)} t`} cor="#16a34a" />
            <CardResumo label="KM" valor={fmtNum(resumo.km, 0)} cor="#d97706" />
            <CardResumo label="Horas" valor={fmtNum(resumo.horas, 1)} cor="#7c3aed" />
            <CardResumo label="Coletores" valor={String(resumo.coletores)} cor="#0891b2" />
            <CardResumo label="Registros" valor={String(totalRegistros)} cor="#64748b" />
          </div>

          {/* Validação */}
          {validacao && (
            <div style={{ padding: '0.65rem 1rem 0' }}>
              <BannerValidacao validacao={validacao} validos={validos} invalidos={invalidos} />
            </div>
          )}

          {/* Filtro */}
          <div style={{
            padding: '0.5rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
            borderBottom: '1px solid #f1f5f9',
          }}>
            {!usaRegistrosExternos && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.72rem', color: '#475569' }}>
                <input
                  type="checkbox"
                  checked={incluirTodos}
                  onChange={(e) => setIncluirTodos(e.target.checked)}
                />
                Incluir registros com inconsistência
              </label>
            )}
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginLeft: 'auto' }}>
              <FiTruck size={12} style={{ verticalAlign: 'middle' }} /> {linhas.length} linha(s) · {fmtNum(resumo.viagens, 0)} viagem(ns)
            </span>
          </div>

          {/* Tabela de viagens */}
          {linhas.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
              Nenhuma viagem encontrada para {formatarIsoParaBr(dataIso)}.
              {resumoCiclo && resumoCiclo.viagens > 0 && (
                <div style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
                  O ciclo indica {resumoCiclo.viagens} viagem(ns) — os dados podem estar fora do limite carregado ou com data diferente.
                </div>
              )}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', minWidth: '900px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#334155', color: '#fff' }}>
                    <th style={th}>#</th>
                    <th style={th}>Placa</th>
                    <th style={th}>Motorista</th>
                    <th style={th}>Turno</th>
                    <th style={th}>Saída</th>
                    <th style={th}>Chegada</th>
                    <th style={{ ...th, textAlign: 'center' }}>Viagens</th>
                    <th style={{ ...th, textAlign: 'right' }}>Toneladas</th>
                    <th style={{ ...th, textAlign: 'right' }}>KM</th>
                    <th style={{ ...th, textAlign: 'right' }}>Horas</th>
                    <th style={th}>Regional</th>
                    <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                        {linhas.map((l, idx) => {
                    const reg = registrosDoDia[idx];
                    const valido = reg?._validoDashboard !== false;
                    return (
                      <tr
                        key={String(l.id)}
                        style={{
                          borderTop: '1px solid #e2e8f0',
                          background: idx % 2 === 0 ? '#f8fafc' : '#fff',
                        }}
                      >
                        <td style={{ ...td, color: '#94a3b8', fontSize: '0.65rem' }}>{idx + 1}</td>
                        <td style={{ ...td, fontWeight: 600 }}>{l.placa}</td>
                        <td style={td}>{l.motorista}</td>
                        <td style={td}>{l.turno}</td>
                        <td style={td}>{l.horaSaidaFmt}</td>
                        <td style={td}>{l.horaChegadaFmt}</td>
                        <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: '#1e40af' }}>
                          {l.viagens}
                        </td>
                        <td style={{ ...td, textAlign: 'right', color: '#166534' }}>{fmtNum(l.toneladas, 2)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.kmFinal, 0)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmtNum(l.horasTrabalhadas, 1)}</td>
                        <td style={{ ...td, fontSize: '0.68rem', color: '#64748b' }}>
                          {[l.regional, l.distrito].filter((x) => x && x !== '—').join(' · ') || '—'}
                        </td>
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
                <tfoot>
                  <tr style={{ borderTop: '2px solid #6366f1', background: '#eef2ff', fontWeight: 800 }}>
                    <td colSpan={6} style={{ padding: '0.5rem 0.6rem', color: '#4338ca' }}>Total do dia</td>
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', color: '#4338ca' }}>
                      {fmtNum(resumo.viagens, 0)}
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#166534' }}>
                      {fmtNum(resumo.toneladas, 2)}
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#92400e' }}>
                      {fmtNum(resumo.km, 0)}
                    </td>
                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', color: '#6b21a8' }}>
                      {fmtNum(resumo.horas, 1)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CardResumo({ label, valor, cor }: { label: string; valor: string; cor: string }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '8px', padding: '0.5rem 0.65rem',
      border: '1px solid #e2e8f0', borderTop: `3px solid ${cor}`,
    }}>
      <div style={{ fontSize: '0.52rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', marginTop: '0.05rem' }}>{valor}</div>
    </div>
  );
}

function BannerValidacao({
  validacao,
  validos,
  invalidos,
}: {
  validacao: { ok: boolean; mensagens: string[] };
  validos: number;
  invalidos: number;
}) {
  return (
    <div style={{
      borderRadius: '8px', padding: '0.55rem 0.7rem', marginBottom: '0.5rem',
      border: `1px solid ${validacao.ok ? '#bbf7d0' : '#fde68a'}`,
      background: validacao.ok ? '#f0fdf4' : '#fffbeb',
      display: 'flex', gap: '0.45rem', alignItems: 'flex-start',
    }}>
      {validacao.ok
        ? <FiCheckCircle size={15} color="#16a34a" />
        : <FiAlertTriangle size={15} color="#d97706" />}
      <div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: validacao.ok ? '#166534' : '#92400e' }}>
          {validacao.ok ? 'Dados conferidos' : 'Conferência dos registros'}
        </div>
        {validacao.mensagens.slice(0, 2).map((msg) => (
          <div key={msg} style={{ fontSize: '0.66rem', color: '#475569' }}>{msg}</div>
        ))}
        <div style={{ fontSize: '0.63rem', color: '#64748b', marginTop: '0.15rem' }}>
          {validos} válido(s) · {invalidos} com inconsistência
        </div>
      </div>
    </div>
  );
}

const th: CSSProperties = {
  padding: '0.5rem 0.6rem',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: '0.68rem',
};

const td: CSSProperties = { padding: '0.45rem 0.6rem' };

const btnTopo: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
  fontSize: '0.72rem', fontWeight: 600, padding: '0.35rem 0.65rem',
  borderRadius: '6px', border: '1px solid #475569',
  background: 'rgba(255,255,255,0.08)', color: '#e2e8f0', cursor: 'pointer',
};
