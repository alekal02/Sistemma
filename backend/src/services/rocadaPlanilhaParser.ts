/**
 * Parser multi-modelo de planilhas de roçada.
 * Normaliza layouts diferentes (Londrina, Pinda, QGIS, Betim, modelo padrão)
 * para um registro canônico usado no dashboard.
 */
import * as XLSX from 'xlsx';
import { parseDataPlanilha } from '../utils/formatarDataPlanilha';
import { parseNumeroBr } from './FormulaEngine';

export type ModeloRocadaDetectado =
  | 'londrina'
  | 'pindamonhangaba'
  | 'qgis'
  | 'betim_trator'
  | 'modelo_trecho'
  | 'generico'
  | 'desconhecido';

export interface LinhaRocadaCanonico {
  dataSaida: Date | null;
  bairro: string | null;
  logradouro: string | null;
  areaM2: number;
  equipamento: string | null;
  operador: string | null;
  equipe: string | null;
  tipo: string | null;
  distrito: string | null;
  /** Colunas originais normalizadas para FormulaEngine / KPIs */
  dados: Record<string, unknown>;
  aba: string;
  modelo: ModeloRocadaDetectado;
}

export interface ResultadoParseRocada {
  modelo: ModeloRocadaDetectado;
  abasUsadas: string[];
  totalLinhasBrutas: number;
  linhas: LinhaRocadaCanonico[];
  avisos: string[];
  /** Linhas com dados mas sem metragem (m²/área) — não entram no dashboard */
  linhasSemArea: number;
  /** Planilha sem coluna reconhecida de área/metragem */
  semColunaArea: boolean;
  /** Amostras de linhas rejeitadas por falta de m² (para UI) */
  amostraSemArea: Array<{
    aba: string;
    linha: number;
    data: string | null;
    bairro: string | null;
    motivo: string;
  }>;
}

function norm(s: unknown): string {
  return String(s ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normKey(s: unknown): string {
  return norm(s).replace(/[^A-Z0-9]/g, '');
}

function cellStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Área m²: aceita 5.000,00 (BR), 5,000.00 (US) e decimais QGIS (485.07). */
function cellNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number' && !isNaN(v) && v > 0) return v;

  let str = String(v).trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (!str) return 0;

  const temVirgula = str.includes(',');
  const temPonto = str.includes('.');

  if (temVirgula && temPonto) {
    // Último separador define decimal
    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
      // 5.000,00 (BR)
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 5,000.00 (US)
      str = str.replace(/,/g, '');
    }
  } else if (temVirgula && !temPonto) {
    // 5000,50 ou 5.000 malformado como 5000,00
    str = str.replace(',', '.');
  } else if (temPonto && !temVirgula) {
    // 485.073178 (decimal) OU 5.000 (milhar BR sem decimal)
    const parts = str.split('.');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3) {
      // ambíguo: 5.000 → milhar; 485.073 → decimal (3 casas mas parte inteira > 2 dígitos tipicamente área)
      // Se parte decimal tem exatamente 3 dígitos e inteiro curto, preferir milhar só se valor "inteiro" típico
      const asDecimal = Number(str);
      const asMilhar = Number(parts.join(''));
      // Áreas de roçada costumam ser >= 10; se decimal < 10 e milhar >= 1000, é milhar
      if (!isNaN(asDecimal) && !isNaN(asMilhar) && asDecimal < 100 && asMilhar >= 1000) {
        str = String(asMilhar);
      }
    }
  }

  const n = Number(str);
  if (!isNaN(n) && n > 0) return n;
  const fallback = parseNumeroBr(v);
  return !isNaN(fallback) && fallback > 0 ? fallback : 0;
}

