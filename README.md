# MedFlow HNSN
### Plataforma de Gestão de Atendimentos Ambulatoriais
Hospital Nossa Senhora de Navegantes

App em **React + Vite**. Dados no **Supabase**, deploy automático na **Vercel**,
código versionado no **GitHub**.

---

## 🔄 Fluxo de trabalho (equipe)

> 📖 **Guia completo em [docs/GUIA-GIT.md](docs/GUIA-GIT.md)** — leia antes de mexer
> no código pela primeira vez.

O projeto é desenvolvido por **mais de uma pessoa**. Por isso o trabalho passa por
uma branch e um Pull Request, nunca direto na `main`:

```
git pull  →  branch  →  editar  →  push  →  Pull Request  →  testar preview  →  merge  →  Vercel publica
                                                                                 ▲
                                                                    só aqui vai ao ar
```

**Ao começar a trabalhar — sempre:**
```bash
git checkout main
git pull                              # traz o que a outra pessoa fez
git checkout -b minha-feature
```

**Ao terminar:**
```bash
git add .
git commit -m "descreva a mudança"
git push -u origin minha-feature
```
Depois abra o **Pull Request** no GitHub. A Vercel cria automaticamente uma **URL de
preview** (cópia do site com o seu código, isolada da produção) e o CI valida o build.
Teste no preview, espere o `build ✅`, e só então faça o **merge**.

Em ~1 min após o merge a Vercel publica em https://medflow-hnsn.vercel.app

### ⚠️ Três regras para não quebrar nada

1. **Só o merge publica.** Branch, commit, push e PR são seguros — pode errar à vontade.
2. **O banco Supabase é compartilhado** entre previews e produção: testar salvando no
   preview grava dado real. Migrações devem ser **aditivas** (`add column if not
   exists`, nunca `drop`), rodadas **antes** do merge do código, e avisadas à outra
   pessoa.
3. **`src/App.jsx` é um arquivo único e grande** — combinem quem mexe em qual módulo
   para não colidir.

**Se quebrar:** Vercel → *Deployments* → deploy anterior → **Promote to Production**
(volta em segundos). Rollback de código é fácil; de banco **não existe** — daí a regra 2.

---

## 📁 Estrutura
```
medflow-hnsn/
├── index.html              ← Página principal (casca HTML + tema)
├── package.json            ← Dependências
├── vite.config.js          ← Build (Vite)
├── vercel.json             ← Config da Vercel
├── .gitignore / .gitattributes
├── .env.example            ← Modelo de credenciais (uso local opcional)
├── docs/
│   ├── GUIA-GIT.md         ← Como trabalhar em equipe sem quebrar nada
│   ├── CONTEXTO.md         ← Raio-x do projeto (onboarding rápido)
│   └── RELATORIO-TESTE.md  ← Bugs encontrados em teste de carga
├── src/
│   ├── main.jsx            ← Ponto de entrada React
│   └── App.jsx             ← Aplicação completa
├── supabase/
│   └── schema.sql          ← Tabelas do banco (referência)
└── .github/workflows/
    └── ci.yml              ← Valida o build a cada push (opcional)
```

---

## 💻 Rodar localmente
```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a versão de produção em /dist
```
> **Credenciais:** o app lê as chaves das variáveis de ambiente
> `VITE_SUPABASE_URL` e `VITE_SUPABASE_KEY`.
> - **Local:** copie `.env.example` para `.env` e preencha (o `.env` está no
>   `.gitignore` — nunca vai para o GitHub).
> - **Publicado:** as mesmas variáveis ficam na Vercel em
>   *Project → Settings → Environment Variables*.
>
> Sem essas variáveis o app roda em modo `localStorage` e **o login não funciona**
> (a autenticação depende do Supabase). Use sempre a chave **anon/publishable** —
> a `service_role` nunca vai para o app.

---

## 🗄️ Banco de dados (Supabase)
O schema das tabelas (`atendimentos`, `auditoria`) está em
[`supabase/schema.sql`](supabase/schema.sql) — serve de referência/backup.
Rode no **SQL Editor** do Supabase apenas se precisar recriar as tabelas.

---

## 👥 Credenciais padrão do app

O login usa **Supabase Auth** (senhas nunca ficam no código nem no navegador).
Usuários iniciais: `laura` (ADM Master) e `diretor` (ADM Silver) — troque a senha
no primeiro acesso pela aba **👥 Usuários → 🔑 Trocar minha senha**.

**Adicionar / remover usuários:** painel do Supabase → *Authentication → Users*.
Crie com e-mail no formato `usuario@hnsn.local` e defina o papel em *User Metadata*,
ex.: `{ "role": "adm_silver" }`. Papéis: `adm_master`, `adm_silver`, `analista`,
`visualizador`.

## 🔒 Segurança
- Acesso ao banco exige usuário autenticado (RLS por papel) — a chave publishable
  sozinha não lê nem grava nada.
- Auditoria é imutável (não pode ser editada/apagada pelo app).

---

Desenvolvido com ❤️ para o Ambulatório HNSN
