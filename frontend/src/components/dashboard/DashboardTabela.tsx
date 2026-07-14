import { memo, useState } from 'react';
import { FiAlertCircle } from 'react-icons/fi';
import type { DashboardExecutivoResponse } from '../../services/dashboardExecutivoService';
import RankingMotoristasTable from '../RankingMotoristasTable';
import MotoristaBarChart from '../MotoristaBarChart';
import { tooltipComparacaoVariacao } from './dashboardUtils';
import { SecaoExpansivel, VariacaoBadge } from './dashboardShared';

export interface DashboardTabelaProps {
  dados: DashboardExecutivoResponse;
  widgetAtivo: (id: string) => boolean;
}

const DashboardTabela = memo(function DashboardTabela({
  dados,
  widgetAtivo,
}: DashboardTabelaProps) {
  const { analiseFinanceira: af, analiseOperacional: ao, periodo: p } = dados;
  const comparacaoAnterior = p.comparacaoAnterior;
  const [abaMotorista, setAbaMotorista] = useState<'ranking' | 'comparativo'>('ranking');

  return (
    <>
            {/* ═══ ANÁLISE FINANCEIRA EXPANSÍVEL (RECEITA) ═══ */}
            {widgetAtivo('sec_analise_financeira') && (
            <SecaoExpansivel titulo="Análise Financeira Detalhada — Receita" cor="#f59e0b">
              <div className="analise-grid" style={{ marginBottom: '1rem' }}>
                <div className="analise-card">
                  <div className="label">Projeção Mensal</div>
                  <div className="value">
                    {af.projecaoMensal.projecao > 0
                      ? `R$ ${af.projecaoMensal.projecao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : <span className="nao-disponivel">Sem dados</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: '0.15rem' }}>
                    Média diária: R$ {af.projecaoMensal.mediaDiaria.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • {af.projecaoMensal.diasRestantes} dias restantes
                  </div>
                </div>
      
                <div className="analise-card">
                  <div className="label">🎯 Projeção — Cenário Realista</div>
                  <div className="value" style={{ color: '#059669' }}>
                    {af.projecaoCenarios?.cenarios?.[1]?.valor > 0
                      ? `R$ ${af.projecaoCenarios?.cenarios?.[1]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : <span className="nao-disponivel">Sem dados</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.15rem' }}>
                    {af.projecaoCenarios?.diasRestantes > 0
                      ? `${af.projecaoCenarios?.diasRestantes} dias restantes`
                      : 'Fim do período'}
                  </div>
                </div>
      
                <div className="analise-card" style={{ borderTopColor: '#f59e0b' }}>
                  <div className="label">⚡ Cenário Otimista</div>
                  <div className="value" style={{ color: '#059669' }}>
                    {af.projecaoCenarios?.cenarios?.[0]?.valor > 0
                      ? `R$ ${af.projecaoCenarios?.cenarios?.[0]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : <span className="nao-disponivel">—</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
                    {af.projecaoCenarios?.cenarios?.[0]?.diferenca
                      ? `+${af.projecaoCenarios?.cenarios?.[0]?.diferenca.toFixed(1)}% sobre o atual`
                      : ''}
                  </div>
                </div>
      
                <div className="analise-card" style={{ borderTopColor: '#94a3b8' }}>
                  <div className="label">📉 Cenário Pessimista</div>
                  <div className="value" style={{ color: '#dc2626' }}>
                    {af.projecaoCenarios?.cenarios?.[2]?.valor > 0
                      ? `R$ ${af.projecaoCenarios?.cenarios?.[2]?.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                      : <span className="nao-disponivel">—</span>
                    }
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.1rem' }}>
                    {af.projecaoCenarios?.cenarios?.[2]?.diferenca
                      ? `${af.projecaoCenarios?.cenarios?.[2]?.diferenca.toFixed(1)}% sobre o atual`
                      : ''}
                  </div>
                </div>
              </div>
      
              {/* ═══ NOVOS INDICADORES DE RECEITA ═══ */}
              {(af.faturamentoPorRegional?.length > 0 ||
                af.faturamentoPorTurno?.length > 0 ||
                af.faturamentoPorDiaSemana?.length > 0) && (
                <>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.5rem 0' }}>
                    📍 Receita por Segmentação
                  </h4>
                  <div className="analise-grid" style={{ marginBottom: '0.75rem' }}>
                    {/* Regional */}
                    {af.faturamentoPorRegional?.length > 0 && (
                      <div className="analise-card">
                        <div className="label">🌎 Receita por Regional</div>
                        <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                          <thead>
                            <tr><th>Regional</th><th>Receita</th><th>Viagens</th></tr>
                          </thead>
                          <tbody>
                            {af.faturamentoPorRegional?.slice(0, 6).map((r, i) => (
                              <tr key={i}>
                                <td><strong>{r.regional}</strong></td>
                                <td>{r.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td>{r.viagens}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
      
                    {/* Turno */}
                    {af.faturamentoPorTurno?.length > 0 && (
                      <div className="analise-card">
                        <div className="label">☀️ Receita por Turno</div>
                        <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                          <thead>
                            <tr><th>Turno</th><th>Receita</th><th>Média/Viagem</th></tr>
                          </thead>
                          <tbody>
                            {af.faturamentoPorTurno?.map((t, i) => (
                              <tr key={i}>
                                <td><strong>{t.turno}</strong></td>
                                <td>{t.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td>{t.mediaPorViagem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
      
                    {/* Dia da Semana */}
                    {af.faturamentoPorDiaSemana?.length > 0 && (
                      <div className="analise-card">
                        <div className="label">📅 Receita por Dia da Semana</div>
                        <table className="analise-tabela" style={{ fontSize: '0.68rem', marginTop: '0.3rem' }}>
                          <thead>
                            <tr><th>Dia</th><th>Receita</th><th>Viagens</th></tr>
                          </thead>
                          <tbody>
                            {af.faturamentoPorDiaSemana?.map((d, i) => (
                              <tr key={i}>
                                <td><strong>{d.diaNome}</strong></td>
                                <td>{d.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                                <td>{d.viagens}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
      
              {/* ═══ RANKING DE MOTORISTAS POR RECEITA ═══ */}
              {af.faturamentoPorMotorista?.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.5rem 0' }}>
                    🏆 Ranking de Motoristas por Receita
                  </h4>
                  <table className="analise-tabela">
                    <thead>
                      <tr><th>#</th><th>Motorista</th><th>Placa</th><th>Faturamento</th><th>Viagens</th><th>Ticket Médio</th></tr>
                    </thead>
                    <tbody>
                      {af.faturamentoPorMotorista?.slice(0, 15).map((m, i) => {
                        const ticket = af.ticketMedioPorMotorista?.find(t => t.motorista === m.motorista);
                        return (
                          <tr key={i}>
                            <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                            <td><strong>{m.motorista}</strong></td>
                            <td style={{ fontSize: '0.68rem', color: '#64748b' }}>{m.placa || '—'}</td>
                            <td>{m.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                            <td>{m.viagens}</td>
                            <td style={{ fontWeight: 600 }}>
                              {ticket?.ticketMedio
                                ? ticket.ticketMedio.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
      
              {af.margemPorTipo.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                    Margem por Tipo de Caminhão
                  </h4>
                  <table className="analise-tabela">
                    <thead>
                      <tr><th>Tipo</th><th>Receita</th><th>Custo</th><th>Margem</th></tr>
                    </thead>
                    <tbody>
                      {af.margemPorTipo.map((m, i) => (
                        <tr key={i}>
                          <td><strong>{m.tipo}</strong></td>
                          <td>{m.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>{m.custo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                          <td>
                            <span style={{ color: m.margem >= 0 ? '#059669' : '#dc2626', fontWeight: 700 }}>
                              {m.margem.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
      
              {af.faturamentoPorColetor.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', margin: '0.75rem 0 0.5rem' }}>
                    Faturamento por Coletor
                  </h4>
                  <table className="analise-tabela">
                    <thead>
                      <tr><th>#</th><th>Coletor</th><th>Faturamento</th></tr>
                    </thead>
                    <tbody>
                      {af.faturamentoPorColetor.slice(0, 10).map((c, i) => (
                        <tr key={i}>
                          <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                          <td><strong>{c.coletor}</strong></td>
                          <td>{c.faturamento.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </SecaoExpansivel>
            )}
      
            {/* ═══ ANÁLISE OPERACIONAL EXPANSÍVEL ═══ */}
            {widgetAtivo('sec_analise_operacional') && (
            <SecaoExpansivel titulo="Análise Operacional Detalhada" cor="#6366f1">
              <div className="analise-grid" style={{ marginBottom: '1rem' }}>
                <div className="analise-card">
                  <div className="label">KM Médio por Viagem</div>
                  <div className="value">{ao.kmMedioViagem.atual.toFixed(1)} km</div>
                  <VariacaoBadge
                    variacao={ao.kmMedioViagem.variacao}
                    tooltip={tooltipComparacaoVariacao(ao.kmMedioViagem.variacao, comparacaoAnterior, 'planilha')}
                  />
                </div>
      
                <div className="analise-card">
                  <div className="label">Horas Produtivas Médias</div>
                  <div className="value">{ao.horasMedias.atual.toFixed(1)}h</div>
                  <VariacaoBadge
                    variacao={ao.horasMedias.variacao}
                    tooltip={tooltipComparacaoVariacao(ao.horasMedias.variacao, comparacaoAnterior, 'planilha')}
                  />
                </div>
      
      
              </div>
      
              {ao.produtividadePorColetor.length > 0 && (
                <>
                  <h4 style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem' }}>
                    Produtividade por Coletor
                  </h4>
                  <table className="analise-tabela">
                    <thead>
                      <tr><th>#</th><th>Coletor</th><th>Tonelagem</th><th>Viagens</th><th>KM</th><th>t/dia</th></tr>
                    </thead>
                    <tbody>
                      {ao.produtividadePorColetor.slice(0, 10).map((c, i) => (
                        <tr key={i}>
                          <td style={{ color: '#94a3b8' }}>{i + 1}</td>
                          <td><strong>{c.coletor}</strong></td>
                          <td>{c.tonelagem.toFixed(1)} t</td>
                          <td>{c.viagens}</td>
                          <td>{c.km.toFixed(0)} km</td>
                          <td style={{ fontWeight: 700 }}>{c.tonPorDia.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </SecaoExpansivel>
            )}
      
            {/* ═══ ANÁLISE POR MOTORISTA E ROTA ═══ */}
            {widgetAtivo('sec_motoristas_rota') && (
            <SecaoExpansivel
              titulo={`🚛 Análise por Motorista e Rota (${ao.motoristas?.length || 0} motoristas)`}
              cor="#22c55e"
            >
              {ao.motoristas && ao.motoristas.length > 0 ? (
                <>
                  {/* Abas */}
                  <div style={{
                    display: 'flex', gap: '0.25rem', marginBottom: '0.85rem',
                    borderBottom: '2px solid #e2e8f0', paddingBottom: '0.35rem',
                  }}>
                    {[
                      { key: 'ranking', label: '📋 Ranking de Motoristas' },
                      { key: 'comparativo', label: '📊 Comparativo' },
                    ].map(aba => (
                      <button
                        key={aba.key}
                        onClick={() => setAbaMotorista(aba.key as any)}
                        style={{
                          padding: '0.35rem 0.75rem', fontSize: '0.72rem', fontWeight: 700,
                          border: 'none', borderRadius: '6px 6px 0 0',
                          background: abaMotorista === aba.key ? '#22c55e' : '#f1f5f9',
                          color: abaMotorista === aba.key ? 'white' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {aba.label}
                      </button>
                    ))}
                  </div>
      
                  {abaMotorista === 'ranking' && (
                    <div>
                      <RankingMotoristasTable motoristas={ao.motoristas} />
                      {ao.motoristas.length > 0 && (
                        <div style={{ marginTop: '1rem' }}>
                          <MotoristaBarChart
                            motoristas={ao.motoristas}
                            campo="tonPorViagem"
                            titulo="Tonelagem por Viagem (Top 10)"
                          />
                        </div>
                      )}
                    </div>
                  )}
      
                  {abaMotorista === 'comparativo' && ao.motoristas.length > 0 && (
                    <div>
                      <div className="graficos-row-2">
                        <div className="grafico-card" style={{ padding: '0.75rem' }}>
                          <MotoristaBarChart
                            motoristas={ao.motoristas}
                            campo="tonelagem"
                            titulo="Tonelagem Total"
                            topN={8}
                          />
                        </div>
                        <div className="grafico-card" style={{ padding: '0.75rem' }}>
                          <MotoristaBarChart
                            motoristas={ao.motoristas}
                            campo="kmPorViagem"
                            titulo="KM por Viagem"
                            topN={8}
                          />
                        </div>
                      </div>
                      <div className="graficos-row-2">
                        <div className="grafico-card" style={{ padding: '0.75rem' }}>
                          <MotoristaBarChart
                            motoristas={ao.motoristas}
                            campo="tonPorHora"
                            titulo="Produtividade (t/hora)"
                            topN={8}
                          />
                        </div>
                        <div className="grafico-card" style={{ padding: '0.75rem' }}>
                          <MotoristaBarChart
                            motoristas={ao.motoristas}
                            campo="tonPorKm"
                            titulo="Eficiência (t/km)"
                            topN={8}
                          />
                        </div>
                      </div>
                    </div>
                  )}
      
                  {/* Stats rápidos */}
                  <div style={{
                    display: 'flex', gap: '0.75rem', marginTop: '0.75rem',
                    fontSize: '0.68rem', color: '#94a3b8', flexWrap: 'wrap',
                    borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem',
                  }}>
                    <span>{ao.motoristas.reduce((s, m) => s + m.viagens, 0)} viagens</span>
                    <span>{ao.motoristas.length} motoristas</span>
                    <span style={{ marginLeft: 'auto', color: '#64748b' }}>
                      Média: {(ao.motoristas.reduce((s, m) => s + m.tonPorViagem, 0) / (ao.motoristas.length || 1)).toFixed(2)} t/viagem
                    </span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.82rem' }}>
                  <FiAlertCircle size={24} style={{ marginBottom: '0.5rem', opacity: 0.3 }} />
                  <p>Nenhum dado de motorista disponível.</p>
                  <p style={{ fontSize: '0.72rem' }}>Faça upload de uma planilha com coluna <strong>"MOTORISTA"</strong> ou <strong>"PLACA"</strong>.</p>
                </div>
              )}
            </SecaoExpansivel>
            )}
    </>
  );
});

export default DashboardTabela;
