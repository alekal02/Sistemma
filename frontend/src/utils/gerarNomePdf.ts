/** Remove emojis e caracteres inválidos para nome de arquivo */
export function sanitizarParteNome(texto: string, maxLen = 50): string {
  return (texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, maxLen);
}

export function formatarDataArquivoPdf(data = new Date()): string {
  const dd = String(data.getDate()).padStart(2, '0');
  const mm = String(data.getMonth() + 1).padStart(2, '0');
  const yyyy = data.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Sufixo legível para nome de arquivo conforme período do relatório */
export function sufixoPeriodoPdf(opts: { dataInicio?: string; dataFim?: string }): string | undefined {
  const { dataInicio, dataFim } = opts;
  if (!dataInicio) return undefined;
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${d}-${m}-${y}` : iso;
  };
  if (dataFim && dataInicio === dataFim) return fmt(dataInicio);
  if (dataFim) return `Ciclo_${fmt(dataInicio)}_a_${fmt(dataFim)}`;
  return fmt(dataInicio);
}

/**
 * Nome do PDF do detalhe do dia — usa somente a data selecionada no calendário.
 * Ex.: Coleta_2_Operacao_26-05-2026
 */
/** Nome do PDF operacional semanal ou quinzenal. Ex.: Coleta_Operacao_Semana_12-06-2026_a_18-06-2026 */
export function gerarNomePdfRelatorioOperacionalPeriodo(opts: {
  servicoNome: string;
  tipo: 'semanal' | 'quinzenal' | 'ciclo';
  dataInicio: string;
  dataFim: string;
}): string {
  const prefixo = opts.tipo === 'semanal' ? 'Semana' : opts.tipo === 'quinzenal' ? 'Quinzena' : 'Ciclo_Operacional';
  const periodo = sufixoPeriodoPdf({ dataInicio: opts.dataInicio, dataFim: opts.dataFim });
  return [
    sanitizarParteNome(opts.servicoNome || 'Servico'),
    'Operacao',
    prefixo,
    periodo ? sanitizarParteNome(periodo.replace(/^Ciclo_/, '')) : null,
  ].filter(Boolean).join('_');
}

/** Nome do PDF de ciclo de roçada. Ex.: Rocada_Ciclo_Rocada_26-12-2025_a_25-01-2026 */
export function gerarNomePdfRelatorioRocadaCiclo(opts: {
  servicoNome: string;
  dataInicio: string;
  dataFim: string;
}): string {
  const periodo = sufixoPeriodoPdf({ dataInicio: opts.dataInicio, dataFim: opts.dataFim });
  return [
    sanitizarParteNome(opts.servicoNome || 'Rocada'),
    'Ciclo_Rocada',
    periodo ? sanitizarParteNome(periodo.replace(/^Ciclo_/, '')) : null,
  ].filter(Boolean).join('_');
}

/** Nome do PDF comparativo de análise de peso. Ex.: Comparativo_Analise_Peso_Coleta_18-06-2026 */
export function gerarNomePdfAnalisePesoComparativo(opts?: {
  tipoServico?: string;
}): string {
  return [
    'Comparativo_Analise_Peso',
    sanitizarParteNome(opts?.tipoServico || 'Coleta', 24),
    formatarDataArquivoPdf(),
  ].filter(Boolean).join('_');
}

export function gerarNomePdfRelatorioDia(opts: {
  servicoNome: string;
  aba: 'operacao' | 'receita';
  dataIso: string;
}): string {
  const dataFmt = sufixoPeriodoPdf({ dataInicio: opts.dataIso, dataFim: opts.dataIso }) || opts.dataIso;
  const tipo = opts.aba === 'receita' ? 'Receita' : 'Operacao';
  return [
    sanitizarParteNome(opts.servicoNome || 'Servico'),
    tipo,
    sanitizarParteNome(dataFmt),
  ].join('_');
}

/**
 * Gera nome base do PDF: Contrato_TipoServico_Sufixo_Periodo_Data
 * Ex.: CT_001_Coleta_Receita_Dia_01-06-2017_10-06-2026
 */
export function gerarNomePdfArquivo(opts: {
  contratoNome: string;
  tipoServico?: string;
  sufixo?: string;
  periodo?: string;
  data?: Date;
}): string {
  const partes = [
    sanitizarParteNome(opts.contratoNome || 'Contrato'),
    sanitizarParteNome(opts.tipoServico || 'Servico'),
    opts.sufixo ? sanitizarParteNome(opts.sufixo) : null,
    opts.periodo ? sanitizarParteNome(opts.periodo) : null,
    formatarDataArquivoPdf(opts.data),
  ].filter(Boolean) as string[];

  return partes.join('_');
}

/** Converte slug do tipo (coleta_caminhao) para texto legível no arquivo */
export function labelTipoServicoArquivo(tipo: string, labels?: Record<string, string>): string {
  if (labels?.[tipo]) {
    return labels[tipo].replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
  }
  return tipo.replace(/_/g, ' ');
}
