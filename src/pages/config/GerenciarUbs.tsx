import { useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import { useConfirmar } from '../../components/Confirmacao';
import { supabase, traduzErro } from '../../lib/supabase';
import { limparMemoria, ok, useConsulta } from '../../lib/hooks';
import type { Unidade } from '../../lib/types';
import { BarraAba, Carregando, Dica, Erro } from '../../components/ui';
import { buscarCamposFicha } from './CamposFicha';
import { ModalFicha } from '../ubs/ModalFicha';
import { ModalExcluirUbs } from '../ubs/ModalExcluirUbs';

/** Todas as UBS (ativas e desativadas) com editar, desativar/reativar e excluir. Só o administrador geral chega aqui. */
export function GerenciarUbs() {
  const confirmar = useConfirmar();
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Unidade> | null>(null);
  const [excluir, setExcluir] = useState<Unidade | null>(null);
  const unidadesQ = useConsulta(
    async () => ok<Unidade[]>(await supabase.from('unidades').select('*').order('ativa', { ascending: false }).order('nome')),
    [],
  );
  const camposQ = useConsulta(() => buscarCamposFicha(true), [], 'campos-ficha');

  if (unidadesQ.carregando || camposQ.carregando) return <Carregando />;
  const unidades = unidadesQ.dados ?? [];
  const ativas = unidades.filter(u => u.ativa).length;

  /** depois de mudar algo, as outras telas buscam a lista de UBS de novo */
  function atualizar() {
    limparMemoria();
    unidadesQ.recarregar();
  }

  async function mudarSituacao(u: Unidade, ativa: boolean) {
    const pergunta = ativa
      ? `Reativar "${u.nome}"? Ela volta a aparecer em todas as telas.`
      : `Desativar "${u.nome}"? A UBS some das telas, mas todos os dados ficam guardados e dá para reativar aqui depois.`;
    if (!(await confirmar(pergunta, ativa ? { botao: 'Reativar' } : { perigo: true, botao: 'Desativar' }))) return;
    setErro(null);
    const { error } = await supabase.from('unidades').update({ ativa }).eq('id', u.id);
    if (error) return setErro(traduzErro(error));
    atualizar();
  }

  return (
    <>
      <Dica id="config-ubs">
        Aqui ficam todas as UBS do sistema. <b>Desativar</b> tira a UBS das telas, mas guarda todos os dados, e dá para reativar
        quando quiser. <b>Excluir</b> apaga a UBS e tudo o que é dela, de vez: use só quando tiver certeza.
      </Dica>
      <BarraAba
        texto={<><b>{ativas}</b> {ativas === 1 ? 'UBS ativa' : 'UBS ativas'}{unidades.length > ativas && <> · {unidades.length - ativas} desativada(s)</>}</>}
        acoes={<button className="btn primary" onClick={() => setEditando({ nome: '', dados_ficha: {} })}><Plus size={16} strokeWidth={1.8} /> Nova UBS</button>}
      />
      <Erro mensagem={erro || unidadesQ.erro || camposQ.erro} />

      {unidades.length === 0 ? (
        <div className="callout">Nenhuma UBS cadastrada. Clique em “Nova UBS”.</div>
      ) : (
        <div className="tablewrap">
          <table className="tabela-ubs">
            <thead>
              <tr><th>UBS</th><th>Situação</th><th className="num">Ações</th></tr>
            </thead>
            <tbody>
              {unidades.map(u => (
                <tr key={u.id} className={u.ativa ? '' : 'desativada'}>
                  <td>
                    <b>{u.nome}</b>
                    {u.horario && <div className="muted">{u.horario}</div>}
                  </td>
                  <td>{u.ativa ? <span className="chip">Ativa</span> : <span className="chip neutral">Desativada</span>}</td>
                  <td className="num">
                    <span className="acoes-ubs">
                      <button className="btn small" onClick={() => setEditando(u)} title="Alterar nome, horário e ficha"><Pencil size={14} strokeWidth={1.8} /> Editar</button>
                      {u.ativa ? (
                        <button className="btn small" onClick={() => mudarSituacao(u, false)} title="Some das telas, mas os dados ficam guardados"><Archive size={14} strokeWidth={1.8} /> Desativar</button>
                      ) : (
                        <button className="btn small" onClick={() => mudarSituacao(u, true)} title="Volta a aparecer em todas as telas"><ArchiveRestore size={14} strokeWidth={1.8} /> Reativar</button>
                      )}
                      <button className="btn small danger" onClick={() => setExcluir(u)} title="Apaga a UBS e todos os dados dela"><Trash2 size={14} strokeWidth={1.8} /> Excluir</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <ModalFicha
          inicial={editando}
          campos={camposQ.dados ?? []}
          podeDesativar={false}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            atualizar();
          }}
        />
      )}
      {excluir && (
        <ModalExcluirUbs
          unidade={excluir}
          aoFechar={() => setExcluir(null)}
          aoDesativar={excluir.ativa ? () => { const u = excluir; setExcluir(null); mudarSituacao(u, false); } : undefined}
          aoExcluir={() => {
            setExcluir(null);
            atualizar();
          }}
        />
      )}
    </>
  );
}
