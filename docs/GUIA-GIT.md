# 🧭 Guia de trabalho em equipe — Git, GitHub e Vercel

> Guia rápido para as duas pessoas que desenvolvem o Valentrax trabalharem juntas
> **sem quebrar a produção do hospital**. Leia uma vez inteiro; depois use a
> "Rotina diária" e a "Consulta rápida" do fim.

---

## 1. O modelo mental (entenda isso e o resto fica fácil)

Existem **três lugares** onde o código vive:

```
   [ SEU PC ]  ──push──►  [ GITHUB ]  ──merge na main──►  [ VERCEL = produção ]
       ▲                       │                              (hospital usa)
       └────────pull───────────┘
```

| Lugar | O que é | Quem vê |
|---|---|---|
| **Seu PC** | Sua cópia pessoal. É onde você edita e testa. | Só você |
| **GitHub** | A cópia oficial, onde o trabalho dos dois se junta. | Vocês dois |
| **Vercel** | O site publicado, rodando de verdade. | O hospital |

**Regra de ouro:** sua cópia local **não se atualiza sozinha**. Ela fica congelada no
momento do último `pull`. Se a outra pessoa trabalhou, você só verá quando pedir.

---

## 2. Os conceitos, em uma linha cada

| Termo | O que faz | Quebra algo? |
|---|---|---|
| `git status` | Diz onde você está e o que mudou | Não — só lê |
| `git pull` | **Baixa** o que a outra pessoa fez | Não (se você não tiver mudanças soltas) |
| **branch** | Uma linha de trabalho paralela e isolada | Não — é justamente a proteção |
| `git commit` | Salva um ponto do seu trabalho, com descrição | Não — só local |
| `git push` | **Envia** sua branch para o GitHub | Não — branch não é produção |
| **Pull Request (PR)** | Pedido para juntar sua branch na `main` | Não — é só o pedido |
| **merge** | Junta de fato na `main` | ⚠️ **SIM — aqui vai ao ar** |
| **tag / checkpoint** | Marca um ponto seguro para voltar depois | Não |

> Repare: **só o merge publica.** Todo o resto é seguro.

---

## 3. Rotina diária (copie e cole)

### 🌅 Ao começar a trabalhar — SEMPRE
```bash
git checkout main
git pull
git checkout -b minha-feature
```
Pular o `pull` é o erro nº 1: você constrói em cima de código velho e o conflito
aparece depois, pior.

### 💾 Enquanto trabalha
```bash
git add .
git commit -m "descreve o que mudou"
```
Commite várias vezes ao longo do dia. Commit é local — não afeta ninguém.

### 🚀 Ao terminar
```bash
git push -u origin minha-feature
```
Depois: abra o **Pull Request** no GitHub → teste na **URL de preview da Vercel**
→ a outra pessoa revisa → **merge**.

---

## 4. Como testar ANTES de ir para produção

Ao abrir um PR, a Vercel cria **automaticamente uma URL de preview** — uma cópia do
site rodando com o seu código, separada da produção. É o ambiente de homologação.

No PR você verá algo como:
```
Vercel – medflow-hnsn   ✅ Deployment has completed
build                   ✅ pass
```
- **build ✅** = o código compila
- **Deployment ✅** = clique no link e teste navegando

Só faça o merge com tudo verde **e** depois de testar o preview.

---

## 5. ⚠️ Os dois riscos específicos deste projeto

### Risco 1 — Existem DOIS bancos, e é fácil confundir

| Banco | Projeto Supabase | Para quê |
|---|---|---|
| **Principal** | `riuvyxppixeclxudsgpv` | o hospital. Dado que entra aqui é pra valer |
| **Demo** | `ufxqdvxhruaswuzhmxyf` | testes. Descartável, mesma estrutura do principal |

⚠️ **Cada PR gera DUAS URLs de preview na Vercel** — e elas parecem iguais:

```
medflow-demo-git-<branch>…vercel.app   →  banco DEMO      ✅ teste aqui
medflow-hnsn-git-<branch>…vercel.app   →  banco PRINCIPAL ❌ grava de verdade
```

**Como saber onde você está:** quando o app aponta para um banco de teste, aparece
uma **faixa laranja no topo** com o rótulo e a referência do projeto. **Sem faixa =
você está na produção.** Nunca confie só na URL.

#### Testar localmente contra o demo

