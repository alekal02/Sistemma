import { useState, useEffect, useCallback } from 'react'
import { caminhaoService } from '../services/api'
import type { Caminhao } from '../types'
import { useToast } from '../contexts/ToastContext'
import '../styles/Caminhoes.css'

interface FormCaminhao {
  modelo: string
  ano: string
  placa: string
  codigo: string
}

const formVazio: FormCaminhao = { modelo: '', ano: '', placa: '', codigo: '' }

function Caminhoes() {
  const [caminhoes, setCaminhoes] = useState<Caminhao[]>([])
  const [carregando, setCarregando] = useState(false)
  const { adicionarToast } = useToast()

  // Modal
  const [modalAberto, setModalAberto] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormCaminhao>(formVazio)
  const [salvando, setSalvando] = useState(false)

  const carregarCaminhoes = useCallback(async () => {
    setCarregando(true)
    try {
      const data = await caminhaoService.listar()
      setCaminhoes(data.caminhoes || [])
    } catch (erro) {
      console.error('Erro ao carregar caminhões:', erro)
      adicionarToast('Erro ao carregar caminhões', 'error')
    } finally {
      setCarregando(false)
    }
  }, [adicionarToast])

  useEffect(() => {
    carregarCaminhoes()
  }, [carregarCaminhoes])

  const abrirModalNovo = () => {
    setEditandoId(null)
    setForm(formVazio)
    setModalAberto(true)
  }

  const abrirModalEditar = (c: Caminhao) => {
    setEditandoId(c.id)
    setForm({
      modelo: c.modelo,
      ano: String(c.ano),
      placa: c.placa,
      codigo: c.codigo,
    })
    setModalAberto(true)
  }

  const fecharModal = () => {
    setModalAberto(false)
    setEditandoId(null)
    setForm(formVazio)
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.modelo || !form.ano || !form.placa || !form.codigo) {
      adicionarToast('Preencha todos os campos', 'warning')
      return
    }

    setSalvando(true)
    try {
      if (editandoId) {
        await caminhaoService.atualizar(editandoId, {
          modelo: form.modelo,
          ano: Number(form.ano),
          placa: form.placa,
          codigo: form.codigo,
        })
        adicionarToast('Caminhão atualizado com sucesso!', 'success')
      } else {
        await caminhaoService.criar({
          modelo: form.modelo,
          ano: Number(form.ano),
          placa: form.placa,
          codigo: form.codigo,
        })
        adicionarToast('Caminhão cadastrado com sucesso!', 'success')
      }
      fecharModal()
      await carregarCaminhoes()
    } catch (erro: unknown) {
      const msg = erro instanceof Error ? erro.message : 'Erro ao salvar caminhão'
      adicionarToast(msg, 'error')
      console.error(erro)
    } finally {
      setSalvando(false)
    }
  }

  const handleExcluir = async (id: string, placa: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o caminhão ${placa}?`)) {
      return
    }

    try {
      await caminhaoService.excluir(id)
      adicionarToast('Caminhão excluído com sucesso!', 'success')
      await carregarCaminhoes()
    } catch (erro) {
      console.error('Erro ao excluir caminhão:', erro)
      adicionarToast('Erro ao excluir caminhão', 'error')
    }
  }

  return (
    <div className="caminhoes-container">
      <h2>Gerenciar Caminhões</h2>
      <p className="subtitle">Cadastre e gerencie os caminhões da frota</p>

      <div className="caminhoes-header">
        <button className="btn-novo-caminhao" onClick={abrirModalNovo}>
          + Novo Caminhão
        </button>
      </div>

      {carregando ? (
        <p className="empty-state">Carregando...</p>
      ) : caminhoes.length === 0 ? (
        <p className="empty-state">Nenhum caminhão cadastrado</p>
      ) : (
        <table className="tabela-caminhoes">
          <thead>
            <tr>
              <th>Modelo</th>
              <th>Ano</th>
              <th>Placa</th>
              <th>Código</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {caminhoes.map(c => (
              <tr key={c.id}>
                <td>{c.modelo}</td>
                <td>{c.ano}</td>
                <td>{c.placa}</td>
                <td>{c.codigo}</td>
                <td>
                  <button
                    className="acao-btn acao-btn-editar"
                    onClick={() => abrirModalEditar(c)}
                  >
                    Editar
                  </button>
                  <button
                    className="acao-btn acao-btn-excluir"
                    onClick={() => handleExcluir(c.id, c.placa)}
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Modal de cadastro/edição */}
      {modalAberto && (
        <div className="modal-overlay" onClick={fecharModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h3>{editandoId ? 'Editar Caminhão' : 'Novo Caminhão'}</h3>
            <form onSubmit={handleSalvar} className="modal-form">
              <div className="form-group">
                <label htmlFor="modelo">Modelo</label>
                <input
                  id="modelo"
                  name="modelo"
                  type="text"
                  value={form.modelo}
                  onChange={handleChange}
                  placeholder="Ex: Scania R440"
                  required
                  disabled={salvando}
                />
              </div>

              <div className="form-group">
                <label htmlFor="ano">Ano</label>
                <input
                  id="ano"
                  name="ano"
                  type="number"
                  min="1980"
                  max="2030"
                  value={form.ano}
                  onChange={handleChange}
                  placeholder="Ex: 2023"
                  required
                  disabled={salvando}
                />
              </div>

              <div className="form-group">
                <label htmlFor="placa">Placa</label>
                <input
                  id="placa"
                  name="placa"
                  type="text"
                  value={form.placa}
                  onChange={handleChange}
                  placeholder="Ex: ABC-1234"
                  required
                  disabled={salvando}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div className="form-group">
                <label htmlFor="codigo">Código</label>
                <input
                  id="codigo"
                  name="codigo"
                  type="text"
                  value={form.codigo}
                  onChange={handleChange}
                  placeholder="Ex: CAM-001"
                  required
                  disabled={salvando}
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div className="modal-actions">
                <button type="submit" disabled={salvando} className="btn-salvar">
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
                <button type="button" onClick={fecharModal} className="btn-cancelar">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Caminhoes
