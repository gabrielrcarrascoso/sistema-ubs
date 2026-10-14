import { useState, type FormEvent } from 'react';
import { Download, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { useConfirmar } from '../../components/Confirmacao';
import { useAuth } from '../../auth/AuthProvider';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { Coleta as ColetaT, Unidade } from '../../lib/types';
import { baixarCSV, dataBR, numeroBR, numOuNull } from '../../lib/util';
import { BotaoIcone, BarraAba, Campo, Carregando, Dica, Erro, EstadoVazio, Modal, Painel } from '../../components/ui';
import { CampoDinamico } from '../../components/CampoDinamico';

type Formulario = Partial<ColetaT>;

/** Cálculo indicativo de capacidade (mesma lógica do protótipo) */
export function calcularCapacidade(c: Formulario) {
  const demanda = c.demanda_semanal ?? 0;
  const duracao = c.duracao_media_min ?? 0;
  const profissionais = c.profissionais_habilitados ?? 0;
  const horas = c.horas_semana_profissional ?? 0;
  if (!(demanda > 0 && duracao > 0 && profissionais > 0 && horas > 0)) return null;
  const necessaria = (demanda * duracao) / 60;
  const capacidade = profissionais * horas;
  return { necessaria, capacidade, ocupacao: (necessaria / capacidade) * 100, folga: capacidade - necessaria };
}

const classeOcupacao = (o: number) => (o > 100 ? 'bad' : o > 85 ? 'warn' : '');

/** Visitas de campo e cálculo de capacidade de uma UBS */
export function AbaColetas({ unidade }: { unidade: Unidade }) {
  const confirmar = useConfirmar();
  const { perfil, podeEditar } = useAuth();
  const unidadeId = unidade.id;
  const [form, setForm] = useState<Formulario | null>(null); // null = janela fechada
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const coletasQ = useConsulta(
    async () =>
      ok<ColetaT[]>(
        await supabase
          .from('coletas')
          .select('*')
          .eq('unidade_id', unidadeId)
          .order('data_visita', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
      ),
    [unidadeId],
  );

  const editavel = podeEditar(unidadeId);
  const coletas = coletasQ.dados ?? [];

  const nova = () => {
    setErro(null);
    setForm({ responsavel: perfil?.nome ?? '', data_visita: new Date().toISOString().slice(0, 10) });
  };

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setErro(null);
    setSalvando(true);
    const registro = {
      unidade_id: unidadeId,
      responsavel: form.responsavel || null,
      data_visita: form.data_visita || null,
      total_confirmado: form.total_confirmado ?? null,
      escalas_disponiveis: form.escalas_disponiveis || null,
      atividade: form.atividade || null,
      demanda_semanal: form.demanda_semanal ?? null,
      duracao_media_min: form.duracao_media_min ?? null,
      profissionais_habilitados: form.profissionais_habilitados ?? null,
      horas_semana_profissional: form.horas_semana_profissional ?? null,
      fonte: form.fonte || null,
      observacao: form.observacao || null,
    };
    const { error } = form.id
      ? await supabase.from('coletas').update(registro).eq('id', form.id)
      : await supabase.from('coletas').insert(registro);
    setSalvando(false);
    if (error) return setErro(traduzErro(error));
    setAviso(form.id ? 'Visita atualizada.' : 'Visita registrada.');
    setForm(null);
    coletasQ.recarregar();
  }

  async function remover(c: ColetaT) {
    if (!(await confirmar('Remover o registro desta visita?', { perigo: true }))) return;
    const { error } = await supabase.from('coletas').delete().eq('id', c.id);
    if (error) return setErro(traduzErro(error));
    coletasQ.recarregar();
  }

  async function exportarTudo() {
    const { data, error } = await supabase.from('coletas').select('*, unidades(nome)').order('data_visita');
    if (error) return setErro(traduzErro(error));
    const linhas = [
      ['UBS', 'Responsável', 'Data', 'Total confirmado', 'Escalas', 'Atividade', 'Demanda semanal', 'Duração média (min)',
        'Profissionais habilitados', 'Horas efetivas/semana', 'Carga necessária (h)', 'Capacidade (h)', 'Ocupação (%)', 'Fonte', 'Observações'],
      ...(data as (ColetaT & { unidades: { nome: string } | null })[]).map(c => {
        const k = calcularCapacidade(c);
        return [c.unidades?.nome, c.responsavel, dataBR(c.data_visita), c.total_confirmado, c.escalas_disponiveis, c.atividade,
          c.demanda_semanal, c.duracao_media_min, c.profissionais_habilitados, c.horas_semana_profissional,
          k ? numeroBR(k.necessaria) : '', k ? numeroBR(k.capacidade) : '', k ? numeroBR(k.ocupacao) : '', c.fonte, c.observacao];
      }),
    ];
    baixarCSV(linhas, 'visitas_de_campo.csv');
  }

  return (
    <>
      <Dica id="ubs-coletas">
        Registre aqui cada <b>visita de campo</b> à UBS. Se quiser, preencha também o <b>cálculo de capacidade</b> de uma
        atividade: o sistema diz se a equipe dá conta da demanda. <b>Não insira dados de pacientes.</b>
      </Dica>
      <BarraAba
        acoes={
          <>
            <button className="btn" onClick={exportarTudo} title="Planilha com as visitas de todas as UBS"><Download size={16} strokeWidth={1.8} /> Exportar (todas as UBS)</button>
            {editavel && <button className="btn primary" onClick={nova}><Plus size={16} strokeWidth={1.8} /> Registrar visita</button>}
          </>
        }
      />
      <Erro mensagem={(!form && erro) || coletasQ.erro} />
      {aviso && <div className="info" style={{ marginBottom: 14 }}>{aviso}</div>}

      {coletasQ.carregando ? (
        <Carregando />
      ) : coletas.length === 0 ? (
        <EstadoVazio icone={MapPin} titulo="Nenhuma visita registrada nesta UBS">
          {editavel ? 'Clique em “Registrar visita” depois de cada ida a campo.' : 'Quando houver visitas registradas, elas aparecem aqui.'}
        </EstadoVazio>
      ) : (
        <Painel titulo={`Visitas (${coletas.length})`}>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Responsável</th>
                  <th>Atividade analisada</th>
                  <th className="num">Carga / capacidade</th>
                  <th className="num">Ocupação</th>
                  {editavel && <th></th>}
                </tr>
              </thead>
              <tbody>
                {coletas.map(c => {
                  const k = calcularCapacidade(c);
                  return (
                    <tr key={c.id}>
                      <td>{dataBR(c.data_visita)}</td>
                      <td>{c.responsavel}</td>
                      <td>{c.atividade || <span className="none">—</span>}</td>
                      <td className="num">{k ? `${numeroBR(k.necessaria)}h / ${numeroBR(k.capacidade)}h` : '—'}</td>
                      <td className="num">{k ? <span className={`chip ${classeOcupacao(k.ocupacao)}`}>{numeroBR(k.ocupacao)}%</span> : '—'}</td>
                      {editavel && (
                        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <BotaoIcone icone={Pencil} titulo="Editar" aoClicar={() => { setErro(null); setForm(c); }} />
                          <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => remover(c)} />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted" style={{ marginTop: 10 }}>
            Ocupação acima de 85% fica amarela; acima de 100% (demanda maior que a capacidade), vermelha.
          </p>
        </Painel>
      )}

      {form && <FormularioVisita form={form} setForm={setForm} unidade={unidade} erro={erro} salvando={salvando} aoSalvar={salvar} />}
    </>
  );
}

function FormularioVisita({
  form,
  setForm,
  unidade,
  erro,
  salvando,
  aoSalvar,
}: {
  form: Formulario;
  setForm: (f: Formulario | null) => void;
  unidade: Unidade;
  erro: string | null;
  salvando: boolean;
  aoSalvar: (e: FormEvent) => void;
}) {
  const calculo = calcularCapacidade(form);
  const texto = (campo: keyof Formulario) => ({
    value: (form[campo] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [campo]: e.target.value }),
  });
  const numero = (campo: keyof Formulario) => ({
    type: 'number',
    min: 0,
    step: 'any',
    value: (form[campo] as number | null) ?? '',
    onChange: (e: { target: { value: string } }) => setForm({ ...form, [campo]: numOuNull(e.target.value) }),
  });

  return (
    <Modal titulo={`${form.id ? 'Editar visita' : 'Registrar visita'} · ${unidade.nome}`} aoFechar={() => setForm(null)}>
      <form onSubmit={aoSalvar}>
        <Erro mensagem={erro} />
        <div className="ficha-secao"><h3>Sobre a visita</h3></div>
        <div className="form-grid cols-2">
          <Campo rotulo="Responsável pela coleta"><input {...texto('responsavel')} /></Campo>
          <Campo rotulo="Data da visita"><input type="date" {...texto('data_visita')} /></Campo>
          <Campo rotulo="Profissionais confirmados na visita"><input {...numero('total_confirmado')} /></Campo>
          <Campo rotulo="Há escalas individuais por profissional?">
            <CampoDinamico tipo="escolha_unica" opcoes={['Sim', 'Não', 'Parcial']} valor={form.escalas_disponiveis ?? null} aoMudar={v => setForm({ ...form, escalas_disponiveis: (v as string) ?? null })} />
          </Campo>
          <Campo rotulo="Fonte / evidência" className="full" dica="Ex.: entrevista com a enfermeira coordenadora, escala impressa, relatório do PEC">
            <input {...texto('fonte')} />
          </Campo>
          <Campo rotulo="Observações" className="full">
            <textarea placeholder="O que foi verificado e o que ainda falta levantar…" {...texto('observacao')} />
          </Campo>
        </div>

        <div className="ficha-secao" style={{ marginTop: 20 }}><h3>Cálculo de capacidade (opcional)</h3></div>
        <p className="muted" style={{ marginBottom: 10 }}>Para uma atividade, a equipe consegue atender a demanda da semana?</p>
        <div className="form-grid cols-2">
          <Campo rotulo="Atividade analisada" className="full" dica="Ex.: Consulta de enfermagem"><input {...texto('atividade')} /></Campo>
          <Campo rotulo="Atendimentos por semana"><input {...numero('demanda_semanal')} /></Campo>
          <Campo rotulo="Minutos por atendimento (média)"><input {...numero('duracao_media_min')} /></Campo>
          <Campo rotulo="Profissionais que fazem a atividade"><input {...numero('profissionais_habilitados')} /></Campo>
          <Campo rotulo="Horas por semana de cada um"><input {...numero('horas_semana_profissional')} /></Campo>
        </div>
        {calculo ? (
          <div className={calculo.necessaria > calculo.capacidade ? 'alert' : 'info'} style={{ marginTop: 14 }}>
            A atividade precisa de <b>{numeroBR(calculo.necessaria)}h</b> por semana e a equipe tem <b>{numeroBR(calculo.capacidade)}h</b> →
            ocupação de <b>{numeroBR(calculo.ocupacao)}%</b>.{' '}
            {calculo.necessaria > calculo.capacidade
              ? `Faltam ${numeroBR(-calculo.folga)}h por semana.`
              : `Sobram ${numeroBR(calculo.folga)}h por semana.`}{' '}
            <span className="muted">(estimativa simples, não é uma escala)</span>
          </div>
        ) : (
          <p className="muted" style={{ marginTop: 10 }}>Preencha os 4 números para ver o resultado. Campos vazios não contam como zero.</p>
        )}

        <div className="actions">
          <button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button>
          <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Registrar visita'}</button>
        </div>
      </form>
    </Modal>
  );
}
