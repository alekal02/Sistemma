import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairPesosViagemPlanilhaRegistro,
  extrairPesosViagemRegistro,
  MAX_PESO_VIAGEM_KG,
} from './viagensPorRotaService';

describe('extrairPesosViagemPlanilhaRegistro', () => {
  it('lê peso1–4 tipados e ignora PESO TOTAL', () => {
    const pesos = extrairPesosViagemPlanilhaRegistro({
      peso1: 8200,
      peso2: 9100,
      peso3: 7800,
      peso4: 8500,
      pesoTotal: 76998,
    });
    assert.deepEqual(pesos, [8200, 9100, 7800, 8500]);
    assert.ok(Math.max(...pesos) < MAX_PESO_VIAGEM_KG);
  });

  it('lê colunas PESO 1–4 da planilha', () => {
    const pesos = extrairPesosViagemPlanilhaRegistro({
      'PESO 1': 2475,
      'PESO 2': 9000,
      'PESO TOTAL': 11475,
    });
    assert.deepEqual(pesos, [2475, 9000]);
  });

  it('não trata PESO TOTAL como PESO 1 via contains', () => {
    const pesos = extrairPesosViagemPlanilhaRegistro({
      'PESO TOTAL': 76998,
      pesoTotal: 76998,
    });
    assert.deepEqual(pesos, []);
  });
});

describe('extrairPesosViagemRegistro', () => {
  it('não inventa viagem com total absurdo', () => {
    const pesos = extrairPesosViagemRegistro({
      pesoTotal: 76998,
      'CONTADOR DE VIAGENS': 1,
    });
    assert.deepEqual(pesos, []);
  });
});
