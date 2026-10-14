-- =====================================================================
-- Ficha configurável da UBS + Questionários de campo
--
-- * O administrador geral (gestor) define os campos da ficha das UBS;
--   o administrador de cada UBS (papel 'coordenador') preenche/edita a sua.
-- * O gestor cria questionários; cada UBS responde os seus (aplicações).
-- Continua valendo: NENHUM dado de paciente.
-- =====================================================================

create type public.tipo_campo as enum
  ('texto', 'texto_longo', 'numero', 'data', 'sim_nao', 'escolha_unica', 'multipla_escolha', 'escala');
create type public.status_questionario as enum ('rascunho', 'aberto', 'encerrado');

-- ---------- Ficha da UBS: campos definidos pelo administrador geral ----------
create table public.campos_ficha (
  id uuid primary key default gen_random_uuid(),
  secao text not null default 'Outras informações',
  nome text not null,
  tipo public.tipo_campo not null default 'texto',
  opcoes jsonb not null default '[]'::jsonb,       -- lista de opções (escolha única/múltipla)
  ajuda text,
  obrigatorio boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(opcoes) = 'array')
);

-- Valores da ficha de cada UBS: { "<id do campo>": valor }
alter table public.unidades add column dados_ficha jsonb not null default '{}'::jsonb
  check (jsonb_typeof(dados_ficha) = 'object');

-- ---------- Questionários ----------
create table public.questionarios (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  status public.status_questionario not null default 'rascunho',
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.perguntas (
  id uuid primary key default gen_random_uuid(),
  questionario_id uuid not null references public.questionarios (id) on delete cascade,
  ordem integer not null default 0,
  enunciado text not null,
  tipo public.tipo_campo not null default 'texto',
  opcoes jsonb not null default '[]'::jsonb,
  ajuda text,
  obrigatoria boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(opcoes) = 'array')
);

