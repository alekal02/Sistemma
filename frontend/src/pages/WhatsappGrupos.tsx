import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  FiCheckCircle, FiAlertTriangle, FiPlus, FiEdit2, FiTrash2,
  FiRefreshCw, FiMessageSquare, FiX, FiWifi, FiWifiOff,
} from 'react-icons/fi'
import { useAuth } from '../contexts/AuthContext'
import { ehGestor } from '../utils/homePath'
import { useToast } from '../contexts/ToastContext'
import wuzapiService, {
  type WhatsappGrupoMapaItem,
  type WhatsappGrupoWhatsAppItem,
  type WuzapiStatus,
} from '../services/wuzapiService'
import contractService from '../services/contractService'
import servicoService from '../services/servicoService'
import '../styles/WhatsappGrupos.css'

interface ServicoOpcao {
  id: string
  label: string
  contratoId: string
  nome: string
  unidadeNome: string
}

interface RecebimentoItem {
  em: string
  grupoJid: string
  nomeGrupo: string | null
  tipo: 'relatorio' | 'planilha' | 'ignorado'
  resumo: string
}

interface FormGrupo {
  grupoJid: string
  nomeGrupo: string
  servicoId: string
  estrategia: string
  responderPdf: boolean
  ativo: boolean
}

const formVazio: FormGrupo = {
  grupoJid: '',
  nomeGrupo: '',
  servicoId: '',
  estrategia: 'atualizar_data',
  responderPdf: false,
  ativo: true,
}

const ESTRATEGIAS = [
  { value: 'atualizar_data', label: 'Atualizar por data' },
  { value: 'inserir_data', label: 'Inserir por data' },
  { value: 'ignorar', label: 'Ignorar duplicatas' },
  { value: 'substituir', label: 'Substituir conflitos' },
]

