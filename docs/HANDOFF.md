# 🤝 Handoff — como retomar o trabalho

Documento curto de passagem, para quem volta ao projeto (pessoa ou IA) depois de
um tempo, ou começa num chat novo.

> **O raio-x completo está em [CONTEXTO.md](CONTEXTO.md).** Leia de lá em vez de
> reconstruir de cabeça. Este arquivo é só o essencial para começar sem quebrar nada.

**Atualizado em:** 2026-09-01 · `main` em `967985e` · zero PRs abertos · **nada pendente de SQL**.

## 👥 Quem está com o quê (combinado em 22/08/2026)

| Território | Dono |
|---|---|
| **Atendimento** — recepção, agenda, consultas, tabelas | **Adauam** |
| **Faturamento** — conta do episódio, SUS, glosa, preço | **Laura** |

---

## 🔴 O QUE MUDOU EM 01/09/2026 — leia antes de planejar qualquer coisa

Um dia de trabalho pesado (PRs #166–#199) mudou **onde as coisas moram** e **o
que o banco tem**. Se você planejar em cima do estado anterior, vai propor coisa
que já existe ou recriar tabela que já está no ar com dado dentro.

### 1. TRÊS tabelas novas, nos DOIS bancos

Glosa **recebida**, prazo de recurso e recuperação. Criada, com RLS, e conferida
no demo **e** no principal (PR #197). **Não modele isso de novo.**

| tabela | o que guarda | migração |
|---|---|---|
| `at_glosas` | glosa recebida, prazo de recurso, recuperação | `migracao-faturamento-glosas.sql` + `migracao-glosas-rls.sql` |
| `at_repasses` | o dinheiro que entrou (negativo = estorno) | `migracao-faturamento-repasses.sql` |
| `at_precos` | preço por convênio, com vigência | `migracao-faturamento-precos.sql` |

⚠️ **`at_precos` traz a extensão `btree_gist`** e um `EXCLUDE USING gist` que
recusa dois preços ativos do mesmo convênio+código com períodos que se
cruzam. É a primeira migração do projeto que instala extensão.

Estrutura: `conta_id` (FK obrigatória) · `item_id` (opcional — a operadora glosa
ora um item, ora a conta inteira) · `valor_glosado` · `recebida_em` (NOT NULL, é
o relógio) · `prazo_recurso_em` (nulo por decisão, ver abaixo) · `situacao` ·
`valor_recuperado` (nulo ≠ zero).

**Os 5 CHECK recusam de verdade** — seis ataques feitos direto na API, seis
recusas (valor zero e valor negativo caem no mesmo CHECK): recuperado maior que o
glosado · valor zero · valor negativo · prazo antes do recebimento · recurso
enviado antes de a glosa chegar · situação fora da lista.

Estão no banco e não só na tela porque glosa chega por **import de planilha da
operadora**, que não passa por tela nenhuma.

### 2. O `App.jsx` não é mais o lugar de nada

**18.392 → 1.391 linhas** (PRs #166–#193). Hoje são **139 arquivos** em 15 pastas por domínio.
Qualquer plano que diga "extrair X do App.jsx" está desatualizado. O que sobrou
lá é casco: rede, sessão e moldura.

### 3. Contrato novo de carga — quebra o build se ignorado

`sb` devolve `null` quando a leitura falha. Antes, ~105 cargas faziam
`Array.isArray(rows) ? rows : []` e transformavam **falha de leitura em "não
existe nenhum"** — a tela dizia "nenhum lote vencendo" onde o certo era "não foi
possível ler" (PR #194).

```js
import { listaLida } from "../util/leitura.js";
const rows = await sb("tabela?select=*");
return listaLida(rows);          // NÃO: Array.isArray(rows) ? rows : []
```

⚠️ **`src/cargas.test.js` tem duas catracas que ficam VERMELHAS** se uma carga
nova nascer do jeito antigo, ou se alguém criar um atalho local
(`const arr = x => Array.isArray(x) ? x : []`) em arquivo que lê da rede. As duas
foram verificadas por mutação. Não são estilo — são a família de defeito que mais
custou a este sistema.

Para distinguir na tela: `naoDeuParaLer(lista)` e o componente `<AvisoLeitura>`
de `src/ui/base.jsx`.

### 4. Faturamento: a Fase 4 ESTÁ COMPLETA — 9 de 9 abas

`EM_CONSTRUCAO` do módulo está **vazio**. As nove: Visão executiva ·
Pendentes · **Glosas** · **Receitas** · **Análises** · **Previsões** ·
**Convênios & contratos** · Tabela SIGTAP · **Assistente AI**.

O ciclo do dinheiro fecha:
**faturado → glosado → recebido → a diferença que ninguém explicou.**

Regras e arquivos de cada uma:

| aba | regras em | tela |
|---|---|---|
| Glosas | `glosas.js` | `GlosasView.jsx` |
| Análises | `analises.js` | `AnalisesView.jsx` |
| Receitas | `receitas.js` | `ReceitasView.jsx` |
| Convênios | `precos.js` | `ConveniosView.jsx` |
| Previsões | `previsoes.js` | `PrevisoesView.jsx` |
| Assistente | `assistente.js` | `AssistenteView.jsx` |

Todas as regras têm teste, e as de dinheiro foram verificadas por mutação.

**Duas glosas convivem, e não se misturam:** a *preventiva* (`avaliarGlosa` em
`sigtap.js` — olha a conta ANTES de sair, e aparece no simulador da aba SIGTAP) e
a *recebida* (`glosas.js` — o dinheiro que já foi recusado). Antes de mexer numa,
confirme que não é a outra.

O branch `feat/glosa-valor` foi rebaseado e mergeado no #195. **O branch original
continua intacto no remoto** — o rebase virou um branch novo, sem force-push.

### 5. Sete decisões deliberadas — não "conserte" sem ler o porquê

Todas têm teste travando e comentário no código. Se o plano for mudá-las, mude
com intenção, não por parecerem incompletas.

1. **O prazo do recurso NÃO é calculado.** Muda por operadora, contrato e
   portaria. Data inventada erra dos dois lados: marca como vencida uma glosa que
   dava tempo, ou como aberta uma já perdida. O campo nasce vazio, e glosa sem
   prazo vai para o **topo** da fila com selo próprio — não para o rodapé.
2. **A taxa de recuperação divide pelo ENCERRADO, não pelo glosado.** Com o total
   glosado, o número cairia toda vez que chegasse glosa nova — pioraria
   justamente quando o setor trabalha mais.
3. **Indicador sem base mostra "—" e a frase do porquê, nunca 0%.** "Índice de
   glosa 0%" é a melhor notícia possível, e três coisas opostas produzem zero:
   não houve glosa (única que devolve 0) · a leitura falhou · não há faturado.
4. **`valor_recuperado` nulo ≠ zero.** Nulo é "o recurso não acabou"; zero é
   "recorremos e não voltou nada". Colapsar os dois estraga a taxa de recuperação.
5. **Repasse pode ser NEGATIVO** — é estorno, e o SUS faz desconto retroativo.
   O único valor recusado é zero. E "nunca chegou" ≠ "chegou e voltou": a
   decisão é pela EXISTÊNCIA de linha, não pelo saldo.
6. **Preço: três respostas, não duas.** `VENCIDO` (houve contrato → pedir
   aditivo) não é `AUSENTE` (nunca houve → cadastrar). Mandam a pessoa a
   lugares diferentes.
7. **Previsão não extrapola produção, e não publica prazo com menos de 5
   repasses observados** — o calendário sai VAZIO em vez de sair inventado.
   E usa MEDIANA, não média: prazo de pagamento tem cauda longa.

### 6. Três armadilhas de SQL que custaram tempo hoje

- **Em `LIKE`, `_` é curinga de UM caractere.** `conname like 'at_glosa_%'` casa
  também com `at_glosas_pkey` e as FKs — uma conferência dizia "esperado 5" e
  contava 8. Filtre por `contype = 'c'`.
- **`set valentrax.quem` vale até o fim da SESSÃO, não do arquivo.** O
  `reconstruir-banco.sql` emenda 87 scripts numa sessão só; sem
  `reset valentrax.quem` no fim, todos os de baixo se registram como aplicados
  por quem abriu. Só 3 de 86 migrações usam a variável.
- **O editor do Supabase trunca calado acima de ~26 KB.** O
  `migracao-rls-leitura.sql` tem 41 KB. Para tabela nova, use um recorte por
  tabela — `migracao-glosas-rls.sql` serve de molde.

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
1.391 linhas**, e hoje são **139 arquivos** em 15 pastas por domínio. O que sobrou lá é casco — a
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
monólito de 18.392 linhas e virou **139 arquivos em 15 pastas por domínio** (#166–#193).
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
   1.391 linhas. ⚠️ Isso **destravou o code-splitting por rota**, que estava parado
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

5. **O CI NÃO barra merge — e há uma trava parcial deste lado.**

   `gh pr merge` não consulta o GitHub Actions e a Vercel publica independente.
   Em 01/09 a `main` ficou vermelha por **três merges seguidos** sem que nada
   avisasse (e já tinha acontecido em 27/08).

   **Use `npm run mergear <n>`** em vez de `gh pr merge`. Ele confere sete
   coisas antes e o CI da base depois. As duas que mais importam:

   - 🔴 **o verde é DO COMMIT que está no topo do PR.** Um push depois do CI
     deixa o ✓ apontando para o commit anterior, e a tela do PR continua
     tranquilizadora.
   - 🔴 **`mergeStateStatus = UNSTABLE` recusa.** Inclui o caso do check que
     nem foi CRIADO ainda — contar só o que existe não vê o que falta.

   `npm run mergear <n> --seco` confere sem mergear.

   ⚠️ **Isto é barreira de HÁBITO, não de servidor.** `gh pr merge` continua
   funcionando por fora.

   ## 🔒 A trava de verdade: branch protection (PRECISA DE ADMIN)

   Quem roda o Claude aqui tem `push`, **não `admin`** — conferido em
   01/09/2026 (`{"admin": false, "push": true}`). Só quem administra o
   `nirhnsn08-blip` consegue ligar. O caminho:

   **Settings → Branches → Add branch ruleset** (ou *Add rule* no formato
   antigo), com `main` como alvo, e marque:

   | opção | por quê |
   |---|---|
   | **Require status checks to pass** → adicione **`build`** | é o que faltou nas 4 vezes |
   | ↳ **Require branches to be up to date before merging** | impede o verde de uma base velha — a mesma coisa que a verificação 4 do `mergear` |
   | **Block force pushes** | `push --force` na `main` apaga trabalho da outra pessoa |
   | **Restrict deletions** | ninguém apaga a `main` por engano |

   ⚠️ **NÃO marque "Require a pull request before merging" com aprovação
   obrigatória** enquanto forem duas pessoas: cada um ficaria esperando o
   outro revisar para publicar qualquer correção. O PR já é o hábito da casa;
   o que falta é o CI barrar.

   ⚠️ **Deixe "Do not allow bypassing" DESMARCADO** no começo. Se o `build`
   quebrar por motivo de infraestrutura (runner fora do ar), alguém precisa
   conseguir publicar uma correção urgente no hospital.


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

<!-- prova de que o branch protection barra: este arquivo volta ao normal antes do merge -->
