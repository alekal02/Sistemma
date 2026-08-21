import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolverQualCicloMenu,
  textoPedeCicloAnterior,
} from './WhatsappComandoRelatorioTexto';

describe('WhatsApp — ciclo anterior nos relatórios', () => {
  it('reconhece pedido de ciclo anterior no texto', () => {
    assert.equal(textoPedeCicloAnterior('ciclo anterior'), true);
    assert.equal(textoPedeCicloAnterior('relatorio anterior'), true);
    assert.equal(textoPedeCicloAnterior('peso anterior'), true);
    assert.equal(textoPedeCicloAnterior('mes passado'), true);
    assert.equal(textoPedeCicloAnterior('ciclo atual'), false);
    assert.equal(textoPedeCicloAnterior('ciclo'), false);
  });

  it('menu atual/anterior: 1 = atual, 2 = anterior', () => {
    assert.equal(resolverQualCicloMenu('1'), 'atual');
    assert.equal(resolverQualCicloMenu('2'), 'anterior');
    assert.equal(resolverQualCicloMenu('atual'), 'atual');
    assert.equal(resolverQualCicloMenu('anterior'), 'anterior');
    assert.equal(resolverQualCicloMenu('ciclo fechado'), 'anterior');
    assert.equal(resolverQualCicloMenu('xyz'), null);
  });
});
