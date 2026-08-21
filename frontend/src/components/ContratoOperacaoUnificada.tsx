/**
 * Hub do contrato: valores unitários (unidade configurável por serviço) + upload CONSOLIDADO.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { FiDollarSign, FiUpload, FiFileText, FiCheckCircle } from 'react-icons/fi';
import { isAxiosError } from 'axios';
import { useToast } from '../contexts/ToastContext';
import servicoService from '../services/servicoService';
import coletaService from '../services/coletaService';
import {
  TIPOS_VALOR_HUB,
  TIPO_VALOR_LABELS,
  tipoValorFromConfig,
  camposValorVazios,
  buildConfigFaturamentoFromForm,
  type TipoValor,
  type CamposValorForm,
} from '../utils/tipoValorFaturamento';

const TIPOS_PADRAO = [
  'coleta_caminhao',
  'rocadeira',
  'capina',
  'varricao',
  'poda',
  'pintura_meio_fio',
  'remocao',
] as const;
type TipoPadrao = (typeof TIPOS_PADRAO)[number];

const LABELS: Record<TipoPadrao, string> = {
  coleta_caminhao: 'Coleta',
  rocadeira: 'Roçada',
  capina: 'Capina',
  varricao: 'Varrição',
  poda: 'Poda',
  pintura_meio_fio: 'Pintura',
  remocao: 'Remoção',
};

const TIPO_VALOR_INICIAL: Record<TipoPadrao, TipoValor> = {
  coleta_caminhao: 'caminhao',
  rocadeira: 'm2',
  capina: 'km_linear',
  varricao: 'km_linear',
  poda: 'por_arvore',
  pintura_meio_fio: 'km_linear',
  remocao: 'por_equipe',
};

type FormServico = CamposValorForm & { tipoValor: TipoValor };

type ServicoMini = {
  id: string;
  nome: string;
  tipo: string;
  configFaturamento?: any;
  totalRegistros?: number;
};

type Props = {
  contractId: string;
  servicos: ServicoMini[];
  onRefresh: () => void;
  tarifasContrato?: {
    valorMini?: number | null;
    valorTruck?: number | null;
    valorToco?: number | null;
    valorBasculante?: number | null;
  } | null;
};

function fmtInput(v: unknown): string {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

function formVazio(tipoValor: TipoValor): FormServico {
  return { tipoValor, ...camposValorVazios() };
}

function formFromConfig(
  tipoServico: TipoPadrao,
  cfg: any,
  tarifasContrato?: Props['tarifasContrato'],
): FormServico {
  const tipoValor = tipoValorFromConfig(cfg, tipoServico);
  const base = formVazio(tipoValor);
  const usaTarifaContrato = tipoServico === 'coleta_caminhao';
  return {
    ...base,
    tipoValor,
    valorMini: fmtInput(cfg?.valorMini ?? (usaTarifaContrato ? tarifasContrato?.valorMini : null)),
    valorTruck: fmtInput(cfg?.valorTruck ?? (usaTarifaContrato ? tarifasContrato?.valorTruck : null)),
    valorToco: fmtInput(cfg?.valorToco ?? (usaTarifaContrato ? tarifasContrato?.valorToco : null)),
    valorBasculante: fmtInput(cfg?.valorBasculante ?? (usaTarifaContrato ? tarifasContrato?.valorBasculante : null)),
    valorKmLinear: fmtInput(cfg?.valorKmLinear),
    valorM2: fmtInput(cfg?.valorM2),
    valorM2Manual: fmtInput(cfg?.valorM2Manual ?? cfg?.valorM2),
    valorM2Mecanizada: fmtInput(cfg?.valorM2Mecanizada ?? cfg?.valorM2),
    valorPorArvore: fmtInput(cfg?.valorPorArvore),
    valorPorUnidade: fmtInput(cfg?.valorPorUnidade),
    valorPorEquipe: fmtInput(cfg?.valorPorEquipe),
  };
}

export default function ContratoOperacaoUnificada({
  contractId,
  servicos,
  onRefresh,
  tarifasContrato,
}: Props) {
  const { adicionarToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [forms, setForms] = useState<Record<TipoPadrao, FormServico>>(() => {
    const init = {} as Record<TipoPadrao, FormServico>;
    for (const tipo of TIPOS_PADRAO) init[tipo] = formVazio(TIPO_VALOR_INICIAL[tipo]);
    return init;
  });
  const [salvandoValores, setSalvandoValores] = useState(false);
  const [valoresAbertos, setValoresAbertos] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [preview, setPreview] = useState<any>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);

  const porTipo = useCallback((tipo: TipoPadrao) => {
    return servicos.find((s) => s.tipo === tipo) || null;
  }, [servicos]);

  useEffect(() => {
    const next = {} as Record<TipoPadrao, FormServico>;
    for (const tipo of TIPOS_PADRAO) {
      next[tipo] = formFromConfig(tipo, porTipo(tipo)?.configFaturamento, tarifasContrato);
    }
    setForms(next);
  }, [porTipo, servicos, tarifasContrato]);

  const patchForm = (tipo: TipoPadrao, patch: Partial<FormServico>) => {
    setForms((prev) => ({ ...prev, [tipo]: { ...prev[tipo], ...patch } }));
  };

  const salvarValores = async () => {
    setSalvandoValores(true);
    try {
      const jobs: Promise<unknown>[] = [];
      for (const tipo of TIPOS_PADRAO) {
        const servico = porTipo(tipo);
        if (!servico) continue;
        const form = forms[tipo];
        const config = buildConfigFaturamentoFromForm(form.tipoValor, form, {
          dualM2: tipo === 'rocadeira' && form.tipoValor === 'm2',
        });
        jobs.push(servicoService.saveConfigFaturamento(contractId, servico.id, {
          ...(servico.configFaturamento || {}),
          ...config,
        }));
      }
      await Promise.all(jobs);
      adicionarToast('Valores unitários salvos', 'success');
      onRefresh();
    } catch {
      adicionarToast('Erro ao salvar valores unitários', 'error');
    } finally {
      setSalvandoValores(false);
    }
  };

  const processarArquivo = async (file: File) => {
    setArquivo(file);
    setPreview(null);
    setUploading(true);
    setUploadPct(15);
    try {
      // Preview opcional se for CONSOLIDADO (não bloqueia coleta/roçada)
      try {
        const prev = await coletaService.previewServicosUnificados(file);
        if (prev.ehUnificado) {
          setPreview(prev);
          const partes = (prev.porTipo || []).map((p) => `${p.tipoLabel}: ${p.registros}`).join(' · ');
          adicionarToast(`Detectado CONSOLIDADO: ${prev.resumo?.registros ?? 0} reg. (${partes})`, 'success');
        }
      } catch {
        /* preview unificado opcional */
      }

      setUploadPct(55);
      const result = await coletaService.uploadPlanilhaContrato(file, contractId, 'atualizar_data');
      setUploadPct(100);
      const tipoLabel = (result as { tipoDetectadoLabel?: string }).tipoDetectadoLabel;
      adicionarToast(
        result.mensagem
          || (tipoLabel ? `Importado como ${tipoLabel}.` : 'Planilha importada no serviço correspondente.'),
        'success',
      );
      const avisos = (result as { avisos?: string[] }).avisos || [];
      const avisoCiclo = avisos.find((a) => a.includes('ciclo já fechado') || a.includes('ciclo anterior'));
      if (avisoCiclo) {
        adicionarToast(avisoCiclo, 'warning');
      }
      onRefresh();
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error || 'Erro no upload'
        : 'Erro no upload';
      adicionarToast(msg, 'error');
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void processarArquivo(file);
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '0.45rem 0.6rem',
    borderRadius: '8px',
    border: '1px solid #cbd5e1',
    fontSize: '0.82rem',
  };

  const renderCampos = (tipo: TipoPadrao, form: FormServico) => {
    const set = (key: keyof CamposValorForm, value: string) => patchForm(tipo, { [key]: value });

    if (form.tipoValor === 'caminhao') {
      return (
        <div className="contrato-hub-valor-campos">
          {([
            ['valorMini', 'Mini'],
            ['valorTruck', 'Truck'],
            ['valorToco', 'Toco'],
            ['valorBasculante', 'Basculante'],
          ] as const).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                style={inputStyle}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder="0,00"
              />
            </label>
          ))}
        </div>
      );
    }

    if (form.tipoValor === 'm2' && tipo === 'rocadeira') {
      return (
        <div className="contrato-hub-valor-campos">
          <label>
            Manual
            <input
              style={inputStyle}
              value={form.valorM2Manual}
              onChange={(e) => set('valorM2Manual', e.target.value)}
              placeholder="0,00"
            />
          </label>
          <label>
            Mecanizada
            <input
              style={inputStyle}
              value={form.valorM2Mecanizada}
              onChange={(e) => set('valorM2Mecanizada', e.target.value)}
              placeholder="0,00"
            />
          </label>
        </div>
      );
    }

    if (form.tipoValor === 'm2') {
      return (
        <label>
          Valor R$/m²
          <input
            style={inputStyle}
            value={form.valorM2}
            onChange={(e) => set('valorM2', e.target.value)}
            placeholder="0,00"
          />
        </label>
      );
    }

    if (form.tipoValor === 'km_linear') {
      return (
        <label>
          Valor R$/km
          <input
            style={inputStyle}
            value={form.valorKmLinear}
            onChange={(e) => set('valorKmLinear', e.target.value)}
            placeholder="0,00"
          />
        </label>
      );
    }

    if (form.tipoValor === 'por_arvore') {
      return (
        <label>
          Valor R$/árvore
          <input
            style={inputStyle}
            value={form.valorPorArvore}
            onChange={(e) => set('valorPorArvore', e.target.value)}
            placeholder="0,00"
          />
        </label>
      );
    }

    if (form.tipoValor === 'por_unidade') {
      return (
        <label>
          Valor R$/unidade
          <input
            style={inputStyle}
            value={form.valorPorUnidade}
            onChange={(e) => set('valorPorUnidade', e.target.value)}
            placeholder="0,00"
          />
        </label>
      );
    }

    return (
      <label>
        Valor R$/equipe
        <input
          style={inputStyle}
          value={form.valorPorEquipe}
          onChange={(e) => set('valorPorEquipe', e.target.value)}
          placeholder="0,00"
        />
      </label>
    );
  };

  return (
    <div className="contrato-hub-unificado">
      <section className="contrato-hub-card contrato-hub-card--upload">
        <div className="contrato-hub-card-head">
          <FiUpload size={18} />
          <div>
            <strong>Enviar planilha</strong>
            <span>Identificamos o tipo e enviamos ao serviço certo automaticamente</span>
          </div>
        </div>

        <div
          className={`contrato-hub-drop ${dragOver ? 'over' : ''} ${uploading ? 'busy' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.xlsm"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void processarArquivo(f);
            }}
          />
          {uploading ? (
            <>
              <div className="contrato-hub-spin" />
              <p>Detectando tipo e importando... {uploadPct}%</p>
            </>
          ) : (
            <>
              <FiFileText size={32} color="#0f766e" />
              <p><strong>Arraste a planilha</strong> ou clique para selecionar</p>
              <small>CONSOLIDADO / Tabelas (por TIPO DE SERVIÇO) · Coleta · Roçada</small>
            </>
          )}
        </div>

        {arquivo && (
          <div className="contrato-hub-arquivo">
            <FiCheckCircle size={14} /> {arquivo.name}
            {preview?.porTipo?.length > 0 && (
              <ul>
                {preview.porTipo.map((p: any, i: number) => (
                  <li key={i}>
                    <strong>{p.tipoLabel}</strong>: {p.registros} reg. ·{' '}
                    {Number(p.quantitativoTotal || 0).toLocaleString('pt-BR')}
                    {p.undPrincipal ? ` ${p.undPrincipal}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <section className="contrato-hub-card contrato-hub-card--valores">
        <button
          type="button"
          className="contrato-hub-collapse-btn"
          onClick={() => setValoresAbertos((v) => !v)}
          aria-expanded={valoresAbertos}
        >
          <span className="contrato-hub-card-head" style={{ marginBottom: 0 }}>
            <FiDollarSign size={16} />
            <div>
              <strong>Valores unitários</strong>
              <span>Tarifas por serviço — opcional, abra para editar</span>
            </div>
          </span>
          <span className="contrato-hub-collapse-chevron" aria-hidden>{valoresAbertos ? '−' : '+'}</span>
        </button>
        {valoresAbertos && (
          <>
            <div className="contrato-hub-valores-grid">
              {TIPOS_PADRAO.filter((tipo) => porTipo(tipo)).map((tipo) => {
                const form = forms[tipo];
                const wide = form.tipoValor === 'caminhao' || (tipo === 'rocadeira' && form.tipoValor === 'm2');
                return (
                  <div
                    key={tipo}
                    className={`contrato-hub-valor-bloco${wide ? ' contrato-hub-valor-bloco--wide' : ''}`}
                  >
                    <div className="contrato-hub-valor-topo">
                      <h4>{LABELS[tipo]}</h4>
                      <select
                        className="contrato-hub-valor-select"
                        value={form.tipoValor}
                        onChange={(e) => patchForm(tipo, { tipoValor: e.target.value as TipoValor })}
                        aria-label={`Unidade de cobrança — ${LABELS[tipo]}`}
                      >
                        {TIPOS_VALOR_HUB.map((op) => (
                          <option key={op} value={op}>{TIPO_VALOR_LABELS[op]}</option>
                        ))}
                      </select>
                    </div>
                    {renderCampos(tipo, form)}
                  </div>
                );
              })}
            </div>
            <div className="contrato-hub-acoes">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void salvarValores()}
                disabled={salvandoValores}
              >
                {salvandoValores ? 'Salvando...' : 'Salvar valores'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
