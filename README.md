# Sistema UBS · Salgueiro/PE

Sistema web de apoio à gestão das Unidades Básicas de Saúde (UBS), unindo duas propostas:

- **Designação (Célula 3):** unidades e equipes, matriz profissional × atividade, restrições operacionais,
  pendências e coleta de campo com cálculo de capacidade.
- **APS Data & Performance:** painel de indicadores, dicionário de dados, fórmulas padronizadas com versão,
  importação de planilhas, controle de qualidade e auditoria (rastreabilidade).
- **Ficha configurável da UBS:** o administrador geral define quais informações toda UBS tem (CNES, endereço,
  estrutura… e qualquer campo novo, sem programar); o administrador de cada UBS preenche a sua.
- **Questionários de campo:** o administrador geral monta pesquisas (texto, número, sim/não, escolhas, escala 1–5),
  cada UBS responde e o sistema consolida e compara os resultados, com exportação CSV.

> **Privacidade (LGPD):** o sistema trabalha **somente com dados agregados** (por unidade e mês) e dados de equipe.
> **Nunca** cadastre nome, CPF, Cartão SUS ou qualquer dado de paciente.

---

## Como o sistema está organizado

O menu tem só **5 portas de entrada**; cada uma reúne várias funções em abas:

| Menu | Abas / conteúdo | Quem vê |
|---|---|---|
| 🏠 **Início** | Atalhos + **“O que fazer agora”** (tarefas pendentes de cada pessoa) + UBS com % da ficha preenchida | Todos |
| 🏥 **UBS** | Ficha · Equipe e atividades (matriz) · Restrições e pendências · Visitas de campo | Todos (edita quem administra a UBS) |
| ✍ **Questionários** | Lista → Responder · Resultados · Editar perguntas | Todos (cria: administrador geral) |
| 📊 **Indicadores** | Painel · Lançar dados · Qualidade dos dados · Definições | Todos (lança: administradores) |
| ⚙ **Configurações** | Usuários · Ficha das UBS · Atividades da matriz · Histórico de alterações · Backup | Administrador geral |

Cada tela tem uma caixa **💡 Como usar esta tela** (pode ser recolhida). Ficha da UBS e resultados de questionários
têm botão **🖨 Imprimir** (também serve para salvar em PDF).

## Tecnologias (todas com plano gratuito)

| Parte | Tecnologia | Para que serve |
|---|---|---|
| Telas | React + TypeScript + Vite | Interface que roda no navegador |
| Banco de dados | Supabase (PostgreSQL) | Guarda todos os dados |
| Login e senha | Supabase Auth | Cadastro, login, recuperação de senha |
| Permissões | Row Level Security (RLS) | O **banco** decide quem pode ver/editar cada linha |
| Hospedagem | GitHub Pages | Site publicado com HTTPS |

## Papéis de usuário

| Papel (nome no banco) | O que pode fazer |
|---|---|
| **Administrador(a) geral** (`gestor`) | Cria/desativa UBS, define os campos da ficha, cria questionários, mantém o dicionário de indicadores, aprova usuários, vê tudo e a auditoria |
| **Administrador(a) da UBS** (`coordenador`) | Altera **tudo da própria UBS**: ficha, equipe, matriz, restrições, coletas, lançamentos e respostas de questionários |
| **Profissional** (`profissional`) | Somente consulta |

- Quem se cadastra entra **inativo** e só acessa depois que o administrador geral aprova (menu *Usuários*).
- **O primeiro usuário cadastrado vira administrador geral automaticamente.**
- O sistema não deixa ficar sem nenhum administrador geral ativo.

## Estrutura de pastas

```
sistema-ubs/
├── src/
│   ├── App.tsx              # rotas (endereços) e proteção das páginas
│   ├── auth/                # controle do usuário logado
│   ├── components/          # peças visuais reutilizáveis (menu, cartões, gráfico)
│   ├── lib/                 # conexão com o Supabase, tipos, cálculos
│   ├── pages/               # telas: Inicio, Acesso, Questionários…
│   │   ├── ubs/             # página da UBS e suas abas
│   │   ├── indicadores/     # página de indicadores e suas abas
│   │   └── config/          # configurações (administrador geral)
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

> ⚠️ **Plano gratuito:** projetos Supabase sem uso por 7 dias são **pausados**. O workflow
> `.github/workflows/manter-ativo.yml` consulta o banco a cada 3 dias para evitar isso. Se mesmo assim pausar, entre no
> painel do Supabase e clique em *Restore project* (os dados não são perdidos). Observação: o GitHub desativa
> agendamentos de repositórios sem nenhum commit há 60 dias — se isso acontecer, reative em *Actions → Manter banco ativo*.
>
> 💾 **Backup:** o plano gratuito não tem backup automático. Use *Configurações → Backup* uma vez por mês.

## Publicação no GitHub Pages

1. Envie o código para um repositório no GitHub (branch `main`).
2. No repositório: *Settings → Pages → Source:* **GitHub Actions**.
3. Os dados de conexão do site publicado ficam em `.env.production` (URL e chave *publishable* do Supabase).
4. Cada `git push` na `main` roda os testes do banco e publica o site automaticamente (aba *Actions* mostra o progresso).

A chave *publishable* é pública por natureza: a segurança está nas regras RLS do banco. **Nunca** coloque a
*secret key* / *service_role* no código.

---

## Ficha da UBS e questionários

- **Campos da ficha** (menu *Administração → Campos da ficha*): crie, renomeie, reordene, desative ou remova campos.
  Tipos: texto curto/longo, número, data, sim/não, escolha única, múltipla escolha e escala 1–5. Os valores ficam em
  `unidades.dados_ficha` (JSON indexado pelo id do campo).
- **Questionários** (menu *Pesquisa de campo*): ficam em **rascunho** até o administrador geral abri-los.
  Com o questionário **aberto**, cada administrador de UBS responde pela sua unidade; **encerrado**, ninguém altera mais.
  Rascunhos são invisíveis para as UBS, e cada UBS só vê as próprias respostas (o administrador geral vê todas).

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