function parseDataFlex(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Normaliza para meio-dia UTC evitando shift de fuso
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0));
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const utcDays = Math.floor(v - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  const limpo = s.replace(/\\/g, '/');

  // dd/mm/yy ou d/m/yy
  const mBr2 = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mBr2) {
    const dia = Number(mBr2[1]);
    const mes = Number(mBr2[2]);
    let ano = Number(mBr2[3]);
    ano += ano >= 70 ? 1900 : 2000;
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    }
  }

  // d-Mon / d-Mon-yy (Londrina: 1-Jun)
  const mMon = limpo.match(/^(\d{1,2})-([A-Za-z]{3})(?:-(\d{2,4}))?$/);
  if (mMon) {
    const map: Record<string, number> = {
      JAN: 0, FEV: 1, FEB: 1, MAR: 2, ABR: 3, APR: 3, MAI: 4, MAY: 4,
      JUN: 5, JUL: 6, AGO: 7, AUG: 7, SET: 8, SEP: 8, OUT: 9, OCT: 9,
      NOV: 10, DEZ: 11, DEC: 11,
    };
    const mes = map[mMon[2].toUpperCase().slice(0, 3)];
    if (mes !== undefined) {
      const dia = Number(mMon[1]);
      let ano = mMon[3] ? Number(mMon[3]) : new Date().getFullYear();
      if (ano < 100) ano += 2000;
      return new Date(Date.UTC(ano, mes, dia, 12, 0, 0));
    }
  }

  // dd/mm/yyyy
  const mBr4 = limpo.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mBr4) {
    const dia = Number(mBr4[1]);
    const mes = Number(mBr4[2]);
    const ano = Number(mBr4[3]);
    if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
      return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
    }
  }

  const d = parseDataPlanilha(limpo);
  if (d && !isNaN(d.getTime())) {
    // parseDataPlanilha já grava em UTC — usar getters UTC
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
  }
  return null;
}

function scoreHeader(headers: string[], tokens: string[]): number {
  const keys = headers.map(normKey);
  let score = 0;
  for (const t of tokens) {
    const tk = normKey(t);
    if (keys.some((k) => k === tk || k.includes(tk) || tk.includes(k))) score++;
  }
  return score;
}

function detectarModeloPorCabecalho(headers: string[]): ModeloRocadaDetectado {
  const h = headers.map(norm);
  const has = (...parts: string[]) => parts.every((p) => h.some((x) => x.includes(norm(p))));

  if (has('METRAGEM') && has('EQUIPAMENTO') && has('BAIRRO')) return 'londrina';
  if (has('TOTAL') && has('BAIRRO') && (has('DISTRITO') || has('LOGRADOURO')) && has('DATA')) {
    if (h.some((x) => x.includes('DISTRITO'))) return 'pindamonhangaba';
  }
  if ((has('AREA') || has('ÁREA')) && has('OPERADOR') && (has('BAIRRO') || h.some((x) => x.includes('BAIRRO')))) {
    if (h.some((x) => x.includes('FID') || x.includes('CCI') || x.includes('NUMQDR'))) return 'qgis';
  }
  if (has('LOCALIZACAO') && has('BAIRRO') && (has('TOTAL') || has('COMPRIMENTO'))) return 'betim_trator';
  if (has('TRECHO') && (has('EXECUTADO') || has('PROJETO'))) return 'modelo_trecho';
  if (has('AREA') || has('M2') || has('METRAGEM')) return 'generico';
  // Layout de roçada sem coluna de metragem — ainda reconhecemos para bloquear com aviso claro
  if (
    has('DATA')
    && (has('BAIRRO') || has('LOGRADOURO') || has('LOCALIZACAO') || has('TRECHO'))
    && (has('OPERADOR') || has('EQUIPE') || has('EQUIPAMENTO'))
  ) {
    return 'generico';
  }
  return 'desconhecido';
}

function acharCol(headers: string[], ...candidatos: string[]): number {
  const keys = headers.map(normKey);
  for (const c of candidatos) {
    const ck = normKey(c);
    const i = keys.findIndex((k) => k === ck || k.includes(ck));
    if (i >= 0) return i;
  }
  return -1;
}

function sheetEhRocada(nome: string): boolean {
  const n = norm(nome);
  if (n.includes('RESUMO') && !n.includes('ROCADA')) return false;
  if (n.includes('PLANILHA RESUMO') || n.includes('COMPOSICAO')) return false;
  if (n.includes('CRONOGRAMA')) return false;
  if (n.includes('VARRIC') || n.includes('CAPINA') || n.includes('PINTURA') || n.includes('BOCA')) return false;
  if (n.includes('ROCADA') || n.includes('TRATOR')) return true;
  // abas simples (Londrina/Pinda/QGIS)
  if (n === 'JUNHO' || n === 'JULHO' || n === 'MAIO' || n === 'ABRIL') return true;
  if (n.includes('ROADA') || n.includes('MANUAL') || n === 'ROCADA') return true;
  return false;
}

