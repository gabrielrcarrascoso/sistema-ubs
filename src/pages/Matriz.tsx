import { useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { supabase, traduzErro } from '../lib/supabase';
import { buscarUnidades, ok, useConsulta, useUnidadeEscolhida } from '../lib/hooks';
import type { Atividade, Competencia, Equipe, Nivel } from '../lib/types';
import { baixarCSV, NOME_NIVEL, ORDEM_NIVEL } from '../lib/util';
import { Cabecalho, Carregando, Erro, Modal, NivelTag, Painel, SeletorUnidade } from '../components/ui';

export function Matriz() {
  const { perfil, podeEditar, ehGestor } = useAuth();
  const unidadesQ = useConsulta(buscarUnidades, []);
  const [unidadeId, setUnidadeId] = useUnidadeEscolhida(unidadesQ.dados, perfil?.unidade_id);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gerenciando, setGerenciando] = useState(false);

  const atividadesQ = useConsulta(async () => ok<Atividade[]>(await supabase.from('atividades').select('*').order('ordem')), []);
  const dadosQ = useConsulta(async () => {
    if (!unidadeId) return { equipes: [] as Equipe[], niveis: new Map<string, Nivel>() };
    const equipes = ok<Equipe[]>(await supabase.from('equipes').select('*').eq('unidade_id', unidadeId).order('ordem'));
    const comps = equipes.length
      ? ok<Competencia[]>(await supabase.from('competencias').select('*').in('equipe_id', equipes.map(e => e.id)))
      : [];
    return { equipes, niveis: new Map(comps.map(c => [`${c.equipe_id}|${c.atividade_id}`, c.nivel])) };
  }, [unidadeId]);

  if (unidadesQ.carregando || atividadesQ.carregando) return <Carregando />;

  const unidades = unidadesQ.dados ?? [];
  const atividades = atividadesQ.dados ?? [];
  const colunas = atividades.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()));
  const editavel = podeEditar(unidadeId);
  const nivelDe = (eq: string, at: string): Nivel => dadosQ.dados?.niveis.get(`${eq}|${at}`) ?? 'nao';

  async function alternar(equipeId: string, atividadeId: string) {
    if (!editavel || !dadosQ.dados) return;
    const atual = nivelDe(equipeId, atividadeId);
    const proximo = ORDEM_NIVEL[(ORDEM_NIVEL.indexOf(atual) + 1) % ORDEM_NIVEL.length];
    setErro(null);
    const { error } = await supabase
      .from('competencias')
      .upsert({ equipe_id: equipeId, atividade_id: atividadeId, nivel: proximo });
    if (error) setErro(traduzErro(error));
    dadosQ.recarregar();
  }

  function exportar() {
    const u = unidades.find(x => x.id === unidadeId);
    const linhas = [
      ['Unidade', 'Cargo', 'Quantidade', ...atividades.map(a => a.nome)],
      ...(dadosQ.dados?.equipes ?? []).map(eq => [
        u?.nome ?? '',
        eq.cargo,
        eq.quantidade ?? 'não informado',
        ...atividades.map(a => NOME_NIVEL[nivelDe(eq.id, a.id)]),
      ]),
    ];
    baixarCSV(linhas, `matriz_${u?.slug ?? 'unidade'}.csv`);
  }

  return (
    <>
      <Cabecalho
        titulo="Matriz profissional × atividade"
        subtitulo="Compatibilidade preliminar entre categorias profissionais e serviços."
        acoes={
          <>
            <button className="btn" onClick={exportar}>↓ Exportar CSV</button>
            {ehGestor && <button className="btn" onClick={() => setGerenciando(true)}>Gerenciar atividades</button>}
          </>
        }
      />
      <Erro mensagem={erro || unidadesQ.erro || dadosQ.erro || atividadesQ.erro} />

      <Painel titulo="Filtrar matriz">
        <div className="selectrow">
          <SeletorUnidade unidades={unidades} valor={unidadeId} aoMudar={setUnidadeId} />
          <input placeholder="Buscar atividade…" value={busca} onChange={e => setBusca(e.target.value)} />
          <span className="chip neutral">{atividades.length} atividades mapeadas</span>
          {editavel && <span className="chip">Clique numa célula para mudar o nível</span>}
        </div>
      </Painel>

      <Painel titulo="Competência profissional × atividade">
        {dadosQ.carregando ? (
          <Carregando />
        ) : (
          <div className="tablewrap">
            <table className="matrix">
              <thead>
                <tr>
                  <th>Profissional (quantidade)</th>
                  {colunas.map(a => <th key={a.id}>{a.nome}</th>)}
                </tr>
              </thead>
              <tbody>
                {dadosQ.dados?.equipes.map(eq => (
                  <tr key={eq.id}>
                    <td>
                      <strong>{eq.cargo}</strong>
                      <br />
                      <span className="muted">{eq.quantidade === null ? 'quantidade pendente' : `${eq.quantidade} profissional(is)`}</span>
                    </td>
                    {colunas.map(a => (
                      <td key={a.id}>
                        {editavel ? (
                          <button
                            className="btn link"
                            title="Clique para alternar o nível"
                            onClick={() => alternar(eq.id, a.id)}
                          >
                            <NivelTag nivel={nivelDe(eq.id, a.id)} />
                          </button>
                        ) : (
                          <NivelTag nivel={nivelDe(eq.id, a.id)} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                {dadosQ.dados?.equipes.length === 0 && (
                  <tr><td colSpan={colunas.length + 1} className="empty">Cadastre cargos em “Unidades e equipes”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="selectrow" style={{ marginTop: 16 }}>
          {(['executa', 'apoia', 'verificar', 'nao'] as Nivel[]).map(n => <NivelTag key={n} nivel={n} />)}
          <span className="muted">
            Executa = competência preliminar; Apoia = suporte; Verificar = validação obrigatória; — = não atribuir automaticamente.
          </span>
        </div>
        <div className="alert" style={{ marginTop: 15 }}>
          Competência preliminar não substitui habilitação legal, protocolos locais, disponibilidade ou confirmação da
          coordenação. A matriz não gera escalas automaticamente.
        </div>
      </Painel>

      {gerenciando && (
        <GerenciarAtividades
          atividades={atividades}
          aoFechar={() => setGerenciando(false)}
          aoMudar={() => {
            atividadesQ.recarregar();
            dadosQ.recarregar();
          }}
        />
      )}
    </>
  );
}

function GerenciarAtividades({
  atividades,
  aoFechar,
  aoMudar,
}: {
  atividades: Atividade[];
  aoFechar: () => void;
  aoMudar: () => void;
}) {
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function executar(promessa: PromiseLike<{ error: unknown }>) {
    setErro(null);
    const { error } = await promessa;
    if (error) setErro(traduzErro(error));
    else aoMudar();
  }

  return (
    <Modal titulo="Atividades da matriz" aoFechar={aoFechar}>
      <Erro mensagem={erro} />
      <div className="tablewrap">
        <table>
          <tbody>
            {atividades.map(a => (
              <tr key={a.id}>
                <td>{a.nome}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="btn small"
                    onClick={() => {
                      const nome = prompt('Novo nome da atividade:', a.nome);
                      if (nome?.trim()) executar(supabase.from('atividades').update({ nome: nome.trim() }).eq('id', a.id));
                    }}
                  >
                    Renomear
                  </button>{' '}
                  <button
                    className="btn small danger"
                    onClick={() => {
                      if (confirm(`Remover "${a.nome}" da matriz de TODAS as unidades?`))
                        executar(supabase.from('atividades').delete().eq('id', a.id));
                    }}
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form
        className="selectrow"
        style={{ marginTop: 14 }}
        onSubmit={e => {
          e.preventDefault();
          if (!nova.trim()) return;
          executar(supabase.from('atividades').insert({ nome: nova.trim(), ordem: atividades.length + 1 }));
          setNova('');
        }}
      >
        <input placeholder="Nova atividade" value={nova} onChange={e => setNova(e.target.value)} />
        <button className="btn primary">Adicionar</button>
      </form>
      <div className="actions">
        <button className="btn" onClick={aoFechar}>Fechar</button>
      </div>
    </Modal>
  );
}
