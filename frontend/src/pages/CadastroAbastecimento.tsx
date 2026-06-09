import { useState } from 'react'
import '../styles/CadastroAbastecimento.css'
import abastecimentoService from '../services/abastecimentoService'
import PlacaAutocomplete from '../components/PlacaAutocomplete'
import { useToast } from '../contexts/ToastContext'

interface ExtracaoImagem {
  litragem: string | null
  valor: string | null
}

interface FormAbastecimento extends ExtracaoImagem {
  placa: string
  dataHora: string
}

function CadastroAbastecimento() {
  const [imagem, setImagem] = useState<File | null>(null)
  const [imagemUrl, setImagemUrl] = useState<string>('')
  const [extracao, setExtracao] = useState<ExtracaoImagem | null>(null)
  const [form, setForm] = useState<FormAbastecimento>({
    litragem: '',
    valor: '',
    placa: '',
    dataHora: ''
  })
  const [carregando, setCarregando] = useState(false)
  const { adicionarToast } = useToast()

  const handleUploadImagem = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImagem(file)
    setCarregando(true)
    adicionarToast('Processando imagem...', 'info')

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          const resultado = reader.result
          if (typeof resultado !== 'string') {
            reject(new Error('Não foi possível ler a imagem'))
            return
          }
          resolve(resultado)
        }
        reader.onerror = () => reject(new Error('Erro ao converter imagem'))
        reader.readAsDataURL(file)
      })

      // Upload: backend salva no MinIO e retorna a URL + dados extraídos
      const dados = await abastecimentoService.uploadImagem(base64)
      setImagemUrl(dados.imagemUrl || '')

      setExtracao({
        litragem: dados.extraido?.litragem?.toString() || dados.litragem || null,
        valor: dados.extraido?.valor?.toString() || dados.valor || null
      })
      setForm(prev => ({
        ...prev,
        litragem: dados.extraido?.litragem?.toString() || dados.litragem || '',
        valor: dados.extraido?.valor?.toString() || dados.valor || ''
      }))
      adicionarToast('Imagem processada com sucesso!', 'success')
    } catch (erro) {
      adicionarToast('Erro ao processar imagem. Tente novamente.', 'error')
      console.error(erro)
    } finally {
      setCarregando(false)
    }
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setForm(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!form.placa || !form.litragem || !form.valor || !form.dataHora) {
      adicionarToast('Preencha todos os campos obrigatórios', 'warning')
      return
    }

    if (!imagemUrl) {
      adicionarToast('Faça o upload da imagem da bomba antes de salvar', 'warning')
      return
    }

    setCarregando(true)
    adicionarToast('Salvando abastecimento...', 'info')

    try {
      await abastecimentoService.criar({
        placa: form.placa,
        litragem: form.litragem,
        valor: form.valor,
        dataHora: form.dataHora,
        dataAbastecimento: form.dataHora,
        imagemUrl,
        litragemExtraida: extracao?.litragem ? Number(extracao.litragem) : null,
        valorExtraido: extracao?.valor ? Number(extracao.valor) : null
      })

      adicionarToast('Abastecimento registrado com sucesso!', 'success')
      setForm({ litragem: '', valor: '', placa: '', dataHora: '' })
      setImagem(null)
      setImagemUrl('')
      setExtracao(null)
    } catch (erro) {
      adicionarToast('Erro ao salvar. Tente novamente.', 'error')
      console.error(erro)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <div className="cadastro-container">
      <h2>Registrar Abastecimento</h2>

      <section className="upload-section">
        <h3>1. Upload da Imagem</h3>
        <label htmlFor="imagem" className="upload-label">
          Clique para selecionar imagem ou arraste aqui
        </label>
        <input
          id="imagem"
          type="file"
          accept="image/*"
          onChange={handleUploadImagem}
          disabled={carregando}
          className="upload-input"
        />
        {imagem && <p className="file-info">Arquivo: {imagem.name}</p>}
      </section>

      {extracao && (
        <section className="extracao-section">
          <h3>2. Dados Extraídos (revise e corrija se necessário)</h3>
          <div className="info-box">
            <p><strong>Litragem detectada:</strong> {extracao.litragem || 'Não detectada'}</p>
            <p><strong>Valor detectado:</strong> {extracao.valor || 'Não detectado'}</p>
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit} className="form-abastecimento">
        <h3>3. Confirme os Dados</h3>

        <div className="form-grid">
          <div className="form-group">
            <label htmlFor="placa">Placa do Caminhão *</label>
            <PlacaAutocomplete
              id="placa"
              name="placa"
              value={form.placa}
              onChange={(valor) => setForm(prev => ({ ...prev, placa: valor }))}
              placeholder="Ex: ABC-1234"
              required
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="litragem">Litragem (L) *</label>
            <input
              id="litragem"
              type="number"
              step="0.01"
              name="litragem"
              value={form.litragem || ''}
              onChange={handleFormChange}
              placeholder="Ex: 150.5"
              required
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="valor">Valor (R$) *</label>
            <input
              id="valor"
              type="number"
              step="0.01"
              name="valor"
              value={form.valor || ''}
              onChange={handleFormChange}
              placeholder="Ex: 850.00"
              required
              disabled={carregando}
            />
          </div>

          <div className="form-group">
            <label htmlFor="dataHora">Horário *</label>
            <input
              id="dataHora"
              type="datetime-local"
              name="dataHora"
              value={form.dataHora}
              onChange={handleFormChange}
              required
              disabled={carregando}
            />
          </div>
        </div>

        <button type="submit" disabled={carregando} className="submit-button">
          {carregando ? 'Processando...' : 'Registrar Abastecimento'}
        </button>
      </form>
    </div>
  )
}

export default CadastroAbastecimento
