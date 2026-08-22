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
  FiCalendar, FiX, FiChevronDown, FiSearch,
  FiTrendingUp, FiRefreshCw, FiDatabase, FiSliders,
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
  onLimparTodos: () => void;
  onRefresh?: () => void;

  /** Oculta pills de período (ex.: dashboard executivo usa ciclo do contrato) */
  omitirSeletorPeriodo?: boolean;
}

function formatarDataCurta(iso: string): string {
  if (!iso) return '';
  const partes = iso.split('-');
  if (partes.length !== 3) return iso;
  return `${partes[2]}/${partes[1]}`;
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
  onLimparTodos,
  onRefresh,
  omitirSeletorPeriodo = false,
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

  const periodoIntervalo = useMemo(() => {
    if (periodo.dataInicio === periodo.dataFim) {
      return formatarDataCurta(periodo.dataInicio);
    }
    return `${formatarDataCurta(periodo.dataInicio)} – ${formatarDataCurta(periodo.dataFim)}`;
  }, [periodo.dataInicio, periodo.dataFim]);

  const placeholderFiltro = useMemo(() => {
    const nomes = dimensoesDisponiveis.slice(0, 3).map(d => d.label.toLowerCase());
    if (nomes.length === 0) return 'Buscar dimensão para filtrar...';
    return `Filtrar por ${nomes.join(', ')}...`;
  }, [dimensoesDisponiveis]);

  const dimensoesRapidas = useMemo(
    () => dimensoesDisponiveis.slice(0, 4),
    [dimensoesDisponiveis],
  );

  const temFiltrosOuComparacao = totalFiltrosAtivos > 0 || comparacao.ativo;

  return (
    <div className="gfb-container">
      {/* ═══ Cabeçalho: Período + resumo de registros ═══ */}
      <div className="gfb-header-row">
        <div className="gfb-header-left">
          <span className="gfb-section-label">
            <FiCalendar size={12} />
            Período
          </span>
          <span className="gfb-periodo-resumo" title={periodo.label}>
            {periodoIntervalo}
            <span className="gfb-periodo-resumo-label">· {periodo.label}</span>
          </span>
        </div>
        <div className="gfb-header-right">
          <div
            className={`gfb-stat-badge ${totalFiltrosAtivos > 0 && totalFiltrado < totalRegistros ? 'filtrado' : ''}`}
            title={totalFiltrosAtivos > 0 ? `${totalFiltrado} de ${totalRegistros} registros` : `${totalRegistros} registros no período`}
          >
            <FiDatabase size={12} />
            <strong>{(totalFiltrosAtivos > 0 ? totalFiltrado : totalRegistros).toLocaleString('pt-BR')}</strong>
            <span>{totalFiltrosAtivos > 0 && totalFiltrado < totalRegistros ? 'filtrados' : 'registros'}</span>
          </div>
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

      {/* ═══ Pills de período (scroll horizontal) ═══ */}
      {!omitirSeletorPeriodo && (
      <div className="gfb-top-row">
        <div className="gfb-periodo-scroll">
          <div className="gfb-periodo-group">
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
            <button
              className={`gfb-compare-btn ${comparacao.ativo ? 'active' : ''}`}
              onClick={onToggleComparacao}
              title="Comparar com período anterior"
            >
              <FiTrendingUp size={13} />
              <span>Comparar</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {!omitirSeletorPeriodo && datePickerAberto && (
        <div className="gfb-datepicker">
          <div className="gfb-datepicker-presets">
            <button className="gfb-dp-preset" onClick={() => { onSetPeriodo('hoje'); setDatePickerAberto(false); }}>Hoje</button>
            <button className="gfb-dp-preset" onClick={() => { onSetPeriodo('7d'); setDatePickerAberto(false); }}>7 Dias</button>
            <button className="gfb-dp-preset" onClick={() => { onSetPeriodo('30d'); setDatePickerAberto(false); }}>30 Dias</button>
            <button className="gfb-dp-preset" onClick={() => {
              const hoje = new Date();
              const fim = hoje.toISOString().split('T')[0];
              const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
              onSetPeriodo('personalizado', inicio, fim);
              setDatePickerAberto(false);
            }}>Este Mês</button>
          </div>
          <div className="gfb-datepicker-fields">
            <div className="gfb-date-field">
              <label>De</label>
              <div className="gfb-date-input-group">
                <input
                  type="date"
                  value={periodo.dataInicio}
                  className="gfb-date-input"
                  onChange={e => onSetPeriodo('personalizado', e.target.value, periodo.dataFim)}
                />
                <span className="gfb-date-icon">📅</span>
              </div>
            </div>
            <div className="gfb-datepicker-sep">até</div>
            <div className="gfb-date-field">
              <label>Até</label>
              <div className="gfb-date-input-group">
                <input
                  type="date"
                  value={periodo.dataFim}
                  className="gfb-date-input"
                  onChange={e => {
                    onSetPeriodo('personalizado', periodo.dataInicio, e.target.value);
                    if (periodo.dataInicio && e.target.value) {
                      setTimeout(() => setDatePickerAberto(false), 1200);
                    }
                  }}
                />
                <span className="gfb-date-icon">📅</span>
              </div>
            </div>
            <button className="gfb-date-apply" onClick={() => setDatePickerAberto(false)}>✔</button>
          </div>
        </div>
      )}

      {/* ═══ Dimensões: busca inline + atalhos ═══ */}
      <div className="gfb-filter-section">
        <span className="gfb-section-label gfb-section-label-dim">
          <FiSliders size={12} />
          Dimensões
        </span>
        <div className="gfb-filter-row">
          <div className="gfb-search-wrapper" ref={dropdownRef}>
            <div
              className={`gfb-filter-input-wrap ${dropdownAberto ? 'open' : ''}`}
              onClick={() => {
                setDropdownAberto(true);
                setTimeout(() => searchInputRef.current?.focus(), 30);
              }}
            >
              <FiSearch size={14} className="gfb-filter-input-icon" />
              <input
                ref={searchInputRef}
                type="text"
                className="gfb-filter-input"
                value={dropdownAberto ? buscaTexto : ''}
                readOnly={!dropdownAberto}
                onChange={e => setBuscaTexto(e.target.value)}
                onFocus={() => setDropdownAberto(true)}
                placeholder={
                  dimensaoSelecionada
                    ? `Buscar em ${dimensoes.find(d => d.nome === dimensaoSelecionada)?.label || dimensaoSelecionada}...`
                    : placeholderFiltro
                }
              />
              {totalFiltrosAtivos > 0 && (
                <span className="gfb-filter-count">{totalFiltrosAtivos}</span>
              )}
              <FiChevronDown size={12} className={`gfb-chevron ${dropdownAberto ? 'open' : ''}`} />
            </div>

          {/* ─── Dropdown de busca ─── */}
          {dropdownAberto && (
            <div className="gfb-dropdown">
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

          {dimensoesRapidas.length > 0 && (
            <div className="gfb-quick-dims">
              {dimensoesRapidas.map(dim => {
                const ativos = dim.selecionados.length;
                return (
                  <button
                    key={dim.nome}
                    type="button"
                    className={`gfb-quick-dim ${ativos > 0 ? 'ativo' : ''}`}
                    onClick={() => abrirDropdown(dim.nome)}
                    title={`Filtrar por ${dim.label}`}
                  >
                    {dim.label}
                    {ativos > 0 && <span className="gfb-quick-dim-badge">{ativos}</span>}
                  </button>
                );
              })}
              {dimensoesDisponiveis.length > 4 && (
                <button
                  type="button"
                  className="gfb-quick-dim gfb-quick-dim-more"
                  onClick={() => abrirDropdown()}
                >
                  + Mais
                </button>
              )}
            </div>
          )}
        </div>

        {/* Tags de filtros ativos */}
        {filtrosAtivos.length > 0 && (
          <div className="gfb-tags-row">
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
                        type="button"
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
                type="button"
                className="gfb-clear-all"
                onClick={onLimparTodos}
                title="Limpar todos os filtros"
              >
                <FiX size={12} />
                Limpar tudo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Rodapé contextual (só quando há comparação ou filtros) ═══ */}
      {temFiltrosOuComparacao && (
        <div className="gfb-context-bar">
          <div className="gfb-context-left">
            {totalFiltrosAtivos > 0 && totalFiltrado > 0 && totalFiltrado < totalRegistros && (
              <span className="gfb-context-item gfb-context-filtrado">
                Exibindo <strong>{totalFiltrado.toLocaleString('pt-BR')}</strong> de{' '}
                <strong>{totalRegistros.toLocaleString('pt-BR')}</strong>
                <span className="gfb-context-pct">({pctFiltrado}%)</span>
              </span>
            )}

            {comparacao.ativo && variacaoFormatada && (
              <>
                {totalFiltrosAtivos > 0 && <span className="gfb-context-sep">·</span>}
                <span className={`gfb-context-item gfb-variacao ${variacaoFormatada.classe}`}>
                  {variacaoFormatada.icone} {variacaoFormatada.texto}
                  <span className="gfb-context-vs">vs período anterior</span>
                </span>
              </>
            )}
          </div>

          {comparacao.ativo && (
            <div className="gfb-context-right">
              <span className="gfb-context-compare-badge">
                Comparando: {comparacao.label}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
