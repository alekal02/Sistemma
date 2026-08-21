import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { statusPorPctIdeal } from './rankingViagensTipo';

describe('statusPorPctIdeal', () => {
  it('classifica a escala do relatório diário', () => {
    assert.equal(statusPorPctIdeal(24), 'pessimo');
    assert.equal(statusPorPctIdeal(62), 'ruim');
    assert.equal(statusPorPctIdeal(92), 'otimo');
    assert.equal(statusPorPctIdeal(100), 'otimo');
    assert.equal(statusPorPctIdeal(114), 'ruim');
    assert.equal(statusPorPctIdeal(122), 'pessimo');
  });

  it('ignora percentual ausente', () => {
    assert.equal(statusPorPctIdeal(null), null);
    assert.equal(statusPorPctIdeal(undefined), null);
    assert.equal(statusPorPctIdeal(Number.NaN), null);
  });
});
