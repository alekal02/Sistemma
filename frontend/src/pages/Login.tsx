/* ============================================
   TELA DE LOGIN — Profissional & Responsiva
   Ícones SVG inline, spinner, lembrar-me,
   esqueceu senha, animação de erro
   ============================================ */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import '../styles/Login.css'

/* ---------- Ícones SVG inline ---------- */
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

/* ---------- Componente principal ---------- */
function Login() {
  const navigate = useNavigate()
  const { login, user } = useAuth()

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [lembrar, setLembrar] = useState(false)
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [shake, setShake] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Foco automático no email ao montar
    emailRef.current?.focus()
  }, [])

  useEffect(() => {
    // Navega para o dashboard assim que o user for autenticado
    if (user) {
      navigate('/visao-geral', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    // Restaura email salvo se "lembrar" estava ativo
    const saved = localStorage.getItem('abastecimento_email')
    if (saved) {
      setEmail(saved)
      setLembrar(true)
    }
  }, [])

  const triggerError = (msg: string) => {
    setErro(msg)
    setShake(true)
    setTimeout(() => setShake(false), 500)
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
      await login(email.trim(), senha)

      // Salva / remove email conforme "lembrar"
      if (lembrar) {
        localStorage.setItem('abastecimento_email', email.trim())
      } else {
        localStorage.removeItem('abastecimento_email')
      }

      navigate('/visao-geral')
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Email ou senha inválidos.'
      triggerError(msg)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="login-container">
      {/* Background decorativo */}
      <div className="bg-shapes">
        <div className="shape shape-1" />
        <div className="shape shape-2" />
        <div className="shape shape-3" />
      </div>

      <div className={`login-card ${shake ? 'shake' : ''}`}>
        {/* Logo / Identidade */}
        <div className="login-header">
          <div className="login-logo">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 19V9a6 6 0 0 1 12 0v10" />
              <path d="M2 19h20" />
              <path d="M12 12v4" />
              <path d="M9 12h6" />
            </svg>
          </div>
          <h1>Abastecimento</h1>
          <p className="subtitle">Faça login para continuar</p>
        </div>

        {/* Mensagem de erro */}
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

        {/* Formulário */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {/* Campo Email */}
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

          {/* Campo Senha */}
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

          {/* Lembrar-me + Esqueceu senha */}
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
            <a href="#" className="forgot-link" onClick={(e) => e.preventDefault()}>
              Esqueceu a senha?
            </a>
          </div>

          {/* Botão */}
          <button className="login-btn" type="submit" disabled={carregando}>
            {carregando ? (
              <>
                <IconSpinner />
                Entrando…
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {/* Rodapé */}
        <p className="login-footer">
          Sistema de Abastecimento v1.0
        </p>
      </div>
    </div>
  )
}

export default Login
