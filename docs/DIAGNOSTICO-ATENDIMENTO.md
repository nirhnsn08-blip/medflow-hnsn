# 🔎 Diagnóstico do módulo Atendimento — 21-22/08/2026

Levantamento feito por quatro revisões especializadas do código (recepção,
agenda/ambulatório, faturamento e arquitetura de informação) mais um percurso
completo das cinco abas no banco demo.

> **Como ler este documento.** Cada achado tem **âncora de linha**. Antes de agir
> em qualquer um, **confira o arquivo** — parte deste diagnóstico já foi corrigida
> (marcada ✅), e código anda. Um dos achados originais era **falso** e está
> registrado no fim, na seção "Alarme falso", para ninguém repetir a conclusão.

**Divisão combinada em 22/08/2026:**

| Território | Dono |
|---|---|
| **Atendimento** — recepção, agenda, consultas, tabelas | **Adauam** |
| **Faturamento** — conta do episódio, SUS, glosa, preço | **Laura** |

---

## O veredito, em uma frase

**O módulo não está mal construído — está mal repartido.** A qualidade do código é
alta e consistente (dinheiro em centavos com desempate de ponto ambíguo, `null` ≠ 0
em toda a cadeia, "não existe apagar, só desligar", pulseira com dois
identificadores). O que confunde é **quem trabalha onde**.

---

## ✅ Já corrigido (PRs #107, #108, #109 — em produção)

Todos foram encontrados **relendo o código**, não por bug reportado. O que os une
é o modo de falhar: a regra existe, roda, e não faz nada.

| # | O que era |
|---|---|
| #107 | **4 das 5 conferências de pré-glosa do fechamento estavam mudas** — `cid_principal` e `nascimento` são colunas que não existem (são `cid` e `data_nascimento`), `medico` nunca era passado (desarmava o CBO) e `permanenciaDias` estava cravado em `null`. Só sexo funcionava. |
| #107 | **Duas regras de via divergentes** — a conta era montada como BPA e fechada como AIH. Fonte única agora é `internouPeloSus()` em `faturamento.js`. |
| #107 | **Carteirinha conferida contra hoje**, não contra a data do atendimento — travava toda conta de competência anterior. |
| #107 | **SIGTAP lido sem filtro de competência** — funcionava por acidente, com uma competência só importada. |
| #107 | **`escolher()` não zerava a ficha** — trocar de paciente levava convênio, carteira e CID do anterior. |
| #107 | **Prontuário buscado com `eq`** (case-sensitive): "t9008" não achava "T9008". |
| #107 | **`ocupaVaga` tratava status desconhecido como vaga livre** — o inverso do `ciclo.js`. |
| #107 | **Dava para agendar paciente com óbito registrado** — a Recepção já bloqueava, a Agenda não. |
| #108 | **A busca por nome não achava quem está cadastrado** — `ilike` sem unaccent, substring contígua, índice btree inútil. Coluna gerada `nome_busca` + índice GIN de trigrama. |
| #108 | **A mensagem do 409 mandava a recepcionista apagar o CPF** — e o duplicado entrava sem documento, invisível ao índice único. |
| #109 | **A vaga era da especialidade, não do profissional** — dois médicos da mesma especialidade no mesmo horário era impossível, e o card de vagas de um mostrava a cota consumida pelo outro. |

---

## 🔴 Os três buracos estruturais

Estes são a resposta à pergunta "por que o Atendimento parece bagunçado".

### 1. "Recepção" é a recepção do PS, não do hospital · *Adauam*

`recepcao.js` (`TIPOS_ATENDIMENTO`) marca `ambulatorial` e `eletivo` como
`disponivel: false`. Na tela, o seletor "Tipo" tem **uma opção só**, Emergência.
Mas a mesma tela pergunta "Origem: Ambulatório" e "Tipo: Primeira consulta /
Retorno".

**A capacidade existe:** `abrirAtendimento` (`dados.js`) aceita `tipo`, e
`confirmarPresenca` abre atendimento `tipo: "ambulatorial"` a partir da Agenda.
Resultado: **paciente ambulatorial só entra pela "fila de chegada" da Agenda**, que
exige grade publicada no dia — e nada na Recepção diz isso.

### 2. O motor de montar conta está no módulo errado · *Laura*

