import FormulaBuilder from '../FormulaBuilder';
import type { ColunaDetectada, KpiConfig, PreviewState, ConstanteGlobal } from './KpiEditorTypes';

interface KpiFormulaSectionProps {
  kpi: KpiConfig;
  idx: number;
  colunas: ColunaDetectada[];
  colunasNum: ColunaDetectada[];
  constantesGlobais: Record<string, ConstanteGlobal>;
  previewStates: Record<number, PreviewState>;
  agendarPreview: (idx: number) => void;
  onChange: (campo: string, valor: any) => void;
}

export default function KpiFormulaSection({
  kpi, idx, colunas, colunasNum, constantesGlobais,
  previewStates, agendarPreview, onChange,
}: KpiFormulaSectionProps) {
  return (
    <div style={{ marginBottom: '0.6rem' }}>
      <label style={{ fontSize: '0.6rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
        Fórmula (opcional)
      </label>
      <FormulaBuilder
        valor={kpi.expressao || ''}
        onChange={val => { onChange('expressao', val); agendarPreview(idx); }}
        colunas={colunas}
        colunasNumericas={colunasNum}
        valoresFixos={kpi.valoresFixos || {}}
        onValoresFixosChange={v => onChange('valoresFixos', v)}
        previewResultado={previewStates[idx]?.valor ?? null}
        previewLoading={previewStates[idx]?.loading}
        previewErro={previewStates[idx]?.erro}
        constantesGlobais={constantesGlobais}
      />
    </div>
  );
}
