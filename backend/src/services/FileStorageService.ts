import * as Minio from 'minio';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

/**
 * Serviço de armazenamento de arquivos usando MinIO (S3-compatible)
 * Responsável por salvar e recuperar imagens de abastecimento
 */
class FileStorageService {
  private client: Minio.Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const endPoint = process.env.MINIO_ENDPOINT || 'localhost';
    const port = parseInt(process.env.MINIO_PORT || '9000');
    const accessKey = process.env.MINIO_ACCESS_KEY || 'minioadmin';
    const secretKey = process.env.MINIO_SECRET_KEY || 'minioadmin';
    const useSSL = process.env.MINIO_USE_SSL === 'true';

    this.bucket = process.env.MINIO_BUCKET || 'abastecimentos';
    this.publicUrl = process.env.MINIO_PUBLIC_URL || `http://${endPoint}:${port}`;

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    // Configura bucket com política pública (acesso de leitura anônimo)
    this.inicializarBucket();
  }

  private async inicializarBucket(): Promise<void> {
    try {
      const existe = await this.client.bucketExists(this.bucket);
      if (!existe) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        console.log(`[MinIO] Bucket "${this.bucket}" criado.`);
      }
      // Define política pública para leitura anônima
      const politica = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      });
      await this.client.setBucketPolicy(this.bucket, politica);
      console.log(`[MinIO] Política pública aplicada ao bucket "${this.bucket}".`);
    } catch (error) {
      console.warn('[MinIO] Erro ao inicializar bucket (pode já existir):', error);
    }
  }

  /**
   * Faz upload de uma imagem base64 para o MinIO
   * @param imagemBase64 - Imagem em formato base64 (pode incluir data:image/... prefix)
   * @returns URL pública da imagem salva
   */
  async uploadImagem(imagemBase64: string): Promise<string> {
    // Extrair o base64 puro (remover prefixo data:image/...;base64,)
    const base64Data = imagemBase64.includes(',')
      ? imagemBase64.split(',')[1]
      : imagemBase64;

    // Detectar tipo MIME pelo prefixo
    let mimeType = 'image/jpeg'; // padrão
    if (imagemBase64.startsWith('data:image/png')) {
      mimeType = 'image/png';
    } else if (imagemBase64.startsWith('data:image/webp')) {
      mimeType = 'image/webp';
    } else if (imagemBase64.startsWith('data:image/gif')) {
      mimeType = 'image/gif';
    }

    // Determinar extensão
    const ext = mimeType.split('/')[1] || 'jpg';

    // Gerar nome único
    const filename = `abastecimentos/${uuidv4()}.${ext}`;

    // Converter base64 para buffer
    const buffer = Buffer.from(base64Data, 'base64');

    // Upload para o MinIO
    await this.client.putObject(this.bucket, filename, buffer, buffer.length, {
      'Content-Type': mimeType,
    });

    // Retornar URL pública (filename já inclui o prefixo abastecimentos/)
    return `${this.publicUrl}/${this.bucket}/${filename}`;
  }

  /**
   * Faz upload de um arquivo (buffer) para o MinIO
   * @param buffer - Conteúdo do arquivo em Buffer
   * @param nomeOriginal - Nome original do arquivo
   * @param mimeType - Tipo MIME do arquivo
   * @returns URL pública do arquivo salvo
   */
  async uploadArquivo(buffer: Buffer, nomeOriginal: string, mimeType: string): Promise<string> {
    const ext = path.extname(nomeOriginal) || '.bin';
    const filename = `planilhas/${uuidv4()}${ext}`;
    return this.uploadEmPath(filename, buffer, mimeType, nomeOriginal);
  }

  /** Grava (ou sobrescreve) um objeto num caminho estável do bucket. */
  async uploadEmPath(
    objectPath: string,
    buffer: Buffer,
    mimeType: string,
    nomeDownload?: string,
  ): Promise<string> {
    const pathNorm = String(objectPath || '')
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/\/{2,}/g, '/');
    if (!pathNorm) throw new Error('Caminho MinIO vazio');

    await this.client.putObject(this.bucket, pathNorm, buffer, buffer.length, {
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${nomeDownload || path.basename(pathNorm)}"`,
    });

    return `${this.publicUrl}/${this.bucket}/${pathNorm}`;
  }

  /** Extrai bucket + object path de uma URL pública MinIO. */
  private extrairObjectPath(url: string): { bucket: string; objectPath: string } | null {
    try {
      const urlObj = new URL(url);
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const bucket = parts[0];
      const objectPath = parts.slice(1).join('/');
      if (!bucket || !objectPath) return null;
      return { bucket, objectPath };
    } catch {
      return null;
    }
  }

  /**
   * Baixa um arquivo do MinIO a partir da URL pública salva em PlanilhaUpload.urlDownload.
   */
  async downloadArquivo(url: string): Promise<Buffer> {
    const parsed = this.extrairObjectPath(url);
    if (!parsed) {
      throw new Error('URL de download inválida');
    }
    const bucket = parsed.bucket === this.bucket ? this.bucket : parsed.bucket;
    const stream = await this.client.getObject(bucket, parsed.objectPath);
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      stream.on('end', () => resolve());
      stream.on('error', reject);
    });
    return Buffer.concat(chunks);
  }

  /**
   * Remove uma imagem do MinIO
   * @param url - URL completa da imagem
   */
  async removerImagem(url: string): Promise<void> {
    try {
      const parsed = this.extrairObjectPath(url);
      if (parsed && parsed.bucket === this.bucket && parsed.objectPath) {
        await this.client.removeObject(this.bucket, parsed.objectPath);
      }
    } catch (error) {
      console.warn('[FileStorageService] Erro ao remover imagem:', error);
    }
  }
}

export default new FileStorageService();