`montarContaDoProntuario` só é chamado em `FaturamentoSus.jsx` (módulo lateral); a
aba Atendimento → Faturamento importa apenas `glosaDaContaSalva`. **O faturista
monta a conta num módulo e fecha em outro** — e a própria tela diz isso ao usuário.

**Recomendação:** a conta abre *a partir* do episódio, mas conferência e fechamento
ficam ao lado da worklist, no módulo Faturamento.

### 3. Profundidade desigual · *Adauam*

Cinco abas escondendo ~20 telas, cada uma com um padrão de navegação diferente:
Recepção é formulário único longo; Agenda tem 4 sub-abas; Consultas tem 3 modos;
Tabelas tem um seletor de 10 catálogos.

---

## 📋 Fila — ATENDIMENTO (Adauam)

Ordem sugerida, do que sangra primeiro:

1. **A presença pela Agenda abre atendimento sem convênio, carteira nem senha.**
   `conferirFicha` (que já sabe cobrar carteira, validade e autorização prévia)
   **nunca é chamada em `Agenda.jsx`**. As colunas existem e ficam nulas. O erro só
   aparece na competência, com o paciente em casa há 40 dias. **Glosa integral.**
2. **`tipo_atendimento_cod` é opcional** — e é ele que separa primeira consulta de
   retorno na pactuação. Recepcionista com fila pula o campo, e o relatório do mês
   sai com 1ª consulta = 0, sem erro em tela nenhuma.
3. **Bloqueio de agenda não olha quem já está marcado.** Congresso do ortopedista
   na quinta: os pacientes seguem "agendados", ninguém liga, e eles vêm de outra
   cidade encontrar a porta fechada. Falta também bloqueio de turno e por
   profissional (a coluna existe e o formulário não a oferece).
4. **Não existe fila viva do ambulatório.** Confirmada a presença, nasce um
   atendimento `aguardando_atendimento` que é excluído do painel do PS e não
   aparece em nenhuma outra tela. Sem tempo de espera, sem chamada.
5. **O ciclo do não-comparecimento não fecha.** Não existe estado `confirmado` (a
   confirmação ativa da véspera é a alavanca real do absenteísmo), `registrarFalta`
   não recebe motivo, e não há remarcação com vínculo. Quem não veio e não foi
   clicado fica `agendado` para sempre e **subnotifica o absenteísmo** que a própria
   tela exibe como KPI.
6. **Município sem código IBGE.** Texto livre onde a AIH, o BPA-I e o CADSUS
   exigem código. Não gera glosa — gera **rejeição do arquivo inteiro**, descoberta
   no fim do mês, com correção cadastro por cadastro.
   *A parte da etnia indígena saiu daqui:* o campo existe, aparece no instante em
   que a raça/cor indígena é escolhida, e vira pendência visível de faturamento.
   Guarda o **nome**, não o código de 4 dígitos da tabela oficial — código inventado
   volta como glosa com o nome de um povo trocado pelo de outro. O código entra
   junto com a exportação do BPA, com a tabela ao lado.
7. **Não existe unificação de prontuário.** O #108 atacou a *causa* (a busca que não
   achava), mas duplicata que já exista é permanente. Porte grande: coluna
   `unificado_para`, UPDATE em cascata dos registros clínicos, restrito a
   adm_master, com auditoria.
8. **Não existe caminho de recém-nascido** — e o hospital faz parto. Falta
   `prontuario_mae`, `dnv`, e o cadastro "RN DE \<mãe\>" com herança do cadastro dela.
9. **CID em texto livre**, sem tabela CID-10. Entra `i10`, `I 10`, `hipertensao`.
10. **Impressos:** só existem pulseira e ficha. Falta **comprovante de agendamento**
    (a alavanca mais barata contra absenteísmo) e **declaração de comparecimento**
    (pedida todo dia no balcão).
11. **Ergonomia de balcão:** sem `autoFocus` na busca, sem atalho de teclado. São 80
    atendimentos/dia.
12. **A Recepção unificada** (ver buraco estrutural nº 1) — o desenho está na seção
    seguinte.

## 📋 Fila — FATURAMENTO (Laura)

1. **Consertar a conta que se monta e se fecha em módulos diferentes** (buraco
   estrutural nº 2). É o que o dono do produto sente como bagunça.
