import { useState } from 'react';
import {
  FiChevronDown, FiAlertCircle, FiDollarSign, FiTruck,
} from 'react-icons/fi';
import type {
  DashboardExecutivoResponse,
  ResumoCicloExecutivo,
  Variacao,
} from '../../services/dashboardExecutivoService';

export function VariacaoBadge({
  variacao,
  tooltip,
}: {
  variacao: Variacao;
  tooltip?: string;
}) {
  if (variacao.tipo === 'sem_base') {
    return (
      <span
        className="variacao-badge sem-base"
        title={tooltip || 'Sem dados no ciclo anterior para comparar'}
      >
        Sem base comparativa
      </span>
    );
  }
  if (variacao.tipo === 'estavel' || Math.abs(variacao.valor) < 0.5) {
    return (
      <span className="variacao-badge estavel" title={tooltip}>
        → 0%
      </span>
    );
  }
  const isUp = variacao.tipo === 'aumento';
  return (
    <span className={`variacao-badge ${isUp ? 'aumento' : 'reducao'}`} title={tooltip}>
      {isUp ? '↑' : '↓'} {Math.abs(variacao.valor).toFixed(1)}%
    </span>
  );
}

function MiniTendencia({ svg }: { svg?: string }) {
  if (!svg) return null;
  return (
    <div className="minitendencia" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

export function CardFinanceiro({
  label, card, destaque = false, icone, origem, comparacaoTooltip,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: Variacao; minitendenciaSvg?: string };
  destaque?: boolean;
  icone: React.ReactNode;
  origem?: 'real' | 'estimado';
  comparacaoTooltip?: string;
}) {
  return (
    <div className={`financeiro-card ${destaque ? 'destaque' : ''}`}>
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
        <span style={{ opacity: 0.5 }}>{icone}</span>
        {label}
        {origem && (
          <span className={`origem-badge ${origem}`}>
            {origem === 'estimado' ? '⚡ Estimado' : '✅ Real'}
          </span>
        )}
      </div>
      <div className="valor">{card.formatado}</div>
      <VariacaoBadge variacao={card.variacao} tooltip={comparacaoTooltip} />
      <MiniTendencia svg={card.minitendenciaSvg} />
    </div>
  );
}

export function CardOperacional({
  label, card, icone, comparacaoTooltip,
}: {
  label: string;
  card: { valor: number; formatado: string; variacao: Variacao };
  icone: React.ReactNode;
  comparacaoTooltip?: string;
}) {
  return (
    <div className="operacional-card">
      <div className="label" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
        <span style={{ opacity: 0.5 }}>{icone}</span>
        {label}
      </div>
      <div className="valor">{card.formatado}</div>
      <VariacaoBadge variacao={card.variacao} tooltip={comparacaoTooltip} />
    </div>
  );
}

export function SecaoExpansivel({
  titulo, cor, children, defaultOpen = false,
}: {
  titulo: string; cor: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <div className="expansivel-section">
      <button
        className={`expansivel-header ${aberto ? 'expanded' : ''}`}
        onClick={() => setAberto(!aberto)}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ width: '3px', height: '16px', borderRadius: '2px', background: cor, display: 'inline-block' }} />
          {titulo}
        </span>
        <FiChevronDown size={16} />
      </button>
      {aberto && <div className="expansivel-body">{children}</div>}
    </div>
  );
}

export function ResumoExecutivoCiclo({
  resumo,
  metadados,
  usandoEstimativa,
}: {
  resumo: ResumoCicloExecutivo;
  metadados: DashboardExecutivoResponse['metadados'];
  usandoEstimativa?: boolean;
}) {
  const fmtMoeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtNum = (v: number, dec = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  return (
    <div className="exec-resumo-ciclo">
      <div className="exec-resumo-header">
        <div>
          <div className="exec-resumo-titulo">Resumo do ciclo</div>
          <div className="exec-resumo-sub">
            Dados da planilha importada — rotas = linhas; viagens = soma do CONTADOR DE VIAGENS
            {metadados.fonteDados === 'planilha' && ' · fonte: planilha'}
          </div>
        </div>
        {usandoEstimativa && (
          <span className="exec-resumo-estimativa">
            <FiAlertCircle size={12} /> Faturamento estimado — configure valores no contrato
          </span>
        )}
      </div>
      <div className="exec-resumo-grid">
        <div className="exec-resumo-bloco financeiro">
          <div className="exec-resumo-bloco-titulo"><FiDollarSign size={12} /> Financeiro</div>
          <div className="exec-resumo-itens">
            <div className="exec-resumo-item destaque">
              <span className="lbl">Faturamento</span>
              <span className="val">{fmtMoeda(resumo.faturamento)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Receita / ton</span>
              <span className="val">{fmtMoeda(resumo.receitaTon)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Receita / km</span>
              <span className="val">{fmtMoeda(resumo.receitaKm)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Ticket / viagem</span>
              <span className="val">{fmtMoeda(resumo.ticketMedio)}</span>
            </div>
          </div>
        </div>
        <div className="exec-resumo-bloco operacional">
          <div className="exec-resumo-bloco-titulo"><FiTruck size={12} /> Operacional</div>
          <div className="exec-resumo-itens">
            <div className="exec-resumo-item">
              <span className="lbl">Rotas (linhas)</span>
              <span className="val">{fmtNum(resumo.rotas)}</span>
            </div>
            <div className="exec-resumo-item destaque">
              <span className="lbl">Viagens</span>
              <span className="val">{fmtNum(resumo.viagens)}</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Toneladas</span>
              <span className="val">{fmtNum(resumo.toneladas, 1)} t</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">KM rodados</span>
              <span className="val">{fmtNum(resumo.km)} km</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Ton / viagem</span>
              <span className="val">{fmtNum(resumo.tonPorViagem, 2)} t</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Horas produtivas</span>
              <span className="val">{fmtNum(resumo.horasProdutivas, 1)} h</span>
            </div>
            <div className="exec-resumo-item">
              <span className="lbl">Caminhões ativos</span>
              <span className="val">{fmtNum(resumo.coletoresAtivos)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="exec-resumo-meta">
        {metadados.totalRegistrosAtual.toLocaleString('pt-BR')} registro(s) no período
        {metadados.totalRotasAtual != null && (
          <> · {metadados.totalRotasAtual.toLocaleString('pt-BR')} rota(s) válida(s)</>
        )}
        {metadados.totalViagensAtual != null && (
          <> · {metadados.totalViagensAtual.toLocaleString('pt-BR')} viagem(ns) contabilizada(s)</>
        )}
      </div>
    </div>
  );
}
