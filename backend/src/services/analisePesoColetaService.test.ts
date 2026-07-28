import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analisarPesoColeta,
  calcularCaixaMediaPorFrota,
  calcularMediaIdealKg,
  contarFrotaPorTipoCaminhao,
  DENSIDADE_OTIMA_PADRAO,
} from './analisePesoColetaService';
import { PESO_MAX_KG_PADRAO, VOLUME_L_PADRAO } from '../config/pesoMaximoCaminhao';

describe('contarFrotaPorTipoCaminhao', () => {
  it('agrupa placas únicas pelo tipo declarado na planilha', () => {
    const dados = [
      { PLACA: 'M1', 'TIPO DE CAMINHÃO': 'MINI' },
      { PLACA: 'M2', 'TIPO DE CAMINHÃO': 'MINI' },
      { PLACA: 'M3', 'TIPO DE CAMINHÃO': 'MINI' },
      { PLACA: 'M4', 'TIPO DE CAMINHÃO': 'MINI' },
      { PLACA: 'M5', 'TIPO DE CAMINHÃO': 'MINI' },
      ...Array.from({ length: 17 }, (_, i) => ({
        PLACA: `T${i + 1}`,
        'TIPO DE CAMINHÃO': 'TOCO',
      })),
      ...Array.from({ length: 6 }, (_, i) => ({
        PLACA: `K${i + 1}`,
        'TIPO DE CAMINHÃO': 'TRUCK',
      })),
    ];

    const { tiposCaminhao } = contarFrotaPorTipoCaminhao(
      dados,
      'PLACA',
      'TIPO DE CAMINHÃO',
      'PESO TOTAL',
      PESO_MAX_KG_PADRAO,
    );

    assert.deepEqual(tiposCaminhao, { MINI: 5, TOCO: 17, BASCULANTE: 0, TRUCK: 6, soma: 28 });
  });

  it('reconhece BASCULANTE como tipo próprio', () => {
    const dados = [
      { PLACA: 'B1', 'TIPO DE CAMINHÃO': 'BASCULANTE' },
      { PLACA: 'B2', 'TIPO DE CAMINHÃO': 'BASCULANTO' },
    ];
    const { tiposCaminhao } = contarFrotaPorTipoCaminhao(
      dados,
      'PLACA',
      'TIPO DE CAMINHÃO',
      'PESO TOTAL',
      PESO_MAX_KG_PADRAO,
    );
    assert.equal(tiposCaminhao.BASCULANTE, 2);
    assert.equal(tiposCaminhao.TOCO, 0);
  });

  it('prioriza tipo declarado sobre inferência por peso', () => {
    const dados = [
      { PLACA: 'ABC1234', 'TIPO DE CAMINHÃO': 'MINI', 'PESO TOTAL': 15000 },
    ];
    const { tiposCaminhao } = contarFrotaPorTipoCaminhao(
      dados,
      'PLACA',
      'TIPO DE CAMINHÃO',
      'PESO TOTAL',
      PESO_MAX_KG_PADRAO,
    );
    assert.equal(tiposCaminhao.MINI, 1);
    assert.equal(tiposCaminhao.TRUCK, 0);
  });
});

describe('calcularCaixaMediaPorFrota', () => {
  it('calcula caixa média ponderada por volume (L) conforme planilha', () => {
    const frota = { MINI: 5, TOCO: 17, TRUCK: 6 };
    const caixaMedia = calcularCaixaMediaPorFrota(frota, VOLUME_L_PADRAO);
    assert.equal(caixaMedia, 14250);
  });

  it('retorna 0 quando frota vazia', () => {
    assert.equal(calcularCaixaMediaPorFrota({ MINI: 0, TOCO: 0, BASCULANTE: 0, TRUCK: 0 }, VOLUME_L_PADRAO), 0);
  });

  it('usa volume do contrato (ex.: basculante diferente do padrão 17.000 L)', () => {
    const frota = { MINI: 0, TOCO: 0, BASCULANTE: 2, TRUCK: 2 };
    const volumesContrato = { ...VOLUME_L_PADRAO, BASCULANTE: 12000 };
    // (12000×2 + 19000×2) / 4 = 15500
    assert.equal(calcularCaixaMediaPorFrota(frota, volumesContrato), 15500);
  });
});

describe('calcularMediaIdealKg', () => {
  it('multiplica caixa média (L) pela densidade do resíduo (kg/L)', () => {
    const pesoIdeal = calcularMediaIdealKg(14250, DENSIDADE_OTIMA_PADRAO);
    assert.equal(pesoIdeal, 7837.5);
  });
});

