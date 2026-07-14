import axios, { AxiosError, AxiosInstance } from 'axios';

export interface WuzapiSessionStatus {
  connected?: boolean;
  loggedIn?: boolean;
  jid?: string;
  webhook?: string;
  events?: string;
  Connected?: boolean;
  LoggedIn?: boolean;
  JID?: string;
}

export interface WuzapiSendResult {
  Details?: string;
  Id?: string;
  Timestamp?: number | string;
}

/**
 * Cliente HTTP para WuzAPI (whatsmeow).
 * Auth de instância: header `token` (não Authorization).
 */
export class WuzapiService {
  private readonly client: AxiosInstance;
  private readonly token: string;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = (process.env.WUZAPI_URL || 'http://localhost:8080').replace(/\/$/, '');
    this.token = process.env.WUZAPI_TOKEN || '';
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: parseInt(process.env.WUZAPI_TIMEOUT_MS || '120000', 10),
      headers: {
        'Content-Type': 'application/json',
        token: this.token,
      },
    });
  }

  get isConfigured(): boolean {
    return !!(this.baseUrl && this.token);
  }

  get webhookSecret(): string {
    return process.env.WUZAPI_WEBHOOK_SECRET || '';
  }

  /** URL pública do webhook do Sistemma (para a WuzAPI chamar). */
  get webhookUrl(): string {
    return (
      process.env.WUZAPI_WEBHOOK_URL
      || process.env.WEBHOOK_URL
      || 'http://host.docker.internal:3200/api/wuzapi/webhook'
    );
  }

  private unwrap<T>(data: any): T {
    if (data && typeof data === 'object' && 'data' in data && data.success !== undefined) {
      return data.data as T;
    }
    return data as T;
  }

  private erroMsg(prefixo: string, error: unknown): Error {
    if (error instanceof AxiosError) {
      const detalhe =
        (error.response?.data as { error?: string; message?: string })?.error
        || (error.response?.data as { error?: string; message?: string })?.message
        || error.message;
      return new Error(`${prefixo}: ${detalhe}`);
    }
    if (error instanceof Error) return new Error(`${prefixo}: ${error.message}`);
    return new Error(prefixo);
  }

  async getStatus(): Promise<WuzapiSessionStatus & { connected: boolean; loggedIn: boolean }> {
    const { data } = await this.client.get('/session/status');
    const raw = this.unwrap<WuzapiSessionStatus>(data) || {};
    return {
      ...raw,
      connected: !!(raw.connected ?? raw.Connected),
      loggedIn: !!(raw.loggedIn ?? raw.LoggedIn),
      jid: raw.jid || raw.JID || '',
    };
  }

  async getQRCode(): Promise<{ qrCode: string }> {
    try {
      const { data } = await this.client.get('/session/qr');
      const unwrapped = this.unwrap<{ QRCode?: string; qrcode?: string; qrCode?: string }>(data) || {};
      let qrCode = unwrapped.QRCode || unwrapped.qrcode || unwrapped.qrCode || '';
      if (!qrCode) {
        // Fallback: alguns builds da WuzAPI colocam o QR no status
        const st = await this.getStatus();
        qrCode = (st as any).qrcode || (st as any).QRCode || '';
      }
      return { qrCode };
    } catch (error: unknown) {
      try {
        const st = await this.getStatus();
        const qrCode = (st as any).qrcode || (st as any).QRCode || '';
        if (qrCode) return { qrCode };
      } catch { /* ignore */ }
      throw this.erroMsg('Falha ao obter QR code', error);
    }
  }

  /**
   * Garante instância na WuzAPI (admin) e inicia sessão + webhook.
   */
  async conectarSessao(): Promise<{ connected: boolean; jid: string; message: string }> {
    if (!this.isConfigured) {
      throw new Error('WUZAPI_URL e WUZAPI_TOKEN não configurados');
    }

    await this.criarOuObterInstancia(
      process.env.WUZAPI_INSTANCE_NAME || 'Sistemma',
      this.token,
    );

    let jid = '';
    try {
      const { data } = await this.client.post('/session/connect', {
        Subscribe: ['Message', 'Connected', 'QR'],
        Immediate: true,
      });
      const raw = this.unwrap<any>(data) || {};
      jid = raw.jid || raw.JID || '';
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.toLowerCase().includes('already connected') && !msg.toLowerCase().includes('connected')) {
        throw this.erroMsg('Falha ao conectar sessão', error);
      }
    }

    try {
      await this.configurarWebhook(this.webhookUrl, ['Message', 'Connected', 'QR']);
    } catch (error: unknown) {
      console.warn('[Wuzapi] Webhook não configurado:', (error as Error)?.message || error);
    }

    return {
      connected: true,
      jid,
      message: 'Conexão iniciada. Escaneie o QR code no WhatsApp.',
    };
  }

  async criarOuObterInstancia(nome: string, token: string): Promise<void> {
    const adminToken = process.env.WUZAPI_ADMIN_TOKEN;
    if (!adminToken) {
      // Sem admin token: assume que a instância já existe
      return;
    }

    const adminHeaders = { Authorization: adminToken };
    try {
      const response = await this.client.get('/admin/users', { headers: adminHeaders });
      const usuarios: Array<{ token?: string }> = response.data?.data ?? response.data ?? [];
      if (Array.isArray(usuarios) && usuarios.some((u) => u.token === token)) return;
    } catch {
      /* tenta criar mesmo assim */
    }

    try {
      await this.client.post(
        '/admin/users',
        {
          name: nome,
          token,
          webhook: this.webhookUrl,
          events: 'Message,Connected,QR',
        },
        { headers: adminHeaders },
      );
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 409) return;
      throw this.erroMsg('Falha ao criar instância WuzAPI', error);
    }
  }

  async configurarWebhook(url: string, events: string[] = ['Message']): Promise<void> {
    try {
      await this.client.post('/webhook', {
        webhookurl: url,
        events,
      });
    } catch (error: unknown) {
      throw this.erroMsg('Falha ao configurar webhook', error);
    }
  }

  async enviarTexto(destino: string, body: string): Promise<WuzapiSendResult> {
    const { data } = await this.client.post('/chat/send/text', {
      Phone: destino,
      Body: body,
    });
    return this.unwrap(data);
  }

  async enviarDocumento(
    destino: string,
    fileName: string,
    pdfBuffer: Buffer,
    caption?: string,
  ): Promise<WuzapiSendResult> {
    const b64 = pdfBuffer.toString('base64');
    const { data } = await this.client.post('/chat/send/document', {
      Phone: destino,
      FileName: fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      Document: `data:application/octet-stream;base64,${b64}`,
      MimeType: 'application/pdf',
      Caption: caption || '',
    });
    return this.unwrap(data);
  }

  async downloadDocument(payload: {
    Url: string;
    Mimetype?: string;
    MediaKey: string;
    FileSHA256: string;
    FileEncSHA256?: string;
    FileLength: number;
  }): Promise<{ data: string; mimetype?: string }> {
    const { data } = await this.client.post('/chat/downloaddocument', payload);
    const unwrapped = this.unwrap<{ Data?: string; data?: string; Mimetype?: string; mimetype?: string }>(data);
    return {
      data: unwrapped.Data || unwrapped.data || '',
      mimetype: unwrapped.Mimetype || unwrapped.mimetype,
    };
  }

  /**
   * Lista grupos WhatsApp da conta conectada (GET /group/list).
   */
  async listarGruposWhatsApp(): Promise<Array<{ jid: string; nome: string; participantes: number }>> {
    try {
      const { data } = await this.client.get('/group/list');
      const unwrapped = this.unwrap<{ Groups?: any[]; groups?: any[] }>(data) || {};
      const groups = unwrapped.Groups || unwrapped.groups || (Array.isArray(unwrapped) ? unwrapped : []);
      if (!Array.isArray(groups)) return [];

      return groups
        .map((g: any) => {
          const jid = String(g.JID || g.jid || g.Id || g.id || '');
          const nome = String(g.Name || g.name || g.Subject || g.subject || jid);
          const participantes = Array.isArray(g.Participants || g.participants)
            ? (g.Participants || g.participants).length
            : Number(g.ParticipantCount || 0);
          return { jid, nome, participantes };
        })
        .filter((g) => g.jid.includes('@g.us'))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    } catch (error: unknown) {
      throw this.erroMsg('Falha ao listar grupos do WhatsApp', error);
    }
  }
}

export const wuzapiService = new WuzapiService();
export default wuzapiService;