function encontrarLinhaCabecalho(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] || []).map((c) => norm(c));
    const joined = cells.join('|');
    if (
      (joined.includes('DATA') && (joined.includes('BAIRRO') || joined.includes('AREA') || joined.includes('METRAGEM') || joined.includes('TOTAL') || joined.includes('TRECHO') || joined.includes('LOCALIZ')))
      || (joined.includes('LOGRADOURO') && joined.includes('METRAGEM'))
      || (joined.includes('FID') && joined.includes('OPERADOR'))
    ) {
      return i;
    }
  }
  return 0;
}

function montarDadosCanonicos(linha: Omit<LinhaRocadaCanonico, 'dados'> & { dadosExtra?: Record<string, unknown> }): Record<string, unknown> {
  const area = linha.areaM2;
  return {
    DATA: linha.dataSaida ? linha.dataSaida.toISOString().slice(0, 10) : null,
    BAIRRO: linha.bairro,
    'Area m²': area,
    AREA_M2: area,
    AREA_ROCADA: area,
    M2: area,
    Equipamento: linha.equipamento,
    EQUIPAMENTO: linha.equipamento,
    Operador: linha.operador,
    OPERADOR: linha.operador,
    Equipe: linha.equipe,
    EQUIPE: linha.equipe,
    LOGRADOURO: linha.logradouro,
    DISTRITO: linha.distrito,
    TIPO: linha.tipo,
    ...(linha.dadosExtra || {}),
  };
}

type AmostraSemArea = ResultadoParseRocada['amostraSemArea'][number];

