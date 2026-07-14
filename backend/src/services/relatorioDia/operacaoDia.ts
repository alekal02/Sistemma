/**
 * Port fiel de `frontend/src/utils/operacaoDia.ts` — partes usadas pelo PDF de operação.
 */
import { ehPlacaReserva } from '../../utils/placasReserva';
import { fmtNum } from './fmt';

export interface LinhaOperacaoGrupo {
  chave: string;
  registros: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  tonMediaViagem: number;
  kmMedioViagem: number;
}

export interface OperacaoDiaResumo {
  registros: number;
  viagens: number;
  toneladas: number;
  km: number;
  horas: number;
  caminhoes: number;
  coletores: number;
  motoristas: number;
  coletoresEquipe: number;
  tonMediaColeta: number;
  kmMedioViagem: number;
  tonKm: number;
  prodColetor: number;
}

export interface OperacaoDiaAnalise {
  resumo: OperacaoDiaResumo;
  porPlaca: LinhaOperacaoGrupo[];
  porTurno: LinhaOperacaoGrupo[];
  porRegional: LinhaOperacaoGrupo[];
  porMotorista: LinhaOperacaoGrupo[];
  porTipoCaminhao: LinhaOperacaoGrupo[];
  porDistrito: LinhaOperacaoGrupo[];
  registrosConsiderados: number;
}

export type SeveridadeInsight = 'critico' | 'atencao' | 'info';

export interface InsightOperacao {
  severidade: SeveridadeInsight;
  titulo: string;
  texto: string;
}

export interface LinhaEficienciaPlaca extends LinhaOperacaoGrupo {
  tonHora: number;
  pctMediaTonViag: number;
  status: 'bom' | 'medio' | 'ruim';
  ehReserva?: boolean;
}

/** Converte agregação SQL do backend no formato do painel/PDF do dia. */
export function analiseOperacaoDeAgregacaoSql(agg: {
  resumo: {
    registros: number;
    viagens: number;
    pesoTotalTon: number;
    kmTotal: number;
    horasProdutivas: number;
    placas: number;
    motoristas: number;
  };
  porMotorista: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
  porPlaca: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
  porDistrito: Array<{
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }>;
}): OperacaoDiaAnalise {
  const mapLinha = (l: {
    label: string; viagens: number; tonelagem: number; kmTotal: number;
    horasProdutivas: number; tonPorViagem: number; kmPorViagem: number;
  }): LinhaOperacaoGrupo => ({
    chave: l.label,
    registros: l.viagens,
    viagens: l.viagens,
    toneladas: l.tonelagem,
    km: l.kmTotal,
    horas: l.horasProdutivas,
    tonMediaViagem: l.tonPorViagem,
    kmMedioViagem: l.kmPorViagem,
  });

  const r = agg.resumo;
  const tonMedia = r.viagens > 0 ? r.pesoTotalTon / r.viagens : 0;
  const kmMedio = r.viagens > 0 ? r.kmTotal / r.viagens : 0;
  const tonKm = r.kmTotal > 0 ? r.pesoTotalTon / r.kmTotal : 0;
  const prodColetor = r.placas > 0 ? r.pesoTotalTon / r.placas : 0;

  return {
    resumo: {
      registros: r.registros,
      viagens: r.viagens,
      toneladas: r.pesoTotalTon,
      km: r.kmTotal,
      horas: r.horasProdutivas,
      caminhoes: r.placas,
      coletores: r.placas,
      motoristas: r.motoristas,
      coletoresEquipe: 0,
      tonMediaColeta: Math.round(tonMedia * 100) / 100,
      kmMedioViagem: Math.round(kmMedio * 100) / 100,
      tonKm: Math.round(tonKm * 10000) / 10000,
      prodColetor: Math.round(prodColetor * 100) / 100,
    },
    porPlaca: agg.porPlaca.map(mapLinha),
    porTurno: [],
    porRegional: [],
    porMotorista: agg.porMotorista.map(mapLinha),
    porTipoCaminhao: [],
    porDistrito: agg.porDistrito.map(mapLinha),
    registrosConsiderados: r.registros,
  };
}

