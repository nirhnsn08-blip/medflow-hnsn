# MedFlow HNSN
### Plataforma de Gestão de Atendimentos Ambulatoriais
Hospital Nossa Senhora de Navegantes

App em **React + Vite**. Dados no **Supabase**, deploy automático na **Vercel**,
código versionado no **GitHub**.

---

## 🔄 Fluxo de publicação (automatizado)

```
editar o código  →  git push  →  GitHub recebe  →  Vercel publica sozinho ✅
```

No dia a dia, depois de mexer no código, basta:

```bash
git add .
git commit -m "descreva a mudança"
git push
```

Em ~1 min a Vercel publica a nova versão em https://medflow-hnsn.vercel.app
(não precisa mais subir arquivo na mão pelo site do GitHub nem pela Vercel).

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
