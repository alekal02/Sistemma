import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { FiDownload, FiExternalLink } from 'react-icons/fi';
import { useToast } from '../contexts/ToastContext';
import pdfService from '../services/pdfService';
import type { AnalisePesoColeta, CompararPorTipoServico } from '../services/servicoService';
import {
  CORES_SERVICO_PESO,
  METRICAS_PESO,
  SECAO_LABEL_PESO,
  formatarCelulaMetricaPeso,
  type LinhaMetricaPeso,
  type SecaoPeso,
} from '../utils/analisePesoComparativoMetricas';
import { gerarHtmlAnalisePesoComparativo } from '../utils/gerarHtmlAnalisePesoComparativo';
import { gerarNomePdfAnalisePesoComparativo } from '../utils/gerarNomePdf';

export type QuinzenaPdf = 1 | 2;

interface Props {
  servicos: CompararPorTipoServico[];
  tipoServicoLabel?: string;
  onAbrirServico?: (servico: CompararPorTipoServico) => void;
  /**
   * Busca comparação já recortada para a quinzena do ciclo atual.
   * Retorna serviços + rótulo do período para o PDF.
   */
  onBuscarQuinzena?: (quinzena: QuinzenaPdf) => Promise<{
    servicos: CompararPorTipoServico[];
    periodoLabel: string;
  } | null>;
}

function CelulaMetrica({ linha, analise }: { linha: LinhaMetricaPeso; analise: AnalisePesoColeta }) {
  const celula = formatarCelulaMetricaPeso(linha, analise);

  if (celula.pct && celula.pctCor) {
    return (
      <div className="vg-peso-comp-faixa">
        <span className="vg-peso-comp-qtd">{celula.texto}</span>
        <span className={`vg-peso-comp-pct ${celula.pctCor}`}>{celula.pct}</span>
      </div>
    );
  }

  if (linha.tipo === 'texto') {
    return <span className="vg-peso-comp-texto">{celula.texto}</span>;
  }

  return <span>{celula.texto}</span>;
}

