/* ═══════════════════════════════════════════════
   GoogleFilterBar — Barra de Filtros estilo Google Analytics
   
   ═══ CARACTERÍSTICAS ═══
   - Pill group de período (Hoje, Ontem, 7d, 30d, 90d, Personalizado)
   - Botão de comparação com período anterior
   - Barra de busca universal de dimensões com dropdown
   - Tags/pills de filtros ativos com remoção individual
   - Barra de contexto (total registros, filtrados, variação)
   - Design limpo, branco, arejado
   - Responsivo: empilha em mobile
   ═══════════════════════════════════════════════ */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  FiCalendar, FiFilter, FiX, FiChevronDown, FiSearch,
  FiClock, FiTrendingUp, FiRefreshCw, FiPlus,
} from 'react-icons/fi';
import type {
  PeriodoPreset, PeriodoState, ComparacaoState,
  DimensaoFiltro,
} from '../hooks/useGoogleFilters';
import '../styles/GoogleFilterBar.css';

/* ─── Props ─── */

interface GoogleFilterBarProps {
  /** Estado de período */
  periodo: PeriodoState;
  /** Estado de comparação */
  comparacao: ComparacaoState;
  /** Dimensões disponíveis para filtro */
  dimensoes: DimensaoFiltro[];
  /** Métricas de contexto */
  totalRegistros: number;
  totalFiltrado: number;
  variacaoPeriodo: number | null;
  /** Loading state */
  carregando?: boolean;

  /** Actions */
  onSetPeriodo: (preset: PeriodoPreset, dataInicio?: string, dataFim?: string) => void;
  onToggleComparacao: () => void;
  onAdicionarFiltro: (dimensaoNome: string, valor: string) => void;
  onRemoverFiltro: (dimensaoNome: string, valor: string) => void;
  onLimparDimensao: (dimensaoNome: string) => void;
  onLimparTodos: () => void;
  onRefresh?: () => void;

  /** Opcional: label personalizada */
  label?: string;
}

/* ══════════════════════════════════════
   Componente Principal
   ══════════════════════════════════════ */

