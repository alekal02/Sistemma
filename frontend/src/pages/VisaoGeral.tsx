import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiSettings, FiRefreshCw, FiBarChart2, FiAlertCircle,
  FiTrendingUp, FiDollarSign, FiActivity, FiTruck,
  FiClock, FiMapPin, FiArrowRight, FiDatabase,
} from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import servicoService from '../services/servicoService';
import type { ServicoConsolidado, KpiConsolidadoItem } from '../services/servicoService';
import '../styles/Dashboard.css';

function formatarUltimoUpload(data: string | null): string {
  if (!data) return 'Nunca';
  const d = new Date(data);
  const agora = new Date();
  const diffMs = agora.getTime() - d.getTime();
  const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHoras < 1) return 'Agora mesmo';
  if (diffHoras < 24) return 'Ha ' + diffHoras + 'h';
  const diffDias = Math.floor(diffHoras / 24);
  if (diffDias < 7) return 'Ha ' + diffDias + 'd';
  return d.toLocaleDateString('pt-BR');
}

function estaDesatualizado(data: string | null): boolean {
  if (!data) return false;
  return Date.now() - new Date(data).getTime() > 7 * 24 * 60 * 60 * 1000;
}

const CORES_KPI: Record<string, { bg: string; text: string; bar: string }> = {
  numero: { bg: '#f1f5f9', text: '#1e293b', bar: '#22c55e' },
  moeda: { bg: '#fefce8', text: '#b45309', bar: '#f59e0b' },
  porcentagem: { bg: '#ecfdf5', text: '#047857', bar: '#22c55e' },
};

function iconeKpi(nome: string): React.ReactElement {
  const n = nome.toUpperCase();
  if (n.includes('FATUR') || n.includes('RECEITA') || n.includes('R$')) return <FiDollarSign size={14} />;
  if (n.includes('TON') || n.includes('PESO') || n.includes('CARGA')) return <FiTruck size={14} />;
  if (n.includes('KM') || n.includes('DIST') || n.includes('QUILO')) return <FiMapPin size={14} />;
  if (n.includes('HORA') || n.includes('TEMPO') || n.includes('DURA')) return <FiClock size={14} />;
  if (n.includes('VIA') || n.includes('COLETA') || n.includes('REGISTRO')) return <FiActivity size={14} />;
  if (n.includes('MEDIA') || n.includes('EFIC') || n.includes('PROD')) return <FiTrendingUp size={14} />;
  return <FiBarChart2 size={14} />;
}

function KpiMiniCard({ kpi }: { kpi: KpiConsolidadoItem }) {
  const cor = CORES_KPI[kpi.formato] || CORES_KPI.numero;
  return (
    <div className="vg-mini-kpi" style={{ background: cor.bg, borderLeftColor: cor.bar }}>
      <div className="vg-mini-kpi-header">
        <span className="vg-mini-kpi-icon">{iconeKpi(kpi.nome)}</span>
        <span className="vg-mini-kpi-label">{kpi.nome}</span>
      </div>
      <div className="vg-mini-kpi-value" style={{ color: cor.text }}>
        {kpi.formatado || '-'}
      </div>
    </div>
  );
}

