import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { FiDownload, FiSearch, FiChevronLeft, FiChevronRight, FiCheck, FiX } from 'react-icons/fi';
import ConfirmModal from './ConfirmModal';
import coletaService from '../services/coletaService';
import servicoService, { invalidateCachesServico } from '../services/servicoService';
import { isRequestAborted } from '../services/abortableRequest';

interface ColunaDetectada {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
  amostras: (string | number | null)[];
  valoresUnicos: number;
  nulos: number;
}

interface DadoColeta {
  id: number;
  dataSaida: string;
  turno: string;
  regional: string;
  distrito: string;
  placa: string;
  motorista: string;
  pesoTotal: number;
  kmTotal: number;
  numeroViagens: number;
  [key: string]: any;
}

interface DataTableProps {
  servicoId: string;
  contractId: string;
  token: string | null;
  adicionarToast: (msg: string, t: 'success' | 'error' | 'warning') => void;
  colunasPadrao: ColunaDetectada[];
}

const LIMITS = [25, 50, 100];

export default function DataTable({ servicoId, contractId, token, adicionarToast, colunasPadrao }: DataTableProps) {
  const [dados, setDados] = useState<DadoColeta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [limit, setLimit] = useState(25);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editandoDados, setEditandoDados] = useState<Record<string, any>>({});
  const [filtroPlanilha, setFiltroPlanilha] = useState('');
  const [planilhas, setPlanilhas] = useState<{ id: number; nome: string }[]>([]);
  const [colunasVisiveis, setColunasVisiveis] = useState<Set<string>>(new Set());
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState('');
  const [confirmExcluir, setConfirmExcluir] = useState<{ id: number } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const adicionarToastRef = useRef(adicionarToast);
  adicionarToastRef.current = adicionarToast;

  // Buscar planilhas (uma vez)
  useEffect(() => {
    (async () => {
      try {
        const uploads = await coletaService.listarUploadsServico(servicoId);
        setPlanilhas((uploads || []).map((p: any) => ({ id: p.id, nome: p.nomeArquivo || 'Sem nome' })));
      } catch {}
    })();
  }, [servicoId, token]);

  const carregar = useCallback(async (p: number) => {
    setCarregando(true);
    try {
      const d = await servicoService.buscarDadosPlanilha(contractId, servicoId, {
        pagina: p,
        limite: limit,
        uploadId: filtroPlanilha || undefined,
      });
      setDados(d.dados || []);
      setTotalPaginas(d.totalPaginas || 1);
      setTotalRegistros(d.total || d.dados?.length || 0);
    } catch (err) {
      if (!isRequestAborted(err)) adicionarToastRef.current('Erro ao carregar dados', 'error');
    }
    finally { setCarregando(false); }
  }, [servicoId, contractId, filtroPlanilha, limit]);

  useEffect(() => { carregar(pagina); }, [pagina, carregar]);

  // Detectar colunas visíveis
  const primeiro = dados[0];
  const chavesGen = primeiro?.dados && typeof primeiro.dados === 'object'
    ? Object.keys(primeiro.dados).filter(k => k !== 'id' && !k.startsWith('_'))
    : [];

  const todasColunas = useMemo(() => {
    if (colunasPadrao.length > 0) {
      const mapaEntidade: Record<string, string> = {
        'DATA SAIDA': 'dataSaida', 'PLACA': 'placa', 'MOTORISTA': 'motorista',
        'TURNO': 'turno', 'REGIONAL': 'regional', 'DISTRITO': 'distrito',
        'PESO TOTAL': 'pesoTotal', 'KM TOTAL': 'kmTotal',
        'KM SAIDA': 'kmSaida', 'KM CHEGADA': 'kmChegada',
        'NUMERO DE COLETORES': 'numeroColetores', 'NUMERO DE VIAGENS': 'numeroViagens',
        'HORA SAIDA': 'horaSaida', 'HORA CHEGADA': 'horaChegada',
        'CAMINHAO': 'tipoCaminhao',
        'TEMPO FORA DA UNIDADE': 'tempoForaUnidade',
      };
      return colunasPadrao.map(c => {
        let tipo = 'text';
        if (c.tipo === 'numero') tipo = 'numero';
        else if (c.tipo === 'data') tipo = 'data';
        else if (c.tipo === 'hora') tipo = 'hora';
        const entidadeField: string | null = mapaEntidade[c.nome.toUpperCase()] || null;
        return { key: c.nome, label: c.nome, tipo, entidadeField };
      });
    }
    return chavesGen.slice(0, 10).map(k => ({ key: k, label: k, tipo: 'text', entidadeField: null as string | null }));
  }, [colunasPadrao, chavesGen]);

  const colunas = todasColunas.filter(c => colunasVisiveis.has(c.key));

  // Iniciar colunas visíveis
  useEffect(() => {
    if (dados.length > 0 && colunasVisiveis.size === 0) {
      setColunasVisiveis(new Set(todasColunas.map(c => c.key)));
    }
  }, [dados.length, todasColunas, colunasVisiveis.size]);

  const rowVirtualizer = useVirtualizer({
    count: dados.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownAberto(false); };
    if (dropdownAberto) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dropdownAberto]);

  // Formatar valor
  const fmtValor = (v: any, tipo: string) => {
    if (v === null || v === undefined) return <span style={{ color: 'var(--color-text-light)', fontStyle: 'italic' }}>vazio</span>;
    if (tipo === 'data') { try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return String(v); } }
    if (tipo === 'hora') {
      if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) return v;
      if (typeof v === 'number' && v > 0 && v < 1) {
        const totalMin = Math.round(v * 24 * 60);
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
      }
      return String(v);
    }
    if (tipo === 'numero') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    return String(v);
  };

  // Editar linha
  const iniciarEdicao = (dado: DadoColeta) => {
    setEditandoId(dado.id);
    const dadosEdit = { ...dado.dados };
    setEditandoDados(dadosEdit);
  };

  const salvarEdicao = async () => {
    if (!editandoId) return;
    try {
      await coletaService.atualizarDado(editandoId, editandoDados);
      adicionarToast('Registro atualizado!', 'success');
      setEditandoId(null);
      setEditandoDados({});
      invalidateCachesServico(contractId, servicoId);
      carregar(pagina);
    } catch { adicionarToast('Erro ao atualizar', 'error'); }
  };

  const cancelarEdicao = () => {
    setEditandoId(null);
    setEditandoDados({});
  };

  // Excluir
  const handleExcluir = async () => {
    if (!confirmExcluir) return;
    setExcluindo(true);
    try {
      await coletaService.excluirDado(confirmExcluir.id);
      adicionarToast('Registro excluído!', 'success');
      setConfirmExcluir(null);
      invalidateCachesServico(contractId, servicoId);
      carregar(pagina);
    } catch { adicionarToast('Erro ao excluir', 'error'); }
    finally { setExcluindo(false); }
  };

  // Exportar CSV
  const exportarCSV = () => {
    const headers = colunas.map(c => c.label).join(';');
    const rows = dados.map(d => {
      return colunas.map(c => {
        const valBruto = d.dados?.[c.key];
        const valEntidade = c.entidadeField ? (d as any)[c.entidadeField] : undefined;
        const val = valBruto !== null && valBruto !== undefined ? valBruto : (valEntidade !== null && valEntidade !== undefined ? valEntidade : '');
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(';');
    }).join('\n');
    const blob = new Blob([headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `dados_servico_${servicoId}_pagina_${pagina}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    adicionarToast('CSV exportado!', 'success');
  };

  // Atalhos de teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (editandoId !== null) {
      if (e.key === 'Enter') { e.preventDefault(); salvarEdicao(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelarEdicao(); }
    }
  };

  if (carregando) {
    return (
      <div style={{ padding: '1rem' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="skeleton skeleton-text" style={{ width: `${20 + j * 10}%` }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (dados.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
        <p>Nenhum dado encontrado. Faça upload de uma planilha primeiro.</p>
      </div>
    );
  }

  return (
    <div onKeyDown={handleKeyDown} tabIndex={-1} style={{ outline: 'none' }}>
      {/* Filtros e ações */}
      <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        {/* Filtro de planilha */}
        {planilhas.length > 0 && (
          <>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Planilha:</label>
            <select value={filtroPlanilha} onChange={e => { setFiltroPlanilha(e.target.value); setPagina(1); }}
              className="form-select" style={{ fontSize: '0.82rem', maxWidth: '250px' }}>
              <option value="">Todas</option>
              {planilhas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </>
        )}

        <div style={{ flex: 1 }} />

        {/* Seletor de colunas */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button onClick={() => setDropdownAberto(!dropdownAberto)} className="btn btn-secondary btn-sm">
            <FiSearch size={12} /> Colunas ({colunasVisiveis.size})
          </button>
          {dropdownAberto && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: '4px',
              background: '#fff', border: '1px solid var(--color-border)',
              borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 100, minWidth: '240px', maxHeight: '300px', overflow: 'auto',
            }}>
              <div style={{ padding: '0.4rem 0.6rem', borderBottom: '1px solid var(--color-border-light)', display: 'flex', gap: '0.3rem' }}>
                <button onClick={() => setColunasVisiveis(new Set(todasColunas.map(c => c.key)))} className="btn btn-sm btn-primary" style={{ flex: 1 }}>Todos</button>
                <button onClick={() => setColunasVisiveis(new Set())} className="btn btn-sm btn-secondary" style={{ flex: 1 }}>Limpar</button>
              </div>
              {/* Busca dentro do dropdown */}
              <div style={{ padding: '0.3rem 0.6rem' }}>
                <input
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                  placeholder="Buscar coluna..."
                  className="form-input"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.4rem', width: '100%' }}
                  autoFocus
                />
              </div>
              {todasColunas
                .filter(c => !buscaTexto || c.label.toLowerCase().includes(buscaTexto.toLowerCase()))
                .map(col => (
                  <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.65rem', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)' }}>
                    <input type="checkbox" checked={colunasVisiveis.has(col.key)}
                      onChange={() => { const n = new Set(colunasVisiveis); if (n.has(col.key)) n.delete(col.key); else n.add(col.key); setColunasVisiveis(n); }}
                      style={{ width: '14px', height: '14px', accentColor: 'var(--color-primary)' }} />
                    {col.label}
                    <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--color-text-light)' }}>
                      {col.tipo === 'numero' ? '# #' : col.tipo === 'data' ? '\uD83D\uDCC5' : 'Aa'}
                    </span>
                  </label>
                ))}
            </div>
          )}
        </div>

        {/* Exportar */}
        <button onClick={exportarCSV} className="btn btn-sm btn-success">
          <FiDownload size={12} /> CSV
        </button>
      </div>

      {/* Tabela virtualizada (só renderiza linhas visíveis) */}
      <div ref={scrollRef} className="table-container" style={{ maxHeight: 'min(70vh, 520px)', overflow: 'auto' }}>
        <table className="table" style={{ minWidth: '500px', fontSize: '0.78rem' }}>
          <thead>
            <tr>
              {colunas.map(col => (
                <th key={col.key} style={{ textAlign: col.tipo === 'numero' ? 'right' : 'left' }}>
                  {col.label}
                </th>
              ))}
              <th style={{ textAlign: 'center', width: '110px' }}>Ações</th>
            </tr>
          </thead>
          <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const dado = dados[virtualRow.index];
              const editandoAtivo = editandoId === dado.id;
              return (
                <tr
                  key={dado.id}
                  className={editandoAtivo ? 'table-row-editing' : ''}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    borderBottom: '1px solid var(--color-border-light)',
                    background: editandoAtivo ? '#fefce8' : undefined,
                  }}
                >
                  {colunas.map(col => {
                    const valBruto = dado.dados?.[col.key];
                    const valEntidade = col.entidadeField ? (dado as any)[col.entidadeField] : undefined;
                    const val = valBruto !== null && valBruto !== undefined ? valBruto : (valEntidade !== null && valEntidade !== undefined ? valEntidade : null);
                    return (
                      <td key={col.key} style={{ textAlign: col.tipo === 'numero' ? 'right' : 'left', padding: '0.25rem 0.5rem' }}>
                        {editandoAtivo ? (
                          <input
                            type={col.tipo === 'data' ? 'date' : col.tipo === 'numero' ? 'number' : 'text'}
                            value={editandoDados[col.key] ?? ''}
                            onChange={e => setEditandoDados(prev => ({ ...prev, [col.key]: e.target.value }))}
                            className="form-input"
                            style={{
                              padding: '0.2rem 0.3rem', fontSize: '0.75rem', width: '100%',
                              minWidth: '50px', boxSizing: 'border-box',
                              borderColor: editandoDados[col.key] !== (dado.dados?.[col.key] ?? '') ? 'var(--color-warning)' : 'var(--color-border-dark)',
                            }}
                            autoFocus={col === colunas[0]}
                          />
                        ) : (
                          <span style={{
                            color: col.tipo === 'numero' ? 'var(--color-success-dark)' : 'var(--color-text-primary)',
                          }}>
                            {fmtValor(val, col.tipo)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'center', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {editandoAtivo ? (
                      <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                        <button onClick={salvarEdicao} className="btn btn-sm btn-primary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: 'unset' }}>
                          <FiCheck size={12} />
                        </button>
                        <button onClick={cancelarEdicao} className="btn btn-sm btn-secondary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.7rem', minWidth: 'unset' }}>
                          <FiX size={12} />
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                        <button onClick={() => iniciarEdicao(dado)} className="btn btn-sm btn-secondary" style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', minWidth: 'unset' }}>
                          Editar
                        </button>
                        <button onClick={() => setConfirmExcluir({ id: dado.id })} className="btn btn-sm btn-danger" style={{ padding: '0.2rem 0.4rem', fontSize: '0.65rem', minWidth: 'unset' }}>
                          Excluir
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
            {totalRegistros > 0 ? `${(pagina - 1) * limit + 1}-${Math.min(pagina * limit, totalRegistros)} de ${totalRegistros}` : '0 registros'}
          </span>
          <select value={limit} onChange={e => { setLimit(Number(e.target.value)); setPagina(1); }}
            className="form-select" style={{ fontSize: '0.72rem', padding: '0.2rem 0.4rem', width: 'auto' }}>
            {LIMITS.map(l => <option key={l} value={l}>{l} / pág</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
          <button disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))}
            className="btn btn-sm btn-secondary" style={{ opacity: pagina <= 1 ? 0.5 : 1 }}>
            <FiChevronLeft size={14} /> Anterior
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0 0.3rem' }}>
            {pagina} / {totalPaginas}
          </span>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            className="btn btn-sm btn-secondary" style={{ opacity: pagina >= totalPaginas ? 0.5 : 1 }}>
            Próxima <FiChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Modal de confirmação de exclusão */}
      <ConfirmModal
        aberto={confirmExcluir !== null}
        titulo="Excluir Registro"
        mensagem="Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita."
        confirmarTexto="Excluir"
        variante="danger"
        onConfirm={handleExcluir}
        onCancel={() => setConfirmExcluir(null)}
        carregando={excluindo}
      />
    </div>
  );
}
