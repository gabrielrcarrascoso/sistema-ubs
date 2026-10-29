-- ARQUIVO GERADO AUTOMATICAMENTE por "npm run sql:juntar". Não edite: altere supabase/migrations.
-- Cole TODO o conteúdo no SQL Editor do Supabase (projeto novo e vazio) e clique em Run.

-- >>>>> 20261014000001_estrutura.sql
-- =====================================================================
-- Sistema UBS Salgueiro/PE — estrutura do banco de dados
-- Módulos: Designação (Célula 3) + Indicadores (APS Data & Performance)
-- Regra de ouro: NENHUM dado de paciente. Somente equipe e dados agregados.
-- =====================================================================

-- ---------- Tipos ----------
create type public.papel_usuario as enum ('gestor', 'coordenador', 'profissional');
create type public.nivel_competencia as enum ('executa', 'apoia', 'verificar', 'nao');
create type public.tipo_indicador as enum ('percentual', 'contagem', 'razao');

-- ---------- Unidades (UBS / turnos) ----------
create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  nome text not null,
  horario text,
  volume_estimado text,
  pico text,
  profissionais_declarados integer check (profissionais_declarados >= 0),
  observacao text,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Perfis de usuário (ligados ao login do Supabase Auth) ----------
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  papel public.papel_usuario not null default 'profissional',
  unidade_id uuid references public.unidades (id) on delete set null,
  ativo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Atividades (colunas da matriz) ----------
create table public.atividades (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- Equipe por categoria em cada unidade ----------
create table public.equipes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  cargo text not null,
  quantidade integer check (quantidade >= 0),           -- null = não informado
  disponibilidade text,
  observacoes text,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, cargo)
);

-- ---------- Matriz de competências (cargo x atividade) ----------
create table public.competencias (
  equipe_id uuid not null references public.equipes (id) on delete cascade,
  atividade_id uuid not null references public.atividades (id) on delete cascade,
  nivel public.nivel_competencia not null default 'nao',
  updated_at timestamptz not null default now(),
  primary key (equipe_id, atividade_id)
);

-- ---------- Restrições operacionais ----------
create table public.restricoes (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  tipo text not null,
  descricao text not null,
  impacto text,
  status text,
  validar text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Pendências de coleta ----------
create table public.pendencias (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid references public.unidades (id) on delete cascade, -- null = todas
  escopo text,                                                         -- texto livre p/ exibição
  prioridade text not null default 'Média' check (prioridade in ('Alta', 'Média', 'Baixa')),
  texto text not null,
  motivo text,
  concluida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Coletas de campo (histórico, não sobrescreve) ----------
create table public.coletas (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  responsavel text,
  data_visita date,
  total_confirmado integer check (total_confirmado >= 0),
  escalas_disponiveis text check (escalas_disponiveis in ('Sim', 'Não', 'Parcial')),
  atividade text,
  demanda_semanal numeric check (demanda_semanal >= 0),
  duracao_media_min numeric check (duracao_media_min >= 0),
  profissionais_habilitados numeric check (profissionais_habilitados >= 0),
  horas_semana_profissional numeric check (horas_semana_profissional >= 0),
  fonte text,
  observacao text,
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Dicionário de indicadores ----------
create table public.indicadores (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nome text not null,
  definicao text not null,
  tipo public.tipo_indicador not null default 'percentual',
  unidade_medida text not null default '%',
  numerador_desc text not null,
  denominador_desc text,                     -- obrigatório exceto para 'contagem'
  fator numeric not null default 100,        -- percentual = 100; razão = 1, 1000 ...
  fonte_dados text not null,
  periodicidade text not null default 'Mensal',
  meta numeric,
  sentido_meta text not null default 'maior' check (sentido_meta in ('maior', 'menor')),
  versao integer not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo = 'contagem' or denominador_desc is not null)
);

-- ---------- Lançamentos mensais dos indicadores ----------
create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  indicador_id uuid not null references public.indicadores (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  competencia date not null check (extract(day from competencia) = 1), -- 1º dia do mês
  numerador numeric not null check (numerador >= 0),
  denominador numeric check (denominador >= 0),
  fonte text not null,
  observacao text,
  versao_formula integer not null default 1,   -- rastreabilidade: versão da fórmula usada
  tipo_aplicado public.tipo_indicador,          -- fórmula congelada no momento do lançamento
  fator_aplicado numeric,
  criado_por uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (indicador_id, unidade_id, competencia)  -- controle de duplicidade
);

-- ---------- Auditoria (quem mudou o quê e quando) ----------
create table public.auditoria (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id text,
  acao text not null,
  usuario_id uuid,
  usuario_email text,
  dados_antes jsonb,
  dados_depois jsonb,
  created_at timestamptz not null default now()
);

-- ---------- Índices ----------
create index on public.perfis (unidade_id);
create index on public.equipes (unidade_id);
create index on public.competencias (atividade_id);
create index on public.restricoes (unidade_id);
create index on public.pendencias (unidade_id);
create index on public.coletas (unidade_id, created_at desc);
create index on public.coletas (criado_por);
create index on public.lancamentos (unidade_id, competencia);
create index on public.lancamentos (criado_por);
create index on public.auditoria (created_at desc);
create index on public.auditoria (tabela, registro_id);


-- >>>>> 20261014000002_seguranca.sql
-- =====================================================================
-- Segurança: perfis automáticos, permissões (RLS), auditoria e versões
--
-- Papéis:
--   gestor        -> Secretaria de Saúde: vê e edita tudo, aprova usuários
--   coordenador   -> edita apenas a própria unidade
--   profissional  -> somente leitura
-- Usuário novo entra INATIVO e só acessa depois que um gestor aprova.
-- O primeiro usuário cadastrado vira gestor automaticamente.
-- =====================================================================

-- ---------- Funções auxiliares (usadas nas regras de acesso) ----------
create or replace function public.usuario_ativo()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

create or replace function public.eh_gestor()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel = 'gestor');
$$;

create or replace function public.pode_editar_unidade(alvo uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.perfis p
    where p.id = auth.uid() and p.ativo
      and (p.papel = 'gestor' or (p.papel = 'coordenador' and p.unidade_id = alvo))
  );
$$;

create or replace function public.unidade_da_equipe(equipe uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  select unidade_id from public.equipes where id = equipe;
$$;

-- ---------- updated_at automático ----------
create or replace function public.tocar_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['unidades','perfis','equipes','competencias','restricoes',
                           'pendencias','coletas','indicadores','lancamentos']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
  end loop;
end $$;

-- ---------- Perfil criado automaticamente no cadastro ----------
create or replace function public.criar_perfil_novo_usuario()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ja_tem_gestor boolean;
begin
  -- trava para que dois cadastros simultâneos não virem gestores
  perform pg_advisory_xact_lock(hashtext('primeiro_gestor'));
  select exists (select 1 from public.perfis where papel = 'gestor') into ja_tem_gestor;

  insert into public.perfis (id, nome, email, papel, ativo)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), split_part(new.email, '@', 1)),
    coalesce(new.email, ''),
    case when ja_tem_gestor then 'profissional'::public.papel_usuario else 'gestor'::public.papel_usuario end,
    not ja_tem_gestor
  );
  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- ---------- Proteção do perfil ----------
-- Usuário comum só pode mudar o próprio nome. Papel, unidade e status: só gestor.
-- Também impede que o sistema fique sem nenhum gestor ativo.
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- auth.uid() nulo = administrador do banco (SQL Editor), que pode tudo
  if auth.uid() is not null and not public.eh_gestor() then
    if new.papel is distinct from old.papel
       or new.unidade_id is distinct from old.unidade_id
       or new.ativo is distinct from old.ativo
       or new.email is distinct from old.email then
      raise exception 'Somente gestores podem alterar papel, unidade ou status de usuários.';
    end if;
  end if;

  if old.papel = 'gestor' and old.ativo and (new.papel <> 'gestor' or not new.ativo) then
    if (select count(*) from public.perfis where papel = 'gestor' and ativo and id <> old.id) = 0 then
      raise exception 'O sistema precisa de pelo menos um gestor ativo.';
    end if;
  end if;

  if new.papel = 'coordenador' and new.unidade_id is null then
    raise exception 'Coordenador precisa estar vinculado a uma unidade.';
  end if;
  return new;
end;
$$;

create trigger perfis_protecao before update on public.perfis
  for each row execute function public.proteger_perfil();

-- ---------- Versão das fórmulas (rastreabilidade) ----------
-- Se a fórmula de um indicador muda, a versão sobe sozinha.
create or replace function public.versionar_indicador()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.tipo is distinct from old.tipo
     or new.numerador_desc is distinct from old.numerador_desc
     or new.denominador_desc is distinct from old.denominador_desc
     or new.fator is distinct from old.fator then
    new.versao := old.versao + 1;
  end if;
  return new;
end;
$$;

create trigger indicadores_versao before update on public.indicadores
  for each row execute function public.versionar_indicador();

-- Cada lançamento guarda a versão da fórmula vigente no momento e valida o denominador.
create or replace function public.preparar_lancamento()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ind record;
begin
  select tipo, versao, fator into ind from public.indicadores where id = new.indicador_id;
  new.versao_formula := ind.versao;
  new.tipo_aplicado := ind.tipo;
  new.fator_aplicado := ind.fator;
  if ind.tipo <> 'contagem' and (new.denominador is null or new.denominador = 0) then
    raise exception 'Este indicador exige denominador maior que zero.';
  end if;
  if ind.tipo = 'contagem' then
    new.denominador := null;
  end if;
  new.competencia := date_trunc('month', new.competencia)::date;
  return new;
end;
$$;

create trigger lancamentos_preparar before insert or update on public.lancamentos
  for each row execute function public.preparar_lancamento();

