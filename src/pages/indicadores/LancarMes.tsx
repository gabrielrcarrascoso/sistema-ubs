import { useEffect, useState, type FormEvent } from 'react';
import { useConfirmar } from '../../components/Confirmacao';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok } from '../../lib/hooks';
import { calcularValor } from '../../lib/indicadores';
import type { Indicador, Lancamento, Unidade } from '../../lib/types';
import { atingiuMeta, lerNumeroBR, mesAno, valorIndicador } from '../../lib/util';
import { Campo, Erro, Modal } from '../../components/ui';

interface Linha {
  numerador: string;
  denominador: string;
}

/** Lança (ou corrige) todos os indicadores de uma UBS em um mês, numa única tela */
export function LancarMes({
  indicadores,
  unidades,
  unidadeInicial,
  mesInicial,
  aoFechar,
  aoSalvar,
}: {
  indicadores: Indicador[];
  unidades: Unidade[];
  unidadeInicial: string;
  mesInicial: string; // 'AAAA-MM'
  aoFechar: () => void;
  aoSalvar: (quantos: number) => void;
}) {
  const confirmar = useConfirmar();
  const [unidadeId, setUnidadeId] = useState(unidadeInicial);
  const [mes, setMes] = useState(mesInicial);
  const [fonte, setFonte] = useState('');
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ao trocar UBS ou mês, traz o que já foi lançado para corrigir
  useEffect(() => {
    if (!unidadeId || !mes) return;
    let cancelado = false;
    setCarregando(true);
    supabase
      .from('lancamentos')
      .select('*')
      .eq('unidade_id', unidadeId)
      .eq('competencia', `${mes}-01`)
      .then(resp => {
        if (cancelado) return;
        try {
          const lista = ok<Lancamento[]>(resp);
          setLinhas(
            Object.fromEntries(
              lista.map(l => [l.indicador_id, { numerador: String(l.numerador), denominador: l.denominador === null ? '' : String(l.denominador) }]),
            ),
          );
          setExistentes(new Set(lista.map(l => l.indicador_id)));
        } catch (e) {
          setErro(traduzErro(e));
        }
        setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [unidadeId, mes]);

  const mudar = (id: string, campo: keyof Linha, v: string) =>
    setLinhas({ ...linhas, [id]: { ...(linhas[id] ?? { numerador: '', denominador: '' }), [campo]: v } });

  const preenchidos = indicadores.filter(i => (linhas[i.id]?.numerador ?? '').trim() !== '');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!preenchidos.length) return setErro('Preencha pelo menos um indicador.');
    const problemas: string[] = [];
    const acima100: string[] = [];
    const registros = preenchidos.map(i => {
      const num = lerNumeroBR(linhas[i.id].numerador);
      const den = lerNumeroBR(linhas[i.id].denominador ?? '');
      if (num === null || num < 0) problemas.push(`${i.codigo}: número inválido`);
      if (i.tipo !== 'contagem' && !den) problemas.push(`${i.codigo}: informe o total (denominador)`);
      if (i.tipo === 'percentual' && num !== null && den && num > den) acima100.push(i.codigo);
      return {
        indicador_id: i.id,
        unidade_id: unidadeId,
        competencia: `${mes}-01`,
        numerador: num ?? 0,
        denominador: i.tipo === 'contagem' ? null : den,
        fonte: fonte.trim() || i.fonte_dados,
      };
    });
    if (problemas.length) return setErro(problemas.join(' · '));
    if (acima100.length && !(await confirmar(`Em ${acima100.join(', ')} o resultado passa de 100%. Salvar mesmo assim?`, { botao: 'Salvar assim mesmo' }))) return;
    setSalvando(true);
    const { error } = await supabase.from('lancamentos').upsert(registros, { onConflict: 'indicador_id,unidade_id,competencia' });
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    aoSalvar(registros.length);
  }

  return (
    <Modal titulo="Lançar indicadores do mês" aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <div className="form-grid cols-2">
          <Campo rotulo="UBS">
            <select value={unidadeId} onChange={e => setUnidadeId(e.target.value)}>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Campo>
          <Campo rotulo="Mês">
            <input type="month" required value={mes} onChange={e => setMes(e.target.value)} />
          </Campo>
        </div>

        <p className="muted" style={{ margin: '14px 0 8px' }}>
          Preencha só os indicadores que você tem. {existentes.size > 0 && <b>Os números já lançados em {mesAno(`${mes}-01`)} aparecem preenchidos — altere se precisar corrigir.</b>}
        </p>

        <div className="tablewrap">
          <table className="tabela-lancar">
            <thead>
              <tr>
                <th>Indicador</th>
                <th className="num">Quantidade</th>
                <th className="num">Total (de)</th>
                <th className="num">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map(i => {
                const l = linhas[i.id];
                const valor = l ? calcularValor(i.tipo, Number(i.fator), lerNumeroBR(l.numerador), lerNumeroBR(l.denominador)) : null;
                const meta = atingiuMeta(valor, i.meta, i.sentido_meta);
                return (
                  <tr key={i.id}>
                    <td>
                      <b>{i.nome}</b>
                      {existentes.has(i.id) && <span className="chip neutral" style={{ marginLeft: 6 }}>já lançado</span>}
                      <div className="muted" style={{ fontSize: 11.5 }}>{i.numerador_desc}{i.denominador_desc ? ` ÷ ${i.denominador_desc}` : ''}</div>
                    </td>
                    <td className="num">
                      <input
                        inputMode="decimal"
                        aria-label={`${i.nome}: quantidade`}
                        value={l?.numerador ?? ''}
                        onChange={e => mudar(i.id, 'numerador', e.target.value)}
                        disabled={carregando}
                      />
                    </td>
                    <td className="num">
                      {i.tipo === 'contagem' ? (
                        <span className="muted">—</span>
                      ) : (
                        <input
                          inputMode="decimal"
                          aria-label={`${i.nome}: total`}
                          value={l?.denominador ?? ''}
                          onChange={e => mudar(i.id, 'denominador', e.target.value)}
                          disabled={carregando}
                        />
                      )}
                    </td>
                    <td className="num">
                      {valor === null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span className={`chip ${meta === null ? 'neutral' : meta ? '' : 'bad'}`}>{valorIndicador(valor, i.unidade_medida)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Campo rotulo="Fonte dos dados (opcional)" dica="Se ficar em branco, usa a fonte padrão de cada indicador (ex.: e-SUS APS / PEC)." className="full">
          <input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Ex.: Relatório de produção do PEC, emitido em 05/10" />
        </Campo>

        <div style={{ marginTop: 12 }}><Erro mensagem={erro} /></div>
        <div className="actions">
          <span className="muted" style={{ marginRight: 'auto' }}>{preenchidos.length} de {indicadores.length} preenchido(s)</span>
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primary" disabled={salvando || carregando}>{salvando ? 'Salvando…' : 'Salvar mês'}</button>
        </div>
      </form>
    </Modal>
  );
}
