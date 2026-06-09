import { useState, useCallback, useEffect, useRef } from 'react';
import { FiChevronDown, FiAlertCircle } from 'react-icons/fi';

interface ColunaInfo {
  nome: string;
  tipo: 'numero' | 'texto' | 'data' | 'hora' | 'desconhecido';
}

interface FormulaBuilderProps {
  /** Expressão atual (ex: "AVG(PESO_TOTAL) / COUNT(*) * 1000") */
  valor: string;
  /** Quando a expressão muda */
  onChange: (expr: string) => void;
  /** Colunas disponíveis da planilha */
  colunas: ColunaInfo[];
  /** Colunas numéricas (atalho) */
  colunasNumericas: ColunaInfo[];
  /** Valores fixos nomeados */
  valoresFixos?: Record<string, number>;
  /** Quando os valores fixos mudam */
  onValoresFixosChange?: (v: Record<string, number>) => void;
  /** Constantes globais predefinidas (ex: valores de caminhões do contrato) */
  constantesGlobais?: Record<string, { valor: number; label: string }>;
  /** Função de preview (opcional - chamada externamente) */
  onPreview?: () => void;
  /** Resultado do preview */
  previewResultado?: string | null;
  /** Preview carregando */
  previewLoading?: boolean;
  /** Erro no preview */
  previewErro?: string | null;
  /** Desabilitado */
  disabled?: boolean;
}

const FUNCOES_DISPONIVEIS = [
  { nome: 'SUM', descricao: 'Soma dos valores da coluna', parametro: 'coluna' },
  { nome: 'AVG', descricao: 'Média dos valores da coluna', parametro: 'coluna' },
  { nome: 'COUNT', descricao: 'Contagem de registros', parametro: 'coluna ou *' },
  { nome: 'MIN', descricao: 'Menor valor da coluna', parametro: 'coluna' },
  { nome: 'MAX', descricao: 'Maior valor da coluna', parametro: 'coluna' },
  { nome: 'COUNT DISTINCT', descricao: 'Contagem de valores únicos', parametro: 'coluna' },
  { nome: 'MEDIAN', descricao: 'Mediana dos valores', parametro: 'coluna' },
  { nome: 'PERCENTILE', descricao: 'Percentil (0 a 1)', parametro: 'coluna, p' },
  { nome: 'IF', descricao: 'Condicional: IF(cond, sim, nao)', parametro: 'cond, val, val' },
  { nome: 'ROUND', descricao: 'Arredondamento', parametro: 'valor, casas' },
  { nome: 'ABS', descricao: 'Valor absoluto', parametro: 'valor' },
  { nome: 'MULTIPLY', descricao: 'Multiplica col1 * col2 por registro', parametro: 'col1, col2' },
  { nome: 'DIVIDE', descricao: 'Divide col1 / col2 por registro', parametro: 'col1, col2' },
];

