import { useEffect, useState, type FormEvent } from 'react';
import { useConfirmar } from '../../components/Confirmacao';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok } from '../../lib/hooks';
import { calcularValor, descreverFormula, excedeDenominador } from '../../lib/indicadores';
import type { Indicador, Lancamento, Unidade } from '../../lib/types';
import { atingiuMeta, lerNumeroBR, mesAno, valorIndicador } from '../../lib/util';
import { Campo, Erro, Modal } from '../../components/ui';
import { SeloSituacao } from '../../components/graficos';
import { CODIGO_ATENDIMENTOS } from '../../lib/paineis';

interface Linha {
  numerador: string;
  denominador: string;
}

/** '2026-10' -> '2026-09' */
const mesAnteriorDe = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

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
  const [dataExtracao, setDataExtracao] = useState(() => new Date().toLocaleDateString('sv-SE')); // hoje, AAAA-MM-DD
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [existentes, setExistentes] = useState<Set<string>>(new Set());
  // o mês anterior da mesma UBS: mostrado como referência e usado para preencher o "mês anterior" do C1
  const [anterior, setAnterior] = useState<Record<string, { numerador: number; valor: number | null }>>({});
  const [preenchidoDoMesAnterior, setPreenchidoDoMesAnterior] = useState<Set<string>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Ao trocar UBS ou mês, traz o que já foi lançado para corrigir
  useEffect(() => {
    if (!unidadeId || !mes) return;
    let cancelado = false;
    setCarregando(true);
    Promise.all([
      supabase.from('lancamentos').select('*').eq('unidade_id', unidadeId).eq('competencia', `${mes}-01`),
      supabase.from('v_lancamentos').select('indicador_id, numerador, valor').eq('unidade_id', unidadeId).eq('competencia', `${mesAnteriorDe(mes)}-01`),
    ]).then(([resp, respAnt]) => {
      if (cancelado) return;
      try {
        const lista = ok<Lancamento[]>(resp);
        const ant = ok<{ indicador_id: string; numerador: number; valor: number | null }[]>(respAnt);
        const novas: Record<string, Linha> = Object.fromEntries(
          lista.map(l => [l.indicador_id, { numerador: String(l.numerador), denominador: l.denominador === null ? '' : String(l.denominador) }]),
        );
        // C1: o "mês anterior" é o número de atendimentos já lançado no mês anterior
        const c1 = indicadores.find(i => i.codigo === CODIGO_ATENDIMENTOS);
        const c1Antes = c1 && ant.find(a => a.indicador_id === c1.id);
        const auto = new Set<string>();
        if (c1 && c1Antes && !novas[c1.id]) {
          novas[c1.id] = { numerador: '', denominador: String(c1Antes.numerador) };
          auto.add(c1.id);
        }
        setLinhas(novas);
        setExistentes(new Set(lista.map(l => l.indicador_id)));
        setAnterior(Object.fromEntries(ant.map(a => [a.indicador_id, { numerador: Number(a.numerador), valor: a.valor === null ? null : Number(a.valor) }])));
        setPreenchidoDoMesAnterior(auto);
      } catch (e) {
        setErro(traduzErro(e));
      }
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, [unidadeId, mes, indicadores]);

  const mudar = (id: string, campo: keyof Linha, v: string) =>
    setLinhas({ ...linhas, [id]: { ...(linhas[id] ?? { numerador: '', denominador: '' }), [campo]: v } });

  const preenchidos = indicadores.filter(i => (linhas[i.id]?.numerador ?? '').trim() !== '');

  /** Problema de um indicador, mostrado embaixo dele enquanto a pessoa digita (e que impede salvar) */
  function problemaDe(i: Indicador): string | null {
    const l = linhas[i.id];
    if (!l || l.numerador.trim() === '') return null;
    const num = lerNumeroBR(l.numerador);
    const den = lerNumeroBR(l.denominador ?? '');
    if (num === null || num < 0) return 'Número inválido: use só algarismos (ex.: 1.240 ou 92,5).';
    if (i.tipo !== 'contagem' && !den) return `Informe também: ${i.denominador_desc}. Ele precisa ser maior que zero.`;
    if (excedeDenominador(i, num, den)) return `${i.numerador_desc} não pode ser maior que ${i.denominador_desc?.toLowerCase()}.`;
    return null;
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!preenchidos.length) return setErro('Preencha pelo menos um indicador.');
    const comProblema = preenchidos.filter(i => problemaDe(i));
    if (comProblema.length) return setErro(`Corrija ${comProblema.map(i => i.codigo).join(', ')} (veja a mensagem embaixo de cada um).`);
    const acima100 = preenchidos.filter(i => {
      const num = lerNumeroBR(linhas[i.id].numerador), den = lerNumeroBR(linhas[i.id].denominador ?? '');
      return i.tipo === 'percentual' && num !== null && den && num > den;
    });
    const registros = preenchidos.map(i => ({
      indicador_id: i.id,
      unidade_id: unidadeId,
      competencia: `${mes}-01`,
      numerador: lerNumeroBR(linhas[i.id].numerador) ?? 0,
      denominador: i.tipo === 'contagem' ? null : lerNumeroBR(linhas[i.id].denominador ?? ''),
      fonte: fonte.trim() || i.fonte_dados,
      data_extracao: dataExtracao || null,
    }));
    if (acima100.length && !(await confirmar(`Em ${acima100.map(i => i.codigo).join(', ')} o resultado passa de 100%. Isso pode acontecer, mas confira os números. Salvar mesmo assim?`, { botao: 'Salvar assim mesmo' }))) return;
    setSalvando(true);
    const { error } = await supabase.from('lancamentos').upsert(registros, { onConflict: 'indicador_id,unidade_id,competencia' });
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    aoSalvar(registros.length);
  }

  const mensais = indicadores.filter(i => i.periodicidade === 'Mensal');
  const outros = indicadores.filter(i => i.periodicidade !== 'Mensal');

  const item = (i: Indicador) => {
    const l = linhas[i.id];
    const valor = l ? calcularValor(i.tipo, Number(i.fator), lerNumeroBR(l.numerador), lerNumeroBR(l.denominador)) : null;
    const meta = atingiuMeta(valor, i.meta, i.sentido_meta);
    const problema = problemaDe(i);
    const antes = anterior[i.id];
    return (
      <div key={i.id} className={`lancar-item ${problema ? 'com-erro' : ''}`}>
        <div className="lancar-item-info">
          <span className="lancar-item-nome">
            <span className="ind-codigo">{i.codigo}</span>
            <b>{i.nome}</b>
            {existentes.has(i.id) && <span className="chip neutral">já lançado</span>}
          </span>
          <small>{descreverFormula(i)}</small>
          {antes?.valor !== null && antes?.valor !== undefined && <small>Em {mesAno(mesAnteriorDe(mes) + '-01')}: <b>{valorIndicador(antes.valor, i.unidade_medida)}</b></small>}
        </div>
        <div className={`lancar-item-campos ${i.tipo === 'contagem' ? 'um' : ''}`}>
          <label className="field">
            <span className="label">{i.numerador_desc}</span>
            <input inputMode="decimal" aria-invalid={!!problema || undefined} value={l?.numerador ?? ''} onChange={e => mudar(i.id, 'numerador', e.target.value)} disabled={carregando} />
          </label>
          {i.tipo !== 'contagem' && (
            <label className="field">
              <span className="label">{i.denominador_desc}</span>
              <input inputMode="decimal" aria-invalid={!!problema || undefined} value={l?.denominador ?? ''} onChange={e => mudar(i.id, 'denominador', e.target.value)} disabled={carregando} />
              {preenchidoDoMesAnterior.has(i.id) && <span className="hint">Preenchido com os atendimentos de {mesAno(mesAnteriorDe(mes) + '-01')} já lançados. Altere se precisar.</span>}
            </label>
          )}
        </div>
        <div className="lancar-item-resultado">
          <span className="lancar-item-valor">{valor === null ? '—' : valorIndicador(valor, i.unidade_medida)}</span>
          {valor !== null && <SeloSituacao situacao={meta === null ? 'sem_meta' : meta ? 'atingiu' : 'abaixo'} />}
          <small>{i.meta !== null ? `meta ${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'sem meta'}</small>
        </div>
        {problema && <span className="erro-campo lancar-item-erro" role="alert">{problema}</span>}
      </div>
    );
  };

  return (
    <Modal titulo={`Lançar ${mes ? mesAno(`${mes}-01`) : 'o mês'}`} aoFechar={aoFechar}>
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

        <p className="muted" style={{ margin: '14px 0 10px' }}>
          Preencha só os números que você tem, tirados do e-SUS/PEC. O resultado aparece na hora, ao lado.
          {existentes.size > 0 && <> <b>O que já foi lançado em {mesAno(`${mes}-01`)} aparece preenchido: altere se precisar corrigir.</b></>}
        </p>

        <h3 className="lancar-grupo">Todo mês <small>{mensais.filter(i => preenchidos.includes(i)).length} de {mensais.length}</small></h3>
        <div className="lancar-lista">{mensais.map(item)}</div>
        {outros.length > 0 && (
          <>
            <h3 className="lancar-grupo">Por avaliação <small>preencha só no mês em que houve a avaliação</small></h3>
            <div className="lancar-lista">{outros.map(item)}</div>
          </>
        )}

        <div className="form-grid cols-2" style={{ marginTop: 14 }}>
          <Campo rotulo="Fonte dos dados (opcional)" dica="Se ficar em branco, usa a fonte padrão de cada indicador (ex.: e-SUS APS / PEC).">
            <input value={fonte} onChange={e => setFonte(e.target.value)} placeholder="Ex.: Relatório de produção do PEC, emitido em 05/10" />
          </Campo>
          <Campo rotulo="Data de extração" dica="Quando os números foram tirados do sistema. Ficam como “a validar” até alguém conferir.">
            <input type="date" value={dataExtracao} onChange={e => setDataExtracao(e.target.value)} />
          </Campo>
        </div>

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