export default function AnalisePesoPainel({
  servicos,
  tipoServicoLabel,
  onAbrirServico,
  onBuscarQuinzena,
}: Props) {
  const { adicionarToast } = useToast();
  const [exportando, setExportando] = useState<'ciclo' | 1 | 2 | null>(null);
  const comDados = servicos.filter((s) => s.analisePeso);
  const labelTipo = tipoServicoLabel || 'Coleta com caminhão';

  const baixarPdf = useCallback(async (
    lista: CompararPorTipoServico[],
    opts?: { periodoLabel?: string; sufixoArquivo?: string },
  ) => {
    const comPeso = lista.filter((s) => s.analisePeso);
    if (comPeso.length === 0) {
      adicionarToast('Nenhum dado de peso para o período selecionado', 'warning');
      return;
    }
    const html = gerarHtmlAnalisePesoComparativo({
      servicos: comPeso,
      tipoServicoLabel: labelTipo,
      periodoLabel: opts?.periodoLabel,
    });
    const nomeArquivo = gerarNomePdfAnalisePesoComparativo({
      tipoServico: labelTipo,
      sufixoPeriodo: opts?.sufixoArquivo,
    });
    await pdfService.gerarEBaixar(html, nomeArquivo, 'default', false);
  }, [adicionarToast, labelTipo]);

  const exportarPdfCiclo = useCallback(async () => {
    if (comDados.length === 0) return;
    setExportando('ciclo');
    try {
      await baixarPdf(comDados);
      adicionarToast('Comparativo de análise de peso exportado em PDF', 'success');
    } catch (err) {
      console.error('Erro PDF análise de peso:', err);
      adicionarToast('Erro ao gerar PDF da análise de peso', 'error');
    } finally {
      setExportando(null);
    }
  }, [adicionarToast, baixarPdf, comDados]);

  const exportarPdfQuinzena = useCallback(async (quinzena: QuinzenaPdf) => {
    if (!onBuscarQuinzena) return;
    setExportando(quinzena);
    try {
      const res = await onBuscarQuinzena(quinzena);
      if (!res) {
        adicionarToast(
          quinzena === 2
            ? 'Não há 2ª quinzena neste período (ciclo com 15 dias ou menos)'
            : 'Não foi possível montar o período da quinzena',
          'warning',
        );
        return;
      }
      await baixarPdf(res.servicos, {
        periodoLabel: res.periodoLabel,
        sufixoArquivo: quinzena === 1 ? '1a_Quinzena' : '2a_Quinzena',
      });
      adicionarToast(`PDF da ${quinzena === 1 ? '1ª' : '2ª'} quinzena exportado`, 'success');
    } catch (err) {
      console.error('Erro PDF quinzena análise de peso:', err);
      adicionarToast('Erro ao gerar PDF da quinzena', 'error');
    } finally {
      setExportando(null);
    }
  }, [adicionarToast, baixarPdf, onBuscarQuinzena]);

  if (comDados.length === 0) {
    if (servicos.length === 0) return null;
    return (
      <section className="vg-peso-painel vg-peso-painel-vazio" aria-label="Comparativo de análise de peso">
        <div className="vg-peso-painel-header">
          <div className="vg-peso-painel-header-text">
            <h4 className="vg-peso-painel-titulo">Comparativo de análise de peso</h4>
            <span className="vg-peso-painel-sub">{labelTipo}</span>
          </div>
        </div>
        <p className="vg-peso-painel-vazio-msg">
          Nenhum serviço retornou métricas de peso para o período selecionado.
          Confirme se a planilha tem coluna <strong>PESO TOTAL</strong> (ou pesos parciais) e viagens válidas,
          e se o <strong>backend está na versão mais recente</strong> (imagem Docker atualizada no servidor).
        </p>
      </section>
    );
  }

  const ocupado = exportando !== null;

  return (
    <section className="vg-peso-painel" aria-label="Comparativo de análise de peso">
      <div className="vg-peso-painel-header">
        <div className="vg-peso-painel-header-text">
          <h4 className="vg-peso-painel-titulo">Comparativo de análise de peso</h4>
          <span className="vg-peso-painel-sub">
            {labelTipo} — {comDados.length} contrato{comDados.length > 1 ? 's' : ''} / serviço{comDados.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="vg-peso-painel-acoes">
          <button
            type="button"
            className="vg-peso-painel-export"
            onClick={exportarPdfCiclo}
            disabled={ocupado}
            title="Exportar PDF do ciclo/período atual"
          >
            <FiDownload size={14} />
            {exportando === 'ciclo' ? 'Gerando...' : 'PDF Ciclo'}
          </button>
          {onBuscarQuinzena && (
            <>
              <button
                type="button"
                className="vg-peso-painel-export vg-peso-painel-export-quinzena"
                onClick={() => exportarPdfQuinzena(1)}
                disabled={ocupado}
                title="PDF comparativo da 1ª quinzena (primeiros 15 dias do ciclo)"
              >
                <FiDownload size={14} />
                {exportando === 1 ? 'Gerando...' : 'PDF 1ª Quinzena'}
              </button>
              <button
                type="button"
                className="vg-peso-painel-export vg-peso-painel-export-quinzena"
                onClick={() => exportarPdfQuinzena(2)}
                disabled={ocupado}
                title="PDF comparativo da 2ª quinzena (dias 16 até o fim do ciclo)"
              >
                <FiDownload size={14} />
                {exportando === 2 ? 'Gerando...' : 'PDF 2ª Quinzena'}
              </button>
            </>
          )}
        </div>
      </div>

      <p className="vg-peso-densidade-hint">
        A <strong>densidade (kg/L)</strong> é definida no contrato por tipo de caminhão
        (com fallback da densidade padrão) e usada no peso ideal (volume × densidade).
        Após alterar no contrato, clique em <strong>Atualizar</strong> nesta comparação.
        Use <strong>PDF 1ª/2ª Quinzena</strong> para o comparativo de 15 em 15 dias (reunião).
      </p>

      <div className="vg-peso-comp-wrap">
        <table className="vg-peso-comp-tabela">
          <thead>
            <tr>
              <th className="vg-peso-comp-th-ind sticky-col">Indicador</th>
              {comDados.map((s, idx) => (
                <th
                  key={s.id}
                  className="vg-peso-comp-th-servico"
                  style={{ '--col-accent': CORES_SERVICO_PESO[idx % CORES_SERVICO_PESO.length] } as CSSProperties}
                >
                  <div className="vg-peso-comp-col-header">
                    <span className="vg-peso-comp-col-accent" aria-hidden />
                    <span className="vg-peso-comp-col-contrato">{s.contratoNome || '—'}</span>
                    {onAbrirServico ? (
                      <button
                        type="button"
                        className="vg-peso-comp-link"
                        onClick={() => onAbrirServico(s)}
                        title={`Abrir ${s.nome}`}
                      >
                        {s.nome}
                        <FiExternalLink size={11} />
                      </button>
                    ) : (
                      <span className="vg-peso-comp-nome">{s.nome}</span>
                    )}
                    <span className="vg-peso-comp-meta">
                      {s.totalRegistros.toLocaleString('pt-BR')} registros
                    </span>
                    {s.periodo && (
                      <span className="vg-peso-comp-periodo">{s.periodo.label}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              let secaoAtual: SecaoPeso | null = null;
              const rows: ReactNode[] = [];

              for (const linha of METRICAS_PESO) {
                if (linha.secao !== secaoAtual) {
                  secaoAtual = linha.secao;
                  rows.push(
                    <tr key={`sec-${linha.secao}`} className="vg-peso-comp-secao">
                      <td colSpan={comDados.length + 1}>{SECAO_LABEL_PESO[linha.secao]}</td>
                    </tr>,
                  );
                }

                rows.push(
                  <tr key={linha.label} className={`vg-peso-comp-row secao-${linha.secao}`}>
                    <th scope="row" className="vg-peso-comp-td-ind sticky-col">{linha.label}</th>
                    {comDados.map((s) => {
                      const analise = s.analisePeso!;
                      const celula = formatarCelulaMetricaPeso(linha, analise);
                      const extraClasse = celula.classe || '';
                      const faixaClasse = linha.tipo === 'faixa' ? ' celula-faixa' : '';
                      return (
                        <td
                          key={s.id}
                          className={`vg-peso-comp-td-valor${faixaClasse}${extraClasse ? ` ${extraClasse}` : ''}`}
                          title={celula.titulo}
                        >
                          <CelulaMetrica linha={linha} analise={analise} />
                        </td>
                      );
                    })}
                  </tr>,
                );
              }

              return rows;
            })()}
          </tbody>
        </table>
      </div>
    </section>
  );
}
