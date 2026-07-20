# 💻 Trabalhar em outro computador

**Resumo:** Supabase e Vercel ficam **na nuvem** e já estão ligados ao repositório do
GitHub. Para trabalhar em outro PC, **só o código precisa ir junto** — e ele mora no
GitHub. Na prática: **basta baixar do git.**

## Passo a passo (o fluxo que usamos hoje)

1. Instale no computador novo:
   - **Git** → https://git-scm.com
   - Um editor de código, ex.: **VS Code** → https://code.visualstudio.com
2. Baixe o projeto (uma vez):
   ```bash
   git clone https://github.com/nirhnsn08-blip/medflow-hnsn
   cd medflow-hnsn
   ```
3. No dia a dia, depois de editar o código:
   ```bash
   git add .
   git commit -m "descreva a mudança"
   git push
   ```
4. O **Vercel publica sozinho** em ~1 min — igual ao computador principal. ✅

## O que NÃO precisa fazer
- ❌ **Mover Supabase ou Vercel.** São serviços na nuvem, já conectados ao repositório.
  Push no computador novo publica do mesmo jeito.
- ❌ **Copiar `.env`.** Não existe um `.env` no projeto — as chaves do Supabase ficam
  guardadas no **Vercel** (Project → Settings → Environment Variables).
- ❌ **Instalar Node.js.** Você não compila no seu PC; o Vercel compila a cada push.

## Seus acessos (mesmas contas de sempre, pelo navegador)
| Serviço | Endereço | Para quê |
|---|---|---|
| GitHub | github.com (`nirhnsn08-blip`) | guardar e baixar o código |
| Supabase | supabase.com | rodar SQL/migrações e ver dados |
| Vercel | vercel.com | acompanhar os deploys |

## Avisos importantes
- 🔐 **O `git push` pede login do GitHub.** Na primeira vez, o Git abre uma janela para
  entrar na sua conta (Git Credential Manager). Se pedir "token" em vez de senha, gere um
  em **GitHub → Settings → Developer settings → Personal access tokens** e cole no lugar
  da senha.
- 🛡️ **LGPD:** a pasta `backups/` (dados de pacientes) **não vem no clone** — está
  ignorada no git de propósito. Não leve backups para o 2º PC sem necessidade.
- 🔄 **Trabalhe em um PC de cada vez** e sempre dê `git pull` ao começar, para pegar o que
  foi feito no outro computador antes de editar. Assim evita conflito.

## Opcional — rodar/testar no próprio PC antes de publicar
Só é necessário se quiser ver a aplicação rodando localmente (não é o fluxo atual):
1. Instalar **Node.js** → https://nodejs.org (versão LTS).
2. Criar um arquivo `.env` na raiz (copie de `.env.example`) e preencher:
   ```
   VITE_SUPABASE_URL=...   (Supabase → Settings → API → Project URL)
   VITE_SUPABASE_KEY=...   (Supabase → Settings → API → anon public)
   ```
   Ou copiar esses valores de **Vercel → Settings → Environment Variables**.
3. Rodar:
   ```bash
   npm install
   npm run dev
   ```
