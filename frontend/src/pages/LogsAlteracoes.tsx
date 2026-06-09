import { useState, useEffect } from 'react'
import { useToast } from '../contexts/ToastContext'
import abastecimentoService from '../services/abastecimentoService'
import api from '../services/api'
import '../styles/LogsAlteracoes.css'

interface LogEntry {
  id: string
  abastecimentoId: string
  campoAlterado: string
  valorAntigo: string | null
  valorNovo: string | null
  alteradoPor?: { id: string; nome: string; email: string } | null
  abastecimento?: { placa: string } | null
  criadoEm: string
}

interface UsuarioItem {
  id: string
  nome: string
  email: string
}

const campoLabel: Record<string, string> = {
  placa: 'Placa',
  litragem: 'Litragem',
  valor: 'Valor',
  dataAbastecimento: 'Data/Hora',
  observacoes: 'Observações',
}

function LogsAlteracoes() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [carregando, setCarregando] = useState(true)
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [total, setTotal] = useState(0)
  const { adicionarToast } = useToast()

  /* ── Filtros ── */
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [listaUsuarios, setListaUsuarios] = useState<UsuarioItem[]>([])

  const ITENS_POR_PAGINA = 20

  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        const response = await api.get('/auth/users/simple')
        setListaUsuarios(response.data.users || [])
      } catch {
        // silencia
      }
    }
    carregarUsuarios()
  }, [])

  const carregarLogs = async (page: number, manterFiltrosCarregando?: boolean) => {
    if (!manterFiltrosCarregando) setCarregando(true)
    try {
      const dados = await abastecimentoService.listarTodosLogs({
        page,
        limit: ITENS_POR_PAGINA,
        placa: filtroPlaca || undefined,
        dataInicio: filtroDataInicio || undefined,
        dataFim: filtroDataFim || undefined,
        alteradoPorId: filtroUsuario || undefined,
      })
      setLogs(dados.logs || [])
      setPagina(dados.pagina)
      setTotalPaginas(dados.totalPaginas)
      setTotal(dados.total)
    } catch (erro) {
      adicionarToast('Erro ao carregar logs.', 'error')
      console.error(erro)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarLogs(1)
  }, [])

  const handleFiltrar = (e: React.FormEvent) => {
    e.preventDefault()
    setPagina(1)
    carregarLogs(1)
  }

  const handleLimpar = () => {
    setFiltroPlaca('')
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setFiltroUsuario('')
    setPagina(1)
    carregarLogs(1)
  }

  const irParaPagina = (p: number) => {
    if (p < 1 || p > totalPaginas) return
    carregarLogs(p, true)
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR')
  }

  return (
    <div className="logs-container">
      <h2>Histórico de Alterações</h2>
      <p className="subtitle">Registro de todas as alterações feitas em abastecimentos</p>

      {/* ── Filtros ── */}
      <section className="filtros-section">
        <form onSubmit={handleFiltrar} className="filtros-form">
          <div className="form-group">
            <label htmlFor="log-filtro-placa">Placa:</label>
            <input
              id="log-filtro-placa"
              type="text"
              value={filtroPlaca}
              onChange={e => setFiltroPlaca(e.target.value)}
              placeholder="Ex: ABC-1234"
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="log-filtro-data-inicio">Data Início:</label>
            <input
              id="log-filtro-data-inicio"
              type="datetime-local"
              value={filtroDataInicio}
              onChange={e => setFiltroDataInicio(e.target.value)}
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="log-filtro-data-fim">Data Fim:</label>
            <input
              id="log-filtro-data-fim"
              type="datetime-local"
              value={filtroDataFim}
              onChange={e => setFiltroDataFim(e.target.value)}
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="log-filtro-usuario">Alterado por:</label>
            <select
              id="log-filtro-usuario"
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              disabled={carregando}
            >
              <option value="">Todos</option>
              {listaUsuarios.map(u => (
                <option key={u.id} value={u.id}>{u.nome}</option>
              ))}
            </select>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={carregando} className="btn-filtrar">
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
            <button type="button" onClick={handleLimpar} disabled={carregando} className="btn-limpar">
              Limpar
            </button>
          </div>
        </form>
      </section>

      {carregando && logs.length === 0 ? (
        <p className="empty-state">Carregando...</p>
      ) : logs.length === 0 ? (
        <p className="empty-state">Nenhuma alteração encontrada.</p>
      ) : (
        <>
          <div className="tabela-wrapper">
            <table className="tabela-logs">
              <thead>
                <tr>
                  <th>Data/Hora</th>
                  <th>Abastecimento</th>
                  <th>Campo</th>
                  <th>Valor Antigo</th>
                  <th>Valor Novo</th>
                  <th>Alterado por</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td className="td-data">{formatarData(log.criadoEm)}</td>
                    <td>
                      <span className="badge-placa">{log.abastecimento?.placa || '—'}</span>
                    </td>
                    <td>
                      <span className="badge-campo">{campoLabel[log.campoAlterado] || log.campoAlterado}</span>
                    </td>
                    <td className="td-valor-antigo">{log.valorAntigo || <em>vazio</em>}</td>
                    <td className="td-valor-novo">{log.valorNovo || <em>vazio</em>}</td>
                    <td>{log.alteradoPor?.nome || log.alteradoPor?.email || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginas > 1 && (
            <div className="paginacao-section">
              <div className="paginacao-info">
                {total} registro(s) — Página {pagina} de {totalPaginas}
              </div>
              <div className="paginacao-controles">
                <button className="btn-pagina" onClick={() => irParaPagina(1)} disabled={pagina <= 1}>⟪</button>
                <button className="btn-pagina" onClick={() => irParaPagina(pagina - 1)} disabled={pagina <= 1}>⟨</button>
                {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 2)
                  .map((p, idx, arr) => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && <span className="paginacao-elipse">…</span>}
                      <button className={`btn-pagina ${p === pagina ? 'btn-pagina-ativa' : ''}`} onClick={() => irParaPagina(p)}>{p}</button>
                    </span>
                  ))}
                <button className="btn-pagina" onClick={() => irParaPagina(pagina + 1)} disabled={pagina >= totalPaginas}>⟩</button>
                <button className="btn-pagina" onClick={() => irParaPagina(totalPaginas)} disabled={pagina >= totalPaginas}>⟫</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default LogsAlteracoes