-- ---------- Auditoria ----------
create or replace function public.registrar_auditoria()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  registro jsonb;
begin
  registro := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.auditoria (tabela, registro_id, acao, usuario_id, usuario_email, dados_antes, dados_depois)
  values (
    tg_table_name,
    coalesce(registro ->> 'id', registro ->> 'equipe_id' || ':' || (registro ->> 'atividade_id')),
    tg_op,
    auth.uid(),
    (select email from public.perfis where id = auth.uid()),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['unidades','perfis','atividades','equipes','competencias','restricoes',
                           'pendencias','coletas','indicadores','lancamentos']
  loop
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

-- ---------- Visão com o valor calculado do indicador ----------
create view public.v_lancamentos with (security_invoker = true) as
select
  l.*,
  i.codigo, i.nome as indicador_nome, i.unidade_medida, i.meta, i.sentido_meta,
  i.versao as versao_atual,
  u.nome as unidade_nome,
  -- usa a fórmula congelada no lançamento, não a atual (rastreabilidade)
  case
    when l.tipo_aplicado = 'contagem' then l.numerador
    else round(l.numerador / nullif(l.denominador, 0) * l.fator_aplicado, 2)
  end as valor
from public.lancamentos l
join public.indicadores i on i.id = l.indicador_id
join public.unidades u on u.id = l.unidade_id;

-- ---------- Row Level Security (quem vê / quem edita) ----------
alter table public.unidades     enable row level security;
alter table public.perfis       enable row level security;
alter table public.atividades   enable row level security;
alter table public.equipes      enable row level security;
alter table public.competencias enable row level security;
alter table public.restricoes   enable row level security;
alter table public.pendencias   enable row level security;
alter table public.coletas      enable row level security;
alter table public.indicadores  enable row level security;
alter table public.lancamentos  enable row level security;
alter table public.auditoria    enable row level security;

-- Leitura: qualquer usuário ATIVO (dados agregados, sem pacientes)
create policy "leitura usuarios ativos" on public.unidades     for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.atividades   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.equipes      for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.competencias for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.restricoes   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.pendencias   for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.coletas      for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.indicadores  for select to authenticated using (public.usuario_ativo());
create policy "leitura usuarios ativos" on public.lancamentos  for select to authenticated using (public.usuario_ativo());

-- Perfis: cada um vê o seu; gestor vê todos
create policy "ver proprio perfil ou gestor" on public.perfis for select to authenticated
  using (id = (select auth.uid()) or public.eh_gestor());
create policy "editar proprio perfil ou gestor" on public.perfis for update to authenticated
  using (id = (select auth.uid()) or public.eh_gestor())
  with check (id = (select auth.uid()) or public.eh_gestor());

-- Auditoria: só gestor lê; ninguém escreve direto (só os gatilhos)
create policy "gestor le auditoria" on public.auditoria for select to authenticated using (public.eh_gestor());

-- Cadastros gerais: só gestor
create policy "gestor gerencia unidades" on public.unidades for insert to authenticated with check (public.eh_gestor());
create policy "editar unidade" on public.unidades for update to authenticated
  using (public.pode_editar_unidade(id)) with check (public.pode_editar_unidade(id));
create policy "gestor remove unidades" on public.unidades for delete to authenticated using (public.eh_gestor());

create policy "gestor gerencia atividades" on public.atividades for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita atividades" on public.atividades for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove atividades" on public.atividades for delete to authenticated using (public.eh_gestor());

create policy "gestor gerencia indicadores" on public.indicadores for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita indicadores" on public.indicadores for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove indicadores" on public.indicadores for delete to authenticated using (public.eh_gestor());

-- Dados por unidade: gestor ou coordenador daquela unidade
create policy "inserir por unidade" on public.equipes for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.equipes for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.equipes for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "inserir por unidade" on public.competencias for insert to authenticated
  with check (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));
create policy "editar por unidade" on public.competencias for update to authenticated
  using (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)))
  with check (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));
create policy "remover por unidade" on public.competencias for delete to authenticated
  using (public.pode_editar_unidade(public.unidade_da_equipe(equipe_id)));

create policy "inserir por unidade" on public.restricoes for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.restricoes for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.restricoes for delete to authenticated using (public.pode_editar_unidade(unidade_id));

-- Pendências sem unidade (valem para todas) só o gestor mexe
create policy "inserir pendencia" on public.pendencias for insert to authenticated
  with check (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);
create policy "editar pendencia" on public.pendencias for update to authenticated
  using (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end)
  with check (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);
create policy "remover pendencia" on public.pendencias for delete to authenticated
  using (case when unidade_id is null then public.eh_gestor() else public.pode_editar_unidade(unidade_id) end);

create policy "inserir por unidade" on public.coletas for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.coletas for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.coletas for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "inserir por unidade" on public.lancamentos for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.lancamentos for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.lancamentos for delete to authenticated using (public.pode_editar_unidade(unidade_id));

-- Visitantes não logados não acessam nada
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon;


-- >>>>> 20261014000003_dados_prototipo.sql
-- Dados iniciais extraídos do protótipo da Célula 3 (dados preliminares, sujeitos a validação)
insert into public.atividades (nome, ordem) values
  ('Recepção/cadastro', 1),
  ('Acolhimento/triagem', 2),
  ('Consulta médica', 3),
  ('Consulta enfermagem', 4),
  ('Vacinação', 5),
  ('Procedimento enfermagem', 6),
  ('Odontologia', 7),
  ('Apoio odontológico', 8),
  ('Visita domiciliar ACS', 9),
  ('Dispensação/orientação farmacêutica', 10),
  ('Limpeza/apoio predial', 11);

insert into public.unidades (slug, nome, horario, volume_estimado, pico, profissionais_declarados, observacao) values
  ('maria', 'Maria Panta', '07h30–12h · 13h30–encerramento', '≈30/dia', 'Seg. e ter. de manhã', 16, '15 identificados por categoria'),
  ('manha', 'Riachinho · Manhã', '07h–15h (dias a validar)', '≈300/semana (estimativa)', 'Quarta-feira', 14, 'Categorias não quantificadas'),
  ('tarde', 'Riachinho · Tarde', '08h–17h', '≈30/dia', 'Seg., qua. e qui.', 22, '22 por categoria');

