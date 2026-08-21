import servicoService from '../services/servicoService';
import {
  calcularCicloMensalContrato,
  inferirMesReferenciaAtual,
  inferirMesReferenciaDeData,
  montarJanelasComparativoCiclo,
} from './periodoCicloContrato';
import { agruparCicloPorDiaFromApi } from './relatorioDiario';
import { unidadeOperacionalDoTipo } from './unidadeServico';
import { resumirCicloOperacao, type ModoMelhoriaOperacao } from './melhoriaCicloOperacao';
import type { RelatorioMelhoriaCicloOpts, ItemOmitidoMelhoriaCiclo } from './gerarHtmlRelatorioMelhoriaCicloOperacao';

export interface ServicoMelhoriaLote {
  id: string;
  servicoNome: string;
  tipoServico?: string;
  contratoId: string;
  contratoNome: string;
  ultimoUpload: string | null;
  totalRegistros: number;
}

function isoLocalDeTimestamp(data: string | null): string | null {
  if (!data) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(data) && data.length === 10) return data;
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function labelTipoServico(tipo?: string): string {
  const u = unidadeOperacionalDoTipo(tipo);
  if (u.modo === 'rocada') return 'Roçada';
  if (u.semViagemColeta) return 'Serviço por unidade';
  return 'Coleta com caminhão';
}

function modoDoTipo(tipo?: string): ModoMelhoriaOperacao {
  return unidadeOperacionalDoTipo(tipo).semViagemColeta ? 'unidade' : 'coleta';
}

export async function montarItensMelhoriaCicloTodos(opts: {
  servicos: ServicoMelhoriaLote[];
  diaInicioPorContrato: Record<string, number>;
  onProgresso?: (feito: number, total: number, nome: string) => void;
}): Promise<{
  itens: RelatorioMelhoriaCicloOpts[];
  omitidos: ItemOmitidoMelhoriaCiclo[];
}> {
  const itens: RelatorioMelhoriaCicloOpts[] = [];
  const omitidos: ItemOmitidoMelhoriaCiclo[] = [];
  const servicos = [...opts.servicos].sort((a, b) => {
    const c = a.contratoNome.localeCompare(b.contratoNome, 'pt-BR');
    if (c !== 0) return c;
    return a.servicoNome.localeCompare(b.servicoNome, 'pt-BR');
  });
  const total = servicos.length;

  for (let i = 0; i < servicos.length; i++) {
    const s = servicos[i];
    opts.onProgresso?.(i + 1, total, s.servicoNome);

    if (s.totalRegistros <= 0) {
      omitidos.push({
        contratoNome: s.contratoNome,
        servicoNome: s.servicoNome,
        motivo: 'sem registros importados',
      });
      continue;
    }

    const diaInicio = opts.diaInicioPorContrato[s.contratoId] || 1;
    const dataRef = isoLocalDeTimestamp(s.ultimoUpload);
    const ref = dataRef
      ? inferirMesReferenciaDeData(dataRef, diaInicio)
      : inferirMesReferenciaAtual(diaInicio);
    const cicloCompleto = calcularCicloMensalContrato(ref.ano, ref.mes, diaInicio);
    const janelas = montarJanelasComparativoCiclo(cicloCompleto);
    const cicloAtual = janelas.atual;
    const cicloAnterior = janelas.anterior;
    const modo = modoDoTipo(s.tipoServico);
    const unidade = unidadeOperacionalDoTipo(s.tipoServico);

    try {
      const [resumoAtu, resumoAnt] = await Promise.all([
        servicoService.getResumoCicloPorDia(
          s.contratoId,
          s.id,
          { dataInicio: cicloAtual.dataInicio, dataFim: cicloAtual.dataFim },
          { abortKey: `pdf-melhoria-lote:${s.id}:atual` },
        ),
        servicoService.getResumoCicloPorDia(
          s.contratoId,
          s.id,
          { dataInicio: cicloAnterior.dataInicio, dataFim: cicloAnterior.dataFim },
          { abortKey: `pdf-melhoria-lote:${s.id}:anterior` },
        ),
      ]);

      const agrupar = (diasApi: typeof resumoAtu.dias, ciclo: typeof cicloAtual) => (
        agruparCicloPorDiaFromApi(
          diasApi || [],
          ciclo.dataInicio,
          ciclo.dataFim,
          0,
          undefined,
          undefined,
          undefined,
          undefined,
          {
            modo: unidade.modo,
            valorM2: null,
            tipoServico: s.tipoServico,
          },
        )
      );

      const relAtu = agrupar(resumoAtu.dias || [], cicloAtual);
      const relAnt = agrupar(resumoAnt.dias || [], cicloAnterior);
      const totAtu = resumirCicloOperacao(relAtu.dias, modo);
      if (totAtu.diasOperados <= 0) {
        omitidos.push({
          contratoNome: s.contratoNome,
          servicoNome: s.servicoNome,
          motivo: `sem operação no ciclo ${cicloAtual.label}`,
        });
        continue;
      }

      itens.push({
        contratoNome: s.contratoNome,
        servicoNome: s.servicoNome,
        tipoServicoLabel: labelTipoServico(s.tipoServico),
        cicloAnterior,
        cicloAtual,
        diasAnterior: relAnt.dias,
        diasAtual: relAtu.dias,
        modo,
        cicloEmAndamento: janelas.emAndamento,
        diasCicloCompleto: janelas.diasCicloCompleto,
      });
    } catch {
      omitidos.push({
        contratoNome: s.contratoNome,
        servicoNome: s.servicoNome,
        motivo: 'erro ao carregar o ciclo',
      });
    }
  }

  return { itens, omitidos };
}
