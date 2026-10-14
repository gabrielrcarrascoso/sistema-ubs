// Junta todas as migrações (supabase/migrations) em um único arquivo para colar no SQL Editor do Supabase.
// Uso: npm run sql:juntar
import fs from 'node:fs';
import path from 'node:path';

const pasta = 'supabase/migrations';
const arquivos = fs.readdirSync(pasta).filter(f => f.endsWith('.sql')).sort();
const partes = arquivos.map(f => `-- >>>>> ${f}\n${fs.readFileSync(path.join(pasta, f), 'utf8')}`);
const cabecalho = '-- ARQUIVO GERADO AUTOMATICAMENTE por "npm run sql:juntar". Não edite: altere supabase/migrations.\n' +
  '-- Cole TODO o conteúdo no SQL Editor do Supabase (projeto novo e vazio) e clique em Run.\n\n';
fs.writeFileSync('supabase/instalar_banco.sql', cabecalho + partes.join('\n\n'));
console.log(`supabase/instalar_banco.sql gerado com ${arquivos.length} migrações.`);
