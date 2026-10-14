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
