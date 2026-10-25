import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import WhatsappGrupos from './WhatsappGrupos';
import Contratos from './Contratos';
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useBreadcrumbs } from '../contexts/BreadcrumbContext';
import { ehGestor } from '../utils/homePath';
import contractService, { type ContratoSaude } from '../services/contractService';
import CompararPorTipoTv from '../components/CompararPorTipoTv';
import '../styles/Dashboard.css';
import '../styles/PainelGestor.css';

function RelatoriosGestor({
  unidades,
  carregando,
  onAbrir,
}: {
  unidades: ContratoSaude[];
  carregando: boolean;
  onAbrir: (contratoId: string) => void;
}) {
  if (carregando && unidades.length === 0) {
    return <p className="painel-gestor-vazio">Carregando contratos…</p>;
  }
  if (unidades.length === 0) {
    return <p className="painel-gestor-vazio">Nenhum contrato ativo.</p>;
  }
  return (
    <div className="painel-gestor-relatorios">
      <header className="painel-gestor-header">
        <div>
          <p className="painel-gestor-kicker">Relatórios</p>
          <h2>Todos os contratos</h2>
          <p>Abra o contrato já na aba de relatórios: ciclo, dia e PDFs daquela unidade.</p>
        </div>
      </header>
      <ul className="painel-gestor-relatorios-lista">
        {unidades.map((c) => (
          <li key={c.id}>
            <div>
              <strong>{c.numeroContrato}</strong>
              <span>{c.tiposServico?.length ? `${c.tiposServico.length} tipo(s) de serviço` : 'Sem serviço'}</span>
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => onAbrir(c.id)}>
              Abrir relatórios
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PainelGestor() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba = params.get('aba') || 'contratos';
  const abaWhatsapp = aba === 'whatsapp';
  const { user, entrarContrato } = useAuth();
  const { adicionarToast } = useToast();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [unidades, setUnidades] = useState<ContratoSaude[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    setBreadcrumbs([{ label: abaWhatsapp ? 'WhatsApp' : 'Gestor' }]);
  }, [setBreadcrumbs, abaWhatsapp]);

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

  const abrirUnidade = useCallback(async (contratoId: string, abaDestino?: string) => {
    if (ehGestor(user) && user?.contractId !== contratoId) {
      try {
        await entrarContrato(contratoId);
      } catch {
        /* banco único: segue para a unidade */
      }
    }
    const destino = abaDestino ? `?aba=${abaDestino}` : '';
    navigate(`/contratos/${contratoId}${destino}`);
  }, [user, entrarContrato, navigate]);

  return (
    <div className="painel-gestor">
      <div className="painel-gestor-abas" role="tablist" aria-label="Área do gestor">
        <button type="button" role="tab" aria-selected={aba === 'contratos'} className={aba === 'contratos' ? 'ativa' : ''} onClick={() => setParams({ aba: 'contratos' }, { replace: true })}>Contratos</button>
        <button type="button" role="tab" aria-selected={aba === 'relatorios'} className={aba === 'relatorios' ? 'ativa' : ''} onClick={() => setParams({ aba: 'relatorios' }, { replace: true })}>Relatórios</button>
        <button type="button" role="tab" aria-selected={aba === 'comparativo'} className={aba === 'comparativo' ? 'ativa' : ''} onClick={() => setParams({ aba: 'comparativo' }, { replace: true })}>Comparativo</button>
        <button type="button" role="tab" aria-selected={abaWhatsapp} className={abaWhatsapp ? 'ativa' : ''} onClick={() => setParams({ aba: 'whatsapp' }, { replace: true })}>WhatsApp</button>
      </div>

      {aba === 'contratos' ? <Contratos /> : aba === 'relatorios' ? (
        <RelatoriosGestor
          unidades={unidades}
          carregando={carregando}
          onAbrir={(id) => { void abrirUnidade(id, 'relatorios'); }}
        />
      ) : abaWhatsapp ? <WhatsappGrupos /> : (
      <>
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
      </>
      )}
    </div>
  );
}
