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