function ServicoCard({ servico, onNavigate }: { servico: ServicoConsolidado; onNavigate: (path: string) => void }) {
  const desatualizado = estaDesatualizado(servico.ultimoUpload);
  const kpisVisiveis = servico.kpis.slice(0, 6);
  const kpisExcedentes = servico.kpis.length - 6;

  return (
    <div
      id={'servico-card-' + servico.id}
      className={'vg-card' + (desatualizado ? ' desatualizado' : '')}
    >
      <div className="vg-card-header">
        <div className="vg-card-header-left">
          <div className="vg-card-contrato">
            <FiDatabase size={11} /> {servico.contratoNome}
          </div>
          <div className="vg-card-servico-nome">
            {servico.servicoNome}
          </div>
        </div>
        <div className="vg-card-badges">
          {desatualizado && (
            <span className="vg-badge vg-badge-warning">Desatualizado</span>
          )}
          {!servico.temConfigDashboard && (
            <span className="vg-badge vg-badge-info">Sem KPIs</span>
          )}
          {servico.temConfigDashboard && servico.kpis.length > 0 && (
            <span className="vg-badge vg-badge-success">{servico.kpis.length} KPIs</span>
          )}
          <span className="vg-badge vg-badge-neutral">
            {servico.totalRegistros.toLocaleString('pt-BR')} registros
          </span>
        </div>
      </div>

      <div className="vg-card-kpis">
        {kpisVisiveis.length > 0 ? (
          <div className="vg-kpi-grid">
            {kpisVisiveis.map((kpi, idx) => (
              <KpiMiniCard key={kpi.id || kpi.nome + idx} kpi={kpi} />
            ))}
            {kpisExcedentes > 0 && (
              <div className="vg-kpi-mais">+{kpisExcedentes} mais</div>
            )}
          </div>
        ) : (
          <div className="vg-kpi-empty">
            <FiBarChart2 size={24} style={{ opacity: 0.3, marginBottom: '0.35rem' }} />
            <div>Nenhum KPI configurado</div>
          </div>
        )}
      </div>

      <div className="vg-card-footer">
        <span className={'vg-card-ultimo-upload' + (desatualizado ? ' desatualizado' : '')}>
          <FiClock size={11} /> {formatarUltimoUpload(servico.ultimoUpload)}
        </span>
        <div className="vg-card-actions">
          <button
            className="vg-btn-action vg-btn-view"
            onClick={() => onNavigate('/contratos/' + servico.contratoId + '/servicos/' + servico.id)}
          >
            <FiBarChart2 size={12} /> Ver
          </button>
          <button
            className="vg-btn-action vg-btn-config"
            onClick={() => onNavigate('/contratos/' + servico.contratoId + '/servicos/' + servico.id + '/configurar')}
          >
            <FiSettings size={12} /> Configurar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VisaoGeral() {
  const navigate = useNavigate();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [servicos, setServicos] = useState<ServicoConsolidado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setBreadcrumbs([{ label: 'Dashboard' }]);
  }, [setBreadcrumbs]);

  const carregarDados = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await servicoService.getKpisConsolidado();
      setServicos(data.servicos || []);
    } catch {
      setErro('Erro ao carregar dados dos servicos');
      adicionarToast('Erro ao carregar dashboard', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast]);

  useEffect(() => { carregarDados(); }, []);

  const handleNavigate = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  const totalServicos = servicos.length;
  const totalRegistros = servicos.reduce((s, sv) => s + sv.totalRegistros, 0);

  // Agrupar por contrato
  const grupos = new Map<string, { contratoNome: string; contratoId: string; servicos: ServicoConsolidado[] }>();
  for (const s of servicos) {
    if (!grupos.has(s.contratoId)) {
      grupos.set(s.contratoId, { contratoNome: s.contratoNome, contratoId: s.contratoId, servicos: [] });
    }
    grupos.get(s.contratoId)!.servicos.push(s);
  }

  if (carregando) {
    return (
      <div className="vg-container">
        <div className="skeleton" style={{ height: '28px', width: '300px', marginBottom: '0.5rem', borderRadius: '6px' }} />
        <div className="skeleton" style={{ height: '14px', width: '200px', marginBottom: '1.5rem', borderRadius: '6px' }} />
        <div className="vg-servicos-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: '240px', borderRadius: '12px' }} />
          ))}
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="dashboard-error">
        <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>
          <FiAlertCircle size={48} style={{ color: '#ef4444' }} />
        </div>
        <h3 style={{ color: '#dc2626', marginBottom: '0.5rem' }}>Erro ao carregar</h3>
        <p>{erro}</p>
        <button className="btn btn-primary" onClick={() => carregarDados()}>
          <FiRefreshCw size={14} /> Tentar Novamente
        </button>
      </div>
    );
  }

  if (servicos.length === 0) {
    return (
      <div className="dashboard-empty">
        <span className="empty-icon">
          <FiBarChart2 size={40} style={{ color: '#22c55e', opacity: 0.6 }} />
        </span>
        <h3 style={{ color: '#334155', marginBottom: '0.35rem' }}>Nenhum servico com dados</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
          Crie um contrato, adicione um servico e faca upload de uma planilha<br />
          para comecar a visualizar os indicadores.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/contratos')}
          style={{ padding: '0.5rem 1.25rem' }}
        >
          Ir para Contratos <FiArrowRight size={14} style={{ marginLeft: '0.25rem' }} />
        </button>
      </div>
    );
  }

  return (
    <div className="vg-container">
      <div className="vg-header">
        <h2>Dashboard</h2>
        <p>
          {totalServicos} serviço(s) em {grupos.size} contrato(s) —{' '}
          {totalRegistros.toLocaleString('pt-BR')} registros
        </p>
      </div>

      {Array.from(grupos.entries()).map(([contratoId, grupo]) => (
        <div key={contratoId} className="vg-grupo">
          <div className="vg-grupo-header">
            <div className="vg-grupo-indicator" />
            <span className="vg-grupo-nome">{grupo.contratoNome}</span>
            <span className="vg-grupo-badge">
              {grupo.servicos.length} serviço{grupo.servicos.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="vg-servicos-grid">
            {grupo.servicos.map(servico => (
              <ServicoCard key={servico.id} servico={servico} onNavigate={handleNavigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
