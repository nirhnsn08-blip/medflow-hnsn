# Valentrax — MedFlow HNSN
### Plataforma de gestão hospitalar com prontuário eletrônico (PEP)
Hospital Nossa Senhora de Navegantes

Ambulatório · Pronto-Socorro · Bloco Cirúrgico · Giro de Leitos · SCIH ·
Farmácia Clínica · Estoque & Compras · **Prontuário Eletrônico do Paciente**

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
├── package.json            ← Dependências e scripts (dev, dev:demo, test, build)
├── vite.config.js          ← Build (Vite)
├── vercel.json             ← Config da Vercel
├── .env.example            ← Modelo de credenciais (uso local)
├── docs/
│   ├── CONTEXTO.md         ← Raio-x do projeto — comece por aqui
│   ├── HANDOFF.md          ← Como retomar o trabalho sem quebrar nada
│   ├── GUIA-GIT.md         ← Trabalho em equipe (branch, PR, merge)
│   ├── REQUISITOS-PEP.md   ← Requisitos legais do prontuário (CFM, COFEN, LGPD)
│   └── RELATORIO-TESTE.md  ← Bugs encontrados em teste de carga
├── src/
│   ├── main.jsx            ← Ponto de entrada React
│   ├── App.jsx             ← A maior parte das telas (arquivo grande)
│   ├── clinico/            ← Regra clínica pura + testes (alertas, NEWS,
│   │                          alergias, papéis, reconciliação, alta)
│   ├── prontuario/         ← PEP: telas + `dados.js` (todo INSERT passa lá)
│   └── acesso/             ← Perfis de acesso: quem enxerga quais módulos
├── supabase/
│   ├── schema.sql          ← Base
│   ├── migracao-*.sql      ← Migrações incrementais (rodar à mão, na ordem)
│   ├── auditoria-banco.sql      ← GERADO — não editar à mão
│   ├── reconstruir-banco.sql    ← GERADO — não editar à mão
│   ├── gerar-auditoria.mjs      ← Regenera a auditoria
│   ├── gerar-reconstrucao.mjs   ← Regenera o script de reconstrução
│   └── validar-sql.mjs          ← Pega coluna órfã / parêntese desbalanceado
└── .github/workflows/
    └── ci.yml              ← Roda validar-sql + testes + build a cada push
```

---

## 💻 Rodar localmente
```bash
npm install
npm run dev        # banco do HOSPITAL   → http://localhost:5173
npm run dev:demo   # banco de TESTE      → http://localhost:5174
npm test           # 254 testes (Vitest)
npm run build      # gera a versão de produção em /dist
```

> ⚠️ **Para testar gravação, use `npm run dev:demo`.** O `npm run dev` aponta para o
> banco do hospital — salvar ali grava de verdade. Uma faixa no topo da tela mostra
> em qual banco você está.
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

**58 tabelas.** O `schema.sql` é a base; cada mudança posterior é uma
`migracao-*.sql`, rodada **à mão** no SQL Editor. Não existe automação de migração —
alguém roda, sempre **antes** do merge do código.

Depois de criar uma migração nova, regenere os dois arquivos derivados:

```bash
node supabase/gerar-auditoria.mjs && node supabase/gerar-reconstrucao.mjs
```

Para conferir o banco a qualquer momento, rode `supabase/auditoria-banco.sql`
(somente leitura) no SQL Editor.

---

## 👥 Usuários e acesso

O login usa **Supabase Auth** (senha nunca fica no código nem no navegador).

**Criar usuário:** aba **Usuários** do app, com perfil `adm_master`. Escolha o
**cargo** (Enfermeiro, Almoxarifado, Recepção…) e o resto vem configurado: os módulos
que a pessoa enxerga, o papel de sistema e a categoria profissional.

Não crie usuário pelo painel do Supabase — ele nasceria sem cargo e sem categoria,
e não enxergaria nada.

**Três eixos de permissão**, que respondem perguntas diferentes:

| Eixo | Responde |
|---|---|
| **Papel** (`adm_master`…`visualizador`) | quanto mexe no sistema |
| **Categoria** (médico, enfermeiro, técnico…) | o que pode fazer clinicamente (COFEN/CFM) |
| **Cargo/perfil** | quais módulos enxerga |

Poder administrativo **não** concede competência clínica: um adm_master administrativo
não assina evolução médica.

---

## 🔒 Segurança — o que é verdade hoje

- **Login obrigatório.** Todas as tabelas têm RLS ativo e política; a chave
  publishable sozinha não lê nada.
- **Escrita é controlada por papel** (`my_role()`).
- **Registro clínico é imutável** — evolução, prescrição, anotação e sumário não podem
  ser editados nem apagados pelo app. Correção vira registro novo.
- **⚠️ Leitura ainda NÃO é segregada.** As políticas de `SELECT` são abertas a
  qualquer usuário autenticado: os perfis de acesso escondem módulos do **menu**, mas
  quem souber usar a API alcança dado que o menu esconde. **Não descreva o sistema
  como "acesso segregado"** — fechar isso é a próxima etapa. Detalhes e o plano em
  [docs/CONTEXTO.md](docs/CONTEXTO.md).

---

Desenvolvido com ❤️ para o Hospital Nossa Senhora de Navegantes
