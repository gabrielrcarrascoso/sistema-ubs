import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, Archive } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase, traduzErro } from '../../lib/supabase';
import { numeroBR } from '../../lib/util';
import { Erro, Modal } from '../../components/ui';

/** O que é apagado junto com a UBS (o banco apaga em cascata) */
const DEPENDENTES: { tabela: string; um: string; varios: string }[] = [
  { tabela: 'lancamentos', um: 'número de indicador', varios: 'números de indicadores' },
  { tabela: 'producao', um: 'total de produção do e-SUS', varios: 'totais de produção do e-SUS' },
  { tabela: 'producao_profissionais', um: 'profissional da planilha', varios: 'profissionais da planilha' },
  { tabela: 'equipes', um: 'cargo da equipe', varios: 'cargos da equipe' },
  { tabela: 'restricoes', um: 'restrição', varios: 'restrições' },
  { tabela: 'pendencias', um: 'pendência', varios: 'pendências' },
  { tabela: 'coletas', um: 'visita de campo', varios: 'visitas de campo' },
  { tabela: 'aplicacoes', um: 'resposta de questionário', varios: 'respostas de questionário' },
];

/** Excluir uma UBS de vez, com tudo o que é dela. Só o administrador geral chega aqui. */
export function ModalExcluirUbs({
  unidade,
  aoFechar,
  aoExcluir,
  aoDesativar,
}: {
  unidade: { id: string; nome: string };
  aoFechar: () => void;
  aoExcluir: () => void;
  /** se a UBS ainda está ativa, oferece desativar no lugar de excluir */
  aoDesativar?: () => void;
}) {
  const [contagens, setContagens] = useState<{ rotulo: string; total: number }[] | null>(null);
  const [usuarios, setUsuarios] = useState(0);
  const [digitado, setDigitado] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    const contar = (tabela: string) =>
      supabase.from(tabela).select('id', { count: 'exact', head: true }).eq('unidade_id', unidade.id).then(r => r.count ?? 0);
    Promise.all([...DEPENDENTES.map(d => contar(d.tabela)), contar('perfis')]).then(totais => {
      if (cancelado) return;
      setContagens(DEPENDENTES.map((d, i) => ({ rotulo: totais[i] === 1 ? d.um : d.varios, total: totais[i] })).filter(c => c.total > 0));
      setUsuarios(totais[DEPENDENTES.length]);
    });
    return () => {
      cancelado = true;
    };
  }, [unidade.id]);

  const normalizar = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const confere = normalizar(digitado) === normalizar(unidade.nome);

  async function excluir(e: FormEvent) {
    e.preventDefault();
    if (!confere) return;
    setErro(null);
    setExcluindo(true);
    const { data, error } = await supabase.from('unidades').delete().eq('id', unidade.id).select('id');
    setExcluindo(false);
    if (error) return setErro(traduzErro(error));
    if (!data?.length) return setErro('A UBS não foi excluída. Só o administrador geral pode excluir uma UBS.');
    aoExcluir();
  }

  return (
    <Modal titulo={`Excluir "${unidade.nome}" de vez?`} aoFechar={aoFechar}>
      <form onSubmit={excluir}>
        <div className="confirmacao">
          <span className="confirmacao-icone perigo"><AlertTriangle size={22} strokeWidth={1.8} /></span>
          <div>
            <p>
              A UBS e <b>tudo o que é dela</b> serão apagados e <b>não dá para desfazer</b>.
              {contagens === null && ' Contando o que vai junto…'}
              {contagens && contagens.length === 0 && ' Ela não tem nenhum dado guardado.'}
            </p>
            {contagens && contagens.length > 0 && (
              <ul className="lista-exclusao">
                {contagens.map(c => <li key={c.rotulo}><b>{numeroBR(c.total, 0)}</b> {c.rotulo}</li>)}
              </ul>
            )}
            {usuarios > 0 && (
              <p className="muted" style={{ marginTop: 8 }}>
                {usuarios === 1 ? '1 usuário está ligado' : `${usuarios} usuários estão ligados`} a esta UBS: a conta continua, mas fica sem UBS até você escolher outra em Configurações › Usuários.
              </p>
            )}
            <p className="muted" style={{ marginTop: 8 }}>
              Quer guardar uma cópia antes? Use <Link to="/configuracoes?aba=backup">Configurações › Backup</Link>.
            </p>
          </div>
        </div>

        {aoDesativar && (
          <div className="alternativa-exclusao">
            <span><b>Só quer tirar a UBS das telas?</b> Desative: ela some, mas todos os dados ficam guardados e dá para reativar depois.</span>
            <button type="button" className="btn" onClick={aoDesativar}><Archive size={16} strokeWidth={1.8} /> Desativar em vez disso</button>
          </div>
        )}

        <label className="field" style={{ display: 'block', marginTop: 18 }}>
          <span className="label">Para confirmar, digite o nome da UBS: <b>{unidade.nome}</b></span>
          <input value={digitado} onChange={e => setDigitado(e.target.value)} autoComplete="off" aria-describedby="exclusao-dica" />
          <span className="hint" id="exclusao-dica">Maiúsculas e minúsculas não importam.</span>
        </label>
        <div style={{ marginTop: 12 }}><Erro mensagem={erro} /></div>

        <div className="actions">
          <button type="button" className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn perigo-cheio" disabled={!confere || excluindo || contagens === null}>
            {excluindo ? 'Excluindo…' : 'Excluir de vez'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
