# 📄 Contexto do Projeto — Valentrax / MedFlow HNSN

> Resumo de referência para onboarding rápido de novos colaboradores (humanos ou IA).
> Atualizado em 2026-07-21 (checkpoint-v37 + PRs #1 e #2).

## O que é

Plataforma web de gestão operacional hospitalar (HIS enxuto) em produção real no
**Hospital Nossa Senhora de Navegantes**. Centraliza: ambulatório, giro/ocupação de
leitos, pronto-socorro (triagem Manchester), bloco cirúrgico, SCIH (controle de
infecção), farmácia clínica, **estoque & compras** e prontuário-resumo do paciente,
com BI e indicadores.

**Multi-hospital:** 1 banco Supabase por hospital (isolamento físico, adequado à
LGPD). Hoje há dois deploys: `medflow-hnsn` e `medflow-demo`.

## Quem faz o quê

- **Dona do repositório (`nirhnsn08-blip`)** — enfermeira: modelagem dos fluxos
  assistenciais e regra de negócio clínica.
- **Colaborador (TI)** — desenvolvimento e parte técnica.

## Stack

React 18 + Vite 5 (JS/JSX, **sem TypeScript**) · Recharts · Supabase (Auth +
PostgreSQL + REST + Edge Functions em Deno) · deploy automático na Vercel · CI no
GitHub valida o build · Edge Function opcional de resumo clínico com Claude.

## Arquitetura

- **Todo o front num único `src/App.jsx` (~12.300 linhas).**
- Acesso ao Supabase via `fetch` REST direto (apikey anon + JWT do usuário logado).
- Fallback para `localStorage` quando offline — mas **o login exige Supabase**.
- 36 tabelas, **todas com RLS ativo e com política** — nenhuma acessível sem
  login (auditado em 2026-07-21). Mas o controle por papel (`adm_master`,
  `adm_silver`, `analista`, `visualizador`, via `my_role()`) vale **só para a
  escrita**: as políticas de `SELECT` são `using (true)`, então **qualquer
  usuário autenticado lê qualquer tabela**, inclusive um `visualizador`.
  Ver "Decisões em aberto".
- Registros clínicos **append-only** (evoluções, prescrições, kardex, auditoria).
  A imutabilidade foi validada em teste: nem um `adm_master` apaga pela API.
- 21 arquivos SQL em `supabase/` (schema base + migrações incrementais).

## Como rodar localmente

```bash
git clone https://github.com/nirhnsn08-blip/medflow-hnsn.git
cd medflow-hnsn
npm install
# criar .env com VITE_SUPABASE_URL e VITE_SUPABASE_KEY
# (usar a chave anon/publishable — a service_role NUNCA vai para o app)
npm run dev        # http://localhost:5173
```

Sem o `.env` o app roda em modo `localStorage` e **não passa da tela de login**.

## Estado atual (2026-07-21)

- Último checkpoint: **v37**. PRs **#1** (correções de bugs) e **#2** (fluxo de
  equipe) mergeados na `main`.
- Documentação: [`GUIA-GIT.md`](GUIA-GIT.md) (trabalho em equipe),
  [`RELATORIO-TESTE.md`](RELATORIO-TESTE.md) + `.pdf` (bugs encontrados).
- **Teste de carga executado** com 60 pacientes fictícios em ~40 telas (todos os
  módulos e sub-abas): **nenhum crash, nenhum erro de console**. Dados de teste já
  removidos do banco.

### Bugs corrigidos no PR #1
- **Crítico:** `todayStr()` usava UTC — no Brasil (UTC-3), após ~21h o app achava
  que já era amanhã e **gravava dados no dia errado** (produção do ambulatório,
  `data_alta`, `data_internacao`), além de abrir o mapa cirúrgico no dia errado.
- Indicadores do Bloco quebravam em fev/abr/jun/set/nov (data inválida `-31`).
- Livro de Controlados comparava timestamps como string (documento fiscalizável).
- KPI de reposição da Farmácia mudava ao digitar na busca.
- Métricas do ambulatório mal rotuladas ("Produção" × "Comparec. Gercon").

## ⚠️ Regras para não quebrar nada

1. **Só o merge publica.** Branch, commit, push e PR são seguros.
   Fluxo: `git pull` → branch → PR → testar preview da Vercel → merge.
2. **`git pull` antes de cada sessão** — as duas pessoas trabalham em paralelo e a
   cópia local não se atualiza sozinha.
3. **O banco Supabase é COMPARTILHADO** entre previews e produção: testar salvando
   no preview grava dado real. Migrações **sempre aditivas** (`add column if not
   exists`, nunca `drop`), rodadas **antes** do merge do código, avisando a outra
   pessoa.
4. **`App.jsx` é monolítico** — dois editando ao mesmo tempo colidem. Dividir
   território por módulo.
5. **Rollback:** código volta fácil (Vercel → *Promote* no deploy anterior).
   **Banco não tem rollback** — daí a regra 3.

## Dívidas e próximos passos (ordem de prioridade)

1. **Modularizar o `App.jsx`** — ver item abaixo; virou a prioridade nº 1.
   acordado, não só documentado.
2. **Modularizar o `App.jsx`** — cresceu de 9k para 12,3k linhas em dois dias. A
   dívida está composta e é o que mais trava o trabalho em paralelo.
3. **Testes automatizados** — não existe nenhum, num sistema que decide alertas de
   medicação (dose máxima, interação medicamentosa, alergia).
4. **Banco de desenvolvimento separado** — hoje se testa em produção. Precisa existir
   **antes do primeiro paciente real**, sob risco de virar incidente de LGPD.
5. Migração dos registros gravados com data +1 antes da correção de fuso.
6. Vulnerabilidade Vite/esbuild (apenas ambiente de dev) — upgrade controlado, sem
   `npm audit fix --force`.

## Decisões em aberto

0. **Quem pode ver o quê?** Hoje qualquer usuário autenticado lê todas as tabelas
   (política de `SELECT` = `using (true)`). Nada está aberto sem login, então não
   é vazamento externo — mas um `visualizador` enxerga o mesmo que um
   `adm_master`. Apertar isso é decisão **clínica**, não técnica: precisa da
   enfermeira definindo o que cada papel legitimamente precisa ver, antes de
   qualquer mudança. Mexer no `SELECT` sem esse acordo tira acesso de quem tem
   direito, no meio do plantão.
   Caso pontual junto: `auditoria` aceita `INSERT` de qualquer autenticado
   (`with check (true)`) — enfraquece o valor probatório da trilha.

## Perguntas em aberto

1. Existe ambiente de staging/banco de teste, ou todo teste de escrita é feito em
   produção?
2. O `App.jsx` monolítico é restrição a manter ou pode ser modularizado?
3. Como garantir que schema e código não saiam de sincronia entre os hospitais?
4. LGPD: existe registro de tratamento de dados, DPA com os hospitais e política para
   o uso da IA (resumo-paciente) com dados clínicos?