insert into public.equipes (unidade_id, cargo, quantidade, disponibilidade, observacoes, ordem) values
  ((select id from public.unidades where slug = 'maria'), 'Médico(a)', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 1),
  ((select id from public.unidades where slug = 'maria'), 'Enfermeiro(a)', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 2),
  ((select id from public.unidades where slug = 'maria'), 'Técnico(a) de enfermagem', 2, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 3),
  ((select id from public.unidades where slug = 'maria'), 'Dentista', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 4),
  ((select id from public.unidades where slug = 'maria'), 'Auxiliar (função não especificada)', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária; função não detalhada', 5),
  ((select id from public.unidades where slug = 'maria'), 'ACS', 7, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 6),
  ((select id from public.unidades where slug = 'maria'), 'Recepcionista', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 7),
  ((select id from public.unidades where slug = 'maria'), 'Farmacêutico(a)', 1, 'Seg–sex | 07h30–12h; 13h30 até encerrar', 'Necessário confirmar escala individual e carga horária', 8);

insert into public.competencias (equipe_id, atividade_id, nivel)
select e.id, a.id, v.nivel::public.nivel_competencia
from (values
  ('maria', 'Médico(a)', 'Recepção/cadastro', 'nao'),
  ('maria', 'Médico(a)', 'Acolhimento/triagem', 'verificar'),
  ('maria', 'Médico(a)', 'Consulta médica', 'executa'),
  ('maria', 'Médico(a)', 'Consulta enfermagem', 'nao'),
  ('maria', 'Médico(a)', 'Vacinação', 'nao'),
  ('maria', 'Médico(a)', 'Procedimento enfermagem', 'verificar'),
  ('maria', 'Médico(a)', 'Odontologia', 'nao'),
  ('maria', 'Médico(a)', 'Apoio odontológico', 'nao'),
  ('maria', 'Médico(a)', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Médico(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Médico(a)', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Recepção/cadastro', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Acolhimento/triagem', 'executa'),
  ('maria', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Consulta enfermagem', 'executa'),
  ('maria', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('maria', 'Enfermeiro(a)', 'Procedimento enfermagem', 'executa'),
  ('maria', 'Enfermeiro(a)', 'Odontologia', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Apoio odontológico', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Visita domiciliar ACS', 'verificar'),
  ('maria', 'Enfermeiro(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Enfermeiro(a)', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Recepção/cadastro', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Acolhimento/triagem', 'apoia'),
  ('maria', 'Técnico(a) de enfermagem', 'Consulta médica', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Consulta enfermagem', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Vacinação', 'executa'),
  ('maria', 'Técnico(a) de enfermagem', 'Procedimento enfermagem', 'executa'),
  ('maria', 'Técnico(a) de enfermagem', 'Odontologia', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Apoio odontológico', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Técnico(a) de enfermagem', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Dentista', 'Recepção/cadastro', 'nao'),
  ('maria', 'Dentista', 'Acolhimento/triagem', 'nao'),
  ('maria', 'Dentista', 'Consulta médica', 'nao'),
  ('maria', 'Dentista', 'Consulta enfermagem', 'nao'),
  ('maria', 'Dentista', 'Vacinação', 'nao'),
  ('maria', 'Dentista', 'Procedimento enfermagem', 'nao'),
  ('maria', 'Dentista', 'Odontologia', 'executa'),
  ('maria', 'Dentista', 'Apoio odontológico', 'nao'),
  ('maria', 'Dentista', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Dentista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Dentista', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Recepção/cadastro', 'verificar'),
  ('maria', 'Auxiliar (função não especificada)', 'Acolhimento/triagem', 'verificar'),
  ('maria', 'Auxiliar (função não especificada)', 'Consulta médica', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Consulta enfermagem', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Vacinação', 'verificar'),
  ('maria', 'Auxiliar (função não especificada)', 'Procedimento enfermagem', 'verificar'),
  ('maria', 'Auxiliar (função não especificada)', 'Odontologia', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Apoio odontológico', 'verificar'),
  ('maria', 'Auxiliar (função não especificada)', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Auxiliar (função não especificada)', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'ACS', 'Recepção/cadastro', 'nao'),
  ('maria', 'ACS', 'Acolhimento/triagem', 'apoia'),
  ('maria', 'ACS', 'Consulta médica', 'nao'),
  ('maria', 'ACS', 'Consulta enfermagem', 'nao'),
  ('maria', 'ACS', 'Vacinação', 'nao'),
  ('maria', 'ACS', 'Procedimento enfermagem', 'nao'),
  ('maria', 'ACS', 'Odontologia', 'nao'),
  ('maria', 'ACS', 'Apoio odontológico', 'nao'),
  ('maria', 'ACS', 'Visita domiciliar ACS', 'executa'),
  ('maria', 'ACS', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'ACS', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Recepcionista', 'Recepção/cadastro', 'executa'),
  ('maria', 'Recepcionista', 'Acolhimento/triagem', 'nao'),
  ('maria', 'Recepcionista', 'Consulta médica', 'nao'),
  ('maria', 'Recepcionista', 'Consulta enfermagem', 'nao'),
  ('maria', 'Recepcionista', 'Vacinação', 'nao'),
  ('maria', 'Recepcionista', 'Procedimento enfermagem', 'nao'),
  ('maria', 'Recepcionista', 'Odontologia', 'nao'),
  ('maria', 'Recepcionista', 'Apoio odontológico', 'nao'),
  ('maria', 'Recepcionista', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Recepcionista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('maria', 'Recepcionista', 'Limpeza/apoio predial', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Recepção/cadastro', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Acolhimento/triagem', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Consulta médica', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Consulta enfermagem', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Vacinação', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Procedimento enfermagem', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Odontologia', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Apoio odontológico', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Visita domiciliar ACS', 'nao'),
  ('maria', 'Farmacêutico(a)', 'Dispensação/orientação farmacêutica', 'executa'),
  ('maria', 'Farmacêutico(a)', 'Limpeza/apoio predial', 'nao')
) as v(slug, cargo, atividade, nivel)
join public.unidades u on u.slug = v.slug
join public.equipes e on e.unidade_id = u.id and e.cargo = v.cargo
join public.atividades a on a.nome = v.atividade;

insert into public.equipes (unidade_id, cargo, quantidade, disponibilidade, observacoes, ordem) values
  ((select id from public.unidades where slug = 'manha'), 'Médico(a)', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 1),
  ((select id from public.unidades where slug = 'manha'), 'Enfermeiro(a)', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 2),
  ((select id from public.unidades where slug = 'manha'), 'Técnico/auxiliar de enfermagem', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 3),
  ((select id from public.unidades where slug = 'manha'), 'Dentista', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 4),
  ((select id from public.unidades where slug = 'manha'), 'Auxiliar de saúde bucal', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 5),
  ((select id from public.unidades where slug = 'manha'), 'ACS', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 6),
  ((select id from public.unidades where slug = 'manha'), 'Recepcionista', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 7),
  ((select id from public.unidades where slug = 'manha'), 'Farmacêutico(a)', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 8),
  ((select id from public.unidades where slug = 'manha'), 'Vigilante', null, 'Seg–sex, 07h–15h (validar divergência dias)', 'Necessário confirmar escala individual e carga horária', 9);

insert into public.competencias (equipe_id, atividade_id, nivel)
select e.id, a.id, v.nivel::public.nivel_competencia
from (values
  ('manha', 'Médico(a)', 'Recepção/cadastro', 'nao'),
  ('manha', 'Médico(a)', 'Acolhimento/triagem', 'verificar'),
  ('manha', 'Médico(a)', 'Consulta médica', 'executa'),
  ('manha', 'Médico(a)', 'Consulta enfermagem', 'nao'),
  ('manha', 'Médico(a)', 'Vacinação', 'nao'),
  ('manha', 'Médico(a)', 'Procedimento enfermagem', 'verificar'),
  ('manha', 'Médico(a)', 'Odontologia', 'nao'),
  ('manha', 'Médico(a)', 'Apoio odontológico', 'nao'),
  ('manha', 'Médico(a)', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Médico(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Médico(a)', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Recepção/cadastro', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Acolhimento/triagem', 'executa'),
  ('manha', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Consulta enfermagem', 'executa'),
  ('manha', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('manha', 'Enfermeiro(a)', 'Procedimento enfermagem', 'executa'),
  ('manha', 'Enfermeiro(a)', 'Odontologia', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Apoio odontológico', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Visita domiciliar ACS', 'verificar'),
  ('manha', 'Enfermeiro(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Enfermeiro(a)', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Recepção/cadastro', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Acolhimento/triagem', 'apoia'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Consulta médica', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Consulta enfermagem', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Vacinação', 'verificar'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Procedimento enfermagem', 'verificar'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Odontologia', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Apoio odontológico', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Técnico/auxiliar de enfermagem', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Dentista', 'Recepção/cadastro', 'nao'),
  ('manha', 'Dentista', 'Acolhimento/triagem', 'nao'),
  ('manha', 'Dentista', 'Consulta médica', 'nao'),
  ('manha', 'Dentista', 'Consulta enfermagem', 'nao'),
  ('manha', 'Dentista', 'Vacinação', 'nao'),
  ('manha', 'Dentista', 'Procedimento enfermagem', 'nao'),
  ('manha', 'Dentista', 'Odontologia', 'executa'),
  ('manha', 'Dentista', 'Apoio odontológico', 'nao'),
  ('manha', 'Dentista', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Dentista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Dentista', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Recepção/cadastro', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Acolhimento/triagem', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Consulta médica', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Consulta enfermagem', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Vacinação', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Procedimento enfermagem', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Odontologia', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Apoio odontológico', 'executa'),
  ('manha', 'Auxiliar de saúde bucal', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Auxiliar de saúde bucal', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'ACS', 'Recepção/cadastro', 'nao'),
  ('manha', 'ACS', 'Acolhimento/triagem', 'apoia'),
  ('manha', 'ACS', 'Consulta médica', 'nao'),
  ('manha', 'ACS', 'Consulta enfermagem', 'nao'),
  ('manha', 'ACS', 'Vacinação', 'nao'),
  ('manha', 'ACS', 'Procedimento enfermagem', 'nao'),
  ('manha', 'ACS', 'Odontologia', 'nao'),
  ('manha', 'ACS', 'Apoio odontológico', 'nao'),
  ('manha', 'ACS', 'Visita domiciliar ACS', 'executa'),
  ('manha', 'ACS', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'ACS', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Recepcionista', 'Recepção/cadastro', 'executa'),
  ('manha', 'Recepcionista', 'Acolhimento/triagem', 'nao'),
  ('manha', 'Recepcionista', 'Consulta médica', 'nao'),
  ('manha', 'Recepcionista', 'Consulta enfermagem', 'nao'),
  ('manha', 'Recepcionista', 'Vacinação', 'nao'),
  ('manha', 'Recepcionista', 'Procedimento enfermagem', 'nao'),
  ('manha', 'Recepcionista', 'Odontologia', 'nao'),
  ('manha', 'Recepcionista', 'Apoio odontológico', 'nao'),
  ('manha', 'Recepcionista', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Recepcionista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Recepcionista', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Recepção/cadastro', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Acolhimento/triagem', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Consulta médica', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Consulta enfermagem', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Vacinação', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Procedimento enfermagem', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Odontologia', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Apoio odontológico', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Farmacêutico(a)', 'Dispensação/orientação farmacêutica', 'executa'),
  ('manha', 'Farmacêutico(a)', 'Limpeza/apoio predial', 'nao'),
  ('manha', 'Vigilante', 'Recepção/cadastro', 'nao'),
  ('manha', 'Vigilante', 'Acolhimento/triagem', 'nao'),
  ('manha', 'Vigilante', 'Consulta médica', 'nao'),
  ('manha', 'Vigilante', 'Consulta enfermagem', 'nao'),
  ('manha', 'Vigilante', 'Vacinação', 'nao'),
  ('manha', 'Vigilante', 'Procedimento enfermagem', 'nao'),
  ('manha', 'Vigilante', 'Odontologia', 'nao'),
  ('manha', 'Vigilante', 'Apoio odontológico', 'nao'),
  ('manha', 'Vigilante', 'Visita domiciliar ACS', 'nao'),
  ('manha', 'Vigilante', 'Dispensação/orientação farmacêutica', 'nao'),
  ('manha', 'Vigilante', 'Limpeza/apoio predial', 'apoia')
) as v(slug, cargo, atividade, nivel)
join public.unidades u on u.slug = v.slug
join public.equipes e on e.unidade_id = u.id and e.cargo = v.cargo
join public.atividades a on a.nome = v.atividade;

insert into public.equipes (unidade_id, cargo, quantidade, disponibilidade, observacoes, ordem) values
  ((select id from public.unidades where slug = 'tarde'), 'Médico(a)', 2, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 1),
  ((select id from public.unidades where slug = 'tarde'), 'Enfermeiro(a)', 1, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 2),
  ((select id from public.unidades where slug = 'tarde'), 'Auxiliar de enfermagem', 4, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 3),
  ((select id from public.unidades where slug = 'tarde'), 'Dentista', 1, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 4),
  ((select id from public.unidades where slug = 'tarde'), 'Auxiliar de saúde bucal', 1, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 5),
  ((select id from public.unidades where slug = 'tarde'), 'ACS', 7, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 6),
  ((select id from public.unidades where slug = 'tarde'), 'Recepcionista', 2, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 7),
  ((select id from public.unidades where slug = 'tarde'), 'Farmacêutico(a)', 2, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 8),
  ((select id from public.unidades where slug = 'tarde'), 'Limpeza', 2, 'Seg–sex, 08h–17h', 'Necessário confirmar escala individual e carga horária', 9);

insert into public.competencias (equipe_id, atividade_id, nivel)
select e.id, a.id, v.nivel::public.nivel_competencia
from (values
  ('tarde', 'Médico(a)', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Médico(a)', 'Acolhimento/triagem', 'verificar'),
  ('tarde', 'Médico(a)', 'Consulta médica', 'executa'),
  ('tarde', 'Médico(a)', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Médico(a)', 'Vacinação', 'nao'),
  ('tarde', 'Médico(a)', 'Procedimento enfermagem', 'verificar'),
  ('tarde', 'Médico(a)', 'Odontologia', 'nao'),
  ('tarde', 'Médico(a)', 'Apoio odontológico', 'nao'),
  ('tarde', 'Médico(a)', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Médico(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Médico(a)', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Acolhimento/triagem', 'executa'),
  ('tarde', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Consulta enfermagem', 'executa'),
  ('tarde', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('tarde', 'Enfermeiro(a)', 'Procedimento enfermagem', 'executa'),
  ('tarde', 'Enfermeiro(a)', 'Odontologia', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Apoio odontológico', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Visita domiciliar ACS', 'verificar'),
  ('tarde', 'Enfermeiro(a)', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Enfermeiro(a)', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Acolhimento/triagem', 'apoia'),
  ('tarde', 'Auxiliar de enfermagem', 'Consulta médica', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Vacinação', 'verificar'),
  ('tarde', 'Auxiliar de enfermagem', 'Procedimento enfermagem', 'executa'),
  ('tarde', 'Auxiliar de enfermagem', 'Odontologia', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Apoio odontológico', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Auxiliar de enfermagem', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Dentista', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Dentista', 'Acolhimento/triagem', 'nao'),
  ('tarde', 'Dentista', 'Consulta médica', 'nao'),
  ('tarde', 'Dentista', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Dentista', 'Vacinação', 'nao'),
  ('tarde', 'Dentista', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'Dentista', 'Odontologia', 'executa'),
  ('tarde', 'Dentista', 'Apoio odontológico', 'nao'),
  ('tarde', 'Dentista', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Dentista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Dentista', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Acolhimento/triagem', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Consulta médica', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Vacinação', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Odontologia', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Apoio odontológico', 'executa'),
  ('tarde', 'Auxiliar de saúde bucal', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Auxiliar de saúde bucal', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'ACS', 'Recepção/cadastro', 'nao'),
  ('tarde', 'ACS', 'Acolhimento/triagem', 'apoia'),
  ('tarde', 'ACS', 'Consulta médica', 'nao'),
  ('tarde', 'ACS', 'Consulta enfermagem', 'nao'),
  ('tarde', 'ACS', 'Vacinação', 'nao'),
  ('tarde', 'ACS', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'ACS', 'Odontologia', 'nao'),
  ('tarde', 'ACS', 'Apoio odontológico', 'nao'),
  ('tarde', 'ACS', 'Visita domiciliar ACS', 'executa'),
  ('tarde', 'ACS', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'ACS', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Recepcionista', 'Recepção/cadastro', 'executa'),
  ('tarde', 'Recepcionista', 'Acolhimento/triagem', 'nao'),
  ('tarde', 'Recepcionista', 'Consulta médica', 'nao'),
  ('tarde', 'Recepcionista', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Recepcionista', 'Vacinação', 'nao'),
  ('tarde', 'Recepcionista', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'Recepcionista', 'Odontologia', 'nao'),
  ('tarde', 'Recepcionista', 'Apoio odontológico', 'nao'),
  ('tarde', 'Recepcionista', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Recepcionista', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Recepcionista', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Acolhimento/triagem', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Consulta médica', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Vacinação', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Odontologia', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Apoio odontológico', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Farmacêutico(a)', 'Dispensação/orientação farmacêutica', 'executa'),
  ('tarde', 'Farmacêutico(a)', 'Limpeza/apoio predial', 'nao'),
  ('tarde', 'Limpeza', 'Recepção/cadastro', 'nao'),
  ('tarde', 'Limpeza', 'Acolhimento/triagem', 'nao'),
  ('tarde', 'Limpeza', 'Consulta médica', 'nao'),
  ('tarde', 'Limpeza', 'Consulta enfermagem', 'nao'),
  ('tarde', 'Limpeza', 'Vacinação', 'nao'),
  ('tarde', 'Limpeza', 'Procedimento enfermagem', 'nao'),
  ('tarde', 'Limpeza', 'Odontologia', 'nao'),
  ('tarde', 'Limpeza', 'Apoio odontológico', 'nao'),
  ('tarde', 'Limpeza', 'Visita domiciliar ACS', 'nao'),
  ('tarde', 'Limpeza', 'Dispensação/orientação farmacêutica', 'nao'),
  ('tarde', 'Limpeza', 'Limpeza/apoio predial', 'executa')
) as v(slug, cargo, atividade, nivel)
join public.unidades u on u.slug = v.slug
join public.equipes e on e.unidade_id = u.id and e.cargo = v.cargo
join public.atividades a on a.nome = v.atividade;

insert into public.restricoes (unidade_id, tipo, descricao, impacto, status, validar) values
  ((select id from public.unidades where slug = 'maria'), 'Disponibilidade', 'Seg–sex: 07h30–12h; 13h30 até encerramento', 'Alocação apenas na janela confirmada; horário final indefinido', 'Parcialmente informado', 'Hora exata do encerramento e escalas individuais'),
  ((select id from public.unidades where slug = 'maria'), 'Carga de trabalho', '≈30 pacientes/dia; pico seg/ter manhã; sexta menor demanda', 'Ajustar cobertura dos picos; não calcular ocupação sem tempos por serviço', 'Qualitativo', 'Demanda por serviço, horas por profissional, tempos médios'),
  ((select id from public.unidades where slug = 'maria'), 'Equipe', '16 declarados, 15 por categoria', 'Não planejar 16º profissional até identificar', 'Inconsistente', 'Cargo e carga horária do 16º profissional'),
  ((select id from public.unidades where slug = 'maria'), 'Ausências', 'Férias geram absorção informal de tarefas', 'Evitar redistribuição automática sem habilitação', 'Confirmado em entrevista', 'Plano de cobertura e histórico de ausências'),
  ((select id from public.unidades where slug = 'maria'), 'Estrutura', '6 salas; falta espaço ACS e reuniões', 'Competência não garante sala disponível', 'Relato coletado', 'Ocupação/agenda das salas'),
  ((select id from public.unidades where slug = 'manha'), 'Disponibilidade', '07h–15h; divergência entre seg–sex e todos os dias', 'Não assumir funcionamento no fim de semana', 'Divergente', 'Dias efetivos e escalas por profissional'),
  ((select id from public.unidades where slug = 'manha'), 'Equipe', '14 incluindo vigilantes; sem categorias quantificadas', 'Impossível calcular oferta por especialidade com os dados atuais', 'Lacuna crítica', 'Quadro nominal ou contagem por função'),
  ((select id from public.unidades where slug = 'manha'), 'Capacidade clínica', '16 fichas para clínico geral (período não identificado)', 'Usar como limite do bloco de fichas, após validar período', 'Parcialmente informado', 'Dia/turno a que se aplicam as 16 fichas'),
  ((select id from public.unidades where slug = 'manha'), 'Odontologia', 'Dentista atende manhã e tarde, segundo entrevista', 'Risco de dupla contagem de profissional e horas', 'Compartilhamento relatado', 'Identidade do dentista, escala e quais equipes/turnos atende'),
  ((select id from public.unidades where slug = 'manha'), 'Demanda', '≈300 atendimentos/semana estimados; quarta pico', 'Não igualar a 60 atendimentos/dia sem série real', 'Estimativa', 'Atendimentos PEC por dia e por procedimento'),
  ((select id from public.unidades where slug = 'manha'), 'Estrutura e insumos', '6 salas; recursos limitados; faltas no fim do mês', 'Designações dependem de salas, estoque e equipamentos', 'Qualitativo', 'Agenda de salas, estoque e indisponibilidades'),
  ((select id from public.unidades where slug = 'tarde'), 'Disponibilidade', 'Seg–sex 08h–17h', 'Funcionamento da UBS não é jornada individual de todos', 'Parcialmente informado', 'Escalas e intervalos individuais'),
  ((select id from public.unidades where slug = 'tarde'), 'Equipe', '22 distribuídos por categoria', 'Contagem não confirma simultaneidade nem exclusividade da equipe', 'Quantitativo informado', 'Vínculos e profissionais compartilhados'),
  ((select id from public.unidades where slug = 'tarde'), 'Carga de trabalho', '≈30 atendimentos/dia; seg/qua/qui maior demanda', 'Demanda médica concentrada em dias específicos', 'Qualitativo', 'Volume diário por serviço e tempo de execução'),
  ((select id from public.unidades where slug = 'tarde'), 'Estrutura', '6 salas; salas pequenas; falta de exames/recursos', 'Avaliar restrições físicas e de encaminhamento', 'Qualitativo', 'Agenda física e disponibilidade de recursos');

insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo) values
  ((select id from public.unidades where slug = 'maria'), 'Maria Panta', 'Alta', 'Identificar 16º profissional e cargo', 'Eliminar divergência 15 vs 16'),
  ((select id from public.unidades where slug = 'manha'), 'Riachinho Manhã', 'Alta', 'Quantificar por categoria os 14 profissionais', 'Calcular efetivo disponível por função'),
  (null, 'Riachinho manhã + tarde', 'Alta', 'Confirmar se odontólogo é o mesmo e as horas por turno', 'Evitar dupla contagem e conflito de agenda'),
  (null, 'Todas', 'Alta', 'Escalas individuais por dia, entrada/saída, pausas e ausências', 'Disponibilidade real de cada profissional'),
  (null, 'Todas', 'Alta', 'Atendimentos por atividade/dia/turno', 'Mensurar demanda e sazonalidade'),
  (null, 'Todas', 'Alta', 'Tempo médio de execução por atividade', 'Converter demanda em horas necessárias'),
  (null, 'Todas', 'Alta', 'Qualificações específicas e protocolos de delegação', 'Definir matriz de compatibilidade definitiva'),
  (null, 'Todas', 'Média', 'Salas e equipamentos por horário', 'Modelar restrição de capacidade física'),
  (null, 'Todas', 'Média', 'Férias, afastamentos e plano de cobertura', 'Modelar capacidade real / contingência'),
  ((select id from public.unidades where slug = 'manha'), 'Riachinho Manhã', 'Média', 'Dias de funcionamento; período correspondente às 16 fichas', 'Resolver divergência e limite operacional');


-- >>>>> 20261014000004_indicadores_iniciais.sql
-- Dicionário inicial de indicadores (APS Data & Performance).
-- São SUGESTÕES de partida: a Secretaria deve validar definições, fórmulas e metas
-- antes de usar os resultados oficialmente. Nenhum valor fictício é carregado.

insert into public.indicadores
  (codigo, nome, definicao, tipo, unidade_medida, numerador_desc, denominador_desc, fator, fonte_dados, periodicidade, meta, sentido_meta)
values
  ('PROD-01', 'Atendimentos no mês',
   'Total de atendimentos individuais registrados pela unidade no mês de competência.',
   'contagem', 'atendimentos', 'Atendimentos individuais registrados no mês', null, 1,
   'e-SUS APS / PEC — relatório de produção', 'Mensal', null, 'maior'),

  ('QUAL-01', 'Registros completos',
   'Percentual de registros de atendimento com todos os campos obrigatórios preenchidos.',
   'percentual', '%', 'Registros com campos obrigatórios completos', 'Total de registros de atendimento no mês', 100,
   'e-SUS APS / PEC — conferência de qualidade', 'Mensal', 90, 'maior'),

  ('PRE-01', 'Gestantes com 6 ou mais consultas de pré-natal',
   'Proporção de gestantes com pelo menos 6 consultas de pré-natal, sendo a 1ª até a 12ª semana de gestação.',
   'percentual', '%', 'Gestantes com ≥ 6 consultas (1ª até 12ª semana)', 'Gestantes identificadas no período', 100,
   'e-SUS APS / PEC', 'Mensal', 45, 'maior'),

  ('VAC-01', 'Cobertura vacinal (pólio e pentavalente)',
   'Proporção de crianças de 1 ano vacinadas na APS contra poliomielite e pentavalente.',
   'percentual', '%', 'Crianças de 1 ano com esquema completo', 'Crianças de 1 ano cadastradas', 100,
   'e-SUS APS / SI-PNI', 'Mensal', 95, 'maior'),

  ('HAS-01', 'Hipertensos com pressão aferida',
   'Proporção de pessoas com hipertensão com consulta e pressão arterial aferida no semestre.',
   'percentual', '%', 'Hipertensos com PA aferida no semestre', 'Hipertensos cadastrados', 100,
   'e-SUS APS / PEC', 'Mensal', 50, 'maior'),

  ('DM-01', 'Diabéticos com hemoglobina glicada solicitada',
   'Proporção de pessoas com diabetes com consulta e hemoglobina glicada solicitada no semestre.',
   'percentual', '%', 'Diabéticos com HbA1c solicitada no semestre', 'Diabéticos cadastrados', 100,
   'e-SUS APS / PEC', 'Mensal', 50, 'maior');


-- >>>>> 20261014000005_ficha_e_questionarios.sql
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


-- >>>>> 20261029000006_planilha_celula3.sql
-- =====================================================================
-- Produção registrada no e-SUS e dados da planilha da Célula 3
--
-- producao               -> totais por equipe (por categoria e por tipo de atendimento); todos os usuários ativos veem
-- producao_profissionais -> total por profissional, COM NOME; só o administrador geral vê a tabela
-- v_producao_profissionais -> a mesma lista para todos, mas com "Médico 1, Médico 2…" no lugar do nome
--                             para quem não é administrador geral
-- Atenção: contagem de registros não equivale a horas trabalhadas nem a produtividade individual.
-- =====================================================================

alter table public.atividades add column if not exists observacao text;

create table public.producao (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  equipe text not null,                                                -- ESF, ESB, ESF I…
  dimensao text not null check (dimensao in ('categoria', 'tipo')),    -- categoria profissional ou tipo de atendimento
  item text not null,                                                  -- 'Médico', 'Consulta no Dia'…
  quantidade integer not null check (quantidade >= 0),
  inicio date not null,
  fim date not null check (fim >= inicio),
  fonte text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, equipe, dimensao, item, inicio)
);

create table public.producao_profissionais (
  id uuid primary key default gen_random_uuid(),
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  equipe text not null,
  nome text not null,
  categoria text not null,
  quantidade integer not null check (quantidade >= 0),
  inicio date not null,
  fim date not null check (fim >= inicio),
  fonte text not null,
  horas_semana text,
  dias_turnos text,
  tempo_consulta text,
  status_validacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (unidade_id, equipe, nome, inicio)
);

do $$
declare t text;
begin
  foreach t in array array['producao', 'producao_profissionais']
  loop
    execute format('create trigger %I_updated_at before update on public.%I
                    for each row execute function public.tocar_updated_at()', t, t);
    execute format('create trigger %I_auditoria after insert or update or delete on public.%I
                    for each row execute function public.registrar_auditoria()', t, t);
  end loop;
end $$;

alter table public.producao enable row level security;
alter table public.producao_profissionais enable row level security;

create policy "leitura usuarios ativos" on public.producao for select to authenticated using (public.usuario_ativo());
create policy "inserir por unidade" on public.producao for insert to authenticated with check (public.pode_editar_unidade(unidade_id));
create policy "editar por unidade" on public.producao for update to authenticated
  using (public.pode_editar_unidade(unidade_id)) with check (public.pode_editar_unidade(unidade_id));
create policy "remover por unidade" on public.producao for delete to authenticated using (public.pode_editar_unidade(unidade_id));

create policy "gestor le" on public.producao_profissionais for select to authenticated using (public.eh_gestor());
create policy "gestor cria" on public.producao_profissionais for insert to authenticated with check (public.eh_gestor());
create policy "gestor edita" on public.producao_profissionais for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "gestor remove" on public.producao_profissionais for delete to authenticated using (public.eh_gestor());

-- Visão para todos os usuários ativos: o nome só aparece para o administrador geral.
-- (Não usa security_invoker de propósito: lê a tabela protegida e esconde o nome aqui.)
create view public.v_producao_profissionais as
select
  p.id, p.unidade_id, p.equipe, p.categoria, p.quantidade, p.inicio, p.fim, p.fonte,
  p.horas_semana, p.dias_turnos, p.tempo_consulta, p.status_validacao,
  case when public.eh_gestor() then p.nome
       else p.categoria || ' ' || dense_rank() over (partition by p.unidade_id, p.categoria order by p.nome)
  end as nome,
  public.eh_gestor() as nome_visivel
from public.producao_profissionais p
where public.usuario_ativo();

revoke all on public.producao, public.producao_profissionais, public.v_producao_profissionais from anon;
grant select on public.v_producao_profissionais to authenticated;


-- =====================================================================
-- DADOS DA PLANILHA "Modelo_Celula_3_UBS_Prado_Riachinho" (aba Restrições desconsiderada)
-- =====================================================================

-- UBS do protótipo saem das telas (ficam arquivadas e podem ser reativadas em Configurações)
update public.unidades set ativa = false where slug in ('maria', 'manha', 'tarde') or nome = 'Unidade Exemplo';

insert into public.unidades (slug, nome, volume_estimado, profissionais_declarados, observacao) values
  ('prado', 'Prado', '≈740 registros/mês (e-SUS, abr–set/2026)', 4, 'Equipes ESF e ESB. Profissionais = médicos, enfermeiros e dentistas com atendimento registrado no período; técnicos, ACS e apoio ainda não levantados.'),
  ('riachinho', 'Riachinho', '≈810 registros/mês (e-SUS, abr–set/2026)', 10, 'Equipes ESF I e ESF II. Profissionais = médicos, enfermeiros e dentistas com atendimento registrado no período; técnicos, ACS e apoio ainda não levantados.')
on conflict (slug) do update set ativa = true, nome = excluded.nome, volume_estimado = excluded.volume_estimado,
  profissionais_declarados = excluded.profissionais_declarados, observacao = excluded.observacao;

-- Atividades da matriz: passam a ser as da planilha (as que têm o mesmo nome continuam)
delete from public.atividades where nome not in ('Consulta médica', 'Consulta de enfermagem', 'Consulta odontológica', 'Acolhimento e avaliação inicial', 'Classificação de risco', 'Vacinação', 'Curativo', 'Administração de medicamentos', 'Monitoramento de condições crônicas', 'Pré-natal de risco habitual', 'Visita domiciliar', 'Educação em saúde', 'Agendamento e orientação de acesso');
insert into public.atividades (nome, ordem, observacao) values
  ('Consulta médica', 1, 'Competência legal específica'),
  ('Consulta de enfermagem', 2, 'Competência legal específica'),
  ('Consulta odontológica', 3, 'Competência legal específica'),
  ('Acolhimento e avaliação inicial', 4, 'Segundo protocolo e atribuições'),
  ('Classificação de risco', 5, 'Conforme protocolo institucional'),
  ('Vacinação', 6, 'Sala de vacina, supervisão e treinamento'),
  ('Curativo', 7, 'Conforme complexidade e protocolo'),
  ('Administração de medicamentos', 8, 'Prescrição e competência legal'),
  ('Monitoramento de condições crônicas', 9, 'Sem substituir consulta privativa'),
  ('Pré-natal de risco habitual', 10, 'Conforme atribuições e protocolos'),
  ('Visita domiciliar', 11, 'Cada categoria no âmbito da profissão'),
  ('Educação em saúde', 12, 'Temas coerentes com competência'),
  ('Agendamento e orientação de acesso', 13, 'Atuação também da recepção')
on conflict (nome) do update set ordem = excluded.ordem, observacao = excluded.observacao;

insert into public.equipes (unidade_id, cargo, quantidade, observacoes, ordem) values
  ((select id from public.unidades where slug = 'prado'), 'Médico(a)', 2, 'ESF: 2. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 1),
  ((select id from public.unidades where slug = 'prado'), 'Enfermeiro(a)', 1, 'ESF: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 2),
  ((select id from public.unidades where slug = 'prado'), 'Dentista', 1, 'ESB: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 3),
  ((select id from public.unidades where slug = 'prado'), 'Técnico(a) de enfermagem', null, 'Quantidade não levantada na planilha da Célula 3.', 4),
  ((select id from public.unidades where slug = 'prado'), 'ACS', null, 'Quantidade não levantada na planilha da Célula 3.', 5),
  ((select id from public.unidades where slug = 'riachinho'), 'Médico(a)', 7, 'ESF I: 2 · ESF II: 6 (1 profissional atua em mais de uma equipe). Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 1),
  ((select id from public.unidades where slug = 'riachinho'), 'Enfermeiro(a)', 3, 'ESF I: 2 · ESF II: 1. Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.', 2),
  ((select id from public.unidades where slug = 'riachinho'), 'Técnico(a) de enfermagem', null, 'Quantidade não levantada na planilha da Célula 3.', 3),
  ((select id from public.unidades where slug = 'riachinho'), 'ACS', null, 'Quantidade não levantada na planilha da Célula 3.', 4)
on conflict (unidade_id, cargo) do update set quantidade = excluded.quantidade, observacoes = excluded.observacoes, ordem = excluded.ordem;

-- Matriz: P = principal (executa), C = condicionada a protocolo/capacitação (apoia), — = não alocar
insert into public.competencias (equipe_id, atividade_id, nivel)
select e.id, a.id, v.nivel::public.nivel_competencia
from (values
  ('prado', 'Médico(a)', 'Consulta médica', 'executa'),
  ('prado', 'Médico(a)', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Médico(a)', 'Consulta odontológica', 'nao'),
  ('prado', 'Médico(a)', 'Acolhimento e avaliação inicial', 'apoia'),
  ('prado', 'Médico(a)', 'Classificação de risco', 'apoia'),
  ('prado', 'Médico(a)', 'Vacinação', 'nao'),
  ('prado', 'Médico(a)', 'Curativo', 'apoia'),
  ('prado', 'Médico(a)', 'Administração de medicamentos', 'apoia'),
  ('prado', 'Médico(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('prado', 'Médico(a)', 'Pré-natal de risco habitual', 'executa'),
  ('prado', 'Médico(a)', 'Visita domiciliar', 'executa'),
  ('prado', 'Médico(a)', 'Educação em saúde', 'executa'),
  ('prado', 'Médico(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('prado', 'Enfermeiro(a)', 'Consulta de enfermagem', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Consulta odontológica', 'nao'),
  ('prado', 'Enfermeiro(a)', 'Acolhimento e avaliação inicial', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Classificação de risco', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Curativo', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Administração de medicamentos', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Pré-natal de risco habitual', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Visita domiciliar', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Educação em saúde', 'executa'),
  ('prado', 'Enfermeiro(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'Dentista', 'Consulta médica', 'nao'),
  ('prado', 'Dentista', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Dentista', 'Consulta odontológica', 'executa'),
  ('prado', 'Dentista', 'Acolhimento e avaliação inicial', 'nao'),
  ('prado', 'Dentista', 'Classificação de risco', 'nao'),
  ('prado', 'Dentista', 'Vacinação', 'nao'),
  ('prado', 'Dentista', 'Curativo', 'nao'),
  ('prado', 'Dentista', 'Administração de medicamentos', 'nao'),
  ('prado', 'Dentista', 'Monitoramento de condições crônicas', 'nao'),
  ('prado', 'Dentista', 'Pré-natal de risco habitual', 'nao'),
  ('prado', 'Dentista', 'Visita domiciliar', 'apoia'),
  ('prado', 'Dentista', 'Educação em saúde', 'executa'),
  ('prado', 'Dentista', 'Agendamento e orientação de acesso', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta médica', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta de enfermagem', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Consulta odontológica', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Acolhimento e avaliação inicial', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Classificação de risco', 'nao'),
  ('prado', 'Técnico(a) de enfermagem', 'Vacinação', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Curativo', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Administração de medicamentos', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Monitoramento de condições crônicas', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Pré-natal de risco habitual', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Visita domiciliar', 'apoia'),
  ('prado', 'Técnico(a) de enfermagem', 'Educação em saúde', 'executa'),
  ('prado', 'Técnico(a) de enfermagem', 'Agendamento e orientação de acesso', 'apoia'),
  ('prado', 'ACS', 'Consulta médica', 'nao'),
  ('prado', 'ACS', 'Consulta de enfermagem', 'nao'),
  ('prado', 'ACS', 'Consulta odontológica', 'nao'),
  ('prado', 'ACS', 'Acolhimento e avaliação inicial', 'nao'),
  ('prado', 'ACS', 'Classificação de risco', 'nao'),
  ('prado', 'ACS', 'Vacinação', 'nao'),
  ('prado', 'ACS', 'Curativo', 'nao'),
  ('prado', 'ACS', 'Administração de medicamentos', 'nao'),
  ('prado', 'ACS', 'Monitoramento de condições crônicas', 'apoia'),
  ('prado', 'ACS', 'Pré-natal de risco habitual', 'apoia'),
  ('prado', 'ACS', 'Visita domiciliar', 'executa'),
  ('prado', 'ACS', 'Educação em saúde', 'executa'),
  ('prado', 'ACS', 'Agendamento e orientação de acesso', 'executa'),
  ('riachinho', 'Médico(a)', 'Consulta médica', 'executa'),
  ('riachinho', 'Médico(a)', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'Médico(a)', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Médico(a)', 'Acolhimento e avaliação inicial', 'apoia'),
  ('riachinho', 'Médico(a)', 'Classificação de risco', 'apoia'),
  ('riachinho', 'Médico(a)', 'Vacinação', 'nao'),
  ('riachinho', 'Médico(a)', 'Curativo', 'apoia'),
  ('riachinho', 'Médico(a)', 'Administração de medicamentos', 'apoia'),
  ('riachinho', 'Médico(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('riachinho', 'Médico(a)', 'Pré-natal de risco habitual', 'executa'),
  ('riachinho', 'Médico(a)', 'Visita domiciliar', 'executa'),
  ('riachinho', 'Médico(a)', 'Educação em saúde', 'executa'),
  ('riachinho', 'Médico(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta médica', 'nao'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta de enfermagem', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Enfermeiro(a)', 'Acolhimento e avaliação inicial', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Classificação de risco', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Vacinação', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Curativo', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Administração de medicamentos', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Monitoramento de condições crônicas', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Pré-natal de risco habitual', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Visita domiciliar', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Educação em saúde', 'executa'),
  ('riachinho', 'Enfermeiro(a)', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta médica', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Consulta odontológica', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Acolhimento e avaliação inicial', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Classificação de risco', 'nao'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Vacinação', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Curativo', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Administração de medicamentos', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Monitoramento de condições crônicas', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Pré-natal de risco habitual', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Visita domiciliar', 'apoia'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Educação em saúde', 'executa'),
  ('riachinho', 'Técnico(a) de enfermagem', 'Agendamento e orientação de acesso', 'apoia'),
  ('riachinho', 'ACS', 'Consulta médica', 'nao'),
  ('riachinho', 'ACS', 'Consulta de enfermagem', 'nao'),
  ('riachinho', 'ACS', 'Consulta odontológica', 'nao'),
  ('riachinho', 'ACS', 'Acolhimento e avaliação inicial', 'nao'),
  ('riachinho', 'ACS', 'Classificação de risco', 'nao'),
  ('riachinho', 'ACS', 'Vacinação', 'nao'),
  ('riachinho', 'ACS', 'Curativo', 'nao'),
  ('riachinho', 'ACS', 'Administração de medicamentos', 'nao'),
  ('riachinho', 'ACS', 'Monitoramento de condições crônicas', 'apoia'),
  ('riachinho', 'ACS', 'Pré-natal de risco habitual', 'apoia'),
  ('riachinho', 'ACS', 'Visita domiciliar', 'executa'),
  ('riachinho', 'ACS', 'Educação em saúde', 'executa'),
  ('riachinho', 'ACS', 'Agendamento e orientação de acesso', 'executa')
) as v (slug, cargo, atividade, nivel)
join public.unidades u on u.slug = v.slug
join public.equipes e on e.unidade_id = u.id and e.cargo = v.cargo
join public.atividades a on a.nome = v.atividade
on conflict (equipe_id, atividade_id) do update set nivel = excluded.nivel;

insert into public.producao (unidade_id, equipe, dimensao, item, quantidade, inicio, fim, fonte) values
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'categoria', 'Médico', 3154, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'categoria', 'Enfermeiro', 875, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'categoria', 'Dentista', 411, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'categoria', 'Médico', 1539, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'categoria', 'Enfermeiro', 458, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'categoria', 'Médico', 2289, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'categoria', 'Enfermeiro', 573, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Atendimento de Urgência', 4, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Consulta Agendada', 274, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESB', 'tipo', 'Consulta no Dia', 133, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Atendimento de Urgência', 9, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta Agendada', 1537, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 32, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'prado'), 'ESF', 'tipo', 'Consulta no Dia', 2451, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Atendimento de Urgência', 440, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta Agendada', 1140, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 30, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF I', 'tipo', 'Consulta no Dia', 387, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Atendimento de Urgência', 76, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta Agendada', 1434, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta Agendada Programada / Cuidado Continuado', 33, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3'),
  ((select id from public.unidades where slug = 'riachinho'), 'ESF II', 'tipo', 'Consulta no Dia', 1319, '2026-04-01', '2026-09-30', 'e-SUS APS: contagem de registros (abr–set/2026) · planilha Célula 3')
on conflict (unidade_id, equipe, dimensao, item, inicio) do update set quantidade = excluded.quantidade, fim = excluded.fim, fonte = excluded.fonte;

-- O que a planilha deixou pendente vira tarefa no sistema
insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo) values
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Alta', 'Confirmar horas por semana, dias/turnos e tempo por consulta de cada profissional', 'Na planilha da Célula 3 estes campos estão como Pendente; sem eles não dá para calcular a capacidade da equipe.'),
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Média', 'Verificar escala e vínculo de cada profissional', 'Status de validação da planilha: Verificar escala e vínculo. Há profissionais com poucos registros no período.'),
  ((select id from public.unidades where slug = 'prado'), 'Prado', 'Média', 'Levantar quantos técnicos de enfermagem e ACS a UBS tem', 'A planilha traz só médicos, enfermeiros e dentistas; a matriz de competências inclui técnicos e ACS.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Alta', 'Confirmar horas por semana, dias/turnos e tempo por consulta de cada profissional', 'Na planilha da Célula 3 estes campos estão como Pendente; sem eles não dá para calcular a capacidade da equipe.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Média', 'Verificar escala e vínculo de cada profissional', 'Status de validação da planilha: Verificar escala e vínculo. Há profissionais com poucos registros no período.'),
  ((select id from public.unidades where slug = 'riachinho'), 'Riachinho', 'Média', 'Levantar quantos técnicos de enfermagem e ACS a UBS tem', 'A planilha traz só médicos, enfermeiros e dentistas; a matriz de competências inclui técnicos e ACS.'),
  (null, 'Todas', 'Média', 'Validar a matriz de competências com a coordenação e a legislação profissional', 'A própria planilha indica que a matriz é uma proposta para planejamento.');


-- >>>>> 20261030000007_indicadores_celula3.sql
-- =====================================================================
-- Indicadores da planilha "Indicadores_APS_Data_Performance_Implementacao"
-- (Frente 05 — Saúde Digital e APS — Salgueiro/PE · apresentação Semana 02)
--
-- I1–I6: tese Santos (2026), com as metas originais. C1 e C2: propostos no projeto, sem meta aprovada.
-- Regras da planilha aplicadas aqui:
--   * denominador zero, vazio ou não validado -> o número não é aceito (nunca um 0% artificial);
--   * I3 e I4 mantêm a fórmula da apresentação: (1 − A/B) × 100;
--   * C1 = (atual − anterior) / anterior × 100;
--   * valores guardados sem arredondar; a tela mostra 1–2 casas.
-- =====================================================================

-- ---------- Novos tipos de fórmula ----------
-- O tipo deixa de ser enum e vira texto com lista fechada (permite incluir tipos novos sem recriar o enum).
drop view public.v_lancamentos;
-- a regra "denominador obrigatório exceto contagem" usa o enum antigo: sai e volta depois da troca
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.indicadores'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%contagem%'
  loop
    execute format('alter table public.indicadores drop constraint %I', c);
  end loop;
end $$;
alter table public.indicadores alter column tipo drop default;
alter table public.indicadores alter column tipo type text using tipo::text;
alter table public.indicadores alter column tipo set default 'percentual';
alter table public.indicadores add constraint indicadores_tipo_valido
  check (tipo in ('percentual', 'contagem', 'razao', 'complemento', 'variacao'));
alter table public.indicadores add constraint indicadores_denominador_obrigatorio
  check (tipo = 'contagem' or denominador_desc is not null);
alter table public.lancamentos alter column tipo_aplicado type text using tipo_aplicado::text;
drop type public.tipo_indicador;

-- ---------- Documentação de cada indicador ----------
alter table public.indicadores
  add column origem text,
  add column variavel_a text,                 -- chave técnica da variável A (numerador)
  add column variavel_b text,                 -- chave técnica da variável B (denominador)
  add column granularidade text,              -- ex.: UBS / período
  add column criterio text,                   -- critério / cautela de interpretação
  add column situacao_dados text not null default 'Pendente validação',
  add column numerador_ate_denominador boolean not null default false; -- A nunca pode passar de B

-- ---------- Rastreabilidade de cada número lançado ----------
alter table public.lancamentos
  add column data_extracao date,               -- quando o dado foi tirado do sistema de origem
  add column validado boolean not null default false;

-- ---------- Cálculo ----------
create or replace function public.preparar_lancamento()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  ind record;
begin
  select tipo, versao, fator, numerador_ate_denominador into ind from public.indicadores where id = new.indicador_id;
  new.versao_formula := ind.versao;
  new.tipo_aplicado := ind.tipo;
  new.fator_aplicado := ind.fator;
  if ind.tipo <> 'contagem' and (new.denominador is null or new.denominador = 0) then
    raise exception 'Este indicador exige denominador maior que zero.';
  end if;
  if ind.tipo = 'contagem' then
    new.denominador := null;
  end if;
  if ind.numerador_ate_denominador and new.numerador > new.denominador then
    raise exception 'Neste indicador o numerador não pode ser maior que o denominador.';
  end if;
  new.competencia := date_trunc('month', new.competencia)::date;
  return new;
end;
$$;

create view public.v_lancamentos with (security_invoker = true) as
select
  l.*,
  i.codigo, i.nome as indicador_nome, i.unidade_medida, i.meta, i.sentido_meta,
  i.versao as versao_atual,
  u.nome as unidade_nome,
  -- usa a fórmula congelada no lançamento, não a atual (rastreabilidade)
  case l.tipo_aplicado
    when 'contagem'    then l.numerador
    when 'complemento' then round((1 - l.numerador / nullif(l.denominador, 0)) * l.fator_aplicado, 2)
    when 'variacao'    then round((l.numerador - l.denominador) / nullif(l.denominador, 0) * l.fator_aplicado, 2)
    else round(l.numerador / nullif(l.denominador, 0) * l.fator_aplicado, 2)
  end as valor
from public.lancamentos l
join public.indicadores i on i.id = l.indicador_id
join public.unidades u on u.id = l.unidade_id;

revoke all on public.v_lancamentos from anon;

-- ---------- Dicionário: os 8 indicadores da planilha ----------
-- Os indicadores anteriores (sugestões iniciais) ficam inativos, com o histórico preservado.
update public.indicadores set ativo = false where codigo not in ('I1', 'I2', 'I3', 'I4', 'I5', 'I6', 'C1', 'C2');

insert into public.indicadores
  (codigo, nome, definicao, tipo, unidade_medida, numerador_desc, denominador_desc, fator, fonte_dados, periodicidade,
   meta, sentido_meta, origem, variavel_a, variavel_b, granularidade, criterio, situacao_dados, numerador_ate_denominador)
values
  ('I1', 'Produtividade',
   'Consultas concluídas / entradas totais × 100.',
   'percentual', '%', 'Consultas concluídas', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I1 a conferir', 'Mensal', 70, 'maior',
   'Tese — Santos (2026)', 'consultas_concluidas', 'entradas_totais', 'UBS / período',
   'Validar conceitos de consultas concluídas e entradas totais.', 'Pendente validação', true),

  ('I2', 'Visitas ACS/equipe',
   'Visitas realizadas / famílias cadastradas × 100.',
   'percentual', '%', 'Visitas realizadas por ACS/equipe', 'Famílias cadastradas', 100,
   'A definir: fontes do I2 a conferir', 'Mensal', 80, 'maior',
   'Tese — Santos (2026)', 'visitas_realizadas', 'familias_cadastradas', 'UBS / período',
   'Visitas não significam necessariamente famílias distintas (pode passar de 100%); validar período e momento de referência do cadastro.', 'Pendente validação', false),

  ('I3', 'Qualidade das visitas de endemias',
   '(1 − entradas por endemias / entradas totais) × 100. Fórmula mantida como na apresentação, sem reinterpretar "qualidade" antes de validar as definições do estudo.',
   'complemento', '%', 'Entradas por endemias (definição original)', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I3 a conferir', 'Mensal', 50, 'maior',
   'Tese — Santos (2026)', 'entradas_por_endemias', 'entradas_totais', 'UBS / período',
   'Validar definição de entradas por endemias; o conceito da tese precisa ser reproduzido.', 'Pendente validação', true),

  ('I4', 'Qualidade do atendimento ACS',
   '(1 − entradas de cadastrados / entradas totais) × 100. Fórmula mantida como na apresentação, sem reinterpretar "qualidade" antes de validar as definições do estudo.',
   'complemento', '%', 'Entradas de cadastrados (definição original)', 'Entradas totais (definição da tese)', 100,
   'A definir: fontes do I4 a conferir', 'Mensal', 45, 'maior',
   'Tese — Santos (2026)', 'entradas_de_cadastrados', 'entradas_totais', 'UBS / período',
   'Validar definição de entradas de cadastrados; o conceito da tese precisa ser reproduzido.', 'Pendente validação', true),

  ('I5', 'Testes e programas de endemias',
   'Número de testes realizados por UBS.',
   'contagem', 'testes', 'Testes realizados na UBS', null, 1,
   'A definir: fontes do I5 a conferir', 'Mensal', 200, 'maior',
   'Tese — Santos (2026)', 'testes_realizados', null, 'UBS / período',
   'Não converter em taxa; confirmar quais testes entram e o período.', 'Pendente validação', false),

  ('I6', 'Ergonomia contínua',
   'Requisitos de ergonomia atendidos / requisitos avaliados × 100.',
   'percentual', '%', 'Requisitos de ergonomia atendidos', 'Requisitos de ergonomia avaliados', 100,
   'A definir: instrumento de avaliação (checklist)', 'Por avaliação', 90, 'maior',
   'Tese — Santos (2026)', 'requisitos_atendidos', 'requisitos_avaliados', 'UBS / avaliação',
   'Confirmar instrumento e critérios de avaliação; atendidos não podem passar dos avaliados.', 'Pendente validação', true),

  ('C1', 'Variação mensal',
   '(Atendimentos do mês − atendimentos do mês anterior) / atendimentos do mês anterior × 100.',
   'variacao', '%', 'Atendimentos do mês', 'Atendimentos do mês anterior', 100,
   'e-SUS APS: relatórios de atendimentos por equipe/categoria e período', 'Mensal', null, 'maior',
   'Complementar — projeto', 'atendimentos_mes_atual', 'atendimentos_mes_anterior', 'UBS / mês',
   'Comparar meses equivalentes, mesma UBS e mesmo conceito de atendimento; o mês anterior não pode ser zero. Crescimento não implica melhora do serviço.', 'Depende de totais mensais comparáveis', false),

  ('C2', 'Utilização da capacidade',
   'Atendimentos / capacidade estimada × 100.',
   'percentual', '%', 'Atendimentos na janela de referência', 'Capacidade assistencial estimada e aprovada', 100,
   'e-SUS APS (atendimentos) + capacidade validada pela gestão', 'Mensal', null, 'maior',
   'Complementar — projeto', 'atendimentos_periodo', 'capacidade_estimada', 'UBS / período',
   'Capacidade assistencial efetiva precisa ser estimada e validada por UBS/período antes de publicar. Uso elevado não significa eficiência; não substituir jornada por capacidade automaticamente.', 'Depende de capacidade validada', false)
on conflict (codigo) do update set
  nome = excluded.nome, definicao = excluded.definicao, tipo = excluded.tipo, unidade_medida = excluded.unidade_medida,
  numerador_desc = excluded.numerador_desc, denominador_desc = excluded.denominador_desc, fator = excluded.fator,
  fonte_dados = excluded.fonte_dados, periodicidade = excluded.periodicidade, meta = excluded.meta, sentido_meta = excluded.sentido_meta,
  origem = excluded.origem, variavel_a = excluded.variavel_a, variavel_b = excluded.variavel_b, granularidade = excluded.granularidade,
  criterio = excluded.criterio, situacao_dados = excluded.situacao_dados, numerador_ate_denominador = excluded.numerador_ate_denominador,
  ativo = true;

-- ---------- Próximos passos da planilha viram tarefas ----------
insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo) values
  (null, 'Todas', 'Alta', 'Mapear as fontes e validar as variáveis e fórmulas dos indicadores I1 a I6',
   'Etapa inicial da planilha de indicadores: mapear fontes → validar variáveis e fórmulas → calcular os indicadores viáveis.'),
  (null, 'Todas', 'Média', 'Estimar e validar a capacidade assistencial de cada UBS (necessária para o C2)',
   'Sem capacidade validada o C2 não deve ser publicado.'),
  (null, 'Todas', 'Média', 'Validar a identificação de cada equipe/unidade nos relatórios (Prado, Riachinho I e II)',
   'A planilha indica relatórios disponíveis para Prado e Riachinho I/II.');


-- >>>>> 20261030000008_reorganizar_ubs.sql
-- =====================================================================
-- Reorganização das UBS (confirmada pela equipe do projeto):
--   * Prado e Maria Panta são a MESMA UBS -> fica uma só, chamada "Prado": usa o registro da antiga
--     Maria Panta (mantém o histórico dela) e recebe os dados da planilha do Prado.
--     Equipes: ESF (Saúde da Família) e ESB (Saúde Bucal).
--   * Riachinho I e Riachinho II são UBS DIFERENTES -> viram duas unidades, cada uma com sua ESF.
-- Nenhum nome de profissional aparece aqui: os dados são movidos de uma unidade para outra.
-- =====================================================================

do $$
declare
  maria uuid := (select id from public.unidades where slug = 'maria');
  prado uuid := (select id from public.unidades where slug = 'prado');
  riach uuid := (select id from public.unidades where slug = 'riachinho');
  r1 uuid;
  r2 uuid;
  origem record;
begin
  if prado is null or riach is null then
    raise notice 'Reorganização já aplicada (Prado/Riachinho não existem mais).';
    return;
  end if;

  -- ================= Riachinho I e Riachinho II =================
  insert into public.unidades (slug, nome, horario, volume_estimado, pico, dados_ficha, observacao)
  select v.slug, v.nome, u.horario, null, u.pico, u.dados_ficha,
         'Equipe ESF (Saúde da Família). Profissionais = médicos e enfermeiros com atendimento registrado no e-SUS entre abr e set/2026; técnicos, ACS e apoio ainda não levantados.'
  from public.unidades u, (values ('riachinho-1', 'Riachinho I'), ('riachinho-2', 'Riachinho II')) as v (slug, nome)
  where u.id = riach
  on conflict (slug) do nothing;
  r1 := (select id from public.unidades where slug = 'riachinho-1');
  r2 := (select id from public.unidades where slug = 'riachinho-2');

  -- produção e profissionais: cada equipe vai para a sua UBS e passa a se chamar só "ESF"
  update public.producao set unidade_id = r1, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF I';
  update public.producao set unidade_id = r2, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF II';
  update public.producao_profissionais set unidade_id = r1, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF I';
  update public.producao_profissionais set unidade_id = r2, equipe = 'ESF' where unidade_id = riach and equipe = 'ESF II';

  -- volume e equipe de cada nova UBS, calculados a partir dos dados movidos
  update public.unidades u set volume_estimado = '≈' || round(t.total / 6.0)::int || ' registros/mês (e-SUS, abr–set/2026)'
  from (select unidade_id, sum(quantidade) total from public.producao where dimensao = 'categoria' group by unidade_id) t
  where t.unidade_id = u.id and u.id in (r1, r2);

  for origem in select * from public.equipes where unidade_id = riach loop
    insert into public.equipes (unidade_id, cargo, quantidade, disponibilidade, observacoes, ordem)
    select alvo.id, origem.cargo,
           case when origem.quantidade is null then null
                else (select count(distinct p.nome) from public.producao_profissionais p
                      where p.unidade_id = alvo.id
                        and p.categoria = case origem.cargo when 'Médico(a)' then 'Médico' when 'Enfermeiro(a)' then 'Enfermeiro' else 'Dentista' end)
           end,
           origem.disponibilidade,
           case when origem.quantidade is null then origem.observacoes
                else 'Profissionais com atendimento registrado no e-SUS entre abr e set/2026; escala e vínculo a validar.' end,
           origem.ordem
    from (values (r1), (r2)) as alvo (id)
    on conflict (unidade_id, cargo) do nothing;
    -- a mesma matriz de competências da planilha
    insert into public.competencias (equipe_id, atividade_id, nivel)
    select e.id, c.atividade_id, c.nivel
    from public.competencias c
    join public.equipes e on e.unidade_id in (r1, r2) and e.cargo = origem.cargo
    where c.equipe_id = origem.id
    on conflict (equipe_id, atividade_id) do nothing;
  end loop;
  -- se os dados de teste/planilha não tiverem profissionais, a quantidade fica "não informada" em vez de 0
  update public.equipes set quantidade = null where unidade_id in (r1, r2) and quantidade = 0;
  update public.unidades u set profissionais_declarados = (select nullif(sum(coalesce(quantidade, 0)), 0) from public.equipes where unidade_id = u.id)
  where u.id in (r1, r2);

  -- pendências: cada UBS recebe as suas
  insert into public.pendencias (unidade_id, escopo, prioridade, texto, motivo, concluida)
  select alvo.id, alvo.nome, p.prioridade, p.texto, p.motivo, p.concluida
  from public.pendencias p, (select id, nome from public.unidades where id in (r1, r2)) alvo
  where p.unidade_id = riach;

  -- o que mais existir só no Riachinho antigo (lançamentos, visitas, respostas, restrições) impede apagar
  if exists (select 1 from public.lancamentos where unidade_id = riach)
     or exists (select 1 from public.coletas where unidade_id = riach)
     or exists (select 1 from public.aplicacoes where unidade_id = riach)
     or exists (select 1 from public.restricoes where unidade_id = riach) then
    update public.unidades set ativa = false, nome = 'Riachinho (antiga, dividida em I e II)' where id = riach;
  else
    delete from public.unidades where id = riach;
  end if;

  -- ================= Prado (antiga Maria Panta) =================
  if maria is null then
    return;  -- não há Maria Panta para juntar: o Prado continua como está
  end if;

  update public.producao set unidade_id = maria where unidade_id = prado;
  update public.producao_profissionais set unidade_id = maria where unidade_id = prado;
  update public.pendencias set unidade_id = maria, escopo = 'Prado' where unidade_id = prado;
  update public.lancamentos set unidade_id = maria where unidade_id = prado
    and not exists (select 1 from public.lancamentos l2 where l2.unidade_id = maria and l2.indicador_id = lancamentos.indicador_id and l2.competencia = lancamentos.competencia);
  update public.coletas set unidade_id = maria where unidade_id = prado;
  update public.restricoes set unidade_id = maria where unidade_id = prado;
  update public.aplicacoes set unidade_id = maria where unidade_id = prado
    and not exists (select 1 from public.aplicacoes a2 where a2.unidade_id = maria and a2.questionario_id = aplicacoes.questionario_id);

  -- equipe: médicos, enfermeiros e dentista vêm da planilha; os demais cargos continuam do levantamento anterior
  for origem in select * from public.equipes where unidade_id = prado loop
    insert into public.equipes (unidade_id, cargo, quantidade, observacoes, ordem)
    values (maria, origem.cargo, origem.quantidade, origem.observacoes, origem.ordem)
    on conflict (unidade_id, cargo) do update set
      quantidade = coalesce(excluded.quantidade, public.equipes.quantidade),
      observacoes = case when excluded.quantidade is null
                         then 'Levantamento anterior (protótipo), a confirmar. ' || coalesce(public.equipes.observacoes, '')
                         else excluded.observacoes end;
    insert into public.competencias (equipe_id, atividade_id, nivel)
    select e.id, c.atividade_id, c.nivel
    from public.competencias c
    join public.equipes e on e.unidade_id = maria and e.cargo = origem.cargo
    where c.equipe_id = origem.id
    on conflict (equipe_id, atividade_id) do update set nivel = excluded.nivel;
  end loop;

  update public.pendencias
  set texto = 'Confirmar quantos técnicos de enfermagem e ACS a UBS tem',
      motivo = 'A planilha da Célula 3 não traz esses cargos; o levantamento anterior indicava 2 técnicos de enfermagem e 7 ACS.'
  where unidade_id = maria and texto = 'Levantar quantos técnicos de enfermagem e ACS a UBS tem';

  update public.unidades m set
    nome = 'Prado',
    ativa = true,
    volume_estimado = p.volume_estimado,
    profissionais_declarados = (select sum(quantidade) from public.equipes where unidade_id = maria),
    observacao = 'Também chamada de UBS Maria Panta. Equipes ESF (Saúde da Família) e ESB (Saúde Bucal). Médicos, enfermeiros e dentista: planilha da Célula 3 (e-SUS, abr–set/2026); demais cargos: levantamento anterior, a confirmar.',
    dados_ficha = p.dados_ficha || m.dados_ficha
  from public.unidades p
  where m.id = maria and p.id = prado;

  delete from public.unidades where id = prado;  -- tudo já foi movido para o registro da antiga Maria Panta
  update public.unidades set slug = 'prado' where id = maria;
end $$;
