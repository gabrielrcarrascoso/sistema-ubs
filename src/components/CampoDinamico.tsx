import { Check } from 'lucide-react';
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
        <Pilulas
          opcoes={['Sim', 'Não']}
          marcado={o => (o === 'Sim' ? valor === true : valor === false)}
          aoClicar={o => {
            const v = o === 'Sim';
            aoMudar(valor === v ? null : v); // clicar de novo desmarca
          }}
        />
      );

    case 'escolha_unica':
      // até 6 opções: botões; mais que isso: lista suspensa
      if (opcoes.length > 6) {
        return (
          <select id={id} required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value || null)}>
            <option value="">Selecione</option>
            {opcoes.map(o => <option key={o}>{o}</option>)}
          </select>
        );
      }
      return <Pilulas opcoes={opcoes} marcado={o => valor === o} aoClicar={o => aoMudar(valor === o ? null : o)} />;

    case 'multipla_escolha': {
      const marcados = Array.isArray(valor) ? valor : [];
      return (
        <Pilulas
          multipla
          opcoes={opcoes}
          marcado={o => marcados.includes(o)}
          aoClicar={o => aoMudar(marcados.includes(o) ? marcados.filter(x => x !== o) : [...marcados, o])}
        />
      );
    }

    case 'escala':
      return (
        <Pilulas
          opcoes={['1', '2', '3', '4', '5']}
          marcado={o => valor === Number(o)}
          aoClicar={o => aoMudar(valor === Number(o) ? null : Number(o))}
          quadradas
        />
      );

    default:
      return <input id={id} required={obrigatorio} value={(valor as string) ?? ''} onChange={e => aoMudar(e.target.value)} />;
  }
}

/** Botões de escolha, grandes o bastante para tocar no celular */
function Pilulas({
  opcoes,
  marcado,
  aoClicar,
  multipla,
  quadradas,
}: {
  opcoes: string[];
  marcado: (o: string) => boolean;
  aoClicar: (o: string) => void;
  multipla?: boolean;
  quadradas?: boolean;
}) {
  return (
    <div className={`pilulas ${quadradas ? 'quadradas' : ''}`} role={multipla ? 'group' : 'radiogroup'}>
      {opcoes.map(o => {
        const ativo = marcado(o);
        return (
          <button
            key={o}
            type="button"
            role={multipla ? 'checkbox' : 'radio'}
            aria-checked={ativo}
            className={`pilula ${ativo ? 'ativa' : ''}`}
            onClick={() => aoClicar(o)}
          >
            {multipla && <Check size={14} strokeWidth={2.4} className="pilula-check" />}
            {o}
          </button>
        );
      })}
    </div>
  );
}

/** Converte o texto "uma opção por linha" em lista, sem repetidas */
export function lerOpcoes(texto: string): string[] {
  return [...new Set(texto.split('\n').map(s => s.trim()).filter(Boolean))];
}
