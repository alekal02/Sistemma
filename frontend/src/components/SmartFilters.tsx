/* ============================================
   SmartFilters v2 — Seletor Prático de Filtros
   
   Fluxo:
   1. Select principal → escolhe a coluna
   2. Segundo campo → escolhe o valor (select ou busca)
   3. Filtros ativos aparecem como tags removíveis
   
   ⚡ Muito mais prático que N selects simultâneos!
   ============================================ */

import { useState, useMemo, useRef, useEffect } from 'react';
import { FiX, FiFilter, FiChevronDown, FiSearch, FiPlus } from 'react-icons/fi';
import type { FiltroColuna } from '../hooks/useSmartFilters';

interface SmartFiltersProps {
  /** Colunas disponíveis para filtro */
  colunas: FiltroColuna[];
  /** Valores atuais dos filtros: { nomeColuna: valorSelecionado } */
  valores: Record<string, string>;
  /** Callback quando os filtros mudam */
  onChange: (valores: Record<string, string>) => void;
  /** Label do componente */
  label?: string;
  /** Placeholder para o select de coluna */
  placeholder?: string;
}

export default function SmartFilters({
  colunas,
  valores,
  onChange,
  label = 'Filtros',
  placeholder = 'Selecionar filtro...',
}: SmartFiltersProps) {
  const [colunaSelecionada, setColunaSelecionada] = useState('');
  const [valorBusca, setValorBusca] = useState('');

  const entries = useMemo(() => Object.entries(valores).filter(([, v]) => !!v), [valores]);
  const totalAtivos = entries.length;

  // Coluna atualmente selecionada no campo "adicionar filtro"
  const colunaAtual = useMemo(
    () => colunas.find(c => c.nome === colunaSelecionada),
    [colunas, colunaSelecionada]
  );

  // Opções disponíveis filtradas pela busca
  const opcoesFiltradas = useMemo(() => {
    if (!colunaAtual) return [];
    if (!valorBusca.trim()) return colunaAtual.opcoes;
    const termo = valorBusca.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return colunaAtual.opcoes.filter(op =>
      op.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo)
    );
  }, [colunaAtual, valorBusca]);

  // Colunas que ainda não estão sendo usadas como filtro
  const colunasDisponiveis = useMemo(
    () => colunas.filter(c => !valores[c.nome]),
    [colunas, valores]
  );

  function adicionarFiltro(nomeColuna: string, valor: string) {
    if (!nomeColuna || !valor) return;
    const novos = { ...valores, [nomeColuna]: valor };
    onChange(novos);
    setColunaSelecionada('');
    setValorBusca('');
  }

  function removerFiltro(nomeColuna: string) {
    const novos = { ...valores };
    delete novos[nomeColuna];
    onChange(novos);
  }

  function limparTudo() {
    onChange({});
    setColunaSelecionada('');
    setValorBusca('');
  }

  if (colunas.length === 0) return null;

  // Multi-select temporário para quando a coluna está sendo escolhida
  const MultiSelectCheckboxes = ({ opcoes, selecionados, onChange, label }: {
    opcoes: string[];
    selecionados: string[];
    onChange: (vals: string[]) => void;
    label: string;
  }) => {
    const valAtual = selecionados || [];
    return (
      <div>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '0.2rem',
          padding: '0.2rem', background: '#fff',
          border: '1px solid #d1d5db', borderRadius: '5px',
          minHeight: '28px',
        }}>
          {opcoes.map(op => {
            const ativo = valAtual.includes(op);
            return (
              <label key={op} style={{
                display: 'flex', alignItems: 'center', gap: '0.15rem',
                fontSize: '0.68rem', fontWeight: 500,
                padding: '0.1rem 0.3rem',
                background: ativo ? '#eef2ff' : '#f8fafc',
                border: '1px solid ' + (ativo ? '#6366f1' : '#e2e8f0'),
                borderRadius: '4px', cursor: 'pointer',
                color: ativo ? '#4338ca' : '#64748b',
                transition: 'all 0.1s', userSelect: 'none',
              }}>
                <input type="checkbox" checked={ativo}
                  onChange={() => {
                    const novos = ativo
                      ? valAtual.filter(v => v !== op)
                      : [...valAtual, op];
                    onChange(novos);
                  }}
                  style={{ width: '11px', height: '11px', margin: 0, accentColor: '#6366f1' }}
                />
                {op}
              </label>
            );
          })}
          {opcoes.length === 0 && (
            <span style={{ fontSize: '0.65rem', color: '#94a3b8', padding: '0.1rem' }}>Nenhuma opcao</span>
          )}
        </div>
        {valAtual.length > 0 && (
          <div style={{ display: 'flex', gap: '0.2rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {valAtual.map(v => (
              <span key={v} style={{
                fontSize: '0.6rem', padding: '0.05rem 0.3rem',
                background: '#eef2ff', color: '#4338ca',
                borderRadius: '3px', fontWeight: 600,
                border: '1px solid #c7d2fe',
              }}>
                {v}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };

  const colunaTemMuitasOpcoes = colunaAtual && colunaAtual.totalOpcoes > 15;

  return (
    <div style={{
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '0.6rem 0.75rem 0.75rem' }}>
        {/* ─── Linha superior: label + estatísticas ─── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.5rem',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.65rem',
            fontWeight: 700,
            color: '#64748b',
            textTransform: 'uppercase',
            letterSpacing: '0.3px',
          }}>
            <FiFilter size={11} />
            {label}
            {totalAtivos > 0 && (
              <span style={{
                background: '#22c55e',
                color: 'white',
                fontSize: '0.55rem',
                fontWeight: 700,
                borderRadius: '50%',
                width: '15px',
                height: '15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {totalAtivos}
              </span>
            )}
          </div>

          {/* Badge de colunas disponíveis */}
          <span style={{
            fontSize: '0.6rem',
            color: '#94a3b8',
            fontWeight: 500,
          }}>
            {colunasDisponiveis.length}/{colunas.length} colunas
          </span>
        </div>

        {/* ─── Tags de filtros ativos ─── */}
        {entries.length > 0 && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.3rem',
            marginBottom: '0.5rem',
          }}>
            {entries.map(([coluna, valor]) => {
              const valoresSplit = valor.split(',').filter(Boolean);
              return (
                <span
                  key={coluna}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                    padding: '0.15rem 0.4rem',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '5px',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    color: '#166534',
                  }}
                >
                  <span style={{ opacity: 0.6, fontWeight: 400 }}>
                    {colunas.find(c => c.nome === coluna)?.label || coluna}:
                  </span>
                  {' '}
                  {valoresSplit.map(v => (
                    <span key={v} style={{
                      background: '#dcfce7', padding: '0 0.25rem',
                      borderRadius: '3px', fontSize: '0.63rem',
                    }}>
                      {v}
                    </span>
                  ))}
                  <button
                    onClick={() => removerFiltro(coluna)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#166534',
                      padding: '0',
                      display: 'flex',
                      opacity: 0.5,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
                    title={`Remover filtro ${coluna}`}
                  >
                    <FiX size={11} />
                  </button>
                </span>
              );
            })}

            {/* Botão limpar tudo */}
            <button
              onClick={limparTudo}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.15rem',
                padding: '0.15rem 0.4rem',
                borderRadius: '5px',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#ef4444',
                fontSize: '0.65rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Limpar todos os filtros"
            >
              <FiX size={10} />
              Limpar
            </button>
          </div>
        )}

        {/* ─── Seletor de novo filtro ─── */}
        {colunasDisponiveis.length > 0 && (
          <div style={{
            display: 'flex',
            gap: '0.35rem',
            alignItems: 'flex-end',
          }}>
            {/* Select: escolher a coluna */}
            <div style={{ flex: 1, minWidth: '140px', maxWidth: '200px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.55rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                letterSpacing: '0.2px',
                marginBottom: '0.1rem',
              }}>
                Coluna
              </label>
              <select
                value={colunaSelecionada}
                onChange={e => {
                  setColunaSelecionada(e.target.value);
                  setValorBusca('');
                }}
                style={{
                  width: '100%',
                  padding: '0.3rem 0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '5px',
                  fontSize: '0.72rem',
                  background: 'white',
                  color: '#1e293b',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="">{placeholder}</option>
                {colunasDisponiveis.map(col => (
                  <option key={col.nome} value={col.nome}>
                    {col.label} ({col.totalOpcoes})
                  </option>
                ))}
              </select>
            </div>

            {/* Segundo campo: escolher o valor */}
            {colunaSelecionada && colunaAtual && (
              <div style={{ flex: 1, minWidth: '140px', maxWidth: '220px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.2px',
                  marginBottom: '0.1rem',
                }}>
                  {colunaAtual.label}
                </label>

                {colunaTemMuitasOpcoes ? (
                  /* ── Input com busca + datalist ── */
                  <div style={{ position: 'relative' }}>
                    <input
                      value={valorBusca}
                      onChange={e => setValorBusca(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && opcoesFiltradas.length === 1) {
                          adicionarFiltro(colunaSelecionada, opcoesFiltradas[0]);
                        }
                      }}
                      placeholder="Digite para buscar..."
                      autoFocus
                      list={`smartfilter-list-${colunaSelecionada}`}
                      style={{
                        width: '100%',
                        padding: '0.3rem 0.5rem',
                        border: valorBusca ? '1.5px solid #22c55e' : '1px solid #d1d5db',
                        borderRadius: '5px',
                        fontSize: '0.72rem',
                        background: valorBusca ? '#f0fdf4' : 'white',
                        color: '#1e293b',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <datalist id={`smartfilter-list-${colunaSelecionada}`}>
                      {opcoesFiltradas.map(op => (
                        <option key={op} value={op} />
                      ))}
                    </datalist>
                    
                    {/* Sugestões inline se tiver busca */}
                    {valorBusca.trim() && opcoesFiltradas.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0 0 5px 5px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10,
                        maxHeight: '160px',
                        overflow: 'auto',
                      }}>
                        {/* Cabeçalho da busca */}
                        <div style={{
                          fontSize: '0.58rem', fontWeight: 600, color: '#94a3b8',
                          padding: '0.2rem 0.5rem', background: '#f8fafc',
                          borderBottom: '1px solid #f1f5f9',
                          display: 'flex', justifyContent: 'space-between',
                        }}>
                          <span>{opcoesFiltradas.length} resultado{opcoesFiltradas.length !== 1 ? 's' : ''} encontrado{opcoesFiltradas.length !== 1 ? 's' : ''}</span>
                          <span style={{ color: '#cbd5e1' }}>Clique para selecionar</span>
                        </div>
                        {opcoesFiltradas.slice(0, 40).map(op => (
                          <button
                            key={op}
                            onClick={() => adicionarFiltro(colunaSelecionada, op)}
                            style={{
                              width: '100%',
                              display: 'block',
                              textAlign: 'left',
                              padding: '0.3rem 0.5rem',
                              border: 'none',
                              background: 'transparent',
                              fontSize: '0.72rem',
                              color: '#1e293b',
                              cursor: 'pointer',
                              transition: 'background 0.1s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                          >
                            {/* Destacar o termo buscado */}
                            {op.toLowerCase().includes(valorBusca.toLowerCase()) ? (
                              <>
                                {op.substring(0, op.toLowerCase().indexOf(valorBusca.toLowerCase()))}
                                <span style={{ background: '#fef9c3', fontWeight: 600, borderRadius: '2px', padding: '0 1px' }}>
                                  {op.substring(op.toLowerCase().indexOf(valorBusca.toLowerCase()), op.toLowerCase().indexOf(valorBusca.toLowerCase()) + valorBusca.length)}
                                </span>
                                {op.substring(op.toLowerCase().indexOf(valorBusca.toLowerCase()) + valorBusca.length)}
                              </>
                            ) : op}
                          </button>
                        ))}
                        {opcoesFiltradas.length > 40 && (
                          <div style={{
                            fontSize: '0.6rem', color: '#94a3b8', textAlign: 'center',
                            padding: '0.2rem', borderTop: '1px solid #f1f5f9',
                          }}>
                            + {opcoesFiltradas.length - 40} resultados... refine sua busca
                          </div>
                        )}
                      </div>
                    )}

                    {/* Nenhum resultado na busca */}
                    {valorBusca.trim() && opcoesFiltradas.length === 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '0 0 5px 5px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        zIndex: 10,
                      }}>
                        <div style={{
                          textAlign: 'center', padding: '0.6rem 0.5rem',
                          fontSize: '0.7rem', color: '#94a3b8',
                        }}>
                          Nenhum resultado para "<strong style={{ color: '#64748b' }}>{valorBusca}</strong>"
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  /* ── Multi-select com checkboxes (poucas opções) ── */
                  <MultiSelectCheckboxes
                    opcoes={colunaAtual.opcoes}
                    selecionados={(valores[colunaSelecionada] || '').split(',').filter(Boolean)}
                    onChange={(novosSelecionados) => {
                      if (novosSelecionados.length > 0) {
                        adicionarFiltro(colunaSelecionada, novosSelecionados.join(','));
                      } else {
                        removerFiltro(colunaSelecionada);
                      }
                    }}
                    label={colunaAtual.label}
                  />
                )}
              </div>
            )}

            {/* Botão "Adicionar" — só para selects com busca (para selects simples já adiciona automático) */}
            {colunaSelecionada && colunaTemMuitasOpcoes && valorBusca.trim() && (
              <button
                onClick={() => {
                  // Se a busca bater exato com uma opção, usa ela
                  const match = opcoesFiltradas.find(o => o.toLowerCase() === valorBusca.toLowerCase());
                  if (match) {
                    adicionarFiltro(colunaSelecionada, match);
                  } else if (opcoesFiltradas.length > 0) {
                    adicionarFiltro(colunaSelecionada, opcoesFiltradas[0]);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.2rem',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '5px',
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#16a34a',
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  marginBottom: '0',
                }}
              >
                <FiPlus size={11} />
                Adicionar
              </button>
            )}
          </div>
        )}

        {/* Mensagem quando todas as colunas já foram usadas */}
        {colunasDisponiveis.length === 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: '0.68rem',
            color: '#94a3b8',
            padding: '0.25rem 0',
          }}>
            Todas as colunas já estão sendo usadas como filtro
          </div>
        )}
      </div>
    </div>
  );
}
