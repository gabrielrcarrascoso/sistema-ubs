import { useState, type FormEvent } from 'react';
import { Download, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { useConsulta } from '../../lib/hooks';
import { buscarIndicadores, descreverFormula, NOME_TIPO } from '../../lib/indicadores';
import type { Indicador, TipoIndicador } from '../../lib/types';
import { baixarCSV, dataHoraBR, numOuNull, valorIndicador } from '../../lib/util';
import { BotaoIcone, BarraAba, Dica, Campo, Carregando, Erro, Modal, Painel } from '../../components/ui';

const NOVO: Partial<Indicador> = {
  tipo: 'percentual',
  unidade_medida: '%',
  fator: 100,
  periodicidade: 'Mensal',
  sentido_meta: 'maior',
  ativo: true,
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
    const padrao = { percentual: { unidade_medida: '%', fator: 100 }, contagem: { unidade_medida: 'atendimentos', fator: 1, denominador_desc: null }, razao: { unidade_medida: 'por 1.000', fator: 1000 } }[tipo];
    setEditando({ ...editando, tipo, ...padrao });
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
        ['Código', 'Nome', 'Definição', 'Tipo', 'Unidade', 'Numerador', 'Denominador', 'Fator', 'Fórmula', 'Fonte', 'Periodicidade', 'Meta', 'Sentido da meta', 'Versão', 'Ativo', 'Atualizado em'],
        ...indicadores.map(i => [
          i.codigo, i.nome, i.definicao, NOME_TIPO[i.tipo], i.unidade_medida, i.numerador_desc, i.denominador_desc ?? '',
          i.fator, descreverFormula(i), i.fonte_dados, i.periodicidade, i.meta ?? '', i.sentido_meta === 'maior' ? 'quanto maior melhor' : 'quanto menor melhor',
          i.versao, i.ativo ? 'Sim' : 'Não', dataHoraBR(i.updated_at),
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
        Os indicadores iniciais são sugestões de partida. A Secretaria deve validar definições, fórmulas e metas antes do uso
        oficial. Toda mudança de fórmula gera uma nova versão; lançamentos antigos mantêm a versão com que foram calculados.
      </div>

      {indicadores.map(i => (
        <Painel
          key={i.id}
          titulo={`${i.codigo} · ${i.nome}`}
          acoes={
            <div className="actions">
              {!i.ativo && <span className="chip neutral">Inativo</span>}
              <span className="chip neutral">v{i.versao}</span>
              <span className="chip">{NOME_TIPO[i.tipo]}</span>
              {ehGestor && <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => setEditando(i)} />}
            </div>
          }
        >
          <p>{i.definicao}</p>
          <div className="three" style={{ marginTop: 14 }}>
            <div className="callout"><b>Fórmula</b><br />{descreverFormula(i)}</div>
            <div className="callout"><b>Fonte / origem</b><br />{i.fonte_dados} · {i.periodicidade}</div>
            <div className="callout">
              <b>Meta</b><br />
              {i.meta !== null ? `${i.sentido_meta === 'maior' ? '≥' : '≤'} ${valorIndicador(i.meta, i.unidade_medida)}` : 'Sem meta definida'}
            </div>
          </div>
        </Painel>
      ))}

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
                </select>
              </Campo>
              <Campo rotulo="Nome" className="full"><input required {...up('nome')} /></Campo>
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
              <Campo rotulo="Unidade de medida"><input required {...up('unidade_medida')} /></Campo>
              <Campo rotulo="Fonte dos dados" className="full"><input required {...up('fonte_dados')} /></Campo>
              <Campo rotulo="Periodicidade">
                <select {...up('periodicidade')}>
                  <option>Mensal</option>
                  <option>Quadrimestral</option>
                  <option>Semestral</option>
                  <option>Anual</option>
                </select>
              </Campo>
              <Campo rotulo="Meta" dica="Deixe vazio se não houver.">
                <input type="number" step="any" value={editando.meta ?? ''} onChange={e => setEditando({ ...editando, meta: numOuNull(e.target.value) })} />
              </Campo>
              <Campo rotulo="Interpretação da meta">
                <select {...up('sentido_meta')}>
                  <option value="maior">Quanto maior, melhor</option>
                  <option value="menor">Quanto menor, melhor</option>
                </select>
              </Campo>
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
