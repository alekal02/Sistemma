/** HTML do relatório de uploads do dia (server-side, para WhatsApp/Puppeteer). */

export interface UploadDiaPdfItem {
  uploadId: number;
  nomeArquivo: string;
  criadoEm: string;
  totalLinhas: number;
  linhasImportadas: number;
  usuarioNome: string | null;
  servicoNome: string;
  servicoTipo: string;
}

export interface ContratoUploadsDiaPdf {
  numeroContrato: string;
  totalUploads: number;
  totalLinhasImportadas: number;
  uploads: UploadDiaPdfItem[];
}

export interface RelatorioUploadsDiaPdfInput {
  data: string;
  totalUploads: number;
  totalContratos: number;
  contratos: ContratoUploadsDiaPdf[];
  destaque?: {
    contrato?: string;
    servico?: string;
    ultimoDiaOperacional?: string | null;
    arquivo?: string;
  };
}

function esc(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarDataBr(dataIso: string): string {
  const [y, m, d] = dataIso.split('-');
  if (!y || !m || !d) return dataIso;
  return `${d}/${m}/${y}`;
}

function formatarHora(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '—';
  }
}

export function gerarHtmlUploadsDiaServer(input: RelatorioUploadsDiaPdfInput): string {
  const dataBr = formatarDataBr(input.data);
  const geradoEm = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const ultimoDia = input.destaque?.ultimoDiaOperacional
    ? formatarDataBr(input.destaque.ultimoDiaOperacional)
    : null;

  const banner = input.destaque
    ? `<div class="banner">
        Importação automática via WhatsApp
        ${input.destaque.contrato ? ` · Contrato <b>${esc(input.destaque.contrato)}</b>` : ''}
        ${input.destaque.servico ? ` · Serviço <b>${esc(input.destaque.servico)}</b>` : ''}
        ${input.destaque.arquivo ? ` · Arquivo <b>${esc(input.destaque.arquivo)}</b>` : ''}
        ${ultimoDia ? ` · Último dia operacional no sistema: <b>${esc(ultimoDia)}</b>` : ''}
      </div>`
    : '';

  const cards = `
    <table class="cards"><tr>
      <td class="card" style="border-top-color:#f59e0b;width:33%">
        <div class="lbl">Dia do relatório</div>
        <div class="val">${esc(dataBr)}</div>
      </td>
      <td class="card" style="border-top-color:#22c55e;width:33%">
        <div class="lbl">Contratos com upload</div>
        <div class="val">${input.totalContratos}</div>
      </td>
      <td class="card" style="border-top-color:#3b82f6;width:33%">
        <div class="lbl">Total de uploads</div>
        <div class="val">${input.totalUploads}</div>
      </td>
    </tr></table>`;

  let corpo: string;
  if (!input.contratos.length) {
    corpo = `<div class="empty">Nenhum contrato fez upload no dia <strong>${esc(dataBr)}</strong>.</div>`;
  } else {
    corpo = input.contratos.map((c) => {
      const linhas = c.uploads.map((u) => `
        <tr>
          <td>${esc(u.servicoNome)}</td>
          <td>${esc(String(u.servicoTipo || '').replace(/_/g, ' '))}</td>
          <td>${esc(u.nomeArquivo)}</td>
          <td class="c">${esc(formatarHora(u.criadoEm))}</td>
          <td class="r">${Number(u.linhasImportadas || 0).toLocaleString('pt-BR')}</td>
          <td>${esc(u.usuarioNome || '—')}</td>
        </tr>`).join('');
      return `
        <div class="bloco">
          <div class="bloco-hd">Contrato ${esc(c.numeroContrato)}
            <span>${c.totalUploads} upload(s) · ${Number(c.totalLinhasImportadas || 0).toLocaleString('pt-BR')} linhas</span>
          </div>
          <table class="data">
            <thead>
              <tr>
                <th>Serviço</th><th>Tipo</th><th>Arquivo</th>
                <th class="c">Horário</th><th class="r">Linhas</th><th>Usuário</th>
              </tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>`;
    }).join('');
  }

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Uploads do Dia — ${esc(dataBr)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#1e293b;padding:14px 16px;line-height:1.4}
  .header{background:linear-gradient(135deg,#0f172a,#1e3a5f);color:#fff;border-radius:10px;padding:14px 16px;margin-bottom:12px}
  .header h1{font-size:15px;font-weight:800;color:#fbbf24}
  .header .sub{font-size:8px;color:#94a3b8;margin-top:3px}
  .dia-box{display:inline-block;margin-top:8px;background:rgba(251,191,36,.15);border:1px solid rgba(251,191,36,.35);border-radius:6px;padding:6px 12px}
  .dia-box .lbl{font-size:6.5px;color:#94a3b8;text-transform:uppercase;font-weight:700}
  .dia-box .val{font-size:16px;font-weight:900;color:#fbbf24;font-family:monospace;margin-top:2px}
  .banner{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 9px;margin-bottom:10px;font-size:8px;color:#92400e}
  .cards{width:100%;border-collapse:separate;border-spacing:6px;margin-bottom:10px}
  .card{background:#fff;border:1px solid #e2e8f0;border-top:3px solid #3b82f6;border-radius:6px;padding:7px 8px}
  .card .lbl{font-size:6px;font-weight:700;color:#64748b;text-transform:uppercase}
  .card .val{font-size:14px;font-weight:800;color:#0f172a;margin-top:2px}
  .sec{font-size:7px;font-weight:800;color:#64748b;text-transform:uppercase;margin:10px 0 6px}
  .bloco{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:8px}
  .bloco-hd{font-size:9px;font-weight:800;color:#0f172a;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e2e8f0}
  .bloco-hd span{font-size:7px;font-weight:600;color:#64748b;margin-left:6px}
  table.data{width:100%;border-collapse:collapse;font-size:7.5px}
  table.data th{padding:4px 5px;background:#1e293b;color:#fff;font-size:6.5px;text-transform:uppercase;text-align:left}
  table.data th.r,table.data td.r{text-align:right}
  table.data th.c,table.data td.c{text-align:center}
  table.data td{padding:4px 5px;border-bottom:1px solid #f1f5f9}
  .empty{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:8px;padding:16px;text-align:center;color:#64748b;font-size:9px}
  .footer{margin-top:12px;font-size:6.5px;color:#94a3b8;text-align:right}
</style></head><body>
  <div class="header">
    <h1>Uploads por Contrato</h1>
    <div class="sub">Relatório de planilhas enviadas no dia</div>
    <div class="dia-box"><div class="lbl">Dia</div><div class="val">${esc(dataBr)}</div></div>
  </div>
  ${banner}
  ${cards}
  <div class="sec">Contratos que fizeram upload</div>
  ${corpo}
  <div class="footer">Gerado em ${esc(geradoEm)}</div>
</body></html>`;
}