```bash
npm run dev:demo     # porta 5174 — usa o .env.demo, faixa laranja aparece
npm run dev          # porta 5173 — usa o .env, PRODUÇÃO, sem faixa
```

Cada modo tem **porta fixa**, e o Vite **recusa subir** se ela estiver ocupada
(`strictPort`) em vez de escorregar para a próxima livre. Antes os dois disputavam
a 5173: com o demo já rodando, um `npm run dev` distraído colocava o **hospital**
na 5174 — a porta que a equipe trata como segura. Se aparecer
`Port 5174 is already in use`, é o demo já no ar; use a aba que existe.

⚠️ Porta é o primeiro aviso, não o último: **quem confirma o banco é a faixa
laranja** com a referência do projeto.

Para criar o `.env.demo`, veja as instruções no `.env.example`.

#### Fluxo quando a mudança precisa de tabela/coluna nova

```
1. branch + código
2. rodar o SQL no DEMO            ← painel do Supabase
3. testar (npm run dev:demo ou a URL medflow-demo-git-…)
4. deu certo? rodar o MESMO SQL no PRINCIPAL
5. só então: merge do código
```

A ordem dos passos 4 e 5 não é opcional: o código sobe sozinho na Vercel ao
mergear, o banco **não**. Invertendo, a tela nova chega procurando uma coluna que
ainda não existe.

**Regras que continuam valendo:**
1. Migração é **sempre aditiva**: `add column if not exists`, `create table if not
   exists`. **Nunca** `drop column` / `drop table` com dado dentro.
2. **Avise a outra pessoa antes** de rodar qualquer SQL no principal.
3. Nunca teste escrita no banco principal (não dê alta/internação em leito de
   verdade só para "ver se funciona") — é para isso que o demo existe.
4. Depois de criar migração nova, rode `node supabase/validar-sql.mjs` e
   `node supabase/gerar-auditoria.mjs`.

### Risco 2 — Todo o app está em UM arquivo gigante

`src/App.jsx` tem mais de 11.000 linhas. Se os dois editarem ao mesmo tempo, o Git
vai acusar conflito — e resolver conflito nesse tamanho é doloroso.

**Mitigação de hoje:** dividam por **território**. Ex.: "esta semana eu mexo em
Farmácia e Estoque; você mexe em Leitos e Pronto-Socorro." Enquanto tocarem em
regiões diferentes, o Git resolve sozinho.

**Solução real (recomendada):** quebrar o `App.jsx` em módulos por domínio. É o
investimento que mais destrava o trabalho em paralelo.

---

## 6. Se algo der errado — desfazer

| Situação | O que fazer |
|---|---|
| **Quebrou a produção** | Vercel → *Deployments* → escolha o deploy anterior → **Promote to Production**. Volta em segundos, sem mexer em código. |
| Quero desfazer um merge | `git revert -m 1 <hash-do-merge>` |
| Quero voltar a um checkpoint | `git fetch --tags` e `git reset --hard checkpoint-vXX` |
| Fiz besteira e ainda não commitei | `git checkout -- .` (descarta tudo que não foi salvo) |
| Preciso pausar e atualizar | `git stash` → `git pull` → `git stash pop` |

> ⚠️ Rollback de **código** é fácil. Rollback de **banco de dados** não existe —
> por isso a regra das migrações aditivas.

---

## 7. Consulta rápida

```bash
# Onde estou e o que mudei?
git status

# Quais as versões mais recentes?
git log --oneline -5

# Tem novidade da outra pessoa?
git fetch && git status

# Rotina de início de trabalho
git checkout main && git pull && git checkout -b minha-feature

# Enviar meu trabalho
git add . && git commit -m "o que mudou" && git push -u origin minha-feature
```

**Leitura do `git status`:**
- `up to date` → em dia ✅
- `behind by N commits` → a outra pessoa trabalhou, **dê `git pull`**
- `ahead by N commits` → você tem trabalho ainda não enviado

---

## 8. Combinados sugeridos entre vocês

1. **Ninguém commita direto na `main`.** Sempre branch + PR.
2. **Avise quando fizer merge** — é o sinal para o outro dar `git pull`.
3. **Avise antes de rodar SQL** no Supabase.
4. **Crie um checkpoint** (`git tag checkpoint-vXX`) antes de mudanças grandes.
5. **Divida território** no `App.jsx` enquanto ele não for modularizado.
