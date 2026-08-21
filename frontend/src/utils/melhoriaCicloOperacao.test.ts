import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alinharDiasCicloOperacao,
  rotuloOcorrenciaDiaSemana,
} from './melhoriaCicloOperacao';
import type { DadoDiario } from './relatorioDiario';

function dia(data: string, toneladas = 10): DadoDiario {
  return {
    data,
    label: data,
    viagens: toneladas > 0 ? 5 : 0,
    rotas: toneladas > 0 ? 2 : 0,
    toneladas,
    km: toneladas > 0 ? 40 : 0,
    horas: 0,
    coletores: 0,
  };
}

function serie(inicioIso: string, n: number): DadoDiario[] {
  const [y, m, d] = inicioIso.split('-').map(Number);
  const out: DadoDiario[] = [];
  for (let i = 0; i < n; i++) {
    const dt = new Date(y, m - 1, d + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    const dow = dt.getDay();
    out.push(dia(iso, dow === 0 ? 0 : 10));
  }
  return out;
}

describe('alinharDiasCicloOperacao — dia da semana', () => {
  it('rotulo: 1ª qua / 1º sáb', () => {
    assert.equal(rotuloOcorrenciaDiaSemana(3, 1), '1ª qua');
    assert.equal(rotuloOcorrenciaDiaSemana(6, 1), '1º sáb');
    assert.equal(rotuloOcorrenciaDiaSemana(0, 2), '2º dom');
  });

  it('julho (qua) × agosto (sáb): 1º sábado atual casa com 1º sábado anterior, não com o dia 1', () => {
    // 01/07/2026 = quarta; 01/08/2026 = sábado (caso do relatório)
    const ant = serie('2026-07-01', 10);
    const atu = serie('2026-08-01', 10);
    const pares = alinharDiasCicloOperacao(ant, atu);

    const primeiroSabAtual = pares.find((p) => p.atual?.data === '2026-08-01');
    assert.ok(primeiroSabAtual);
    assert.equal(primeiroSabAtual!.ant?.data, '2026-07-04');
    assert.equal(rotuloOcorrenciaDiaSemana(primeiroSabAtual!.diaSemana, primeiroSabAtual!.ocorrencia), '1º sáb');

    const primeiroDomAtual = pares.find((p) => p.atual?.data === '2026-08-02');
    assert.equal(primeiroDomAtual?.ant?.data, '2026-07-05');

    const primeiraQuaAtual = pares.find((p) => p.atual?.data === '2026-08-05');
    assert.equal(primeiraQuaAtual?.ant?.data, '2026-07-01');

    // domingo × domingo: os dois sem coleta — não gera variação falsa vs quarta
    assert.equal(primeiroDomAtual?.ant?.toneladas, 0);
    assert.equal(primeiroDomAtual?.atual?.toneladas, 0);
  });
});
