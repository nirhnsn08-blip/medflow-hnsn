# 🤝 Handoff — como retomar o trabalho

Documento curto de passagem, para quem volta ao projeto (pessoa ou IA) depois de
um tempo, ou começa num chat novo.

> **O raio-x completo está em [CONTEXTO.md](CONTEXTO.md).** Leia de lá em vez de
> reconstruir de cabeça. Este arquivo é só o essencial para começar sem quebrar nada.

**Atualizado em:** 2026-09-01 · `main` em `107bbf9` · zero PRs abertos · **nada pendente de SQL**.

## 👥 Quem está com o quê (combinado em 22/08/2026)

| Território | Dono |
|---|---|
| **Atendimento** — recepção, agenda, consultas, tabelas | **Adauam** |
| **Faturamento** — conta do episódio, SUS, glosa, preço | **Laura** |

---

## 🔴 LAURA, LEIA ISTO ANTES DE COMEÇAR (01/09/2026)

**Eu (Adauam) mexi no Faturamento, que é seu território.** Não estava combinado;
aconteceu numa sequência de trabalho e prefiro te contar aqui do que você
descobrir num conflito. **Se algo aí atrapalhou o seu plano, desfaça sem
cerimônia** — `git revert -m 1 <hash do merge>` e me avise.

### Existe tabela nova nos DOIS bancos

