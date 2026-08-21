import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparViagensPesoPorLinha,
  montarViagensPesoDoRegistro,
  ratearHoras,
} from './viagemPesoRotaService';

describe('ratearHoras', () => {
  it('divide e o último recebe o resto', () => {
    assert.deepEqual(ratearHoras(5.4, 2), [2.7, 2.7]);
    assert.deepEqual(ratearHoras(5.41, 3), [1.8, 1.8, 1.81]);
  });
});

describe('montarViagensPesoDoRegistro', () => {
  it('Mini com 2 PESOs já cheios e 4 trechos: rateio da hora, sem estimativa', () => {
    const viagens = montarViagensPesoDoRegistro({
      data: '2026-09-11',
      rota: 'MC2B-L',
      placa: 'RJI2E33',
      motorista: 'JOÃO',
      tipo: 'MINI',
      pesos: [3480, 3410, 0, null],
      pesoIdealKg: 3300,
      objHoras: {
        dados: {
          'HORA SÁIDA BASE': 8 / 24,
          'HORA CHEGADA BASE': 16 / 24,
          'HORA CHEGADA ROTA 01': 8 / 24,
          'HORA SAÍDA ROTA 01': 9.5 / 24,
          'HORA CHEGADA ROTA 02': 10 / 24,
          'HORA SAÍDA ROTA 02': 11.3 / 24,
          'HORA CHEGADA ROTA 03': 12 / 24,
          'HORA SAÍDA ROTA 03': 13.4 / 24,
          'HORA CHEGADA ROTA 04': 14 / 24,
          'HORA SAÍDA ROTA 04': 15.2 / 24,
        },
      },
    });

    assert.equal(viagens.length, 2);
    assert.equal(viagens[0].nViagem, 1);
    assert.equal(viagens[1].nViagem, 2);
    assert.equal(viagens[0].encheu, true);
    assert.equal(viagens[1].encheu, true);
    assert.equal(viagens[0].tempoEqEncher, null);
    assert.equal(viagens[1].tempoEqEncher, null);
    assert.equal(viagens[0].origemHora, 'rateio');
    assert.ok(viagens[0].horasProdutivasViagem > 2);
    assert.ok(viagens[1].horasProdutivasViagem > 2);
    const soma = viagens[0].horasProdutivasViagem + viagens[1].horasProdutivasViagem;
    assert.ok(Math.abs(soma - viagens[0].horasProdutivasRota) < 0.02);
  });

  it('2 PESOs e 2 trechos: usa a hora de cada trecho', () => {
    const viagens = montarViagensPesoDoRegistro({
      rota: 'A',
      placa: 'ABC1D23',
      motorista: 'X',
      tipo: 'MINI',
      pesos: [2000, 1500],
      pesoIdealKg: 3300,
      objHoras: {
        dados: {
          'HORA SÁIDA BASE': 8 / 24,
          'HORA CHEGADA BASE': 14 / 24,
          'HORA CHEGADA ROTA 01': 8 / 24,
          'HORA SAÍDA ROTA 01': 10 / 24,
          'HORA CHEGADA ROTA 02': 11 / 24,
          'HORA SAÍDA ROTA 02': 13.5 / 24,
        },
      },
    });
    assert.equal(viagens.length, 2);
    assert.equal(viagens[0].origemHora, 'trecho');
    assert.equal(viagens[0].horasProdutivasViagem, 2);
    assert.equal(viagens[1].horasProdutivasViagem, 2.5);
    assert.equal(viagens[0].encheu, false);
    assert.equal(viagens[0].estimado, true);
    assert.equal(viagens[0].tempoEqEncher, 3.3); // 2h × (3300/2000)
  });

  it('agrupa por rota e mostra a soma das horas das viagens', () => {
    const viagens = montarViagensPesoDoRegistro({
      data: '2026-09-11',
      rota: 'MC2B-L',
      placa: 'RJI2E33',
      motorista: 'JOÃO',
      tipo: 'MINI',
      pesos: [3480, 3410],
      pesoIdealKg: 3300,
      objHoras: {
        dados: {
          'HORA SÁIDA BASE': 8 / 24,
          'HORA CHEGADA BASE': 14 / 24,
          'HORA CHEGADA ROTA 01': 8 / 24,
          'HORA SAÍDA ROTA 01': 10.7 / 24,
          'HORA CHEGADA ROTA 02': 11 / 24,
          'HORA SAÍDA ROTA 02': 13.7 / 24,
        },
      },
    });
    const grupos = agruparViagensPesoPorLinha(viagens);
    assert.equal(grupos.length, 1);
    assert.equal(grupos[0].viagens.length, 2);
    assert.equal(grupos[0].horasProdutivasRota, 5.4);
  });
});
