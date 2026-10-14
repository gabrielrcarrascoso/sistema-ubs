import { useState, type FormEvent } from 'react';
import { supabase, traduzErro } from '../../lib/supabase';
import type { CampoFicha, Unidade } from '../../lib/types';
import { numOuNull } from '../../lib/util';
import { Campo, Erro, Modal } from '../../components/ui';
import { CampoDinamico, vazio } from '../../components/CampoDinamico';
import { agruparPorSecao } from '../config/CamposFicha';

/** Janela para criar uma UBS nova ou editar a ficha completa de uma existente */
export function ModalFicha({
  inicial,
  campos,
  podeDesativar,
  aoFechar,
  aoSalvar,
}: {
  inicial: Partial<Unidade>;
  campos: CampoFicha[];
  podeDesativar: boolean;
  aoFechar: () => void;
  aoSalvar: (idSalvo: string) => void;
}) {
  const [u, setU] = useState<Partial<Unidade>>({ dados_ficha: {}, ...inicial });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const texto = (campo: keyof Unidade) => ({
    value: (u[campo] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => setU({ ...u, [campo]: e.target.value }),
  });

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const ficha = u.dados_ficha ?? {};
    const faltando = campos.filter(c => c.obrigatorio && vazio(ficha[c.id])).map(c => c.nome);
    if (faltando.length) return setErro(`Preencha os campos obrigatórios: ${faltando.join(', ')}.`);
    const nome = u.nome?.trim() ?? '';
    const registro = {
      nome,
      horario: u.horario || null,
      volume_estimado: u.volume_estimado || null,
      pico: u.pico || null,
      profissionais_declarados: u.profissionais_declarados ?? null,
      observacao: u.observacao || null,
      dados_ficha: ficha,
    };
    setSalvando(true);
    if (u.id) {
      const { error } = await supabase.from('unidades').update(registro).eq('id', u.id);
      setSalvando(false);
      if (error) return setErro(traduzErro(error));
      aoSalvar(u.id);
    } else {
      const slug = nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);
      const { data, error } = await supabase.from('unidades').insert({ ...registro, slug }).select('id').single();
      setSalvando(false);
      if (error) return setErro(traduzErro(error));
      aoSalvar(data.id);
    }
  }

  async function desativar() {
    if (!u.id) return;
    if (!confirm(`Desativar "${u.nome}"?\n\nA UBS some das telas, mas todos os dados ficam guardados. Ela pode ser reativada em Configurações.`)) return;
    const { error } = await supabase.from('unidades').update({ ativa: false }).eq('id', u.id);
    if (error) return setErro(traduzErro(error));
    aoSalvar('');
  }

  return (
    <Modal titulo={u.id ? `Editar ficha · ${inicial.nome}` : 'Cadastrar nova UBS'} aoFechar={aoFechar}>
      <form onSubmit={salvar}>
        <Erro mensagem={erro} />
        <div className="ficha-secao"><h3>Dados gerais</h3></div>
        <div className="form-grid cols-2">
          <Campo rotulo="Nome da UBS / turno *" className="full">
            <input required {...texto('nome')} />
          </Campo>
          <Campo rotulo="Horário de funcionamento"><input {...texto('horario')} placeholder="Ex.: 07h–17h" /></Campo>
          <Campo rotulo="Nº de profissionais (declarado)">
            <input
              type="number"
              min={0}
              value={u.profissionais_declarados ?? ''}
              onChange={e => setU({ ...u, profissionais_declarados: numOuNull(e.target.value) })}
            />
          </Campo>
          <Campo rotulo="Atendimentos (estimativa)"><input {...texto('volume_estimado')} placeholder="Ex.: ≈30/dia" /></Campo>
          <Campo rotulo="Dias / horários de maior movimento"><input {...texto('pico')} /></Campo>
          <Campo rotulo="Observação" className="full"><textarea {...texto('observacao')} /></Campo>
        </div>

        {agruparPorSecao(campos).map(([secao, lista]) => (
          <div key={secao} style={{ marginTop: 18 }}>
            <div className="ficha-secao"><h3>{secao}</h3></div>
            <div className="form-grid cols-2">
              {lista.map(c => (
                <Campo
                  key={c.id}
                  rotulo={c.nome + (c.obrigatorio ? ' *' : '')}
                  dica={c.ajuda ?? undefined}
                  className={c.tipo === 'texto_longo' || c.tipo === 'multipla_escolha' ? 'full' : ''}
                >
                  <CampoDinamico
                    id={`campo-${c.id}`}
                    tipo={c.tipo}
                    opcoes={c.opcoes}
                    valor={u.dados_ficha?.[c.id]}
                    aoMudar={v => setU({ ...u, dados_ficha: { ...u.dados_ficha, [c.id]: v } })}
                  />
                </Campo>
              ))}
            </div>
          </div>
        ))}

        <div className="actions">
          {podeDesativar && u.id && (
            <button type="button" className="btn danger" style={{ marginRight: 'auto' }} onClick={desativar}>
              Desativar UBS
            </button>
          )}
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primary" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}
