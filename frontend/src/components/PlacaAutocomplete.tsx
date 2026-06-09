import { useState, useEffect, useRef, useCallback } from 'react'
import api from '../services/api'
import type { Caminhao } from '../types'
import './PlacaAutocomplete.css'

interface PlacaAutocompleteProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
  id?: string
  name?: string
  required?: boolean
}

function PlacaAutocomplete({
  value,
  onChange,
  disabled = false,
  placeholder = 'Digite a placa...',
  id,
  name,
  required = false,
}: PlacaAutocompleteProps) {
  const [sugestoes, setSugestoes] = useState<Caminhao[]>([])
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [carregando, setCarregando] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscarSugestoes = useCallback(async (termo: string): Promise<void> => {
    if (!termo || termo.length < 1) {
      setSugestoes([])
      setMostrarSugestoes(false)
      return
    }

    setCarregando(true)
    try {
      const url = `/caminhoes/autocomplete?termo=${encodeURIComponent(termo)}`
      const response = await api.get(url)
      const data = response.data as { caminhoes: Caminhao[] }
      const lista = data.caminhoes || []
      setSugestoes(lista)
      setMostrarSugestoes(lista.length > 0)
    } catch {
      setSugestoes([])
    } finally {
      setCarregando(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.toUpperCase()
    onChange(valor)

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      buscarSugestoes(valor)
    }, 300)
  }

  const handleSelectPlaca = (caminhao: Caminhao) => {
    onChange(caminhao.placa)
    setMostrarSugestoes(false)
    setSugestoes([])
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setMostrarSugestoes(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setMostrarSugestoes(false)
    }
  }

  return (
    <div className="placa-autocomplete" ref={wrapperRef}>
      <input
        id={id}
        name={name}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (sugestoes.length > 0) setMostrarSugestoes(true)
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="off"
      />
      {carregando && <span className="placa-loading" />}
      {mostrarSugestoes && sugestoes.length > 0 && (
        <ul className="placa-sugestoes">
          {sugestoes.map(c => (
            <li
              key={c.id}
              className="placa-sugestao-item"
              onClick={() => handleSelectPlaca(c)}
            >
              <span className="placa-sugestao-placa">{c.placa}</span>
              <span className="placa-sugestao-detalhe">
                {c.modelo} ({c.ano}) — {c.codigo}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default PlacaAutocomplete
