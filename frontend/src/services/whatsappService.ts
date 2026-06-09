import api from './api';

export interface EnvioWhatsAppParams {
  telefones: string[];
  pdfPath: string;
  mensagem?: string;
}

export interface EnvioWhatsAppResult {
  sucesso: boolean;
  mensagem: string;
  sucessos: number;
  falhas: number;
  resultados: Array<{
    sucesso: boolean;
    mensagemId?: string;
    erro?: string;
    telefone?: string;
  }>;
}

export interface StatusWhatsApp {
  configurado: boolean;
  tokenExiste: boolean;
  phoneIdExiste: boolean;
  mensagem: string;
}

class WhatsAppService {
  private baseUrl = '/api/whatsapp';

  /**
   * Verifica se o WhatsApp está configurado no backend
   */
  async status(): Promise<StatusWhatsApp> {
    const token = localStorage.getItem('@abastecimento:token');
    const res = await fetch(`${this.baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error('Erro ao verificar status do WhatsApp');
    }
    return res.json();
  }

  /**
   * Envia dashboard PDF via WhatsApp para um ou mais números
   */
  async enviarDashboard(params: EnvioWhatsAppParams): Promise<EnvioWhatsAppResult> {
    const token = localStorage.getItem('@abastecimento:token');
    const res = await fetch(`${this.baseUrl}/enviar-dashboard`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.erro || 'Erro ao enviar WhatsApp');
    }

    return data;
  }
}

export const whatsAppService = new WhatsAppService();
export default whatsAppService;
