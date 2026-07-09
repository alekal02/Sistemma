import api from './api';

const qualidadeColetaService = {
  async analisarViagens(file: File, contractId?: string) {
    const formData = new FormData();
    formData.append('planilha', file);
    if (contractId) formData.append('contractId', contractId);
    const { data } = await api.post('/qualidade-coleta/analisar-viagens', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async preview(file: File, extra?: Record<string, string>) {
    const formData = new FormData();
    formData.append('planilha', file);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => formData.append(k, v));
    }
    const { data } = await api.post('/qualidade-coleta/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  async corrigir(payload: Record<string, unknown>) {
    const { data } = await api.post('/qualidade-coleta/corrigir', payload);
    return data;
  },
};

export default qualidadeColetaService;
