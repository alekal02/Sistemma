import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolverWebhookWuzapi } from './WuzapiService';

describe('URL do webhook WhatsApp', () => {
  it('na rede do Docker ignora o endereço antigo do .env', () => {
    const antiga = 'http://host.docker.internal:3200/api/wuzapi/webhook';
    assert.equal(
      resolverWebhookWuzapi('http://wuzapi:8080', antiga),
      'http://sistemma-backend:3200/api/wuzapi/webhook',
    );
    assert.equal(
      resolverWebhookWuzapi('http://wuzapi:8080/', ''),
      'http://sistemma-backend:3200/api/wuzapi/webhook',
    );
  });

  it('fora do Docker usa a URL informada', () => {
    assert.equal(
      resolverWebhookWuzapi('http://localhost:8080', 'http://127.0.0.1:3200/api/wuzapi/webhook'),
      'http://127.0.0.1:3200/api/wuzapi/webhook',
    );
  });

  it('no desenvolvimento sem URL cai no host', () => {
    assert.equal(
      resolverWebhookWuzapi('http://localhost:8080', ''),
      'http://host.docker.internal:3200/api/wuzapi/webhook',
    );
  });
});