const TEMPLATES_FORMULAS = [
  // ═══ Do Resumo Executivo — Métricas Primárias ═══
  { nome: '⭐ Viagens (Total)', formula: 'COUNT(*)', descricao: 'Contagem total de registros/viagens' },
  { nome: '⭐ Coletores (Qtd Única)', formula: 'COUNT DISTINCT({colPlaca})', descricao: 'Quantidade de veículos/coletores únicos' },
  { nome: '⭐ Tonelagem Total', formula: 'ROUND(SUM({colPeso}) / 1000, 1)', descricao: 'Soma de peso convertida para toneladas' },
  { nome: '⭐ KM Rodados (Total)', formula: 'ROUND(SUM({colKm}), 0)', descricao: 'Soma total de KM rodados' },
  { nome: '⭐ Horas Produtivas', formula: 'SUM({colHora})', descricao: 'Soma total de horas trabalhadas' },
  { nome: '⭐ Faturamento Total', formula: 'FATURAMENTO_EST({colPeso}, {colTipo})', descricao: 'Faturamento por tipo de caminhão + valor contrato' },
  { nome: '⭐ Receita por KM', formula: 'DIVIDE(FATURAMENTO_EST({colPeso}, {colTipo}), SUM({colKm}))', descricao: 'Receita dividida pelos KM rodados' },
  // ═══ Do Resumo Executivo — Métricas Secundárias ═══
  { nome: '⚡ Tonelada por KM Rodado', formula: 'ROUND(DIVIDE(SUM({colPeso}) / 1000, SUM({colKm})), 4)', descricao: 'Eficiência: peso por KM rodado' },
  { nome: '⚡ Produtividade por Coletor', formula: 'ROUND(SUM({colPeso}) / 1000 / SUM(Nº DE COLETORES), 2)', descricao: 'Peso total (ton) / soma total de coletores' },
  { nome: '⚡ KM Médio por Viagem', formula: 'ROUND(DIVIDE(SUM({colKm}), COUNT(*)), 1)', descricao: 'Média de KM rodados por registro' },
  { nome: '⚡ Tonelagem Média por Coleta', formula: 'ROUND(DIVIDE(SUM({colPeso}), COUNT(*)) / 1000, 2)', descricao: 'Peso médio em toneladas por viagem' },
  { nome: '⚡ Receita por KM Rodado', formula: 'ROUND(DIVIDE(FATURAMENTO_EST({colPeso}, {colTipo}), SUM({colKm})), 2)', descricao: 'Faturamento por KM com precisão' },
  { nome: '⚡ Receita por Hora Produtiva', formula: 'ROUND(DIVIDE(FATURAMENTO_EST({colPeso}, {colTipo}), SUM({colHoraChega}) - SUM({colHoraSaida})), 2)', descricao: 'Faturamento por hora produtiva (HR CHEGA - HR SAIDA)' },
  // ═══ Modelos Auxiliares ═══
  { nome: 'Média por Registro', formula: 'AVG({coluna})', descricao: 'Média simples dos valores' },
  { nome: 'Produtividade (Peso/Duração)', formula: 'DIVIDE({colPeso}, {colHora})', descricao: 'Toneladas por hora trabalhada' },
  { nome: 'Eficiência (KM/Hora)', formula: 'DIVIDE({colKm}, {colHora})', descricao: 'KM rodados por hora' },
  { nome: 'Faturamento Estimado', formula: 'MULTIPLY({colPeso}, VALOR_TONELADA) / 1000', descricao: 'Peso x valor por tonelada' },
  { nome: 'Performance vs Meta', formula: 'IF(AVG({colPeso}) > 10000, ROUND(AVG({colPeso}) / 1000, 1), 0)', descricao: 'Indicador condicional' },
  { nome: 'Variância de Peso', formula: 'ROUND(AVG({colPeso}) - MIN({colPeso}), 1)', descricao: 'Diferença entre média e mínimo' },
  { nome: 'Mediana de KM', formula: 'MEDIAN({colKm})', descricao: 'Valor central dos KM rodados' },
  { nome: 'Top 25% (Percentil)', formula: 'PERCENTILE({colPeso}, 0.75)', descricao: 'Valor acima de 75% dos registros' },
];

const OPERADORES = [
  { simbolo: '+', descricao: 'Soma' },
  { simbolo: '-', descricao: 'Subtração' },
  { simbolo: '*', descricao: 'Multiplicação' },
  { simbolo: '/', descricao: 'Divisão' },
  { simbolo: '(', descricao: 'Abrir parênteses' },
  { simbolo: ')', descricao: 'Fechar parênteses' },
];

