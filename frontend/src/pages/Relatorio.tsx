import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import '../styles/Relatorio.css'
import abastecimentoService from '../services/abastecimentoService'
import PlacaAutocomplete from '../components/PlacaAutocomplete'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../services/api'

interface Abastecimento {
  id: string
  placa: string
  litragem: number
  valor: number
  dataAbastecimento: string
  litragemExtraida?: number | null
  valorExtraido?: number | null
  observacoes?: string
  imagemUrl?: string
  usuarioCriador?: {
    id: string
    nome: string
    email: string
  } | null
}

interface UsuarioItem {
  id: string
  nome: string
  email: string
}

type SortColumn = 'placa' | 'dataAbastecimento' | 'litragem' | 'valor' | 'extraido' | 'criador'
type SortDirection = 'asc' | 'desc'

const obterCriadorPor = (a: Abastecimento) => a.usuarioCriador?.nome || a.usuarioCriador?.email || '—'

function Relatorio() {
  const [abastecimentos, setAbastecimentos] = useState<Abastecimento[]>([])
  const [filtroPlaca, setFiltroPlaca] = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [exportando, setExportando] = useState(false)
  const { adicionarToast } = useToast()

  /* ── Lista de usuários para o select ── */
  const [listaUsuarios, setListaUsuarios] = useState<UsuarioItem[]>([])
  const { isAdmin, user } = useAuth()

  useEffect(() => {
    const carregarUsuarios = async () => {
      try {
        const response = await api.get('/auth/users/simple')
        const usuarios = response.data.users || []
        setListaUsuarios(usuarios)

        // Se não for admin, fixa o filtro no próprio usuário
        if (!isAdmin && user?.id) {
          setFiltroUsuario(user.id)
        }
      } catch {
        // silencia erro — o select só ficará vazio
      }
    }
    carregarUsuarios()
  }, [isAdmin, user])

  /* ── Ordenação ── */
  const [sortColumn, setSortColumn] = useState<SortColumn>('dataAbastecimento')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  /* ── Filtro local (texto livre sobre os dados carregados) ── */
  const [filtroLocal, setFiltroLocal] = useState('')

  /* ── Paginação ── */
  const ITENS_POR_PAGINA = 10
  const [pagina, setPagina] = useState(1)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [total, setTotal] = useState(0)

  /* ── Modal de imagem (admin) ── */
  const [imagemModalUrl, setImagemModalUrl] = useState<string | null>(null)

  const fecharModalImagem = () => setImagemModalUrl(null)

  /* ── Modal de edição (admin) ── */
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false)
  const [abastecimentoEditando, setAbastecimentoEditando] = useState<Abastecimento | null>(null)
  const [formEdicao, setFormEdicao] = useState({ placa: '', litragem: '', valor: '', dataHora: '', observacoes: '' })
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)

  const abrirModalEdicao = (a: Abastecimento) => {
    setAbastecimentoEditando(a)
    setFormEdicao({
      placa: a.placa,
      litragem: String(a.litragem),
      valor: String(a.valor),
      // Formata a data no horário LOCAL para o input datetime-local
      dataHora: (() => {
        const d = new Date(a.dataAbastecimento);
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        const hora = String(d.getHours()).padStart(2, '0');
        const min = String(d.getMinutes()).padStart(2, '0');
        return `${ano}-${mes}-${dia}T${hora}:${min}`;
      })(),
      observacoes: a.observacoes || '',
    })
    setModalEdicaoAberto(true)
  }

  const fecharModalEdicao = () => {
    setModalEdicaoAberto(false)
    setAbastecimentoEditando(null)
  }

  const handleEdicaoChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormEdicao(prev => ({ ...prev, [name]: value }))
  }

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!abastecimentoEditando) return

    setSalvandoEdicao(true)
    try {
      await abastecimentoService.atualizar(abastecimentoEditando.id, {
        placa: formEdicao.placa,
        litragem: formEdicao.litragem || null,
        valor: formEdicao.valor || null,
        dataHora: formEdicao.dataHora,
        dataAbastecimento: formEdicao.dataHora,
        imagemUrl: abastecimentoEditando.imagemUrl || '',
        litragemExtraida: abastecimentoEditando.litragemExtraida,
        valorExtraido: abastecimentoEditando.valorExtraido,
      })
      adicionarToast('Abastecimento atualizado com sucesso!', 'success')
      fecharModalEdicao()
      // Recarrega dados
      carregarAbastecimentos(filtroPlaca, filtroDataInicio, filtroDataFim, filtroUsuario, pagina)
    } catch (erro) {
      adicionarToast('Erro ao atualizar abastecimento.', 'error')
      console.error(erro)
    } finally {
      setSalvandoEdicao(false)
    }
  }

  const carregarAbastecimentos = async (
    placa?: string,
    dataInicio?: string,
    dataFim?: string,
    usuarioCriadorId?: string,
    paginaReq?: number
  ) => {
    setCarregando(true)
    const page = paginaReq ?? pagina

    try {
      const dados = await abastecimentoService.listar({
        placa, dataInicio, dataFim, usuarioCriadorId,
        page,
        limit: ITENS_POR_PAGINA,
      })
      setAbastecimentos(dados.abastecimentos || [])
      setPagina(dados.pagina)
      setTotalPaginas(dados.totalPaginas)
      setTotal(dados.total)
    } catch (erro) {
      adicionarToast('Erro ao carregar dados. Tente novamente.', 'error')
      console.error(erro)
      setAbastecimentos([])
    } finally {
      setCarregando(false)
    }
  }

  const irParaPagina = (novaPagina: number) => {
    if (novaPagina < 1 || novaPagina > totalPaginas) return
    setFiltroLocal('')
    carregarAbastecimentos(filtroPlaca, filtroDataInicio, filtroDataFim, filtroUsuario, novaPagina)
  }

  const handleFiltrar = (e: React.FormEvent) => {
    e.preventDefault()
    setFiltroLocal('')
    setPagina(1)
    carregarAbastecimentos(filtroPlaca, filtroDataInicio, filtroDataFim, filtroUsuario || undefined, 1)
  }

  const handleLimpar = () => {
    setFiltroPlaca('')
    setFiltroDataInicio('')
    setFiltroDataFim('')
    setFiltroUsuario('')
    setFiltroLocal('')
    setPagina(1)
    carregarAbastecimentos(undefined, undefined, undefined, undefined, 1)
  }

  /* ── Alternar ordenação ── */
  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
  }

  const renderSortIcon = (col: SortColumn) => {
    if (sortColumn !== col) return <span className="sort-icon sort-icon-inactive">↕</span>
    return (
      <span className={`sort-icon ${sortDirection === 'asc' ? 'sort-icon-asc' : 'sort-icon-desc'}`}>
        {sortDirection === 'asc' ? '↑' : '↓'}
      </span>
    )
  }

  /* ── Dados filtrados localmente e ordenados ── */
  const dadosFiltradosOrdenados = useMemo(() => {
    let dados = [...abastecimentos]

    // Filtro local textual
    if (filtroLocal.trim()) {
      const termo = filtroLocal.trim().toLowerCase()
      dados = dados.filter(a => {
        const dataStr = new Date(a.dataAbastecimento).toLocaleString('pt-BR').toLowerCase()
        const extraido = a.litragemExtraida != null && a.valorExtraido != null
          ? `${a.litragemExtraida}l / r$ ${Number(a.valorExtraido).toFixed(2)}`
          : 'não extraído'
        return (
          a.placa.toLowerCase().includes(termo) ||
          dataStr.includes(termo) ||
          String(a.litragem).includes(termo) ||
          String(a.valor).includes(termo) ||
          extraido.includes(termo) ||
          obterCriadorPor(a).toLowerCase().includes(termo)
        )
      })
    }

    // Ordenação
    dados.sort((a, b) => {
      let cmp = 0
      switch (sortColumn) {
        case 'placa':
          cmp = a.placa.localeCompare(b.placa)
          break
        case 'dataAbastecimento':
          cmp = new Date(a.dataAbastecimento).getTime() - new Date(b.dataAbastecimento).getTime()
          break
        case 'litragem':
          cmp = Number(a.litragem) - Number(b.litragem)
          break
        case 'valor':
          cmp = Number(a.valor) - Number(b.valor)
          break
        case 'extraido': {
          const exA = a.litragemExtraida != null ? `${a.litragemExtraida}${a.valorExtraido}` : ''
          const exB = b.litragemExtraida != null ? `${b.litragemExtraida}${b.valorExtraido}` : ''
          cmp = exA.localeCompare(exB)
          break
        }
        case 'criador':
          cmp = obterCriadorPor(a).localeCompare(obterCriadorPor(b))
          break
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return dados
  }, [abastecimentos, filtroLocal, sortColumn, sortDirection])

  const totais = useMemo(() => ({
    totalLitros: dadosFiltradosOrdenados.reduce((sum, a) => sum + Number(a.litragem ?? 0), 0),
    totalValor: dadosFiltradosOrdenados.reduce((sum, a) => sum + Number(a.valor ?? 0), 0)
  }), [dadosFiltradosOrdenados])

  /* ── Preparar dados para exportação (busca todos os registros sem paginação) ── */

  const buscarTodosParaExportacao = useCallback(async () => {
    const dados = await abastecimentoService.listar({
      placa: filtroPlaca || undefined,
      dataInicio: filtroDataInicio || undefined,
      dataFim: filtroDataFim || undefined,
      usuarioCriadorId: filtroUsuario || undefined,
      limit: 0, // 0 = sem limite, retorna todos
    })
    return dados.abastecimentos || []
  }, [filtroPlaca, filtroDataInicio, filtroDataFim, filtroUsuario])

  const prepararDadosExportacao = useCallback((dados: Abastecimento[]) => {
    return dados.map(a => ({
      'Placa': a.placa,
      'Data/Hora': new Date(a.dataAbastecimento).toLocaleString('pt-BR'),
      'Litragem (L)': Number(a.litragem).toFixed(2),
      'Valor (R$)': `R$ ${Number(a.valor).toFixed(2)}`,
      'Criado por': obterCriadorPor(a)
    }))
  }, [])

  /* ── Exportar XLS ── */
  const exportarXLS = async () => {
    setExportando(true)
    try {
      const todos = await buscarTodosParaExportacao()
      if (todos.length === 0) {
        adicionarToast('Nenhum registro para exportar.', 'warning')
        return
      }
      const dados = prepararDadosExportacao(todos)
      const ws = XLSX.utils.json_to_sheet(dados)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Abastecimentos')

      const colWidths = Object.keys(dados[0]).map(key => ({
        wch: Math.max(key.length, 18)
      }))
      ws['!cols'] = colWidths

      XLSX.writeFile(wb, `relatorio_abastecimentos_${new Date().toISOString().slice(0, 10)}.xlsx`)
      adicionarToast(`Relatório exportado com ${todos.length} registro(s).`, 'success')
    } catch (erro) {
      adicionarToast('Erro ao exportar relatório.', 'error')
      console.error(erro)
    } finally {
      setExportando(false)
    }
  }

  /* ── Exportar PDF ── */
  const exportarPDF = async () => {
    setExportando(true)
    try {
      const todos = await buscarTodosParaExportacao()
      if (todos.length === 0) {
        adicionarToast('Nenhum registro para exportar.', 'warning')
        return
      }

      const dadosLinhas = prepararDadosExportacao(todos)

      const totalLitros = todos.reduce((sum, a) => sum + Number(a.litragem ?? 0), 0)
      const totalValor = todos.reduce((sum, a) => sum + Number(a.valor ?? 0), 0)

      const doc = new jsPDF('landscape', 'mm', 'a4')
      const pageWidth = doc.internal.pageSize.getWidth()

      doc.setFontSize(16)
      doc.text('Relatório de Abastecimentos', pageWidth / 2, 15, { align: 'center' })

      doc.setFontSize(9)
      const filtrosTexto = [
        filtroPlaca ? `Placa: ${filtroPlaca}` : '',
        filtroDataInicio ? `De: ${filtroDataInicio}` : '',
        filtroDataFim ? `Até: ${filtroDataFim}` : '',
        listaUsuarios.find(u => u.id === filtroUsuario) ? `Usuário: ${listaUsuarios.find(u => u.id === filtroUsuario)?.nome}` : '',
      ].filter(Boolean).join(' | ')
      if (filtrosTexto) {
        doc.text(filtrosTexto, pageWidth / 2, 22, { align: 'center' })
      }

      doc.setFontSize(8)
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 28, { align: 'center' })

      const rows = dadosLinhas.map(a => [
        a['Placa'],
        a['Data/Hora'],
        a['Litragem (L)'],
        a['Valor (R$)'],
        a['Criado por']
      ])

      autoTable(doc, {
        head: [['Placa', 'Data/Hora', 'Litragem (L)', 'Valor (R$)', 'Criado por']],
        body: rows,
        startY: 32,
        theme: 'striped',
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 9
        },
        bodyStyles: {
          fontSize: 8
        },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 30 },
          2: { cellWidth: 24 },
          3: { cellWidth: 26 },
          4: { cellWidth: 'auto' }
        },
        margin: { top: 32 }
      })

      const finalY = (doc as any).lastAutoTable.finalY + 8
      doc.setFontSize(10)
      doc.text(`Total de Litros: ${totalLitros.toFixed(2)} L`, 14, finalY)
      doc.text(`Total em Valor: R$ ${totalValor.toFixed(2)}`, 14, finalY + 6)
      doc.text(`Registros: ${todos.length}`, 14, finalY + 12)

      const pageHeight = doc.internal.pageSize.getHeight()
      const assinaturaY = pageHeight - 25
      doc.setFontSize(9)
      doc.text('Assinatura do Responsável', pageWidth / 2, assinaturaY, { align: 'center' })
      doc.line(60, assinaturaY - 2, pageWidth - 60, assinaturaY - 2)
      doc.setFontSize(8)
      doc.text('Nome: ___________________________     Data: ___/___/_______', pageWidth / 2, assinaturaY + 8, { align: 'center' })

      doc.save(`relatorio_abastecimentos_${new Date().toISOString().slice(0, 10)}.pdf`)
      adicionarToast(`Relatório exportado com ${todos.length} registro(s).`, 'success')
    } catch (erro) {
      adicionarToast('Erro ao exportar relatório.', 'error')
      console.error(erro)
    } finally {
      setExportando(false)
    }
  }

  return (
    <div className="relatorio-container">
      <h2>Relatório de Abastecimentos</h2>

      <section className="filtros-section">
        <form onSubmit={handleFiltrar} className="filtros-form">
          <div className="form-group">
            <label htmlFor="filtro-placa">Placa:</label>
            <PlacaAutocomplete
              id="filtro-placa"
              value={filtroPlaca}
              onChange={setFiltroPlaca}
              placeholder="Ex: ABC-1234"
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="filtro-data-inicio">Data Início:</label>
            <input
              id="filtro-data-inicio"
              type="datetime-local"
              value={filtroDataInicio}
              onChange={(e) => setFiltroDataInicio(e.target.value)}
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="filtro-data-fim">Data Fim:</label>
            <input
              id="filtro-data-fim"
              type="datetime-local"
              value={filtroDataFim}
              onChange={(e) => setFiltroDataFim(e.target.value)}
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="filtro-usuario">Usuário:</label>
            <select
              id="filtro-usuario"
              value={filtroUsuario}
              onChange={(e) => setFiltroUsuario(e.target.value)}
              disabled={carregando || !isAdmin}
              className="select-filtro"
            >
              {isAdmin ? (
                <>
                  <option value="">Todos os usuários</option>
                  {listaUsuarios.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.email})
                    </option>
                  ))}
                </>
              ) : (
                <option value={user?.id || ''}>
                  {user?.nome || 'Meus registros'}
                </option>
              )}
            </select>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={carregando} className="btn-filtrar">
              {carregando ? 'Carregando...' : 'Filtrar'}
            </button>
            <button type="button" onClick={handleLimpar} disabled={carregando} className="btn-limpar">
              Limpar Filtros
            </button>
          </div>

          <div className="export-actions">
            <span className="export-label">Exportar:</span>
            <button
              type="button"
              onClick={exportarXLS}
              disabled={carregando || exportando || total === 0}
              className="btn-export btn-export-xls"
            >
              {exportando ? '⏳' : '📊'} XLS
            </button>
            <button
              type="button"
              onClick={exportarPDF}
              disabled={carregando || exportando || total === 0}
              className="btn-export btn-export-pdf"
            >
              {exportando ? '⏳' : '📄'} PDF
            </button>
          </div>
        </form>
      </section>

      {abastecimentos.length > 0 && (
        <>
          <section className="resumo-section">
            <div className="card-resumo">
              <h4>Total de Litros</h4>
              <p className="valor">{totais.totalLitros.toFixed(2)} L</p>
            </div>
            <div className="card-resumo">
              <h4>Total de Valor</h4>
              <p className="valor">R$ {totais.totalValor.toFixed(2)}</p>
            </div>
            <div className="card-resumo">
              <h4>Registros</h4>
              <p className="valor">{dadosFiltradosOrdenados.length}</p>
            </div>
          </section>

          {/* Filtro rápido na tabela */}
          <div className="tabela-filtro-rapido">
            <input
              type="text"
              value={filtroLocal}
              onChange={e => setFiltroLocal(e.target.value)}
              placeholder="🔍  Filtrar na tabela... (placa, data, valor, criado por)"
              className="input-filtro-rapido"
            />
            <span className="tabela-contagem">
              {dadosFiltradosOrdenados.length} de {abastecimentos.length} registro(s)
            </span>
          </div>
        </>
      )}

      <section className="tabela-section">
        {dadosFiltradosOrdenados.length > 0 ? (
          <table className="tabela-abastecimentos">
            <thead>
              <tr>
                <th className="th-sortable" onClick={() => handleSort('placa')}>
                  Placa {renderSortIcon('placa')}
                </th>
                <th className="th-sortable" onClick={() => handleSort('dataAbastecimento')}>
                  Data/Hora {renderSortIcon('dataAbastecimento')}
                </th>
                <th className="th-sortable" onClick={() => handleSort('litragem')}>
                  Litragem (L) {renderSortIcon('litragem')}
                </th>
                <th className="th-sortable" onClick={() => handleSort('valor')}>
                  Valor (R$) {renderSortIcon('valor')}
                </th>
                <th className="th-sortable" onClick={() => handleSort('extraido')}>
                  Dados Extraídos {renderSortIcon('extraido')}
                </th>
                <th className="th-sortable" onClick={() => handleSort('criador')}>
                  Criado por {renderSortIcon('criador')}
                </th>
                <th className="th-acoes">Ações</th>
              </tr>
            </thead>
            <tbody>
              {dadosFiltradosOrdenados.map(abastecimento => (
                <tr key={abastecimento.id}>
                  <td>{abastecimento.placa}</td>
                  <td>{new Date(abastecimento.dataAbastecimento).toLocaleString('pt-BR')}</td>
                  <td>{Number(abastecimento.litragem).toFixed(2)}</td>
                  <td>R$ {Number(abastecimento.valor).toFixed(2)}</td>
                  <td>
                    {abastecimento.litragemExtraida != null && abastecimento.valorExtraido != null
                      ? `${abastecimento.litragemExtraida}L / R$ ${Number(abastecimento.valorExtraido).toFixed(2)}`
                      : 'Não extraído'
                    }
                  </td>
                  <td>{obterCriadorPor(abastecimento)}</td>
                  <td className="td-acoes">
                    <button
                      className="btn-acao-tabela btn-editar"
                      onClick={() => abrirModalEdicao(abastecimento)}
                      title="Editar abastecimento"
                    >
                      ✏️ Editar
                    </button>
                    {isAdmin && abastecimento.imagemUrl ? (
                      <button
                        className="btn-acao-tabela btn-imagem"
                        onClick={() => setImagemModalUrl(abastecimento.imagemUrl || '')}
                        title="Visualizar imagem"
                      >
                        🖼️ Ver
                      </button>
                    ) : isAdmin ? (
                      <span className="sem-imagem">—</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty-state">
            {carregando
              ? 'Carregando...'
              : abastecimentos.length > 0
                ? 'Nenhum registro corresponde ao filtro aplicado'
                : 'Nenhum registro encontrado'}
          </p>
        )}
      </section>

      {/* ── Paginação ── */}
      {totalPaginas > 1 && (
        <section className="paginacao-section">
          <div className="paginacao-info">
            {total} registro(s) — Página {pagina} de {totalPaginas}
          </div>
          <div className="paginacao-controles">
            <button
              className="btn-pagina"
              onClick={() => irParaPagina(1)}
              disabled={pagina <= 1}
              title="Primeira página"
            >
              ⟪
            </button>
            <button
              className="btn-pagina"
              onClick={() => irParaPagina(pagina - 1)}
              disabled={pagina <= 1}
              title="Página anterior"
            >
              ⟨
            </button>

            {Array.from({ length: totalPaginas }, (_, i) => i + 1)
              .filter(p => {
                const dist = Math.abs(p - pagina)
                return p === 1 || p === totalPaginas || dist <= 2
              })
              .map((p, idx, arr) => (
                <span key={p} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="paginacao-elipse">…</span>}
                  <button
                    className={`btn-pagina ${p === pagina ? 'btn-pagina-ativa' : ''}`}
                    onClick={() => irParaPagina(p)}
                  >
                    {p}
                  </button>
                </span>
              ))}

            <button
              className="btn-pagina"
              onClick={() => irParaPagina(pagina + 1)}
              disabled={pagina >= totalPaginas}
              title="Próxima página"
            >
              ⟩
            </button>
            <button
              className="btn-pagina"
              onClick={() => irParaPagina(totalPaginas)}
              disabled={pagina >= totalPaginas}
              title="Última página"
            >
              ⟫
            </button>
          </div>
        </section>
      )}

      {/* ── Modal de edição de abastecimento (admin) ── */}
      {modalEdicaoAberto && abastecimentoEditando && (
        <div className="modal-overlay" onClick={fecharModalEdicao}>
          <div className="modal-content modal-edicao" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar Abastecimento</h3>
              <button className="modal-close" onClick={fecharModalEdicao}>✕</button>
            </div>

            <form onSubmit={handleSalvarEdicao} className="modal-form">
              <div className="modal-field">
                <label htmlFor="editar-placa">Placa</label>
                <input
                  id="editar-placa"
                  name="placa"
                  type="text"
                  value={formEdicao.placa}
                  onChange={handleEdicaoChange}
                  required
                  disabled={salvandoEdicao}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="editar-litragem">Litragem (L)</label>
                <input
                  id="editar-litragem"
                  name="litragem"
                  type="number"
                  step="0.01"
                  value={formEdicao.litragem}
                  onChange={handleEdicaoChange}
                  required
                  disabled={salvandoEdicao}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="editar-valor">Valor (R$)</label>
                <input
                  id="editar-valor"
                  name="valor"
                  type="number"
                  step="0.01"
                  value={formEdicao.valor}
                  onChange={handleEdicaoChange}
                  required
                  disabled={salvandoEdicao}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="editar-data">Data/Hora</label>
                <input
                  id="editar-data"
                  name="dataHora"
                  type="datetime-local"
                  value={formEdicao.dataHora}
                  onChange={handleEdicaoChange}
                  required
                  disabled={salvandoEdicao}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="editar-obs">Observações</label>
                <textarea
                  id="editar-obs"
                  name="observacoes"
                  value={formEdicao.observacoes}
                  onChange={handleEdicaoChange}
                  disabled={salvandoEdicao}
                  rows={3}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancelar" onClick={fecharModalEdicao} disabled={salvandoEdicao}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvandoEdicao}>
                  {salvandoEdicao ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de visualização de imagem (admin) ── */}
      {imagemModalUrl && (
        <div className="modal-overlay" onClick={fecharModalImagem}>
          <div className="modal-imagem" onClick={(e) => e.stopPropagation()}>
            <div className="modal-imagem-header">
              <h3>Imagem do Abastecimento</h3>
              <button className="modal-imagem-fechar" onClick={fecharModalImagem}>
                ✕
              </button>
            </div>
            <div className="modal-imagem-corpo">
              <img src={imagemModalUrl} alt="Comprovante de abastecimento" />
            </div>
            <div className="modal-imagem-footer">
              <a
                href={imagemModalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-abrir-externo"
              >
                ↗️ Abrir em nova aba
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Relatorio
