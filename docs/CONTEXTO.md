# 📄 Contexto do Projeto — Valentrax / MedFlow HNSN

> Resumo de referência para onboarding rápido de novos colaboradores (humanos ou IA).
> Atualizado em 2026-07-23 (PEP fases 1 a 3).

## O que é

Plataforma web de gestão operacional hospitalar (HIS enxuto) construída para o
**Hospital Nossa Senhora de Navegantes**. Centraliza: ambulatório, giro/ocupação de
leitos, pronto-socorro (triagem Manchester), bloco cirúrgico, SCIH (controle de
infecção), farmácia clínica, **estoque & compras** e o **prontuário eletrônico do
paciente (PEP)**, com BI e indicadores.

**⚠️ Ainda NÃO há paciente real no sistema.** O banco principal está povoado com
dados de teste e de configuração; nenhum atendimento real foi registrado até
2026-07-23. Isso importa para calibrar risco: escrita acidental hoje é sujeira de
dado, não incidente com dado de paciente. A partir do primeiro paciente real, as
regras mudam — ver "Dívidas".

**Multi-hospital:** 1 banco Supabase por hospital (isolamento físico, adequado à
LGPD). Hoje há dois bancos: o principal (`riuvyxppixeclxudsgpv`) e o de teste
(`ufxqdvxhruaswuzhmxyf`, usado por `npm run dev:demo`).

## Quem faz o quê

- **Dona do repositório (`nirhnsn08-blip`)** — enfermeira: modelagem dos fluxos
  assistenciais e regra de negócio clínica.
- **Colaborador (TI)** — desenvolvimento e parte técnica.

## Stack

React 18 + Vite 5 (JS/JSX, **sem TypeScript**) · Recharts · Supabase (Auth +
PostgreSQL + REST + Edge Functions em Deno) · deploy automático na Vercel · CI no
GitHub valida o build · Edge Function opcional de resumo clínico com Claude.

## Arquitetura

- **A maior parte do front ainda num único `src/App.jsx` (~14.400 linhas)**, mas a
  modularização começou e o PEP inteiro já nasceu fora dele:

  | Camada | Onde | O que é |
  |---|---|---|
  | Lógica clínica pura | `src/clinico/*.js` | alertas de farmácia, alergias, prontuário, papéis, **reconciliação**, **alta**. Sem React, sem rede — é onde moram os testes |
  | Acesso ao banco | `src/prontuario/dados.js` | todo INSERT do PEP passa por aqui |
  | Telas do PEP | `src/prontuario/*.jsx` | prontuário do internado, prescrição, anamnese, reconciliação, alta |
  | Perfis de acesso | `src/acesso/*.js` + `.jsx` | catálogo de módulos, resolução de permissão, matriz de perfis |

- **254 testes automatizados** (`npm test`, Vitest). O CI roda
  `validar-sql.mjs` + testes + build antes de qualquer merge.
- **`contrato-banco.test.js`** confere cada coluna gravada pelo PEP contra
  `supabase/auditoria-banco.sql`. Existe porque duas telas gravavam em colunas
  inexistentes e o PostgREST recusava o INSERT em silêncio — o profissional
  clicava em salvar e nada era gravado.
- Acesso ao Supabase via `fetch` REST direto (apikey anon + JWT do usuário logado).
- Fallback para `localStorage` quando offline — mas **o login exige Supabase**.
- **58 tabelas / 872 colunas** (auditoria gerada por `gerar-auditoria.mjs`), **todas com RLS ativo
  e com política** — nenhuma acessível sem login. Mas o controle por papel
  (`adm_master`, `adm_silver`, `analista`, `visualizador`, via `my_role()`) vale
  **só para a escrita**: as políticas de `SELECT` são `using (true)`, então
  **qualquer usuário autenticado lê qualquer tabela**, inclusive um `visualizador`.
  Ver "Decisões em aberto".

### Os três eixos de permissão

Confundi-los é o erro caro deste sistema. São perguntas diferentes:

| Eixo | Responde | Onde vive |
|---|---|---|
| `role` | quanto a pessoa mexe no **sistema** | `profiles.role` |
| `categoria` | o que ela pode fazer **clinicamente** | `profiles.categoria` + `src/clinico/papeis.js` |
| `perfil` | **quais módulos** ela enxerga | `profiles.perfil` + `perfis_permissoes` |

- **Poder administrativo não concede competência assistencial.** Um adm_master
  administrativo não assina evolução médica nem dá alta. Diagnóstico e prescrição de
  enfermagem são privativos do enfermeiro (COFEN 736/2024).
- **Perfil de acesso também não concede competência clínica** — ele só decide o que
  aparece no menu. Quem manda no ato assistencial continua sendo `papeis.js`.
- Registros clínicos **append-only** (evoluções, prescrições, kardex, auditoria, e
  todo o PEP). Correção = novo registro com `corrige_id`/`substitui_id`; o original
  permanece. A imutabilidade foi validada em teste: nem um `adm_master` apaga pela API.
- **36 arquivos SQL** em `supabase/` (schema base + migrações incrementais). Nunca
  editar `auditoria-banco.sql` nem `reconstruir-banco.sql` à mão — são **gerados**
  (`gerar-auditoria.mjs`, `gerar-reconstrucao.mjs`); regenerar após cada migração.

## Perfis de acesso (quem enxerga o quê)

O gestor pede *"acesso para a enfermeira nova"*, a TI escolhe o cargo
**"Enfermeiro(a)"** em **Usuários**, e a pessoa entra configurada — módulos, papel de
sistema e categoria clínica. Padrão MV/Tasy: **o perfil é um template, não a
identidade da pessoa**.

