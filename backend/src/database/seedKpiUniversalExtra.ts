import 'reflect-metadata';
import AppDataSource from './data-source';
import { KpiUniversal, PlaceholderKpi } from '../entities/KpiUniversal';
import { TipoServico } from '../enums/TipoServico';

/**
 * Seed complementar de KPIs Universais.
 * Adiciona MAIS KPIs aos já existentes, sem duplicar.
 * 
 * Executar: npx ts-node src/database/seedKpiUniversalExtra.ts
 */
export async function seedKpisUniversaisExtra(): Promise<void> {
  const repo = AppDataSource.getRepository(KpiUniversal);

  // ─── Placeholders (reaproveitados do seed principal) ───

  const PH_PESO: PlaceholderKpi = {
    nome: 'PESO_PLACEHOLDER',
    label: 'Coluna de Peso',
    colunasCandidatas: ['PESO TOTAL', 'PESO', 'PESOTOTAL', 'PESO_BRUTO', 'PESO COLETADO', 'PESO (KG)', 'PESO COLETA'],
  };

  const PH_KM: PlaceholderKpi = {
    nome: 'KM_PLACEHOLDER',
    label: 'Coluna de KM',
    colunasCandidatas: ['KM TOTAL', 'KM', 'KMTOTAL', 'KM_TOTAL', 'QUILOMETRO', 'DISTANCIA', 'KM RODADO'],
  };

  const PH_PLACA: PlaceholderKpi = {
    nome: 'PLACA_PLACEHOLDER',
    label: 'Coluna de Placa/Veículo',
    colunasCandidatas: ['PLACA', 'CAMINHAO', 'VEICULO', 'COLETOR', 'COLETORA', 'EQUIPAMENTO'],
  };

  const PH_TIPO: PlaceholderKpi = {
    nome: 'TIPO_PLACEHOLDER',
    label: 'Coluna de Tipo de Caminhão',
    colunasCandidatas: ['TIPO CAMINHAO', 'TIPO_CAMINHAO', 'CAMINHAO', 'TIPO DE CAMINHAO', 'TIPODECAMINHAO'],
  };

  const PH_HORA: PlaceholderKpi = {
    nome: 'HORA_PLACEHOLDER',
    label: 'Coluna de Hora',
    colunasCandidatas: ['HORA SAIDA', 'HORA', 'HORASAIDA', 'HORA_SAIDA', 'HR SAIDA BASE', 'HORAS PRODUTIVAS', 'HORAS', 'DURACAO'],
  };

  const PH_HORA_FORA: PlaceholderKpi = {
    nome: 'HORA_FORA_PLACEHOLDER',
    label: 'Coluna de Horas Fora da Unidade',
    colunasCandidatas: ['HORAS QUE FICA FORA DA UNIDADE', 'HORAS FORA UNIDADE', 'HORAS FORA DA UNIDADE', 'TEMPO FORA DA UNIDADE'],
  };

  const PH_MOTORISTA: PlaceholderKpi = {
    nome: 'MOTORISTA_PLACEHOLDER',
    label: 'Coluna de Motorista',
    colunasCandidatas: ['MOTORISTA', 'NOME', 'OPERADOR', 'FUNCIONARIO', 'EQUIPE'],
  };

  const PH_COLETOR_NUM: PlaceholderKpi = {
    nome: 'COLETOR_NUM_PLACEHOLDER',
    label: 'Coluna de Nº de Coletores',
    colunasCandidatas: ['Nº DE COLETORES', 'NUMERO DE COLETORES', 'NÚMERO DE COLETORES', 'COLETORES', 'NR COLETORES'],
  };

  const PH_DISTRITO: PlaceholderKpi = {
    nome: 'DISTRITO_PLACEHOLDER',
    label: 'Coluna de Distrito',
    colunasCandidatas: ['DISTRITO', 'BAIRRO', 'LOCAL', 'SETOR'],
  };

  const PH_REGIONAL: PlaceholderKpi = {
    nome: 'REGIONAL_PLACEHOLDER',
    label: 'Coluna de Regional',
    colunasCandidatas: ['REGIONAL', 'REGIAO', 'REGIÃO', 'ZONA'],
  };

  const PH_TURNO: PlaceholderKpi = {
    nome: 'TURNO_PLACEHOLDER',
    label: 'Coluna de Turno',
    colunasCandidatas: ['TURNO', 'TURNO BASE', 'PERIODO', 'TURNO_BASE', 'TURNO_BASE\r\n'],
  };

  const PH_VIAGENS: PlaceholderKpi = {
    nome: 'VIAGENS_PLACEHOLDER',
    label: 'Coluna de Nº de Viagens',
    colunasCandidatas: ['Nº DE VIAGENS', 'NUMERO DE VIAGENS', 'NÚMERO DE VIAGENS', 'VIAGENS', 'CONTADOR DE VIAGENS', 'CONTADOR VIAGENS'],
  };

  const PH_PESO1: PlaceholderKpi = {
    nome: 'PESO1_PLACEHOLDER',
    label: 'Coluna de Peso 1 (1ª pesagem)',
    colunasCandidatas: ['PESO 1', 'PESO1', 'PRIMEIRA PESAGEM', 'PESO INICIAL'],
  };

  const PH_PESO5: PlaceholderKpi = {
    nome: 'PESO5_PLACEHOLDER',
    label: 'Coluna de Peso 5 (última pesagem)',
    colunasCandidatas: ['PESO 5', 'PESO5', 'ULTIMA PESAGEM', 'PESO FINAL'],
  };

  const PH_KM_SAIDA: PlaceholderKpi = {
    nome: 'KM_SAIDA_PLACEHOLDER',
    label: 'Coluna de KM Saída',
    colunasCandidatas: ['KM SAIDA', 'KM SAIDA BASE', 'KM SAÍDA', 'KM SAÍDA BASE', 'KM SAIDA\r\nBASE', 'KM SAIDA BASE\r\nBASE'],
  };

  const PH_KM_CHEGADA: PlaceholderKpi = {
    nome: 'KM_CHEGADA_PLACEHOLDER',
    label: 'Coluna de KM Chegada',
    colunasCandidatas: ['KM CHEGADA', 'KM CHEGADA BASE', 'KM CHEGADA ROTA 01', 'KM CHEGADA\r\nBASE', 'KM CHEGADA BASE\r\nBASE'],
  };

  const PH_PESO_MEDIO: PlaceholderKpi = {
    nome: 'PESO_MEDIO_PLACEHOLDER',
    label: 'Coluna de Peso Médio por pesagem',
    colunasCandidatas: ['PESO 2', 'PESO2', 'PESO 3', 'PESO3', 'PESO 4', 'PESO4'],
  };

  // ════════════════════════════════════════════════════════════════
  // NOVOS KPIs — COLETA_CAMINHAO (usando colunas da planilha padrão)
  // ════════════════════════════════════════════════════════════════

  const novosKpisColeta: Partial<KpiUniversal>[] = [
    // ─── Frota e Equipe ───
    {
      nome: 'Total de Motoristas',
      label: 'Total de Motoristas',
      formula: 'COUNT(DISTINCT MOTORISTA_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'motoristas',
      categoria: 'Equipe',
      cor: '#0ea5e9',
      descricao: 'Quantidade de motoristas únicos que realizaram coletas no período',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_MOTORISTA],
    },
    {
      nome: 'Distritos Atendidos',
      label: 'Distritos Atendidos',
      formula: 'COUNT(DISTINCT DISTRITO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'distritos',
      categoria: 'Cobertura',
      cor: '#a855f7',
      descricao: 'Quantidade de distritos/bairros distintos onde houve coleta',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_DISTRITO],
    },
    {
      nome: 'Regionais Atendidas',
      label: 'Regionais Atendidas',
      formula: 'COUNT(DISTINCT REGIONAL_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'regionais',
      categoria: 'Cobertura',
      cor: '#d946ef',
      descricao: 'Quantidade de regionais distintas onde houve coleta',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_REGIONAL],
    },
    {
      nome: 'Turnos Realizados',
      label: 'Turnos Realizados',
      formula: 'COUNT(DISTINCT TURNO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'turnos',
      categoria: 'Operacional',
      cor: '#f59e0b',
      descricao: 'Quantidade de turnos distintos (manhã, tarde, noite) com registros',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_TURNO],
    },

    // ─── Eficiência e Produtividade ───
    {
      nome: 'Jornada Total (Horas Fora)',
      label: 'Jornada Total',
      formula: 'SUM(HORA_FORA_PLACEHOLDER)',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'h',
      categoria: 'Produtividade',
      cor: '#06b6d4',
      descricao: 'Soma total de horas que os caminhões ficaram fora da unidade',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_HORA_FORA],
    },
    {
      nome: 'Média de Horas Fora por Viagem',
      label: 'Média Horas Fora',
      formula: 'AVG(HORA_FORA_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'h',
      categoria: 'Produtividade',
      cor: '#0891b2',
      descricao: 'Média de horas que cada viagem ficou fora da unidade',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_HORA_FORA],
    },
    {
      nome: 'KM por Hora Fora',
      label: 'KM/Hora Fora',
      formula: 'DIVIDE(SUM(KM_PLACEHOLDER), SUM(HORA_FORA_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'km/h',
      categoria: 'Eficiência',
      cor: '#3b82f6',
      descricao: 'Eficiência: KM rodados por hora fora da unidade',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_KM, PH_HORA_FORA],
    },
    {
      nome: 'Toneladas por Hora Fora',
      label: 'Ton./Hora Fora',
      formula: 'DIVIDE(SUM(PESO_PLACEHOLDER) / 1000, SUM(HORA_FORA_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'ton/h',
      categoria: 'Eficiência',
      cor: '#10b981',
      descricao: 'Produtividade: toneladas coletadas por hora fora da unidade',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO, PH_HORA_FORA],
    },

    // ─── Carga por Viagem ───
    {
      nome: 'Carga Média por Viagem',
      label: 'Carga Média/Viagem',
      formula: 'DIVIDE(SUM(PESO_PLACEHOLDER), SUM(VIAGENS_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'kg/viagem',
      categoria: 'Operacional',
      cor: '#22c55e',
      descricao: 'Peso médio por viagem (considerando Nº DE VIAGENS por registro)',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO, PH_VIAGENS],
    },
    {
      nome: 'Total de Viagens (Contador)',
      label: 'Total Viagens (Contador)',
      formula: 'SUM(VIAGENS_PLACEHOLDER)',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'viagens',
      categoria: 'Operacional',
      cor: '#14b8a6',
      descricao: 'Soma do contador de viagens — quantidade total de viagens realizadas',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_VIAGENS],
    },
    {
      nome: 'Média de Viagens por Registro',
      label: 'Viagens/Registro',
      formula: 'AVG(VIAGENS_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'viagens/reg',
      categoria: 'Operacional',
      cor: '#2dd4bf',
      descricao: 'Média do contador de viagens por registro — indica se há registros com múltiplas viagens',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_VIAGENS],
    },

    // ─── Análise de Carga por Coletor ───
    {
      nome: 'Peso por Coletor (kg)',
      label: 'Peso/Coletor',
      formula: 'DIVIDE(SUM(PESO_PLACEHOLDER), SUM(COLETOR_NUM_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'kg/coletor',
      categoria: 'Frota',
      cor: '#8b5cf6',
      descricao: 'Peso total dividido pelo número total de coletores — eficiência por coletor',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO, PH_COLETOR_NUM],
    },
    {
      nome: 'KM por Coletor',
      label: 'KM/Coletor',
      formula: 'DIVIDE(SUM(KM_PLACEHOLDER), SUM(COLETOR_NUM_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'km/coletor',
      categoria: 'Frota',
      cor: '#6366f1',
      descricao: 'KM total dividido pelo número de coletores — deslocamento por coletor',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_KM, PH_COLETOR_NUM],
    },
    {
      nome: 'Média de Coletores por Viagem',
      label: 'Média Coletores',
      formula: 'AVG(COLETOR_NUM_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'coletores',
      categoria: 'Frota',
      cor: '#4f46e5',
      descricao: 'Média do número de coletores por registro/viagem',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_COLETOR_NUM],
    },

    // ─── Análise de Pesos Individuais ───
    {
      nome: 'Variação entre Peso 1 e Peso 5',
      label: 'Variação Peso1→Peso5',
      formula: 'AVG(PESO5_PLACEHOLDER) - AVG(PESO1_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Qualidade',
      cor: '#f43f5e',
      descricao: 'Diferença média entre a primeira e última pesagem — indica acúmulo de carga',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO1, PH_PESO5],
    },
    {
      nome: 'Peso Máximo Coletado',
      label: 'Peso Máximo',
      formula: 'MAX(PESO_PLACEHOLDER)',
      agregacao: 'max',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Qualidade',
      cor: '#ef4444',
      descricao: 'Maior peso registrado em uma única coleta',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO],
    },
    {
      nome: 'Peso Mínimo Coletado',
      label: 'Peso Mínimo',
      formula: 'MIN(PESO_PLACEHOLDER)',
      agregacao: 'min',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Qualidade',
      cor: '#22c55e',
      descricao: 'Menor peso registrado em uma única coleta',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO],
    },
    {
      nome: 'Amplitude de Peso',
      label: 'Amplitude de Peso',
      formula: 'SUBTRACT(MAX(PESO_PLACEHOLDER), MIN(PESO_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Qualidade',
      cor: '#f97316',
      descricao: 'Diferença entre o maior e menor peso coletado — amplitude total',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO],
    },

    // ─── Análise por Tipo de Caminhão ───
    {
      nome: 'Média de Peso por Tipo',
      label: 'Peso Médio por Tipo',
      formula: 'AVG(PESO_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Frota',
      cor: '#0d9488',
      descricao: 'Peso médio geral — útil combinado com filtro por tipo de caminhão',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO],
    },
    {
      nome: 'KM Médio por Tipo',
      label: 'KM Médio por Tipo',
      formula: 'AVG(KM_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'km',
      categoria: 'Frota',
      cor: '#0891b2',
      descricao: 'Média de KM rodados — útil combinado com filtro por tipo de caminhão',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_KM],
    },

    // ─── Eficiência Avançada (3 novos KPIs) ───
    {
      nome: 'KM por Viagem Individual',
      label: 'KM/Viagem Individual',
      formula: 'DIVIDE(SUM(KM_PLACEHOLDER), SUM(VIAGENS_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'km/viagem',
      categoria: 'Produtividade',
      cor: '#0ea5e9',
      descricao: 'Média de KM rodados por cada viagem individual (considerando múltiplas viagens por registro)',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_KM, PH_VIAGENS],
    },
    {
      nome: 'Peso por KM Rodado',
      label: 'Peso/KM',
      formula: 'DIVIDE(SUM(PESO_PLACEHOLDER), SUM(KM_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'kg/km',
      categoria: 'Eficiência',
      cor: '#f97316',
      descricao: 'Quilogramas coletados por quilômetro rodado — eficiência de carga por deslocamento',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_PESO, PH_KM],
    },
    {
      nome: 'Velocidade Média Operacional',
      label: 'Vel. Média (km/h)',
      formula: 'DIVIDE(SUM(KM_PLACEHOLDER), SUM(HORA_FORA_PLACEHOLDER))',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'km/h',
      categoria: 'Eficiência',
      cor: '#3b82f6',
      descricao: 'Velocidade média geral — KM total dividido pelas horas fora da unidade',
      metaSugerida: null,
      tipoServico: TipoServico.COLETA_CAMINHAO,
      placeholders: [PH_KM, PH_HORA_FORA],
    },
  ];

  // ════════════════════════════════════════════════════════════════
  // NOVOS KPIs — VARRICAO
  // ════════════════════════════════════════════════════════════════

  const novosKpisVarricao: Partial<KpiUniversal>[] = [
    {
      nome: 'Registros de Varrição',
      label: 'Registros',
      formula: 'COUNT(*)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'registros',
      categoria: 'Geral',
      cor: '#64748b',
      descricao: 'Total de registros de varrição',
      metaSugerida: null,
      tipoServico: TipoServico.VARRICAO,
      placeholders: [],
    },
    {
      nome: 'Turnos de Varrição',
      label: 'Turnos Realizados',
      formula: 'COUNT(DISTINCT TURNO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'turnos',
      categoria: 'Operacional',
      cor: '#f59e0b',
      descricao: 'Quantidade de turnos distintos com varrição',
      metaSugerida: null,
      tipoServico: TipoServico.VARRICAO,
      placeholders: [PH_TURNO],
    },
    {
      nome: 'Bairros Varridos',
      label: 'Bairros Varridos',
      formula: 'COUNT(DISTINCT DISTRITO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'bairros',
      categoria: 'Cobertura',
      cor: '#a855f7',
      descricao: 'Quantidade de bairros distintos com varrição',
      metaSugerida: null,
      tipoServico: TipoServico.VARRICAO,
      placeholders: [PH_DISTRITO],
    },
  ];

  // ════════════════════════════════════════════════════════════════
  // NOVOS KPIs — PODA
  // ════════════════════════════════════════════════════════════════

  const novosKpisPoda: Partial<KpiUniversal>[] = [
    {
      nome: 'Turnos de Poda',
      label: 'Turnos Realizados',
      formula: 'COUNT(DISTINCT TURNO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'turnos',
      categoria: 'Operacional',
      cor: '#f59e0b',
      descricao: 'Quantidade de turnos distintos com atividades de poda',
      metaSugerida: null,
      tipoServico: TipoServico.PODA,
      placeholders: [PH_TURNO],
    },
    {
      nome: 'Distritos com Poda',
      label: 'Distritos Atendidos',
      formula: 'COUNT(DISTINCT DISTRITO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'distritos',
      categoria: 'Cobertura',
      cor: '#a855f7',
      descricao: 'Quantidade de distritos com atividades de poda',
      metaSugerida: null,
      tipoServico: TipoServico.PODA,
      placeholders: [PH_DISTRITO],
    },
    {
      nome: 'Média de KM por Registro',
      label: 'KM Médio/Registro',
      formula: 'AVG(KM_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'km',
      categoria: 'Operacional',
      cor: '#06b6d4',
      descricao: 'Média de KM rodados por registro de poda',
      metaSugerida: null,
      tipoServico: TipoServico.PODA,
      placeholders: [PH_KM],
    },
    {
      nome: 'Peso Médio por Registro',
      label: 'Peso Médio',
      formula: 'AVG(PESO_PLACEHOLDER)',
      agregacao: 'avg',
      formato: 'numero',
      unidade: 'kg',
      categoria: 'Operacional',
      cor: '#22c55e',
      descricao: 'Média de peso por registro (se aplicável)',
      metaSugerida: null,
      tipoServico: TipoServico.PODA,
      placeholders: [PH_PESO],
    },
  ];

  // ════════════════════════════════════════════════════════════════
  // NOVOS KPIs — REMOCAO
  // ════════════════════════════════════════════════════════════════

  const novosKpisRemocao: Partial<KpiUniversal>[] = [
    {
      nome: 'Peso Total Removido',
      label: 'Peso Total Removido',
      formula: 'SUM(PESO_PLACEHOLDER) / 1000',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'ton',
      categoria: 'Operacional',
      cor: '#f43f5e',
      descricao: 'Peso total removido em toneladas',
      metaSugerida: null,
      tipoServico: TipoServico.REMOCAO,
      placeholders: [PH_PESO],
    },
    {
      nome: 'KM Total Remoção',
      label: 'KM Rodados',
      formula: 'SUM(KM_PLACEHOLDER)',
      agregacao: 'sum',
      formato: 'numero',
      unidade: 'km',
      categoria: 'Operacional',
      cor: '#f97316',
      descricao: 'Total de KM rodados nas remoções',
      metaSugerida: null,
      tipoServico: TipoServico.REMOCAO,
      placeholders: [PH_KM],
    },
    {
      nome: 'Distritos Atendidos (Remoção)',
      label: 'Distritos',
      formula: 'COUNT(DISTINCT DISTRITO_PLACEHOLDER)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'distritos',
      categoria: 'Cobertura',
      cor: '#a855f7',
      descricao: 'Quantidade de distritos com remoções',
      metaSugerida: null,
      tipoServico: TipoServico.REMOCAO,
      placeholders: [PH_DISTRITO],
    },
  ];

  const PH_DATA_SAIDA: PlaceholderKpi = {
    nome: 'DATA_SAIDA',
    label: 'Coluna de Data',
    colunasCandidatas: ['DATA SAIDA', 'DATA', 'DATA DE SAIDA', 'DATA SAÍDA', 'DIA', 'DATA_BASE'],
  };

  // ════════════════════════════════════════════════════════════════
  // NOVOS KPIs — GERAL (disponível para todos os tipos)
  // ════════════════════════════════════════════════════════════════

  const novosKpisGerais: Partial<KpiUniversal>[] = [
    {
      nome: 'Média de Registros por Dia',
      label: 'Média Registros/Dia',
      formula: 'DIVIDE(COUNT(*), COUNT(DISTINCT DATA_SAIDA))',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'reg/dia',
      categoria: 'Operacional',
      cor: '#6366f1',
      descricao: 'Média de registros por dia no período analisado',
      metaSugerida: null,
      tipoServico: TipoServico.GERAL,
      placeholders: [PH_DATA_SAIDA],
    },
    {
      nome: 'Dias com Atividades',
      label: 'Dias com Atividades',
      formula: 'COUNT(DISTINCT DATA_SAIDA)',
      agregacao: 'count',
      formato: 'numero',
      unidade: 'dias',
      categoria: 'Operacional',
      cor: '#8b5cf6',
      descricao: 'Quantidade de dias com registros no período',
      metaSugerida: null,
      tipoServico: TipoServico.GERAL,
      placeholders: [PH_DATA_SAIDA],
    },
  ];

  // ════════════════════════════════════════════════════════════════
  // SALVAR (apenas os que não existem)
  // ════════════════════════════════════════════════════════════════

  const todosNovos = [
    ...novosKpisColeta,
    ...novosKpisVarricao,
    ...novosKpisPoda,
    ...novosKpisRemocao,
    ...novosKpisGerais,
  ];

  let criados = 0;
  for (const kpiData of todosNovos) {
    const existente = await repo.findOne({
      where: {
        nome: kpiData.nome,
        tipoServico: kpiData.tipoServico,
      },
    });
    if (!existente) {
      const kpi = new KpiUniversal();
      Object.assign(kpi, kpiData);
      kpi.isPersonalizado = false;
      await repo.save(kpi);
      criados++;
    }
  }

  console.log(`[seedKpisUniversaisExtra] ✅ ${criados} novos KPIs criados com sucesso!`);
}

// Executar diretamente (apenas quando chamado como script)
if (require.main === module) {
  (async function main() {
    try {
      console.log('📦 Conectando ao banco de dados...');
      await AppDataSource.initialize();
      console.log('✅ Conectado!');
      await seedKpisUniversaisExtra();
      await AppDataSource.destroy();
      console.log('🔒 Conexão encerrada. Seed concluído!');
      process.exit(0);
    } catch (err) {
      console.error('[seedKpisUniversaisExtra] Erro:', err);
      process.exit(1);
    }
  })();
}
