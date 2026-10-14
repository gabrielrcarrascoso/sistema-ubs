// Formatos dos dados que vêm do banco (espelham as tabelas do Supabase)

export type Papel = 'gestor' | 'coordenador' | 'profissional';
export type Nivel = 'executa' | 'apoia' | 'verificar' | 'nao';
export type TipoIndicador = 'percentual' | 'contagem' | 'razao';
export type TipoCampo =
  | 'texto'
  | 'texto_longo'
  | 'numero'
  | 'data'
  | 'sim_nao'
  | 'escolha_unica'
  | 'multipla_escolha'
  | 'escala';
export type StatusQuestionario = 'rascunho' | 'aberto' | 'encerrado';
/** Valor guardado num campo da ficha ou numa resposta de questionário */
export type ValorCampo = string | number | boolean | string[] | null;

export interface Perfil {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  unidade_id: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Unidade {
  id: string;
  slug: string;
  nome: string;
  horario: string | null;
  volume_estimado: string | null;
  pico: string | null;
  profissionais_declarados: number | null;
  observacao: string | null;
  ativa: boolean;
  dados_ficha: Record<string, ValorCampo>;
}

export interface Atividade {
  id: string;
  nome: string;
  ordem: number;
}

export interface Equipe {
  id: string;
  unidade_id: string;
  cargo: string;
  quantidade: number | null;
  disponibilidade: string | null;
  observacoes: string | null;
  ordem: number;
}

export interface Competencia {
  equipe_id: string;
  atividade_id: string;
  nivel: Nivel;
}

export interface Restricao {
  id: string;
  unidade_id: string;
  tipo: string;
  descricao: string;
  impacto: string | null;
  status: string | null;
  validar: string | null;
}

export interface Pendencia {
  id: string;
  unidade_id: string | null;
  escopo: string | null;
  prioridade: 'Alta' | 'Média' | 'Baixa';
  texto: string;
  motivo: string | null;
  concluida: boolean;
}

export interface Coleta {
  id: string;
  unidade_id: string;
  responsavel: string | null;
  data_visita: string | null;
  total_confirmado: number | null;
  escalas_disponiveis: string | null;
  atividade: string | null;
  demanda_semanal: number | null;
  duracao_media_min: number | null;
  profissionais_habilitados: number | null;
  horas_semana_profissional: number | null;
  fonte: string | null;
  observacao: string | null;
  created_at: string;
}

export interface Indicador {
  id: string;
  codigo: string;
  nome: string;
  definicao: string;
  tipo: TipoIndicador;
  unidade_medida: string;
  numerador_desc: string;
  denominador_desc: string | null;
  fator: number;
  fonte_dados: string;
  periodicidade: string;
  meta: number | null;
  sentido_meta: 'maior' | 'menor';
  versao: number;
  ativo: boolean;
  updated_at: string;
}

export interface Lancamento {
  id: string;
  indicador_id: string;
  unidade_id: string;
  competencia: string;
  numerador: number;
  denominador: number | null;
  fonte: string;
  observacao: string | null;
  versao_formula: number;
  tipo_aplicado: TipoIndicador;
  fator_aplicado: number;
  created_at: string;
  updated_at: string;
  // campos que a visão v_lancamentos acrescenta
  codigo: string;
  indicador_nome: string;
  unidade_medida: string;
  meta: number | null;
  sentido_meta: 'maior' | 'menor';
  versao_atual: number;
  unidade_nome: string;
  valor: number | null;
}

export interface RegistroAuditoria {
  id: number;
  tabela: string;
  registro_id: string | null;
  acao: 'INSERT' | 'UPDATE' | 'DELETE';
  usuario_email: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  created_at: string;
}

export interface CampoFicha {
  id: string;
  secao: string;
  nome: string;
  tipo: TipoCampo;
  opcoes: string[];
  ajuda: string | null;
  obrigatorio: boolean;
  ordem: number;
  ativo: boolean;
}

export interface Questionario {
  id: string;
  titulo: string;
  descricao: string | null;
  status: StatusQuestionario;
  created_at: string;
  updated_at: string;
}

export interface Pergunta {
  id: string;
  questionario_id: string;
  ordem: number;
  enunciado: string;
  tipo: TipoCampo;
  opcoes: string[];
  ajuda: string | null;
  obrigatoria: boolean;
}

export interface Aplicacao {
  id: string;
  questionario_id: string;
  unidade_id: string;
  data_aplicacao: string;
  respondente: string | null;
  respostas: Record<string, ValorCampo>;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}
