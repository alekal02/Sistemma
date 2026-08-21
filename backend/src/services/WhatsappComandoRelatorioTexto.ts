export type QualCiclo = 'atual' | 'anterior';

export function textoPedeCicloAnterior(norm: string): boolean {
  const t = String(norm || '');
  return (
    /\banterior\b/.test(t)
    || /\bpassado\b/.test(t)
    || t.includes('mes passado')
    || t.includes('ultimo ciclo')
    || t.includes('ciclo fechado')
  );
}

/** Menu atual/anterior — o "2" aqui é ciclo anterior (não análise de peso). */
export function resolverQualCicloMenu(norm: string): QualCiclo | null {
  if (textoPedeCicloAnterior(norm)) return 'anterior';
  if (norm === '2') return 'anterior';
  if (norm === '1' || /\batual\b/.test(norm) || /\bandamento\b/.test(norm) || /\beste ciclo\b/.test(norm)) {
    return 'atual';
  }
  return null;
}