export default function GoogleFilterBar({
  periodo,
  comparacao,
  dimensoes,
  totalRegistros,
  totalFiltrado,
  variacaoPeriodo,
  carregando = false,
  onSetPeriodo,
  onToggleComparacao,
  onAdicionarFiltro,
  onRemoverFiltro,
  onLimparDimensao,
  onLimparTodos,
  onRefresh,
  label = 'Filtros',
}: GoogleFilterBarProps) {
  /* ═══ Estado local do dropdown de busca ═══ */
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState('');
  const [dimensaoSelecionada, setDimensaoSelecionada] = useState<string | null>(null);
  const [datePickerAberto, setDatePickerAberto] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
        setBuscaTexto('');
        setDimensaoSelecionada(null);
      }
    }
    if (dropdownAberto) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [dropdownAberto]);

  // Focar input ao abrir dropdown
  useEffect(() => {
    if (dropdownAberto && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [dropdownAberto]);

  /* ═══ Filtros ativos (com valores) ═══ */
  const filtrosAtivos = useMemo(
    () => dimensoes.filter(d => d.selecionados.length > 0),
    [dimensoes]
  );
  const totalFiltrosAtivos = filtrosAtivos.reduce((s, d) => s + d.selecionados.length, 0);

  /* ═══ Dimensões disponíveis para adicionar ═══ */
  const dimensoesDisponiveis = useMemo(
    () => dimensoes.filter(d => d.totalOpcoes > 0),
    [dimensoes]
  );

  /* ═══ Filtro de busca nas dimensões ═══ */
  const dimensoesBuscadas = useMemo(() => {
    if (!buscaTexto.trim()) return dimensoesDisponiveis;
    const termo = buscaTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return dimensoesDisponiveis.filter(d =>
      d.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo) ||
      d.nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo)
    );
  }, [dimensoesDisponiveis, buscaTexto]);

  /* ═══ Opções filtradas da dimensão selecionada ═══ */
  const opcoesFiltradas = useMemo(() => {
    const dim = dimensoes.find(d => d.nome === dimensaoSelecionada);
    if (!dim) return [];
    if (!buscaTexto.trim()) return dim.opcoes.slice(0, 50);
    const termo = buscaTexto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return dim.opcoes.filter(op =>
      op.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo)
    ).slice(0, 50);
  }, [dimensoes, dimensaoSelecionada, buscaTexto]);

  /* ═══ Presets de período ═══ */
  const periodos: { preset: PeriodoPreset; label: string }[] = [
    { preset: 'hoje', label: 'Hoje' },
    { preset: 'ontem', label: 'Ontem' },
    { preset: '7d', label: '7 Dias' },
    { preset: '30d', label: '30 Dias' },
    { preset: '90d', label: '90 Dias' },
    { preset: 'personalizado', label: 'Personalizado' },
  ];

  /* ═══ Abrir dropdown e selecionar dimensão ═══ */
  const abrirDropdown = useCallback((dimNome?: string) => {
    setDropdownAberto(true);
    setDimensaoSelecionada(dimNome || null);
    setBuscaTexto('');
  }, []);

  /* ═══ Adicionar filtro da dimensão selecionada ═══ */
  const handleAdicionarFiltro = useCallback((valor: string) => {
    if (dimensaoSelecionada) {
      onAdicionarFiltro(dimensaoSelecionada, valor);
    }
  }, [dimensaoSelecionada, onAdicionarFiltro]);

  /* ═══ Selecionar dimensão no dropdown ═══ */
  const handleSelecionarDimensao = useCallback((nome: string) => {
    setDimensaoSelecionada(nome);
    setBuscaTexto('');
  }, []);

  /* ═══ Variação formatada ═══ */
  const variacaoFormatada = useMemo(() => {
    if (variacaoPeriodo === null) return null;
    const isUp = variacaoPeriodo >= 0;
    return {
      texto: `${isUp ? '+' : ''}${variacaoPeriodo.toFixed(1)}%`,
      classe: isUp ? 'positivo' : 'negativo',
      icone: isUp ? '📈' : '📉',
    };
  }, [variacaoPeriodo]);

  /* ═══ Contagem de registros filtrados ═══ */
  const pctFiltrado = totalRegistros > 0
    ? Math.round((totalFiltrado / totalRegistros) * 100)
    : 100;

  return (
    <div className="gfb-container">
      {/* ═══ LINHA 1: Período + Ações ═══ */}
      <div className="gfb-top-row">
        {/* Pill group de período */}
        <div className="gfb-periodo-group">
          <FiCalendar size={14} className="gfb-periodo-icon" />
          {periodos.map(p => {
            const ativo = periodo.preset === p.preset;
            return (
              <button
                key={p.preset}
                className={`gfb-periodo-pill ${ativo ? 'active' : ''}`}
                onClick={() => {
                  if (p.preset === 'personalizado') {
                    setDatePickerAberto(!datePickerAberto);
                  } else {
                    onSetPeriodo(p.preset);
                    setDatePickerAberto(false);
                  }
                }}
              >
                {p.label}
              </button>
            );
          })}

          {/* Comparação */}
          <button
            className={`gfb-compare-btn ${comparacao.ativo ? 'active' : ''}`}
            onClick={onToggleComparacao}
            title="Comparar com período anterior"
          >
            <FiTrendingUp size={13} />
            <span>Comparar</span>
          </button>
        </div>

        {/* Ações direita */}
        <div className="gfb-actions">
          {onRefresh && (
            <button
              className="gfb-refresh-btn"
              onClick={onRefresh}
              title="Atualizar dados"
              disabled={carregando}
            >
              <FiRefreshCw size={13} className={carregando ? 'spinning' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Date Picker Expandido (personalizado) ═══ */}
      {datePickerAberto && (
        <div className="gfb-datepicker">
          <div className="gfb-date-field">
            <label>Data Início</label>
            <input
              type="date"
              value={periodo.dataInicio}
              onChange={e => {
                onSetPeriodo('personalizado', e.target.value, periodo.dataFim);
              }}
            />
          </div>
          <div className="gfb-date-field">
            <label>Data Fim</label>
            <input
              type="date"
              value={periodo.dataFim}
              onChange={e => {
                onSetPeriodo('personalizado', periodo.dataInicio, e.target.value);
              }}
            />
          </div>
          <button
            className="gfb-date-apply"
            onClick={() => setDatePickerAberto(false)}
          >
            Aplicar
          </button>
        </div>
      )}

      {/* ═══ LINHA 2: Busca Universal + Tags ═══ */}
      <div className="gfb-filter-row">
        {/* Botão/Busca de dimensões */}
        <div className="gfb-search-wrapper" ref={dropdownRef}>
          <button
            className="gfb-search-btn"
            onClick={() => setDropdownAberto(!dropdownAberto)}
          >
            <FiFilter size={14} />
            <span>Filtrar por...</span>
            <FiChevronDown size={12} className={`gfb-chevron ${dropdownAberto ? 'open' : ''}`} />
            {totalFiltrosAtivos > 0 && (
              <span className="gfb-filter-count">{totalFiltrosAtivos}</span>
            )}
          </button>

          {/* ─── Dropdown de busca ─── */}
          {dropdownAberto && (
            <div className="gfb-dropdown">
              {/* Input de busca */}
              <div className="gfb-dropdown-search">
                <FiSearch size={14} className="gfb-search-icon" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={buscaTexto}
                  onChange={e => setBuscaTexto(e.target.value)}
                  placeholder={dimensaoSelecionada
                    ? `Buscar em ${dimensoes.find(d => d.nome === dimensaoSelecionada)?.label || dimensaoSelecionada}...`
                    : 'Buscar dimensão para filtrar...'}
                />
                {buscaTexto && (
                  <button className="gfb-clear-search" onClick={() => setBuscaTexto('')}>
                    <FiX size={14} />
                  </button>
                )}
              </div>

              {/* Se não tem dimensão selecionada: lista de dimensões */}
              {!dimensaoSelecionada ? (
                <div className="gfb-dropdown-body">
                  {/* Sugestões rápidas */}
                  {!buscaTexto.trim() && dimensoesBuscadas.length > 0 && (
                    <div className="gfb-sugestoes">
                      <div className="gfb-dropdown-label">📌 Sugeridos</div>
                      <div className="gfb-sugestoes-grid">
                        {dimensoesBuscadas.slice(0, 6).map(dim => (
                          <button
                            key={dim.nome}
                            className="gfb-sugestao-btn"
                            onClick={() => handleSelecionarDimensao(dim.nome)}
                          >
                            <span className="gfb-sugestao-label">{dim.label}</span>
                            <span className="gfb-sugestao-count">{dim.totalOpcoes}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lista de dimensões */}
                  <div className="gfb-dimensoes-list">
                    {dimensoesBuscadas.length === 0 ? (
                      <div className="gfb-dropdown-empty">
                        {buscaTexto
                          ? `Nenhuma dimensão encontrada para "${buscaTexto}"`
                          : 'Nenhuma dimensão disponível'}
                      </div>
                    ) : (
                      dimensoesBuscadas.map(dim => {
                        const ativa = dim.selecionados.length > 0;
                        return (
                          <button
                            key={dim.nome}
                            className={`gfb-dimensao-item ${ativa ? 'ativo' : ''}`}
                            onClick={() => handleSelecionarDimensao(dim.nome)}
                          >
                            <div className="gfb-dimensao-info">
                              <span className="gfb-dimensao-label">{dim.label}</span>
                              <span className="gfb-dimensao-count">{dim.totalOpcoes} valores</span>
                            </div>
                            {ativa && (
                              <span className="gfb-dimensao-badge">
                                {dim.selecionados.length} ativos
                              </span>
                            )}
                            <FiChevronDown size={12} className="gfb-dimensao-arrow" />
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* ─── Valores da dimensão selecionada ─── */
                <div className="gfb-dropdown-body">
                  {/* Header de volta */}
                  <div className="gfb-dim-header">
                    <button
                      className="gfb-dim-back"
                      onClick={() => {
                        setDimensaoSelecionada(null);
                        setBuscaTexto('');
                      }}
                    >
                      ← Voltar
                    </button>
                    <span className="gfb-dim-title">
                      {dimensoes.find(d => d.nome === dimensaoSelecionada)?.label || dimensaoSelecionada}
                    </span>
                    <span className="gfb-dim-total">
                      {dimensoes.find(d => d.nome === dimensaoSelecionada)?.totalOpcoes || 0} valores
                    </span>
                  </div>

                  {/* Lista de opções */}
                  <div className="gfb-opcoes-list">
                    {opcoesFiltradas.length === 0 ? (
                      <div className="gfb-dropdown-empty">
                        {buscaTexto
                          ? `Nenhum valor encontrado para "${buscaTexto}"`
                          : 'Nenhum valor disponível'}
                      </div>
                    ) : (
                      opcoesFiltradas.map(op => {
                        const dim = dimensoes.find(d => d.nome === dimensaoSelecionada);
                        const selecionado = dim?.selecionados.includes(op) ?? false;
                        return (
                          <label
                            key={op}
                            className={`gfb-opcao-item ${selecionado ? 'selecionado' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selecionado}
                              onChange={() => {
                                if (selecionado) {
                                  onRemoverFiltro(dimensaoSelecionada, op);
                                } else {
                                  onAdicionarFiltro(dimensaoSelecionada, op);
                                }
                              }}
                            />
                            <span className="gfb-opcao-text">{op}</span>
                            {selecionado && (
                              <span className="gfb-opcao-check">✓</span>
                            )}
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tags de filtros ativos */}
        {filtrosAtivos.length > 0 && (
          <div className="gfb-tags-wrapper">
            <div className="gfb-tags">
              {filtrosAtivos.map(dim => (
                dim.selecionados.map(valor => (
                  <span
                    key={`${dim.nome}-${valor}`}
                    className="gfb-tag"
                  >
                    <span className="gfb-tag-dim">{dim.label}:</span>
                    <span className="gfb-tag-valor">{valor}</span>
                    <button
                      className="gfb-tag-remove"
                      onClick={() => onRemoverFiltro(dim.nome, valor)}
                      title={`Remover filtro ${dim.label}: ${valor}`}
                    >
                      <FiX size={12} />
                    </button>
                  </span>
                ))
              ))}
            </div>
            <button
              className="gfb-clear-all"
              onClick={onLimparTodos}
              title="Limpar todos os filtros"
            >
              <FiX size={12} />
              Limpar
            </button>
          </div>
        )}
      </div>

      {/* ═══ LINHA 3: Barra de Contexto ═══ */}
      <div className="gfb-context-bar">
        <div className="gfb-context-left">
          <span className="gfb-context-item">
            <strong>{totalRegistros.toLocaleString('pt-BR')}</strong> registros
          </span>

          {totalFiltrosAtivos > 0 && totalFiltrado > 0 && (
            <>
              <span className="gfb-context-sep">·</span>
              <span className="gfb-context-item gfb-context-filtrado">
                <strong>{totalFiltrado.toLocaleString('pt-BR')}</strong> filtrados
                <span className="gfb-context-pct">({pctFiltrado}%)</span>
              </span>
            </>
          )}

          {comparacao.ativo && variacaoFormatada && (
            <>
              <span className="gfb-context-sep">·</span>
              <span className={`gfb-context-item gfb-variacao ${variacaoFormatada.classe}`}>
                {variacaoFormatada.icone} {variacaoFormatada.texto}
                <span className="gfb-context-vs">vs período anterior</span>
              </span>
            </>
          )}
        </div>

        <div className="gfb-context-right">
          {comparacao.ativo && (
            <span className="gfb-context-compare-badge">
              🔄 Comparando: {comparacao.label}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
