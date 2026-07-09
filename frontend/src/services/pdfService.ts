import api from './api';

export type MargemPdf = 'full' | 'default' | 'print';

const pdfService = {
  /** Gera PDF a partir de HTML — endpoint unificado */
  async gerarDeHtml(
    html: string,
    filename: string,
    margin: MargemPdf = 'default',
    useCache = false,
  ): Promise<Blob> {
    const { data } = await api.post<Blob>(
      '/pdf/generate',
      { html, filename, margin, useCache },
      { responseType: 'blob' },
    );
    return data;
  },

  /** Baixa o blob como arquivo no navegador */
  downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async gerarEBaixar(
    html: string,
    filename: string,
    margin: MargemPdf = 'default',
    useCache = false,
  ): Promise<void> {
    const blob = await this.gerarDeHtml(html, filename, margin, useCache);
    this.downloadBlob(blob, filename);
  },
};

export default pdfService;
