import { useState } from 'react';
import { FiSend, FiX, FiCheck, FiAlertCircle, FiLoader } from 'react-icons/fi';
import whatsAppService from '../services/whatsappService';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Caminho do PDF no servidor (alternativa ao html) */
  pdfPath?: string;
  /** HTML do dashboard para gerar PDF automaticamente (alternativa ao pdfPath) */
  html?: string;
  /** Nome do arquivo PDF (usado com html) */
  pdfNome?: string;
}

export default function WhatsAppModal({ isOpen, onClose, pdfPath, html, pdfNome }: WhatsAppModalProps) {
  const [telefones, setTelefones] = useState('');
  const [mensagem, setMensagem] = useState('📊 Dashboard de Coleta — Atualização automática');
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{
    tipo: 'sucesso' | 'erro';
    texto: string;
  } | null>(null);

  if (!isOpen) return null;

  const validarTelefones = (texto: string): string[] => {
    return texto
      .split(/[,;\n\r]+/)
      .map(t => t.replace(/\D/g, '').trim())
      .filter(t => t.length >= 10 && t.length <= 13);
  };

  const handleEnviar = async () => {
    const numeros = validarTelefones(telefones);

    if (numeros.length === 0) {
      setResultado({
        tipo: 'erro',
        texto: 'Nenhum telefone válido encontrado. Use formato: 5511999999999',
      });
      return;
    }

    setEnviando(true);
    setResultado(null);

    try {
      let res;

      if (html) {
        // Usa o endpoint combinado: gera PDF + envia via WhatsApp
        const token = localStorage.getItem('@abastecimento:token');
        const response = await fetch('/api/whatsapp/enviar-com-html', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            telefones: numeros,
            html,
            mensagem: mensagem || undefined,
          }),
        });

        res = await response.json();

        if (!response.ok) {
          const errorBody = res?.erro || `Erro ${response.status}: ${response.statusText}`;
          throw new Error(errorBody);
        }
      } else if (pdfPath) {
        // Usa o endpoint de PDF já existente
        res = await whatsAppService.enviarDashboard({
          telefones: numeros,
          pdfPath,
          mensagem: mensagem || undefined,
        });
      } else {
        setResultado({
          tipo: 'erro',
          texto: 'Nenhum dashboard disponível para envio. Abra um dashboard primeiro.',
        });
        setEnviando(false);
        return;
      }

      setResultado({
        tipo: res.falhas === 0 ? 'sucesso' : 'erro',
        texto: res.mensagem || `Enviado para ${res.sucessos} número(s)`,
      });
    } catch (err: any) {
      setResultado({
        tipo: 'erro',
        texto: err.message || 'Erro ao enviar WhatsApp',
      });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          width: '480px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#25D366',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                color: 'white',
              }}
            >
              📱
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                Enviar via WhatsApp
              </h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                {html ? '📄 Dashboard será gerado e enviado como PDF' : 'O dashboard será enviado como PDF'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              padding: '4px',
            }}
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Telefones */}
        <div style={{ marginBottom: '14px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '4px',
            }}
          >
            Números de WhatsApp
          </label>
          <textarea
            value={telefones}
            onChange={e => setTelefones(e.target.value)}
            placeholder="5511999999999, 5511988888888"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>
            Separe por vírgula, ponto e vírgula ou linha. Formato: DDI + DDD + número (ex: 5511999999999)
          </p>
          {telefones && (
            <p style={{ fontSize: '11px', color: '#22c55e', margin: '4px 0 0', fontWeight: 600 }}>
              {validarTelefones(telefones).length} número(s) válido(s) identificado(s)
            </p>
          )}
        </div>

        {/* Mensagem */}
        <div style={{ marginBottom: '18px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#334155',
              marginBottom: '4px',
            }}
          >
            Mensagem (opcional)
          </label>
          <input
            type="text"
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            placeholder="Mensagem de legenda para o PDF"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              fontSize: '13px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Resultado */}
        {resultado && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 14px',
              borderRadius: '8px',
              marginBottom: '14px',
              fontSize: '13px',
              fontWeight: 500,
              background: resultado.tipo === 'sucesso' ? '#f0fdf4' : '#fef2f2',
              color: resultado.tipo === 'sucesso' ? '#15803d' : '#dc2626',
              border: `1px solid ${resultado.tipo === 'sucesso' ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {resultado.tipo === 'sucesso' ? <FiCheck size={16} /> : <FiAlertCircle size={16} />}
            {resultado.texto}
          </div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              background: 'white',
              color: '#475569',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleEnviar}
            disabled={enviando || !telefones.trim()}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              background: enviando ? '#94a3b8' : '#25D366',
              color: 'white',
              fontSize: '13px',
              fontWeight: 600,
              cursor: enviando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
          >
            {enviando ? (
              <FiLoader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <FiSend size={16} />
            )}
            {enviando ? 'Enviando...' : `Enviar para ${validarTelefones(telefones).length} número(s)`}
          </button>
        </div>

        {/* Estilo para animação do loader */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
