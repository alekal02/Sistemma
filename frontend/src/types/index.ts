/* ============================================
   TIPOS COMPARTILHADOS DO SISTEMA DE ABASTECIMENTO
   ============================================ */

/** Perfis de usuário */
export type UserRole = 'superadmin' | 'admin' | 'user';

/** Dados do usuário autenticado */
export interface UserData {
  id: string
  nome: string
  email: string
  role: UserRole
  ativo: boolean
  contractId?: string | null
  tenantDb?: string | null
  /** true se o usuário vê todos os contratos (mesmo após abrir uma unidade) */
  gestor?: boolean
}

/** Payload retornado pelo login/register */
export interface AuthResponse {
  token: string
  refreshToken?: string
  user: UserData
}

/** Dados de abastecimento */
export interface Abastecimento {
  id: string
  placa: string
  litragem: number
  valor: number
  dataAbastecimento: string
  horario: string
  imagemUrl?: string
  litragemExtraida?: number | null
  valorExtraido?: number | null
  statusExtracao?: string
  observacoes?: string
  criadoEm?: string
  usuarioCriadorId?: string
  usuarioCriador?: {
    id: string
    nome: string
    email: string
  }
}

/** Dados extraídos pela OCR */
export interface DadosExtraidosOCR {
  litragem: number | null
  valor: number | null
  confianca: number
  texto_raw: string
  erro_extracao?: string
}

/** Tipos de Serviço do sistema */
export type TipoServico =
  | 'coleta_caminhao'
  | 'rocadeira'
  | 'poda'
  | 'varricao'
  | 'pintura_meio_fio'
  | 'remocao'
  | 'capina'
  | 'geral';

export const TIPOS_SERVICO = {
  COLETA_CAMINHAO: 'coleta_caminhao',
  ROCADEIRA: 'rocadeira',
  PODA: 'poda',
  VARRICAO: 'varricao',
  PINTURA_MEIO_FIO: 'pintura_meio_fio',
  REMOCAO: 'remocao',
  CAPINA: 'capina',
  GERAL: 'geral',
} as const;

export const TIPOS_SERVICO_LABELS: Record<TipoServico, string> = {
  coleta_caminhao: '🚛 Coleta com Caminhão',
  rocadeira: '🌿 Roçadeira',
  poda: '✂️ Poda',
  varricao: '🧹 Varrição',
  pintura_meio_fio: '🎨 Pintura Meio-Fio',
  remocao: '🚛 Remoção',
  capina: '🌱 Capina',
  geral: '📋 Geral',
};

/** Metadados de cada tipo: colunas esperadas e descrição */
export const TIPOS_SERVICO_META: Record<TipoServico, { descricao: string; colunas: string[] }> = {
  coleta_caminhao: {
    descricao: 'Coleta de resíduos com roteiro de caminhão, motorista, peso, km e horários',
    colunas: ['PLACA', 'MOTORISTA', 'PESO TOTAL', 'KM TOTAL', 'TIPO CAMINHAO', 'HORA SAIDA', 'HORA CHEGADA'],
  },
  rocadeira: {
    descricao: 'Serviço de roçagem manual ou mecanizada com funcionários e equipamentos',
    colunas: ['FUNCIONARIO', 'AREA_ROCADA', 'HORAS', 'EQUIPAMENTO', 'BAIRRO'],
  },
  poda: {
    descricao: 'Poda de árvores, galhos e vegetação em vias públicas',
    colunas: ['EQUIPE', 'ARVORES_PODADAS', 'BAIRRO', 'ALTURA_MEDIA', 'HORAS'],
  },
  varricao: {
    descricao: 'Varrição manual de ruas, avenidas e espaços públicos',
    colunas: ['FUNCIONARIO', 'QUILOMETROS_VARRIDOS', 'HORAS', 'BAIRRO', 'TURNO'],
  },
  pintura_meio_fio: {
    descricao: 'Pintura de meio-fio e sarjetas com medição de comprimento e quantidade',
    colunas: ['DATA', 'BAIRRO', 'NOME', 'COMPRIMENTO', 'NÚMERO DE SARJETAS EXECUTADAS', 'COMPRIMENTO TOTAL'],
  },
  remocao: {
    descricao: 'Remoção de entulho, materiais e resíduos diversos',
    colunas: ['Dia', 'Setor', 'Avenida / Rua', 'Complemento', 'Descrição do serviço'],
  },
  capina: {
    descricao: 'Capina manual ou mecanizada de terrenos, vias e logradouros públicos',
    colunas: ['DATA', 'BAIRRO', 'Equipe', 'Funcionario', 'Metro Linear'],
  },
  geral: {
    descricao: 'Tipo genérico — usar quando nenhum tipo específico se aplicar',
    colunas: [],
  },
};

export const TIPOS_SERVICO_OPCOES = (Object.keys(TIPOS_SERVICO_LABELS) as TipoServico[]).map(v => ({
  value: v,
  label: TIPOS_SERVICO_LABELS[v],
}));

/** Interface Servico usada no frontend */
export interface ServicoItem {
  id: string;
  contract_id: string;
  nome: string;
  descricao: string | null;
  tipo: TipoServico;
  configDashboard: any | null;
  padraoPlanilha: any | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Filtros para o relatório */
export interface FiltrosRelatorio {
  placa?: string
  dataInicio?: string
  dataFim?: string
}

/** Dados de um caminhão */
export interface Caminhao {
  id: string
  modelo: string
  ano: number
  placa: string
  codigo: string
  criadoEm?: string
  atualizadoEm?: string
}

/** Estatísticas do dashboard do dia */
export interface DashboardDia {
  totalAbastecimentos: number
  totalLitros: number
  totalValor: number
  mediaPorAbastecimento: number
  quantidadeCaminhoes: number
  ultimosAbastecimentos: Abastecimento[]
}
