import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

// Testa as migrações e as regras de permissão num Postgres em memória (sem precisar de internet).
// Uso: npm run test:banco
const dir = 'supabase/migrations';
let falhas = 0;
const db = new PGlite();
// Simula o ambiente do Supabase
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('teste.uid', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
for (const f of fs.readdirSync(dir).sort()) {
  try { await db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); console.log('OK  ', f); }
  catch (e) { console.log('ERRO', f, '-', e.message); process.exit(1); }
}
const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id, email, raw_user_meta_data) values ('${U1}', 'gestor@teste.com', '{"nome":"Gestora"}'), ('${U2}', 'coord@teste.com', '{}')`);
const como = async (uid, sql) => {
  await db.exec(`reset role; select set_config('teste.uid', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'postgres'};`);
  try { return (await db.query(sql)).rows; } catch (e) { return 'EXCECAO: ' + e.message; } finally { await db.exec('reset role'); }
};
const t = async (nome, r, esperado) => {
  const txt = JSON.stringify(r);
  const passou = esperado instanceof RegExp ? esperado.test(txt) : txt === JSON.stringify(esperado);
  if (!passou) falhas++;
  console.log(passou ? 'PASSOU' : 'FALHOU', nome.padEnd(52), passou ? '' : txt);
};
await t('perfis criados', await como(null, `select nome, papel, ativo from public.perfis order by email desc`), [{nome:'Gestora',papel:'gestor',ativo:true},{nome:'coord',papel:'profissional',ativo:false}]);
await t('U2 inativo ve unidades?', await como(U2, `select count(*) from public.unidades`), [{count:0}]);
await t('U1 gestor ve unidades (3 arquivadas + 2 da planilha)', await como(U1, `select count(*) from public.unidades`), [{count:5}]);
await t('U2 tenta virar gestor', await como(U2, `update public.perfis set papel='gestor' where id='${U2}' returning papel`), /Somente gestores/);
await t('U1 promove U2 a coordenador sem unidade', await como(U1, `update public.perfis set papel='coordenador', ativo=true where id='${U2}' returning papel`), /precisa estar vinculado/);
await t('U1 promove U2 a coordenador Maria Panta', await como(U1, `update public.perfis set papel='coordenador', ativo=true, unidade_id=(select id from public.unidades where slug='maria') where id='${U2}' returning papel`), [{papel:'coordenador'}]);
await t('U2 edita equipe Maria Panta', await como(U2, `update public.equipes set quantidade=2 where cargo='Dentista' and unidade_id=(select id from public.unidades where slug='maria') returning quantidade`), [{quantidade:2}]);
await t('U2 edita equipe Riachinho Tarde (deve 0 linhas)', await como(U2, `update public.equipes set quantidade=9 where unidade_id=(select id from public.unidades where slug='tarde') returning quantidade`), []);
await t('U2 edita competencia Maria', await como(U2, `update public.competencias c set nivel='executa' from public.equipes e where e.id=c.equipe_id and e.cargo='ACS' and e.unidade_id=(select id from public.unidades where slug='maria') and c.atividade_id=(select id from public.atividades where nome='Vacinação') returning c.nivel`), [{nivel:'executa'}]);
await t('U2 lanca indicador com denominador 0', await como(U2, `insert into public.lancamentos (indicador_id, unidade_id, competencia, numerador, denominador, fonte) values ((select id from public.indicadores where codigo='QUAL-01'), (select id from public.unidades where slug='maria'), '2026-09-15', 10, 0, 'PEC') returning id`), /denominador maior que zero/);
await t('U2 lanca indicador valido', await como(U2, `insert into public.lancamentos (indicador_id, unidade_id, competencia, numerador, denominador, fonte) values ((select id from public.indicadores where codigo='QUAL-01'), (select id from public.unidades where slug='maria'), '2026-09-15', 92, 100, 'PEC') returning competencia, versao_formula`), /"versao_formula":1/);
await t('U2 lanca duplicado', await como(U2, `insert into public.lancamentos (indicador_id, unidade_id, competencia, numerador, denominador, fonte) values ((select id from public.indicadores where codigo='QUAL-01'), (select id from public.unidades where slug='maria'), '2026-09-01', 1, 2, 'PEC') returning id`), /duplicate key/);
await t('U2 lanca em outra unidade', await como(U2, `insert into public.lancamentos (indicador_id, unidade_id, competencia, numerador, fonte) values ((select id from public.indicadores where codigo='PROD-01'), (select id from public.unidades where slug='tarde'), '2026-09-01', 500, 'PEC') returning id`), /row-level security/);
await t('U1 muda formula -> versao', await como(U1, `update public.indicadores set fator=1000 where codigo='QUAL-01' returning versao`), [{versao:2}]);
await t('U1 v_lancamentos', await como(U1, `select codigo, unidade_nome, valor from public.v_lancamentos`), /"valor":"92.00"/);
await t('U2 le auditoria (deve 0)', await como(U2, `select count(*) from public.auditoria`), [{count:0}]);
await t('U1 le auditoria', await como(U1, `select acao, tabela, usuario_email from public.auditoria where usuario_id is not null order by id`), /"usuario_email":"coord@teste.com"/);
await t('U1 tenta se rebaixar (unico gestor)', await como(U1, `update public.perfis set papel='profissional' where id='${U1}' returning papel`), /pelo menos um gestor/);
await t('anon le unidades', await (async()=>{ await db.exec(`set role anon`); try { return (await db.query('select count(*) from public.unidades')).rows } catch(e){ return 'EXCECAO: '+e.message } finally { await db.exec('reset role') } })(), /permission denied/);

// ---------- Ficha da UBS e questionários ----------
const MARIA = `(select id from public.unidades where slug='maria')`, TARDE = `(select id from public.unidades where slug='tarde')`;
await t('ficha padrao tem 18 campos', await como(U1, `select count(*) from public.campos_ficha`), [{count:18}]);
await t('adm da UBS nao cria campo da ficha', await como(U2, `insert into public.campos_ficha (nome) values ('x') returning id`), /row-level security/);
await t('adm da UBS edita ficha da propria UBS', await como(U2, `update public.unidades set dados_ficha = dados_ficha || '{"teste": "ok"}' where id=${MARIA} returning dados_ficha->>'teste' as v`), [{v:'ok'}]);
await t('adm da UBS nao edita ficha de outra UBS', await como(U2, `update public.unidades set nome='x' where id=${TARDE} returning id`), []);
await t('adm da UBS nao reativa/desativa a UBS', await como(U2, `update public.unidades set ativa=true where id=${MARIA} returning id`), /administrador geral/);
await t('adm da UBS nao cria UBS', await como(U2, `insert into public.unidades (slug, nome) values ('nova','Nova') returning id`), /row-level security/);
await t('rascunho invisivel para adm da UBS', await como(U2, `select count(*) from public.questionarios`), [{count:0}]);
await t('perguntas do rascunho invisiveis', await como(U2, `select count(*) from public.perguntas`), [{count:0}]);
await t('gestor abre questionario', await como(U1, `update public.questionarios set status='aberto' returning status`), [{status:'aberto'}]);
await t('adm da UBS ve 10 perguntas', await como(U2, `select count(*) from public.perguntas`), [{count:10}]);
await t('adm da UBS responde pela sua UBS', await como(U2, `insert into public.aplicacoes (questionario_id, unidade_id, respondente, respostas) values ((select id from public.questionarios limit 1), ${MARIA}, 'Enfermeira', '{"a":1}') returning respondente`), [{respondente:'Enfermeira'}]);
await t('adm da UBS nao responde por outra UBS', await como(U2, `insert into public.aplicacoes (questionario_id, unidade_id, respostas) values ((select id from public.questionarios limit 1), ${TARDE}, '{}') returning id`), /row-level security/);
await t('gestor ve respostas de todas', await como(U1, `select count(*) from public.aplicacoes`), [{count:1}]);
await t('gestor encerra questionario', await como(U1, `update public.questionarios set status='encerrado' returning status`), [{status:'encerrado'}]);
await t('encerrado nao recebe respostas', await como(U2, `insert into public.aplicacoes (questionario_id, unidade_id, respostas) values ((select id from public.questionarios limit 1), ${MARIA}, '{}') returning id`), /row-level security/);

// ---------- Dados da planilha da Célula 3 (produção e-SUS) ----------
const RIACHINHO = `(select id from public.unidades where slug='riachinho')`, PRADO = `(select id from public.unidades where slug='prado')`;
// Os nomes reais ficam fora do repositório; aqui usamos nomes fictícios (Carla está em duas equipes)
await como(null, `insert into public.producao_profissionais (unidade_id, equipe, nome, categoria, quantidade, inicio, fim, fonte) values
  (${PRADO}, 'ESF', 'Ana Teste', 'Médico', 10, '2026-04-01', '2026-09-30', 'teste'),
  (${PRADO}, 'ESF', 'Bruno Teste', 'Médico', 5, '2026-04-01', '2026-09-30', 'teste'),
  (${RIACHINHO}, 'ESF I', 'Carla Teste', 'Médico', 3, '2026-04-01', '2026-09-30', 'teste'),
  (${RIACHINHO}, 'ESF II', 'Carla Teste', 'Médico', 4, '2026-04-01', '2026-09-30', 'teste'),
  (${RIACHINHO}, 'ESF II', 'Davi Teste', 'Enfermeiro', 2, '2026-04-01', '2026-09-30', 'teste')`);
await t('UBS ativas sao as da planilha', await como(U1, `select string_agg(nome, ',' order by nome) as n from public.unidades where ativa`), [{n:'Prado,Riachinho'}]);
await t('matriz do Prado tem 5 cargos x 13 atividades', await como(U1, `select count(*) from public.competencias c join public.equipes e on e.id=c.equipe_id join public.unidades u on u.id=e.unidade_id where u.slug='prado'`), [{count:65}]);
await t('total de registros = 9299', await como(U2, `select sum(quantidade)::int as s from public.producao where dimensao='categoria'`), [{s:9299}]);
await t('tipos de atendimento somam o mesmo total', await como(U2, `select sum(quantidade)::int as s from public.producao where dimensao='tipo'`), [{s:9299}]);
await t('adm da UBS nao le tabela com nomes', await como(U2, `select count(*) from public.producao_profissionais`), [{count:0}]);
await t('adm da UBS ve profissionais sem nome', await como(U2, `select count(*)::int as n, bool_and(nome ~ '^(Médico|Enfermeiro|Dentista) [0-9]+$') as anonimo, bool_or(nome_visivel) as visivel from public.v_producao_profissionais`), [{n:5,anonimo:true,visivel:false}]);
await t('mesma pessoa em 2 equipes tem o mesmo rotulo', await como(U2, `select count(distinct nome)::int as n from public.v_producao_profissionais where unidade_id=${RIACHINHO} and categoria='Médico'`), [{n:1}]);
await t('gestor ve os nomes', await como(U1, `select bool_and(nome_visivel) as visivel, count(*) filter (where nome like 'Ana%')::int as ana from public.v_producao_profissionais`), [{visivel:true,ana:1}]);
await t('adm da UBS nao altera nomes', await como(U2, `update public.producao_profissionais set nome='x' returning id`), []);
await t('anon nao le profissionais', await (async()=>{ await db.exec(`set role anon`); try { return (await db.query('select count(*) from public.v_producao_profissionais')).rows } catch(e){ return 'EXCECAO: '+e.message } finally { await db.exec('reset role') } })(), /permission denied/);

console.log(falhas ?`\n${falhas} teste(s) falharam.` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