**`at_glosas`** — glosa recebida, prazo de recurso e recuperação. Já rodada e
conferida no demo E no principal (PR #197). **Não modele de novo por outro
caminho.** Migrações: `supabase/migracao-faturamento-glosas.sql` e
`supabase/migracao-glosas-rls.sql`.

### Seu `feat/glosa-valor` foi rebaseado e mergeado (#195)

Estava parado desde 19/08, 219 commits atrás. **O rebase saiu limpo** e eu
**não** dei force-push no seu branch — ele continua intacto no remoto, ao lado
do `glosa-valor-rebase` que virou o PR. A sua regra de valor cobrado ×
referência SIGTAP está no ar, funcionando no simulador da aba Tabela SIGTAP.

### O Faturamento hoje: 5 de 9 abas

| aba | estado |
|---|---|
| Visão executiva · Pendentes · Tabela SIGTAP | já eram suas, seguem iguais |
| **Glosas** | NOVA (#197) — fila por urgência, recurso, recuperação |
| **Análises** | NOVA (#198) — produção, ticket médio, índice de glosa, rejeição |
| Receitas · Convênios & contratos · Previsões · Assistente AI | ainda `EM CONSTRUÇÃO` |

**Duas glosas convivem no sistema, e não se misturam:** a *preventiva* (sua
`avaliarGlosa` em `sigtap.js`, olha a conta antes de sair) e a *recebida*
(`glosas.js`, o dinheiro que já foi recusado). Se for mexer numa, confira se
não é a outra.

### Três decisões que eu tomei e você pode reverter

1. **O sistema NÃO calcula o prazo do recurso.** Ele muda por operadora,
   contrato e portaria; uma data inventada erraria dos dois lados. O campo
   nasce vazio e a glosa sem prazo vai para o **topo** da fila com selo
   próprio. Se o hospital tiver um prazo fixo por contrato, dá para
   preencher por padrão — mas aí é decisão sua, não do código.
2. **A taxa de recuperação divide pelo ENCERRADO, não pelo glosado.** Com o
   total glosado, o número cairia toda vez que chegasse glosa nova.
3. **Indicador sem base mostra "—" e a frase do porquê, nunca 0%.** "Índice
   de glosa 0%" é a melhor notícia possível, e três coisas opostas produzem
   zero: não houve glosa · a leitura falhou · não há faturado.

### O que mudou fora do Faturamento, e te afeta

**105 cargas de rede pararam de transformar falha em lista vazia** (PR #194).
Antes, `sb` devolvia `null` na queda e a carga virava `[]` — a tela dizia
"nenhum lote vencendo" quando na verdade não deu para ler. Agora usam
`listaLida()` de `src/util/leitura.js`, e há **duas catracas em
`src/cargas.test.js`** que quebram se uma carga nova nascer do jeito antigo.
Ao escrever `dados.js` novo: `return listaLida(rows)`, não `? rows : []`.

---

**A fila de cada um, com âncora de linha, está em
[DIAGNOSTICO-ATENDIMENTO.md](DIAGNOSTICO-ATENDIMENTO.md)** — levantamento de
21-22/08 com quatro revisões do código e o percurso das cinco abas no demo. Leia de
lá antes de escolher o próximo trabalho; ele também lista **o que está bem-feito e
não se mexe**, e um **alarme falso** que já custou tempo (RLS de `pacientes`).

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
| Faturamento (conta, SIGTAP, glosa, análises) | `src/atendimento/` — ver a tabela do dia 01/09 acima |
| Qualquer outro módulo | a pasta do domínio em `src/` — **o `App.jsx` não é mais o lugar** |

**A extração do `App.jsx` ACABOU em 01/09/2026** (PRs #166–#193): de **18.392 para
1.392 linhas**, 135 arquivos em 15 pastas por domínio. O que sobrou lá é casco — a
rede, a sessão e a moldura — e **não deve sair**.

**O padrão de MÓDULO NOVO**, que se firmou ali e vale repetir:
`catalogo.js` (tabelas do domínio) → `dados.js` (com `sb` como PRIMEIRO parâmetro)
→ regras puras → `Tela.jsx` (recebe `sb` por prop). A camada compartilhada sai
ANTES da tela.

**Duas pessoas em módulos diferentes não colidem mais** — era esta a dívida que
travava o trabalho em paralelo, e ela caiu.

---

## Arquivos que você NÃO edita à mão

São gerados. Editar à mão cria divergência silenciosa:

| Arquivo | Regenerar com |
|---|---|
| `supabase/auditoria-banco.sql` | `node supabase/gerar-auditoria.mjs` |
| `supabase/reconstruir-banco.sql` | `node supabase/gerar-reconstrucao.mjs` |
| `supabase/migracao-rls-leitura.sql` | `node supabase/gerar-rls.mjs` |
| `supabase/conferencia-perfis.sql` | `node supabase/gerar-conferencia-perfis.mjs` |

**Rode os quatro depois de criar qualquer migração nova.** A auditoria mantida à mão já
ficou cega ao módulo mais recente duas vezes — e auditoria cega é pior que nenhuma,
porque dá falsa confiança. Ordem prática ao criar uma migração: classifique a tabela
nova em `src/acesso/mapa-tabelas.js` (senão o teste quebra), depois regenere os quatro.

---

## Segurança de acesso — o que mudou, e o que te pega

A leitura do banco **deixou de ser "menu que esconde" e virou barreira real**. Cada
tabela tem uma política de `SELECT` amarrada a um módulo (via `public.pode_ver(...)`);
tirar um módulo do perfil tira também o acesso ao dado pela API. O mapa de qual módulo
lê qual tabela vive em `src/acesso/mapa-tabelas.js`.

**Três coisas que precisam entrar no seu reflexo ao mexer no banco:**

1. **Tabela nova nasce COM RLS.** Várias tabelas (NSP, enfermagem, protocolos) subiram
   com `create table` e nenhuma política — RLS desligado é escrita e leitura abertas a
   qualquer login. Tivemos que fechar depois, e fechar leitura sem cuidar da escrita
   **trancou a gravação** de tabelas inteiras em produção até corrigir. Ao criar tabela:
   classifique-a em `mapa-tabelas.js` e deixe `gerar-rls.mjs` cuidar da leitura (ele
   preserva a escrita aberta onde não havia política).
2. **`mapa-tabelas.test.js` quebra de propósito** se a tabela nova não for classificada.
   Não é chateação — é o que impede o próximo hospital de nascer com dado exposto.
3. **Grant novo no seed não chega a banco já migrado.** `on conflict do nothing` não
   troca linha existente. Para mudar um grant que já está no banco, use um `UPDATE`
   explícito (ver `migracao-perfis-auditoria-diretor.sql` como molde) e rode
   `conferencia-perfis.sql` para conferir código × banco.

**Duas coisas que a barreira ainda NÃO faz** (não prometer ao hospital como resolvidas):
não filtra por **linha** (quem abre o Paciente 360 vê qualquer paciente, não só os do
seu setor — depende de lotação confiável antes de apertar), e a **escrita** ainda é
decidida pelo papel de sistema, não pelo módulo (`pode_editar` já existe no banco, sem uso).

**Liberar acesso fora do padrão do cargo:** na tela de Usuários, botão **Exceções** — a
TI (adm_master) libera ou suspende um módulo para UMA pessoa, com motivo e autor, sem
inventar cargo novo.

---

## Testes — o que eles protegem

`npm test` roda **2.486 testes**. Alguns merecem atenção especial:

- **`contrato-banco.test.js`** — confere que toda coluna gravada pelo PEP existe no
  banco. Existe porque duas telas gravavam em colunas inexistentes: o PostgREST
  recusava o INSERT **em silêncio**, o profissional clicava em salvar e nada era
  gravado. Se você criar tela que grava, acrescente o caso aqui.
- **`seed-perfis.test.js`** — confere que os perfis de acesso do código e do SQL não
  divergiram, grant por grant.
- **`mapa-tabelas.test.js`** — confere que TODA tabela do banco tem classificação de
  leitura (RLS) e que nenhuma tabela com dado de paciente ficou aberta. É ele que
  **quebra de propósito** quando você cria tabela nova sem classificá-la em
  `mapa-tabelas.js` — ver "Segurança de acesso" abaixo.
- **`papeis.test.js`** — as regras de competência profissional (COFEN/CFM). Se
  afrouxarem por descuido, ninguém percebe até virar problema com o conselho.

---

## Estado atual, em uma frase

O **PEP está completo** (admissão → prescrição com aprazamento e checagem → sinais
vitais com NEWS → evolução → reconciliação medicamentosa → alta com sumário), os
**perfis de acesso por cargo** estão no ar **e a leitura do banco já obedece a eles**
(RLS por módulo — ver "Segurança de acesso"), e a **jornada do paciente no PS está
completa (blocos 1–5)**: chegada → triagem → atendimento → medicação/checagem →
exames (BI laboratorial × imagem) → desfecho (com aviso de exame pendente) →
regulação de leito (NIR). A **triagem** agora usa **comorbidades marcáveis** (que
alimentam os alertas de ajuste de dose sem exigir o ClCr) e tem **tipo Adulto /
Obstétrica / Pediátrica**, com captura específica para gestante e criança. No
**Estoque**, os pedidos de compra agora passam por
**aprovação da matriz** (aguardando → aprovado/negado) antes de ir ao fornecedor.
A **enfermagem** ganhou (Tier 1, Fase 1a) as **escalas de risco à beira-leito**
(Braden, Morse, dor, flebite, Fugulin, Glasgow, RASS) e a **lesão por pressão com
marcador POA** no prontuário do internado, com **cortes editáveis pelo ADM Master**
e um **mapa de risco por leito** no Giro de Leitos. E ganhou (Tier 1, Fase 1b) o
**Processo de Enfermagem (SAE)** no prontuário do internado — **aba SAE**: histórico →
diagnóstico **NANDA-I** (sugerido a partir das escalas/LPP/sinais) → prescrição de
enfermagem **(NIC)** aprazada → **checagem do cuidado à beira-leito** pelo técnico →
evolução; catálogo curado "em validação", com **editor do ADM Master** e **fila de
checagem por leito** no Giro de Leitos. E o **cadastro do paciente** passou a ter a
**identificação completa (CFM 1.638)** — nome, filiação, documentos (CPF/CNS), endereço e
data de nascimento (que conserta a idade da triagem pediátrica). A **recepção** ganhou a
**porta de entrada** (módulo Atendimento): identifica o paciente, **emite o prontuário** por
sequência e liga o atendimento ao cadastro por chave estrangeira (fim do número digitado à
mão e do atendimento órfão). E abriu o **Núcleo de Segurança do Paciente** (Tier 1, Fase 2a):
módulo com barra lateral própria (RDC 36/2013), **notificação de incidentes em 30s de
qualquer tela** (anônima), com classe/tipo/grau de dano (OMS), matriz de risco, dashboard,
**análise de causa raiz** (5 porquês / Ishikawa / fatores de Londres) e **plano de ação 5W2H**
com cobrança de fechamento. O **Atendimento** ganhou a **ficha** (fonte pagadora +
classificação), a tela **Tabelas** (catálogos sem SQL) e a **agenda** do ambulatório. O NSP
fechou a **Fase 2c**: **indicadores automáticos** de segurança (LPP adquirida, quedas, erro de
medicação — sem digitação) e as **6 Metas Internacionais** com **farol** e alvos editáveis pelo
ADM Master (auditoria de higiene/comunicação/cirurgia). E o **Atendimento** ganhou o **ciclo de
vida** (encerrar/corrigir/cancelar) e a aba **Consultas** (pesquisa de atendimentos).
Por fim, o **NSP fechou a Fase 2d e está completo (2a–2d)**: **relatório mensal + ficha
NOTIVISA** (compulsórias prontas para transmitir), **protocolos gerenciados** (os 6 básicos
do PNSP, revisão vencida cobrada), **capacitações** (cobertura por meta), **mural de
comunicação** (alerta / lição aprendida / informativo) e um **Assistente AI local e gratuito**
(chat sobre os dados do NSP, nada sai do navegador) — com o módulo **blindado por error
boundary** (um erro nunca derruba o app). O **Atendimento** também ganhou a **fundação do
faturamento** (conta do episódio por competência, em centavos; SUS não cobra do paciente).
E o **Tier 1 fechou a Fase 3 — Protocolos Clínicos Gerenciados**: módulo próprio (por setor)
com os 4 protocolos tempo-dependentes — **Sepse** (porta→ATB, gatilho NEWS), **Dor torácica/IAM**
(porta→ECG), **AVC** (porta→TC + janela terapêutica) e **TEV** (profilaxia por escore de Padua) —
cada um com gatilho, bundle-relógio e indicadores porta→ação. E entrou a **Fase 3 de segurança:
RLS de leitura por módulo** (`pode_ver` + `mapa-tabelas.js`), que fecha a exposição de SELECT
`using(true)` das tabelas sensíveis. E a **Fase 4 (Faturamento SUS)** ganhou a **conta que se
monta do prontuário** (módulo Faturamento → aba Pendentes): lista as internações → monta do
episódio (procedimento, medicação administrada, permanência real do leito) → antecipa glosa
(permanência e **CID × procedimento**) → lança na conta do Atendimento. Os valores em R$ e os CIDs
compatíveis vêm das **AIHs reais do SUS**, lidas de um `.dbc` do DATASUS por uma ferramenta
versionada (`supabase/importar-aih.mjs`). A metade **ambulatorial** tem a ferramenta irmã,
`supabase/importar-bpa.mjs`, que lê a Produção Ambulatorial do SIA-SUS (`PA…dbc`) — passo a passo em `docs/SIGTAP-BPA-COMO-APLICAR.md`, e **falta
rodar**: enquanto não roda, `sigtap_procedimentos` só tem procedimentos de AIH, e a alta de PS
e a consulta não têm código oficial para escolher (a tela avisa isso em vez de ficar muda).
Motores puros em `src/atendimento/montar-conta.js` +
`sigtap.js`. E a **Visão Executiva** do Faturamento passou a **ler a produção de verdade** —
funil das internações, **faturamento por via** (AIH/BPA/APAC/TISS/direta) e **R$ de referência
SIGTAP** —, sem número ilustrativo (`src/atendimento/resumo-faturamento.js`).

E em **01/09/2026** fechou-se a **dívida estrutural**: o `App.jsx` deixou de ser um
monólito de 18.392 linhas e virou **135 arquivos em 15 pastas por domínio** (#166–#193).
No caminho apareceu — e foi corrigida — a família de defeito que mais custou a este
sistema: **ausência de dado renderizada como boa notícia**. 105 cargas de rede
transformavam falha de leitura em lista vazia, e a tela dizia "nenhum lote vencendo"
onde o certo era "não foi possível ler" (#194). E a **Fase 4 do Faturamento** começou a
sair do papel: **Glosas** (#197, com tabela `at_glosas` nova nos dois bancos) e
**Análises** (#198).

**Ainda não há paciente real no sistema.**

### O que está pendente

1. **Reclassificar a equipe** nos cargos certos — hoje quase todos estão no perfil
   "Provisório", que mantém o acesso antigo. Só depois disso desativar o Provisório.
2. **RLS de leitura por módulo NO AR (PR #60):** o SELECT de `pacientes` (e das demais tabelas
   sensíveis) deixou de ser `using(true)` — a leitura passou a exigir o módulo do perfil
   (`public.pode_ver` + `src/acesso/mapa-tabelas.js`). **Ainda pendente:** filtro por **LINHA**
   (só os pacientes do meu setor — depende de lotação confiável em `profiles.setor`) e **RLS de
   ESCRITA** (insert/update/delete seguem pelo `role`, não pelo módulo).
3. ~~**Modularizar o `App.jsx`**~~ **FEITO em 01/09/2026** (PRs #166–#193): 18.392 →
   1.392 linhas. ⚠️ Isso **destravou o code-splitting por rota**, que estava parado
   justamente por depender de mexer no monólito — o bundle segue num pedaço só, com
   aviso de +700 kB em todo build. É a dívida técnica mais óbvia que sobrou.
4. **A fila do Atendimento e a do Faturamento** — ver
   [DIAGNOSTICO-ATENDIMENTO.md](DIAGNOSTICO-ATENDIMENTO.md). Os dois primeiros de
   cada uma, para quem só quer o essencial:
   - **Atendimento:** a presença pela Agenda abre atendimento **sem convênio,
     carteira nem senha** (`conferirFicha` nunca é chamada em `Agenda.jsx`) → glosa
     integral; e `tipo_atendimento_cod` é opcional, o que zera a coluna de 1ª
     consulta na prestação de contas sem erro nenhum em tela.
   - **Faturamento:** a conta se **monta num módulo e fecha em outro**; e não existe
     **preço de convênio** em lugar nenhum (nem TUSS/CBHPM), então a tela sugere o
     valor SUS independente da via. *(O preço por operadora é justamente o que falta
     na aba Convênios & contratos — o CRUD de convênio/plano já existe na aba Tabelas
     do Atendimento; o que não existe é preço nem regra.)*

5. **O CI NÃO barra merge.** `gh pr merge` não consulta o GitHub Actions e a Vercel
   publica independente. Em 01/09 a `main` ficou vermelha por **três merges seguidos**
   sem que nada avisasse. **Rode `gh pr checks <n>` antes de todo merge** — e repare
   que o `vitest` imprime `Tests N passed` e `Errors N` em linhas separadas: dá para
   ler como sucesso e sair como exit 1. Barrar de verdade exige *branch protection*
   ligado no GitHub, que ainda não está.

### O que foi corrigido em 21-22/08/2026 (PRs #107, #108, #109 — em produção)

Todos achados **relendo o código**, nenhum reportado como bug. O que os une é o modo
de falhar: a regra existe, roda, e não faz nada.

- **#107** — 4 das 5 conferências de pré-glosa do fechamento estavam mudas (colunas
  que não existem: `cid_principal`, `nascimento`); duas regras de via divergentes
  (conta montada como BPA, fechada como AIH); carteirinha conferida contra hoje;
  ficha vazando de um paciente para outro; e dava para **agendar paciente falecido**.
- **#108** — a busca por nome não achava quem está cadastrado (`ilike` sem unaccent,
  substring contígua, índice inútil). Coluna gerada `nome_busca` + índice GIN. E a
  mensagem do CPF duplicado parou de mandar a recepcionista **apagar o CPF**.
- **#109** — a vaga da agenda era da **especialidade**, o que tornava impossível dois
  médicos da mesma especialidade no mesmo horário. Passou a ser do **profissional**.

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
