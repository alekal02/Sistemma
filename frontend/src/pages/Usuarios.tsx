import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import api from '../services/api'
import '../styles/Usuarios.css'

interface Usuario {
  id: string
  nome: string
  email: string
  role: 'admin' | 'user'
  ativo: boolean
  criadoEm: string
}

function Usuarios() {
  const { user: usuarioLogado } = useAuth()
  const { adicionarToast } = useToast()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({ nome: '', email: '', senha: '', role: 'user' })
  const [salvando, setSalvando] = useState(false)

  const carregarUsuarios = async () => {
    setCarregando(true)
    try {
      const response = await api.get('/auth/users')
      setUsuarios(response.data.users || [])
    } catch (erro) {
      console.error('Erro ao carregar usuários:', erro)
      adicionarToast('Erro ao carregar usuários.', 'error')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarUsuarios()
  }, [])

  const toggleStatus = async (id: string) => {
    try {
      const response = await api.patch(`/auth/users/${id}/toggle-status`)
      const usuarioAtualizado = response.data.user

      setUsuarios(prev =>
        prev.map(u => (u.id === id ? { ...u, ativo: usuarioAtualizado.ativo } : u))
      )

      adicionarToast(
        usuarioAtualizado.ativo
          ? 'Usuário ativado com sucesso.'
          : 'Usuário desativado com sucesso.',
        'success'
      )
    } catch (erro) {
      console.error('Erro ao alterar status:', erro)
      adicionarToast('Erro ao alterar status do usuário.', 'error')
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)

    try {
      await api.post('/auth/register', formData)
      adicionarToast('Usuário cadastrado com sucesso!', 'success')
      setShowModal(false)
      setFormData({ nome: '', email: '', senha: '', role: 'user' })
      carregarUsuarios()
    } catch (erro: any) {
      const msg = erro.response?.data?.error || 'Erro ao cadastrar usuário.'
      adicionarToast(msg, 'error')
    } finally {
      setSalvando(false)
    }
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR')
  }

  return (
    <div className="usuarios-container">
      <div className="usuarios-header">
        <h2>Gerenciar Usuários</h2>
        <button className="btn-novo-usuario" onClick={() => setShowModal(true)}>
          + Novo Usuário
        </button>
      </div>

      <section className="usuarios-section">
        {carregando ? (
          <p className="empty-state">Carregando...</p>
        ) : usuarios.length === 0 ? (
          <p className="empty-state">Nenhum usuário encontrado.</p>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela-usuarios">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map(usuario => (
                  <tr key={usuario.id} className={!usuario.ativo ? 'inativo' : ''}>
                    <td>
                      <span className="user-nome">
                        {usuario.nome}
                        {usuario.id === usuarioLogado?.id && (
                          <span className="badge-vc">(você)</span>
                        )}
                      </span>
                    </td>
                    <td>{usuario.email}</td>
                    <td>
                      <span className={`badge-role ${usuario.role === 'admin' ? 'role-admin' : 'role-user'}`}>
                        {usuario.role === 'admin' ? 'Admin' : 'Usuário'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge-status ${usuario.ativo ? 'status-ativo' : 'status-inativo'}`}>
                        {usuario.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>{formatarData(usuario.criadoEm)}</td>
                    <td>
                      {usuario.id !== usuarioLogado?.id && (
                        <button
                          className={`btn-toggle-status ${usuario.ativo ? 'btn-desativar' : 'btn-ativar'}`}
                          onClick={() => toggleStatus(usuario.id)}
                          title={usuario.ativo ? 'Desativar usuário' : 'Ativar usuário'}
                        >
                          {usuario.ativo ? 'Desativar' : 'Ativar'}
                        </button>
                      )}
                      {usuario.id === usuarioLogado?.id && (
                        <span className="text-self">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal cadastro */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Novo Usuário</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCriar} className="modal-form">
              <div className="modal-field">
                <label htmlFor="nome">Nome</label>
                <input
                  id="nome"
                  name="nome"
                  type="text"
                  value={formData.nome}
                  onChange={handleChange}
                  placeholder="Nome completo"
                  required
                  disabled={salvando}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="email@exemplo.com"
                  required
                  disabled={salvando}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="senha">Senha</label>
                <input
                  id="senha"
                  name="senha"
                  type="password"
                  value={formData.senha}
                  onChange={handleChange}
                  placeholder="Mínimo 6 caracteres"
                  required
                  minLength={6}
                  disabled={salvando}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="role">Perfil</label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  disabled={salvando}
                >
                  <option value="user">Usuário</option>
                  <option value="admin">Administrador</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancelar" onClick={() => setShowModal(false)} disabled={salvando}>
                  Cancelar
                </button>
                <button type="submit" className="btn-salvar" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Usuarios
