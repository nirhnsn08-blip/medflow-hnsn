# 📍 Ponto de restauração — checkpoint-v61

Este é um **ponto seguro** do projeto. Se alguma mudança futura quebrar algo,
dá pra voltar exatamente para este estado.

- **Tag Git mais recente:** `checkpoint-v61` (anteriores: `checkpoint-v60` … `checkpoint-v1`)
- **Data:** 2026-08-26 · `main` em `53e73ed`
- **Equipe:** 2 devs; publicação por **branch + Pull Request** (merge na `main` =
  vai ao ar). Da v60 para cá: **9 PRs (#134–#142)**, todos no **Atendimento** e no
  **Faturamento**. O tema da rodada não foi construir função nova: foi **fazer chegar
  em alguém** o que já existia no código e não alcançava ninguém.
- **1794 testes** · **nenhuma tabela nova · 8 colunas novas** · build limpo.
  (O total de tabelas/colunas sai do próprio banco, por `supabase/auditoria-banco.sql`
  — não confie em contagem feita no arquivo.)
- **Publicado e funcionando** no HNSN (`medflow-hnsn.vercel.app`) — conferido no bundle
  de produção, não só no CI.
- ✅ **Banco de teste (demo)**: `npm run dev:demo` aponta para `ufxqdvxhruaswuzhmxyf`,
  com **faixa laranja** no topo. Toda migração roda **primeiro no demo, depois no HNSN**.
  **Sem faixa = produção do hospital.**
- ⚠️ **"Rodei o SQL" precisa de RECIBO, não de palavra.** Toda migração desta rodada foi
  conferida por **sonda REST nos dois bancos** (`select=<coluna>&limit=0`: `[]` = existe,
  `42703` = não existe). Já aconteceu de a migração ser dada como rodada e não estar.

## 🆕 Novidades da v61 (desde a v60): o que existia e não chegava em ninguém

A v60 fez o Atendimento virar o balcão do hospital. A v61 tem um tema só, e ele não é
funcionalidade nova: **é dado que o sistema já guardava e nenhuma tela mostrava**, e
**estado que o código sabia escrever e nenhum caminho alcançava**.

Nove PRs (#134–#142). O padrão apareceu tantas vezes que virou método de busca.

### 🔴 `faturada` era um estado INALCANÇÁVEL (#138)

`marcarContaFaturada` existia em `dados.js` desde sempre e **nenhuma tela a chamava**.
Nenhuma conta jamais saiu de "fechada". Três leitores dependiam disso: o KPI
*"Faturadas — já transmitidas ao SUS"*, a linha equivalente no painel, e
`concluidas = fechada + faturada`. **Todos zero por construção.**

> Indicador que **não pode** mudar é pior que indicador nenhum: quem olha para ele todo
> mês aprende que o número não quer dizer nada.

E a função gravava **só o status**. `fecharConta` carimba `fechada_em`/`fechada_por` desde
sempre; a transmissão, que é o passo **sem volta**, não carimbava nada — justamente as três
coisas que alguém procura quando a glosa chega meses depois.

O que entrou: registro da transmissão **em lote** (competência + via + data + protocolo),
com `faturada_em`, `faturada_por` e `remessa_protocolo`, e um **trigger** que recusa sair de
`faturada` para qualquer coisa que não seja `glosada`.

⚠️ **O sistema continua NÃO gerando o arquivo de remessa** (BPA-I/BPA-C, SISAIH01, XML do
TISS). É recusa deliberada e documentada em `faturamento.js`, e ela foi respeitada: o que se
registra não é *"o sistema transmitiu"*, é *"alguém transmitiu, e disse quando e sob qual
protocolo"*.

⚠️ **Em lote, não conta a conta.** Uma tela que pedisse um clique por conta é tela que
ninguém usa num mês de trezentas contas — e aí o estado voltaria a ser inalcançável, só que
com botão.

### 🔗 Unificação de prontuário: o ponteiro, não a mudança de dado (#141)

A mesma pessoa acaba com duas fichas e o histórico fica partido — alergia numa, prescrição
na outra, e quem atende decide vendo metade.

⚠️ **O levantamento mudou a forma do trabalho:** `prontuario` aparece em **34 tabelas**, e o
PostgREST **não tem transação entre requisições**. Repontar 34 tabelas em 34 chamadas
significa que uma falha no meio deixa o paciente partido num estado que **ninguém sabe qual
é** — pior que a duplicata, porque a duplicata pelo menos é visível.

Então esta fase **liga sem mover**. E o ponteiro é necessário nos dois caminhos de qualquer
forma: número de prontuário está em pulseira, em papel e na memória das pessoas, então a
ficha antiga tem de continuar resolvível **para sempre**.

🔴 **A recusa mais importante são os GÊMEOS.** Dois irmãos do mesmo parto dão 90% de
confiança para o detector de duplicata. Unificá-los junta **duas pessoas numa ficha**, e a
partir dali a prescrição de um vale para o outro. Aqui é **recusa, não aviso** — aviso se
fecha sem ler. Idem para CPF ou CNS distintos dos dois lados: documento diferente é **prova**
de pessoa diferente, não palpite.

O motivo é **obrigatório**: é a única coisa que a máquina não tem como saber, e é o que
alguém lê daqui a um ano para julgar se a junção estava certa.

No banco: CHECK contra autorreferência, FK para o destino existir (sem ela um erro de
digitação faz o paciente sumir — a ficha diz "olhe ali" e ali não tem nada) e **trigger
contra cadeia nos dois sentidos**, porque A→B→C→A não deixa a tela lenta, deixa **travada**.

### 🩺 Idade da mãe: aviso sobre vínculo, não sobre biologia (#140)

O erro que ele procura **não é gravidez improvável — é o bebê ligado ao prontuário errado**.
Quem traz o recém-nascido muitas vezes é a avó, e escolher a linha errada numa lista de
homônimas é fácil.

⚠️ **Faixa larga de propósito (silêncio de 10 a 54).** Mãe adolescente existe, e um sistema
que se recusa a cadastrar o filho dela inverte a prioridade: o **bebê** fica sem prontuário.
Só acende onde o vínculo trocado é *mais provável que o fato*.

A idade é a do **dia do parto**, não a de hoje — uma mãe de 9 anos num parto de 1999 tem 36
agora, e usar a idade atual deixaria passar exatamente o caso alvo.

### 🧭 As quatro pontas soltas e o código IBGE (#136, #137, #139)

- **Cadastro vazio gravava.** Um clique errado criava prontuário `?`. Agora **criar** exige
  nome, CPF **ou** CNS — um dos três. **Editar não tem piso**: editar nunca cria fantasma.
- **Remarcação era invisível** no relatório: aparecia só como "cancelado", no mesmo balde de
  quem desistiu. KPI **Remarcadas** com a parte acionável entre parênteses, e o rodapé diz de
  qual mês o número fala (as duas pontas do movimento ficam em meses diferentes).
- **`cancelado_motivo/em/por`** eram gravados desde sempre e nenhuma tela mostrava — a
  pergunta "quem cancelou, e por quê" ia parar no corredor.
- **O CEP não fazia nada.** Agora preenche o endereço, **não sobrescreve o digitado** e
  **não bloqueia** se a internet cair. E captura o **código IBGE do município**, que a AIH e o
  BPA exigem e ninguém digita.
  🔴 A regra do IBGE é dupla: só grava quando o município que **fica** é o que o CEP
  respondeu, **e some quando município ou UF são editados à mão**. Código certo ao lado de
  cidade errada passa direto e volta como glosa.
- **A mensagem de falha afirmava uma causa que não sabia** (#139): `null` (a requisição
  falhou) e `[]` (funcionou e não achou nada) estavam no mesmo balde, e a mensagem mandava
  pedir permissão à TI por causa de um SQL que ninguém rodou. Mesmo `null ≠ 0` de sempre, num
  lugar novo: a diferença entre *"não consegui perguntar"* e *"perguntei, e a resposta é
  nenhuma"*.

### 🔴 AS TRÊS LIÇÕES DESTA RODADA — todas armadilhas construídas por nós mesmos

**1. Teste de banco tem que devolver LINHA, não `NOTICE`.**
O SQL Editor do Supabase **não mostra `RAISE NOTICE`** e mostra a saída da **última**
instrução. Um teste escrito como `DO $$ … RAISE NOTICE … $$; ROLLBACK;` devolve
*"Success. No rows returned"* **tanto com a defesa funcionando quanto sem ela** — e o `DO`
ainda captura as exceções. É o irmão do PostgREST devolvendo 2xx com zero linha alterada.
> Um teste que passa dos dois jeitos é **pior** que teste nenhum: dá confiança sem dar
> informação.
Modelo certo: juntar resultados numa `TEMP TABLE` e terminar com `SELECT`.

**2. Gravar + ler de volta ainda NÃO é pronto — falta DESENHAR.**
As três colunas da remessa eram gravadas, entravam em `CAMPOS_CONTA` e **nenhuma tela as
mostrava**. O cartão dizia só "Faturada" — justo o lugar onde alguém vem parar quando a glosa
chega perguntando em qual remessa a conta foi.
**A varredura tem TRÊS braços: é escrita? é lida? aparece?**

**3. Trava que depende de premissa não verificada não é trava.**
O script de limpeza tinha um `DO` no topo que abortava no banco errado. Isso só protege se as
instruções seguintes rodarem na mesma sessão e transação — e foi **exatamente essa suposição
que quebrou** (`relation "_antes" does not exist`). A condição agora vai **colada em cada
`DELETE`**: rodar no banco errado apaga **zero linha**, sem depender da memória do editor.

### 🚶 O passeio na tela acha o que os testes não acham

Com **1.763 testes verdes**, o passeio do #138 achou três defeitos — inclusive o item 2
acima. No #141 mostrou que os gêmeos **nem chegam** à tela de unificação
(`possiveisDuplicatas` já os exclui) e que o demo tinha **nove "Clara Lima Barbosa"
homônimas** — que o sistema **recusou** unificar, com prova (CPFs diferentes).

### 🧹 Demo limpo (#142)

73 pacientes. Saíram os rastros dos passeios. **Ficou de propósito** o endereço do T9020:
apagar endereço de cadastro para consertar sujeira de teste é remédio pior que a doença, e
quem for testar CEP de novo precisa de um cadastro com endereço.

### ❓ Em aberto, esperando decisão de produto

- Os KPIs **Faturadas** e o funil contam só **internações** — remessa de BPA não move aquele
  número. Pode ser intenção ou lacuna.
- **Internação pela recepção** segue travada de propósito até o Giro de Leitos receber por
  ela.
- **Mover o dado clínico** na unificação: exige função Postgres com transação única e trilha
  do que foi repontado. Só faz sentido depois do uso real do ponteiro.

## 🆕 Novidades da v60 (desde a v59): o Atendimento vira o balcão do hospital

A v59 fechou o Faturamento lendo dado real. A v60 é sobre a **porta de entrada**: o que
acontece antes de existir conta.

### 🏥 A recepção unificada (PRs #107–#123)
A recepção só sabia abrir **emergência**. Agora o balcão cobre o ciclo: **procura** (por
nome, CPF, CNS, prontuário, **telefone e RG**, sem mentir quando a consulta falha) →
recebe pelas **três portas** (consulta marcada / chegou sem marcar / emergência) → cobra
**convênio e carteira** conforme o convênio exige → congela **médico e CBO** → **responsável
e pulseira** → acompanha a espera na **fila viva** até a chamada. Quem chega sem marcar
entra na **fila de chegada** e **conta na produção**. A agenda ganhou **vaga por
profissional** (o índice único trocou), **bloqueio que avisa quem já está marcado**,
**confirmação da véspera** e **motivo da falta**.

**O padrão que o #107 abriu e se repetiu o resto da rodada:** regra que existe, roda,
passa no teste — e **não chega em ninguém**. Oito travas mudas só naquele PR; depois
`falta_motivo` e `confirmado_em` gravados e nunca lidos; `conta_como` semeado e lido por
nada; CBO lido em três telas sem campo em lugar nenhum.

### 👤 O cadastro passa a caber em quem chega (PRs #124, #125, #133)
**Editar cadastro** (antes só dava para corrigir o cadastro que o sistema já reclamava),
**telefone à vista**, e a busca alcançando telefone e RG — três campos que o banco guardava
e nenhuma busca alcançava.

**Estrangeiro e naturalizado:** a nacionalidade decide a ficha — nasceu fora, o **país de
nascimento** ocupa o lugar da naturalidade e o **passaporte** o do CPF. Antes, quem nasceu
no Uruguai tinha duas pendências impossíveis e nunca chegava a "completo".

**Etnia indígena:** raça/cor indígena sem etnia é rejeitada no BPA. Guarda o **nome**, não o
código de 4 dígitos — código inventado volta como glosa com o nome de um povo trocado pelo
de outro.

**Recém-nascido:** o hospital faz parto e o bebê **não tinha como entrar**. Ganhou nome
provisório "RN de \<mãe\>", **DNV**, vínculo com o prontuário da mãe, hora e ordem do parto.

### 🖨️ Os papéis que o paciente leva embora (PRs #126, #127)
**Declaração de comparecimento** — que **não é atestado**, e o papel diz isso: declara
presença, não incapacidade, e **não leva diagnóstico** (é o único impresso cujo destinatário
é o empregador). **Comprovante de agendamento** — que imprime o **telefone do cadastro** e
pede a correção ali, porque é para ele que a confirmação da véspera liga e ninguém nunca o
conferia.

E a aba **Consultas** deixou de ser um beco: achar um episódio passa a levar a imprimir.

### ⚖️ As regras legais que faltavam (PRs #130, #132)
**Prioridade na fila** — Lei 10.048/2000 e Estatuto do Idoso, art. 3º, §2º. A fila ordenava
por tempo de espera e nada mais; uma senhora de 82 anos era chamada depois de um adulto de
30 que chegou cinco minutos antes. **Sem proporção inventada** (a lei não fixa nenhuma) e a
fila **diz o que não sabe ver**: PCD, lactante e obeso continuam por conta do balcão.

**O óbito chega ao cadastro** — `pacientes.obito` era lido em **cinco** lugares e escrito em
**nenhum**. A consequência saía do hospital: a confirmação da véspera ligava para a família
de quem morreu no próprio hospital. Agora dois **triggers** carimbam a partir do desfecho do
PS e da saída de leito, mais o **backfill** do que já estava gravado.

### 📦 Almoxarifado, auditoria e acesso (PRs #100–#106)
**Integridade do saldo** (CHECK de tipo, saldo não-negativo, `for update` no trigger,
conciliação kardex × saldo), **ajuste de inventário rastreável** e **estorno com vínculo**,
**unidade de compra × unidade de consumo** (sem o fator, custo médio e curva ABC misturavam
caixa com unidade), **alçada de aprovação** (quem pede não aprova — nasce desligada).
A **trilha de auditoria virou atribuível** (`usuario_id` carimbado pelo banco) e a **escrita
passou a exigir o módulo** na RLS, com ensaio antes de aplicar.

### 🔬 Duas auditorias versionadas (PRs #110, #129, #131)
`docs/DIAGNOSTICO-ATENDIMENTO.md` guarda a fila de cada um e **duas varreduras**: uma de
**defeito** (regra que não chega em ninguém) e uma de **ausência** (o que hospital tem e o
módulo não tem). **Ler de lá, não reconstruir.**

### 🔴 As regras de segurança que não se mexem sem pensar
- **Gêmeos não são duplicata.** Dois irmãos do mesmo parto têm a mesma mãe, a mesma data e
  nomes quase idênticos — a duplicidade os acusava com 70–90% e oferecia "use o prontuário
  que já existe". Seguir isso **junta dois bebês num prontuário** e a prescrição de um passa
  a valer para o outro. A **DNV** separa: diferente = duas pessoas; **igual = o mesmo bebê
  duas vezes**, e o aviso continua.
- **Pulseira não sai de episódio encerrado** — número de atendimento velho no pulso de
  alguém hoje é o erro que o PNSP existe para impedir.
- **Nada sai de episódio cancelado** — declarar presença que não houve.
- **O óbito só carimba, nunca apaga.** Carimbar por engano a tela explica; apagar por engano
  faz o hospital voltar a ligar para a família.
- **A conferência do cadastro nunca bloqueia** (CFM 1.638, art. 5º, I, "e") — mas o botão
  "Cadastrar" com o formulário **inteiramente vazio** ainda funciona, e isso está na fila.

### ⚠️ Lições de teste que custaram caro nesta rodada
- **Fronteira legal se testa com o número literal.** Testar os 80 anos comparando com a
  constante deixou a mutação passar verde: o teste se movia junto com o erro.
- **Guarda contra ciclo não fica vermelha — fica TRAVADA.** Laço infinito bloqueia o event
  loop e nem o vitest interrompe. Por isso a mesma regra ganhou CHECK no banco.
- **O contrato de banco aprendeu embed** (`tabela(coluna)`): confere a tabela embutida **e**
  as colunas dela.

**Falta no Atendimento** (detalhe em `docs/DIAGNOSTICO-ATENDIMENTO.md`): **internação não
entra pela recepção** (trava deliberada até o leito amarrar adiante) · **painel de chamada**
na sala de espera · **contra-referência** para a UBS · **CID-10 como tabela** · **município
com código IBGE** · **unificação de prontuário** · cadastro vazio que grava · CEP que não
preenche endereço. Ainda **não há paciente real** no sistema. **1689 testes + build verdes.**

## 🆕 Novidades da v59 (desde a v58): a Visão Executiva do Faturamento passa a ler dado real

A Visão Executiva era **layout com números ilustrativos** ("R$ 2,10 mi a receber",
"índice de glosa 4,8%"). Deixou de ser — agora lê a produção de verdade. Nada de número
inventado: o que o hospital ainda não tem (faturado × recebido × glosa real, projeção)
**não é mostrado** até o dado existir.

### 📊 Visão Executiva com dado real — o funil (PR #93)
Motor puro `src/atendimento/resumo-faturamento.js` (`resumoFaturamento`, +15 testes): a
partir da **worklist** (internações × conta) e do SIGTAP, deriva o **funil por situação**
(esperando conta → aberta → fechada → faturada), o **backlog** (internações esperando
conta), o **valor de referência SIGTAP** do backlog e um **farol de sinais reais** (backlog
envelhecendo, contas a fechar, glosadas). Falta de dado é silêncio: sem backlog, o valor é
`null`, não R$ 0,00. A tela lê a worklist (grants que o perfil faturamento já tem) e mostra
KPIs/funil/farol reais + **empty-state honesto**. Cérebro 3D mantido.

### 🧭 Faturamento por via + R$ de referência no hero (PR #94)
Segundo motor puro `resumoPorVia` (+8 testes): resolve a via de cada atendimento faturável
(`resolverVia`) — internação→**AIH**, ambulatório→**BPA/APAC** pelo `via_sus`, convênio→**TISS**,
particular→**direta**, sem convênio→**"sem-via"** — e soma o **valor de referência SIGTAP**
(SH+SP) por via. Para BPA/APAC aparecerem, um loader novo (`carregarProducaoFaturavel`) lê a
**produção faturável inteira** (`status=finalizado` com procedimento), não só as internações —
a worklist de internação só daria AIH. A tela ganhou o painel **"Faturamento por via"** e o
**hero** passou a liderar com o **R$ de referência SIGTAP total**, rotulado **"não é o faturado
real"**. Ambos os PRs **sem migração** — só leitura de tabelas já concedidas.

### 🔐 Segurança de acesso afinada (PRs #88, #89, #91, #92)
De passagem, a fatia de controle de acesso que o doc da v58 não citou: **exceção de acesso
por usuário** (a TI libera/suspende um módulo para UMA pessoa, com motivo e autor — PR #88),
**correção do aviso da tela de Perfis** (dizia o contrário do que a RLS faz — PR #89), o
**diretor técnico passou a só CONSULTAR a trilha de auditoria** (escrita→leitura, com a
migração `migracao-perfis-auditoria-diretor.sql` como molde de `UPDATE` de grant — PR #91) e
o **HANDOFF ganhou a seção "Segurança de acesso"** (PR #92).

**Falta da Fase 4:** **glosa por valor** (item acima do SIGTAP, incompatibilidades); refinar
valores por **CNES do HNSN** (a ferramenta já aceita `--cnes`); o "por via" **acende sozinho**
quando houver produção real; **arquivo de remessa** (parado até o layout do HNSN). Ainda **não
há paciente real** no sistema. **1186 testes + build verdes.**

## 🆕 Novidades da v58 (desde a v57): DATASUS vira ferramenta + glosa de CID (Tier 1 Fase 4)

A capacidade de ler as AIHs reais do SUS deixou de ser scripts soltos e virou peça
permanente do projeto; e a glosa ganhou a regra que mais rejeita conta no SUS.

### 🧰 Importador de AIH versionado (PR #86)
Os scripts de rascunho viraram `supabase/importar-aih.mjs` — testado e reproduzível. Um
comando por competência: `node supabase/importar-aih.mjs <arquivo.dbc> [--cnes N]` lê o
`.dbc` do DATASUS (descompactador **PKWARE-DCL/blast** escrito do zero — a máquina só tem
Node), cruza com os 219 do seed e (re)gera `migracao-sigtap-valores.sql`. O `blast` é
validado pelo **vetor canônico do blast.c**. `--cnes` filtra um hospital; sem ele, o estado
inteiro. **Geral por padrão:** cada cliente importa o `.dbc` do seu estado.

### 🩺 Glosa de CID × procedimento (PR #87)
A antecipação de glosa passou a avisar o **CID atípico** (atenção, não bloqueio): quando o CID
da conta não consta entre os vistos com o procedimento nas AIHs reais — a **causa nº 1 de glosa
real** do AIH. A ferramenta deriva os CIDs (DIAG_PRINC vistos ≥2×) para a coluna nova
`sigtap_procedimentos.cids`; o `montarSig` já mapeia `cids`, então a regra (que já existia no
`sigtap.js`) **acende só com o dado — zero mudança no app**. Clinicamente coerente (doenças
bacterianas ← CIDs A31x/A39x/A40x).

**Falta da Fase 4:** refinar valores por CNES do HNSN (a ferramenta já aceita `--cnes`);
sexo/idade como glosa (são *impedimento* — melhor com o pacote SIGTAP oficial); **Visão
Executiva com dado real**; **arquivo de remessa** (parado até o layout do HNSN). **1156 testes + build verdes.**

## 🆕 Novidades da v57 (desde a v56): a conta do prontuário fecha o fluxo e ganha R$ real

A conta que se monta do prontuário virou um **fluxo completo** — da lista de trabalho ao
lançamento — e passou a fechar em **R$ real**, dos valores que o SUS de fato pagou.

### 🧾 Lançar na conta do Adauam (PR #81)
A proposta montada do prontuário vira **itens gravados na conta do episódio** — a mesma do
módulo Atendimento, não uma paralela. Reusa `abrirConta`/`acrescentarItem` sem editar o
arquivo dele. Gated por `canLaunch` (adm_silver+); só lança em conta vazia (nunca duplica);
confirma antes de gravar.

### 🛏️ Permanência real pela estadia no leito (PR #82)
As diárias saem da **permanência real da internação** — datas do leito (`ps_atendimento_id`
para a estadia em curso; `leitos_saidas` por prontuário+período para a encerrada) —, não da
passagem pelo PS. A tela mostra a fonte (**do leito** × **estimada**). De passagem, corrigiu
um bug latente: internação em curso não herda mais o desfecho do PS como se fosse alta.

### 📋 Worklist de Pendentes (PR #83)
A aba Pendentes deixa de exigir digitar número: **lista as internações a faturar** com o
estado da conta de cada uma (sem-conta → aberta → fechada/faturada, ação primeiro), e um
clique monta. `montarWorklist` (puro) junta episódio × conta por `atendimento_id`.

### 💰 Valores e permanência REAIS do SIH-SUS (PR #84)
A conta ganha **R$ de verdade**. A Laura passou um `.dbc` do DATASUS (AIH do RS, jun/2026);
escrevi um **leitor de `.dbc` em Node do zero** (descompactador PKWARE/DCL — a máquina só tem
Node), li as **76.035 AIHs** e derivei, por procedimento, a **mediana de VAL_SH/VAL_SP** e a
**permanência média real** — `migracao-sigtap-valores.sql` populou `valor_sh`/`valor_sp`/
`media_permanencia` de **215 dos 219**. O motor usa **SH+SP** quando o hospital não tem valor;
a diária segue informativa (o SH cobre a permanência padrão, sem duplicar). Uma pneumonia saiu
de "sem preço" para **R$ 1.110**. Valores do RS (a tabela SUS é nacional → aproxima o oficial);
refinar pelo CNES do HNSN quando houver. Ver `datasus-dbc-node` na memória.

**Falta da Fase 4:** ferramenta de import mensal do `.dbc` (o dado é mensal); refinar valores
pelo CNES do HNSN; **glosa completa por valor**; **arquivo de remessa** (parado até o layout que
o HNSN transmite). **1143 testes + build verdes.**

## 🆕 Novidades da v56 (desde a v55): a conta AIH se monta do prontuário (Tier 1 Fase 4)

O **diferencial da Fase 4** saiu do papel: em vez de o faturamento digitar item a item, a
**conta se monta sozinha do que aconteceu no episódio**. Construída **em cima da conta do
Adauam** (mesmo formato de item, para **alimentar a conta dele** — não uma paralela), em
**arquivos novos** para não colidir.

### 🧾 Motor `src/atendimento/montar-conta.js` (+30 testes) — a espinha (PR #78)
Puro (não sabe React nem banco): dado o episódio + os catálogos + o convênio, **propõe a conta**:
- **Procedimento principal**, cruzando os dois catálogos — o do hospital (que tem o **preço**) e o
  **SIGTAP** (que tem o nome oficial);
- **Diárias de permanência** (admissão → alta), comparadas com a **média SIGTAP**;
- **CID** e **via** — internou pelo SUS = **AIH**, acima do procedimento;
- **pré-glosa** (reusa `sigtap.avaliarGlosa`: permanência / sexo / idade / CID);
- **avisos** do que conferir antes de fechar.

Fiel aos princípios da casa: **preço nunca inventado** (o que não veio do DATASUS entra `null`,
e a tela avisa que o total sai menor), **cada item mostra a origem** no prontuário, e **todo item
nasce sem cobrança do paciente** (SUS não cobra de quem foi atendido). A tela é a **aba Pendentes**
do módulo Faturamento (busca por nº de atendimento → monta → cabeçalho / permanência / itens com
origem / pré-glosa / total). **Sem migração:** o perfil faturamento já lê `ps_atendimentos` pelo
grant `atendimento`.

### 💊 Medicação administrada entra na conta (PR #79)
A conta passa a incluir os **medicamentos de fato administrados** (`ps_administracoes`, status
`administrado`), agrupados por medicamento. Item cobrável da AIH, montado do **realizado**, não do
prescrito. Exigiu **liberar a leitura** de `ps_administracoes` para o módulo faturamento
(`mapa-tabelas.js` + `migracao-rls-leitura.sql` regenerado) — decisão de acesso tomada com cuidado:
é a **base clínica da conta**, não a narrativa do prontuário (evolução / anamnese / prescrição
detalhada seguem **fora** do faturamento). **Verificado no DEMO e no ar no HNSN.**

**Falta da Fase 4:** o botão **"lançar na conta do Adauam"** (a proposta virar itens gravados em
`at_conta_itens`, coordenando com ele) → as **datas de internação do leito** para a permanência
real (hoje estima pela passagem no PS) → enriquecer o SIGTAP com o **pacote do DATASUS** (R$ / CID /
CBO) → a glosa completa → o **arquivo de remessa** (parado até o layout que o HNSN transmite hoje).
**1129 testes + build verdes.**

## 🆕 Novidades da v55 (desde a v54): Faturamento SUS — fundação do SIGTAP (Tier 1 Fase 4)

### 💼 Módulo Faturamento + tabela SIGTAP (PR #74)
Começou a **Fase 4 (Faturamento SUS)**, construída **sobre a base de conta do Adauam**
(`src/atendimento/faturamento.js`, que já modela as vias BPA/APAC/AIH/TISS/direta), em
**arquivos novos** para não colidir. O que entrou nesta fundação:

- **Motor puro `src/atendimento/sigtap.js` (+34 testes)** — via-agnóstico (AIH/APAC/BPA):
  normaliza o código SIGTAP, deduz a **via** pelo instrumento de registro, calcula a
  **permanência real × média** e roda um **checador de glosa extensível** que **CALA quando
  falta dado** (sem alarme falso). As travas de sexo/idade/CID já existem e acendem quando o
  pacote do DATASUS trouxer esses dados.
- **Tabela `sigtap_procedimentos`** (`migracao-sigtap.sql`) semeada com os **219 procedimentos
  que o HNSN fatura hoje** (grupo 03 clínicos + 04 cirúrgicos), com a **média de permanência**.
  Referência **read-only** (valor oficial não se edita à mão = glosa na certa); RLS de leitura
  `[TODOS]`; competência no formato `AAAA-MM` para casar com o `faturamento.js`.
- **Tela `src/atendimento/FaturamentoSus.jsx`** — arquivo próprio (recebe `sb=sbFetch` por prop):
  lista read-only dos 219 (código, nome, via, média) + **testador de glosa de permanência** ao vivo.
  Módulo top-level **Faturamento** na barra (ícone briefcase, grupo Apoio), blindado por `LimiteErro`
  e `TABELAS_OPCIONAIS`.
- **Grants** (`migracao-perfis-faturamento.sql`): o módulo `faturamento` concedido a
  faturamento / ti / provisório.
- **De passagem:** corrigidos os seeds **IAM/AVC/TEV** que faltavam na `ORDEM` do
  `gerar-reconstrucao.mjs` — o `reconstruir-banco.sql` estava desatualizado para subir banco novo.

**Migrações desta fase (rodadas nos 2 bancos):** `migracao-sigtap.sql`,
`migracao-perfis-faturamento.sql` e o `migracao-rls-leitura.sql` regenerado.
**⚠️ Lição:** tabela nova classificada no `mapa-tabelas.js` só passa a ser lida depois de rodar
o `migracao-rls-leitura.sql` — sem ele, fica **RLS ligado sem política = tela vazia, sem erro**.

**Falta da Fase 4:** enriquecer o SIGTAP com o **pacote do DATASUS** (valores em R$, CID, CBO) →
a **conta AIH se montar do prontuário** (o diferencial, em coordenação com o Adauam) → a glosa
completa → o arquivo de remessa (parado até o layout que o HNSN transmite hoje). **1099 testes + build verdes.**

## 🆕 Novidades da v54 (desde a v53): Protocolos Clínicos Gerenciados (Tier 1 Fase 3) + RLS de leitura por módulo

### 🚑 Protocolos Clínicos Gerenciados — Tier 1 Fase 3 (PRs #67, #68, #70, #72, #71, #69)
Módulo próprio **"Protocolos Clínicos"** (barra lateral, **por setor assistencial**) com as
4 linhas de cuidado tempo-dependentes ("tempo é tecido"). Cada protocolo **acende do que já
existe**, abre um **bundle com relógio** (cada passo com alvo em minutos, vermelho quando
estoura) e entrega os **indicadores porta→ação** sem digitação. Diferencial: **template
clínico comum + instância por setor** — cada setor liga e ajusta o que é dele.

- **Sepse** (#67 — ILAS, pacote de 1h): gatilho por **NEWS ≥ 5** (reusa `scoreAlertaPrecoce`);
  bundle lactato / hemocultura / ATB / cristaloide / vasopressor; indicador **porta→ATB**.
- **Dor torácica / IAM** (#68): gatilho por **sugestão na queixa** (texto livre da triagem);
  bundle **ECG ≤ 10 min** / AAS / troponina / reperfusão; indicador **porta→ECG**.
- **AVC** (#70): gatilho por queixa; bundle código AVC / **TC ≤ 25 min** / laudo / NIHSS /
  trombólise; **porta→TC** + **janela terapêutica** do início dos sintomas ("último visto bem",
  trombólise ≤ 4,5h) — o dado mais decisivo do AVC.
- **TEV** (#72): é **avaliação**, não evento agudo — **escore de Padua** (11 fatores) → alto
  risco ≥ 4 → recomendação de profilaxia (farmacológica / mecânica) contra o risco de sangramento.
- Motor puro `src/clinico/protocolos.js` (**+43 testes**) + `protocolos-catalogo.js`. Migração
  `migracao-protocolos.sql` (4 tabelas `prot_*`) + um seed por protocolo. Blindado (error
  boundary `LimiteErro` + `TABELAS_OPCIONAIS`).
- **#71 — o item de menu que faltava:** o módulo foi registrado na 3a (grant, rota, componente),
  mas **não entrou na lista fixa da barra lateral** (`App.jsx`, `sidebarItems`) — ficou
  inacessível em produção até este fix de 1 linha. **Lição:** módulo novo top-level precisa
  entrar no `sidebarItems`, não só em `MODULOS`.
- **#69 — grants clínicos:** o módulo Protocolos concedido a médico / enfermeiro / técnico /
  diretor técnico (escrita) e gestão (leitura), de forma focada (não espelha o NSP).

### 🔒 RLS de leitura por módulo — Fase 3 de segurança (PR #60)
O SELECT das tabelas deixou de ser `using(true)`: a leitura de cada tabela agora é **amarrada
ao módulo do perfil** via `public.pode_ver(<módulo>)`, com o mapa único em
`src/acesso/mapa-tabelas.js` → gerador `gerar-rls.mjs` → `migracao-rls-leitura.sql`;
`mapa-tabelas.test.js` garante que nenhuma tabela ficou de fora. Fecha o risco antigo do
`pacientes` (nome/CPF/nome da mãe/endereço) exposto a qualquer autenticado. **Ainda pendente:**
filtro por **LINHA** (só os do meu setor) e RLS de **ESCRITA** (segue pelo `role`). Um merge de
integração (`63885d7`) corrigiu de passagem uma regressão de escrita. **Regra p/ o futuro:**
tabela nova precisa entrar no `mapa-tabelas.js` + rodar `gerar-rls.mjs`.

**1065 testes + build verdes.** Com a Fase 3, faltam do **Tier 1** só os retoques; a grande
frente seguinte é a **Fase 4 — Faturamento SUS**.

## 🆕 Novidades da v53 (desde a v52): NSP Fase 2d completa (fecha o módulo) + Atendimento (faturamento) + saneamento

### 🛡️ NSP — Fase 2d completa: o Núcleo de Segurança do Paciente fechou — PRs #53, #55, #61, #62, #63/#64 e #65
Com a 2d, o módulo NSP (Fases 2a–2d) está **completo**. Todos os blocos leem os dados que
já existem — nada é digitado duas vezes.

- **Relatórios + ficha NOTIVISA (PR #53):** relatório mensal do NSP **apurado
  automaticamente** dos módulos (RDC 36/2013), imprimível/PDF, com a seção **NOTIVISA**
  listando as notificações compulsórias (never event / óbito) e a **ficha pronta** para
  transmitir. Motor `relatorioNsp` / `incidentesCompulsorios` / `fichaNotivisa`. **Sem
  migração.**
- **Protocolos gerenciados (PR #55):** os **6 protocolos básicos** do PNSP ligados às
  metas, geridos como documentos (versão / responsável / revisão / conteúdo / status),
  com **revisão vencida cobrada**, editáveis pelo ADM Master e nascendo **"em validação"**.
  Motor `resumoProtocolos` / `protocoloRevisaoVencida`. Migração `migracao-nsp-protocolos.sql`.
- **Capacitações (PR #61):** registro de treinamentos ligados às metas, **cobertura por
  meta** e **recorrência vencida cobrada**. Motor `resumoCapacitacoes` / `capacitacaoVencida`.
  Migração `migracao-nsp-capacitacoes.sql`.
- **Comunicação / mural de segurança (PR #62):** mural de comunicados (**alerta / lição
  aprendida / informativo**) com prioridade, público-alvo e **origem opcional em
  incidente/RCA** — fecha o ciclo aprender→comunicar. Motor `resumoComunicados`. Migração
  `migracao-nsp-comunicados.sql`.
- **Blindagem do módulo (PRs #63 e #64):** o NSP dava **tela branca** ao abrir (`Card` não
  definido no `NSPPage`, bug latente desde a 2a). Corrigido (#64 define `Card`) e **blindado**
  com um **error boundary `LimiteErro` por módulo** (#63): um erro num módulo nunca mais
  derruba o app — mostra a mensagem e o resto do sistema segue. `TABELAS_OPCIONAIS` passou a
  cobrir as tabelas do NSP.
- **Assistente AI (PR #65):** o último item da 2d — um **chat local e gratuito** que responde
  sobre o NSP a partir dos dados que já existem (panorama, ações atrasadas, RCA pendente,
  metas fora do alvo, protocolos, capacitações, comunicados, NOTIVISA). **Nada sai do
  navegador**: roteador por palavra-chave `responderAssistenteNsp` (puro/testável) + a tela
  `NspAssistenteView` no padrão do assistente do Giro de Leitos. **Sem migração.**
- **Migrações da 2d (protocolos, capacitações, comunicados) rodadas nos 2 bancos** (demo + HNSN).

### 🏥 Atendimento — os cinco itens que faltavam — PR #54 (Adauam)
O módulo passa a ter **5 abas** (Recepção, Agenda, Consultas, **Faturamento**, Tabelas).

- **Pulseira de identificação + ficha impressa** (`impressos.js`) — regras do PNSP
  (Portaria MS 529/2013): mínimo de **2 identificadores**; **localização nunca
  identifica** (leito, quarto e box mudam durante a internação); identificador é
  atributo da **pessoa** — o prontuário conta, o nº do atendimento não. **Iniciais não
  são identificador**: "J.S.M." é abreviatura, que o PNSP proíbe, e "NÃO IDENTIFICADO"
  identifica ninguém. Nada de clínico vai para o pulso. A impressão **nunca é
  bloqueada**: falta de identificador vira carimbo na própria pulseira.
- **Conciliação da produção** (`producao.js`, aba na Agenda) — os números do painel do
  Ambulatório eram digitados à mão e podiam divergir da agenda. Agora são apurados e
  comparados campo a campo, e gravados **sob comando, uma especialidade por clique**.
  `emergencias` não é apurável (não passa pela agenda) e é preservada no upsert.
- **Relatório mensal do ambulatório** — produção por especialidade, absenteísmo,
  ofertadas × realizadas, divisão por dono da vaga. O absenteísmo sai dos **totais do
  mês**, nunca da média dos percentuais diários.
- **Responsável do episódio** (`at_responsaveis`) — quem consente e a quem o paciente
  pode ser entregue. **Capacidade não se deduz:** curador, tutor e guardião exigem o
  número do processo (Lei 13.146/2015), checado na regra pura, na tela e por **CHECK no
  banco**. Acompanhante não consente nem recebe alta (ECA art. 12; Estatuto do Idoso
  art. 16). Idade desconhecida **não vira maioridade**.
- **Faturamento — fundação** (`at_contas`, `at_conta_itens`) — a conta do episódio, com
  a via (BPA/APAC/AIH/TISS/direta), fechamento por competência e dinheiro em **centavos
  inteiros**. **SUS não cobra do paciente**, recusado em três camadas. **Não gera
  remessa** de propósito: BPA, SISAIH01 e o XML do TISS têm layout versionado e
  homologação — o arquivo vem quando alguém tiver em mãos o layout que o HNSN transmite.
- Migrações `migracao-atendimento-responsavel.sql` e `migracao-atendimento-faturamento.sql`,
  rodadas nos 2 bancos. `SPECS` saiu do `App.jsx` para `src/ambulatorio/especialidades.js`.

### 🔧 Saneamento — build e dependências
- **Bundle dividido**: era um arquivo único de ~1,8 MB, rebaixado inteiro a cada deploy.
  Agora `react`, `charts` (recharts) e `vendor` são chunks próprios — **~540 kB (29%)
  ficam em cache do navegador entre publicações**. Não é split por rota (isso exige
  mexer no `App.jsx`); é metade do ganho pela fração do risco.
- **Vite 5 → 7 e Vitest 2 → 3**, upgrade controlado: fecha a vulnerabilidade do esbuild
  (`npm audit` = **0 vulnerabilidades**, era 5). Conferido com os 937 testes, o build, o
  dev server em modo demo e o build de produção no navegador.

## 🆕 Novidades da v52 (desde a v51 — PRs #49, #50 e #51): NSP Fase 2c (indicadores + 6 Metas) + Atendimento (ciclo de vida, Consultas)

### 🛡️ NSP — indicadores automáticos + 6 Metas Internacionais — PR #51 (Tier 1, Fase 2c)
- **Aba "Indicadores":** indicadores de segurança **puxados automaticamente dos módulos, sem
  digitação** — **LPP adquirida** (marcador POA da Fase 1a), **quedas** (com destaque das que
  tiveram dano), **erro de medicação**, **near-miss ratio**, **ações atrasadas** e **taxa de
  fechamento** do plano de ação (Fase 2b). Densidade por 1000 pacientes-dia no motor.
- **Aba "Metas de segurança":** as **6 Metas Internacionais de Segurança do Paciente** (OMS/JCI)
  com **farol** (verde/amarelo/vermelho) contra um alvo. As **automáticas** saem dos módulos
  (identificação, medicamentos de alta vigilância, quedas+LPP); **higiene das mãos, comunicação e
  cirurgia segura** vêm de **auditoria periódica** (numerador ÷ denominador → adesão %).
- **⚙️ Alvos editáveis pelo ADM Master:** os cortes de cada meta (`nsp_meta_faixas`) são editáveis
  na tela e nascem **"em validação"** — a equipe valida contra o protocolo do HNSN. As auditorias
  ficam em `nsp_meta_medicoes` (append-only, autoria congelada).
- Motor puro `src/clinico/nsp.js` (`farol`, `metasSeguranca`, `indicadoresSeguranca` ampliado).
  Migração `migracao-nsp-metas.sql` (`nsp_meta_faixas` + `nsp_meta_medicoes`), nos 2 bancos.

### 🚪 Atendimento — ciclo de vida + Consultas — PRs #49 e #50 (Adauam)
- **Ciclo de vida do atendimento (PR #49):** **encerrar, corrigir e cancelar** o atendimento —
  fecha o fluxo da recepção/ambulatório. Migração `migracao-atendimento-ciclo.sql`.
- **Aba "Consultas" (PR #50):** **pesquisa de atendimentos** — busca/consulta dos atendimentos
  registrados.

**773 testes + build verdes.** **Próximo do Tier 1: Fase 2d** — protocolos gerenciados,
capacitações, comunicação, relatórios/NOTIVISA e assistente AI do NSP.

## 🆕 Novidades da v51 (desde a v50 — PRs #43, #45 e #47): NSP Fase 2b + Atendimento (ficha, tabelas, agenda)

### 🛡️ NSP — análise de causas + plano de ação — PR #47 (Tier 1, Fase 2b)
- **Aba "Análise de causas":** fila dos incidentes que **exigem RCA** (evento adverso,
  never event, dano moderado+) + formulário com **5 Porquês**, **Ishikawa** (6M adaptado à
  saúde), **fatores contribuintes** (Protocolo de Londres) e **barreiras** que falharam →
  causa raiz. Ao concluir, o incidente vai para "em tratamento".
- **Aba "Plano de ação":** **5W2H** (o quê, por quê, quem, quando, onde, como, quanto),
  status, prazo, **ações atrasadas em vermelho**, KPIs (abertas / atrasadas / taxa de
  fechamento) e a **cobrança** no dashboard — o sistema cobra o fechamento (RDC 36/2013,
  Guia de Análise de Incidentes da ANVISA).
- Motor puro `src/clinico/nsp.js` (matriz de risco, exige-RCA, ação atrasada, fila de
  análise). Migração `migracao-nsp-rca-plano.sql` (`nsp_rca` + `nsp_acoes`), nos 2 bancos.

### 🚪 Atendimento — ficha, Tabelas e agenda — PRs #43 e #45 (Adauam)
- **Ficha do atendimento (PR #43):** **fonte pagadora** (SUS / convênio / particular) e
  **classificação** entram na abertura do atendimento — base do faturamento.
- **Tela "Tabelas" (PR #43):** o analista comercial mantém os **catálogos sem SQL**
  (convênios etc.) direto pela tela.
- **Agenda do ambulatório (PR #45):** "a vaga tem dono" — agendamento com o paciente
  identificado, ligando a agenda à ficha/cadastro.

**701 testes + build verdes.** **Próximo do Tier 1: Fase 2c** — indicadores automáticos de
segurança (LPP adquirida, quedas, erro de medicação) + as 6 metas.

## 🆕 Novidades da v50 (desde a v49 — PRs #42 e #44): Atendimento/Recepção + Núcleo de Segurança do Paciente

Duas frentes: a **porta de entrada** do hospital (Adauam) e o **Núcleo de Segurança do
Paciente** (início da Fase 2 do Tier 1).

### 🚪 Atendimento / Recepção — PR #42 (Adauam)
- Fecha a lacuna entre a **ficha** do paciente (v49) e a **porta**: a recepção
  **identifica o paciente e abre o atendimento**, com **emissão de prontuário** por
  sequência/função — acaba o número digitado à mão, que dava número duplicado e
  prontuário inventado.
- **Chave estrangeira** ligando `ps_atendimentos.prontuario` a `pacientes`: sem mais
  atendimento órfão apontando para prontuário inexistente (o Paciente 360 abria vazio).
  Backfill dos órfãos antes de ligar a trava, marcados `origem_cadastro='backfill'`
  (identificação pendente — não inventa dado de pessoa).
- Módulo próprio **"Atendimento / Recepção"** no menu; o PS confere o cadastro na chegada.
- Migrações `migracao-atendimento-recepcao.sql` + `migracao-atendimento-fk.sql` (a FK
  separada de propósito — ver o cabeçalho do arquivo), já nos 2 bancos.

### 🛡️ Núcleo de Segurança do Paciente — PR #44 (Tier 1, Fase 2a)
- Módulo **"Segurança do Paciente"** com **barra lateral própria** (RDC 36/2013 + PNSP).
  Funcionais nesta fase: Visão geral, Dashboard, **Notificações** (triagem), **Registrar**
  e **Consultar** incidente; causas/plano/indicadores/protocolos/metas/capacitações/
  comunicação/relatórios/AI já na barra, para as sub-fases 2b–2d.
- **Registrar**: classe (circunstância de risco / near-miss / sem dano / evento adverso /
  never event), tipo, **grau de dano (OMS)**, **matriz de risco ao vivo**, selos de RCA e
  **notificação compulsória (ANVISA)**, e **anonimato**.
- **Diferencial — botão "Notificar" em 30s de qualquer tela**, anônimo, para todo usuário
  logado (cultura justa, não-punitiva). O Dashboard puxa a **LPP adquirida do POA**
  (Fase 1a) — indicador automático.
- Motor puro `src/clinico/nsp.js` (matriz de risco, exige-RCA, near-miss ratio, resumo).
  Migração `migracao-nsp-incidentes.sql` (`nsp_incidentes` + `nsp_incidente_eventos`), já
  nos 2 bancos. Acesso: módulo `nsp` + grants (ti, provisório).
- **546 testes** + build verdes. **Próximo: Fase 2b** — análise de causas (RCA) + plano de ação.

## 🆕 Novidades da v49 (desde a v48 — PRs #39–#40): identificação do paciente + SAE (editor e fila de checagem)

Dois blocos: a **identificação completa do paciente** (Adauam) e o **fecho da Fase 1b**
da enfermagem (editor do catálogo + fila de checagem).

### 👤 Identificação do paciente (CFM 1.638/2002) — PR #39 (Adauam)
- **`pacientes` deixa de guardar só iniciais + ano:** ganha **nome completo, nome social,
  data de nascimento completa, filiação, naturalidade, raça/cor, identidade de gênero,
  CPF/RG/CNS, endereço em campos separados, contato e responsável, óbito** — o conteúdo
  mínimo de identificação exigido por norma.
- **Conserta a idade da triagem pediátrica:** com `data_nascimento` (dia/mês/ano), a faixa
  de sinais vitais deixa de errar até 11 meses (um bebê de 20/12 não é mais "1 ano" em
  janeiro, avaliado contra outra fisiologia).
- Índices de busca (nome, mãe, nascimento) e **índice único de CPF/CNS** (trava de
  prontuário duplicado). Migração `migracao-pacientes-identificacao.sql`, **aditiva**
  (`add column if not exists`), já rodada nos 2 bancos. A tela mostra **iniciais por
  padrão** (`comoExibir()`); o nome completo só onde a tarefa exige.
- ⚠️ **Eleva uma urgência de segurança:** a política de SELECT de `pacientes` é
  `using(true)` — passa a expor nome/CPF/nome da mãe/endereço a qualquer usuário
  autenticado. **Apertar o RLS de `pacientes` (modo sombra + quebra-vidro) virou
  pré-requisito antes do primeiro paciente real.** Ver Pendências.

### 🩺 SAE — editor do catálogo + fila de checagem — PR #40 (fecha a Fase 1b)
- **Editor do catálogo SAE (só ADM Master):** botão **⚙ Editar catálogo SAE** na aba SAE
  abre um editor que **valida e amplia** o catálogo NANDA/NIC — adiciona/edita diagnósticos
  e intervenções (características/fatores/resultado; atividades/frequência/aprazamento),
  valida/revoga e ativa/desativa, ou **"Validar todos"**. Editar o conteúdo clínico volta
  o item para **"em validação"**. `src/prontuario/EditorCatalogoSae.jsx`.
- **Fila de checagem à beira-leito (Giro de Leitos → aba "Checagem SAE"):** por leito
  ocupado, os cuidados da prescrição de enfermagem vigente e o estado da checagem de
  **hoje** (pendentes × atrasados), ordenado do mais crítico ao menos (vermelho = atrasado),
  com 3 KPIs no topo. Agregador puro `montarChecagemSae` (`src/clinico/sae.js`) + loader
  `loadChecagemSae`, no padrão do mapa de risco.
- **Sem migração** (usa as tabelas `enf_sae_*` da v48). **481 testes** + build verdes.

## 🆕 Novidades da v48 (desde a v47 — PR #37): enfermagem — SAE / Processo de Enfermagem (núcleo)

Segunda entrega do **Tier 1**. Fase 1b: leva o **Processo de Enfermagem** (COFEN
736/2024, ex-358/2009) à beira-leito, dentro do PEP — no padrão da Fase 1a (motor puro
testável + catálogo curado "em validação" editável pelo ADM Master).

- **🩺 Aba SAE no prontuário do internado (Paciente 360 → aba SAE)** com as 5 etapas:
  **Histórico** de enfermagem (coleta por necessidades humanas) → **Diagnóstico NANDA-I**
  (com **sugestão automática** a partir das escalas da Fase 1a, LPP e sinais vitais) →
  **Resultado esperado** (texto curado ligado ao diagnóstico) → **Prescrição de
  enfermagem (NIC)** com aprazamento → **Evolução** (reusa `pep_evolucoes`).
- **🛏️ Checagem do cuidado à beira-leito:** o **técnico** executa e checa o cuidado
  prescrito por horário (realizado × não realizado com motivo), na mesma lógica da
  checagem de medicação — vermelho quando atrasa.
- **🧠 Motor puro** `src/clinico/sae.js`: sugere diagnósticos do que já existe e reusa o
  aprazamento/checagem de `prontuario.js`. Estrutura fixa (modelo do histórico, domínios)
  em `sae-catalogo.js`.
- **📚 Catálogo curado "em validação"** (`enf_sae_catalogo`): **20 diagnósticos NANDA-I
  e 19 intervenções NIC** para clínica adulto, UTI, pediatria e obstétrica.
- **Competência COFEN** (`papeis.js`): histórico/diagnóstico/prescrição/evolução
  privativos do enfermeiro; **checagem do cuidado** também pelo técnico.
- Migração `migracao-enf-sae.sql` (6 tabelas `enf_sae_*`), já rodada no demo e no HNSN.
  **433 testes** + build verdes.
- **Próximo (só código, sem migração):** editor do catálogo NANDA/NIC pelo ADM Master
  e lista de trabalho da checagem à beira-leito.

## 🆕 Novidades da v47 (desde a v46 — PR #35): enfermagem — escalas, LPP e mapa de risco

Primeira entrega do **Tier 1** (roadmap de cuidado e segurança). Fase 1a: leva o
Processo de Enfermagem à beira-leito, dentro do PEP.

- **🩺 Escalas de risco no prontuário do internado (Paciente 360 → aba Escalas):**
  aplica 7 escalas — **Braden** (lesão por pressão), **Morse** (queda), **dor**,
  **flebite** (grau INS), **Fugulin** (grau de dependência), **Glasgow** e **RASS** —
  com formulário vindo de um catálogo (`src/clinico/escalas-catalogo.js`), **prévia de
  score ao vivo**, classificação pelo motor puro (`src/clinico/escalas-enfermagem.js`)
  e aviso de **reavaliação vencida**. Append-only, com autoria congelada.
- **🛏️ Lesão por pressão (LPP) com POA:** o marcador **presente na admissão ×
  adquirida na unidade** — base do indicador limpo de LPP adquirida. Estágio (NPUAP),
  localização, evolução.
- **⚙️ Cortes editáveis pelo ADM Master:** os pontos de corte de cada escala
  (`enf_escala_faixas`) são editáveis na tela (botão na aba Escalas); cada faixa nasce
  **"em validação"** — a equipe valida contra o protocolo do HNSN. Os subitens das
  escalas são fixos; só os cortes se ajustam.
- **📊 Mapa de risco por leito (Giro de Leitos → Mapa de risco):** semáforo por leito
  ocupado (Braden/Morse/flebite/LPP), ordenado do mais grave ao menos grave, com a
  **LPP adquirida** puxando o leito para o topo. Agregador puro `src/clinico/mapa-risco.js`.
- **Competência COFEN respeitada** (`papeis.js`): técnico aplica escalas e notifica LPP;
  a SAE (diagnóstico/prescrição de enfermagem, privativa do enfermeiro) vem na **Fase 1b**.
- Migração `migracao-enf-escalas-lpp.sql` (3 tabelas), já rodada no demo e no HNSN.
  **406 testes** + build verdes.

## 🆕 Novidades da v46 (desde a v45 — PR #33): triagem obstétrica por discriminadores

- **🤰 Fase 3 (obstétrica) — sugestão de Manchester por discriminadores:** na triagem
  **Obstétrica**, a sugestão automática (selo SUGERIDA) volta a funcionar, agora por
  **discriminadores** (sangramento, movimento fetal ausente/reduzido, perda de líquido,
  contrações) e pela **PA obstétrica** (pré-eclâmpsia: PA ≥ 140/90 já conta, ≥ 160/110
  é grave; **com sintoma** — cefaleia/epigastralgia/alteração visual — escala para
  iminência). A PA de adulto (hipotensão/crise) NÃO é usada aqui; os demais vitais
  (FR/FC/SpO₂/temp/AVPU) usam limiar de adulto. Continua sendo apoio: a enfermeira
  classifica. Motor puro e testável `src/clinico/obstetricia.js` (+17 testes).
- **⚙️ Tabela editável `ps_faixas_obstetricas` (só ADM Master):** cada discriminador →
  nível Manchester + os limiares de PA vivem numa tabela que **só o ADM Master** edita
  (botão "Editar critérios obstétricos" na tela Protocolo Manchester). Cada regra nasce
  **"em validação"** — a triagem avisa até o ADM Master validar. Migração
  `migracao-ps-faixas-obstetricas.sql` (tabela nova + seed de 9 regras), já rodada nos
  2 bancos. Os 3 sintomas de pré-eclâmpsia entraram no formulário sem migração (jsonb).
- **Com isto, a Fase 3 da triagem está completa:** adulto, **pediátrica** (v45) e
  **obstétrica** (v46) têm apoio à decisão adaptado — sempre como sugestão, com a
  decisão final da enfermeira.

## 🆕 Novidades da v45 (desde a v44 — PR #31): triagem pediátrica por idade

- **👶 Fase 3 (pediátrica) — sugestão de Manchester por faixa de idade:** na triagem
  **Pediátrica**, a sugestão automática (selo SUGERIDA) volta a funcionar, agora com
  faixas de **FC e FR por idade** (as de adulto não servem — FC 140 é normal em bebê
  e alarme em adulto). Continua sendo apoio: a enfermeira classifica. **PA fica de
  fora** (a unidade não mede PA em criança) e some do formulário pediátrico. Motor
  puro e testável `src/clinico/pediatria.js` (+22 testes).
- **⚙️ Tabela editável `ps_faixas_pediatricas` (só ADM Master):** os limites de FC/FR
  por faixa vivem numa tabela que **só o ADM Master** edita (botão "Editar faixas
  pediátricas" na tela Protocolo Manchester). Semeada com um rascunho tipo PALS/APLS;
  cada faixa nasce **"em validação"** — a triagem avisa isso até o ADM Master validar.
  Os números são corrigíveis na tela, sem depender de deploy. Migração
  `migracao-ps-faixas-pediatricas.sql` (tabela nova + seed), já rodada nos 2 bancos.
- **Ainda pendente:** Fase 3 **obstétrica** (discriminadores de risco) — exige
  validação clínica; segue com a sugestão automática desativada.

## 🆕 Novidades da v44 (desde a v43 — PR #29): renovação automática de sessão

- **🔑 Fim da enxurrada de "JWT expired":** o crachá de acesso do Supabase
  (`access_token`) vive ~1h e antes **nunca era renovado** — depois de uma tela
  aberta por mais de uma hora, TODA leitura do banco voltava 401 "JWT expired" e
  enchia a tela de alertas (um por tabela). Agora o `sbFetch`, ao receber esse 401,
  **renova o crachá sozinho** usando o `refresh_token` (que já ficava guardado) e
  **repete a chamada**, transparente. Várias tabelas carregando juntas disparam
  **uma só** renovação (single-flight). Se o renovador também expirou, aparece **um
  aviso limpo** na tela de login ("sua sessão expirou… nenhum dado foi perdido"), no
  lugar da enxurrada. Também renova de forma **proativa ao reabrir a aba** (cobre
  deixar a tela aberta o plantão — ou a noite — inteiros). Decisão pura e testável em
  `src/acesso/sessao.js` (+14 testes). **Sem migração** — é 100% no cliente.

## 🆕 Novidades da v43 (desde a v42 — PRs #26–#27): triagem por tipo + comorbidades

Duas fases da **reforma da triagem do PS** pedida pela enfermagem: trocar a digitação
de valores por seleção, e criar triagem específica para gestante e criança.

- **🩺 Fase 1 — Comorbidades na triagem (PR #26):** em vez de **digitar** valores de
  função renal/hepática, a triadora **marca comorbidades** de um catálogo curado
  (`src/clinico/comorbidades.js`). **DRC em diálise → função renal reduzida** e
  **hepatopatia → função hepática comprometida** passam a alimentar os **alertas de
  ajuste de dose** da farmácia **sem exigir o ClCr** (o motor `src/clinico/alertas.js`
  usa a comorbidade; o ClCr, agora **opcional**, ainda manda quando informado). As
  comorbidades aparecem na **TriagemModal** e no **Contexto clínico da Prescrição**.
  Migração `migracao-ps-comorbidades.sql` (coluna `comorbidades` jsonb em
  `ps_atendimentos`), já rodada no demo e no HNSN.
- **👶 Fase 2 — Tipo de triagem: Adulto / Obstétrica / Pediátrica (PR #27):** seletor
  no topo da TriagemModal. **Obstétrica** coleta IG, G/partos/cesáreas/abortos,
  movimentação fetal, sangramento, perda de líquido e contrações. **Pediátrica**
  coleta **peso** (vai para a coluna `peso` e **alimenta o cálculo de dose**) e idade
  em meses. **Decisão de segurança:** nos tipos obstétrica e pediátrica a **sugestão
  automática de Manchester (faixas de adulto) fica DESATIVADA** e a **enfermeira
  classifica** pelo protocolo específico — o software só **captura os dados**, não
  inventa risco obstétrico/pediátrico. Migração `migracao-ps-triagem-tipo.sql`
  (`triagem_tipo` + `obstetricia` + `pediatria` jsonb em `ps_atendimentos`), já rodada
  no demo e no HNSN.

**Pendente (Fase 3, opcional):** faixas/sugestões de risco **adaptadas** para gestante
e criança (PA de gestante; FC/FR normais por idade pediátrica) — só depois que a equipe
validar os critérios contra o protocolo do HNSN. Retoque leve deferido: **selo do tipo
de triagem** nas listas de trabalho ("Em atendimento"/fila).

## 🆕 Novidades da v42 (desde a v41 — PR #24)

- **✅ Aprovação de pedidos de compra pela matriz:** o pedido não vai mais direto
  ao fornecedor. O comprador monta (elaboração) → **"Enviar para aprovação"** → a
  **matriz** (perfil próprio) ou o ADM Master **aprova** ou **nega com motivo** →
  só o aprovado segue ao fornecedor; negado volta em **"Revisar"**. Nova aba
  **Aprovações** no Estoque (kanban Aguardando aprovação · Aprovado · Negado), card
  no dashboard e trilha da decisão (quem/quando/motivo). Perfil de acesso **"Matriz
  — Aprovação de Compras"**. Migração `migracao-suprimentos-aprovacao.sql` (colunas
  em `sup_pedidos`) + perfil em `migracao-perfis-acesso.sql`, já rodadas no HNSN.

## 🆕 Novidades da v41 (desde a v40 — PRs #21–#22)

- **🧪 BI de exames no PS (bloco 5 — jornada completa):** o relatório mensal do
  Pronto-Socorro passou a separar os exames em **Laboratorial × Imagem × Outro**
  (solicitados, % com resultado e **tempo médio até o resultado**), com KPI de
  **exames por atendimento** — na tela e no PDF. E o **desfecho avisa** quando o
  paciente tem exame aguardando resultado (banner + confirmação, não bloqueia).
  Regra pura testável `src/clinico/exames.js` (+8 testes). **Sem migração** — a
  categoria já era gravada em `ps_registros`. Com isso a **jornada do paciente
  (blocos 1–5)** está completa.
- **⚙️ Portas fixas no dev:** `npm run dev` = 5173 (hospital) e `npm run dev:demo`
  = 5174 (demo), com `strictPort` — o Vite recusa subir na porta errada em vez de
  escorregar em silêncio. Afeta só o ambiente de desenvolvimento.

## 🆕 Novidades da v40 (desde a v39 — PRs #10–#19)

- **🏥 PS — Checagem de medicação administrada (bloco 3 da jornada):** fecha o furo
  "dispensado ≠ administrado". Tabela `ps_administracoes` (append-only): doses dadas ×
  previstas, "não administrado" com motivo, categoria profissional, hora retroativa.
  Aba **Checagem** no atendimento + tela **Checagem de medicação** na barra EMERGÊNCIA
  (lista de trabalho da enfermagem, vermelho >1h) + selo nos cards.
  Migração `migracao-ps-checagem-medicacao.sql`.
- **🧪 Modo demo + banco de teste:** `npm run dev:demo` (banco separado
  `ufxqdvxhruaswuzhmxyf`), **faixa laranja** de ambiente e **seed de 60 pacientes**
  desenhados para disparar alertas clínicos. Motor de alertas extraído para módulo
  testável (`src/clinico/alertas.js`).
- **📋 PEP — Prontuário Eletrônico completo (fases 1–3):** admissão/episódio, anamnese,
  **prescrição com aprazamento e checagem**, **sinais vitais com NEWS**, **alergia como
  atributo** do paciente + log de acesso ao prontuário, **reconciliação medicamentosa** e
  **sumário de alta**. Prontuário do paciente internado. O código já nasce **fora do
  App.jsx** (`src/clinico/`, `src/prontuario/`, `src/acesso/`) com testes. Migrações
  `migracao-pep-*`.
- **🔐 Perfis de acesso por cargo:** 15 perfis-modelo (médico, enfermeiro, técnico,
  farmacêutico, recepção, almoxarifado, gestão, TI…) — o cargo vira um pacote de
  permissões por módulo, **por referência**. Catálogo em `src/acesso/modulos.js`,
  resolução pura em `permissoes.js`, exceções por usuário. **Organiza o menu; ainda
  NÃO é barreira de dado** (RLS por tabela é fase futura). Migração
  `migracao-perfis-acesso.sql`.
- **🔧 Refatoração:** utils puros extraídos do App.jsx (+50 testes) e as duas tabelas
  de Usuários fundidas.
- **🛏️ Bloco 4 — Avisar o NIR (regulação de leitos):** **selo de contagem no menu Giro
  de Leitos** (aparece de qualquer tela, colorido pela maior espera); fila de internação
  com **urgência em 3 níveis** (verde <2h · amarelo ≥2h · vermelho ≥4h), selo **"veio do
  PS"** e motivo da espera; botão **"Estou regulando"** (`visto_em`/`visto_por`) que
  separa "ninguém viu" de "em regulação"; `resolvido_em` ao sair da fila; e **perfil de
  acesso NIR**. `corEsperaFila` testável em `src/clinico/leitos.js`. Migração
  `migracao-leitos-nir-regulacao.sql`. **Todas as migrações da v40 já rodadas no HNSN.**

## O que já está pronto neste ponto
- **Login seguro** (Supabase Auth) + permissões por papel + auditoria. Banco trancado por RLS.
- **Atendimentos** por especialidade, com sincronização entre computadores.
- **Giro de Leitos — Fase 1:** painel de leitos (livre/ocupado/interditado), internação
  (iniciais+prontuário, CID, diária de AIH), previsão de alta e sinaleira 🟢🟡🔴.
- **Giro de Leitos — Fase 2:** fluxo de higienização com cronômetro, tempos de
  solicitado/disponibilizado/pronto/entrada e painel 📊 de indicadores.
- **Sugestão de dias por CID** (tabela de referência editável).
- **Multi-hospital:** mesmo código serve vários hospitais, cada um com seu banco
  (isolamento físico). Nome por `VITE_HOSPITAL_*`. Ver [ONBOARDING.md](ONBOARDING.md).
- **Barra lateral:** especialidades agrupadas na aba **Ambulatório** (expansível).
- **Fase 3 — Modo claro/escuro** (botão 🌙/☀️, tema via CSS variables, salvo por navegador).
- **Fase 3 — Visão Geral = Centro de Monitoramento:** ocupação global, giro, permanência,
  **alertas por setor** (com fila + "restringir"), **fila de solicitações de leito**
  (origem→destino, tempo de espera) e metas das especialidades. Setores geridos em
  Giro de Leitos → 🏷️ Setores; cada leito tem um seletor de setor.
- **💊 Tratamento sugerido por CID:** cada referência de CID pode ter um texto de
  tratamento (base na literatura, revisado pela equipe). Aparece no 📚 Referências
  de CID e no modal de internação ao digitar o CID. 8 CIDs pré-preenchidos no HNSN.
- **⏳ Fila de espera separada da ocupação:** a lista de espera por leito não conta
  mais na % de ocupação do setor; aparece como selo âmbar com tempo de espera.
- **🦠 Aba SCIH — Fase A:** precauções/isolamentos (aéreo/contato/gotículas, base
  Anvisa/CDC), sinalização de isolamento por leito (selo + seletor no card),
  cadastro de casos de vigilância (cultura, germe, multirresistente, antibiótico,
  dias de ATB) com contagem de dias.
- **🦠 Aba SCIH — Fase B:** base de germes (🧬) com embasamento literário; ao digitar
  o germe no caso, sugere o isolamento e marca multirresistente. 14 germes pré-carregados.
- **🦠 Aba SCIH — Fase C:** alternador Vigilância | Indicadores. Lançamento mensal
  manual (exames, culturas, higiene de mãos, PAV, cirurgias limpas+ISC, antimicrobiano
  DOT, treinamentos), taxas calculadas automaticamente, tendência dos últimos meses
  e relatório do mês (imprimir/PDF) para a CCIH.
- **✨ Rebrand VALENTRAX (Healthcare Operations):** nova marca "Inteligência para o
  fluxo hospitalar" — logo hub de correntes convergindo no núcleo, login corporativo
  azul-marinho, cabeçalho com hospital à direita, favicon/título novos e relatórios
  assinados pela Valentrax.
- **✨ Identidade interna corporativa:** tema escuro em azul-marinho e claro em
  cinza-frio; ícones SVG de linha na barra lateral (sem emojis decorativos no app);
  paleta de gráficos categórica validada por script (contraste + daltonismo):
  teal/azul/âmbar/índigo/rosé; botões secundários neutros; cores de status
  (verde/âmbar/vermelho) reservadas para semântica real.
- **🏥 Pronto-Socorro (1º módulo do HIS por processos):** chegada → triagem com
  classificação de risco Manchester (guia embutido) → fila por prioridade com
  cronômetro contra o tempo-alvo (alerta de estouro) → atendimento → desfecho.
  Triagem coleta **sinais vitais** (PA, FC, FR, SpO2, temp, dor, AVPU, glicemia) e
  **sugere a classificação automaticamente** pelos discriminadores (selo SUGERIDA;
  decisão final da triadora; aviso pediátrico <13 anos desativa a sugestão).
  Reavaliação com histórico de aferições (ps_sinais append-only, sugerida × escolhida)
  e indicadores do dia (distribuição por cor, % no tempo-alvo, matriz sóbria).
  Desfecho "Internação" abre a solicitação de leito
  automaticamente — primeira
  **jornada do paciente ponta a ponta**: PS → fila → leito → alta → higienização.
  Indicadores: porta→triagem, permanência média, atendidos hoje. Testado e validado.
- **🏥 Pronto-Socorro REFORMULADO (barra lateral dupla + salas + protocolo):**
  o módulo ganhou **barra lateral própria com dois blocos**, no padrão Farmácia:
  - **TRIAGEM:** Painel de Triagem · Classificar Paciente · Fila de Espera ·
    Reavaliação · Protocolo Manchester · Indicadores.
  - **EMERGÊNCIA (PS):** Painel da Emergência · Em atendimento · Leitos
    detalhados · Transferências · Aguardando leito · Assistente IA.
  - **Manchester adaptado do HNSN:** nomenclatura oficial da unidade
    (Imediato 0min · Rápido 10min · Breve 60min · Moderado 120min · Não
    prioritário 240min) nos cards, no guia e na triagem. Aba **Protocolo**
    com material didático: 5 cards por nível (sinais/discriminadores e
    conduta), 6 discriminadores gerais e a escala AVPU. As faixas de sinais
    vitais mostradas são as mesmas que o motor usa para sugerir.
  - **Painel:** 6 cards de risco compactos numa linha (5 cores + aguardando
    classificação) com **tempo-alvo** e selo de **fora do alvo**; faixa de
    segurança; rosca da distribuição do dia; e a seção do PS com 6 KPIs
    (em atendimento, aguardando, leitos ocupados, **óbitos**, tempo médio de
    permanência, atendidos) + Pacientes em Atendimento e Mapa de Salas lado a
    lado e Encaminhamentos em largura total.
  - **🛏️ Mapa de vagas do PS (`ps_salas`)** no modelo Giro de Leitos: 24 vagas
    por área (Sala Vermelha 3 · Laranja 3 · AVC 5 · Isolamento AQUARIO+GUARIDA ·
    Pediatria 2+1 iso · Observação 3 · Procedimento 3 · PCR 2), com status
    disponível/ocupado/limpeza/manutenção, alocação de paciente e cronômetro.
    ⚠️ **Regra de censo (`conta_censo`):** observação, procedimento, PCR e
    isolamento infantil são **retaguarda provisória** e **NÃO entram nos 75
    leitos do hospital** — contam só no panorama do PS. 15 no censo · 9 de
    retaguarda. O mapa exibe os dois grupos separados e marca a retaguarda com "R".
  - **Transferências** com via **Vaga Zero / GERINT / contato direto**, escolhida
    no desfecho e contabilizada no painel.
  - **Card de desfechos** separando **óbito no PS (antes de internar)** de
    **óbito após internação** — fontes diferentes, não somar.
  - **Protocolos institucionais** (`ps_protocolos`): biblioteca com busca e
    **cadastro próprio** (título, categoria, passos, referência).
  - **Assistente IA local** do PS + busca rápida **Ctrl+K** nas telas de lista.
  - **Estoque na prescrição:** ao prescrever, selo **SEM ESTOQUE / estoque baixo**
    e botão **similares com saldo** (mesmo princípio ativo ou classe); aviso ao
    assinar. A baixa continua na dispensação da Farmácia (momento correto).
  - Migrações: `supabase/migracao-ps-salas.sql` e `-ps-salas-censo.sql`
    (rodadas no HNSN em 2026-07-21).
  - **🔗 Jornada do paciente auditada e costurada (blocos 1 e 2):**
    - **Origem da chegada** (`ps_atendimentos.origem` / `origem_detalhe`):
      Meios próprios · SAMU · Transalva · Polícia Militar · Bombeiros ·
      **GERINT (aceite)** com a unidade (PA Torres, Arroio do Sal, Três
      Cachoeiras, outra). Selo na fila + seção **Procedência** nos Indicadores
      (base da pactuação regional).
    - **Prontuário obrigatório** na recepção — era opcional e quebrava o rastro.
    - **Elo forte PS → fila → leito** por `ps_atendimento_id` em
      `solicitacoes` e `leitos`. Antes o vínculo era pelo número do prontuário
      como TEXTO: se viesse vazio ou digitado diferente, o paciente sumia da
      tela "Aguardando leito". Prontuário fica só como reserva.
    - **Categoria profissional na evolução** (`ps_registros.categoria`, sem
      migração): Médica · Enfermagem · Técnico · Fisio · Outro, com selo no
      registro e rótulo correto na linha do tempo do Paciente 360 — antes tudo
      era rotulado "Evolução médica" mesmo escrito por enfermeiro/técnico.
    - Migração: `supabase/migracao-ps-origem-elo.sql` (rodada no HNSN em 2026-07-21).
- **💊 Farmácia — Fase A (catálogo + estoque):** módulo próprio com catálogo de
  medicamentos (princípio ativo, classe terapêutica, forma, unidade, estoque mínimo,
  marcação de **Controlado / Portaria 344**), controle de estoque **por lote e
  validade (FEFO)** — entradas (lote, validade, quantidade, nota) e saídas com baixa
  automática, sem deixar o saldo ficar negativo. **Kardex imutável** (histórico de
  todos os movimentos), **alertas de reposição** (abaixo do mínimo/zerado) e de
  **validade** (vencidos ou vencendo em ≤30 dias). Tela **agrupada por classe** com
  filtro. Catálogo inicial com **~164 medicamentos em 22 classes** já carregado
  (só catálogo, sem estoque).
- **💊 Farmácia — Fase B (prescrição estruturada + dispensação):** a prescrição do
  Pronto-Socorro virou **estruturada** — o médico monta itens escolhendo do catálogo
  (dose/posologia, via, quantidade) e **assina** (registro clínico imutável). A
  Farmácia ganhou a aba **Dispensação**: fila de pacientes do PS com itens pendentes,
  baixa de estoque **por lote (FEFO)** respeitando o saldo, com o paciente vinculado
  ao movimento; e **dispensação avulsa** (paciente/setor digitados, ex.: internado).
  Cada item mostra o status **pendente / parcial / dispensado**.
- **💊 Farmácia — Fase C (indicadores):** aba **Indicadores** (só leitura) com KPIs do
  mês (itens/quantidade dispensada, entradas, perdas por vencimento, rupturas, lotes
  vencendo ≤30d), **curva ABC** do consumo por medicamento (A 80% / B 15% / C 5%),
  consumo por classe terapêutica, **controlados dispensados** (Portaria 344), painel
  de validade & rupturas e **relatório mensal imprimível/PDF**. Valores por quantidade
  (sem custo financeiro cadastrado). **Módulo Farmácia completo (A+B+C).**
- **💊 Farmácia Clínica — Fase 1 (motor de alertas, estilo NoHarm.ai):** apoio à
  decisão que analisa a prescrição estruturada do PS. **Contexto clínico** do paciente
  (idade, peso, ClCr/TFG, função hepática, alergias, sonda, gestante) na aba Prescrição.
  Prescrição estruturada com **dose (valor + unidade + frequência + duração)**. Motor
  gera **7 tipos de alerta** por gravidade (alta/média/baixa): **duplicidade** (princípio
  ativo/grupo), **dose máxima diária**, **tempo de tratamento**, **sonda (não triturar)**,
  **inapropriado idoso (Beers)**, **inapropriado criança** e **alergia + reatividade
  cruzada** (betalactâmicos, sulfonamidas, AINEs). Ao prescrever um medicamento a que o
  paciente é alérgico, o sistema **bloqueia** exigindo confirmação do prescritor. Alertas
  ao vivo na aba Prescrição + sub-aba **Farmácia → Análise clínica** (com selo de alérgico
  por paciente). **Base de conhecimento editável** por medicamento (~50 pré-carregados de
  Beers/pediatria/dose máx/sonda — para validação da equipe). É apoio à decisão, não
  certificado.
- **💊 Farmácia Clínica — Fases 2 e 3 (interações, incompatibilidade em Y, ajuste
  renal/hepático):** completa os **9 tipos de alerta** (estilo NoHarm.ai). **Interação
  medicamentosa** (base `farm_interacoes` com gravidade grave/moderada/leve; ~27 pares
  clássicos) e **incompatibilidade em Y** (base `farm_incompat_y`; ~14 pares; só quando
  ambos IV) — as substâncias casam por princípio ativo, nome **ou grupo** (ex.: um par
  "opioide × benzo" cobre a classe toda). **Editor curável** "Base de interações" na
  Análise clínica. **Ajuste de posologia por função renal (ClCr/TFG) e hepática** — alerta
  quando o paciente tem função reduzida e o medicamento tem orientação de ajuste (~45
  medicamentos pré-carregados; editável por medicamento). Tudo apoio à decisão, base
  sujeita a validação da equipe.
- **💊 Dispensação priorizada + Score + filtros (estilo NoHarm):** a fila de
  dispensação é **priorizada por gravidade** (cor Manchester) e **score**, com um
  **Score de prescrição 0–3** por paciente e por item (0 boa → 3 ruim), calculado
  **localmente e de graça** a partir da base clínica (dose, frequência e alertas).
  Barra de **filtros completa**: busca (iniciais/prontuário), situação (Manchester),
  status (pendentes/dispensados), score mínimo, **tipo de alerta** (alergia, interação,
  incompatibilidade em Y, dose máxima, duplicidade, tempo, sonda, idoso, criança,
  ajuste renal/hepático), **só controlados** e ordenação (prioridade/score/nome/chegada).
  Cada card mostra os chips dos alertas presentes.
- **💊 Fluxo de preparo com notificação sonora:** ao assinar a prescrição no PS, ela
  entra no ciclo **aguardando farmácia → em preparo → pronto → retirada** (tabela
  `farm_preparo`). Nova aba **Farmácia → Preparo** (quadro): a farmácia **recebe**
  (🔔 bipe + aviso), **separa** (baixa de estoque), **marca pronto** (🔔 avisa o posto)
  e a enfermagem **confirma a retirada**. Banner no topo do **Pronto-Socorro** lista as
  medicações **prontas para retirada** com bipe e botão Retirar. Botão **"Ativar som"**
  por computador (áudio local via WebAudio, sem depender de arquivo). Avisos por
  polling (~12s), sem custo. Itens prescritos **sem quantidade** também podem ser
  dispensados (a farmácia digita a quantidade, sugerida pela dose).
- **💊 Custos por paciente:** cada medicamento tem **custo unitário (R$)** editável
  (Estoque → Editar). Os **Indicadores** ganharam KPI de **custo dispensado no mês**,
  **ranking de custo por paciente** e coluna de **custo na curva ABC**; o card da
  Dispensação mostra o custo já dispensado do paciente. (Modelo por custo unitário do
  medicamento — dá pra evoluir para custo por lote/compra.)
- **💊 Livro de controlados (Portaria 344):** aba **Controlados** com **saldo, balanço
  mensal** (saldo inicial · entradas · saídas · saldo final) e **livro de movimentação**
  (saldo corrente linha a linha, com paciente/documento/usuário) dos medicamentos
  marcados como Controlado; **balanço imprimível/PDF**. Sem migração — apura do histórico.
- **💊 Medicamentos não padronizados (trazidos pela família):** aba própria para
  **registrar e controlar** medicamentos **fora do catálogo** que o paciente/família
  traz — recebimento (paciente, medicamento, apresentação, quantidade, lote/validade,
  quem trouxe), **conferência** pelo farmacêutico e status **recebido → em uso →
  devolvido/descartado**, com busca e filtro.
- **💊 Intervenção farmacêutica (estilo NoHarm):** identifica o problema, propõe a
  conduta e acompanha o **desfecho** (pendente → aceita / não aceita → resolvida).
  Alimentada pelos alertas do motor (botão **Intervir** já preenche o registro) ou
  manual. KPIs (pendentes, aceitas, **taxa de aceitação**).
- **💊 Farmácia reformulada (barra lateral própria, cores Valentrax):** ao entrar na
  Farmácia abre uma **barra lateral interna** com ícones (turquesa/azul/cinza):
  **Dashboard** (visão geral com atalhos), **Prescrições**, **Solicitações**,
  **Dispensações**, **Intervenção**, **Estoque**, **Interações**, **Controlados**,
  **Não padronizados**, **Relatórios & BI**, **Assistente AI**.
  - **Estoque** ganhou **previsão de demanda (7 dias)**: consumo médio dos últimos 30
    dias → cobertura em dias, demanda prevista e **sugestão de compra**; painel de
    **previsão de ruptura**.
  - **Relatórios & BI**: **Top 5 medicamentos do mês** + **prescrições por status**
    (aguardando/preparo/pronto/retirado), além de curva ABC, custos e PDF.
  - **Assistente AI**: assistente **local e gratuito** (chat por palavras-chave) que
    responde sobre o setor a partir dos dados — pendências, o que vai faltar em 7 dias,
    mais usados, custos por paciente, controlados, validade, alertas e intervenções.
    Nada é enviado para fora.
- **💊 Refino — aviso ao prescritor no PS + assistente ampliado:** quando o
  farmacêutico registra uma **intervenção**, ela aparece num **banner no
  Pronto-Socorro** (problema + conduta sugerida) para o paciente ainda no PS; o
  médico responde **aceita / não aceita** ali mesmo (fecha o ciclo, com bipe).
  Casa por `atendimento_id` ou prontuário — sem tabela nova. O **Assistente AI**
  da Farmácia ganhou intents: **panorama** do setor, **zerados**, **consumo por
  classe**, **dispensações do mês/hoje**, **tamanho do catálogo**, **validade
  detalhada** (lista de lotes vencendo) e saudações.
- **🛏️ Giro de Leitos REFORMULADO (Fases 1–5 + Modo TV, sem migração de banco):**
  módulo com **barra lateral própria** (padrão Farmácia): Dashboard, Mapa de leitos,
  Fila de internação, Pacientes, Altas, Transferências ext., Internações,
  Relatórios & BI, Alertas inteligentes, IA Assistente.
  - **Dashboard:** KPIs (ocupação global, disponíveis, aguardando internação, altas
    previstas 24h, permanência média, **giro vs mês anterior**, fator de utilização),
    mini-mapa por setor, tempos de giro (solicitado→disp→pronto→entrada), desempenho
    por setor e **previsão de vagas 24/48h**.
  - **Mapa de leitos:** cards corporativos (faixa de acento, selo, badges), **chips de
    setor** na ordem fixa (Emergência, AVC, Posto 1–3, Psiquiatria, UTI) — clicar mostra
    só o setor; "Todos" empilha. **6 status**: livre/ocupado/higienização/**reservado/
    manutenção/bloqueado externo**/interditado + botão **Transferir** (externa).
  - **Listas:** fila com cronômetro + vagas previstas no destino; censo de pacientes;
    altas; transferências (desfecho=transferencia, destino no motivo); internações.
  - **Relatórios & BI:** KPIs com Δ vs mês anterior, gráficos (saídas 12m, permanência,
    ocupação por setor, tempos de giro) e **relatório imprimível/PDF** Valentrax.
  - **Alertas inteligentes** (local): ocupação crítica, alta vencida/próxima,
    higienização demorada, setor lotado, fila parada e **leito livre com fila**.
  - **IA Assistente** local/grátis (panorama, vagas previstas, ocupação por setor…).
  - **Inteligência:** **reserva automática do PS** (desfecho Internação reserva o leito;
    "✓ Chegou — internar" fecha o ciclo com tempo real) e **média real de permanência
    por CID** (aprende do histórico) no modal de internação.
  - **📺 Modo TV:** painel de parede tela cheia somente leitura (tiles por setor, KPIs,
    vagas previstas, alertas, fila), atualização automática a cada 60s, sai com Esc.
  - **✅ Alta segura (Kanban):** checklist de pendências por paciente (liberação clínica,
    exames, receita, sumário, família, transporte, serviço social) + turno previsto;
    3 colunas (internado → preparando alta → pronto para alta) que se movem sozinhas;
    limpa na alta. Guarda em `leitos.alta_pendencias` (JSON) e `leitos.alta_periodo`.
  - **🎯 Metas por setor:** meta de ocupação/permanência/giro cadastráveis (Setores);
    farol verde/vermelho no BI pela ocupação atual × meta.
  - **⏳ Motivo da espera na fila:** categoria de gargalo por solicitação (sem vaga,
    aguardando limpeza/exame/família/transporte, regulação) + resumo de gargalos.
  - **Migração:** `supabase/migracao-leitos-kanban-metas.sql` (rodada no HNSN em 2026-07-19).
- **📋 Paciente 360 (embrião do prontuário eletrônico):** busca por prontuário/iniciais,
  cadastro mínimo (LGPD), linha do tempo automática agregando PS + internações +
  altas + SCIH + evoluções, alertas sentinela, evoluções multiprofissionais
  imutáveis (sem UPDATE/DELETE no banco) com ditado por voz (pt-BR) e **resumo de
  passagem de plantão** gerado localmente (gratuito, dados não saem do navegador;
  versão IA dormante em supabase/functions). Testado.
- **🔪 Bloco Cirúrgico (completo, A+B+C):** salas com reserva e detecção de conflito,
  agenda com materiais/OPME, mapa cirúrgico do dia, check-in, checklist de Cirurgia
  Segura da OMS (Sign In/Time Out/Sign Out com itens oficiais), tempos cirúrgicos,
  RPA com cronômetro, cancelamento com motivo padronizado e indicadores (ocupação
  de salas, taxa/motivos de cancelamento, produtividade por cirurgião, adesão ao
  checklist). Testado e validado.
- **🛏️ Giro de Leitos — permanência/giro POR SETOR + altas antes das 10h:** a saída
  do leito passa a gravar o **setor** (`leitos_saidas.setor`); o BI de Metas por setor
  ganhou **farol com dados reais** (ocupação atual × meta, permanência e giro do mês
  por setor) e um KPI novo **"Altas antes das 10h"** (hora em que o leito vagou).
  Migração `supabase/migracao-leitos-saida-setor.sql` (rodada no HNSN em 2026-07-20).
- **👤 Gestão de usuários pelo ADM Master (na própria conta):** a aba **Usuários**
  agora permite ao `adm_master` **criar** usuário (nome, login, perfil, senha),
  **editar o perfil** (papel) inline, **redefinir a senha** de qualquer um e
  **ativar/desativar** o acesso (bloqueio reversível — não apaga histórico). Feito
  com segurança via **Edge Function `admin-usuarios`** (roda no servidor com a
  service_role; valida o JWT e confere que o chamador é `adm_master`). Nenhuma chave
  de administrador vai para o navegador. Usuários não-master seguem com lista
  somente-leitura + trocar a própria senha. **Sem migração de banco.** Requer o
  deploy da função: `supabase functions deploy admin-usuarios` (`deploy-funcao.bat`).
- **📦 Estoque & Compras (Suprimentos) — Fases A e B:** módulo novo com barra
  lateral própria (padrão Farmácia) para o **almoxarifado geral** — materiais
  médico-hospitalares, EPI, higiene, escritório, impressos, rouparia, nutrição,
  manutenção, informática e laboratório.
  - **Fase A:** catálogo agrupado por categoria (busca + filtro), estoque **por
    lote e validade** (entradas com NF e fornecedor; saídas com motivo e setor,
    sem saldo negativo), **kardex imutável**, painéis de reposição/validade,
    **previsão de demanda 7 dias com sugestão de compra** e cadastro de
    **fornecedores** (razão social, CNPJ, contato, o que fornece).
  - **Fase B:** **requisições de materiais pelos setores** (setores vêm do
    cadastro do Giro de Leitos) — quadro *aguardando → em separação → pronto →
    entregue* com cronômetro, **bipe** na chegada (padrão preparo da Farmácia),
    **baixa FEFO automática** na separação (kardex `REQ-<nº>` com setor de
    destino) e atendimento **parcial** quando falta saldo (selo PARCIAL,
    atendido/pedido). Histórico à parte.
  - **Seed:** catálogo inicial com **~120 materiais em 10 categorias** carregado
    no HNSN (insere por nome — seguro rodar de novo). Testado e validado.
  - **Fase C — Compras:** pedidos por fornecedor com itens de **material E
    medicamento** no mesmo pedido (custo unitário e total em R$, entrega
    prevista), botão **⇩ importar sugestão de compra** (traz o que a previsão
    de demanda diz que acaba em 7 dias, do almoxarifado E da Farmácia), ciclo
    *em elaboração → enviado → parcial → recebido* e **recebimento com entrada
    automática** no estoque certo (material no kardex do almoxarifado com
    fornecedor; medicamento no kardex da Farmácia), com NF/lote/validade por
    item e recebimento em várias vezes. Testado e validado.
  - **Fase D — Relatórios & BI + Assistente:** aba **Relatórios & BI** com
    seletor de mês, 8 KPIs (consumo qtd/custo, entradas/gasto em compras,
    perdas, requisições entregues, rupturas, validade), rankings de **top
    materiais, consumo por setor, por categoria e gasto por fornecedor**,
    **curva ABC por custo de consumo** e **relatório mensal imprimível/PDF**
    Valentrax; e aba **Assistente AI** local/gratuito (panorama, o que vai
    faltar, zerados, validade, consumo/gasto do mês, requisições, pedidos,
    fornecedores, saldo por nome — nada sai do navegador). Sem migração.
    **Módulo Estoque & Compras completo (A+B+C+D).**
  - **💼 Painel Executivo:** visão financeira do estoque **almoxarifado +
    Farmácia** — capital parado (saldo × custo), **capital liberável** (excesso
    acima de 30 dias de cobertura + mínimo, com a lista de onde está),
    **economia vs mês anterior** (compras), **perdas por vencimento** com % de
    redução, **rupturas previstas em 7 dias** (MAT+MED), **medicamentos que
    mais custam por paciente** e **consumo por setor em R$ com Δ%** (vermelho
    >10% = investigar desperdício). Critérios transparentes no rodapé; local e
    sem migração. Indicadores comparativos ganham significado a partir do 2º
    mês de uso.
  - **⏰ Vencimentos inteligentes:** aba própria com manchete ("Existem X
    unidades vencendo em 30 dias — R$ Y em risco"), faixas vencido/≤30d/
    31–90d/**não serão consumidos a tempo** (cruza lote × consumo médio) e
    **ação sugerida** por lote (consumir FEFO, priorizar/remanejar, baixa,
    devolução). Materiais + medicamentos.
  - **📈 Estoque preditivo:** aba com previsão item a item — "no ritmo atual
    acaba em ~N dias" com data prevista, situação (crítico/atenção/ok), busca,
    filtro MAT/MED e sugestão de compra.
  - **💼 Painel Executivo ampliado:** **mapa hospitalar** (card por setor com
    consumo R$, Δ%, requisições e item mais consumido), **simulador
    financeiro** ("e se aumentarmos antibióticos em 30%?" → capital
    adicional + cobertura antes/depois, alerta >90d) e **fármacos
    monitorados** (constante SUP_FARMACOS_MONITORADOS: morfina, fentanil,
    alteplase, tenecteplase, contraste, albumina — saídas, custo, % de uso,
    pacientes, saldo, selo P.344). Tudo sem migração.
  - **🔢 Inventário cíclico + 💰 custo médio ponderado + 📷 código de barras:**
    aba **Inventário** com fila de contagem rotativa por curva ABC (A=7d, B=30d,
    C=90d), **contagem cega** (revela a diferença só após conferir), ajuste
    automático no kardex e KPI de **acuracidade do estoque (%)** — que aparece
    em destaque no Painel Executivo. O custo passa a entrar **na entrada e no
    recebimento de compra** e o sistema recalcula o **custo médio ponderado
    móvel** (materiais e medicamentos). **Código de barras** no cadastro (leitor
    USB) com busca por código no Estoque e no Inventário. Migração
    `supabase/migracao-suprimentos-inventario.sql` (rodada no HNSN em 2026-07-21).
  - **🛡️ Confiança dos dados + 🎯 ponto de pedido + ✅ Ações de hoje (3 melhorias):**
    (1) **selo de confiança** no Painel Executivo (% com custo, inventariado 90d,
    código de barras — diz o quanto confiar nos R$); (2) **ponto de pedido
    inteligente** — campo **prazo de entrega por fornecedor** (`lead_time_dias`),
    "comprar agora" dispara quando a cobertura cai abaixo do prazo + margem (3d),
    cada material herda o prazo do último fornecedor (padrão 15d), sugestão de
    compra cobre o prazo de reposição, e **alerta de demanda instável** (↑/↓)
    quando o consumo recente destoa da média; (3) aba **Ações de hoje** — lista
    priorizada (rupturas, comprar, vencimentos, requisições, recebimentos,
    contagens) com atalho para cada ferramenta. Migração
    `supabase/migracao-suprimentos-ponto-de-pedido.sql` (rodada no HNSN em 2026-07-21).
  - **📄 Importar NF-e (XML):** botão no Estoque lê o XML da nota, extrai fornecedor,
    NF e itens, **casa com o catálogo** (código de barras ou nome), deixa revisar
    (qtd/custo/lote/validade, criar material novo ou pular) e **lança as entradas
    em lote** — atualiza o custo médio ponderado e **cadastra o fornecedor** se o
    CNPJ for novo. Tudo local (o XML não sai do navegador). Sem migração.
  - **💱 Cotação de compra:** aba **Cotações** — cria cotação (fornecedores a
    comparar + itens), **matriz preço × fornecedor** que destaca o mais barato de
    cada item (verde) e o total por fornecedor (✓ no melhor que cotou tudo; ⚠ nos
    parciais); **gera pedido** pelo *melhor preço por item* (divide entre
    fornecedores) ou *fornecedor único*, alimentando a aba Compras. Pesa preço ×
    prazo de entrega (lead time no cabeçalho). Migração
    `supabase/migracao-suprimentos-cotacao.sql` (rodada no HNSN em 2026-07-21).
  - **Migrações:** `supabase/migracao-suprimentos-faseA.sql`, `-faseB.sql`,
    `-faseC.sql` e `-seed.sql` (rodadas no HNSN em 2026-07-20).

## Como VOLTAR para este ponto (restaurar)

### Reverter o código para o checkpoint
```bash
git fetch --tags
git reset --hard checkpoint-v51
git push --force-with-lease origin main
```
Em ~1 min a Vercel republica os dois sites neste estado. ⚠️ Descarta o que foi feito
*depois* do checkpoint (é o objetivo de "voltar").

### Sem apagar nada — branch a partir do checkpoint
```bash
git fetch --tags
git checkout -b recuperacao checkpoint-v51
```

## ⚠️ Importante: código ≠ dados
Este checkpoint salva o **código**. Ele **não** desfaz alterações nos **dados**
(atendimentos, leitos), que ficam no Supabase. Para proteger os dados, faça
**backup do banco** — ver a pasta local `backups/` (peça "faz um backup dos dados").

## Pendências conhecidas (não urgentes)
- Equipe médica revisar os 8 textos de tratamento por CID (editáveis no 📚).
- **Reclassificar a equipe** nos perfis de acesso (hoje quase todos no perfil
  "Provisório", que mantém o acesso antigo); só então desativar o Provisório.
- **O controle de acesso organiza o menu, ainda NÃO restringe o dado** — apertar o
  RLS por tabela (com modo sombra + quebra-vidro) é fase futura. Ver docs/CONTEXTO.md.
- ✅ **Resolvido (2026-07-21):** registros de teste do AQUARIO removidos do HNSN
  (3 em `leitos_saidas`, 2 em `leitos_turnover` e o leito ocupado fake em `leitos`).
  Investigação do bug de fuso do Adauam confirmou **nenhum dado real corrompido**
  (ambulatório e altas íntegros); os únicos flagrados eram esses fakes do AQUARIO.

## Marcos incluídos (mais recentes no topo)
- `53e73ed` 🧹 Limpeza dos dados de teste do demo (dois passos; trava colada em cada DELETE)
- `a5057ad` 🔗 Unificação de prontuário — o ponteiro (não move dado clínico; recusa gêmeos)
- `ff25c36` 🩺 Idade da mãe — aviso sobre VÍNCULO trocado, nunca bloqueia
- `5e3b234` 🔍 Separada a causa da falha: "não consegui perguntar" ≠ "a resposta é nenhuma"
- `1bac906` 📤 Transmissão da remessa — `faturada` deixa de ser estado inalcançável
- `4a83f75` 🗺️ Código IBGE do município, capturado do CEP (some se a cidade mudar)
- `2cc307a` 🧩 Quatro pontas soltas do Atendimento (piso do cadastro, Remarcadas, cancelamento, CEP)
- `343e1d2` 📺 Painel de chamada da sala de espera
- `24ba410` ✅ Aprovação de pedidos de compra pela matriz (aba Aprovações + perfil matriz)
- `b2c22f2` 🧪 Bloco 5 — BI de exames (lab × imagem) no relatório do PS + aviso de exame pendente no desfecho
- `83a864d` ⚙️ Portas fixas por ambiente no dev (5173 hospital / 5174 demo, strictPort)
- `cf0c0db` 🛏️ Bloco 4 — avisar o NIR (fila com urgência, "Estou regulando", perfil NIR)
- `b0f03ca` 🔧 refactor — utils puros extraídos do App.jsx (+50 testes) + fusão das tabelas de Usuários
- `7387471` 🔐 Perfis de acesso por cargo — 15 perfis-modelo (menu por perfil)
- `0b3ca06` 📋 PEP fase 3 — reconciliação medicamentosa + sumário de alta
- `50c45fb` 📋 PEP fase 2 — categoria profissional, criar prescrição e anamnese
- `a185896` 📋 PEP fase 1 — prontuário do internado, alergia como atributo, log de acesso
- `c53eae6` 🧪 Modo demo (npm run dev:demo) + faixa de ambiente + seed de 60 pacientes
- `ef41ea6` 🧪 Motor de alertas clínicos extraído para módulo testável (+29 testes)
- `2a3945c` 🗄️ Script de reconstrução do banco + gerador da auditoria versionado
- `7dbbde1` 🏥 PS — checagem de medicação administrada (bloco 3 da jornada)
- `32374f8` 🔗 PS — categoria profissional na evolução (médica/enfermagem/técnico)
- `ba1966a` 🔗 PS — origem da chegada + prontuário obrigatório + elo forte PS→fila→leito
- `0338a54` 🏥 PS — ajustes de layout (cards iguais, encaminhamentos em largura total)
- `198de71` 🏥 PS — KPIs compactos (leitos ocupados, óbitos, tempo médio de permanência)
- `f6bd24d` 🏥 PS — card de desfechos separando óbito no PS × pós-internação
- `76231ca` 🏥 PS — bloco EMERGÊNCIA (6 abas, mapa com regra de censo, transferências, assistente, protocolos)
- `692465f` 🏥 PS — barra lateral TRIAGEM + Protocolo Manchester didático
- `e0c011e` 🏥 PS — painel em duas seções (Triagem / Pronto-Socorro)
- `127f599` 💊 Estoque na prescrição do PS (sem estoque + similares)
- (PRs do Adauam) 📊 relatório mensal do PS · 🔍 auditoria ampliada · 🐛 falhas de banco visíveis
- `9d6fe93` 💱 Cotação de compra (matriz preço × fornecedor, gera pedido do vencedor)
- `7ac79d7` 📄 Importar NF-e (XML) no estoque (entradas em lote, casamento por código/nome, custo médio)
- `fc3da31` ✅ Painel "Ações de hoje" (lista priorizada de tarefas do almoxarifado)
- `47f7097` 🎯 Ponto de pedido inteligente (lead time por fornecedor + demanda instável)
- `ea49925` 🛡️ Selo de confiança dos dados no Painel Executivo
- `9d259f3` 🔢💰📷 Inventário cíclico (contagem cega ABC + acuracidade) + custo médio ponderado + código de barras
- (PRs do Adauam) 🐛 fix de fuso horário em datas + regra única de estoque; 📄 docs de fluxo de equipe
- `426e90d` ⏰📈 Vencimentos inteligentes + Estoque preditivo + Executivo ampliado (mapa por setor, simulador, fármacos monitorados)
- `1360d0f` 💼 Painel Executivo — capital parado/liberável, economia, perdas, rupturas, custo por paciente, setores c/ Δ
- `cd0fe03` 📦 Suprimentos Fase D — Relatórios & BI + assistente local (módulo completo)
- `e2d54be` 📦 Suprimentos Fase C — pedidos de compra (mat+med, sugestão da previsão, recebimento parcial c/ entrada automática)
- `b988721` 📦 fix: seed de suprimentos insere por nome
- `bef3892` 📦 Suprimentos Fase B — requisições dos setores (bipe, baixa FEFO, parcial) + seed ~120 materiais
- `6c79e27` 📦 Suprimentos Fase A — catálogo de materiais + estoque por lote/validade + fornecedores
- `86e7ed9` 👤 Gestão de usuários pelo ADM Master (Edge Function admin-usuarios)
- `c9d325b` 🛏️ Giro de Leitos — permanência/giro por setor + altas antes das 10h (migração leitos-saida-setor)
- `38982b3` 🛏️ Kanban de alta + Metas por setor + Motivo da espera (migração leitos-kanban-metas)
- `a60428d` 🛏️ Modo TV (painel de parede) + refresh automático 60s
- `cb53386` 🛏️ Fase 5 — previsão de vagas 24/48h, média real por CID, reserva automática do PS, alerta leito livre com fila
- `68351ae` 🛏️ Mapa detalhado com seletor de setor (chips)
- `cb3aece` 🛏️ Ordem fixa de setores + cards de leito corporativos
- `4aaa0fe` 🛏️ Fase 4 — alertas inteligentes + IA assistente local
- `544dc90` 🛏️ Fase 3 — Relatórios & BI (gráficos, Δ mensal, PDF)
- `65e7fde` 🛏️ Fase 2 — fila, pacientes, altas, transferências, internações
- `b02afea` 🛏️ Fase 1 — barra lateral + KPIs + mapa por setor + status novos
- `dbecfaf` 💊 Refino — aviso ao prescritor no PS + assistente com mais respostas
- `22af34d` 💊 Farmácia Fase 4 — assistente local (perguntas sobre o setor)
- `8198b38` 💊 Farmácia Fase 3 — BI (top 5 do mês + prescrição por status)
- `4e7dde2` 💊 Farmácia Fase 2 — previsão de demanda 7 dias no Estoque
- `997ef54` 💊 Farmácia Fase 1 — barra lateral própria + Dashboard
- `384b419` 💊 Aba Intervenção farmacêutica (estilo NoHarm)
- `6332c94` 💊 Livro de controlados (Portaria 344) + medicamentos não padronizados
- `fa2dde5` 💊 Custos por paciente (custo unitário por medicamento)
- `fa6f510` 💊 fix: dispensação de itens sem Qtd + "dispensado" falso + match de lote
- `d72fd9a` 💊 Fluxo de preparo da farmácia com notificação e bipe
- `5fdd520` 💊 Filtros de prescrição estilo NoHarm na dispensação
- `4c3a6a8` 💊 Dispensação priorizada + score de prescrição 0–3
- `9ad2b65` 💊 Farmácia Clínica Fase 3 — ajuste de posologia renal/hepática
- `fbc7d7b` 💊 Farmácia Clínica Fase 2 — interações medicamentosas + incompatibilidade em Y
- `0a70c95` 💊 Farmácia Clínica — alerta de alergia + reatividade cruzada (bloqueio na prescrição)
- `b6dcb15` 🩺 fix: salvar contexto clínico do PS com feedback
- `a2a0db7` 💊 Farmácia Clínica Fase 1 — motor de alertas (Beers, dose máx, sonda, duplicidade)
- `0c1c782` 💊 Farmácia Fase C — indicadores (consumo, curva ABC, controlados, relatório)
- `c26001b` 💊 Farmácia Fase B — prescrição estruturada no PS + dispensação (fila + avulsa, baixa por lote)
- `6b14d10` 💊 Farmácia — classe terapêutica + catálogo agrupado (~164 medicamentos, 22 classes)
- `c62dc56` 💊 Farmácia Fase A — catálogo + estoque (lote/validade, kardex FEFO)
- `4ebd602` 🩺 Desfecho do PS — médico, alocação de leito vago, contabilização (óbitos, evasão por médico)
- `536bb14` 🩺 Painel de atendimento médico no PS (evolução, prescrição, exames)
- `329e8dc` 🚑 Pacote triagem — aviso pediátrico, reavaliação com histórico, indicadores
- `a01445b` 🚑 Triagem com sinais vitais + sugestão automática de Manchester
- `ab00284` 🔪 Bloco Cirúrgico Fase C — indicadores (ocupação, cancelamentos, produtividade)
- `0a48ef5` 🔪 Bloco Cirúrgico Fase B — check-in, checklist OMS, tempos, RPA
- `8ccf7b8` 🔪 Bloco Cirúrgico Fase A — agenda, mapa por sala, cancelamentos
- `d832105` 📋 Resumo de passagem de plantão gratuito (local) no Paciente 360
- `45472e5` 📋 Paciente 360 — registro clínico integrado (timeline + evoluções + voz)
- `c6d1c0d` 🏥 Pronto-Socorro — triagem Manchester + jornada do paciente
- `dc8b5a9` 🎨 paleta de gráficos profissional validada
- `225b70e` 🎨 rebrand profundo — paleta marinho + interface sem emojis
- `82e2604` ✨ rebrand Valentrax — marca, login, cabeçalho, favicon
- `0aebdf9` 🦠 SCIH Fase C — indicadores mensais + dashboard + relatório
- `2678bdd` 🦠 SCIH Fase B — base de germes com embasamento + sugestão de isolamento
- `8852264` 🦠 SCIH Fase A — isolamentos por leito + casos de vigilância
- `1d97345` ⏳ fila de espera separada da ocupação do setor
- `9b4ca54` 💊 Tratamento sugerido por CID (referências + modal de internação)
- `baabe17` Fase 3 pt2 — Centro de Monitoramento (setores, solicitações, alertas)
- `ebc40d3` Fase 3 pt1 — modo claro/escuro
- `39bba1a` aba "Ambulatório" expansível · `cb71266` Giro de Leitos Fase 2
- `4753e82` multi-hospital · `e65ea2f` sugestão de CID · `cb8b7a7` Giro de Leitos Fase 1
- (histórico completo: `git log`)
