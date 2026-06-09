import { useState, useMemo } from 'react';
import { FiSearch, FiDownload, FiChevronUp, FiChevronDown, FiChevronsUp } from 'react-icons/fi';
import type { MotoristaKpi } from '../services/dashboardExecutivoService';

interface Props {
  motoristas: MotoristaKpi[];
  onSelecionarMotorista?: (motorista: string) => void;
}

type SortField = keyof MotoristaKpi | '';

const FORMATADORES: Record<string, (v: number) => string> = {
  tonelagem: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
  kmTotal: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }),
  horasProdutivas: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
  tonPorViagem: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
  kmPorViagem: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }),
  tonPorKm: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 }),
  tonPorHora: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }),
  viagens: (v) => v.toLocaleString('pt-BR'),
  motorista: (v) => String(v),
};

export default function RankingMotoristasTable({ motoristas, onSelecionarMotorista }: Props) {
  const [busca, setBusca] = useState('');
  const [sortField, setSortField] = useState<SortField>('tonelagem');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtrar = (m: MotoristaKpi) => {
    if (!busca) return true;
    const termo = busca.toLowerCase();
    return (
      m.motorista.toLowerCase().includes(termo) ||
      m.placa.toLowerCase().includes(termo)
    );
  };

  const ordenados = useMemo(() => {
    if (!sortField) return motoristas.filter(filtrar);
    return [...motoristas].filter(filtrar).sort((a, b) => {
      const aVal = a[sortField as keyof MotoristaKpi] ?? 0;
      const bVal = b[sortField as keyof MotoristaKpi] ?? 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === 'asc'
        ? Number(aVal) - Number(bVal)
        : Number(bVal) - Number(aVal);
    });
  }, [motoristas, busca, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDir === 'desc'
      ? <FiChevronDown size={12} style={{ marginLeft: 2 }} />
      : <FiChevronUp size={12} style={{ marginLeft: 2 }} />;
  };

  const exportarCSV = () => {
    const headers = ['Motorista', 'Placa', 'Viagens', 'Tonelagem (t)', 'KM Total', 't/viagem', 'km/viagem', 't/km', 't/hora'];
    const linhas = ordenados.map(m => [
      m.motorista, m.placa, m.viagens, m.tonelagem.toFixed(2),
      m.kmTotal.toFixed(0), m.tonPorViagem.toFixed(2), m.kmPorViagem.toFixed(1),
      m.tonPorKm.toFixed(4), m.tonPorHora.toFixed(2),
    ]);
    const csv = [headers.join(';'), ...linhas.map(l => l.join(';'))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ranking_motoristas.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (motoristas.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.82rem' }}>
        Nenhum dado de motorista disponível. Faça upload de uma planilha com coluna "MOTORISTA" ou "PLACA".
      </div>
    );
  }

  return (
    <div>
      {/* Barra de busca e ações */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        marginBottom: '0.65rem', flexWrap: 'wrap',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.35rem',
          background: '#f1f5f9', borderRadius: '6px',
          padding: '0.3rem 0.6rem', flex: 1, minWidth: 200,
        }}>
          <FiSearch size={13} style={{ color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Buscar motorista ou placa..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            style={{
              border: 'none', background: 'transparent',
              fontSize: '0.78rem', outline: 'none', width: '100%',
              color: '#1e293b',
            }}
          />
        </div>
        <button
          onClick={exportarCSV}
          title="Exportar CSV"
          style={{
            display: 'flex', alignItems: 'center', gap: '0.3rem',
            fontSize: '0.72rem', fontWeight: 600, padding: '0.35rem 0.65rem',
            background: '#f0fdf4', color: '#059669', border: '1px solid #bbf7d0',
            borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          <FiDownload size={12} /> CSV
        </button>
      </div>

      {/* Tabela */}
      <div style={{ overflowX: 'auto' }}>
        <table className="analise-tabela motoristas-table" style={{ fontSize: '0.72rem' }}>
          <thead>
            <tr>
              <th style={{ width: 32 }}>#</th>
              <th onClick={() => handleSort('motorista')} style={{ cursor: 'pointer' }}>
                Motorista {renderSortIcon('motorista')}
              </th>
              <th>Placa</th>
              <th onClick={() => handleSort('viagens')} style={{ cursor: 'pointer' }}>
                Viag {renderSortIcon('viagens')}
              </th>
              <th onClick={() => handleSort('tonelagem')} style={{ cursor: 'pointer' }}>
                Tons {renderSortIcon('tonelagem')}
              </th>
              <th onClick={() => handleSort('tonPorViagem')} style={{ cursor: 'pointer' }}>
                t/via {renderSortIcon('tonPorViagem')}
              </th>
              <th onClick={() => handleSort('kmPorViagem')} style={{ cursor: 'pointer' }}>
                km/via {renderSortIcon('kmPorViagem')}
              </th>
              <th onClick={() => handleSort('tonPorKm')} style={{ cursor: 'pointer' }}>
                t/km {renderSortIcon('tonPorKm')}
              </th>
              <th onClick={() => handleSort('tonPorHora')} style={{ cursor: 'pointer' }}>
                t/h {renderSortIcon('tonPorHora')}
              </th>
            </tr>
          </thead>
          <tbody>
            {ordenados.map((m, i) => (
              <tr
                key={m.motorista}
                onClick={() => onSelecionarMotorista?.(m.motorista)}
                style={{ cursor: onSelecionarMotorista ? 'pointer' : 'default' }}
                title={onSelecionarMotorista ? 'Ver detalhes' : ''}
              >
                <td style={{ color: '#94a3b8', fontWeight: 700 }}>
                  {i === 0 ? '🏆' : i + 1}
                </td>
                <td><strong>{m.motorista}</strong></td>
                <td style={{ color: '#64748b', fontSize: '0.68rem' }}>{m.placa}</td>
                <td style={{ fontWeight: 600 }}>{FORMATADORES.viagens(m.viagens)}</td>
                <td style={{ fontWeight: 700, color: '#059669' }}>{FORMATADORES.tonelagem(m.tonelagem)}</td>
                <td>{FORMATADORES.tonPorViagem(m.tonPorViagem)}</td>
                <td>{FORMATADORES.kmPorViagem(m.kmPorViagem)}</td>
                <td>{FORMATADORES.tonPorKm(m.tonPorKm)}</td>
                <td>{FORMATADORES.tonPorHora(m.tonPorHora)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
