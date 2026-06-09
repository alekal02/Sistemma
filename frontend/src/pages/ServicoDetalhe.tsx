/* ============================================
   ServicoDetalhe — Página de detalhes do serviço
   Upload de planilhas, histórico, dados brutos, resumo executivo e configurações
   URL: /contratos/:contractId/servicos/:servicoId/detalhes
   ============================================ */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBarChart2, FiSettings, FiUpload, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import DashboardHeader from '../components/DashboardHeader';
import UploadHistory from '../components/UploadHistory';
import UploadPreviewModal from '../components/UploadPreviewModal';
import DataTable from '../components/DataTable';
import SkeletonLoader from '../components/SkeletonLoader';
import RelatorioQualidade from '../components/RelatorioQualidade';
import QualidadePlanilhaPreview from '../components/QualidadePlanilhaPreview';
import '../styles/ContratoDetalhe.css';

interface ColunaDetectada {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
  amostras: (string | number | null)[];
  valoresUnicos: number;
  nulos: number;
}

interface UploadItem {
  id: number;
  nome: string;
  criadoEm: string;
  linhas: number;
  importados: number;
}

interface PadraoResponse {
  servico: {
    id: string;
    nome: string;
    padraoPlanilha: any;
    configDashboard: any;
  };
  uploads: {
    total: number;
    totalLinhas: number;
    totalImportados: number;
    ultimos: UploadItem[];
  };
  valoresCaminhao?: Record<string, number | null> | null;
}

interface TabItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

// ─── Utilitário de detecção de colunas ───

function detectarColuna(colunas: ColunaDetectada[], termos: string[]): string {
  for (const termo of termos) {
    const termoNorm = termo.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const c of colunas) {
      const nomeNorm = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (nomeNorm === termoNorm) return c.nome;
    }
    // Fallback: match parcial
    for (const c of colunas) {
      const nomeNorm = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (nomeNorm.includes(termoNorm) || termoNorm.includes(nomeNorm)) return c.nome;
    }
  }
  return termos[0] || '';
}

// ─── Mapeamento de placeholders para colunas reais ───

