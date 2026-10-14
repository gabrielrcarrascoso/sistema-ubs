import type { TipoCampo, ValorCampo } from '../lib/types';
import { dataBR, numeroBR } from '../lib/util';

// Campo de formulário que muda de acordo com o tipo — usado na ficha da UBS e nos questionários

export const NOME_TIPO_CAMPO: Record<TipoCampo, string> = {
  texto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  data: 'Data',
  sim_nao: 'Sim / Não',
  escolha_unica: 'Escolha única',
  multipla_escolha: 'Múltipla escolha',
  escala: 'Escala de 1 a 5',
};

export const TIPO_TEM_OPCOES = (tipo: TipoCampo) => tipo === 'escolha_unica' || tipo === 'multipla_escolha';

/** O valor está vazio? (0 e "Não" contam como preenchidos) */
export function vazio(v: ValorCampo | undefined): boolean {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
}

/** Valor formatado para leitura */
export function mostrarValor(tipo: TipoCampo, v: ValorCampo | undefined): string {
  if (vazio(v)) return '—';
  if (tipo === 'sim_nao') return v ? 'Sim' : 'Não';
  if (tipo === 'numero') return numeroBR(Number(v), 2);
  if (tipo === 'escala') return `${v} de 5`;
  if (tipo === 'data') return dataBR(String(v));
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

export function CampoDinamico({
  tipo,
  opcoes,
  valor,
  aoMudar,
  obrigatorio,
  id,
}: {
  tipo: TipoCampo;
  opcoes: string[];
  valor: ValorCampo | undefined;
  aoMudar: (v: ValorCampo) => void;
  obrigatorio?: boolean;
  id?: string;
}) {
  switch (tipo) {
    case 'texto_longo':
      return <textarea id={id} required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value)} />;

    case 'numero':
      return (
        <input
          id={id}
          type="number"
          step="any"
          required={obrigatorio}
          value={valor === null || valor === undefined ? '' : String(valor)}
          onChange={e => aoMudar(e.target.value === '' ? null : Number(e.target.value))}
        />
      );

    case 'data':
      return <input id={id} type="date" required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value || null)} />;

    case 'sim_nao':
      return (
        <select id={id} required={obrigatorio} value={valor === true ? 'sim' : valor === false ? 'nao' : ''} onChange={e => aoMudar(e.target.value === '' ? null : e.target.value === 'sim')}>
          <option value="">Selecione</option>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      );

    case 'escolha_unica':
      return (
        <select id={id} required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value || null)}>
          <option value="">Selecione</option>
          {opcoes.map(o => <option key={o}>{o}</option>)}
        </select>
      );

    case 'multipla_escolha': {
      const marcados = Array.isArray(valor) ? valor : [];
      return (
        <div className="opcoes">
          {opcoes.map(o => (
            <label key={o} className="opcao">
              <input
                type="checkbox"
                checked={marcados.includes(o)}
                onChange={e => aoMudar(e.target.checked ? [...marcados, o] : marcados.filter(x => x !== o))}
              />{' '}
              {o}
            </label>
          ))}
        </div>
      );
    }

    case 'escala':
      return (
        <div className="opcoes">
          {[1, 2, 3, 4, 5].map(n => (
            <label key={n} className="opcao">
              <input type="radio" name={id} required={obrigatorio} checked={valor === n} onChange={() => aoMudar(n)} /> {n}
            </label>
          ))}
          {!vazio(valor) && (
            <button type="button" className="btn link" onClick={() => aoMudar(null)}>limpar</button>
          )}
        </div>
      );

    default:
      return <input id={id} required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value)} />;
  }
}

/** Converte o texto "uma opção por linha" em lista, sem repetidas */
export function lerOpcoes(texto: string): string[] {
  return [...new Set(texto.split('\n').map(s => s.trim()).filter(Boolean))];
}
