import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuth } from '../contexts/AuthContext'
import { STORAGE_EMAIL, migrarStorageLegado } from '../utils/storage'
import { ehGestor, homePath } from '../utils/homePath'
import api from '../services/api'
import '../styles/Login.css'
import { useAppVersion } from '../hooks/useAppVersion'

migrarStorageLegado()

type ModoAcesso = 'escolha' | 'gestor' | 'contratos' | 'lista-contratos'

type ContratoLocal = {
  id: string
  numeroContrato: string
  status: string
}

const IconEmail = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
)

const IconLock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)

const IconEye = ({ visible }: { visible: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {visible ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
)

const IconSpinner = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="spinner-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

function mensagemErro(err: unknown): string {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const data = err.response.data as { error?: string }
    if (data.error) return data.error
  }
  if (err instanceof Error && err.message) return err.message
  return 'Não foi possível entrar.'
}

function Login() {
  const navigate = useNavigate()
  const { login, logout, entrarLocal, user } = useAuth()

  const [modo, setModo] = useState<ModoAcesso>('escolha')
  const [acessoLivre, setAcessoLivre] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [shake, setShake] = useState(false)
  const [contratos, setContratos] = useState<ContratoLocal[]>([])

  const emailRef = useRef<HTMLInputElement>(null)
  const versaoLabel = useAppVersion()

  useEffect(() => {
    if (modo === 'gestor' || modo === 'contratos') emailRef.current?.focus()
  }, [modo])

  useEffect(() => {
    if (!user || modo !== 'escolha') return
    navigate(homePath(user), { replace: true })
  }, [user, modo, navigate])

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_EMAIL)
      || localStorage.getItem('abastecimento_email')
    if (saved) {
      setEmail(saved)
      setLembrar(true)
    }
  }, [])

  useEffect(() => {
    api.get<{ habilitado: boolean; contratos: ContratoLocal[] }>('/auth/acesso-local')
      .then(({ data }) => {
        setAcessoLivre(Boolean(data.habilitado))
        setContratos((data.contratos || []).filter((c) => c.status !== 'encerrado'))
      })
      .catch(() => setAcessoLivre(false))
  }, [])

  const triggerError = (msg: string) => {
    setErro(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const persistirEmail = () => {
    if (lembrar) localStorage.setItem(STORAGE_EMAIL, email.trim())
    else {
      localStorage.removeItem(STORAGE_EMAIL)
      localStorage.removeItem('abastecimento_email')
    }
  }

  const entrarComoGestor = async () => {
    setErro('')
    setCarregando(true)
    try {
      await entrarLocal('gestor')
      navigate('/visao-geral', { replace: true })
    } catch (err: unknown) {
      triggerError(mensagemErro(err))
    } finally {
      setCarregando(false)
    }
  }

  const abrirListaContratos = () => {
    setErro('')
    setModo('lista-contratos')
  }

  const abrirUnidade = async (contractId: string) => {
    setCarregando(true)
    setErro('')
    try {
      await entrarLocal('contrato', contractId)
      navigate(`/contratos/${contractId}`, { replace: true })
    } catch (err: unknown) {
      triggerError(mensagemErro(err))
    } finally {
      setCarregando(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (!email.trim()) {
      triggerError('Informe o email.')
      emailRef.current?.focus()
      return
    }
    if (!senha.trim()) {
      triggerError('Informe a senha.')
      return
    }

    setCarregando(true)
    try {
      const logado = await login(email.trim(), senha)
      persistirEmail()

      if (modo === 'gestor') {
        if (!ehGestor(logado)) {
          logout()
          triggerError('Este usuário não é gestor. Escolha Contratos para entrar numa unidade.')
          return
        }
        navigate('/visao-geral', { replace: true })
        return
      }

      if (logado.contractId) {
        navigate(`/contratos/${logado.contractId}`, { replace: true })
        return
      }

      navigate(homePath(logado), { replace: true })
    } catch (err: unknown) {
      triggerError(mensagemErro(err))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="login-container">
      <div className="bg-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>

      <div className={`login-card ${shake ? 'shake' : ''}`}>
        <div className="login-header">
          <div className="login-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 19V9a6 6 0 0 1 12 0v10" />
              <path d="M2 19h20" />
              <path d="M12 12v4" />
              <path d="M9 12h6" />
            </svg>
          </div>
          <h1>Sistemma</h1>
          <p className="subtitle">
            {modo === 'escolha' && (acessoLivre ? 'Escolha a área' : 'Como você quer entrar?')}
            {modo === 'gestor' && 'Gestor — todos os contratos para comparar'}
            {modo === 'contratos' && 'Contratos — acesso a uma unidade'}
            {modo === 'lista-contratos' && 'Escolha a unidade'}
          </p>
        </div>

        {erro && (
          <div className="login-erro">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{erro}</span>
          </div>
        )}

        {modo === 'escolha' && (
          <div className="login-modos">
            <button
              type="button"
              className="login-modo"
              disabled={carregando}
              onClick={() => { acessoLivre ? void entrarComoGestor() : setModo('gestor') }}
            >
              <strong>Gestor</strong>
              <span>Ver e comparar dados de todos os contratos</span>
            </button>
            <button
              type="button"
              className="login-modo"
              disabled={carregando}
              onClick={() => { acessoLivre ? abrirListaContratos() : setModo('contratos') }}
            >
              <strong>Contratos</strong>
              <span>Entrar numa unidade e ver só os dados dela</span>
            </button>
            {carregando && (
              <p className="login-footer"><IconSpinner /> Entrando…</p>
            )}
          </div>
        )}

        {(modo === 'gestor' || modo === 'contratos') && !acessoLivre && (
          <form className="login-form" onSubmit={(e) => { void handleSubmit(e) }} noValidate>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <div className="input-wrapper">
                <IconEmail />
                <input
                  ref={emailRef}
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={carregando}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="senha">Senha</label>
              <div className="input-wrapper">
                <IconLock />
                <input
                  id="senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  placeholder="Sua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  disabled={carregando}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-senha"
                  onClick={() => setMostrarSenha((prev) => !prev)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  tabIndex={-1}
                >
                  <IconEye visible={mostrarSenha} />
                </button>
              </div>
            </div>

            <div className="login-options">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  disabled={carregando}
                />
                <span className="checkbox-mark" />
                <span>Lembrar email</span>
              </label>
            </div>

            <button className="login-btn" type="submit" disabled={carregando}>
              {carregando ? (<><IconSpinner />Entrando…</>) : 'Entrar'}
            </button>
            <button type="button" className="login-voltar" onClick={() => { setModo('escolha'); setErro('') }}>
              Voltar
            </button>
          </form>
        )}

        {modo === 'lista-contratos' && (
          <div className="login-lista-contratos">
            {contratos.length === 0 ? (
              <p className="login-footer">Nenhum contrato ativo encontrado.</p>
            ) : contratos.map((c) => (
              <button
                key={c.id}
                type="button"
                className="login-modo"
                disabled={carregando}
                onClick={() => { void abrirUnidade(c.id) }}
              >
                <strong>{c.numeroContrato}</strong>
                <span>Abrir somente esta unidade</span>
              </button>
            ))}
            <button type="button" className="login-voltar" onClick={() => { logout(); setModo('escolha'); setErro('') }}>
              Voltar
            </button>
          </div>
        )}

        <p className="login-footer">{versaoLabel}</p>
      </div>
    </div>
  )
}

export default Login