2. **Não existe preço de convênio em lugar nenhum** — nem TUSS, nem CBHPM, nem
   tabela por plano. `at_procedimentos` só tem `valor_sus`, e a tela sugere o valor
   SUS como valor unitário **independente da via**. Convênio costuma ser 30-50% da
   receita.
3. **Não existe vigência.** A tabela do convênio muda e a conta antiga precisa
   continuar valendo pelo preço da época. O congelamento do valor no item salva a
   conta já lançada, mas reabrir uma conta de março em maio traz preço de maio — e
   no recurso de glosa não há como **provar** qual preço valia.
4. **Preço e via não são editáveis pela tela.** `valor_sus` e `via_sus` ficam fora do
   formulário de Tabelas, embora as colunas existam. A via APAC/AIH/BPA muda por
   portaria várias vezes por ano e hoje só muda com alguém no SQL Editor.
5. **A conta não sai de "fechada".** `marcarContaFaturada` e `contasDaCompetencia`
   existem em `dados.js` e **ninguém as chama**. Não há competência, lote nem
   protocolo. Não gerar o arquivo de remessa é defensável; **não ter lote não é** —
   sem ele ninguém sabe o que já foi enviado.
6. **Glosa não existe em nenhuma forma.** O status `glosada` está definido e nada no
   código o escreve. Sem tabela de glosa, sem motivo, sem prazo, sem recurso. Glosa
   típica é 3-8% do faturado, e metade costuma ser recuperável por recurso — sem
   registro, **100% vira perda definitiva**.
7. **Multiplicidade, quantidade máxima, CBO e habilitação não são checados.**
   `sigtap_procedimentos` não tem coluna `cbos`, e o motor passa `row.cbos` — sempre
   `undefined`. Procedimento sem habilitação é uma das rejeições mais comuns do
   SISAIH01, e rejeição derruba o registro inteiro.
8. **A conta não tem rastro de auditoria.** Não há trigger em `at_contas` /
   `at_conta_itens`, e `usuario` é sobrescrito a cada PATCH: quem cancelou grava por
   cima de quem lançou. Sem isso não há como responder "quem colocou este item" numa
   auditoria de operadora.
9. **Material e medicamento não chegam na conta por caminho automático** — em conta
   de internação são tipicamente 20-35% do valor. Hoje é digitação manual.
10. **Remessa AIH/BPA** — parada esperando o layout que o HNSN transmite hoje. A
    decisão de não escrever um gerador contra layout não conferido **está certa** e
    não deve ser revertida sem o layout em mãos.
11. **Remover** o item "Convênios & contratos" do módulo Faturamento (hoje
    `EmConstrucao`). Convênios **não** estão duplicados — é uma tabela só,
    `at_convenios`, escrita apenas por Atendimento → Tabelas. Construir a segunda
    tela criaria a duplicidade que hoje não existe.

---

## 🏗️ O desenho da Recepção unificada

Proposto pela revisão de arquitetura, para o buraco estrutural nº 1. Alcançável em
passos pequenos, cada um publicável sozinho.

**Passo 1 — Quem é.** Igual ao de hoje.

**Passo 2 — O que traz hoje (a peça-chave).** Escolhido o paciente, a tela consulta
os agendamentos dele para **hoje**:

- *Tem hora marcada* → cartão "Consulta hoje 14:20 · Ortopedia · Dr. X" + botão
  **Dar presença**, que chama `confirmarPresenca` — a mesma função que a Agenda já
  usa. **Três campos, não sessenta.**
- *Não tem* → três botões: Emergência · Ambulatorial · Internação eletiva.

**Passo 3 — Ficha condicional ao tipo:**

| Tipo | O que a tela mostra | Status de entrada |
|---|---|---|
| Emergência | origem, via de transferência, queixa | `aguardando_triagem` |
| Ambulatorial **agendado** | convênio/plano; o resto vem do agendamento | `aguardando_atendimento` |
| Ambulatorial **sem agendamento** | especialidade, tipo, convênio | `aguardando_atendimento` |

**Estados: não fundir os dois ciclos.** O agendamento é objeto de **vaga**; o
atendimento é o **episódio da pessoa**. Existem agendamentos sem episódio (falta,
cancelado) e episódios sem agendamento (toda emergência). Fundir faria "falta" ser
estado possível de um paciente que está na sala do PS. O vínculo já existe nos dois
sentidos e basta. O que falta é uma **leitura única** — `faseDoEpisodio()` em
`ciclo.js`, só para exibir a fita de estado.