function substituirColunasNaFormula(
  formula: string,
  colunas: ColunaDetectada[],
): string {
  const colPeso = detectarColuna(colunas, ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_TOTAL', 'pesoTotal', 'TONELADA']);
  const colKm = detectarColuna(colunas, ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'kmTotal', 'QUILOMETRO', 'DISTANCIA']);
  const colHora = detectarColuna(colunas, ['HORA SAIDA', 'HORA', 'HORASAIDA', 'HORA_SAIDA', 'horaSaida', 'TEMPO', 'DURACAO']);
  const colPlaca = detectarColuna(colunas, ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO', 'placa']);
  const colTipo = detectarColuna(colunas, ['CAMINHAO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'tipocaminhao', 'CAMINHÃO', 'TIPO']);

  return formula
    .replace(/PESO TOTAL/g, colPeso)
    .replace(/KM TOTAL/g, colKm)
    .replace(/HORA SAIDA/g, colHora)
    .replace(/PLACA/g, colPlaca)
    .replace(/CAMINHAO/g, colTipo);
}

export default function ServicoDetalhe() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();

  const [dados, setDados] = useState<PadraoResponse | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [tabAtiva, setTabAtiva] = useState('uploads');
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Estados do preview de upload
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewDataInfo, setPreviewDataInfo] = useState<any>(null);
  const [previewCarregando, setPreviewCarregando] = useState(false);
  const [arquivoPreview, setArquivoPreview] = useState<File | null>(null);

  // Estado do relatório de qualidade
  const [showQualidade, setShowQualidade] = useState(false);
  const [qualidadeUploadId, setQualidadeUploadId] = useState<number | null>(null);
  const [qualidadePreviewData, setQualidadePreviewData] = useState<any>(null);
  const [corrigindo, setCorrigindo] = useState(false);

  const abrirQualidade = (uploadId?: number) => {
    setQualidadeUploadId(uploadId ?? null);
    setShowQualidade(true);
  };

  const abrirQualidadeUltimoUpload = () => {
    const ultimos = dados?.uploads?.ultimos;
    if (ultimos && ultimos.length > 0) {
      abrirQualidade(ultimos[0].id);
    } else {
      // Tenta pelo serviço (endpoint busca o último upload)
      setQualidadeUploadId(null);
      setShowQualidade(true);
    }
  };

  const ultimoUploadId = useMemo(() => {
    const ultimos = dados?.uploads?.ultimos;
    return ultimos && ultimos.length > 0 ? ultimos[0].id : null;
  }, [dados]);

  const carregarDados = useCallback(async () => {
    if (!contractId || !servicoId) return;
    setCarregando(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/servicos/${servicoId}/padrao`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDados(await res.json());
    } catch {
      adicionarToast('Erro ao carregar dados do serviço', 'error');
    } finally {
      setCarregando(false);
    }
  }, [contractId, servicoId, token, adicionarToast]);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  const handleUpload = async (file: File) => {
    if (!servicoId) return;
    setArquivoPreview(file);
    setShowPreviewModal(true);
    setPreviewCarregando(true);
    setPreviewData(null);
    setPreviewDataInfo(null);
    setQualidadePreviewData(null);

    try {
      const formData = new FormData();
      formData.append('planilha', file);
      formData.append('servico_id', servicoId);

      // Chamar TODOS os previews em paralelo (registro, data, qualidade)
      const [resRegistro, resData, resQualidade] = await Promise.all([
        fetch('/api/coleta/upload/preview', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }),
        fetch('/api/coleta/upload/preview-data', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }),
        fetch('/api/qualidade-coleta/preview', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }),
      ]);

      let erro = false;

      if (resRegistro.ok) {
        setPreviewData(await resRegistro.json());
      } else {
        erro = true;
      }

      if (resData.ok) {
        setPreviewDataInfo(await resData.json());
      } else {
        erro = true;
      }

      if (resQualidade.ok) {
        setQualidadePreviewData(await resQualidade.json());
      } else {
        console.warn('[QualidadePreview] Erro ao carregar:', await resQualidade.json().catch(() => ({})));
      }

      if (erro) {
        const errMsg = !resRegistro.ok
          ? ((await resRegistro.json().catch(() => ({ error: 'Erro ao analisar planilha' }))).error || 'Erro')
          : 'Erro ao analisar planilha';
        adicionarToast(errMsg, 'error');
        setShowPreviewModal(false);
      }
    } catch {
      adicionarToast('Erro ao conectar com o servidor', 'error');
      setShowPreviewModal(false);
    } finally {
      setPreviewCarregando(false);
    }
  };

  const handleConfirmarUpload = async (estrategia: 'ignorar' | 'substituir' | 'atualizar_data' | 'inserir_data') => {
    if (!servicoId || !arquivoPreview) return;
    setUploading(true);
    setShowPreviewModal(false);
    try {
      const formData = new FormData();
      formData.append('planilha', arquivoPreview);
      formData.append('servico_id', servicoId);
      formData.append('estrategia', estrategia);
      const res = await fetch('/api/coleta/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        const data = await res.json();
        adicionarToast(data.mensagem || 'Upload realizado com sucesso!', 'success');
        await carregarDados();
      } else {
        adicionarToast((await res.json()).error || 'Erro no upload', 'error');
      }
    } catch {
      adicionarToast('Erro ao fazer upload', 'error');
    } finally {
      setUploading(false);
      setArquivoPreview(null);
    }
  };

  const handleCancelarPreview = () => {
    setShowPreviewModal(false);
    setPreviewData(null);
    setPreviewDataInfo(null);
    setArquivoPreview(null);
  };

  const handleCorrigirUpload = async () => {
    if (!arquivoPreview) return;
    setCorrigindo(true);
    try {
      const formData = new FormData();
      formData.append('planilha', arquivoPreview);
      
      const res = await fetch('/api/qualidade-coleta/corrigir', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        adicionarToast('Erro ao corrigir planilha', 'error');
        setCorrigindo(false);
        return;
      }

      const data = await res.json();
      
      if (data.sucesso && data.planilhaBase64) {
        // Converter base64 para File
        const byteString = atob(data.planilhaBase64);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: data.mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const arquivoCorrigido = new File([blob], data.nomeArquivo || arquivoPreview.name, { type: data.mimeType });
        
        // Substituir o arquivo atual pelo corrigido
        setArquivoPreview(arquivoCorrigido);
        
        // Re-analisar a planilha corrigida
        setPreviewCarregando(true);
        const formData2 = new FormData();
        formData2.append('planilha', arquivoCorrigido);
        formData2.append('servico_id', servicoId!);
        
        const [resRegistro, resData, resQualidade] = await Promise.all([
          fetch('/api/coleta/upload/preview', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData2,
          }),
          fetch('/api/coleta/upload/preview-data', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData2,
          }),
          fetch('/api/qualidade-coleta/preview', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData2,
          }),
        ]);

        if (resRegistro.ok) setPreviewData(await resRegistro.json());
        if (resData.ok) setPreviewDataInfo(await resData.json());
        if (resQualidade.ok) {
          const qData = await resQualidade.json();
          setQualidadePreviewData(qData);
        }
        
        setPreviewCarregando(false);
        
        adicionarToast(
          `✅ ${data.mensagem || 'Correções aplicadas com sucesso!'}`,
          'success'
        );
      }
    } catch (err) {
      console.error('[CorrigirUpload] Erro:', err);
      adicionarToast('Erro ao corrigir planilha', 'error');
    } finally {
      setCorrigindo(false);
    }
  };

  const handleExcluirPlanilha = async (planilhaId: number) => {
    try {
      const res = await fetch(`/api/coleta/uploads/${planilhaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        adicionarToast('Planilha excluída!', 'success');
        await carregarDados();
      } else {
        adicionarToast((await res.json()).error || 'Erro ao excluir', 'error');
      }
    } catch {
      adicionarToast('Erro ao excluir', 'error');
    }
  };

  const colunas = useMemo<ColunaDetectada[]>(() => dados?.servico?.padraoPlanilha?.colunas || [], [dados]);
  const servicoNome = dados?.servico?.nome || 'Serviço';
  const uploadsInfo = dados?.uploads || null;
  const temPlanilha = colunas.length > 0;
  const totalRegistros = uploadsInfo?.totalImportados || 0;

  const tabs: TabItem[] = [
    { id: 'uploads', label: 'Uploads', icon: <FiUpload size={14} /> },
  ];

  if (carregando) {
    return (
      <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <SkeletonLoader tipo="table" quantidade={5} />
      </div>
    );
  }

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header com upload e navegação */}
      <DashboardHeader
        servicoNome={servicoNome}
        contractId={contractId!}
        uploading={uploading}
        onUpload={handleUpload}
        onRefresh={carregarDados}
        uploadRef={uploadInputRef}
      />

      {/* Navegação secundária */}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn btn-sm"
          onClick={() => navigate(`/contratos/${contractId}/servicos/${servicoId}/dashboard`)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, color: '#15803d', cursor: 'pointer' }}
        >
          <FiBarChart2 size={12} /> Ir para Dashboard
        </button>
        <button
          className="btn btn-sm"
          onClick={() => navigate(`/contratos/${contractId}/servicos/${servicoId}/configurar`)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fefce8', border: '1px solid #f59e0b', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, color: '#b45309', cursor: 'pointer' }}
        >
          <FiSettings size={12} /> Configurar Indicadores
        </button>
        {temPlanilha && (
          <button
            className="btn btn-sm"
            onClick={abrirQualidadeUltimoUpload}
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px', padding: '0.3rem 0.6rem', fontSize: '0.72rem', fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}
          >
            <FiAlertCircle size={12} /> Qualidade dos Dados
          </button>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
          {totalRegistros.toLocaleString('pt-BR')} registros · {uploadsInfo?.total || 0} uploads
        </span>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '0.75rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab ${tabAtiva === tab.id ? 'active' : ''}`}
            onClick={() => setTabAtiva(tab.id)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Uploads */}
      {tabAtiva === 'uploads' && (
        <>
          {!temPlanilha ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
              <FiUpload size={40} style={{ opacity: 0.2, marginBottom: '0.75rem' }} />
              <h3 style={{ color: '#475569', marginBottom: '0.35rem' }}>Nenhuma planilha enviada</h3>
              <p style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>
                Faça upload de uma planilha Excel (.xlsx) para começar.
              </p>
              <input
                type="file" accept=".xlsx,.xls" ref={uploadInputRef}
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleUpload(f); e.target.value = ''; } }}
                style={{ display: 'none' }}
                id="detalhe-upload-input"
              />
              <label htmlFor="detalhe-upload-input" className="btn btn-primary" style={{ cursor: uploading ? 'not-allowed' : 'pointer' }}>
                <FiUpload size={14} /> {uploading ? 'Enviando...' : 'Fazer Upload'}
              </label>
            </div>
          ) : (
            <UploadHistory
              uploads={uploadsInfo}
              onExcluir={handleExcluirPlanilha}
              token={token}
              servicoId={servicoId!}
              contractId={contractId!}
              adicionarToast={adicionarToast}
            />
          )}
        </>
      )}

      {/* Modal de Preview de Upload */}
      <UploadPreviewModal
        aberto={showPreviewModal}
        previewData={previewData}
        previewDataInfo={previewDataInfo}
        qualidadePreviewData={qualidadePreviewData}
        carregando={previewCarregando}
        arquivo={arquivoPreview}
        onConfirmar={handleConfirmarUpload}
        onCancelar={handleCancelarPreview}
        onCorrigir={handleCorrigirUpload}
        corrigindo={corrigindo}
      />

      {/* Modal de Relatório de Qualidade */}
      <RelatorioQualidade
        uploadId={qualidadeUploadId}
        servicoId={qualidadeUploadId === null ? servicoId : undefined}
        aberto={showQualidade}
        onFechar={() => {
          setShowQualidade(false);
          setQualidadeUploadId(null);
        }}
      />
    </div>
  );
}
