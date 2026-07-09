import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { parsearPlanilhaRocada, resumoParseRocada } from './rocadaPlanilhaParser';

const DIR = 'C:/Users/Kal/Downloads/planilha roçada';

function ler(nome: string): Buffer {
  return fs.readFileSync(path.join(DIR, nome));
}

describe('parsearPlanilhaRocada — modelos reais', () => {
  it('Londrina: metragem US e data 1-Jun', () => {
    if (!fs.existsSync(DIR)) return;
    const r = parsearPlanilhaRocada(ler('Planilha de roçada - modelo Londrina.xlsx'));
    const s = resumoParseRocada(r);
    assert.equal(r.modelo, 'londrina');
    assert.ok(s.registros >= 3);
    assert.ok(s.areaTotalM2 >= 40000);
    assert.equal(r.linhas[0].dataSaida?.toISOString().slice(0, 10), '2026-06-01');
  });

  it('QGIS: milhares de polígonos com área decimal', () => {
    if (!fs.existsSync(DIR)) return;
    const r = parsearPlanilhaRocada(ler('Planilha de roçada - modelo QGIS.xlsx'));
    const s = resumoParseRocada(r);
    assert.equal(r.modelo, 'qgis');
    assert.ok(s.registros > 1000);
    assert.ok(r.linhas[0].areaM2 > 100);
    assert.ok(r.linhas[0].operador);
    assert.ok(r.linhas[0].dataSaida);
  });

  it('Pinda: TOTAL m² e data dd\\mm\\yyyy', () => {
    if (!fs.existsSync(DIR)) return;
    const r = parsearPlanilhaRocada(ler('Planilha de roçada - modelo Pindamonhangaba.xlsx'));
    assert.equal(r.modelo, 'pindamonhangaba');
    assert.ok(r.linhas[0].areaM2 >= 1000);
    assert.equal(r.linhas[0].dataSaida?.toISOString().slice(0, 10), '2026-06-01');
  });
});
