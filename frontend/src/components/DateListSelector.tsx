/**
 * DateListSelector - Lista de datas disponíveis na planilha com checkbox
 * Permite selecionar uma data específica para filtrar o dashboard
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { FiCalendar, FiCheckSquare, FiSquare, FiChevronDown, FiChevronUp } from 'react-icons/fi';

interface DateListSelectorProps {
  dadosBrutos: Record<string, unknown>[];
  /** Data atualmente selecionada no filtro (YYYY-MM-DD) */
  dataSelecionada?: string;
  /** Callback quando uma data é selecionada */
  onSelectDate: (data: string) => void;
  /** Callback para limpar/voltar ao período original */
  onClearDate?: () => void;
}

export default function DateListSelector({
  dadosBrutos,
  dataSelecionada,
  onSelectDate,
  onClearDate,
}: DateListSelectorProps) {
  const [expandido, setExpandido] = useState(false);
  const [busca, setBusca] = useState('');

  // Extrai datas únicas dos dados brutos
  const datasDisponiveis = useMemo(() => {
    if (!dadosBrutos.length) return [];

    const normalizar = (s: string) =>
      s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');

    const chaves = Object.keys(dadosBrutos[0] || {});
    const colData = chaves.find(k => {
      const n = normalizar(k);
      return n === 'DATA' || n.includes('DATA') || n.includes('DATASAIDA') || n.includes('DATA_SAIDA');
    });

    if (!colData) return [];

    const datas = new Set<string>();
    for (const d of dadosBrutos) {
      let val = d[colData];
      if (val === null || val === undefined || val === '') continue;

      // Converte para string YYYY-MM-DD
      let str: string;
      if (typeof val === 'number' && val > 40000) {
        // Data serial Excel
        const excelEpoch = new Date(1899, 11, 30);
        const dt = new Date(excelEpoch.getTime() + val * 86400000);
        str = dt.toISOString().split('T')[0];
      } else {
        str = String(val).split('T')[0].split(' ')[0];
      }

      if (str && /^\d{4}-\d{2}-\d{2}$/.test(str)) {
        datas.add(str);
      }
    }

    return Array.from(datas).sort((a, b) => b.localeCompare(a)); // Mais recente primeiro
  }, [dadosBrutos]);

  // Filtra por busca
  const datasFiltradas = useMemo(() => {
    if (!busca) return datasDisponiveis;
    return datasDisponiveis.filter(d => {
      const label = d.split('-').reverse().join('/');
      return label.includes(busca) || d.includes(busca);
    });
  }, [datasDisponiveis, busca]);

  const handleToggle = useCallback((data: string) => {
    if (dataSelecionada === data) {
      // Se já está selecionada, desmarca
      onClearDate?.();
    } else {
      onSelectDate(data);
    }
  }, [dataSelecionada, onSelectDate, onClearDate]);

  if (!datasDisponiveis.length) return null;

  // Formata data para exibição (dd/mm)
  const formatarData = (iso: string) => {
    const [ano, mes, dia] = iso.split('-');
    const date = new Date(+ano, +mes - 1, +dia);
    const diaSem = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return { label: `${dia}/${mes}`, full: `${dia}/${mes}/${ano}`, diaSem };
  };

  // Agrupa por mês
  const datasPorMes = useMemo(() => {
    const grupos: Record<string, string[]> = {};
    for (const d of datasFiltradas) {
      const mes = d.slice(0, 7); // YYYY-MM
      if (!grupos[mes]) grupos[mes] = [];
      grupos[mes].push(d);
    }
    return Object.entries(grupos);
  }, [datasFiltradas]);

  const totalDatas = datasDisponiveis.length;
  const labelMes = (mes: string) => {
    const [ano, m] = mes.split('-');
    const date = new Date(+ano, +m - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div style={{
      background: '#fff',
      borderRadius: '10px',
      border: '1px solid #e2e8f0',
      marginBottom: '1rem',
      overflow: 'hidden',
    }}>
      {/* Header clicável */}
      <button
        onClick={() => setExpandido(!expandido)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          padding: '0.65rem 0.85rem',
          border: 'none',
          background: dataSelecionada ? '#eef2ff' : '#f8fafc',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 700,
          color: '#1e293b',
          transition: 'background 0.15s',
        }}
      >
        <FiCalendar size={15} color="#6366f1" />
        <span>
          {dataSelecionada
            ? `📅 Data: ${formatarData(dataSelecionada).full} (${formatarData(dataSelecionada).diaSem})`
            : `🗓️ Selecionar Data (${totalDatas} datas disponíveis)`}
        </span>
        {dataSelecionada && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onClearDate?.();
            }}
            style={{
              marginLeft: 'auto',
              fontSize: '0.65rem',
              color: '#ef4444',
              background: '#fef2f2',
              padding: '0.1rem 0.45rem',
              borderRadius: '4px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Limpar
          </span>
        )}
        <span style={{ marginLeft: dataSelecionada ? '0.25rem' : 'auto', color: '#94a3b8' }}>
          {expandido ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        </span>
      </button>

      {/* Conteúdo expansível */}
      {expandido && (
        <div style={{ padding: '0.5rem 0.75rem 0.75rem', maxHeight: '320px', overflow: 'auto' }}>
          {/* Busca */}
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar data (dd/mm ou yyyy-mm)..."
            style={{
              width: '100%',
              padding: '0.35rem 0.6rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.75rem',
              marginBottom: '0.5rem',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />

          {/* Lista de datas por mês */}
          {datasPorMes.map(([mes, datas]) => (
            <div key={mes} style={{ marginBottom: '0.35rem' }}>
              <div style={{
                fontSize: '0.6rem',
                fontWeight: 700,
                color: '#64748b',
                textTransform: 'uppercase',
                marginBottom: '0.2rem',
                padding: '0.1rem 0.3rem',
                background: '#f1f5f9',
                borderRadius: '4px',
              }}>
                {labelMes(mes)} ({datas.length})
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                gap: '0.2rem',
              }}>
                {datas.map(data => {
                  const fmt = formatarData(data);
                  const selecionada = dataSelecionada === data;
                  return (
                    <button
                      key={data}
                      onClick={() => handleToggle(data)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        padding: '0.3rem 0.45rem',
                        border: selecionada ? '1px solid #6366f1' : '1px solid #e2e8f0',
                        borderRadius: '6px',
                        background: selecionada ? '#eef2ff' : '#fff',
                        cursor: 'pointer',
                        fontSize: '0.72rem',
                        fontWeight: selecionada ? 700 : 500,
                        color: selecionada ? '#4338ca' : '#334155',
                        transition: 'all 0.1s',
                      }}
                      title={fmt.full}
                    >
                      {selecionada
                        ? <FiCheckSquare size={13} color="#6366f1" />
                        : <FiSquare size={13} color="#94a3b8" />
                      }
                      <span>{fmt.label}</span>
                      <span style={{ fontSize: '0.58rem', color: '#94a3b8', marginLeft: 'auto' }}>
                        {fmt.diaSem}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {datasFiltradas.length === 0 && (
            <div style={{ textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.75rem' }}>
              Nenhuma data encontrada para "{busca}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}
