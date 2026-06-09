import { useState, useEffect } from 'react'
import { FiX, FiBarChart2, FiClock, FiMapPin, FiAlertCircle, FiTruck } from 'react-icons/fi'
import coletaService from '../services/coletaService'
import '../styles/Dashboard.css'

interface EstudoViagensModalProps {
  coletaId: number
  placa: string
  dataSaida: string
  onClose: () => void
}

interface Viagem {
  numero: number
  km: number | null
  hora: number | null
  horaFormatada: string
  duracaoMinutos: number
  duracaoFormatada: string
  velocidadeMedia: number | null
}

interface EstudoData {
  viagens: Viagem[]
  totalKm: number
  totalHoras: number
}

const CORES_ROTAS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444']

export default function EstudoViagensModal({ coletaId, placa, dataSaida, onClose }: EstudoViagensModalProps) {
  const [estudo, setEstudo] = useState<EstudoData | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setCarregando(true)
    setErro(null)
    coletaService.getEstudoViagens(coletaId)
      .then(data => {
        setEstudo(data)
        setCarregando(false)
      })
      .catch(err => {
        setErro(err?.response?.data?.error || err?.message || 'Erro ao carregar estudo')
        setCarregando(false)
      })
  }, [coletaId])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: '16px',
          width: '90vw',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)',
          color: 'white',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <FiTruck size={18} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                Estudo das Viagens
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.8 }}>
              {placa} — {dataSaida ? new Date(dataSaida).toLocaleDateString('pt-BR') : 'Data não informada'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.2s',
            }}
            onMouseOver={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.25)')}
            onMouseOut={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' }}>
          {carregando && (
            <div style={{ textAlign: 'center', padding: '2.5rem' }}>
              <div style={{
                width: '32px', height: '32px',
                border: '3px solid #e2e8f0', borderTopColor: '#3b82f6',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                margin: '0 auto 0.75rem',
              }} />
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Calculando estudo das viagens...</p>
            </div>
          )}

          {erro && (
            <div style={{
              textAlign: 'center', padding: '2rem',
              background: '#fef2f2', borderRadius: '12px',
              border: '1px solid #fecaca',
            }}>
              <FiAlertCircle size={28} style={{ color: '#ef4444', marginBottom: '0.5rem' }} />
              <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{erro}</p>
            </div>
          )}

          {estudo && estudo.viagens.length === 0 && !carregando && (
            <div style={{
              textAlign: 'center', padding: '2rem',
              background: '#f8fafc', borderRadius: '12px',
              border: '1px dashed #cbd5e1',
            }}>
              <FiMapPin size={28} style={{ color: '#94a3b8', marginBottom: '0.5rem' }} />
              <p style={{ color: '#64748b', fontSize: '0.85rem' }}>
                Nenhuma viagem registrada para esta coleta.
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.3rem' }}>
                Os dados de KM ROTA e HORA ROTA precisam estar na planilha.
              </p>
            </div>
          )}

          {/* Tabela de Viagens */}
          {estudo && estudo.viagens.length > 0 && (
            <>
              {/* Cards resumo */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.6rem',
                marginBottom: '1.25rem',
              }}>
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  borderLeft: '4px solid #3b82f6',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>Total KM</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                    {estudo.totalKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km
                  </div>
                </div>
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  borderLeft: '4px solid #22c55e',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>Total Horas</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                    {String(Math.floor(estudo.totalHoras)).padStart(2, '0')}h{String(Math.round((estudo.totalHoras % 1) * 60)).padStart(2, '0')}m
                  </div>
                </div>
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  borderLeft: '4px solid '#f59e0b',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>Viagens</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                    {estudo.viagens.length}
                  </div>
                </div>
                <div style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  borderLeft: '4px solid #a855f7',
                }}>
                  <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>Média KM/Viagem</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1e293b' }}>
                    {estudo.viagens.length > 0
                      ? (estudo.totalKm / estudo.viagens.length).toFixed(1)
                      : '0'} km
                  </div>
                </div>
              </div>

              {/* Tabela detalhada */}
              <div style={{
                borderRadius: '12px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.82rem',
                }}>
                  <thead>
                    <tr style={{ background: '#1e293b', color: 'white' }}>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'left' }}>Rota</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>KM</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Hora</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Duração</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Vel. Média</th>
                      <th style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>Desempenho</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estudo.viagens.map((v, i) => {
                      const kmPorHora = v.km && v.duracaoMinutos > 0
                        ? v.km / (v.duracaoMinutos / 60)
                        : 0
                      return (
                        <tr key={v.numero} style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                        }}>
                          <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              background: CORES_ROTAS[i % CORES_ROTAS.length],
                              color: 'white',
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              marginRight: '0.4rem',
                            }}>
                              {v.numero}
                            </span>
                            Rota {v.numero}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                            {v.km ? v.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#64748b' }}>
                            {v.horaFormatada}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            <span style={{
                              background: v.duracaoMinutos > 0 ? '#eff6ff' : '#f8fafc',
                              color: v.duracaoMinutos > 0 ? '#2563eb' : '#94a3b8',
                              padding: '0.2rem 0.5rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                            }}>
                              {v.duracaoFormatada}
                            </span>
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600 }}>
                            {v.velocidadeMedia !== null
                              ? v.velocidadeMedia.toFixed(1) + ' km/h'
                              : v.km && v.duracaoMinutos > 0
                                ? (v.km / (v.duracaoMinutos / 60)).toFixed(1) + ' km/h'
                                : '—'}
                          </td>
                          <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                            {v.km && v.km > 0 ? (
                              <BarraDesempenho valor={v.km} max={Math.max(...estudo.viagens.filter(x => x.km).map(x => x.km || 0), 1)} cor={CORES_ROTAS[i % CORES_ROTAS.length]} />
                            ) : (
                              <span style={{ color: '#cbd5e1', fontSize: '0.7rem' }}>—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {/* Linha de total */}
                    <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                      <td style={{ padding: '0.65rem 0.75rem', color: '#475569' }}>Total</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b' }}>
                        {estudo.totalKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#64748b' }}>—</td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: '#2563eb' }}>
                        {String(Math.floor(estudo.totalHoras)).padStart(2, '0')}h{String(Math.round((estudo.totalHoras % 1) * 60)).padStart(2, '0')}m
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', color: '#1e293b' }}>
                        {estudo.totalHoras > 0
                          ? (estudo.totalKm / estudo.totalHoras).toFixed(1) + ' km/h'
                          : '—'}
                      </td>
                      <td style={{ padding: '0.65rem 0.75rem' }}></td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Legenda de ícones */}
              <div style={{
                marginTop: '0.75rem',
                display: 'flex',
                gap: '1.25rem',
                justifyContent: 'center',
                fontSize: '0.7rem',
                color: '#94a3b8',
                flexWrap: 'wrap',
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FiClock size={11} /> Horário da rota
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FiMapPin size={11} /> KM percorrido
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <FiBarChart2 size={11} /> Velocidade média
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Mini barra de desempenho visual */
function BarraDesempenho({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.min((valor / max) * 100, 100) : 0
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.3rem',
      justifyContent: 'flex-end',
    }}>
      <div style={{
        width: '50px',
        height: '6px',
        background: '#e2e8f0',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          background: cor,
          borderRadius: '3px',
          transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{ fontSize: '0.65rem', color: '#64748b', width: '20px', textAlign: 'right' }}>
        {Math.round(pct)}%
      </span>
    </div>
  )
}