describe('analisarPesoColeta — mínimo/máximo por viagem', () => {
  it('usa menor e maior peso de viagem, não média/total da rota', () => {
    const dados = [
      {
        PLACA: 'AAA1111',
        REGIONAL: 'MC2B-NE',
        'CONTADOR DE VIAGENS': 2,
        'PESO 1': 2475,
        'PESO 2': 9000,
        'PESO TOTAL': 11475,
        validoDashboard: true,
      },
      {
        PLACA: 'BBB2222',
        REGIONAL: 'NO24B',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 13120,
        'PESO TOTAL': 13120,
        validoDashboard: true,
      },
    ];

    const analise = analisarPesoColeta(dados, 'svc-test');
    assert.ok(analise);
    assert.equal(analise!.rotaMinima?.pesoMedioKg, 2475);
    assert.equal(analise!.rotaMinima?.nome, 'MC2B-NE');
    assert.equal(analise!.rotaMaxima?.pesoMedioKg, 13120);
    assert.equal(analise!.rotaMaxima?.nome, 'NO24B');
  });

  it('nunca usa PESO TOTAL enorme (ex. 76998) como máximo de viagem', () => {
    const dados = [
      {
        PLACA: 'CCC3333',
        REGIONAL: 'ROTA-X',
        'CONTADOR DE VIAGENS': 4,
        peso1: 8200,
        peso2: 9100,
        peso3: 7800,
        peso4: 8500,
        pesoTotal: 76998, // total errado / soma de várias rotas — NÃO é viagem
        validoDashboard: true,
      },
      {
        PLACA: 'DDD4444',
        REGIONAL: 'ROTA-Y',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 1400,
        'PESO TOTAL': 1400,
        validoDashboard: true,
      },
    ];

    const analise = analisarPesoColeta(dados, 'svc-porto');
    assert.ok(analise);
    assert.equal(analise!.rotaMinima?.pesoMedioKg, 1400);
    assert.equal(analise!.rotaMaxima?.pesoMedioKg, 9100);
    assert.ok((analise!.rotaMaxima?.pesoMedioKg ?? 0) < 25000);
  });

  it('ignora registro só com PESO TOTAL absurdo sem PESO 1–4', () => {
    const dados = [
      {
        PLACA: 'EEE5555',
        REGIONAL: 'ROTA-Z',
        'CONTADOR DE VIAGENS': 1,
        pesoTotal: 76998,
        validoDashboard: true,
      },
      {
        PLACA: 'FFF6666',
        REGIONAL: 'ROTA-OK',
        'CONTADOR DE VIAGENS': 2,
        'PESO 1': 5000,
        'PESO 2': 6000,
        'PESO TOTAL': 11000,
        validoDashboard: true,
      },
    ];

    const analise = analisarPesoColeta(dados, 'svc-porto-2');
    assert.ok(analise);
    assert.equal(analise!.rotaMinima?.pesoMedioKg, 5000);
    assert.equal(analise!.rotaMaxima?.pesoMedioKg, 6000);
  });
});

describe('analisarPesoColeta — faixas vs peso ideal do tipo', () => {
  it('classifica em péssimo / ruim / ótimo / excedido conforme % do ideal', () => {
    // MINI ideal padrão = 6000 L × 0,55 = 3300 kg
    const dados = [
      {
        PLACA: 'M1',
        'TIPO DE CAMINHÃO': 'MINI',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 1000, // ~30% → péssimo
        'PESO TOTAL': 1000,
        validoDashboard: true,
      },
      {
        PLACA: 'M2',
        'TIPO DE CAMINHÃO': 'MINI',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 2000, // ~61% → ruim
        'PESO TOTAL': 2000,
        validoDashboard: true,
      },
      {
        PLACA: 'M3',
        'TIPO DE CAMINHÃO': 'MINI',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 3300, // 100% → ótimo
        'PESO TOTAL': 3300,
        validoDashboard: true,
      },
      {
        PLACA: 'M4',
        'TIPO DE CAMINHÃO': 'MINI',
        'CONTADOR DE VIAGENS': 1,
        'PESO 1': 4000, // ~121% → excedido
        'PESO TOTAL': 4000,
        validoDashboard: true,
      },
    ];

    const analise = analisarPesoColeta(dados, 'svc-faixas-ideal');
    assert.ok(analise);
    assert.equal(analise!.faixas.length, 4);
    assert.match(analise!.faixas[0].label, /PÉSSIMO/i);
    assert.match(analise!.faixas[1].label, /RUIM/i);
    assert.match(analise!.faixas[2].label, /ÓTIMO|OTIMO/i);
    assert.match(analise!.faixas[3].label, /EXCEDIDO/i);
    assert.equal(analise!.faixas[0].quantidade, 1);
    assert.equal(analise!.faixas[1].quantidade, 1);
    assert.equal(analise!.faixas[2].quantidade, 1);
    assert.equal(analise!.faixas[3].quantidade, 1);
  });
});
