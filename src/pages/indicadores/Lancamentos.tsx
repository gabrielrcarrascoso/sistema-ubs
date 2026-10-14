import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarPlus, Download, Pencil, Trash2, Upload } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { buscarUnidades, useConsulta } from '../../lib/hooks';
import { buscarIndicadores, buscarLancamentos, calcularValor } from '../../lib/indicadores';
import type { Indicador, Lancamento, Unidade } from '../../lib/types';
import { baixarCSV, dataHoraBR, mesAno, numOuNull, ultimosMeses, valorIndicador } from '../../lib/util';
import { BotaoIcone, Dica, Campo, Carregando, Erro, Modal, Painel } from '../../components/ui';
import { LancarMes } from './LancarMes';

interface Formulario {
  id?: string;
  indicador_id: string;
  unidade_id: string;
  mes: string; // 'AAAA-MM'
  numerador: number | null;
  denominador: number | null;
  fonte: string;
  observacao: string;
}

const mesAnterior = () => ultimosMeses(2)[0].slice(0, 7);

export function Lancamentos() {
  const { perfil, podeEditar } = useAuth();
  const [filtroUnidade, setFiltroUnidade] = useState('');
  const [filtroIndicador, setFiltroIndicador] = useState('');
  const [meses, setMeses] = useState(12);
  const [form, setForm] = useState<Formulario | null>(null);
  const [importando, setImportando] = useState(false);
  const [params] = useSearchParams();
  const [lancandoMes, setLancandoMes] = useState(params.get('novo') === '1'); // vindo do botão "Lançar o mês" do painel
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const baseQ = useConsulta(async () => {
    const [indicadores, unidades] = await Promise.all([buscarIndicadores(true), buscarUnidades()]);
    return { indicadores, unidades };
  }, []);
  const lancQ = useConsulta(
    () => buscarLancamentos({ desde: ultimosMeses(meses)[0], unidadeId: filtroUnidade || undefined, indicadorId: filtroIndicador || undefined }),
    [meses, filtroUnidade, filtroIndicador],
  );

  if (baseQ.carregando) return <Carregando />;
  const indicadores = baseQ.dados?.indicadores ?? [];
  const unidades = baseQ.dados?.unidades ?? [];
  const unidadesEditaveis = unidades.filter(u => podeEditar(u.id));
  const indicadorDoForm = indicadores.find(i => i.id === form?.indicador_id);


  function editar(l: Lancamento) {
    setErro(null);
    setForm({
      id: l.id,
      indicador_id: l.indicador_id,
      unidade_id: l.unidade_id,
      mes: l.competencia.slice(0, 7),
      numerador: Number(l.numerador),
      denominador: l.denominador === null ? null : Number(l.denominador),
      fonte: l.fonte,
      observacao: l.observacao ?? '',
    });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form || !indicadorDoForm) return;
    setErro(null);
    if (form.numerador === null) return setErro('Informe o numerador.');
    if (indicadorDoForm.tipo !== 'contagem' && !form.denominador) return setErro('Informe um denominador maior que zero.');
    if (indicadorDoForm.tipo === 'percentual' && form.numerador > (form.denominador ?? 0))
      if (!confirm('O numerador é maior que o denominador (resultado acima de 100%). Salvar mesmo assim?')) return;
    const registro = {
      indicador_id: form.indicador_id,
      unidade_id: form.unidade_id,
      competencia: `${form.mes}-01`,
      numerador: form.numerador,
      denominador: indicadorDoForm.tipo === 'contagem' ? null : form.denominador,
      fonte: form.fonte.trim(),
      observacao: form.observacao.trim() || null,
    };
    const { error } = form.id
      ? await supabase.from('lancamentos').update(registro).eq('id', form.id)
      : await supabase.from('lancamentos').insert(registro);
    if (error) return setErro(traduzErro(error));
    setForm(null);
    lancQ.recarregar();
  }

  async function remover(l: Lancamento) {
    if (!confirm(`Remover o lançamento de ${l.codigo} · ${l.unidade_nome} · ${mesAno(l.competencia)}?`)) return;
    const { error } = await supabase.from('lancamentos').delete().eq('id', l.id);
    if (error) return setErro(traduzErro(error));
    lancQ.recarregar();
  }

  function exportar() {
    baixarCSV(
      [
        ['codigo', 'indicador', 'unidade', 'competencia', 'numerador', 'denominador', 'valor', 'fonte', 'versao_formula', 'observacao', 'atualizado_em'],
        ...(lancQ.dados ?? []).map(l => [
          l.codigo, l.indicador_nome, l.unidade_nome, l.competencia.slice(0, 7), l.numerador, l.denominador ?? '',
          l.valor ?? '', l.fonte, l.versao_formula, l.observacao ?? '', dataHoraBR(l.updated_at),
        ]),
      ],
      'lancamentos_indicadores.csv',
    );
  }

  const lancamentos = [...(lancQ.dados ?? [])].reverse();

  return (
    <>
      <Dica id="ind-lancar">
        Todo mês, clique em <b>Lançar o mês</b>, escolha a UBS e preencha os números de cada indicador (tirados do
        e-SUS/PEC). O resultado aparece na hora. Para muitos números de uma vez, use <b>Importar planilha</b>.
      </Dica>
      <Erro mensagem={(!form && erro) || baseQ.erro || lancQ.erro} />
      {aviso && <div className="info" style={{ marginBottom: 14 }}>{aviso}</div>}

      <div className="barra-filtros">
        <select value={filtroUnidade} onChange={e => setFiltroUnidade(e.target.value)} aria-label="Unidade">
          <option value="">Todas as UBS</option>
          {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <select value={filtroIndicador} onChange={e => setFiltroIndicador(e.target.value)} aria-label="Indicador">
          <option value="">Todos os indicadores</option>
          {indicadores.map(i => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <select value={meses} onChange={e => setMeses(Number(e.target.value))} aria-label="Período">
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Últimos 12 meses</option>
          <option value={24}>Últimos 24 meses</option>
        </select>
        <div className="actions" style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={exportar} title="Baixar os registros abaixo em planilha"><Download size={16} strokeWidth={1.8} /> Exportar</button>
          {unidadesEditaveis.length > 0 && (
            <>
              <button className="btn" onClick={() => setImportando(true)}><Upload size={16} strokeWidth={1.8} /> Importar planilha</button>
              <button className="btn primary" onClick={() => { setAviso(null); setLancandoMes(true); }} disabled={indicadores.length === 0}>
                <CalendarPlus size={16} strokeWidth={1.8} /> Lançar o mês
              </button>
            </>
          )}
        </div>
      </div>

      <Painel titulo={`Registros (${lancamentos.length})`}>
        {lancQ.carregando ? (
          <Carregando />
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Competência</th>
                  <th>Indicador</th>
                  <th>Unidade</th>
                  <th className="num">Quantidade</th>
                  <th className="num">Total</th>
                  <th className="num">Valor</th>
                  <th>Fonte</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lancamentos.map(l => (
                  <tr key={l.id}>
                    <td>{mesAno(l.competencia)}</td>
                    <td><b>{l.indicador_nome}</b></td>
                    <td>{l.unidade_nome}</td>
                    <td className="num">{Number(l.numerador).toLocaleString('pt-BR')}</td>
                    <td className="num">{l.denominador === null ? '—' : Number(l.denominador).toLocaleString('pt-BR')}</td>
                    <td className="num">
                      <b>{valorIndicador(l.valor, l.unidade_medida)}</b>
                      {l.versao_formula < l.versao_atual && (
                        <span className="chip warn" style={{ marginLeft: 6 }} title="Calculado com uma versão anterior da fórmula">fórmula antiga</span>
                      )}
                    </td>
                    <td className="muted">{l.fonte}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {podeEditar(l.unidade_id) && (
                        <>
                          <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => editar(l)} />
                          <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => remover(l)} />
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {lancamentos.length === 0 && (
                  <tr><td colSpan={8} className="empty">Nenhum número lançado neste período. Clique em “Lançar o mês”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Painel>

      {form && (
        <Modal titulo={form.id ? 'Editar lançamento' : 'Novo lançamento'} aoFechar={() => setForm(null)}>
          <form onSubmit={salvar}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Indicador" className="full">
                <select
                  required
                  value={form.indicador_id}
                  onChange={e => {
                    const ind = indicadores.find(i => i.id === e.target.value);
                    setForm({ ...form, indicador_id: e.target.value, fonte: form.fonte || ind?.fonte_dados || '' });
                  }}
                >
                  {indicadores.map(i => <option key={i.id} value={i.id}>{i.codigo} · {i.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Unidade">
                <select required value={form.unidade_id} onChange={e => setForm({ ...form, unidade_id: e.target.value })}>
                  {unidadesEditaveis.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Mês de competência">
                <input type="month" required value={form.mes} onChange={e => setForm({ ...form, mes: e.target.value })} />
              </Campo>
              <Campo rotulo="Numerador" dica={indicadorDoForm?.numerador_desc} className={indicadorDoForm?.tipo === 'contagem' ? 'full' : ''}>
                <input type="number" min={0} step="any" required value={form.numerador ?? ''} onChange={e => setForm({ ...form, numerador: numOuNull(e.target.value) })} />
              </Campo>
              {indicadorDoForm?.tipo !== 'contagem' && (
                <Campo rotulo="Denominador" dica={indicadorDoForm?.denominador_desc ?? ''}>
                  <input type="number" min={0} step="any" required value={form.denominador ?? ''} onChange={e => setForm({ ...form, denominador: numOuNull(e.target.value) })} />
                </Campo>
              )}
              <Campo rotulo="Fonte do dado" className="full" dica="Sistema/relatório de onde o número foi tirado (rastreabilidade).">
                <input required value={form.fonte} onChange={e => setForm({ ...form, fonte: e.target.value })} />
              </Campo>
              <Campo rotulo="Observação" className="full">
                <textarea value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} />
              </Campo>
            </div>
            {indicadorDoForm && (
              <div className="info" style={{ marginTop: 14 }}>
                Resultado: <b>{valorIndicador(calcularValor(indicadorDoForm.tipo, indicadorDoForm.fator, form.numerador, form.denominador), indicadorDoForm.unidade_medida)}</b>
                {indicadorDoForm.meta !== null && <> · meta {indicadorDoForm.sentido_meta === 'maior' ? '≥' : '≤'} {valorIndicador(indicadorDoForm.meta, indicadorDoForm.unidade_medida)}</>}
                {' '}· fórmula v{indicadorDoForm.versao}
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      {lancandoMes && unidadesEditaveis.length > 0 && (
        <LancarMes
          indicadores={indicadores}
          unidades={unidadesEditaveis}
          unidadeInicial={perfil?.unidade_id && podeEditar(perfil.unidade_id) ? perfil.unidade_id : unidadesEditaveis[0]?.id ?? ''}
          mesInicial={mesAnterior()}
          aoFechar={() => setLancandoMes(false)}
          aoSalvar={n => {
            setLancandoMes(false);
            setAviso(`${n} indicador(es) salvo(s) com sucesso.`);
            lancQ.recarregar();
          }}
        />
      )}

      {importando && (
        <ImportarPlanilha
          indicadores={indicadores}
          unidades={unidadesEditaveis}
          aoFechar={() => setImportando(false)}
          aoImportar={() => lancQ.recarregar()}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Importação de planilha CSV (etapa "Receber" da proposta APS Data)
// ---------------------------------------------------------------------------

interface LinhaImportada {
  linha: number;
  original: string[];
  erro: string | null;
  registro?: {
    indicador_id: string;
    unidade_id: string;
    competencia: string;
    numerador: number;
    denominador: number | null;
    fonte: string;
    observacao: string | null;
  };
}

function lerCSV(texto: string): string[][] {
  const linhas = texto.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  const separador = (linhas[0]?.match(/;/g)?.length ?? 0) >= (linhas[0]?.match(/,/g)?.length ?? 0) ? ';' : ',';
  return linhas.map(l => {
    const campos: string[] = [];
    let atual = '';
    let aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"') {
        if (aspas && l[i + 1] === '"') { atual += '"'; i++; } else aspas = !aspas;
      } else if (c === separador && !aspas) { campos.push(atual.trim()); atual = ''; }
      else atual += c;
    }
    campos.push(atual.trim());
    return campos;
  });
}

function lerMes(v: string): string | null {
  let m = v.match(/^(\d{4})-(\d{1,2})(-\d{1,2})?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-01`;
  m = v.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}-01`;
  return null;
}

const lerNumero = (v: string) => (v.trim() === '' ? null : numOuNull(v.replace(/\.(?=\d{3}(\D|$))/g, '')));
const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

function ImportarPlanilha({
  indicadores,
  unidades,
  aoFechar,
  aoImportar,
}: {
  indicadores: Indicador[];
  unidades: Unidade[];
  aoFechar: () => void;
  aoImportar: () => void;
}) {
  const [linhas, setLinhas] = useState<LinhaImportada[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function baixarModelo() {
    baixarCSV(
      [
        ['codigo', 'unidade', 'competencia', 'numerador', 'denominador', 'fonte', 'observacao'],
        [indicadores[0]?.codigo ?? 'PROD-01', unidades[0]?.nome ?? 'Nome da UBS', mesAnterior(), '1240', '', 'e-SUS APS / PEC', ''],
      ],
      'modelo_importacao_indicadores.csv',
    );
  }

  async function aoEscolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro(null);
    setResultado(null);
    const tabela = lerCSV(await arquivo.text());
    if (tabela.length < 2) return setErro('O arquivo está vazio ou só tem o cabeçalho.');
    const cab = tabela[0].map(normalizar);
    const col = (nome: string) => cab.indexOf(nome);
    const obrigatorias = ['codigo', 'unidade', 'competencia', 'numerador'];
    const faltando = obrigatorias.filter(c => col(c) < 0);
    if (faltando.length) return setErro(`Colunas obrigatórias ausentes: ${faltando.join(', ')}. Baixe o modelo.`);

    const vistos = new Set<string>();
    setLinhas(
      tabela.slice(1).map((cel, idx): LinhaImportada => {
        const pegar = (nome: string) => (col(nome) >= 0 ? cel[col(nome)] ?? '' : '');
        const base = { linha: idx + 2, original: cel };
        const ind = indicadores.find(i => normalizar(i.codigo) === normalizar(pegar('codigo')));
        if (!ind) return { ...base, erro: `Indicador "${pegar('codigo')}" não existe no dicionário` };
        const uni = unidades.find(u => normalizar(u.nome) === normalizar(pegar('unidade')) || u.slug === pegar('unidade'));
        if (!uni) return { ...base, erro: `Unidade "${pegar('unidade')}" não encontrada ou sem permissão` };
        const competencia = lerMes(pegar('competencia'));
        if (!competencia) return { ...base, erro: 'Competência inválida (use AAAA-MM ou MM/AAAA)' };
        const numerador = lerNumero(pegar('numerador'));
        if (numerador === null || numerador < 0) return { ...base, erro: 'Numerador ausente ou inválido' };
        const denominador = lerNumero(pegar('denominador'));
        if (ind.tipo !== 'contagem' && !denominador) return { ...base, erro: 'Denominador obrigatório e maior que zero' };
        const fonte = pegar('fonte') || ind.fonte_dados;
        const chave = `${ind.id}|${uni.id}|${competencia}`;
        if (vistos.has(chave)) return { ...base, erro: 'Linha duplicada no arquivo (mesmo indicador, unidade e mês)' };
        vistos.add(chave);
        return {
          ...base,
          erro: null,
          registro: {
            indicador_id: ind.id,
            unidade_id: uni.id,
            competencia,
            numerador,
            denominador: ind.tipo === 'contagem' ? null : denominador,
            fonte,
            observacao: pegar('observacao') || null,
          },
        };
      }),
    );
  }

  async function importar() {
    const validas = (linhas ?? []).filter(l => l.registro).map(l => l.registro!);
    if (!validas.length) return;
    setEnviando(true);
    setErro(null);
    // upsert: se já existir lançamento do mesmo indicador/unidade/mês, ele é atualizado
    const { error } = await supabase.from('lancamentos').upsert(validas, { onConflict: 'indicador_id,unidade_id,competencia' });
    setEnviando(false);
    if (error) return setErro(traduzErro(error));
    setResultado(`${validas.length} lançamento(s) importado(s) com sucesso.`);
    setLinhas(null);
    aoImportar();
  }

  const validas = linhas?.filter(l => !l.erro).length ?? 0;
  const invalidas = (linhas?.length ?? 0) - validas;

  return (
    <Modal titulo="Importar planilha de indicadores" aoFechar={aoFechar}>
      <p className="muted">
        Envie um arquivo <b>CSV</b> (no Excel, use “Salvar como” e escolha CSV) com as colunas{' '}
        <code>codigo; unidade; competencia; numerador; denominador; fonte; observacao</code>. Lançamentos já existentes
        para o mesmo indicador, unidade e mês serão <b>atualizados</b>. Somente dados agregados — nunca dados de pacientes.
      </p>
      <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
        <button className="btn" onClick={baixarModelo}><Download size={16} strokeWidth={1.8} /> Baixar modelo</button>
        <input type="file" accept=".csv,text/csv" onChange={e => aoEscolherArquivo(e.target.files?.[0])} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Erro mensagem={erro} />
        {resultado && <div className="info">{resultado}</div>}
      </div>
      {linhas && (
        <>
          <div className="selectrow" style={{ margin: '6px 0 10px' }}>
            <span className="chip">{validas} válida(s)</span>
            {invalidas > 0 && <span className="chip bad">{invalidas} com erro (serão ignoradas)</span>}
          </div>
          <div className="tablewrap" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr><th>Linha</th><th>Conteúdo</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.linha}>
                    <td>{l.linha}</td>
                    <td className="muted">{l.original.join(' · ')}</td>
                    <td>{l.erro ? <span className="chip bad">{l.erro}</span> : <span className="chip">OK</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <div className="actions">
        <button className="btn" onClick={aoFechar}>Fechar</button>
        {linhas && <button className="btn primary" disabled={!validas || enviando} onClick={importar}>{enviando ? 'Importando…' : `Importar ${validas} linha(s)`}</button>}
      </div>
    </Modal>
  );
}
