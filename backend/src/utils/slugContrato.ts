export function slugificarContrato(nome: string): string {
  const base = (nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'contrato';
}

export function nomeBancoContrato(slug: string): string {
  const nome = `contrato_${slug}`.slice(0, 63);
  if (!/^[a-z][a-z0-9_]*$/.test(nome)) {
    throw new Error(`Nome de banco inválido: ${nome}`);
  }
  return nome;
}
