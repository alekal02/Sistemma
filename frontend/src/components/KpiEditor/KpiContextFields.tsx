import type { KpiConfig } from './KpiEditorTypes';
import { CATEGORIAS, UNIDADES } from './KpiEditorTypes';

interface KpiContextFieldsProps {
  kpi: KpiConfig;
  onChange: (campo: string, valor: any) => void;
}

export default function KpiContextFields({ kpi, onChange }: KpiContextFieldsProps) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.55rem 0.65rem', border: '1px solid #e2e8f0' }}>
      <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.35rem' }}>
        Contexto de Negócio
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Descrição</label>
          <input
            value={kpi.descricao || ''}
            onChange={e => onChange('descricao', e.target.value)}
            placeholder="Ex: Média de peso por viagem"
            style={{ width: '100%', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Unidade</label>
          <select
            value={kpi.unidade || ''}
            onChange={e => onChange('unidade', e.target.value)}
            style={{ width: '100%', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', background: '#fff' }}
          >
            <option value="">Sem unidade</option>
            {UNIDADES.filter(Boolean).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Categoria</label>
          <select
            value={kpi.categoria || ''}
            onChange={e => onChange('categoria', e.target.value)}
            style={{ width: '100%', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', background: '#fff' }}
          >
            <option value="">Sem categoria</option>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Cor do Card</label>
          <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
            <input
              type="color"
              value={kpi.cor || '#22c55e'}
              onChange={e => onChange('cor', e.target.value)}
              style={{ width: '32px', height: '28px', border: '1px solid #d1d5db', borderRadius: '4px', padding: 0, cursor: 'pointer' }}
            />
            <input
              value={kpi.cor || ''}
              onChange={e => onChange('cor', e.target.value)}
              placeholder="#22c55e"
              style={{ flex: 1, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem' }}
            />
          </div>
        </div>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Meta</label>
          <input
            type="number"
            step="any"
            value={kpi.meta ?? ''}
            onChange={e => onChange('meta', e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Valor alvo"
            style={{ width: '100%', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', boxSizing: 'border-box' }}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '0.15rem' }}>Alerta</label>
          <select
            value={kpi.alerta || ''}
            onChange={e => onChange('alerta', e.target.value || null)}
            style={{ width: '100%', padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '0.72rem', background: '#fff' }}
          >
            <option value="">Sem alerta</option>
            <option value="acima">Acima da meta</option>
            <option value="abaixo">Abaixo da meta</option>
          </select>
        </div>
      </div>
    </div>
  );
}
