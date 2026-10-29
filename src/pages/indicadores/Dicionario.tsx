import { useState, type FormEvent } from 'react';
import { ChevronRight, Download, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { useConsulta } from '../../lib/hooks';
import { buscarIndicadores, descreverFormula, NOME_TIPO } from '../../lib/indicadores';
import type { Indicador, TipoIndicador } from '../../lib/types';
import { baixarCSV, dataHoraBR, numOuNull, valorIndicador } from '../../lib/util';
import { BotaoIcone, BarraAba, Dica, Campo, Carregando, Erro, Modal } from '../../components/ui';

const NOVO: Partial<Indicador> = {
  tipo: 'percentual',
  unidade_medida: '%',
  fator: 100,
  periodicidade: 'Mensal',
  sentido_meta: 'maior',
  ativo: true,
  situacao_dados: 'Pendente validação',
  numerador_ate_denominador: false,
};

const PADRAO_DO_TIPO: Record<TipoIndicador, Partial<Indicador>> = {
  percentual: { unidade_medida: '%', fator: 100 },
  contagem: { unidade_medida: 'atendimentos', fator: 1, denominador_desc: null },
  razao: { unidade_medida: 'por 1.000', fator: 1000 },
  complemento: { unidade_medida: '%', fator: 100, numerador_ate_denominador: true },
  variacao: { unidade_medida: '%', fator: 100 },
};

export function Dicionario() {
  const { ehGestor } = useAuth();
  const indicadoresQ = useConsulta(() => buscarIndicadores(false), []);
  const [editando, setEditando] = useState<Partial<Indicador> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (indicadoresQ.carregando) return <Carregando />;
  const indicadores = indicadoresQ.dados ?? [];

  function mudarTipo(tipo: TipoIndicador) {
    if (!editando) return;
    setEditando({ ...editando, tipo, ...PADRAO_DO_TIPO[tipo] });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    setErro(null);
    const registro = {
      codigo: editando.codigo?.trim().toUpperCase(),
      nome: editando.nome?.trim(),
      definicao: editando.definicao?.trim(),
      tipo: editando.tipo,
      unidade_medida: editando.unidade_medida?.trim() || '%',
      numerador_desc: editando.numerador_desc?.trim(),
      denominador_desc: editando.tipo === 'contagem' ? null : editando.denominador_desc?.trim() || null,
      fator: editando.fator ?? 1,
      fonte_dados: editando.fonte_dados?.trim(),
      periodicidade: editando.periodicidade || 'Mensal',
      meta: editando.meta ?? null,
      sentido_meta: editando.sentido_meta ?? 'maior',
      ativo: editando.ativo ?? true,
      origem: editando.origem?.trim() || null,
      variavel_a: editando.variavel_a?.trim() || null,
      variavel_b: editando.tipo === 'contagem' ? null : editando.variavel_b?.trim() || null,
      granularidade: editando.granularidade?.trim() || null,
      criterio: editando.criterio?.trim() || null,
      situacao_dados: editando.situacao_dados?.trim() || 'Pendente validação',
      numerador_ate_denominador: editando.tipo !== 'contagem' && (editando.numerador_ate_denominador ?? false),
    };
    const { error } = editando.id
      ? await supabase.from('indicadores').update(registro).eq('id', editando.id)
      : await supabase.from('indicadores').insert(registro);
    if (error) return setErro(traduzErro(error));
    setEditando(null);
    indicadoresQ.recarregar();
  }

  function exportar() {
    baixarCSV(
      [
        ['Código', 'Nome', 'Origem', 'Definição', 'Tipo', 'Unidade', 'Numerador', 'Variável A', 'Denominador', 'Variável B', 'Fator', 'Fórmula', 'Fonte', 'Periodicidade', 'Granularidade', 'Meta', 'Sentido da meta', 'Critério / cautela', 'Situação dos dados', 'Versão', 'Ativo', 'Atualizado em'],
        ...indicadores.map(i => [
          i.codigo, i.nome, i.origem ?? '', i.definicao, NOME_TIPO[i.tipo], i.unidade_medida, i.numerador_desc, i.variavel_a ?? '', i.denominador_desc ?? '', i.variavel_b ?? '',
          i.fator, descreverFormula(i), i.fonte_dados, i.periodicidade, i.granularidade ?? '', i.meta ?? '', i.sentido_meta === 'maior' ? 'quanto maior melhor' : 'quanto menor melhor',
          i.criterio ?? '', i.situacao_dados, i.versao, i.ativo ? 'Sim' : 'Não', dataHoraBR(i.updated_at),
        ]),
      ],
      'dicionario_indicadores.csv',
    );
  }

  const up = (campo: keyof Indicador) => ({
    value: (editando?.[campo] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setEditando({ ...editando, [campo]: e.target.value }),
  });

  return (
    <>
      <Dica id="ind-definicoes">
        A “receita” de cada indicador: o que conta, como calcula, de onde vem o dado e qual a meta. Assim todas as UBS calculam do mesmo jeito.
      </Dica>
      <BarraAba acoes={
          <>
            <button className="btn" onClick={exportar}><Download size={16} strokeWidth={1.8} /> Exportar dicionário</button>
            {ehGestor && <button className="btn primary" onClick={() => setEditando(NOVO)}><Plus size={16} strokeWidth={1.8} /> Novo indicador</button>}
          </>
        }
      />
      <Erro mensagem={(!editando && erro) || indicadoresQ.erro} />

      <div className="alert" style={{ marginBottom: 20 }}>
        I1 a I6 vêm da tese de Santos (2026), com as metas originais; C1 e C2 foram propostos no projeto e ainda não têm meta.
        Todos dependem de validação das variáveis e das fontes antes do uso oficial. Quando o denominador é zero ou não foi
        informado, o sistema não calcula (nunca mostra um 0% artificial). Toda mudança de fórmula gera uma nova versão.
      </div>

      <div className="lista-definicoes">
        {indicadores.map(i => (
          <details key={i.id} className="definicao">
            <summary>
              <ChevronRight size={16} strokeWidth={2} className="seta" />
              <span className="definicao-nome">
                <b>{i.nome}</b>
                <small>{i.codigo} · {i.origem ? `${i.origem} · ` : ''}{NOME_TIPO[i.tipo]}{!i.ativo && ' · inativo'}</small>
              </span>
              {i.ativo && <span className={`chip ${/^validad/i.test(i.situacao_dados) ? '' : 'warn'}`}>{i.situacao_dados}</span>}
              <span className="chip neutral">
                {i.meta !== null ? `Meta ${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'Sem meta'}
              </span>
              {ehGestor && (
                <span onClick={e => e.preventDefault()}>
                  <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => setEditando(i)} />
                </span>
              )}
            </summary>
            <div className="definicao-corpo">
              <p>{i.definicao}</p>
              <div className="ficha-grid" style={{ marginTop: 12 }}>
                <div className="ficha-item"><span>Como calcula</span>{descreverFormula(i)}</div>
                <div className="ficha-item"><span>De onde vem o dado</span>{i.fonte_dados} · {i.periodicidade}</div>
                {i.granularidade && <div className="ficha-item"><span>Granularidade</span>{i.granularidade}</div>}
                {i.variavel_a && (
                  <div className="ficha-item">
                    <span>Variáveis</span>
                    <code>{i.variavel_a}</code>{i.variavel_b && <> · <code>{i.variavel_b}</code></>}
                    {i.numerador_ate_denominador && <small className="muted"> (A nunca maior que B)</small>}
                  </div>
                )}
                <div className="ficha-item"><span>Versão da fórmula</span>v{i.versao}</div>
              </div>
              {i.criterio && <div className="callout" style={{ marginTop: 12 }}><b>Cautela:</b> {i.criterio}</div>}
            </div>
          </details>
        ))}
      </div>

      {editando && (
        <Modal titulo={editando.id ? `Editar ${editando.codigo}` : 'Novo indicador'} aoFechar={() => setEditando(null)}>
          <form onSubmit={salvar}>
            <Erro mensagem={erro} />
            <div className="form-grid cols-2">
              <Campo rotulo="Código" dica="Ex.: PRE-02 (único)"><input required {...up('codigo')} /></Campo>
              <Campo rotulo="Tipo">
                <select value={editando.tipo} onChange={e => mudarTipo(e.target.value as TipoIndicador)}>
                  <option value="percentual">Percentual (%)</option>
                  <option value="contagem">Contagem (total)</option>
                  <option value="razao">Razão / taxa</option>
                  <option value="complemento">Percentual complementar: (1 − A ÷ B) × 100</option>
                  <option value="variacao">Variação: (A − B) ÷ B × 100</option>
                </select>
              </Campo>
              <Campo rotulo="Nome"><input required {...up('nome')} /></Campo>
              <Campo rotulo="Origem" dica="Ex.: Tese — Santos (2026)"><input {...up('origem')} /></Campo>
              <Campo rotulo="Definição" className="full"><textarea required {...up('definicao')} /></Campo>
              <Campo rotulo="Numerador (o que é contado)" className={editando.tipo === 'contagem' ? 'full' : ''}>
                <input required {...up('numerador_desc')} />
              </Campo>
              {editando.tipo !== 'contagem' && (
                <Campo rotulo="Denominador (população de referência)"><input required {...up('denominador_desc')} /></Campo>
              )}
              {editando.tipo !== 'contagem' && (
                <Campo rotulo="Fator de multiplicação" dica="100 para %, 1.000 para taxa por mil, 1 para razão simples">
                  <input type="number" min={0} step="any" required value={editando.fator ?? ''} onChange={e => setEditando({ ...editando, fator: numOuNull(e.target.value) ?? undefined })} />
                </Campo>
              )}
              <Campo rotulo="Variável A (chave técnica)" dica="Ex.: consultas_concluidas"><input {...up('variavel_a')} /></Campo>
              {editando.tipo !== 'contagem' && (
                <Campo rotulo="Variável B (chave técnica)" dica="Ex.: entradas_totais"><input {...up('variavel_b')} /></Campo>
              )}
              {editando.tipo !== 'contagem' && (
                <Campo rotulo="Numerador maior que o denominador?">
                  <select value={editando.numerador_ate_denominador ? 'nao' : 'sim'} onChange={e => setEditando({ ...editando, numerador_ate_denominador: e.target.value === 'nao' })}>
                    <option value="sim">Pode acontecer (só avisa)</option>
                    <option value="nao">Nunca: bloquear o lançamento</option>
                  </select>
                </Campo>
              )}
              <Campo rotulo="Unidade de medida"><input required {...up('unidade_medida')} /></Campo>
              <Campo rotulo="Fonte dos dados" className="full"><input required {...up('fonte_dados')} /></Campo>
              <Campo rotulo="Periodicidade">
                <select {...up('periodicidade')}>
                  <option>Mensal</option>
                  <option>Quadrimestral</option>
                  <option>Semestral</option>
                  <option>Anual</option>
                  <option>Por avaliação</option>
                </select>
              </Campo>
              <Campo rotulo="Granularidade" dica="Ex.: UBS / período"><input {...up('granularidade')} /></Campo>
              <Campo rotulo="Meta" dica="Deixe vazio se não houver.">
                <input type="number" step="any" value={editando.meta ?? ''} onChange={e => setEditando({ ...editando, meta: numOuNull(e.target.value) })} />
              </Campo>
              <Campo rotulo="Interpretação da meta">
                <select {...up('sentido_meta')}>
                  <option value="maior">Quanto maior, melhor</option>
                  <option value="menor">Quanto menor, melhor</option>
                </select>
              </Campo>
              <Campo rotulo="Critério / cautela de interpretação" className="full"><textarea {...up('criterio')} /></Campo>
              <Campo rotulo="Situação dos dados" dica="Ex.: Pendente validação, Validado"><input {...up('situacao_dados')} /></Campo>
              <Campo rotulo="Situação">
                <select value={editando.ativo ? 'sim' : 'nao'} onChange={e => setEditando({ ...editando, ativo: e.target.value === 'sim' })}>
                  <option value="sim">Ativo (aparece no painel)</option>
                  <option value="nao">Inativo</option>
                </select>
              </Campo>
            </div>
            {editando.id && (
              <div className="callout" style={{ marginTop: 12 }}>
                Alterar tipo, numerador, denominador ou fator cria a versão v{(editando.versao ?? 1) + 1} da fórmula.
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setEditando(null)}>Cancelar</button>
              <button className="btn primary">Salvar</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
