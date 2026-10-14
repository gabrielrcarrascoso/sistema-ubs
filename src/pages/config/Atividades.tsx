import { useState, type FormEvent } from 'react';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { supabase, traduzErro } from '../../lib/supabase';
import { ok, useConsulta } from '../../lib/hooks';
import type { Atividade } from '../../lib/types';
import { BotaoIcone, BarraAba, Carregando, Dica, Erro, Painel } from '../../components/ui';

/** Lista de atividades que aparecem como colunas na matriz de todas as UBS */
export function Atividades() {
  const { dados, carregando, erro: erroQ, recarregar } = useConsulta(
    async () => ok<Atividade[]>(await supabase.from('atividades').select('*').order('ordem')),
    [],
  );
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  if (carregando) return <Carregando />;
  const atividades = dados ?? [];

  async function executar(promessa: PromiseLike<{ error: unknown }>) {
    setErro(null);
    const { error } = await promessa;
    if (error) setErro(traduzErro(error));
    recarregar();
  }

  async function mover(i: number, direcao: -1 | 1) {
    const a = atividades[i];
    const b = atividades[i + direcao];
    if (!a || !b) return;
    await supabase.from('atividades').update({ ordem: b.ordem }).eq('id', a.id);
    await executar(supabase.from('atividades').update({ ordem: a.ordem === b.ordem ? a.ordem + direcao : a.ordem }).eq('id', b.id));
  }

  function adicionar(e: FormEvent) {
    e.preventDefault();
    if (!nova.trim()) return;
    executar(supabase.from('atividades').insert({ nome: nova.trim(), ordem: Math.max(0, ...atividades.map(a => a.ordem)) + 1 }));
    setNova('');
  }

  return (
    <>
      <Dica id="config-atividades">
        Estas são as <b>colunas da matriz</b> “quem faz cada atividade”, iguais para todas as UBS. Ao remover uma atividade,
        ela some da matriz de todas as unidades.
      </Dica>
      <BarraAba texto={`${atividades.length} atividades`} />
      <Erro mensagem={erro || erroQ} />
      <Painel titulo="Atividades da matriz">
        <form className="selectrow" style={{ marginBottom: 14 }} onSubmit={adicionar}>
          <input placeholder="Nome da nova atividade" value={nova} onChange={e => setNova(e.target.value)} style={{ minWidth: 260 }} />
          <button className="btn primary"><Plus size={16} strokeWidth={1.8} /> Adicionar</button>
        </form>
        <div className="tablewrap">
          <table>
            <tbody>
              {atividades.map((a, i) => (
                <tr key={a.id}>
                  <td><b>{a.nome}</b></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn small" disabled={i === 0} onClick={() => mover(i, -1)} title="Subir"><ChevronUp size={14} strokeWidth={2} /></button>{' '}
                    <button className="btn small" disabled={i === atividades.length - 1} onClick={() => mover(i, 1)} title="Descer"><ChevronDown size={14} strokeWidth={2} /></button>{' '}
                    <BotaoIcone icone={Pencil} titulo="Renomear" aoClicar={() => {
                        const nome = prompt('Novo nome da atividade:', a.nome);
                        if (nome?.trim()) executar(supabase.from('atividades').update({ nome: nome.trim() }).eq('id', a.id));
                      }} />{' '}
                    <BotaoIcone icone={Trash2} titulo="Remover" perigo aoClicar={() => confirm(`Remover "${a.nome}" da matriz de TODAS as UBS?`) && executar(supabase.from('atividades').delete().eq('id', a.id))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>
    </>
  );
}
