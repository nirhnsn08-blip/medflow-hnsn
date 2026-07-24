# 🤝 Handoff — como retomar o trabalho

Documento curto de passagem, para quem volta ao projeto (pessoa ou IA) depois de
um tempo, ou começa num chat novo.

> **O raio-x completo está em [CONTEXTO.md](CONTEXTO.md).** Leia de lá em vez de
> reconstruir de cabeça. Este arquivo é só o essencial para começar sem quebrar nada.

**Atualizado em:** 2026-07-23 · `main` em `e5c6789` · zero PRs abertos.

---

## Os 4 passos antes de tocar em qualquer coisa

```bash
git checkout main
git pull                 # 1. a outra pessoa quase sempre avançou
npm install              # 2. pode ter dependência nova
npm test                 # 3. tem que dar verde ANTES de você mexer
git checkout -b minha-feature
```

**4.** Confira se o banco está como o código espera:

```bash
node supabase/validar-sql.mjs
```

O passo 1 não é formalidade. Já aconteceu de a `main` avançar **39 commits, 4
migrações e +2.000 linhas** de um dia para o outro.

---

## As regras que não podem ser esquecidas

1. **Só o merge publica.** Branch, commit, push e PR são seguros — pode errar à
   vontade. O merge republica na Vercel para o hospital.
2. **O banco é compartilhado** entre preview e produção. Testar salvando no preview
   grava no banco de verdade. Para testar escrita, use `npm run dev:demo` (banco de
   teste separado).
3. **Migração é sempre aditiva** (`create table if not exists`, `add column if not
   exists` — nunca `drop`), rodada **à mão no painel do Supabase ANTES do merge** do
   código, e avisada à outra pessoa. Não há automação de migração.
4. **Rollback de código é fácil** (Vercel → *Promote* no deploy anterior).
   **Rollback de banco não existe** — daí a regra 3.
5. **Registro clínico é imutável.** Nada de `UPDATE` destrutivo ou `DELETE` em
   evolução, prescrição, anotação ou sumário. Correção = registro novo apontando
   para o anterior (`corrige_id` / `substitui_id`).

---

## Onde fica cada coisa

| Precisa mexer em… | Vá para |
|---|---|
| Regra clínica (alerta, NEWS, reconciliação, alta) | `src/clinico/*.js` — funções puras, **é onde ficam os testes** |
| Gravação do prontuário | `src/prontuario/dados.js` — todo INSERT do PEP passa por aqui |
| Telas do prontuário | `src/prontuario/*.jsx` |
| Quem enxerga quais módulos | `src/acesso/*` |
| Qualquer outro módulo | `src/App.jsx` (~14.400 linhas — combine o território antes) |

**Padrão que funcionou e vale repetir** ao tirar código do `App.jsx`: escolher um
bloco de funções **puras** (sem React, sem DOM, sem rede) → capturar o comportamento
atual → extrair sem mudar lógica → comparar → então escrever os testes.

---

## Arquivos que você NÃO edita à mão

São gerados. Editar à mão cria divergência silenciosa:

| Arquivo | Regenerar com |
|---|---|
| `supabase/auditoria-banco.sql` | `node supabase/gerar-auditoria.mjs` |
| `supabase/reconstruir-banco.sql` | `node supabase/gerar-reconstrucao.mjs` |

**Rode os dois depois de criar qualquer migração nova.** A auditoria mantida à mão já
ficou cega ao módulo mais recente duas vezes — e auditoria cega é pior que nenhuma,
porque dá falsa confiança.

---

## Testes — o que eles protegem

`npm test` roda **254 testes**. Três merecem atenção especial:

- **`contrato-banco.test.js`** — confere que toda coluna gravada pelo PEP existe no
  banco. Existe porque duas telas gravavam em colunas inexistentes: o PostgREST
  recusava o INSERT **em silêncio**, o profissional clicava em salvar e nada era
  gravado. Se você criar tela que grava, acrescente o caso aqui.
- **`seed-perfis.test.js`** — confere que os perfis de acesso do código e do SQL não
  divergiram, grant por grant.
- **`papeis.test.js`** — as regras de competência profissional (COFEN/CFM). Se
  afrouxarem por descuido, ninguém percebe até virar problema com o conselho.

---

## Estado atual, em uma frase

O **PEP está completo** (admissão → prescrição com aprazamento e checagem → sinais
vitais com NEWS → evolução → reconciliação medicamentosa → alta com sumário), e os
**perfis de acesso por cargo** estão no ar.

**Ainda não há paciente real no sistema.**

### O que está pendente

1. **Reclassificar a equipe** nos cargos certos — hoje quase todos estão no perfil
   "Provisório", que mantém o acesso antigo. Só depois disso desativar o Provisório.
2. **Modo sombra + quebra-vidro**, que são pré-requisitos para apertar o RLS de
   verdade (ver o aviso em [CONTEXTO.md](CONTEXTO.md) — hoje o controle de acesso
   organiza o menu, **não** restringe o dado).
3. **Modularizar o `App.jsx`** — dívida estrutural que trava o trabalho em paralelo.

---

## Como voltar a um ponto seguro

```bash
git log --oneline -20            # ache o commit bom
git revert -m 1 <hash-do-merge>  # desfaz um merge SEM reescrever histórico
```

Para o site, o caminho mais rápido é a Vercel: *Deployments* → deploy anterior →
**Promote to Production**. Volta em segundos.

⚠️ **Não use `git reset --hard` + `push --force` na `main`.** Com duas pessoas
trabalhando, isso apaga o trabalho da outra.