export default function WhatsappGrupos() {
  const { user } = useAuth()
  const { adicionarToast } = useToast()
  const contratoAtual = user?.contractId || ''
  const [status, setStatus] = useState<WuzapiStatus | null>(null)
  const [grupos, setGrupos] = useState<WhatsappGrupoMapaItem[]>([])
  const [servicos, setServicos] = useState<ServicoOpcao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [conectando, setConectando] = useState(false)
  const [desconectando, setDesconectando] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormGrupo>(formVazio)
  const [salvando, setSalvando] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)
  const [contratosOpcoes, setContratosOpcoes] = useState<{ id: string; numeroContrato: string }[]>([])
  const [unidadeId, setUnidadeId] = useState(contratoAtual)
  const [recebimentos, setRecebimentos] = useState<RecebimentoItem[]>([])
  const [gruposWa, setGruposWa] = useState<WhatsappGrupoWhatsAppItem[]>([])
  const [carregandoGruposWa, setCarregandoGruposWa] = useState(false)
  const [filtroGrupo, setFiltroGrupo] = useState('')
  const [modoManual, setModoManual] = useState(false)

  const atualizarStatus = useCallback(async (silencioso = false) => {
    try {
      const st = await wuzapiService.status()
      setStatus(st)
    } catch (error: unknown) {
      if (!silencioso) {
        const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
        adicionarToast(msg || 'Erro ao verificar status WhatsApp', 'error')
      }
    }
  }, [adicionarToast])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [st, lista, contratos] = await Promise.all([
        wuzapiService.status(),
        wuzapiService.listarGrupos(),
        contractService.listar(),
      ])
      setStatus(st)

      const contratosAlvo = contratoAtual
        ? contratos.filter((c) => c.id === contratoAtual)
        : contratos
      setContratosOpcoes(contratosAlvo.map((c) => ({ id: c.id, numeroContrato: c.numeroContrato })))

      const opcoes: ServicoOpcao[] = []
      await Promise.all(
        contratosAlvo.map(async (c) => {
          try {
            const svs = await servicoService.listarServicosContrato(c.id)
            for (const s of svs) {
              opcoes.push({
                id: s.id,
                contratoId: c.id,
                nome: s.nome,
                unidadeNome: c.numeroContrato,
                label: contratoAtual ? s.nome : `${c.numeroContrato} · ${s.nome}`,
              })
            }
          } catch { /* ignora */ }
        }),
      )
      const servicoIdsUnidade = new Set(opcoes.map((s) => s.id))
      setGrupos(contratoAtual
        ? lista.filter((g) => servicoIdsUnidade.has(g.servicoId))
        : lista)
      opcoes.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
      setServicos(opcoes)
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao carregar grupos WhatsApp', 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast, contratoAtual])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    let vivo = true
    const tick = async () => {
      try {
        const lista = await wuzapiService.listarRecebimentos()
        if (vivo) setRecebimentos(lista)
      } catch { /* a verificação não deve derrubar a página */ }
    }
    void tick()
    const id = window.setInterval(() => { void tick() }, 8000)
    return () => {
      vivo = false
      window.clearInterval(id)
    }
  }, [])

  const logado = !!(status?.logado ?? status?.sessao?.loggedIn)
  useEffect(() => {
    if (!status?.configurado || logado) return
    const id = setInterval(() => atualizarStatus(true), 4000)
    return () => clearInterval(id)
  }, [status?.configurado, logado, atualizarStatus])

  const webhookUrl = useMemo(() => {
    if (status?.webhookUrl) return status.webhookUrl
    const vite = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
    let apiBase: string
    if (/^https?:\/\//i.test(vite)) {
      apiBase = vite
    } else if (window.location.port === '5175' || window.location.port === '5173') {
      apiBase = `${window.location.protocol}//${window.location.hostname}:3200/api`
    } else {
      apiBase = `${window.location.origin}${vite.startsWith('/') ? vite : `/${vite}`}`
    }
    return `${apiBase.replace(/\/+$/, '').replace(/\/api\/api$/i, '/api')}/wuzapi/webhook`
  }, [status?.webhookUrl])

  const handleConectar = async () => {
    setConectando(true)
    try {
      const r = await wuzapiService.connect()
      if (r.sucesso === false) {
        adicionarToast(r.erro || 'Falha ao conectar', 'error')
      } else {
        adicionarToast(r.message || 'Conexão iniciada — escaneie o QR', 'success')
        if (r.qrCode) {
          setStatus((prev) => (prev ? { ...prev, qrCode: r.qrCode, conectado: true, logado: false } : prev))
        }
        setTimeout(() => atualizarStatus(true), 2000)
      }
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { erro?: string; error?: string } } })?.response?.data?.erro
        || (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao conectar WhatsApp', 'error')
    } finally {
      setConectando(false)
    }
  }

  const handleDesconectar = async () => {
    if (!window.confirm('Desconectar o WhatsApp deste sistema? Será preciso escanear o QR de novo.')) {
      return
    }
    setDesconectando(true)
    try {
      const r = await wuzapiService.disconnect()
      if (r.sucesso === false) {
        adicionarToast(r.erro || 'Falha ao desconectar', 'error')
      } else {
        adicionarToast(r.message || 'WhatsApp desconectado', 'success')
        setStatus((prev) => (prev
          ? {
              ...prev,
              conectado: false,
              logado: false,
              qrCode: null,
              sessao: prev.sessao
                ? { ...prev.sessao, connected: false, loggedIn: false, jid: '' }
                : null,
            }
          : prev))
        setTimeout(() => atualizarStatus(true), 800)
      }
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { erro?: string; error?: string } } })?.response?.data?.erro
        || (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao desconectar WhatsApp', 'error')
    } finally {
      setDesconectando(false)
    }
  }

  const carregarGruposWhatsApp = useCallback(async () => {
    setCarregandoGruposWa(true)
    try {
      const lista = await wuzapiService.listarGruposWhatsApp()
      setGruposWa(lista)
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Não foi possível listar grupos do WhatsApp', 'warning')
      setGruposWa([])
    } finally {
      setCarregandoGruposWa(false)
    }
  }, [adicionarToast])

  const abrirNovo = async () => {
    setEditandoId(null)
    setUnidadeId(contratoAtual)
    setForm(formVazio)
    setFiltroGrupo('')
    setModoManual(false)
    setModalAberto(true)
    await carregarGruposWhatsApp()
  }
  const abrirEditar = (g: WhatsappGrupoMapaItem) => {
    const servico = servicos.find((s) => s.id === g.servicoId)
    setUnidadeId(servico?.contratoId || contratoAtual)
    setEditandoId(g.id)
    setForm({
      grupoJid: g.grupoJid,
      nomeGrupo: g.nomeGrupo || '',
      servicoId: g.servicoId,
      estrategia: g.estrategia || 'atualizar_data',
      responderPdf: g.responderPdf,
      ativo: g.ativo,
    })
    setModoManual(true)
    setModalAberto(true)
  }
  const fecharModal = () => {
    setModalAberto(false)
    setEditandoId(null)
    setForm(formVazio)
    setFiltroGrupo('')
    setModoManual(false)
  }

  const selecionarGrupoWa = (g: WhatsappGrupoWhatsAppItem) => {
    if (g.jaMapeado) {
      adicionarToast('Este grupo já está mapeado', 'warning')
      return
    }
    setForm((f) => ({
      ...f,
      grupoJid: g.jid,
      nomeGrupo: g.nome,
    }))
  }

  const gruposWaFiltrados = useMemo(() => {
    const q = filtroGrupo.trim().toLowerCase()
    if (!q) return gruposWa
    return gruposWa.filter(
      (g) => g.nome.toLowerCase().includes(q) || g.jid.toLowerCase().includes(q),
    )
  }, [gruposWa, filtroGrupo])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.grupoJid.trim() || !form.servicoId) {
      adicionarToast('Informe o JID do grupo e o serviço', 'warning')
      return
    }
    setSalvando(true)
    try {
      const payload = {
        grupoJid: form.grupoJid.trim(),
        nomeGrupo: form.nomeGrupo.trim() || null,
        servicoId: form.servicoId,
        estrategia: form.estrategia,
        responderPdf: form.responderPdf,
        ativo: form.ativo,
      }
      if (editandoId) {
        await wuzapiService.atualizarGrupo(editandoId, payload)
        adicionarToast('Mapeamento atualizado', 'success')
      } else {
        await wuzapiService.criarGrupo(payload)
        adicionarToast('Grupo mapeado com sucesso', 'success')
      }
      fecharModal()
      await carregar()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao salvar mapeamento', 'error')
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!excluindoId) return
    try {
      await wuzapiService.excluirGrupo(excluindoId)
      adicionarToast('Mapeamento removido', 'success')
      setExcluindoId(null)
      await carregar()
    } catch (error: unknown) {
      const msg = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
      adicionarToast(msg || 'Erro ao excluir', 'error')
    }
  }

  const conectado = !!(status?.conectado ?? status?.sessao?.connected)
  const sessaoOk = conectado && logado
  const wuzapiOffline = !!(status?.wuzapiOffline)
  const aguardandoQr = !!(status?.configurado && conectado && !logado && !wuzapiOffline)
  const qrCode = status?.qrCode || null

  const servicosDaUnidade = unidadeId
    ? servicos.filter((s) => s.contratoId === unidadeId)
    : servicos
  const noHubGestor = ehGestor(user) && !contratoAtual

  return (
    <div className="wa-grupos-container">
      <div className="wa-grupos-top">
        <div>
          <h2>{noHubGestor ? 'WhatsApp do gestor' : 'WhatsApp desta unidade'}</h2>
          <p className="wa-subtitle">
            Escolha a unidade e o grupo. O número só atende esses grupos:
            relatórios (e as variações, como Relatório diário ou de ciclo) e planilhas.
            Conversas privadas e os demais grupos são descartados, sem leitura.
          </p>
        </div>
        <div className="wa-grupos-actions">
          <button type="button" className="btn-ghost" onClick={carregar} title="Recarregar">
            <FiRefreshCw size={14} />
          </button>
          <button type="button" className="btn-novo" onClick={abrirNovo}>
            <FiPlus size={16} /> Novo grupo
          </button>
        </div>
      </div>

      <div className={`wa-status-card ${status?.configurado ? (sessaoOk ? 'ok' : 'warn') : 'off'}`}>
        <div className="wa-status-icon">
          {sessaoOk ? <FiCheckCircle size={18} /> : <FiAlertTriangle size={18} />}
        </div>
        <div className="wa-status-body">
          <strong>
            {!status?.configurado
              ? 'WuzAPI não configurada'
              : wuzapiOffline
                ? 'WuzAPI offline (container parado)'
                : sessaoOk
                  ? 'WhatsApp conectado e logado'
                  : aguardandoQr
                    ? 'Aguardando leitura do QR Code'
                    : 'WuzAPI configurada — sessão offline'}
          </strong>
          <div className="wa-status-meta">
            {!status?.configurado
              ? 'Defina WUZAPI_URL e WUZAPI_TOKEN no .env e reinicie o backend (a WuzAPI precisa estar rodando).'
              : wuzapiOffline
                ? 'Suba a WuzAPI: docker compose up -d wuzapi-db wuzapi — depois clique em Conectar / Gerar QR.'
                : (
                <>
                  {status?.url || 'URL não definida'}
                  {status?.tokenExiste === false ? ' · token ausente' : ''}
                  {status?.sessao?.jid ? ` · ${status.sessao.jid}` : ''}
                  {status?.mensagem ? ` · ${status.mensagem}` : ''}
                  {status?.erroSessao && !wuzapiOffline ? ` · ${status.erroSessao}` : ''}
                </>
              )}
          </div>
          {status?.configurado && (
            <div className="wa-webhook">
              Webhook: <code>{webhookUrl}</code>
              <button type="button" className="btn-copy" onClick={() => {
                navigator.clipboard.writeText(webhookUrl)
                adicionarToast('URL do webhook copiada', 'success')
              }}>Copiar</button>
            </div>
          )}
          {status?.configurado && !wuzapiOffline && (
            <div className="wa-connect-row">
              {!logado && (
                <button
                  type="button"
                  className="btn-conectar"
                  onClick={handleConectar}
                  disabled={conectando || desconectando}
                >
                  <FiWifi size={15} />
                  {conectando ? 'Conectando…' : 'Conectar / Gerar QR'}
                </button>
              )}
              {(conectado || logado) && (
                <button
                  type="button"
                  className="btn-desconectar"
                  onClick={handleDesconectar}
                  disabled={conectando || desconectando}
                  title="Encerrar sessão WhatsApp neste sistema"
                >
                  <FiWifiOff size={15} />
                  {desconectando ? 'Desconectando…' : 'Desconectar'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {aguardandoQr && (
        <div className="wa-qr-box">
          <h3>Escaneie o QR Code</h3>
          <p>No celular: <strong>WhatsApp → Aparelhos conectados → Conectar um aparelho</strong></p>
          {qrCode ? (
            <img src={qrCode} alt="QR Code WhatsApp" className="wa-qr-img" />
          ) : (
            <p className="wa-qr-wait">Gerando QR… clique em “Conectar / Gerar QR” se não aparecer.</p>
          )}
          <p className="wa-qr-hint">O código atualiza sozinho a cada poucos segundos. Não feche esta página.</p>
        </div>
      )}

      <div className="wa-recebimentos">
        <div className="wa-picker-hd">
          <strong>Verificação de recebimento</strong>
          <span>Somente grupos selecionados</span>
        </div>
        {recebimentos.length === 0 ? (
          <p className="wa-picker-empty">Nenhum relatório ou planilha recebido nesta sessão.</p>
        ) : (
          <ul className="wa-recebimentos-lista">
            {recebimentos.map((r) => (
              <li key={`${r.em}-${r.grupoJid}-${r.resumo}`}>
                <span className={`wa-pill ${r.tipo === 'ignorado' ? 'off' : 'on'}`}>
                  {r.tipo === 'planilha' ? 'Planilha' : r.tipo === 'relatorio' ? 'Relatório' : 'Ignorado'}
                </span>
                <span>{r.nomeGrupo || r.grupoJid}</span>
                <span className="wa-recebimento-resumo">{r.resumo}</span>
                <time>{new Date(r.em).toLocaleString('pt-BR')}</time>
              </li>
            ))}
          </ul>
        )}
      </div>

      {sessaoOk && (
        <div className="wa-ok-banner">
          <FiCheckCircle size={16} /> WhatsApp logado — pronto para receber planilhas dos grupos.
          <button
            type="button"
            className="btn-desconectar-inline"
            onClick={handleDesconectar}
            disabled={desconectando}
          >
            <FiWifiOff size={14} />
            {desconectando ? 'Desconectando…' : 'Desconectar'}
          </button>
        </div>
      )}

      {carregando ? (
        <p className="wa-empty">Carregando…</p>
      ) : grupos.length === 0 ? (
        <div className="wa-empty-box">
          <FiMessageSquare size={28} />
          <p>Nenhum grupo mapeado ainda.</p>
          <button type="button" className="btn-novo" onClick={abrirNovo}>
            <FiPlus size={16} /> Mapear primeiro grupo
          </button>
        </div>
      ) : (
        <div className="wa-tabela-wrap">
          <table className="wa-tabela">
            <thead>
              <tr>
                <th>Grupo</th><th>JID</th><th>Contrato / Serviço</th>
                <th>Estratégia</th><th>PDF</th><th>Status</th><th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.id} className={!g.ativo ? 'inativo' : ''}>
                  <td><strong>{g.nomeGrupo || '—'}</strong></td>
                  <td><code className="wa-jid">{g.grupoJid}</code></td>
                  <td>
                    <div className="wa-servico">
                      <span className="wa-contrato">{g.contratoNome || '—'}</span>
                      <span>{g.servicoNome || g.servicoId}</span>
                    </div>
                  </td>
                  <td><span className="wa-badge">{g.estrategia}</span></td>
                  <td>{g.responderPdf ? 'Sim' : 'Não'}</td>
                  <td><span className={`wa-pill ${g.ativo ? 'on' : 'off'}`}>{g.ativo ? 'Ativo' : 'Inativo'}</span></td>
                  <td className="wa-acoes">
                    <button type="button" title="Editar" onClick={() => abrirEditar(g)}><FiEdit2 size={14} /></button>
                    <button type="button" title="Excluir" className="danger" onClick={() => setExcluindoId(g.id)}><FiTrash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAberto && (
        <div className="wa-modal-overlay" onClick={fecharModal}>
          <div className="wa-modal wa-modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="wa-modal-hd">
              <h3>{editandoId ? 'Editar grupo' : 'Mapear grupo WhatsApp'}</h3>
              <button type="button" onClick={fecharModal} aria-label="Fechar"><FiX size={18} /></button>
            </div>
            <form onSubmit={handleSalvar}>
              {!editandoId && !modoManual && (
                <div className="wa-picker">
                  <div className="wa-picker-hd">
                    <label>Selecione um grupo da sua conta</label>
                    <button
                      type="button"
                      className="btn-ghost btn-xs"
                      onClick={carregarGruposWhatsApp}
                      disabled={carregandoGruposWa}
                    >
                      <FiRefreshCw size={12} /> {carregandoGruposWa ? 'Carregando…' : 'Atualizar'}
                    </button>
                  </div>
                  <input
                    className="wa-picker-search"
                    value={filtroGrupo}
                    onChange={(e) => setFiltroGrupo(e.target.value)}
                    placeholder="Buscar pelo nome…"
                  />
                  <div className="wa-picker-list">
                    {carregandoGruposWa ? (
                      <p className="wa-picker-empty">Carregando grupos…</p>
                    ) : gruposWaFiltrados.length === 0 ? (
                      <p className="wa-picker-empty">
                        Nenhum grupo encontrado. Confirme que o WhatsApp está logado.
                      </p>
                    ) : (
                      gruposWaFiltrados.map((g) => (
                        <button
                          key={g.jid}
                          type="button"
                          className={`wa-picker-item ${form.grupoJid === g.jid ? 'selected' : ''} ${g.jaMapeado ? 'mapped' : ''}`}
                          onClick={() => selecionarGrupoWa(g)}
                          disabled={!!g.jaMapeado}
                          title={g.jaMapeado ? 'Já mapeado' : g.jid}
                        >
                          <span className="wa-picker-name">{g.nome}</span>
                          <span className="wa-picker-meta">
                            {g.jaMapeado ? 'Já mapeado' : `${g.participantes || '—'} membros`}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                  {form.grupoJid && (
                    <div className="wa-picker-selected">
                      Selecionado: <strong>{form.nomeGrupo || form.grupoJid}</strong>
                    </div>
                  )}
                  <button type="button" className="wa-link-btn" onClick={() => setModoManual(true)}>
                    Digitar JID manualmente
                  </button>
                </div>
              )}

              {(editandoId || modoManual) && (
                <>
                  <label>Nome do grupo
                    <input value={form.nomeGrupo} onChange={(e) => setForm((f) => ({ ...f, nomeGrupo: e.target.value }))} placeholder="Ex.: BH Roçada" />
                  </label>
                  <label>JID do grupo *
                    <input value={form.grupoJid} onChange={(e) => setForm((f) => ({ ...f, grupoJid: e.target.value }))} placeholder="120363...@g.us" required />
                  </label>
                  {!editandoId && (
                    <button type="button" className="wa-link-btn" onClick={() => setModoManual(false)}>
                      ← Voltar à lista de grupos
                    </button>
                  )}
                </>
              )}

              <label>Unidade *
                <select
                  value={unidadeId}
                  onChange={(e) => {
                    const id = e.target.value
                    setUnidadeId(id)
                    setForm((f) => ({ ...f, servicoId: '' }))
                  }}
                  required
                  disabled={!!contratoAtual}
                >
                  <option value="">Selecione a unidade…</option>
                  {contratosOpcoes.map((c) => (
                    <option key={c.id} value={c.id}>{c.numeroContrato}</option>
                  ))}
                </select>
              </label>
              <label>Serviço *
                <select value={form.servicoId} onChange={(e) => setForm((f) => ({ ...f, servicoId: e.target.value }))} required>
                  <option value="">{unidadeId ? 'Selecione…' : 'Escolha a unidade primeiro'}</option>
                  {servicosDaUnidade.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </label>
              <label>Estratégia de importação
                <select value={form.estrategia} onChange={(e) => setForm((f) => ({ ...f, estrategia: e.target.value }))}>
                  {ESTRATEGIAS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
                </select>
              </label>
              <div className="wa-checks">
                <label className="wa-check">
                  <input type="checkbox" checked={form.responderPdf} onChange={(e) => setForm((f) => ({ ...f, responderPdf: e.target.checked }))} />
                  Enviar PDF automaticamente após importar
                </label>
                <label className="wa-check">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} />
                  Ativo
                </label>
              </div>
              <div className="wa-modal-ft">
                <button type="button" className="btn-ghost" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn-novo" disabled={salvando || !form.grupoJid}>
                  {salvando ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {excluindoId && (
        <div className="wa-modal-overlay" onClick={() => setExcluindoId(null)}>
          <div className="wa-modal wa-modal-sm" onClick={(e) => e.stopPropagation()}>
            <h3>Remover mapeamento?</h3>
            <p>Planilhas deste grupo deixarão de ser importadas automaticamente.</p>
            <div className="wa-modal-ft">
              <button type="button" className="btn-ghost" onClick={() => setExcluindoId(null)}>Cancelar</button>
              <button type="button" className="btn-danger" onClick={confirmarExclusao}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