function parseLinhasAba(
  sheetName: string,
  rows: unknown[][],
  avisos: string[],
): {
  modelo: ModeloRocadaDetectado;
  linhas: LinhaRocadaCanonico[];
  linhasSemArea: number;
  semColunaArea: boolean;
  amostraSemArea: AmostraSemArea[];
} {
  const vazio = {
    modelo: 'desconhecido' as ModeloRocadaDetectado,
    linhas: [] as LinhaRocadaCanonico[],
    linhasSemArea: 0,
    semColunaArea: false,
    amostraSemArea: [] as AmostraSemArea[],
  };
  if (!rows.length) return vazio;

  const headerIdx = encontrarLinhaCabecalho(rows);
  const headerRow = (rows[headerIdx] || []).map((c) => String(c ?? '').trim());
  const modelo = detectarModeloPorCabecalho(headerRow);
  if (modelo === 'desconhecido') {
    return vazio;
  }

  const iData = acharCol(headerRow, 'DATA', 'Data');
  const iBairro = acharCol(headerRow, 'BAIRRO', 'bairro_ful', 'BAIRRO ');
  const iLog = acharCol(headerRow, 'LOGRADOURO', 'LOCALIZAÇÃO', 'LOCALIZACAO', 'ENDEREÇO', 'ENDERECO', 'TRECHO', 'name_2');
  const iArea = acharCol(headerRow, 'METRAGEM (M²)', 'METRAGEM', 'TOTAL (M²)', 'TOTAL', 'Área', 'AREA', 'Area m²', 'EXECUTADO', 'M2', 'M²');
  const iEquip = acharCol(headerRow, 'EQUIPAMENTO UTILIZADO', 'EQUIPAMENTO', 'Equipamento');
  const iOp = acharCol(headerRow, 'OPERADOR', 'Operador');
  const iEquipe = acharCol(headerRow, 'EQUIPE', 'Equipe');
  const iTipo = acharCol(headerRow, 'TIPO', 'Tipo');
  const iDist = acharCol(headerRow, 'DISTRITO SEDE', 'DISTRITO', 'DISTRITO MOREIA');
  const iComp = acharCol(headerRow, 'COMPRIMENTO');
  const iLarg = acharCol(headerRow, 'LARGURA');
  const iExec = acharCol(headerRow, 'EXECUTADO');
  const iProj = acharCol(headerRow, 'PROJETO');

  // Pinda: área pode estar em DISTRITO SEDE ou TOTAL
  const iDistSede = acharCol(headerRow, 'DISTRITO SEDE');
  const iDistMoreia = acharCol(headerRow, 'DISTRITO MOREIA');

  const temFonteArea =
    iArea >= 0
    || iExec >= 0
    || iProj >= 0
    || (iComp >= 0 && iLarg >= 0)
    || iDistSede >= 0
    || iDistMoreia >= 0;

  const linhas: LinhaRocadaCanonico[] = [];
  let linhasSemArea = 0;
  const amostraSemArea: AmostraSemArea[] = [];

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some((c) => String(c ?? '').trim())) continue;

    const dataSaida = iData >= 0 ? parseDataFlex(row[iData]) : null;
    const bairro = iBairro >= 0 ? cellStr(row[iBairro]) : null;
    const logradouro = iLog >= 0 ? cellStr(row[iLog]) : null;
    // Linha só com lixo / sem contexto operacional — ignora sem contar como "sem área"
    if (!dataSaida && !bairro && !logradouro && !cellStr(row[iOp]) && !cellStr(row[iEquipe])) {
      continue;
    }

    let areaM2 = iArea >= 0 ? cellNum(row[iArea]) : 0;

    // Betim: TOTAL = comprimento × largura se TOTAL vazio
    if (areaM2 <= 0 && iComp >= 0 && iLarg >= 0) {
      const c = cellNum(row[iComp]);
      const l = cellNum(row[iLarg]);
      // LARGURA às vezes é texto "Mensal" — só multiplica se ambos numéricos
      if (c > 0 && l > 0 && l < 500) areaM2 = c * l;
    }

    // Modelo trecho: preferir EXECUTADO
    if (iExec >= 0) {
      const exec = cellNum(row[iExec]);
      if (exec > 0) areaM2 = exec;
      else if (iProj >= 0) {
        const proj = cellNum(row[iProj]);
        if (proj > 0) areaM2 = proj;
      }
    }

    // Pinda: soma distritos se TOTAL vazio
    if (areaM2 <= 0 && (iDistSede >= 0 || iDistMoreia >= 0)) {
      areaM2 = (iDistSede >= 0 ? cellNum(row[iDistSede]) : 0)
        + (iDistMoreia >= 0 ? cellNum(row[iDistMoreia]) : 0);
    }

    if (areaM2 <= 0) {
      linhasSemArea++;
      if (amostraSemArea.length < 8) {
        amostraSemArea.push({
          aba: sheetName,
          linha: r + 1,
          data: dataSaida ? dataSaida.toISOString().slice(0, 10) : null,
          bairro: bairro || logradouro,
          motivo: !temFonteArea
            ? 'Planilha sem coluna de metragem/área (m²)'
            : 'Linha sem valor de m²/área (vazio, zero ou inválido)',
        });
      }
      continue;
    }

    // Equipe inferida do nome da aba (TRATOR 01, TR 025…)
    let equipe = iEquipe >= 0 ? cellStr(row[iEquipe]) : null;
    if (!equipe) {
      const sn = sheetName.trim();
      if (/trator|tr\s*\d|equipe/i.test(sn)) equipe = sn;
    }

    let equipamento = iEquip >= 0 ? cellStr(row[iEquip]) : null;
    if (!equipamento && /trator/i.test(sheetName)) equipamento = 'TRATOR';
    if (!equipamento && modelo === 'qgis') {
      const tipo = iTipo >= 0 ? cellStr(row[iTipo]) : null;
      equipamento = tipo || 'ROÇADEIRA';
    }

    const base = {
      dataSaida,
      bairro,
      logradouro,
      areaM2: Math.round(areaM2 * 100) / 100,
      equipamento,
      operador: iOp >= 0 ? cellStr(row[iOp]) : null,
      equipe,
      tipo: iTipo >= 0 ? cellStr(row[iTipo]) : 'ROÇADA',
      distrito: iDist >= 0 ? cellStr(row[iDist]) : null,
      aba: sheetName,
      modelo,
    };

    linhas.push({
      ...base,
      dados: montarDadosCanonicos(base),
    });
  }

  if (!temFonteArea) {
    avisos.push(
      `Aba "${sheetName}" (${modelo}): não há coluna de metragem/área (m²). `
      + 'Esperado: METRAGEM, TOTAL (M²), Área, EXECUTADO ou COMPRIMENTO×LARGURA.',
    );
  } else if (linhas.length === 0 && modelo !== 'desconhecido') {
    avisos.push(
      `Aba "${sheetName}" (${modelo}): cabeçalho reconhecido, mas nenhuma linha com área/m² > 0`
      + (linhasSemArea > 0 ? ` (${linhasSemArea} linha(s) sem metragem).` : '.'),
    );
  } else if (linhasSemArea > 0) {
    avisos.push(
      `Aba "${sheetName}": ${linhasSemArea} linha(s) ignorada(s) por falta de metragem (m²/área).`,
    );
  }

  return {
    modelo,
    linhas,
    linhasSemArea,
    semColunaArea: !temFonteArea,
    amostraSemArea,
  };
}

