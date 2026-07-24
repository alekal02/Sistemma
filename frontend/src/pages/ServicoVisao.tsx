import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FiSettings, FiArrowLeft, FiRefreshCw, FiAlertTriangle,
} from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import EmptyState from '../components/EmptyState';
import SkeletonLoader from '../components/SkeletonLoader';
import CicloDateSelector from '../components/CicloDateSelector';
import ServicoMiniFlow from '../components/ServicoMiniFlow';
import VerificacaoViagensPanel, { type VerificacaoViagensData } from '../components/VerificacaoViagensPanel';
import type { ColunaDetectada } from '../components/KpiEditor/KpiEditorTypes';
import { extrairPlacasReservaContrato } from '../utils/placasReserva';
import { ehServicoPorUnidade } from '../utils/unidadeServico';
import servicoService from '../services/servicoService';

/** Acima disso, KPIs/executivo podem truncar no backend (GRAFICOS_DADOS_LIMITE). */
const AVISO_VOLUME_ALTO = 20000;

export default function ServicoVisao() {
  const { contractId, servicoId } = useParams<{ contractId: string; servicoId: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [carregando, setCarregando] = useState(true);
  const [servicoNome, setServicoNome] = useState('Servico');
  const [tipoServico, setTipoServico] = useState<string>('coleta_caminhao');
  const [colunas, setColunas] = useState<ColunaDetectada[]>([]);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [diaInicioCiclo, setDiaInicioCiclo] = useState(1);
  const [configFaturamento, setConfigFaturamento] = useState<{
    ativo?: boolean;
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
    valorM2?: number | null;
    tipoCobranca?: string | null;
  } | null>(null);
  const [contratoTarifas, setContratoTarifas] = useState<{
    valorTonelada?: number | null;
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null>(null);
  const [placasReserva, setPlacasReserva] = useState<string[]>([]);
  const [inconsistencias, setInconsistencias] = useState<{
    viagensInconsistentes: number;
    viagensValidas: number;
    totalViagens: number;
    percentualValido: number;
    impactoDashboard: string;
    resumoPorMotivo: { motivo: string; quantidade: number }[];
    amostra: { id: number; data: string | null; placa: string | null; motorista: string | null; motivos: string[] }[];
  } | null>(null);
  const [verificacaoViagens, setVerificacaoViagens] = useState<VerificacaoViagensData | null>(null);
  const [periodoDados, setPeriodoDados] = useState<{ dataInicio: string; dataFim: string } | null>(null);
  const [registrosTotais, setRegistrosTotais] = useState(0);
  const [mostrarDetalheInconsistencias, setMostrarDetalheInconsistencias] = useState(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: 'Visao Geral', href: '/visao-geral' },
      { label: 'Contratos', href: '/contratos' },
      { label: servicoNome !== 'Servico' ? servicoNome : 'Servico' },
    ]);
  }, [servicoNome, setBreadcrumbs]);

  const carregarDados = useCallback(async (opts?: { silencioso?: boolean; revalidarInconsistencias?: boolean }) => {
    if (!contractId || !servicoId) {
      setCarregando(false);
      return;
    }
    if (!opts?.silencioso) setCarregando(true);
    const revalidar = opts?.revalidarInconsistencias ? '1' : '0';
    try {
      const headers = { Authorization: 'Bearer ' + token };
      // Sem dados-brutos (20k): ciclo usa agregação SQL; detalhe do dia carrega sob demanda.
      const resPadrao = await fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/padrao', { headers });
      let tipoAtual = 'coleta_caminhao';
      if (resPadrao.ok) {
        const data = await resPadrao.json();
        tipoAtual = data.servico?.tipo || 'coleta_caminhao';
        setTipoServico(tipoAtual);
        setServicoNome(data.servico?.nome || 'Servico');
        setConfigFaturamento(data.servico?.configFaturamento ?? null);
        const cols: ColunaDetectada[] = data.servico?.padraoPlanilha?.colunas || [];
        setColunas(cols);
        setTotalRegistros(data.uploads?.registrosValidos ?? data.uploads?.totalImportados ?? 0);
        setRegistrosTotais(data.uploads?.registrosTotais ?? data.uploads?.totalImportados ?? 0);
        setPeriodoDados(data.periodoDados ?? null);
      }

      const ehRocada = ehServicoPorUnidade(tipoAtual);
      const [resContrato, resInconsistencias, resVerificacao] = await Promise.allSettled([
        fetch('/api/contracts/' + contractId, { headers }),
        ehRocada
          ? Promise.resolve(null)
          : fetch('/api/contracts/' + contractId + '/servicos/' + servicoId + '/inconsistencias-viagens?revalidar=' + revalidar, { headers }),
        ehRocada
          ? Promise.resolve(null)
          : servicoService.getVerificacaoViagens(contractId, servicoId),
      ]);

      if (resContrato.status === 'fulfilled' && resContrato.value && resContrato.value.ok) {
        const contrato = await resContrato.value.json();
        if (contrato.diaInicioCiclo) setDiaInicioCiclo(Number(contrato.diaInicioCiclo));
        setContratoTarifas({
          valorTonelada: contrato.valorTonelada,
          valorMini: contrato.valorMini,
          valorTruck: contrato.valorTruck,
          valorToco: contrato.valorToco,
          valorBasculante: contrato.valorBasculante,
        });
        setPlacasReserva(extrairPlacasReservaContrato(contrato));
      }

      if (!ehRocada && resInconsistencias.status === 'fulfilled' && resInconsistencias.value && resInconsistencias.value.ok) {
        setInconsistencias(await resInconsistencias.value.json());
      } else {
        setInconsistencias(null);
      }

      if (!ehRocada && resVerificacao.status === 'fulfilled' && resVerificacao.value) {
        setVerificacaoViagens(resVerificacao.value as VerificacaoViagensData);
      } else {
        setVerificacaoViagens(null);
      }
    } catch {
      adicionarToast('Erro ao carregar dados', 'error');
    } finally {
      if (!opts?.silencioso) setCarregando(false);
    }
  }, [contractId, servicoId, token, adicionarToast]);

  const handleUploadConcluido = useCallback(() => {
    carregarDados({ silencioso: true, revalidarInconsistencias: true });
  }, [carregarDados]);

  const handleMiniFlowStatusChange = useCallback((status: { upload: string }) => {
    if (status.upload === 'done') handleUploadConcluido();
  }, [handleUploadConcluido]);

  useEffect(() => {
    carregarDados();
  }, [contractId, servicoId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPlanilha = colunas.length > 0 || totalRegistros > 0;
  const ehRocada = tipoServico === 'rocadeira';
  const ehPorUnidade = ehServicoPorUnidade(tipoServico);
  const volumeAlto = totalRegistros > AVISO_VOLUME_ALTO
    || (inconsistencias?.viagensValidas ?? 0) > AVISO_VOLUME_ALTO;

  const renderBannerInconsistencias = () => {
    if (ehPorUnidade) return null;
    if (!inconsistencias || inconsistencias.viagensInconsistentes <= 0) return null;

    return (
      <div style={{
        background: '#fffbeb',
        border: '1px solid #fcd34d',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
          <FiAlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#92400e', marginBottom: '0.2rem' }}>
              Dados inconsistentes na planilha
            </div>
            <p style={{ fontSize: '0.78rem', color: '#78350f', margin: 0, lineHeight: 1.45 }}>
              {inconsistencias.impactoDashboard}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.45rem', fontSize: '0.72rem', color: '#a16207' }}>
              <span><strong>{inconsistencias.viagensInconsistentes}</strong> viagem(ns) excluída(s) do dashboard</span>
              <span><strong>{inconsistencias.viagensValidas}</strong> viagem(ns) válida(s)</span>
              <span><strong>{inconsistencias.percentualValido}%</strong> dos dados utilizáveis</span>
            </div>
            <button
              type="button"
              onClick={() => setMostrarDetalheInconsistencias((v) => !v)}
              style={{
                marginTop: '0.5rem', background: 'none', border: 'none', padding: 0,
                fontSize: '0.72rem', fontWeight: 600, color: '#b45309', cursor: 'pointer',
              }}
            >
              {mostrarDetalheInconsistencias ? 'Ocultar detalhes' : 'Ver viagens com problema'}
            </button>
            {mostrarDetalheInconsistencias && (
              <div style={{ marginTop: '0.6rem' }}>
                {(inconsistencias.resumoPorMotivo || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.5rem' }}>
                    {inconsistencias.resumoPorMotivo.map((p, i) => (
                      <span key={i} style={{
                        background: '#fef3c7', border: '1px solid #fde68a',
                        borderRadius: '6px', padding: '0.15rem 0.45rem', fontSize: '0.68rem', color: '#92400e',
                      }}>
                        {p.motivo} ({p.quantidade})
                      </span>
                    ))}
                  </div>
                )}
                {(inconsistencias.amostra || []).length > 0 && (
                  <div style={{ overflowX: 'auto', border: '1px solid #fde68a', borderRadius: '8px', background: '#fff' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
                      <thead>
                        <tr style={{ background: '#fef3c7' }}>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Data</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Placa</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Motorista</th>
                          <th style={{ padding: '0.35rem 0.5rem', textAlign: 'left' }}>Problemas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inconsistencias.amostra.map((v) => (
                          <tr key={v.id} style={{ borderTop: '1px solid #fde68a' }}>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.data || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.placa || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem' }}>{v.motorista || '—'}</td>
                            <td style={{ padding: '0.35rem 0.5rem', color: '#b45309' }}>{(v.motivos || []).join('; ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDashboard = () => {
    if (carregando) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <SkeletonLoader tipo="table" quantidade={8} />
        </div>
      );
    }

    if (!temPlanilha) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <EmptyState
            icone="upload"
            titulo="Nenhum dado ainda"
            descricao="Faça upload de uma planilha para visualizar o ciclo do contrato."
          />
          {contractId && servicoId && (
            <div style={{ marginTop: '1rem' }}>
              <ServicoMiniFlow
                contractId={contractId}
                servicoId={servicoId}
                servicoNome={servicoNome}
                tipoServico={tipoServico}
                onStatusChange={handleMiniFlowStatusChange}
              />
            </div>
          )}
        </div>
      );
    }

    if (diaInicioCiclo <= 0) {
      return (
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <EmptyState
            icone="config"
            titulo="Ciclo não configurado"
            descricao="Defina o dia de início do ciclo no contrato para exibir o calendário."
            acoes={[{ label: 'Ir ao contrato', onClick: () => navigate('/contratos/' + contractId), variante: 'primary' }]}
          />
        </div>
      );
    }

    return (
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {volumeAlto && (
          <div style={{
            background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
            padding: '0.55rem 0.75rem', marginBottom: '0.65rem', fontSize: '0.75rem', color: '#1e40af',
          }}>
            <strong>Volume alto:</strong>{' '}
            {(inconsistencias?.viagensValidas || totalRegistros).toLocaleString('pt-BR')} registros válidos.
            A tabela do ciclo usa agregação no servidor; o detalhe de cada dia carrega sob demanda
            (sem trazer todos os registros para o navegador).
          </div>
        )}
        {registrosTotais > 0 && totalRegistros === 0 && !ehPorUnidade && (
          <div style={{
            background: '#fff7ed', border: '1px solid #fdba74', borderRadius: '8px',
            padding: '0.55rem 0.75rem', marginBottom: '0.65rem', fontSize: '0.75rem', color: '#9a3412',
          }}>
            <strong>{registrosTotais.toLocaleString('pt-BR')} linha(s) importada(s),</strong> mas nenhuma entra no dashboard
            (KM, peso ou data inválidos). Corrija a planilha ou veja o banner de inconsistências acima.
          </div>
        )}
        <CicloDateSelector
          diaInicioCiclo={diaInicioCiclo}
          periodoDados={periodoDados}
          contractId={contractId}
          servicoId={servicoId}
          servicoNome={servicoNome}
          tipoServico={tipoServico}
          configFaturamento={configFaturamento}
          contratoTarifas={contratoTarifas}
          placasReserva={placasReserva}
          onCicloFechado={() => carregarDados({ silencioso: true })}
        />
      </div>
    );
  };

  return (
    <div style={{ padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem',
      }}>
        <div style={{ flex: 1, minWidth: '200px' }}>
          <button
            type="button"
            onClick={() => navigate('/contratos/' + contractId)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
              background: 'none', border: 'none', padding: 0, marginBottom: '0.35rem',
              fontSize: '0.72rem', fontWeight: 600, color: '#6366f1', cursor: 'pointer',
            }}
          >
            <FiArrowLeft size={12} /> Voltar ao contrato
          </button>
          <h1 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {servicoNome}
          </h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: '#64748b', lineHeight: 1.45 }}>
            {ehRocada
              ? 'Acompanhe o ciclo de roçada (m²) e abra qualquer dia para ver área por bairro/operador.'
              : ehPorUnidade
                ? 'Acompanhe o ciclo pela unidade do serviço (km, m ou árvores) e abra qualquer dia para o detalhe.'
                : 'Acompanhe o ciclo e abra qualquer dia para ver a operação detalhada.'}
            {totalRegistros > 0 && (
              <span style={{ color: '#94a3b8' }}> · {totalRegistros.toLocaleString('pt-BR')} registros importados</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => carregarDados({ revalidarInconsistencias: !ehPorUnidade })}
            title="Recarregar dados"
          >
            <FiRefreshCw size={13} />
          </button>
          <button
            type="button"
            onClick={() => navigate('/contratos/' + contractId + '/servicos/' + servicoId + '/configurar')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              fontSize: '0.75rem', fontWeight: 600, padding: '0.45rem 0.75rem',
              borderRadius: '8px', border: '1px solid #bbf7d0',
              background: '#f0fdf4', color: '#15803d', cursor: 'pointer',
            }}
          >
            <FiSettings size={14} /> Configuração
          </button>
        </div>
      </div>

      {renderBannerInconsistencias()}

      {!ehPorUnidade && verificacaoViagens && verificacaoViagens.linhasImportadas > 0 && (
        <VerificacaoViagensPanel dados={verificacaoViagens} compacto={!verificacaoViagens.temDivergencia} />
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {renderDashboard()}
      </div>
    </div>
  );
}