**O primeiro PR sugerido:** *"A Recepção enxerga a consulta marcada de hoje"* — só
leitura, sem SQL, não toca `App.jsx` nem `Agenda.jsx`, e torna todos os passos
seguintes menores.

---

## ⚠️ Alarme falso — não repetir

A revisão da recepção abriu como **"único impeditivo absoluto"** que a tabela
`pacientes` estaria com `select ... using (true)`, aberta a qualquer autenticado,
citando `schema.sql:231`.

**É falso.** `schema.sql` e `reconstruir-banco.sql` criam as políticas antigas e só
no **fim** aplicam o `migracao-rls-leitura.sql`, que derruba **toda** política de
SELECT existente antes de criar a `<tabela>_leitura` com `pode_ver_algum(...)`. Quem
faz `grep` num desses arquivos gerados e para na primeira ocorrência conclui o
contrário do que o banco faz.

**Antes de acusar RLS aberto:** conferir se o `rls-leitura` vem depois na ORDEM
(`gerar-reconstrucao.mjs` o mantém sempre por último) — ou perguntar ao banco.

---

## 🟢 O que está bem-feito e não se mexe

Anotado de propósito: em revisão a tentação é reescrever.

- **`ciclo.js`** — estado desconhecido conta como *aberto* ("errar mostrando é
  recuperável, errar escondendo não"); o filtro usa `not.in` e não `neq`, porque o
  `neq` deixava cancelado passar por aberto; e `CAMPOS_CORRIGIVEIS` separa dado
  administrativo (corrigível) de registro clínico (só por novo registro).
- **A vaga com dono** (`agenda.js`) — regulação / marcação interna / ordem de
  chegada, cada uma com cota. Transcrever o que a regulação marcou é função
  **separada** de marcar, e exige o protocolo do papel.
- **`responsavel.js`** — a recusa a deduzir incapacidade, a exigência de nº de
  processo para curador, e `consente`/`recebe_alta` derivados do papel. É a Lei
  13.146/2015 implementada corretamente.
- **A ordem da tela na Recepção** — não existe formulário aberto antes de alguém
  procurar. É a única defesa arquitetural contra duplicidade que funciona com fila
  no balcão.
- **A pulseira** (`impressos.js`) — dois identificadores mínimos, e localização
  (leito, quarto, box) **não** conta como identificador.
- **Dinheiro em centavos** e o desempate do ponto ambíguo ("10.50" × "1.234,56").
- **`null` ≠ 0 em toda a cadeia do faturamento** — é o que impede a conta parecer
  fechada e menor do que é.
- **SUS não cobra do paciente**, com `CHECK` no banco além da tela.
- **Visão Executiva sem número inventado** — trocaram valores ilustrativos por
  `null`. Essa disciplina é o ativo mais difícil de recuperar depois de perdido.

---

Relacionado: [MODELO-DE-TRABALHO.md](MODELO-DE-TRABALHO.md) ·
[HANDOFF.md](HANDOFF.md) · [CONTEXTO.md](CONTEXTO.md)

---

## 🔬 AUDITORIA DE 25/08/2026 — o módulo inteiro percorrido

Feita depois dos PRs #124–#128, varrendo as cinco abas no banco demo **e**
cruzando o código: para cada coluna das tabelas do módulo, ela é escrita em
algum lugar? é lida em algum lugar? O que só vai ou só volta é o defeito.

**O padrão que domina a lista é sempre o mesmo:** a regra existe, roda, passa
no teste — e não chega em ninguém. Nenhum dos itens abaixo dá erro em tela.

### 🔴 1. `pacientes.obito` é lido em 5 lugares e escrito em NENHUM

A coluna nasce `false` e morre `false`. Quem a lê:

| onde | o que deixa de acontecer |
|---|---|
| `recepcao.js:333` | recusar abrir atendimento para falecido — nunca recusa |
| `agenda.js:592` | recusar marcar consulta para falecido — nunca recusa |
| `Recepcao.jsx:81` e `Agenda.jsx:1046` | o aviso "óbito registrado" — nunca aparece |

E o motivo de falta *"Resolveu em outro serviço / óbito"* existe no catálogo
sem ter para onde levar.

**A consequência que sai do hospital:** a confirmação da véspera (#123) liga
para o telefone do cadastro. Um paciente que **faleceu no próprio hospital**
continua na agenda, continua sendo confirmado, e quem atende o telefone é a
família. É o único defeito desta lista cujo dano não fica dentro do prédio.

**E o dado já existe:** `ps_atendimentos.desfecho = 'obito'` e
`leitos_saidas.desfecho = 'obito'` são gravados hoje. Falta o elo que carimba
o cadastro — e ele é barato.

### 🔴 2. "Cadastrar paciente" funciona com o formulário 100% vazio

Conferido na tela: 0% da identificação, a barra lista os oito campos que
faltam, e o botão segue habilitado. Um clique cria prontuário com iniciais
`"?"` que depois entra na lista de identificação pendente e na checagem de
duplicidade de todo mundo.

**Isto não é o princípio "nunca bloqueia".** Esse princípio existe para o
politraumatizado — e para ele já há um caminho próprio e nomeado,
*"Emergência — paciente sem identificação"*, que grava a origem. Cadastro
inteiramente vazio não é emergência: é clique errado. O piso razoável é
**um identificador qualquer** (nome, ou CPF, ou CNS).

### 3. A remarcação não chega a indicador nenhum

O #128 passou a gravar `remarcacao_motivo` com o lado (hospital × paciente) e
`remarcado_de` com a corrente. O relatório do mês **não usa nenhum dos dois**:
conferido no demo, a remarcação que fiz aparece como `CANCELADOS: 1`.

Some, portanto: **quantas vezes o hospital empurrou o paciente** (o único
número deste módulo sobre o qual o hospital manda) e a **espera real desde a
primeira marcação**. A linha da agenda mostra os dois; o relatório, que é o
que vai para a gestão, não.

### 4. O CEP não faz nada

Sem validação e sem preencher endereço. A recepção digita logradouro, bairro,
município, UF — cinco campos que o CEP responde, cada um uma chance de erro
que depois vira indicador territorial errado. É o campo de maior retrabalho da
tela de cadastro.

### 5. Colunas que só sabem ir, ou só voltar

| coluna | tabela | situação |
|---|---|---|
| `cancelado_em`, `cancelado_por` | `ps_atendimentos` | escritas, **lidas por ninguém** — quem cancelou um atendimento e quando não aparece em tela alguma |
| `obito_em` | `pacientes` | nem escrita nem lida |
| `origem_cadastro` | `pacientes` | nem escrita nem lida |

É a mesma família do `falta_motivo`, `confirmado_em` e `confirmado_por`, que o
#128 consertou ao acrescentá-los a `CAMPOS_AGENDAMENTO`.

### 6. `marcarContaFaturada` existe e ninguém chama · *Laura*

Nenhuma conta sai de **fechada** para **faturada**. O ciclo da conta não
fecha, e `reabrirConta` protege um estado que nunca é atingido.

### 7. Campos de cadastro que o CADSUS/e-SUS pede e não existem

**Estado civil**, **escolaridade** e **ocupação**. Somam-se aos já
conhecidos: município com código IBGE, e o caminho de recém-nascido (DNV,
certidão, `prontuario_mae`).

### Sem dano, mas anotado

`quemRecebeAlta` é exportada e testada e nenhuma tela a chama. **Não é bug**:
`camposDoResponsavel` deriva `recebe_alta` do papel, então banco e regra não
divergem hoje. É lógica duplicada esperando a chance de divergir.

### Ordem sugerida

**Óbito primeiro** — é o único cujo dano chega na família, e o dado para
preenchê-lo já está gravado em dois lugares. Depois o **cadastro vazio**, que
é uma linha. Depois a **remarcação no relatório**, que fecha o #128.

---

## 🏥 O QUE FALTA PARA SER UM ATENDIMENTO DE HOSPITAL — 25/08/2026

A auditoria acima procurou **defeito**: regra que existe e não chega em
ninguém. Esta lista é outra pergunta — o que um hospital tem e este módulo
**não tem de jeito nenhum**. Nada aqui está quebrado; está ausente.

### 🔴 1. A FILA NÃO RESPEITA A PRIORIDADE LEGAL

`filaDoAmbulatorio` ordena por **tempo de espera e nada mais**
(`ciclo.js:106`). Quem chegou antes é chamado antes, ponto.

A lei diz outra coisa, e não é recomendação:

| norma | quem tem prioridade |
|---|---|
| Lei 10.048/2000, art. 1º | idoso, gestante, lactante, pessoa com deficiência, pessoa com criança de colo |
| Estatuto do Idoso, art. 3º §2º (Lei 13.466/2017) | **maior de 80 tem prioridade sobre os demais idosos** |

Hoje uma senhora de 82 anos que chega às 9h05 é chamada **depois** de um
adulto de 30 que chegou às 9h00. O sistema não erra por conta própria — ele
simplesmente não sabe que existe prioridade, e quem opera o balcão sabe. O
resultado é que a ordem real passa a ser combinada por fora da tela, e aí o
tempo de espera que o relatório mostra não descreve o que aconteceu.

**Boa parte do dado já existe:** `data_nascimento` resolve idoso (≥60),
maior de 80 e criança de colo (<2) por cálculo, sem campo novo. Gestante já
é registrada na triagem obstétrica do PS. Falta campo só para **pessoa com
deficiência** e **lactante**.

É o item de melhor relação dano × custo da lista inteira: obrigação legal,
dado quase todo disponível, e regra pura — exatamente o que este código faz
bem.

### 🔴 2. NÃO EXISTE CAMINHO DE RECÉM-NASCIDO — e o hospital faz parto

Zero ocorrências de `prontuario_mae`, `dnv` ou `recem_nascido` no código
inteiro. Um bebê que nasce aqui **não tem como entrar no sistema**:

- não tem nome no momento do nascimento (o cadastro exige nome);
- não tem CPF nem CNS (ganha depois);
- é identificado por **"RN de \<nome da mãe\>"**, que é convenção nacional;
- tem **DNV** (Declaração de Nascido Vivo), que é o documento dele;
- e precisa do **vínculo com o prontuário da mãe** — é por ele que se
  reconstrói o parto e é ele que a pulseira do berçário carrega.

Sem isso, o recém-nascido ou não existe, ou vira um cadastro solto sem
ligação com o parto que o produziu. Para um hospital com maternidade, é
buraco de primeira grandeza.

### 3. A INTERNAÇÃO NÃO ENTRA PELA RECEPÇÃO

`TIPOS_ATENDIMENTO.eletivo.disponivel = false`, travado por teste. A recepção
abre **Emergência** e **Ambulatorial** e mais nada — então cirurgia
programada e internação clínica não têm porta de entrada administrativa.

A trava é **deliberada e certa** enquanto o caminho do leito não estiver
amarrado adiante: abrir internação sem leito cria paciente num limbo que
nenhuma tela pega. Mas é bom não confundir "protegido" com "pronto": um
hospital sem admissão de internação pela recepção não fecha o ciclo.

Destravar depende do Giro de Leitos receber por ali — e aí vem junto o resto
do pacote de internação: AIH, acompanhante, censo, aviso de internação.

### 4. NÃO EXISTE PAINEL DE CHAMADA

A fila viva existe **para quem está atrás do balcão**. Quem está na sala de
espera não vê nada: a chamada é o nome gritado no corredor.

Num ambulatório com quarenta pessoas esperando isso custa três coisas de uma
vez — o paciente que não ouve e perde a vez (e vira falta no indicador), a
exposição do nome de quem está sendo atendido, e a fila que se levanta a
cada chamada para perguntar se era ela.

### Também ausentes, de porte menor

- **Contra-referência** — o documento que volta para a UBS depois da consulta
  especializada. Obrigação da rede, e o ambulatório existe para isso.
- **Crachá de acompanhante** — o papel "acompanhante" existe em
  `at_responsaveis` (ECA art. 12, Estatuto do Idoso art. 16) e não vira
  documento nenhum; quem controla a entrada não tem o que conferir.
- **Estado civil, escolaridade e ocupação** no cadastro (CADSUS).
- **CID-10 como tabela** — hoje é texto livre.
- **Município com código IBGE** — hoje texto livre, e a AIH/BPA pedem código.
- **Unificação de prontuário** — o #108 atacou a causa; duplicata que já
  existe continua permanente.

### Ordem sugerida

**Prioridade legal na fila primeiro.** É obrigação legal, o dado quase todo
já existe, e é regra pura com consequência real — o formato que este código
acerta. Depois **recém-nascido**, que é o buraco de maior porte num hospital
que faz parto.
