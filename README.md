# Sistema UBS · Salgueiro/PE

Sistema web de apoio à gestão das Unidades Básicas de Saúde (UBS), unindo duas propostas:

- **Designação (Célula 3):** unidades e equipes, matriz profissional × atividade, restrições operacionais,
  pendências e coleta de campo com cálculo de capacidade.
- **APS Data & Performance:** painel de indicadores, dicionário de dados, fórmulas padronizadas com versão,
  importação de planilhas, controle de qualidade e auditoria (rastreabilidade).

> **Privacidade (LGPD):** o sistema trabalha **somente com dados agregados** (por unidade e mês) e dados de equipe.
> **Nunca** cadastre nome, CPF, Cartão SUS ou qualquer dado de paciente.

---

## Tecnologias (todas com plano gratuito)

| Parte | Tecnologia | Para que serve |
|---|---|---|
| Telas | React + TypeScript + Vite | Interface que roda no navegador |
| Banco de dados | Supabase (PostgreSQL) | Guarda todos os dados |
| Login e senha | Supabase Auth | Cadastro, login, recuperação de senha |
| Permissões | Row Level Security (RLS) | O **banco** decide quem pode ver/editar cada linha |
| Hospedagem | GitHub Pages | Site publicado com HTTPS |

## Papéis de usuário

| Papel | O que pode fazer |
|---|---|
| **Gestor(a) da Secretaria** | Vê e edita tudo, aprova usuários, mantém o dicionário de indicadores, vê a auditoria |
| **Coordenador(a) de UBS** | Vê tudo e edita **apenas a própria unidade** |
| **Profissional** | Somente consulta |

- Quem se cadastra entra **inativo** e só acessa depois que um gestor aprova (menu *Usuários*).
- **O primeiro usuário cadastrado vira gestor automaticamente.** Cadastre-se primeiro!
- O sistema não deixa ficar sem nenhum gestor ativo.

## Estrutura de pastas

```
sistema-ubs/
├── src/
│   ├── App.tsx              # rotas (endereços) e proteção das páginas
│   ├── auth/                # controle do usuário logado
│   ├── components/          # peças visuais reutilizáveis (menu, cartões, gráfico)
│   ├── lib/                 # conexão com o Supabase, tipos, cálculos
│   ├── pages/               # uma tela por arquivo
│   └── styles.css           # visual
├── supabase/
│   ├── migrations/          # SQL do banco, em ordem (estrutura, segurança, dados iniciais)
│   └── instalar_banco.sql   # todas as migrações juntas (gerado por npm run sql:juntar)
├── scripts/                 # testes do banco e utilitários
└── .github/workflows/       # publicação automática no GitHub Pages
```

---

## Como rodar no seu computador

Pré-requisitos: [Node.js](https://nodejs.org) 20+ e [VS Code](https://code.visualstudio.com).

```bash
npm install
```

Copie `.env.example` para `.env.local` e preencha com os dados do **seu** projeto Supabase
(*Project Settings → API Keys*):

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

```bash
npm run dev
```

Abra o endereço que aparecer (ex.: http://localhost:5173).

### Comandos úteis

| Comando | O que faz |
|---|---|
| `npm run dev` | Roda o sistema localmente, recarregando a cada alteração |
| `npm run build` | Verifica erros de tipo e gera a versão final em `dist/` |
| `npm run test:banco` | Testa o SQL e as regras de permissão num Postgres em memória |
| `npm run sql:juntar` | Regera `supabase/instalar_banco.sql` a partir das migrações |

---

## Configuração do Supabase (uma única vez)

1. Crie uma conta em [supabase.com](https://supabase.com) e um projeto (plano **Free**, região **São Paulo**).
2. **Instalar o banco:** abra *SQL Editor → New query*, cole todo o conteúdo de `supabase/instalar_banco.sql` e clique em **Run**.
3. **Endereço do site:** em *Authentication → URL Configuration*:
   - **Site URL:** o endereço do GitHub Pages (ex.: `https://SEU-USUARIO.github.io/sistema-ubs/`)
   - **Redirect URLs:** adicione o mesmo endereço e `http://localhost:5173/`
4. **E-mails:** o e-mail gratuito padrão do Supabase só envia para membros da sua equipe no Supabase e tem limite por hora.
   - Para uso em turma/piloto: em *Authentication → Sign In / Providers → Email*, **desative "Confirm email"**
     (a aprovação pelo gestor já controla quem entra).
   - Para a recuperação de senha funcionar para todos, configure um SMTP gratuito (ex.: Brevo, 300 e-mails/dia) em
     *Authentication → Emails → SMTP Settings*.

> ⚠️ **Plano gratuito:** projetos Supabase sem uso por 7 dias são **pausados**. Para reativar, entre no painel do
> Supabase e clique em *Restore project*. Os dados não são perdidos.

## Publicação no GitHub Pages

1. Envie o código para um repositório no GitHub (branch `main`).
2. No repositório: *Settings → Pages → Source:* **GitHub Actions**.
3. *Settings → Secrets and variables → Actions → Variables*, crie:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
4. Cada `git push` na `main` publica o site automaticamente (aba *Actions* mostra o progresso).

A chave *publishable* é pública por natureza: a segurança está nas regras RLS do banco. **Nunca** coloque a
*secret key* / *service_role* no código.

---

## Regras dos indicadores

- **Fórmula única:** contagem = numerador; percentual/razão = numerador ÷ denominador × fator.
- **Consolidado de várias unidades:** soma dos numeradores ÷ soma dos denominadores (não média de percentuais).
- **Versão:** alterar a fórmula no dicionário cria uma nova versão; cada lançamento guarda a fórmula com que foi
  calculado, então números antigos não mudam sozinhos.
- **Duplicidade:** o banco impede dois lançamentos do mesmo indicador, unidade e mês.
- **Auditoria:** toda criação, alteração e remoção é registrada com usuário, data, valor anterior e novo.

Os indicadores iniciais são **sugestões** e devem ser validados pela Secretaria antes do uso oficial.

## Limitações conhecidas

- A matriz de competências é preliminar e **não gera escalas automaticamente**.
- O cálculo de capacidade é indicativo (uma atividade por vez), não é um modelo de otimização.
- Os dados iniciais vêm das planilhas da Célula 3 e precisam de validação em campo.
