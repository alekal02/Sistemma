import { memo, useMemo } from 'react';
import {
  FiDollarSign, FiActivity, FiTruck, FiClock, FiMapPin, FiTrendingUp,
  FiBarChart2, FiAlertCircle,
} from 'react-icons/fi';
import type { DashboardExecutivoResponse } from '../../services/dashboardExecutivoService';
import { temGrupoAtivo } from '../../config/executivoLayout';
import { isKpiFinanceiro, tooltipComparacaoVariacao } from './dashboardUtils';
import { CardFinanceiro, CardOperacional, ResumoExecutivoCiclo } from './dashboardShared';

export interface DashboardKPIsProps {
  dados: DashboardExecutivoResponse;
  widgetsAtivos: Set<string>;
  widgetAtivo: (id: string) => boolean;
}

const DashboardKPIs = memo(function DashboardKPIs({
  dados,
  widgetsAtivos,
  widgetAtivo,
}: DashboardKPIsProps) {
  const { financeiro: f, operacional: o, graficos: g, periodo: p, resumoCiclo, metadados } = dados;
  const comparacaoAnterior = p.comparacaoAnterior;

  const kpisFinanceiros = useMemo(
    () => (dados.kpisCalculados || []).filter(isKpiFinanceiro),
    [dados.kpisCalculados],
  );
  const kpisOperacionais = useMemo(
    () => (dados.kpisCalculados || []).filter((k) => !isKpiFinanceiro(k)),
    [dados.kpisCalculados],
  );

  const semDadosCiclo = (metadados.totalRegistrosAtual ?? 0) === 0 && o.viagens.valor <= 0;

  return (
    <>
      {semDadosCiclo && (
              <div className="exec-sem-dados-banner">
                <FiAlertCircle size={16} />
                <div>
                  <strong>Nenhum dado da planilha neste ciclo.</strong>
                  {' '}Selecione o contrato/serviço correto, navegue para o ciclo com upload ou importe planilhas no serviço.
                </div>
              </div>
            )}
      
            {resumoCiclo && !semDadosCiclo && (
              <ResumoExecutivoCiclo
                resumo={resumoCiclo}
                metadados={metadados}
                usandoEstimativa={g.usandoEstimativa}
              />
            )}
      
            {/* ═══ CAMADA 1: PAINEL FINANCEIRO ═══ */}
            {temGrupoAtivo(widgetsAtivos, 'financeiro') && (
              <>
                <div className="exec-section-title">
                  <div className="bar green" />
                  <span>Painel Financeiro</span>
                </div>
      
                <div className="financeiro-grid">
                  {widgetAtivo('fin_faturamento') && (
                    <CardFinanceiro
                      label="Faturamento Total"
                      card={f.faturamento}
                      destaque
                      icone={<FiDollarSign size={14} />}
                      origem={g.usandoEstimativa ? 'estimado' : 'real'}
                      comparacaoTooltip={tooltipComparacaoVariacao(f.faturamento.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('fin_custo') && (
                    <CardFinanceiro
                      label="Custo Operacional"
                      card={f.custoOperacional}
                      icone={<FiActivity size={14} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(f.custoOperacional.variacao, comparacaoAnterior, 'abastecimento')}
                    />
                  )}
                  {widgetAtivo('fin_margem') && (
                    <CardFinanceiro
                      label="Margem Bruta"
                      card={f.margemBruta}
                      icone={<FiTrendingUp size={14} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(f.margemBruta.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('fin_receita_hora') && (
                    <CardFinanceiro
                      label="Receita por Hora"
                      card={f.receitaHora}
                      icone={<FiClock size={14} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(f.receitaHora.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('fin_ticket') && (
                    <CardFinanceiro
                      label="Ticket Médio"
                      card={f.ticketMedio}
                      icone={<FiBarChart2 size={14} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(f.ticketMedio.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                </div>
      
                {kpisFinanceiros.length > 0 && (
                  <div className="financeiro-grid exec-kpis-extra">
                    {kpisFinanceiros.map((kpi) => (
                      <div key={kpi.id} className={`financeiro-card${kpi.ehProjecaoCiclo ? ' kpi-projecao' : ''}`}>
                        <div className="card-label">{kpi.nome}</div>
                        <div className="card-valor">{kpi.formatado}</div>
                        {kpi.detalhe && (
                          <div className="card-detalhe" title={kpi.detalhe}>{kpi.detalhe}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
      
            {/* ═══ CAMADA 2: PAINEL OPERACIONAL ═══ */}
            {temGrupoAtivo(widgetsAtivos, 'operacional') && (
              <>
                <div className="exec-section-title">
                  <div className="bar blue" />
                  <span>Painel Operacional</span>
                </div>
      
                <div className="operacional-grid">
                  {widgetAtivo('op_tonelagem') && (
                    <CardOperacional
                      label="Tonelagem"
                      card={o.tonelagem}
                      icone={<FiTruck size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.tonelagem.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('op_km') && (
                    <CardOperacional
                      label="KM Rodados"
                      card={o.kmRodados}
                      icone={<FiMapPin size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.kmRodados.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('op_viagens') && (
                    <CardOperacional
                      label="Viagens"
                      card={o.viagens}
                      icone={<FiActivity size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.viagens.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('op_coletores') && (
                    <CardOperacional
                      label="Coletores Ativos"
                      card={o.coletoresAtivos}
                      icone={<FiTruck size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.coletoresAtivos.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('op_horas') && (
                    <CardOperacional
                      label="Horas Produtivas"
                      card={o.horasProdutivas}
                      icone={<FiClock size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.horasProdutivas.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                  {widgetAtivo('op_eficiencia') && (
                    <CardOperacional
                      label="Eficiência (t/km)"
                      card={o.eficiencia}
                      icone={<FiTrendingUp size={12} />}
                      comparacaoTooltip={tooltipComparacaoVariacao(o.eficiencia.variacao, comparacaoAnterior, 'planilha')}
                    />
                  )}
                </div>
      
                {kpisOperacionais.length > 0 && (
                  <div className="operacional-grid exec-kpis-extra">
                    {kpisOperacionais.map((kpi) => (
                      <div key={kpi.id} className="operacional-card">
                        <div className="label">{kpi.nome}</div>
                        <div className="valor">{kpi.formatado}</div>
                        {kpi.detalhe && (
                          <div className="card-detalhe" title={kpi.detalhe}>{kpi.detalhe}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
    </>
  );
});

export default DashboardKPIs;
