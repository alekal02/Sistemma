import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  obterContadorViagensRegistro,
  obterPesoTotalRegistro,
  sqlDataIsoDia,
  sqlExprPesoEfetivoKg,
  sqlSumPesoEfetivoKg,
} from './viagensPorRotaService';

describe('sql peso efetivo / data ISO do ciclo', () => {
  it('soma células PESO 1–5 da planilha (JSON), não id/PESO 2–5 tipados', () => {
    const expr = sqlExprPesoEfetivoKg('c');
    assert.match(expr, /jsonb_extract_path_text\(c\.dados, 'PESO 1'\)/);
    assert.match(expr, /jsonb_extract_path_text\(c\.dados, 'PESO TOTAL'\)/);
    assert.match(expr, /\^\[\+-\]\?\[0-9\]/);
    assert.equal(expr.includes('AVG'), false);
    assert.equal(expr.includes('GREATEST'), false);
    const sum = sqlSumPesoEfetivoKg('c');
    assert.match(sum, /^COALESCE\(SUM\(/);
  });

  it('agrupa o dia civil em yyyy-MM-dd', () => {
    assert.equal(sqlDataIsoDia('c'), "TO_CHAR(c.dataSaida, 'YYYY-MM-DD')");
  });

  it('usa PESO 1–5 da planilha quando o pesoTotal tipado foi inflado com id', () => {
    const kg = obterPesoTotalRegistro({
      pesoTotal: 18440,
      peso1: 8300,
      peso2: 2535,
      dados: { 'PESO 1': 8300, 'PESO 2': '', 'PESO TOTAL': 8300 },
    });
    assert.equal(kg, 8300);
  });
});

describe('contador de viagens no JSON da planilha', () => {
  it('lê CONTADOR DE VIAGENS de dados mesmo sem campo tipado', () => {
    const n = obterContadorViagensRegistro({
      peso1: 8390,
      numeroViagens: null,
      viagensPorRota: 0,
      dados: { 'CONTADOR DE VIAGENS': 2, 'PESO 1': 8390 },
    });
    assert.equal(n, 2);
  });
});