export default function FormulaBuilder(props: FormulaBuilderProps) {
  const {
    valor, onChange, colunas, colunasNumericas,
    valoresFixos = {}, onValoresFixosChange,
    constantesGlobais,
    previewResultado, previewLoading, previewErro,
    disabled = false,
  } = props;

  const [abaAtiva, setAbaAtiva] = useState<'funcoes' | 'colunas' | 'operadores' | 'templates'>('funcoes');
  const [mostrarFixos, setMostrarFixos] = useState(false);
  const [novoFixoNome, setNovoFixoNome] = useState('');
  const [novoFixoValor, setNovoFixoValor] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cursorPosRef = useRef<number>(0);

  // ─── Autocomplete ───
  const [autocomplete, setAutocomplete] = useState<{
    aberto: boolean;
    textoParcial: string;
    startPos: number;
    endPos: number;
    sugestoes: { nome: string; tipo: string; descricao: string }[];
    indiceSelecionado: number;
  }>({ aberto: false, textoParcial: '', startPos: 0, endPos: 0, sugestoes: [], indiceSelecionado: 0 });

  const autocompleteRef = useRef<HTMLDivElement>(null);
  const [autocompletePos, setAutocompletePos] = useState({ top: 0, left: 0 });

  // Construir lista completa de sugestões (colunas + constantes)
  const todasSugestoes = useCallback(() => {
    const sugs: { nome: string; tipo: string; descricao: string }[] = [];
    for (const c of colunasNumericas) {
      sugs.push({ nome: c.nome, tipo: 'num', descricao: `Número — ${c.nome}` });
    }
    for (const c of colunas) {
      if (c.tipo !== 'numero') {
        sugs.push({ nome: c.nome, tipo: c.tipo === 'data' ? 'data' : 'texto', descricao: `${c.tipo === 'data' ? 'Data' : 'Texto'} — ${c.nome}` });
      }
    }
    for (const [nome, val] of Object.entries(valoresFixos)) {
      sugs.push({ nome, tipo: 'const', descricao: `Constante = ${val}` });
    }
    for (const [nome, info] of Object.entries(constantesGlobais || {})) {
      if (!sugs.find(s => s.nome.toUpperCase() === nome.toUpperCase())) {
        sugs.push({ nome, tipo: 'const', descricao: `Contrato — ${info.label} = ${info.valor}` });
      }
    }
    // Remover duplicatas
    const vistos = new Set<string>();
    return sugs.filter(s => {
      if (vistos.has(s.nome.toUpperCase())) return false;
      vistos.add(s.nome.toUpperCase());
      return true;
    });
  }, [colunas, colunasNumericas, valoresFixos, constantesGlobais]);

  // Extrair o token (palavra) na posição do cursor
  const extrairTokenNaPosicao = useCallback((texto: string, pos: number): { token: string; start: number; end: number } => {
    // Encontrar boundaries - caracteres que delimitam tokens
    const isDelimiter = (c: string) => /[\s+\-*/(),]/.test(c);

    let start = pos;
    while (start > 0 && !isDelimiter(texto[start - 1])) start--;

    let end = pos;
    while (end < texto.length && !isDelimiter(texto[end])) end++;

    return { token: texto.slice(start, end), start, end };
  }, []);

  // Verificar se o token atual é um candidato a autocomplete
  const verificarAutocomplete = useCallback(() => {
    if (!textareaRef.current || disabled) return;

    const pos = textareaRef.current.selectionStart;
    const texto = textareaRef.current.value;

    const { token, start, end } = extrairTokenNaPosicao(texto, pos);

    // Só ativar autocomplete se o token tiver ao menos 1 caractere
    // E se o cursor estiver DENTRO ou no final do token
    if (token.length < 1 || pos < start) {
      setAutocomplete(prev => ({ ...prev, aberto: false }));
      return;
    }

    // Se o token já é uma função conhecida, não sugere
    const funcs = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
    if (funcs.includes(token.toUpperCase())) {
      setAutocomplete(prev => ({ ...prev, aberto: false }));
      return;
    }

    // Se o token está dentro de parênteses de função, é candidato a coluna
    // OU se está após operador, também

    const sugestoes = todasSugestoes()
      .filter(s => s.nome.toUpperCase().includes(token.toUpperCase()))
      .sort((a, b) => {
        // Priorizar match a partir do início
        const aStarts = a.nome.toUpperCase().startsWith(token.toUpperCase());
        const bStarts = b.nome.toUpperCase().startsWith(token.toUpperCase());
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.nome.length - b.nome.length;
      })
      .slice(0, 10);

    if (sugestoes.length === 0) {
      setAutocomplete(prev => ({ ...prev, aberto: false }));
      return;
    }

    // Calcular posição do dropdown (abaixo do cursor)
    if (textareaRef.current) {
      const ta = textareaRef.current;
      const linha = texto.slice(0, pos).split('\n').length;
      const col = pos - texto.slice(0, pos).lastIndexOf('\n') - 1;
      const lineHeight = 20; // altura aproximada por linha
      const charWidth = 8.5; // largura aproximada (monospace 0.85rem)

      setAutocompletePos({
        top: Math.min(linha * lineHeight + 28, 120),
        left: Math.min(col * charWidth, ta.offsetWidth - 200),
      });
    }

    setAutocomplete({
      aberto: true,
      textoParcial: token,
      startPos: start,
      endPos: end,
      sugestoes,
      indiceSelecionado: 0,
    });
  }, [disabled, extrairTokenNaPosicao, todasSugestoes]);

  // Aplicar autocomplete (substituir token pelo nome da coluna)
  const aplicarAutocomplete = useCallback((nome: string) => {
    const { startPos, endPos } = autocomplete;
    const novaExpr = valor.slice(0, startPos) + nome + valor.slice(endPos);
    onChange(novaExpr);
    setAutocomplete(prev => ({ ...prev, aberto: false }));

    // Posicionar cursor após o nome inserido
    setTimeout(() => {
      if (textareaRef.current) {
        const novaPos = startPos + nome.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(novaPos, novaPos);
        cursorPosRef.current = novaPos;
      }
    }, 10);
  }, [autocomplete, valor, onChange]);

  // Atualiza cursor position ao focar
  const guardarCursor = () => {
    if (textareaRef.current) {
      cursorPosRef.current = textareaRef.current.selectionStart;
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Verificar autocomplete após o valor ser atualizado
    setTimeout(verificarAutocomplete, 0);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!autocomplete.aberto) {
      // Mesmo sem autocomplete aberto, guardar cursor
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
        setTimeout(guardarCursor, 0);
      }
      return;
    }

    // Navegação no dropdown
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAutocomplete(prev => ({
        ...prev,
        indiceSelecionado: Math.min(prev.indiceSelecionado + 1, prev.sugestoes.length - 1),
      }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setAutocomplete(prev => ({
        ...prev,
        indiceSelecionado: Math.max(prev.indiceSelecionado - 1, 0),
      }));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (autocomplete.sugestoes[autocomplete.indiceSelecionado]) {
        e.preventDefault();
        aplicarAutocomplete(autocomplete.sugestoes[autocomplete.indiceSelecionado].nome);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setAutocomplete(prev => ({ ...prev, aberto: false }));
    } else {
      // Para outras teclas, verificar autocomplete depois
      setTimeout(verificarAutocomplete, 0);
    }
  };

  // Fechar autocomplete ao clicar fora
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target as Node)) {
        setAutocomplete(prev => ({ ...prev, aberto: false }));
      }
    };
    if (autocomplete.aberto) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [autocomplete.aberto]);

  const inserirNaExpressao = useCallback((texto: string) => {
    if (disabled) return;
    const pos = cursorPosRef.current;
    const nova = valor.slice(0, pos) + texto + valor.slice(pos);
    onChange(nova);
    // Atualiza cursor para depois do texto inserido
    setTimeout(() => {
      if (textareaRef.current) {
        const novaPos = pos + texto.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(novaPos, novaPos);
        cursorPosRef.current = novaPos;
        // Verificar autocomplete após inserção
        verificarAutocomplete();
      }
    }, 10);
  }, [valor, onChange, disabled, verificarAutocomplete]);

  const adicionarFuncao = (fn: string) => {
    if (fn === 'COUNT') {
      inserirNaExpressao('COUNT(*)');
    } else if (fn === 'COUNT DISTINCT') {
      inserirNaExpressao('COUNT DISTINCT()');
    } else if (fn === 'SE') {
      inserirNaExpressao(' SE ');
    } else if (fn === 'IF') {
      inserirNaExpressao('IF(condicao, valor_se_sim, valor_se_nao)');
    } else if (fn === 'ROUND') {
      inserirNaExpressao('ROUND(valor, 2)');
    } else if (fn === 'ABS') {
      inserirNaExpressao('ABS(valor)');
    } else if (fn === 'MEDIAN') {
      inserirNaExpressao('MEDIAN(coluna)');
    } else if (fn === 'PERCENTILE') {
      inserirNaExpressao('PERCENTILE(coluna, 0.5)');
    } else if (fn === 'MULTIPLY') {
      inserirNaExpressao('MULTIPLY(col1, col2)');
    } else if (fn === 'DIVIDE') {
      inserirNaExpressao('DIVIDE(col1, col2)');
    } else {
      inserirNaExpressao(`${fn}()`);
    }
  };

  const aplicarTemplate = (template: string) => {
    // Detecta colunas automaticamente
    let formula = template;
    // Substitui placeholders pelas primeiras colunas disponíveis
    if (formula.includes('{coluna}') && colunasNumericas.length > 0) {
      formula = formula.replace('{coluna}', colunasNumericas[0].nome);
    }
    if (formula.includes('{colPeso}')) {
      const colPeso = colunasNumericas.find(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('PESO');
      });
      formula = formula.replace('{colPeso}', colPeso?.nome || colunasNumericas[0]?.nome || '');
    }
    if (formula.includes('{colKm}')) {
      const colKm = colunasNumericas.find(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('KM');
      });
      formula = formula.replace('{colKm}', colKm?.nome || colunasNumericas[0]?.nome || '');
    }
    if (formula.includes('{colHora}')) {
      const colHora = colunas.filter(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('HORA') || nome.includes('TEMPO') || nome.includes('DURACAO');
      });
      formula = formula.replace('{colHora}', colHora[0]?.nome || colunasNumericas[0]?.nome || '');
    }
    if (formula.includes('{colHoraSaida}')) {
      const colHoraSaida = colunas.filter(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('SAIDA') || nome.includes('SAÍDA');
      });
      formula = formula.replace(/\{colHoraSaida\}/g, colHoraSaida[0]?.nome || 'HR SAIDA BASE');
    }
    if (formula.includes('{colHoraChega}')) {
      const colHoraChega = colunas.filter(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('CHEGA') || nome.includes('CHEGADA') || nome.includes('RETORNO');
      });
      formula = formula.replace(/\{colHoraChega\}/g, colHoraChega[0]?.nome || 'HR CHEGA BASE');
    }
    if (formula.includes('{colTipo}')) {
      const colTipo = colunas.filter(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('CAMINHAO') || nome.includes('TIPO') || nome.includes('VEICULO');
      });
      formula = formula.replace('{colTipo}', colTipo[0]?.nome || colunas.filter(c => c.tipo === 'texto')[0]?.nome || '');
    }
    if (formula.includes('{colPlaca}')) {
      const colPlaca = colunas.filter(c => {
        const nome = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return nome.includes('PLACA') || nome.includes('COLETOR') || nome.includes('VEICULO') || nome.includes('EQUIPAMENTO');
      });
      formula = formula.replace('{colPlaca}', colPlaca[0]?.nome || colunas.filter(c => c.tipo === 'texto')[0]?.nome || '');
    }
    onChange(formula);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(formula.length, formula.length);
      }
    }, 10);
  };

  const adicionarColuna = (col: string) => {
    inserirNaExpressao(col);
  };

  const adicionarOperador = (op: string) => {
    inserirNaExpressao(` ${op} `);
  };

  const adicionarConstante = (nome: string) => {
    inserirNaExpressao(nome);
  };

  const handleAdicionarFixo = () => {
    if (!novoFixoNome.trim() || !novoFixoValor.trim()) return;
    const valorNum = parseFloat(novoFixoValor);
    if (isNaN(valorNum)) return;
    const novos = { ...valoresFixos, [novoFixoNome.trim().toUpperCase()]: valorNum };
    onValoresFixosChange?.(novos);
    setNovoFixoNome('');
    setNovoFixoValor('');
  };

  const removerFixo = (nome: string) => {
    const novos = { ...valoresFixos };
    delete novos[nome];
    onValoresFixosChange?.(novos);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'visible', background: '#fafbfc' }}>
      {/* Editor da expressão */}
      <div style={{ padding: '0.6rem 0.7rem', background: '#fff', borderBottom: '1px solid #e2e8f0', position: 'relative' }}>
        <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.3rem' }}>
          Fórmula do KPI
        </label>
        <div style={{ position: 'relative' }}>
          <textarea
            ref={textareaRef}
            value={valor}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            onSelect={() => { guardarCursor(); setTimeout(verificarAutocomplete, 50); }}
            onClick={() => { guardarCursor(); setTimeout(verificarAutocomplete, 50); }}
            onBlur={() => setTimeout(() => setAutocomplete(prev => ({ ...prev, aberto: false })), 200)}
            disabled={disabled}
            placeholder='Ex: SUM(PESO) / COUNT(*) * VALOR_TOCO'
            rows={2}
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%',
              padding: '0.5rem 0.6rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              color: '#1e293b',
              resize: 'vertical',
              boxSizing: 'border-box',
              background: disabled ? '#f1f5f9' : '#fff',
              outline: 'none',
            }}
          />

          {/* ═══ Dropdown de autocomplete ═══ */}
          {autocomplete.aberto && (
            <div
              ref={autocompleteRef}
              style={{
                position: 'absolute',
                top: autocompletePos.top,
                left: autocompletePos.left,
                zIndex: 1000,
                background: '#fff',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                minWidth: '220px',
                maxWidth: '320px',
                maxHeight: '220px',
                overflow: 'auto',
                fontSize: '0.78rem',
              }}
            >
              {/* Cabeçalho */}
              <div style={{
                padding: '0.3rem 0.6rem',
                borderBottom: '1px solid #e2e8f0',
                fontSize: '0.6rem',
                fontWeight: 700,
                color: '#22c55e',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                background: '#f0fdf4',
              }}>
                Autocomplete — {autocomplete.textoParcial ? `"${autocomplete.textoParcial}"` : 'digite...'}
                <span style={{ float: 'right', fontWeight: 400, color: '#94a3b8', textTransform: 'none' }}>
                  ↑↓ Enter Tab
                </span>
              </div>

              {/* Sugestões */}
              {autocomplete.sugestoes.map((sug, i) => {
                const selecionado = i === autocomplete.indiceSelecionado;
                const highlight = (texto: string, termo: string) => {
                  if (!termo) return texto;
                  const idx = texto.toUpperCase().indexOf(termo.toUpperCase());
                  if (idx === -1) return texto;
                  return (
                    <>
                      {texto.slice(0, idx)}
                      <strong style={{ color: '#15803d', background: '#f0fdf4' }}>{texto.slice(idx, idx + termo.length)}</strong>
                      {texto.slice(idx + termo.length)}
                    </>
                  );
                };

                return (
                  <div
                    key={sug.nome}
                    onClick={() => aplicarAutocomplete(sug.nome)}
                    onMouseEnter={() => setAutocomplete(prev => ({ ...prev, indiceSelecionado: i }))}
                    style={{
                      padding: '0.35rem 0.6rem',
                      cursor: 'pointer',
                      background: selecionado ? '#f0fdf4' : 'transparent',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      padding: '0.08rem 0.35rem',
                      borderRadius: '3px',
                      background: sug.tipo === 'num' ? '#dcfce7' : sug.tipo === 'const' ? '#fef3c7' : '#ede9fe',
                      color: sug.tipo === 'num' ? '#15803d' : sug.tipo === 'const' ? '#b45309' : '#6d28d9',
                      flexShrink: 0,
                    }}>
                      {sug.tipo === 'num' ? '# #' : sug.tipo === 'const' ? 'C' : 'Aa'}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontWeight: selecionado ? 700 : 500, color: '#1e293b', fontSize: '0.78rem' }}>
                      {highlight(sug.nome, autocomplete.textoParcial)}
                    </span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>
                      {sug.tipo === 'num' ? 'número' : sug.tipo === 'const' ? 'constante' : sug.tipo === 'data' ? 'data' : 'texto'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p style={{ margin: '0.25rem 0 0', fontSize: '0.65rem', color: '#94a3b8' }}>
          Use funções: SUM(), AVG(), COUNT(), MIN(), MAX() e operadores + - * / ( )
          <span style={{ marginLeft: '0.3rem', color: '#22c55e', fontWeight: 600 }}>Digite o nome da coluna para autocomplete ⚡</span>
        </p>
      </div>

      {/* Preview do resultado */}
      {previewResultado !== undefined && (
        <div style={{
          padding: '0.4rem 0.7rem',
          background: previewErro ? '#fef2f2' : previewResultado !== null ? '#f0fdf4' : '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.82rem',
          fontWeight: 600,
        }}>
          <span style={{ color: '#64748b', fontWeight: 500 }}>Preview:</span>
          {previewLoading ? (
            <span style={{ color: '#94a3b8' }}>Calculando...</span>
          ) : previewErro ? (
            <span style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <FiAlertCircle size={13} /> {previewErro}
            </span>
          ) : previewResultado !== null ? (
            <span style={{ color: '#16a34a' }}>{previewResultado}</span>
          ) : (
            <span style={{ color: '#94a3b8' }}>Clique em "Testar" para ver o resultado</span>
          )}
        </div>
      )}

      {/* Abas de ferramentas */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
        {(['funcoes', 'colunas', 'operadores', 'templates'] as const).map(aba => (
          <button
            key={aba}
            onClick={() => setAbaAtiva(aba)}
            style={{
              flex: 1,
              padding: '0.4rem 0.5rem',
              background: abaAtiva === aba ? '#f0fdf4' : 'transparent',
              border: 'none',
              borderBottom: abaAtiva === aba ? '2px solid #22c55e' : '2px solid transparent',
              fontSize: '0.72rem',
              fontWeight: 600,
              color: abaAtiva === aba ? '#15803d' : '#64748b',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            {aba === 'funcoes' ? 'Funções' : aba === 'colunas' ? 'Colunas' : aba === 'operadores' ? 'Operadores' : 'Modelos'}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      <div style={{ padding: '0.5rem 0.7rem', minHeight: '90px', maxHeight: '140px', overflow: 'auto' }}>
        {abaAtiva === 'funcoes' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {FUNCOES_DISPONIVEIS.map(fn => (
              <button
                key={fn.nome}
                onClick={() => adicionarFuncao(fn.nome)}
                disabled={disabled}
                title={fn.descricao}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '5px',
                  border: '1px solid #bbf7d0',
                  background: '#f0fdf4',
                  color: '#15803d',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: disabled ? 'not-allowed' : 'pointer',
                  fontFamily: 'monospace',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {fn.nome}()
              </button>
            ))}
            <div style={{ width: '100%', marginTop: '0.3rem', fontSize: '0.65rem', color: '#94a3b8' }}>
              Clique para inserir — substitua "coluna" pelo nome da coluna desejada
            </div>
          </div>
        )}

        {abaAtiva === 'colunas' && (
          <div>
            {colunasNumericas.length > 0 && (
              <div style={{ marginBottom: '0.3rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Numéricas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {colunasNumericas.map(c => (
                    <button key={c.nome} onClick={() => adicionarColuna(c.nome)} disabled={disabled}
                      style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #bfdbfe', background: '#dcfce7', color: '#15803d', fontSize: '0.7rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'monospace', opacity: disabled ? 0.5 : 1 }}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {colunas.filter(c => c.tipo !== 'numero').length > 0 && (
              <div>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Texto / Data</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {colunas.filter(c => c.tipo !== 'numero').map(c => (
                    <button key={c.nome} onClick={() => adicionarColuna(c.nome)} disabled={disabled}
                      style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.7rem', fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'monospace', opacity: disabled ? 0.5 : 1 }}>
                      {c.nome}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {abaAtiva === 'operadores' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            {OPERADORES.map(op => (
              <button key={op.simbolo} onClick={() => adicionarOperador(op.simbolo)} disabled={disabled}
                title={op.descricao}
                style={{ width: '36px', height: '32px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fff', color: '#1e293b', fontSize: '1rem', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
                {op.simbolo}
              </button>
            ))}
          </div>
        )}

        {abaAtiva === 'templates' && (
          <div>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ background: '#fef3c7', color: '#b45309', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.55rem' }}>Modelos</span>
              Formulas predefinidas — clique para aplicar
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {TEMPLATES_FORMULAS.map((tpl, idx) => (
                <button
                  key={idx}
                  onClick={() => aplicarTemplate(tpl.formula)}
                  disabled={disabled}
                  title={tpl.descricao}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.3rem 0.5rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#fff',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: disabled ? 0.5 : 1,
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fefce8'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  <span style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.35rem',
                    borderRadius: '3px',
                    background: '#fef3c7',
                    color: '#b45309',
                    flexShrink: 0,
                  }}>
                    {tpl.nome}
                  </span>
                  <code style={{ fontSize: '0.7rem', color: '#15803d', fontFamily: 'monospace', flex: 1 }}>
                    {tpl.formula}
                  </code>
                  <span style={{ fontSize: '0.6rem', color: '#94a3b8', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tpl.descricao}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Constantes / Valores Fixos */}
      <div style={{ borderTop: '1px solid #e2e8f0' }}>
        <button
          onClick={() => setMostrarFixos(!mostrarFixos)}
          style={{
            width: '100%',
            padding: '0.4rem 0.7rem',
            background: 'none',
            border: 'none',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: '#64748b',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span>Constantes nomeadas (valores fixos)</span>
          <FiChevronDown size={14} style={{ transform: mostrarFixos ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>

        {mostrarFixos && (
          <div style={{ padding: '0 0.7rem 0.6rem' }}>
            {/* Constantes globais predefinidas (não removíveis) */}
            {constantesGlobais && Object.keys(constantesGlobais).length > 0 && (
              <div style={{ marginBottom: '0.4rem' }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span style={{ background: '#f0fdf4', color: '#15803d', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.55rem', fontWeight: 700 }}>Contrato</span>
                  Constantes do Contrato
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {Object.entries(constantesGlobais).map(([nome, info]) => (
                    <span key={nome} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#f0fdf4', border: '1px solid #bbf7d0', fontSize: '0.7rem', fontWeight: 600, color: '#15803d' }}>
                      <span onClick={() => inserirNaExpressao(nome)} style={{ cursor: 'pointer' }} title={`${info.label}: ${info.valor}`}>
                        {nome}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 400, color: '#94a3b8' }}>{info.label}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Object.entries(valoresFixos).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.4rem' }}>
                {Object.entries(valoresFixos).map(([nome, val]) => (
                  <span key={nome} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: '#fef3c7', border: '1px solid #fde68a', fontSize: '0.7rem', fontWeight: 600, color: '#b45309' }}>
                    <span onClick={() => adicionarConstante(nome)} style={{ cursor: 'pointer' }}>{nome} = {val}</span>
                    <button onClick={() => removerFixo(nome)} style={{ background: 'none', border: 'none', color: '#b45309', cursor: 'pointer', padding: 0, fontSize: '0.7rem', lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <input value={novoFixoNome} onChange={e => setNovoFixoNome(e.target.value.toUpperCase())} placeholder="NOME"
                style={{ flex: 1, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', fontFamily: 'monospace' }} />
              <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>=</span>
              <input type="number" step="any" value={novoFixoValor} onChange={e => setNovoFixoValor(e.target.value)} placeholder="valor"
                style={{ width: '80px', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem' }} />
              <button onClick={handleAdicionarFixo}
                style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: 'none', background: '#22c55e', color: '#fff', fontSize: '0.68rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                + Add
              </button>
            </div>
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.6rem', color: '#94a3b8' }}>
              Use constantes na fórmula como se fossem colunas: ex: AVG(PESO) * FATOR
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
