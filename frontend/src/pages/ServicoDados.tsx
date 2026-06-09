/* ============================================
   ServicoDados — Página separada de visualização de dados
   URL: /contratos/:contractId/servicos/:servicoId/dados
   ============================================ */

import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBarChart2, FiFileText } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DataTable from '../components/DataTable';
import SkeletonLoader from '../components/SkeletonLoader';
import '../styles/ContratoDetalhe.css';

interface ColunaDetectada {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
  amostras: (string | number | null)[];
  valoresUnicos: number;
  nulos: number;
}

interface PadraoResponse {
  servico: {
    id: string;
    nome: string;
    padraoPlanilha: any;
  };
  uploads: {
    total: number;
    totalLinhas: number;
    totalImportados: number;
  };
}

export default function ServicoDados() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [carregando, setCarregando] = useState(true);
  const [servicoNome, setServicoNome] = useState('');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalUploads, setTotalUploads] = useState(0);

  useEffect(() => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    Promise.all([
      fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/padrao', {
        headers: { Authorization: 'Bearer ' + token },
      }),
    ]).then(async ([res]) => {
      if (res.ok) {
        const data: PadraoResponse = await res.json();
        setServicoNome(data.servico?.nome || 'Serviço');
        setColunas(data.servico?.padraoPlanilha?.colunas || []);
        setTotalRegistros(data.uploads?.totalImportados || 0);
        setTotalUploads(data.uploads?.total || 0);
      }
    }).catch(() => {
      adicionarToast('Erro ao carregar dados', 'error');
    }).finally(() => {
      setCarregando(false);
    });
  }, [contractId, servicoId, token, adicionarToast]);

  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <SkeletonLoader tipo="table" quantidade={5} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header com navegação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-ghost" onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/dashboard')}>
            <FiArrowLeft size={14} /> Dashboard
          </button>
          <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#1e293b' }}>
            <FiFileText size={16} style={{ marginRight: '0.3rem' }} />
            Dados: {servicoNome}
          </h3>
        </div>
        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
          {totalUploads} upload{totalUploads !== 1 ? 's' : ''} · {totalRegistros.toLocaleString('pt-BR')} registro{totalRegistros !== 1 ? 's' : ''}
        </div>
      </div>

      {colunas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
          <FiBarChart2 size={48} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
          <h3>Nenhum dado disponível</h3>
          <p style={{ fontSize: '0.85rem' }}>Faça upload de uma planilha para visualizar os dados.</p>
        </div>
      ) : (
        <DataTable
          servicoId={servicoId!}
          contractId={contractId!}
          token={token}
          adicionarToast={adicionarToast}
          colunasPadrao={colunas}
        />
      )}
    </div>
  );
}