/**
 * Lê buffer XLSX/XLSM e extrai linhas de roçada de todas as abas relevantes.
 */
export function parsearPlanilhaRocada(buffer: Buffer): ResultadoParseRocada {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const avisos: string[] = [];
  const abasUsadas: string[] = [];
  const todas: LinhaRocadaCanonico[] = [];
  const amostraSemArea: AmostraSemArea[] = [];
  let modeloPrincipal: ModeloRocadaDetectado = 'desconhecido';
  let totalLinhasBrutas = 0;
  let linhasSemArea = 0;
  let semColunaArea = false;
  let abasComModelo = 0;

  const abasCandidatas = wb.SheetNames.filter((n) => sheetEhRocada(n));
  const abas = abasCandidatas.length > 0 ? abasCandidatas : wb.SheetNames.slice(0, 3);

  for (const sn of abas) {
    const ws = wb.Sheets[sn];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }) as unknown[][];
    totalLinhasBrutas += Math.max(0, rows.length - 1);

    // Score: só processa se parecer roçada
    const headerIdx = encontrarLinhaCabecalho(rows);
    const headers = (rows[headerIdx] || []).map((c) => String(c ?? ''));
    const sc = scoreHeader(headers, ['DATA', 'BAIRRO', 'AREA', 'METRAGEM', 'TOTAL', 'OPERADOR', 'LOGRADOURO', 'TRECHO', 'LOCALIZACAO']);
    if (sc < 2 && abasCandidatas.length > 0) continue;

    const parsed = parseLinhasAba(sn, rows, avisos);
    if (parsed.modelo === 'desconhecido') continue;

    abasComModelo++;
    linhasSemArea += parsed.linhasSemArea;
    if (parsed.semColunaArea) semColunaArea = true;
    for (const a of parsed.amostraSemArea) {
      if (amostraSemArea.length < 12) amostraSemArea.push(a);
    }
    if (modeloPrincipal === 'desconhecido' || parsed.modelo !== 'generico') {
      modeloPrincipal = parsed.modelo;
    }

    if (parsed.linhas.length === 0) continue;

    abasUsadas.push(sn);
    todas.push(...parsed.linhas);
  }

  if (todas.length === 0) {
    if (semColunaArea || (abasComModelo > 0 && linhasSemArea > 0)) {
      avisos.unshift(
        'Importação bloqueada: nenhuma linha com metragem (m²/área) válida. '
        + 'Preencha a coluna de área/metragem e envie novamente.',
      );
    } else {
      avisos.push(
        'Nenhuma linha de roçada reconhecida. Esperado: DATA + BAIRRO/LOGRADOURO + área (m²) '
        + '(modelos Londrina, Pinda, QGIS, Betim ou planilha padrão).',
      );
    }
  } else if (linhasSemArea > 0) {
    avisos.unshift(
      `${linhasSemArea} linha(s) sem m²/área foram ignoradas. `
      + `Somente ${todas.length} registro(s) com metragem válida serão importados.`,
    );
  }

  return {
    modelo: modeloPrincipal,
    abasUsadas,
    totalLinhasBrutas,
    linhas: todas,
    avisos,
    linhasSemArea,
    semColunaArea,
    amostraSemArea,
  };
}

export function resumoParseRocada(r: ResultadoParseRocada): {
  modelo: string;
  abas: number;
  registros: number;
  areaTotalM2: number;
  dias: number;
  bairros: number;
  linhasSemArea: number;
  semColunaArea: boolean;
  podeImportar: boolean;
} {
  const dias = new Set(
    r.linhas.map((l) => (l.dataSaida ? l.dataSaida.toISOString().slice(0, 10) : '')).filter(Boolean),
  );
  const bairros = new Set(r.linhas.map((l) => l.bairro).filter(Boolean));
  const areaTotalM2 = r.linhas.reduce((s, l) => s + l.areaM2, 0);
  return {
    modelo: r.modelo,
    abas: r.abasUsadas.length,
    registros: r.linhas.length,
    areaTotalM2: Math.round(areaTotalM2 * 100) / 100,
    dias: dias.size,
    bairros: bairros.size,
    linhasSemArea: r.linhasSemArea,
    semColunaArea: r.semColunaArea,
    podeImportar: r.linhas.length > 0 && areaTotalM2 > 0,
  };
}