-- Cada vez que o questionário é respondido em uma UBS: { "<id da pergunta>": resposta }
create table public.aplicacoes (
  id uuid primary key default gen_random_uuid(),
  questionario_id uuid not null references public.questionarios (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  data_aplicacao date not null default current_date,
  respondente text,                          -- cargo/função de quem respondeu (não o nome de paciente!)
  respostas jsonb not null default '{}'::jsonb check (jsonb_typeof(respostas) = 'object'),
  observacao text,
  aplicador uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.campos_ficha (ordem);
create index on public.perguntas (questionario_id, ordem);
create index on public.aplicacoes (questionario_id);
create index on public.aplicacoes (unidade_id);
create index on public.aplicacoes (aplicador);
create index on public.questionarios (criado_por);

-- ---------- Gatilhos: updated_at e auditoria ----------
do $$
declare t text;
begin
  foreach t in array array['campos_ficha','questionarios','perguntas','aplicacoes'] loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

-- Só o administrador geral ativa/desativa uma UBS ou muda seu identificador
create or replace function public.proteger_unidade()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.eh_gestor()
     and (new.ativa is distinct from old.ativa or new.slug is distinct from old.slug) then
    raise exception 'Somente o administrador geral pode ativar/desativar uma UBS.';
  end if;
  return new;
end;
$$;
create trigger unidades_protecao before update on public.unidades
  for each row execute function public.proteger_unidade();

-- Questionário precisa estar ABERTO para receber/alterar respostas
create or replace function public.questionario_aberto(q uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.questionarios where id = q and status = 'aberto');
$$;

-- ---------- Permissões (RLS) ----------
alter table public.campos_ficha  enable row level security;
alter table public.questionarios enable row level security;
alter table public.perguntas     enable row level security;
alter table public.aplicacoes    enable row level security;

-- Campos da ficha: todos os usuários ativos leem; só o gestor define
create policy "leitura usuarios ativos" on public.campos_ficha for select to authenticated using (public.usuario_ativo());
create policy "gestor cria campos" on public.campos_ficha for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita campos" on public.campos_ficha for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove campos" on public.campos_ficha for delete to authenticated using (public.eh_gestor());

-- Questionários: rascunhos só o gestor vê; abertos/encerrados todos os ativos veem
create policy "ver questionarios" on public.questionarios for select to authenticated
  using (public.eh_gestor() or (public.usuario_ativo() and status <> 'rascunho'));
create policy "gestor cria questionarios" on public.questionarios for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita questionarios" on public.questionarios for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove questionarios" on public.questionarios for delete to authenticated using (public.eh_gestor());

create policy "ver perguntas" on public.perguntas for select to authenticated
  using (exists (select 1 from public.questionarios q where q.id = questionario_id));  -- herda a regra acima
create policy "gestor cria perguntas" on public.perguntas for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita perguntas" on public.perguntas for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove perguntas" on public.perguntas for delete to authenticated using (public.eh_gestor());

-- Respostas: gestor vê todas; administrador da UBS vê e responde as da sua unidade
create policy "ver aplicacoes" on public.aplicacoes for select to authenticated
  using (public.pode_editar_unidade(unidade_id));
create policy "responder questionario" on public.aplicacoes for insert to authenticated
  with check (public.pode_editar_unidade(unidade_id) and public.questionario_aberto(questionario_id));
create policy "editar respostas" on public.aplicacoes for update to authenticated
  using (public.pode_editar_unidade(unidade_id))
  with check (public.pode_editar_unidade(unidade_id) and public.questionario_aberto(questionario_id));
create policy "remover respostas" on public.aplicacoes for delete to authenticated
  using (public.pode_editar_unidade(unidade_id));

revoke all on public.campos_ficha, public.questionarios, public.perguntas, public.aplicacoes from anon;
revoke execute on function public.questionario_aberto(uuid), public.proteger_unidade() from anon;

-- ---------- Ficha padrão (o administrador geral pode mudar tudo depois) ----------
insert into public.campos_ficha (secao, nome, tipo, opcoes, ajuda, ordem) values
  ('Identificação', 'CNES', 'texto', '[]', 'Código do Cadastro Nacional de Estabelecimentos de Saúde', 1),
  ('Identificação', 'Tipo de unidade', 'escolha_unica', '["UBS","USF / Estratégia Saúde da Família","Posto de saúde","Turno de UBS","Outro"]', null, 2),
  ('Identificação', 'Zona', 'escolha_unica', '["Urbana","Rural"]', null, 3),
  ('Endereço e contato', 'Endereço', 'texto', '[]', 'Rua e número', 10),
  ('Endereço e contato', 'Bairro / localidade', 'texto', '[]', null, 11),
  ('Endereço e contato', 'CEP', 'texto', '[]', null, 12),
  ('Endereço e contato', 'Telefone', 'texto', '[]', null, 13),
  ('Endereço e contato', 'E-mail da unidade', 'texto', '[]', null, 14),
  ('Gestão', 'Responsável pela unidade', 'texto', '[]', 'Nome e função do(a) responsável local', 20),
  ('Gestão', 'População adscrita', 'numero', '[]', 'Pessoas cadastradas no território', 21),
  ('Gestão', 'Equipes de Saúde da Família', 'numero', '[]', null, 22),
  ('Gestão', 'Dias de funcionamento', 'multipla_escolha', '["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"]', null, 23),
  ('Estrutura', 'Número de salas', 'numero', '[]', null, 30),
  ('Estrutura', 'Possui sala de vacina?', 'sim_nao', '[]', null, 31),
  ('Estrutura', 'Possui consultório odontológico?', 'sim_nao', '[]', null, 32),
  ('Estrutura', 'Possui farmácia / dispensação?', 'sim_nao', '[]', null, 33),
  ('Estrutura', 'Acesso à internet estável?', 'sim_nao', '[]', null, 34),
  ('Estrutura', 'Usa prontuário eletrônico (PEC)?', 'sim_nao', '[]', null, 35);

-- Números já conhecidos do protótipo: 6 salas em cada unidade
update public.unidades
set dados_ficha = jsonb_build_object((select id::text from public.campos_ficha where nome = 'Número de salas'), 6);

-- ---------- Questionário de exemplo (em rascunho, para revisar antes de abrir) ----------
with q as (
  insert into public.questionarios (titulo, descricao, status)
  values ('Diagnóstico operacional da UBS',
          'Entrevista com a coordenação da unidade para completar as pendências da Célula 3. Não registre dados de pacientes.',
          'rascunho')
  returning id
)
insert into public.perguntas (questionario_id, ordem, enunciado, tipo, opcoes, ajuda, obrigatoria)
select q.id, p.ordem, p.enunciado, p.tipo::public.tipo_campo, p.opcoes::jsonb, p.ajuda, p.obrigatoria
from q, (values
  (1, 'Quantos profissionais atuam hoje na unidade (total confirmado)?', 'numero', '[]', null, true),
  (2, 'Existem escalas individuais (entrada, saída, pausas) por profissional?', 'escolha_unica', '["Sim","Não","Parcial"]', null, true),
  (3, 'Em quais dias a unidade funciona?', 'multipla_escolha', '["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"]', null, true),
  (4, 'Qual o horário real de encerramento?', 'texto', '[]', 'Ex.: 16h30', false),
  (5, 'Tempo médio de uma consulta médica (minutos)', 'numero', '[]', null, false),
  (6, 'Tempo médio de uma consulta de enfermagem (minutos)', 'numero', '[]', null, false),
  (7, 'O(a) dentista é compartilhado(a) com outra unidade ou turno?', 'sim_nao', '[]', null, false),
  (8, 'Quais são os principais gargalos da unidade?', 'multipla_escolha',
     '["Falta de profissionais","Espaço físico","Falta de insumos","Equipamentos","Internet / sistema","Demanda acima da capacidade","Ausências e férias sem cobertura"]', null, false),
  (9, 'Como avalia a estrutura física da unidade?', 'escala', '[]', '1 = muito ruim · 5 = muito boa', false),
  (10, 'Observações e informações adicionais', 'texto_longo', '[]', null, false)
) as p(ordem, enunciado, tipo, opcoes, ajuda, obrigatoria);
