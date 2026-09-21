import type { ColunaDetectada } from '../KpiEditor/KpiEditorTypes';
import type { PlanilhaItem } from './servicoTypes';

export const CANDIDATOS_COLUNA_PESO = ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO BRUTO'];
export const CANDIDATOS_COLUNA_TIPO_CAMINHAO = [
  'TIPO DE CAMINHAO', 'TIPO DE CAMINHÃO', 'TIPO CAMINHAO', 'TIPO_CAMINHAO', 'CAMINHAO', 'CAMINHÃO',
];

/** Rótulos amigáveis dos modelos de planilha de roçada detectados no backend. */
export const MODELOS_ROCADA_OPCOES = [
  { id: 'londrina', label: 'Londrina' },
  { id: 'pindamonhangaba', label: 'Pinda' },
  { id: 'qgis', label: 'QGIS' },
  { id: 'betim_trator', label: 'Betim' },
  { id: 'modelo_trecho', label: 'Padrão' },
  { id: 'generico', label: 'Padrão' },
] as const;

export function labelModeloRocada(modelo: string | null | undefined): string {
  switch (modelo) {
    case 'londrina': return 'Londrina';
    case 'pindamonhangaba': return 'Pindamonhangaba (Pinda)';
    case 'qgis': return 'QGIS';
    case 'betim_trator': return 'Betim';
    case 'modelo_trecho':
    case 'generico': return 'Padrão (área m²)';
    case 'desconhecido': return 'Não reconhecido';
    default: return modelo ? String(modelo) : 'Não identificado';
  }
}

export function normalizarNomeColuna(s: string): string {
  return s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
}

function isColunaPlanilhaInvalida(nome: string): boolean {
  const n = (nome || '').trim();
  return !n || n.startsWith('__EMPTY');
}

export function filtrarColunasValidas(cols: ColunaDetectada[]): ColunaDetectada[] {
  return cols.filter(c => !isColunaPlanilhaInvalida(c.nome));
}

export function detectarColunaPlanilha(nomes: string[], candidatos: string[]): string {
  const colsNorm = nomes.map(n => ({ original: n, norm: normalizarNomeColuna(n) }));
  for (const cand of candidatos) {
    const cn = normalizarNomeColuna(cand);
    const exato = colsNorm.find(c => c.norm === cn);
    if (exato) return exato.original;
  }
  for (const cand of candidatos) {
    const cn = normalizarNomeColuna(cand);
    const parcial = colsNorm.find(c => c.norm.includes(cn) || cn.includes(c.norm));
    if (parcial) return parcial.original;
  }
  return '';
}

export function normalizarPlanilhasUploads(raw: unknown[] | undefined): PlanilhaItem[] {
  return (raw || [])
    .map((item) => {
      const u = item as Record<string, unknown>;
      const id = Number(u.id);
      return {
        id,
        nomeArquivo: String(u.nomeArquivo ?? u.nome ?? ''),
        totalLinhas: Number(u.totalLinhas ?? u.linhas ?? 0),
        linhasImportadas: Number(u.linhasImportadas ?? u.importados ?? 0),
        criadoEm: String(u.criadoEm ?? ''),
        urlDownload: typeof u.urlDownload === 'string' ? u.urlDownload : null,
      };
    })
    .filter(u => Number.isFinite(u.id) && u.id > 0);
}

export function detectarColuna(colunas: ColunaDetectada[], termos: string[]): string {
  for (const t of termos) {
    const tn = t.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
    for (const c of colunas) {
      const cn = c.nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
      if (cn === tn) return c.nome;
    }
  }
  return termos[0] || '';
}

export function obterValorMetrica(key: string, m: any): string {
  if (!m) return '\u2014';
  const map: Record<string, string> = {
    viagens: 'viagens', coletores: 'qtdColetores', peso_total: 'pesoTotalTon',
    km_total: 'kmTotal', horas_produtivas: 'horasProdutivas', faturamento_est: 'faturamento',
    ton_km: 'tonKm', prod_coletor: 'prodColetor', km_medio_viagem: 'kmMedioViagem',
    ton_media_coleta: 'tonMediaColeta', receita_km: 'receitaKm', receita_hora: 'receitaHora',
  };
  const v = m[map[key]];
  if (v == null) return '\u2014';
  if (key === 'faturamento_est') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (key === 'peso_total' || key === 'prod_coletor' || key === 'ton_media_coleta') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' t';
  if (key === 'km_total' || key === 'km_medio_viagem') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km';
  if (key === 'horas_produtivas') return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
  if (key === 'receita_km') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/km';
  if (key === 'receita_hora') return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) + '/h';
  return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