- **15 cargos prontos:** médico · enfermeiro · enfermeiro SCIH · técnico de enfermagem ·
  fisioterapeuta · nutricionista · assistente social · farmacêutico · auxiliar de
  farmácia · recepção · faturamento · almoxarifado · gestão · diretor técnico · TI.
- **Por referência, não por cópia:** corrigir um perfil corrige todos que o usam — a
  tela avisa quantas pessoas serão afetadas antes de salvar.
- **Exceção individual** (`usuarios_permissoes`), com motivo e autor, em vez de criar
  um perfil novo para cada desvio. É o que evita chegar a 40 perfis que ninguém entende.
- **Recortes normativos já embutidos:** recepção, faturamento, almoxarifado, auxiliar de
  farmácia e gestão **não alcançam o prontuário** (COFEN 754/2024, art. 6º); o **Livro
  de Controlados** é módulo à parte, com escrituração no farmacêutico (Portaria 344/98).
- **Travas que nenhum perfil derruba:** `adm_master` nunca perde a tela de Usuários
  (anti-trancamento); `visualizador` nunca escreve.

> ### ⚠️ Isto controla o MENU, não o dado — ainda
> As políticas de `SELECT` continuam abertas a qualquer usuário autenticado. Quem
> souber usar a API alcança o que o menu esconde. **Não apresentar ao hospital como
> "acesso segregado".** A barreira real é apertar o RLS por tabela, e ela exige antes:
> (1) **modo sombra** — observar por ~2 semanas quem acessa o quê, sem bloquear nada, e
> (2) **quebra-vidro** no ar — botão de acesso de emergência com justificativa e
> revisão. Sem o quebra-vidro, travar o acesso faz a equipe compartilhar senha, e aí a
> trilha de auditoria inteira perde valor (COFEN 754/2024, art. 2º, §2º).

**O perfil "Provisório":** a migração colocou nele todo mundo que já existia, para
ninguém perder acesso da noite para o dia (quem era `adm_master` virou **TI**). Ele
mantém o alcance antigo. **Reclassifique a equipe cargo por cargo e só então desative
o Provisório** — enquanto ele existir, o desenho de acesso não está valendo.

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

## Estado atual (2026-07-23)

- **PEP (prontuário eletrônico) — fases 1 a 3 concluídas.**
  - **Fase 1:** modelo de dados do PEP (episódio, anamnese, prescrição de internado
    com aprazamento e checagem, sinais vitais seriados com NEWS, alergia como atributo
    do paciente, condições/problemas). PRs #13.
  - **Fase 2:** categoria profissional, criar prescrição e anamnese, perfis clínicos
    configuráveis. PR #14.
  - **Fase 3:** **reconciliação medicamentosa** (admissão e alta) e **sumário de
    alta** estruturado, com fechamento do episódio. Migração
    `migracao-pep-fase3.sql` (4 tabelas novas). Requisitos legais levantados em
    [`REQUISITOS-PEP.md`](REQUISITOS-PEP.md).
- **Perfis de acesso por cargo** (PR #16) — ver a seção acima. Migração
  `migracao-perfis-acesso.sql` (3 tabelas + 5 colunas em `profiles`), aplicada nos
  dois bancos.
- **Os dois bancos estão idênticos** (conferido em 2026-07-23 via REST: mesmas tabelas,
  mesmas colunas). O de teste é usado por `npm run dev:demo`.
- Documentação: [`GUIA-GIT.md`](GUIA-GIT.md) (trabalho em equipe),
  [`RELATORIO-TESTE.md`](RELATORIO-TESTE.md) + `.pdf` (bugs encontrados no teste de
  carga anterior).
- **Teste de carga executado** (antes do PEP) com 60 pacientes fictícios em ~40
  telas: nenhum crash. As telas do PEP foram testadas no banco demo com o paciente
  fictício T9035.

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

1. **`sbFetch` engolia todos os erros** — corrigido no PR #9, mas continua sendo o
   ponto onde falha de banco pode virar tela vazia. Manter atenção ao adicionar
   telas novas.
2. **Modularizar o `App.jsx`** — cresceu para ~14,4k linhas. A dívida está composta
   e é o que mais trava o trabalho em paralelo. O PEP mostrou o padrão que funciona:
   extrair funções puras para `src/clinico/`, capturar o comportamento antes,
   comparar depois, então escrever testes.
3. **Feito:** testes automatizados (187, cobrindo os alertas de medicação, a
   reconciliação e a alta) e o **banco de teste separado** (`dev:demo`). Já não se
   testa escrita só em produção.
4. **Sumário de alta ↔ RNDS** — a estrutura já é compatível (campos separados, não
   texto corrido). Integração propriamente dita fica para quando a obrigatoriedade
   se confirmar (ver REQUISITOS-PEP.md, seção 3).
5. **Assinatura digital (ICP-Brasil)** — só quando o hospital decidir eliminar o
   papel. Até lá, o sumário sai impresso para assinatura física (COFEN 754/2024).
6. Migração dos registros gravados com data +1 antes da correção de fuso.
7. Vulnerabilidade Vite/esbuild (apenas ambiente de dev) — upgrade controlado, sem
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

1. Como garantir que schema e código não saiam de sincronia entre os hospitais?
   (Hoje: `validar-sql.mjs` + `contrato-banco.test.js` + auditoria gerada; falta
   automatizar a aplicação da migração — ainda é manual no painel do Supabase.)
2. LGPD: existe registro de tratamento de dados, DPA com os hospitais e política para
   o uso da IA (resumo-paciente) com dados clínicos? A resolver **antes** do primeiro
   paciente real.
3. Reconciliação medicamentosa: quem conduz na prática neste hospital — farmacêutico
   clínico, enfermeiro na admissão, ou o médico? O código permite os três; o fluxo
   real é decisão da equipe.
