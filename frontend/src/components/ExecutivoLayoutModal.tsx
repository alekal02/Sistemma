import { useState, useEffect } from 'react';
import { FiX, FiCheck, FiRefreshCw, FiLayout } from 'react-icons/fi';
import {
  WIDGETS_EXECUTIVO,
  GRUPOS_EXECUTIVO,
  LAYOUT_PADRAO_IDS,
  widgetsPorGrupo,
  contarAtivos,
  type GrupoExecutivo,
} from '../config/executivoLayout';

interface ExecutivoLayoutModalProps {
  ativo: Set<string>;
  onSalvar: (ids: Set<string>) => void;
  onFechar: () => void;
}

const GRUPOS_ORDEM: GrupoExecutivo[] = ['financeiro', 'operacional', 'graficos', 'analises'];

export default function ExecutivoLayoutModal({ ativo, onSalvar, onFechar }: ExecutivoLayoutModalProps) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set(ativo));

  useEffect(() => {
    setSelecionados(new Set(ativo));
  }, [ativo]);

  const toggle = (id: string) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleGrupo = (grupo: GrupoExecutivo, ligar: boolean) => {
    const ids = widgetsPorGrupo(grupo).map(w => w.id);
    setSelecionados(prev => {
      const next = new Set(prev);
      if (ligar) {
        ids.forEach(id => next.add(id));
      } else {
        const restantes = WIDGETS_EXECUTIVO.filter(w => !ids.includes(w.id) && next.has(w.id));
        if (restantes.length === 0 && ids.length > 0) return prev;
        ids.forEach(id => next.delete(id));
        if (next.size === 0 && ids.length > 0) next.add(ids[0]);
      }
      return next;
    });
  };

  const restaurarPadrao = () => setSelecionados(new Set(LAYOUT_PADRAO_IDS));

  const grupoTodoAtivo = (grupo: GrupoExecutivo) =>
    widgetsPorGrupo(grupo).every(w => selecionados.has(w.id));

  const grupoParcial = (grupo: GrupoExecutivo) => {
    const lista = widgetsPorGrupo(grupo);
    const n = lista.filter(w => selecionados.has(w.id)).length;
    return n > 0 && n < lista.length;
  };

  return (
    <div className="exec-layout-overlay" onClick={onFechar}>
      <div className="exec-layout-modal" onClick={e => e.stopPropagation()}>
        <div className="exec-layout-header">
          <div>
            <h2><FiLayout size={18} /> Personalizar dashboard</h2>
            <p>Escolha quais indicadores, gráficos e análises aparecem na tela executiva.</p>
          </div>
          <button type="button" className="exec-layout-close" onClick={onFechar} aria-label="Fechar">
            <FiX size={18} />
          </button>
        </div>

        <div className="exec-layout-body">
          {GRUPOS_ORDEM.map(grupo => {
            const meta = GRUPOS_EXECUTIVO[grupo];
            const widgets = widgetsPorGrupo(grupo);
            const todos = grupoTodoAtivo(grupo);
            const parcial = grupoParcial(grupo);

            return (
              <section key={grupo} className="exec-layout-grupo">
                <div className="exec-layout-grupo-header">
                  <span className="exec-layout-grupo-bar" style={{ background: meta.cor }} />
                  <span className="exec-layout-grupo-titulo">{meta.titulo}</span>
                  <button
                    type="button"
                    className="exec-layout-grupo-toggle"
                    onClick={() => toggleGrupo(grupo, !todos)}
                  >
                    {todos ? 'Remover todos' : parcial ? 'Marcar todos' : 'Adicionar todos'}
                  </button>
                </div>
                <ul className="exec-layout-lista">
                  {widgets.map(w => (
                    <li key={w.id}>
                      <label className={`exec-layout-item ${selecionados.has(w.id) ? 'ativo' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(w.id)}
                          onChange={() => toggle(w.id)}
                        />
                        <span className="exec-layout-item-texto">
                          <strong>{w.label}</strong>
                          {w.descricao && <small>{w.descricao}</small>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="exec-layout-footer">
          <span className="exec-layout-contador">
            {contarAtivos(selecionados)} de {WIDGETS_EXECUTIVO.length} itens ativos
          </span>
          <div className="exec-layout-acoes">
            <button type="button" className="btn btn-sm" onClick={restaurarPadrao}>
              <FiRefreshCw size={12} /> Restaurar padrão
            </button>
            <button type="button" className="btn btn-sm" onClick={onFechar}>Cancelar</button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onSalvar(selecionados)}
            >
              <FiCheck size={12} /> Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