/** KPIs que já aparecem no hero/cards base — omitir na grade para evitar duplicação. */
export function isKpiMetricaBaseOperacao(nome: string): boolean {
  const n = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const padroes = [
    'viagem', 'tonelada', 'quilometro', ' km', 'hora produtiva', 'horas prod',
    'veiculo', 'coletor', 'motorista', 'caminhao', 'placa unica', 'placas unicas',
    'ton/viag', 'km/viag', 'ton por viagem',
    'km por viagem', 'prod/coletor', 'produtividade coletor', 'ton/hora', 'km/h',
    'peso total', 'distancia', 'registro',
  ];
  return padroes.some((p) => n.includes(p));
}

function statusVsMedia(pct: number): 'bom' | 'medio' | 'ruim' {
  if (pct >= 90) return 'bom';
  if (pct >= 75) return 'medio';
  return 'ruim';
}

/** Insights automáticos para o gerente identificar gargalos do dia. */
export function gerarInsightsOperacao(
  analise: OperacaoDiaAnalise,
  placasReserva?: string[],
): InsightOperacao[] {
  const { resumo } = analise;
  const insights: InsightOperacao[] = [];
  if (!resumo.viagens) return insights;

  const avgTonViag = resumo.tonMediaColeta;
  const avgKmViag = resumo.kmMedioViagem;
  const avgTonH = resumo.horas > 0 ? resumo.toneladas / resumo.horas : 0;

  const reservaOperando = analise.porPlaca.filter(
    (p) => p.viagens > 0 && ehPlacaReserva(p.chave, placasReserva),
  );
  if (reservaOperando.length > 0) {
    insights.push({
      severidade: 'info',
      titulo: 'Veículo reserva em operação',
      texto: `${reservaOperando.map((p) => p.chave).join(', ')} operou no dia (${reservaOperando.reduce((s, p) => s + p.viagens, 0)} viagem(ns) no total).`,
    });
  }

  const placasFracas = analise.porPlaca
    .filter(
      (p) =>
        p.viagens >= 1
        && !ehPlacaReserva(p.chave, placasReserva)
        && avgTonViag > 0
        && p.tonMediaViagem < avgTonViag * 0.75,
    )
    .sort((a, b) => a.tonMediaViagem - b.tonMediaViagem);

  if (placasFracas.length > 0 && analise.porPlaca.length >= 2) {
    insights.push({
      severidade: placasFracas.length >= 2 ? 'critico' : 'atencao',
      titulo: 'Veículos com produção abaixo da média',
      texto: `${placasFracas.length} placa(s) com ton/viagem inferior a 75% da média (${fmtNum(avgTonViag, 2)} t): ${placasFracas.slice(0, 3).map((p) => p.chave).join(', ')}.`,
    });
  }

  if (analise.porPlaca.length >= 2) {
    const top = analise.porPlaca[0];
    const pct = resumo.toneladas > 0 ? (top.toneladas / resumo.toneladas) * 100 : 0;
    if (pct >= 45) {
      insights.push({
        severidade: pct >= 60 ? 'atencao' : 'info',
        titulo: 'Concentração de volume em um veículo',
        texto: `${top.chave} concentrou ${fmtNum(pct, 0)}% das toneladas do dia — verifique balanceamento da frota.`,
      });
    }
  }

  const turnos = analise.porTurno.filter((t) => t.viagens > 0);
  if (turnos.length >= 2) {
    const pior = [...turnos].sort((a, b) => a.tonMediaViagem - b.tonMediaViagem)[0];
    if (avgTonViag > 0 && pior.tonMediaViagem < avgTonViag * 0.85) {
      insights.push({
        severidade: 'atencao',
        titulo: 'Turno com menor rendimento',
        texto: `Turno ${pior.chave}: ${fmtNum(pior.tonMediaViagem, 2)} t/viagem vs média do dia ${fmtNum(avgTonViag, 2)} t.`,
      });
    }
  }

  const regionais = analise.porRegional.filter((r) => r.viagens > 0);
  if (regionais.length >= 2) {
    const pior = [...regionais].sort((a, b) => a.tonMediaViagem - b.tonMediaViagem)[0];
    if (avgTonViag > 0 && pior.tonMediaViagem < avgTonViag * 0.85) {
      insights.push({
        severidade: 'atencao',
        titulo: 'Regional com menor rendimento',
        texto: `${pior.chave}: ${fmtNum(pior.tonMediaViagem, 2)} t/viagem vs média ${fmtNum(avgTonViag, 2)} t — possível gargalo logístico.`,
      });
    }
  }

  const placasKmAlto = analise.porPlaca.filter(
    (p) =>
      p.viagens >= 1
      && !ehPlacaReserva(p.chave, placasReserva)
      && avgKmViag > 0
      && p.kmMedioViagem > avgKmViag * 1.35,
  );
  if (placasKmAlto.length > 0 && analise.porPlaca.length >= 2) {
    insights.push({
      severidade: 'atencao',
      titulo: 'Deslocamento elevado por viagem',
      texto: `${placasKmAlto.slice(0, 3).map((p) => p.chave).join(', ')} com KM/viagem acima de 135% da média (${fmtNum(avgKmViag, 1)} km).`,
    });
  }

  const placasTonHBaixo = analise.porPlaca.filter((p) => {
    const tonH = p.horas > 0 ? p.toneladas / p.horas : 0;
    return (
      p.horas > 0
      && !ehPlacaReserva(p.chave, placasReserva)
      && avgTonH > 0
      && tonH < avgTonH * 0.7
    );
  });
  if (placasTonHBaixo.length > 0 && analise.porPlaca.length >= 2) {
    insights.push({
      severidade: 'critico',
      titulo: 'Baixa produtividade por hora',
      texto: `${placasTonHBaixo.slice(0, 3).map((p) => p.chave).join(', ')} com ton/h abaixo de 70% da média (${fmtNum(avgTonH, 2)} t/h).`,
    });
  }

  const mot = analise.porMotorista.filter((m) => m.viagens > 0);
  if (mot.length >= 3) {
    const pior = [...mot].sort((a, b) => a.tonMediaViagem - b.tonMediaViagem)[0];
    if (avgTonViag > 0 && pior.tonMediaViagem < avgTonViag * 0.75) {
      insights.push({
        severidade: 'atencao',
        titulo: 'Motorista com menor média do dia',
        texto: `${pior.chave}: ${fmtNum(pior.tonMediaViagem, 2)} t/viagem em ${fmtNum(pior.viagens, 0)} viagem(ns).`,
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      severidade: 'info',
      titulo: 'Operação dentro dos parâmetros',
      texto: `Nenhum desvio crítico detectado. Média: ${fmtNum(avgTonViag, 2)} t/viagem, ${fmtNum(avgKmViag, 1)} km/viagem, ${fmtNum(resumo.prodColetor, 2)} t/veículo.`,
    });
  }

  return insights.slice(0, 6);
}

/** Linhas por placa com indicador de eficiência vs média do dia. */
export function montarEficienciaPlacas(
  analise: OperacaoDiaAnalise,
  placasReserva?: string[],
): LinhaEficienciaPlaca[] {
  const avgTonViag = analise.resumo.tonMediaColeta;
  return analise.porPlaca
    .filter((p) => p.chave !== '—')
    .map((p) => {
      const pct = avgTonViag > 0 ? (p.tonMediaViagem / avgTonViag) * 100 : 100;
      return {
        ...p,
        tonHora: p.horas > 0 ? p.toneladas / p.horas : 0,
        pctMediaTonViag: pct,
        status: statusVsMedia(pct),
        ehReserva: ehPlacaReserva(p.chave, placasReserva),
      };
    })
    .sort((a, b) => a.pctMediaTonViag - b.pctMediaTonViag);
}
