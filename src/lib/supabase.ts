import { createClient } from '@supabase/supabase-js';

// Os valores vêm do arquivo .env.local (no seu computador) ou dos "secrets" do GitHub (no site publicado).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const supabaseConfigurado = Boolean(url && key);

export const supabase = createClient(url || 'http://localhost', key || 'chave-ausente', {
  auth: {
    // PKCE: o link do e-mail (confirmação / nova senha) volta com ?code=..., que convive bem com as rotas "#/"
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Endereço base do site (sem "#/rota"), usado nos links enviados por e-mail
export const enderecoDoSite = () => window.location.origin + window.location.pathname;

// Traduz as mensagens de erro mais comuns do Supabase para português
export function traduzErro(err: unknown): string {
  const msg = (err as { message?: string })?.message || String(err);
  const mapa: [RegExp, string][] = [
    [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/Email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
    [/User already registered/i, 'Já existe uma conta com este e-mail.'],
    [/Password should be at least/i, 'A senha precisa ter pelo menos 8 caracteres.'],
    [/rate limit|too many requests/i, 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'],
    [/duplicate key value.*lancamentos/i, 'Já existe um lançamento deste indicador para esta unidade e mês. Edite o existente.'],
    [/duplicate key value.*equipes/i, 'Esta unidade já tem esse cargo cadastrado.'],
    [/duplicate key value.*indicadores/i, 'Já existe um indicador com esse código.'],
    [/duplicate key value/i, 'Registro duplicado: já existe um item com esses dados.'],
    [/row-level security/i, 'Você não tem permissão para alterar dados desta unidade.'],
    [/Failed to fetch|NetworkError/i, 'Sem conexão com o servidor. Verifique sua internet.'],
    [/New password should be different/i, 'A nova senha precisa ser diferente da atual.'],
  ];
  for (const [re, txt] of mapa) if (re.test(msg)) return txt;
  return msg;
}
