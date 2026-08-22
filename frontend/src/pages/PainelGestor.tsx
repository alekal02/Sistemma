import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { ehGestor } from '../utils/homePath';
import contractService, { type ContratoSaude } from '../services/contractService';
import CompararPorTipoTv from '../components/CompararPorTipoTv';
import '../styles/Dashboard.css';
import '../styles/PainelGestor.css';

export default function PainelGestor() {
  const navigate = useNavigate();
  const { user, entrarContrato } = useAuth();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [unidades, setUnidades] = useState<ContratoSaude[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setBreadcrumbs([{ label: 'Gestor' }]);
  }, [setBreadcrumbs]);

  const carregar = useCallback(async (force = false) => {
    setCarregando(true);
    setErro('');
    try {
      const lista = await contractService.listarSaude({ force });
      setUnidades(lista.filter((c) => c.status !== 'encerrado'));
    } catch {
      setErro('Não foi possível carregar os contratos.');
      adicionarToast('Erro ao carregar contratos', 'error');
    } finally {
      setCarregando(false);
    }
  }, [adicionarToast]);

  useEffect(() => { void carregar(); }, [carregar]);

  const contratos = useMemo(
    () => unidades.map((c) => ({
      id: c.id,
      nome: c.numeroContrato,
      diaInicioCiclo: c.diaInicioCiclo ?? 1,
    })),
    [unidades],
  );

  const dataReferenciaHint = useMemo(() => {
    let melhor: string | null = null;
    for (const c of unidades) {
      if (c.ultimoUpload && (!melhor || c.ultimoUpload > melhor)) melhor = c.ultimoUpload;
    }
    return melhor;
  }, [unidades]);

  const servicosCatalogo = useMemo(
    () => unidades.flatMap((c) => {
      const tipos = c.tiposServico.length > 0 ? c.tiposServico : ['coleta_caminhao'];
      return tipos.map((tipo) => ({
        id: `${c.id}:${tipo}`,
        nome: tipo,
        contratoId: c.id,
        contratoNome: c.numeroContrato,
        tipoServico: tipo,
      }));
    }),
    [unidades],
  );

  const abrirUnidade = useCallback(async (contratoId: string) => {
    if (ehGestor(user) && user?.contractId !== contratoId) {
      try {
        await entrarContrato(contratoId);
      } catch {
        /* banco único: segue para a unidade */
      }
    }
    navigate(`/contratos/${contratoId}`);
  }, [user, entrarContrato, navigate]);

  return (
    <div className="painel-gestor">
      <header className="painel-gestor-header">
        <div>
          <p className="painel-gestor-kicker">Área do gestor</p>
          <h2>Comparativo de contratos</h2>
          <p>
            Só o que os contratos enviaram no ciclo — lado a lado, sem repetir o mesmo indicador.
            Clique num contrato para abrir somente aquela unidade.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() => { void carregar(true); }}
          disabled={carregando}
        >
          <FiRefreshCw size={14} className={carregando ? 'spin' : ''} /> Atualizar lista
        </button>
      </header>

      {erro && !carregando && (
        <div className="painel-gestor-erro">
          <FiAlertCircle size={18} />
          <span>{erro}</span>
        </div>
      )}

      {carregando && unidades.length === 0 && (
        <div className="vg-tv-grid">
          {[1, 2].map((i) => <div key={i} className="skeleton vg-tv-card-skel" />)}
        </div>
      )}

      {!carregando && unidades.length === 0 && !erro && (
        <div className="painel-gestor-vazio">
          <p>Nenhum contrato ativo para comparar.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/contratos')}>
            Ir para contratos
          </button>
        </div>
      )}

      {unidades.length > 0 && (
        <CompararPorTipoTv
          contratos={contratos}
          servicosCatalogo={servicosCatalogo}
          dataReferenciaHint={dataReferenciaHint}
          onAbrirContrato={(id) => { void abrirUnidade(id); }}
        />
      )}
    </div>
  );
}
