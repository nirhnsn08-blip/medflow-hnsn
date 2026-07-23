# Requisitos legais e normativos do Prontuário Eletrônico do Paciente (PEP)

**Projeto:** Valentrax — módulo PEP
**Contexto:** hospital de pequeno porte, Rio Grande do Sul. Time de 2 pessoas.
**Data da pesquisa:** julho de 2026
**Objetivo:** ser correto do ponto de vista legal sem construir complexidade desnecessária.

> **Aviso.** Este documento é levantamento técnico, não parecer jurídico. Onde há divergência
> de interpretação entre normas, isso está declarado explicitamente em vez de resolvido.
> Antes de decisões que envolvam eliminação de papel ou responsabilidade civil/ética,
> valide com assessoria jurídica e com o Diretor Técnico do hospital.

---

## 0. Mapa das normas efetivamente aplicáveis

Levantadas e conferidas no texto oficial, salvo onde indicado.

| Norma | Assunto | Situação |
|---|---|---|
| **Lei 13.787/2018** | Digitalização, guarda, armazenamento e manuseio de prontuário | Vigente. É **lei federal** — prevalece sobre resolução de conselho |
| **Lei 13.709/2018 (LGPD)** | Proteção de dados pessoais; dado de saúde é sensível | Vigente |
| **Lei 14.063/2020** | Assinaturas eletrônicas (simples / avançada / qualificada), inclusive em saúde | Vigente |
| **Decreto 12.560/2025** | Regulamenta a RNDS e as Plataformas SUS Digital (arts. 47 e 47-A da Lei 8.080/90) | Vigente |
| **CFM 1.638/2002** | Define prontuário médico; conteúdo mínimo; Comissão de Revisão de Prontuários | Vigente |
| **CFM 1.821/2007** | Digitalização e sistemas informatizados; NGS1/NGS2; guarda | Vigente, **modificada** pela CFM 2.218/2018 (revogou o art. 10) |
| **CFM 2.218/2018** | Revogou o art. 10 da CFM 1.821/2007 (selo de qualidade CFM+SBIS) | Vigente |
| **CFM 2.299/2021** | Emissão de documentos médicos eletrônicos | Vigente desde 25/12/2021 |
| **COFEN 736/2024** | Processo de Enfermagem (revogou a COFEN 358/2009 — fim do termo "SAE") | Vigente |
| **COFEN 754/2024** | Prontuário eletrônico e plataformas digitais na Enfermagem (revogou a COFEN 429/2012) | Vigente |
| **Portarias GM/MS 8.025 e 8.026/2025** | Modelos de Sumário de Alta (SA) e Sumário de Alta Obstétrico (SAO) na RNDS | Vigentes |

**Normas que aparecem em blogs mas NÃO estão em vigor** — ver seção ARMADILHAS:

- **CFM 1.639/2002** — revogada expressamente pelo art. 11 da CFM 1.821/2007. É a origem
  da famosa regra de "backup a cada 24 horas / mínimo 3 cópias". **Não citar como norma vigente.**
- **CFM 1.331/1989** — revogada pela CFM 1.821/2007, art. 11.
- **COFEN 358/2009** e **COFEN 429/2012** — revogadas em 2024.

---

## 1. OBRIGATÓRIO

Requisitos com base normativa expressa. Cada linha diz o que o software precisa fazer.

### 1.1 Conteúdo e estrutura do registro

| # | Requisito | Norma que exige | O que significa na prática para o software |
|---|---|---|---|
| O-01 | **Identificação completa do paciente** | CFM 1.638/2002, art. 5º, I, "a" | Campos obrigatórios no cadastro: nome completo; data de nascimento (dia, mês e **ano com 4 dígitos**); sexo; **nome da mãe**; naturalidade (município **e** estado); endereço completo (via, número, complemento, bairro/distrito, município, estado, CEP). O "nome da mãe" e a "naturalidade" são os campos mais esquecidos — são exigidos pelo texto |
| O-02 | **Anamnese, exame físico, exames solicitados e resultados, hipóteses diagnósticas, diagnóstico definitivo e tratamento efetuado** | CFM 1.638/2002, art. 5º, I, "b" | O modelo de dados do atendimento precisa comportar esses blocos. Não precisa ser um formulário rígido — precisa ser registrável e recuperável |
| O-03 | **Evolução diária com data e hora**, discriminação de todos os procedimentos e **identificação do profissional que os realizou** | CFM 1.638/2002, art. 5º, I, "c" | Toda evolução carrega timestamp e autor. `data_hora`, `autor_id`, `conselho` (CRM/COREN + UF) obrigatórios e não-nulos. O texto diz "assinados eletronicamente quando elaborados e/ou armazenados em meio eletrônico" |
| O-04 | **Registro de atendimento emergencial sem anamnese possível** | CFM 1.638/2002, art. 5º, I, "e" | Precisa existir um caminho de registro que não exija anamnese preenchida, mas force relato completo dos procedimentos. Não bloquear o fluxo de emergência com validação de campo obrigatório |
| O-05 | **Registro de enfermagem no prontuário** é dever do profissional | COFEN 754/2024, art. 1º | Enfermagem precisa de acesso de escrita ao prontuário, com identificação própria (COREN), não "por baixo" do login do médico |
| O-06 | **Documentação das 5 etapas do Processo de Enfermagem** no prontuário | COFEN 736/2024, arts. 4º e 8º | Etapas: Avaliação → Diagnóstico → Planejamento → Implementação → **Evolução** de Enfermagem. Art. 8º: documentação "formalmente no prontuário do paciente, físico ou eletrônico, cabendo ao Enfermeiro o registro de todas as suas etapas" |
| O-07 | **Separar Anotação de Enfermagem (técnico/auxiliar) de Diagnóstico e Prescrição de Enfermagem (privativos do enfermeiro)** | COFEN 736/2024, arts. 6º e 7º | Controle de acesso por papel, não só por usuário. Técnico/auxiliar: Anotação de Enfermagem + checagem de cuidados prescritos, sob supervisão. Enfermeiro: privativamente Diagnóstico e Prescrição de Enfermagem. O software **não pode** permitir que técnico registre diagnóstico ou prescrição de enfermagem |
| O-08 | **Dados obrigatórios em documentos médicos eletrônicos** (prescrição, atestado, relatório, solicitação de exames, laudo, parecer técnico) | CFM 2.299/2021, arts. 1º e 2º | Todo documento emitido deve conter: nome do médico, **CRM e endereço**; **RQE** quando houver especialidade vinculada; nome do paciente **e número de documento legal**; data e hora; assinatura digital. O "endereço do médico" e o "RQE" são os campos tipicamente esquecidos |

### 1.2 Assinatura e autoria

| # | Requisito | Norma que exige | O que significa na prática para o software |
|---|---|---|---|
| O-09 | **Autenticação individual** de cada usuário; senha individual e intransferível | COFEN 754/2024, art. 2º, §2º; CFM 1.821/2007 (por remissão ao NGS do Manual SBIS) | Sem login compartilhado, sem "usuário recepção". Um usuário = uma pessoa física, vinculada a um registro de conselho quando aplicável |
| O-10 | **Assinatura digital ICP-Brasil com NGS2** para emissão de documentos médicos eletrônicos (prescrição, atestado, laudo, relatório, solicitação de exame, parecer) | CFM 2.299/2021, art. 4º | Se o Valentrax emitir receita/atestado/laudo, precisa integrar assinatura ICP-Brasil e o documento deve ser validável pelo ITI ou pelo validador do CFM (art. 4º, parágrafo único). **Ver ARMADILHA A-04: isso não é o mesmo que exigir ICP-Brasil em cada evolução de enfermaria** |
| O-11 | **Assinatura eletrônica avançada OU qualificada** para documentos eletrônicos subscritos por profissionais de saúde | Lei 14.063/2020, art. 5º (redação sobre saúde) | A lei federal admite os dois níveis. Ver ARMADILHA A-05 sobre o conflito com a CFM 2.299/2021 |
| O-12 | **Paperless (eliminar o papel) só com NGS2** | CFM 1.821/2007, arts. 3º e 4º; COFEN 754/2024, art. 2º, §§1º e 4º | Regra dura: enquanto o sistema não atender integralmente ao NGS2, **o hospital não está legalmente autorizado a deixar de imprimir**. A CFM 1.821/2007, art. 4º, é explícito: NGS1 sozinho "não autoriza a eliminação do papel, por falta de amparo legal" |
| O-13 | **Se não houver assinatura qualificada, imprimir e assinar fisicamente** (enfermagem) | COFEN 754/2024, art. 2º, §3º | Consequência operacional direta do O-12. O software precisa gerar impressão legível com nome do profissional + número de inscrição no conselho, para assinatura física |
| O-14 | Certificado digital para assinatura, quando a instituição adota PEP, **é ônus da instituição, não do profissional** | COFEN 754/2024, art. 4º | Não desenhar fluxo que dependa do enfermeiro comprar o próprio certificado. Para autônomo/liberal a responsabilidade é dele (parágrafo único) |

### 1.3 Guarda, retenção e eliminação

| # | Requisito | Norma que exige | O que significa na prática para o software |
|---|---|---|---|
| O-15 | **Guarda mínima de 20 anos a partir do último registro** | Lei 13.787/2018, art. 6º | O relógio conta do **último registro**, não da data de criação nem da alta. Precisa existir um campo derivado `ultimo_registro_em` por paciente/prontuário para calcular elegibilidade de descarte. Ver ARMADILHA A-01 sobre a "guarda permanente" |
| O-16 | **Eliminação só após análise obrigatória de comissão permanente de revisão de prontuários e avaliação de documentos** | Lei 13.787/2018, art. 3º; CFM 1.821/2007, arts. 2º e 9º | Não implementar rotina de purga automática. Descarte precisa ser um **ato deliberado, registrado e atribuído** a uma decisão da comissão. Se houver a função, ela exige aprovação humana e trilha |
| O-17 | **Comissão de Revisão de Prontuários é obrigatória** na instituição, coordenada por médico | CFM 1.638/2002, arts. 3º e 4º | Não é requisito de software, é requisito do hospital — mas o software deve oferecer o que a comissão precisa para trabalhar: amostragem, relatórios de completude, prontuários com pendências |
| O-18 | **Disponibilidade permanente e fornecimento de cópias autênticas ao paciente ou representante legal** | CFM 1.638/2002 (considerandos e art. 5º, II); CFM 1.821/2007 (considerandos); COFEN 754/2024 (considerandos); LGPD art. 18 | Precisa existir função de **exportar o prontuário completo** do paciente em formato legível e íntegro. Isso é funcionalidade de produto, não relatório improvisado |
| O-19 | **Responsabilidade formal pelo prontuário** (médico assistente, chefias, direção técnica) | CFM 1.638/2002, art. 2º | Modelar `diretor_tecnico` / responsável pelo estabelecimento. A CFM 2.299/2021, art. 3º, §1º, reforça: a guarda é responsabilidade compartilhada com o diretor técnico |

### 1.4 Digitalização de papel (se o hospital for digitalizar acervo antigo)

| # | Requisito | Norma que exige | O que significa na prática para o software |
|---|---|---|---|
| O-20 | Digitalização deve assegurar **integridade, autenticidade e confidencialidade**, e **reproduzir todas as informações** do original | Lei 13.787/2018, art. 2º; CFM 1.821/2007, art. 2º, §1º | Sem recorte, sem "só as páginas relevantes". Hash/checksum do arquivo digitalizado no momento da captura |
| O-21 | Uso de **certificado ICP-Brasil "ou outro padrão legalmente aceito"** no processo de digitalização | Lei 13.787/2018, art. 2º | A expressão "ou outro padrão legalmente aceito" é textual na lei e dá margem que a resolução do CFM não dá |
| O-22 | Arquivos digitalizados controlados por **sistema especializado (GED)** com base de dados própria, **indexação pesquisável** e conformidade ao NGS2 | CFM 1.821/2007, art. 2º, §2º, "a" a "c" | Se for digitalizar: precisa de metadados de indexação e busca eficiente, não uma pasta de PDFs |

### 1.5 LGPD — dado de saúde é dado sensível

| # | Requisito | Norma que exige | O que significa na prática para o software |
|---|---|---|---|
| O-23 | **Base legal correta: tutela da saúde**, em procedimento realizado por profissionais de saúde, serviços de saúde ou autoridade sanitária | LGPD, art. 11, II, "f" (dado de saúde é sensível por força do art. 5º, II) | **Não pedir consentimento para tratar dados assistenciais.** Ver ARMADILHA A-06. O consentimento é a base errada e cria obrigação de honrar a revogação |
| O-24 | **Vedado compartilhar dado de saúde para obter vantagem econômica** | LGPD, art. 11, §4º | Nenhuma integração de marketing, analytics de terceiros com dado identificável, ou venda de base. Cuidado com SDK de terceiros no front-end |
| O-25 | **Atender direitos do titular**: confirmação de tratamento, acesso, correção, portabilidade, informação sobre compartilhamento | LGPD, art. 18 | Precisa de um caminho operacional. Resposta em formato simplificado imediata, ou declaração completa em até 15 dias (LGPD, art. 19, II) |
| O-26 | **Medidas de segurança técnicas e administrativas** aptas a proteger de acessos não autorizados | LGPD, arts. 46 a 49 | Criptografia em trânsito (TLS) e em repouso; controle de acesso por perfil; gestão de incidentes. Comunicação de incidente relevante à ANPD e ao titular |
| O-27 | **Controle de acesso por perfil**, com nível de segurança distinto entre informação administrativa e informação clínica | COFEN 754/2024, art. 6º; LGPD art. 46 | Recepção/faturamento **não** deve ver evolução clínica. Isso é requisito normativo expresso, não boa prática opcional |
| O-28 | **Trilha de auditoria** de acesso e alteração | Derivado: requisitos NGS1 do Manual de Certificação SBIS (recepcionado pela CFM 1.821/2007, art. 1º) + LGPD art. 46 | Ver ARMADILHA A-03 sobre a natureza dessa obrigação. Eventos mínimos praticados no NGS1: criação, consulta, inativação de registros; importação/exportação; impressão; acesso de emergência; tentativas de autenticação com e sem sucesso; troca de senha; realização e validação de assinatura digital, e suas falhas |
| O-29 | **Registro imutável** — corrigir sem apagar | Decorre de CFM 1.638/2002, art. 5º (evolução com autoria e hora) + valor probatório do prontuário (Lei 13.787/2018, art. 4º) | **`UPDATE` destrutivo e `DELETE` em registro clínico são proibidos na prática.** Retificação vira novo registro que referencia e supera o anterior; o original permanece recuperável. Este é o requisito de maior impacto arquitetural |

---

## 2. DESEJÁVEL / FUTURO

| # | Requisito | Norma / origem | O que significa na prática para o software |
|---|---|---|---|
| D-01 | **Certificação SBIS de S-RES** (selo) | Voluntária. O art. 10 da CFM 1.821/2007, que previa o selo CFM+SBIS, foi **revogado pela CFM 2.218/2018** | Ver ARMADILHA A-02. Atender os **requisitos** NGS2 é o que tem efeito legal; comprar o **selo** é prova formal, útil em licitação e em litígio, mas não é exigência legal |
| D-02 | **Integração com a RNDS** | Decreto 12.560/2025; Portarias GM/MS 8.025 e 8.026/2025 (Sumário de Alta e Sumário de Alta Obstétrico) | Tende a virar obrigatório. Ver seção 3 e ARMADILHA A-08. Já desenhar o modelo de dados pensando em **Sumário de Alta** estruturado poupa retrabalho |
| D-03 | **Padrão FHIR** nas estruturas de saída | RNDS usa FHIR | Não precisa adotar FHIR internamente. Precisa conseguir **projetar** para FHIR quando chegar a hora. Manter uma camada de serialização separada do modelo interno |
| D-04 | **Terminologias padronizadas** (CID-10, TUSS, CBHPM, SNOMED CT) | Interoperabilidade / faturamento | CID-10 já é praticamente obrigatório para faturamento SUS e ANS. SNOMED CT pode esperar |
| D-05 | **Encarregado (DPO) e Relatório de Impacto (RIPD)** | LGPD, arts. 38 e 41 | A indicação de encarregado é obrigação da **instituição**, não do software. A ANPD admite tratamento proporcional para agentes de pequeno porte, mas hospital tratando dado sensível em volume dificilmente se enquadra como isento. **Confirmar com jurídico** |
| D-06 | **MFA / segundo fator** | Boa prática; não localizei exigência expressa em norma de saúde | Alto retorno para baixo custo. Priorizar para perfis com acesso amplo (admin, diretor técnico) |
| D-07 | **Assinatura digital em lote / carimbo de tempo** | Eficiência operacional | Se e quando adotar ICP-Brasil, assinar documento a documento inviabiliza o plantão |
| D-08 | **Apoio à decisão clínica, alertas de interação medicamentosa** | Estágios 2 e 3 da certificação SBIS | Fora de escopo para time de 2 pessoas. Registrar como visão de longo prazo |
| D-09 | **Portal do paciente** com acesso ao próprio prontuário | Facilita LGPD art. 18 e CFM 1.638/2002 (cópias autênticas) | Reduz carga operacional de atender pedidos manualmente. Só depois de O-18 estar sólido |
| D-10 | **Anonimização/pseudonimização para pesquisa e indicadores** | LGPD, art. 12 | Dado anonimizado sai do escopo da LGPD. Útil para dashboards de gestão sem expor identificação |

---

## 3. RNDS — situação atual (leia com atenção, há incerteza aqui)

**O que está confirmado:**

- O **Decreto 12.560, de 23 de julho de 2025**, dispõe sobre a Rede Nacional de Dados em Saúde
  e as Plataformas SUS Digital, regulamentando os arts. 47 e 47-A da Lei 8.080/1990. Ele eleva
  a RNDS a infraestrutura oficial de interoperabilidade do ecossistema de dados em saúde, de
  abrangência nacional, e determina que as plataformas dos entes federativos sejam
  interoperáveis com a RNDS.
- A **Portaria GM/MS 6.656, de 7 de março de 2025**, estabelece obrigatoriedade e periodicidade
  de envio de dados de **Regulação Assistencial no âmbito do SUS**, usando o modelo MIRA. Admite
  que o envio seja feito por "sistemas de prontuário eletrônico devidamente integrados à RNDS".
- As **Portarias GM/MS 8.025 e 8.026, de 27 de agosto de 2025**, instituem os modelos de
  informação do **Sumário de Alta Obstétrico (SAO)** e do **Sumário de Alta (SA)** no âmbito da RNDS.
  Pelo que apurei, o SA/SAO realizado em meio eletrônico deve seguir os padrões da portaria e ser
  enviado regularmente ao Ministério da Saúde.
- Existem obrigações setoriais específicas já consolidadas e claramente compulsórias
  (ex.: notificação de resultados de exames de COVID-19 — Portarias GM/MS 1.792/2020 e 1.046/2021).

**O que NÃO consegui confirmar e portanto declaro como incerto:**

- **Se existe hoje obrigação geral, autoexecutável e com prazo definido, de um hospital privado
  ou filantrópico de pequeno porte no RS enviar rotineiramente atendimentos à RNDS.** Fontes
  secundárias afirmam que há obrigação para "União, estados, municípios, hospitais privados e
  filantrópicos" de subir informações à RNDS e ao Meu SUS Digital, mas **não localizei o
  dispositivo primário com essa redação, nem prazo de exigibilidade, nem sanção**. Não consegui
  abrir o texto integral do Decreto 12.560/2025 nem das Portarias 8.025/8.026 (o portal do
  Planalto e o do Ministério da Saúde recusaram as requisições).
- **Se o SA/SAO é exigível de todo estabelecimento hospitalar ou apenas de estabelecimentos
  SUS/contratualizados**, e a partir de quando.

**Recomendação prática:** tratar a RNDS como **"quase certo no médio prazo, não bloqueante hoje"**.
Se o hospital atende SUS — o que é o caso típico de hospital de pequeno porte no interior do RS —
a exposição é maior e o assunto deve ser confirmado diretamente com a Secretaria Estadual de
Saúde do RS e com o gestor municipal, que são quem cobra na prática. Confirmar antes de
dimensionar esforço.

---

## 4. Certificação SBIS/CFM — NGS1 e NGS2

### O que são

O **Manual de Certificação para Sistemas de Registro Eletrônico em Saúde (S-RES)** foi aprovado
pelo art. 1º da CFM 1.821/2007. Ele define dois **Níveis de Garantia de Segurança**:

- **NGS1** — segurança da informação: controle de versão do software, controle de acesso e
  autenticação, disponibilidade, comunicação remota, **trilha de auditoria** e documentação.
- **NGS2** — **NGS1 + assinatura digital ICP-Brasil**. É o nível que permite o prontuário
  100% digital.

Eventos que o NGS1 exige na trilha de auditoria (lista útil para modelar a tabela de log):
criação, duplicação, consulta, inativação de registros do RES; importação e exportação de dados;
impressão de registros; solicitação de **acesso de emergência**; registro ou alteração de termos
de consentimento; criação/inativação/alteração de regras de apoio à decisão; tentativas de
autenticação com e sem sucesso; troca de senha; realização e validação de assinatura digital;
falha na realização ou validação de assinatura digital; registro de solicitação de esquecimento.

### É obrigatório?

**Não.** A certificação (o selo) é **voluntária**. Dois pontos importantes:

1. O art. 10 da CFM 1.821/2007, que atribuía ao CFM e à SBIS a expedição do selo de qualidade,
   foi **revogado pela Resolução CFM 2.218/2018**, em razão do encerramento do convênio CFM/SBIS.
   A SBIS mantém o programa de certificação por conta própria.
2. **O que tem efeito legal é atender aos requisitos do NGS2, não possuir o selo.** A CFM
   1.821/2007, arts. 3º e 4º, condiciona a eliminação do papel ao **atendimento integral aos
   requisitos** do NGS2 — não à posse do certificado.

**Incerteza declarada:** não localizei tabela pública e atual de custos e prazos do processo de
certificação SBIS. A CFM 1.639/2002 (revogada) previa que a certificação fosse **revalidada a
cada nova versão do sistema** — se essa regra persistir no programa atual da SBIS, ela é
economicamente proibitiva para um produto em desenvolvimento contínuo com time de 2 pessoas.
**Confirmar diretamente com a SBIS antes de orçar.**

---

## 5. ARMADILHAS

Coisas que são rotineiramente mal interpretadas — inclusive por fornecedores e consultorias.

### A-01. "Prontuário eletrônico tem guarda permanente"

A CFM 1.821/2007, art. 7º, estabeleceu guarda **permanente** para prontuários arquivados
eletronicamente, em meio óptico, microfilmado ou digitalizado — e 20 anos para papel (art. 8º).

Mas a **Lei 13.787/2018, art. 6º**, é posterior e superior hierarquicamente, e diz que **decorrido
o prazo mínimo de 20 anos a partir do último registro, os prontuários em suporte de papel E os
digitalizados poderão ser eliminados**.

**Interpretação majoritária:** a lei uniformizou em 20 anos e superou a "guarda permanente" da
resolução. **Incerteza:** o CFM não republicou a 1.821/2007 harmonizando o art. 7º, e há quem
sustente que o dever ético do médico permanece mais amplo. **Na dúvida, guardar é sempre seguro;
eliminar é que é o ato de risco.** Para o software: não construa purga automática. Prevaleça
sempre o prazo mais longo, e trate descarte como decisão humana registrada.

### A-02. "Precisamos da certificação SBIS para ter PEP"

Falso. É voluntária, e o convênio CFM/SBIS que a sustentava juridicamente foi encerrado
(CFM 2.218/2018, revogando o art. 10 da CFM 1.821/2007). Vendedores usam isso como argumento
de venda. O que importa juridicamente é **atender aos requisitos NGS2** se e quando o hospital
quiser abandonar o papel.

### A-03. "A lei exige log de leitura do prontuário"

**Não existe artigo de lei que diga literalmente "registre quem leu o prontuário".** A obrigação
é **derivada**, e vem de três lugares que se somam:

1. Requisitos NGS1 do Manual de Certificação (recepcionado pela CFM 1.821/2007, art. 1º), que
   listam "consulta" de registros entre os eventos auditáveis;
2. LGPD, art. 46, que exige medidas aptas a proteger contra acesso não autorizado — sem log você
   não consegue nem detectar nem provar;
3. **Ônus da prova.** Em processo ético ou judicial, quem não tem trilha não consegue demonstrar
   que o acesso foi legítimo.

Ou seja: é obrigatório na prática, mas por construção, não por artigo único. Não vale a pena
discutir isso — **implemente o log de leitura**, é barato e é a diferença entre conseguir e não
conseguir se defender.

### A-04. "Toda evolução precisa de assinatura ICP-Brasil"

Cuidado. A **CFM 2.299/2021, art. 1º**, tem uma lista **fechada** de documentos aos quais se
aplica: **prescrição, atestado, relatório, solicitação de exames, laudo e parecer técnico**.
**Evolução clínica e prontuário não estão nessa lista.** A resolução regula a *emissão de
documentos médicos eletrônicos* que circulam para fora — não cada linha do prontuário.

Além disso, a Lei 14.063/2020 contém uma exceção para **atos internos do ambiente hospitalar**,
que ficam fora da exigência de nível mínimo de assinatura.

**Incerteza declarada:** confirmei essa exceção por fontes secundárias consistentes (incluindo
orientação de conselho profissional), mas **não consegui abrir o texto primário do art. 5º da
Lei 14.063/2020** — o portal do Planalto recusou as requisições. **Confirmar a redação exata e o
parágrafo correto antes de tomar decisão de arquitetura baseada nela.**

Consequência de projeto, se confirmada: exigir ICP-Brasil em cada evolução de enfermaria é
sobre-engenharia cara e provavelmente desnecessária. Exigir em receita e atestado que saem pela
porta é obrigatório.

### A-05. Conflito real: Lei 14.063/2020 vs. CFM 2.299/2021

- **Lei 14.063/2020:** documentos eletrônicos subscritos por profissionais de saúde são válidos
  quando assinados com assinatura eletrônica **avançada OU qualificada**. Assinatura avançada
  admite certificados **fora** da ICP-Brasil (art. 4º).
- **CFM 2.299/2021, art. 4º:** exige assinatura digital gerada por certificados **ICP-Brasil com
  NGS2** — ou seja, apenas a **qualificada**.

**Isso é uma divergência real, não aparente.** Argumentos de cada lado: a lei é hierarquicamente
superior à resolução; por outro lado, o CFM tem competência para disciplinar a ética do exercício
profissional, e um médico que descumpre a resolução responde eticamente ainda que o documento
seja civilmente válido.

**Não afirmo qual prevalece.** Para o Valentrax: o caminho de menor risco é **suportar ICP-Brasil
para os documentos do art. 1º da CFM 2.299/2021** (receita, atestado, laudo, relatório, pedido de
exame, parecer) e não se prender a ela para registro interno. Confirmar com jurídico.

### A-06. "Vamos pedir consentimento LGPD do paciente para o prontuário"

Erro clássico e caro. A base legal para tratamento assistencial de dado de saúde é a **tutela da
saúde**, prevista no **art. 11, II, "f", da LGPD**, em procedimento realizado por profissionais de
saúde, serviços de saúde ou autoridade sanitária. **Não é consentimento.**

Se você usa consentimento como base, você cria para si a obrigação de honrar a **revogação** do
consentimento — e o paciente poderia, em tese, exigir que você pare de tratar dados que você é
**obrigado por lei a guardar por 20 anos** (Lei 13.787/2018, art. 6º). Você cria um conflito
insolúvel de graça.

Corolário: o direito de eliminação da LGPD **não se aplica** a dado cuja guarda é obrigação legal.
O software deve poder recusar pedido de exclusão com fundamento — e registrar essa recusa.

### A-07. "Backup a cada 24 horas e no mínimo 3 cópias"

Essa regra específica aparece em dezenas de blogs e materiais de fornecedor. Ela vem do **Anexo
da Resolução CFM 1.639/2002** — que foi **expressamente revogada pelo art. 11 da CFM 1.821/2007**.

**Não a cite como norma vigente.** Isso não significa que backup seja opcional: a obrigação atual
decorre da LGPD (art. 46), do requisito de disponibilidade do NGS1, e do dever de guarda por 20
anos, que é impossível de cumprir sem backup testado. A diferença é que **hoje não há número
mágico prescrito em norma** — você define o RPO/RTO e o documenta. Documentar a política é o que
protege.

Observação lateral: os parâmetros da resolução revogada (cópias em local fisicamente distante,
proteção contra acesso não autorizado, **testes periódicos de restauração**) continuam sendo
excelente engenharia. Use como referência técnica, não como citação normativa.

### A-08. "RNDS ainda não é obrigatório para a gente"

Talvez, mas o terreno está se movendo rápido (Decreto 12.560/2025, Portarias 6.656/2025 e
8.025-8.026/2025). Ver seção 3 e a incerteza declarada lá. O erro caro não é deixar a integração
para depois — é **modelar o prontuário de um jeito que impeça produzir um Sumário de Alta
estruturado no futuro**, obrigando reescrita.

### A-09. "SAE" não existe mais como termo normativo

A **COFEN 736/2024 revogou a COFEN 358/2009** e **eliminou o termo "Sistematização da Assistência
de Enfermagem (SAE)"**, mantendo apenas **"Processo de Enfermagem (PE)"**. Também substituiu
**"Histórico de Enfermagem"** por **"Avaliação de Enfermagem"**.

Se a UI do Valentrax disser "SAE" e "Histórico de Enfermagem", está usando vocabulário revogado.
A enfermagem do hospital ainda vai falar "SAE" no dia a dia por anos — considere aceitar como
sinônimo de busca, mas rotular corretamente.

### A-10. Digitalização ≠ prontuário nato-digital

São dois regimes jurídicos diferentes e as pessoas misturam:

- **Digitalizar papel existente** → Lei 13.787/2018, arts. 2º e 3º, e CFM 1.821/2007, art. 2º
  (GED, indexação, comissão antes de destruir o original).
- **Prontuário nascido digital** → CFM 1.821/2007, art. 3º (NGS2), CFM 1.638/2002 (conteúdo),
  COFEN 754/2024, Lei 14.063/2020.

O Valentrax é o segundo caso. Só entre no primeiro se o hospital realmente for digitalizar acervo
— é um subprojeto inteiro (scanner, GED, comissão, política de descarte) e não deve contaminar o
escopo do PEP.

### A-11. "O prontuário é do hospital" / "o prontuário é do paciente"

Ambos, em sentidos diferentes, e isso tem consequência de produto. Conforme os considerandos da
CFM 1.821/2007 e da COFEN 754/2024: o prontuário é **propriedade física da instituição**, a quem
cabe o **dever de guarda**; os **dados pertencem ao paciente**, e devem estar permanentemente
disponíveis para fornecimento de **cópias autênticas** quando ele ou seu representante legal
solicitar.

Tradução: o hospital **não pode** recusar cópia ao paciente, e **não pode** condicionar a entrega
a pagamento de dívida ou a alta administrativa. O software precisa tornar isso fácil, senão vira
atrito operacional que acaba em reclamação no CRM ou na ANPD.

---

## 6. RECOMENDAÇÃO PARA TIME PEQUENO

Premissa: 2 pessoas, hospital de pequeno porte. O erro que mata não é deixar requisito para
depois — é **escolher uma arquitetura que impede atender o requisito depois**. Priorize por
custo de reversão, não por urgência regulatória.

### Fase 1 — Fazer agora, é barato agora e caríssimo depois

Tudo aqui é decisão de **modelo de dados**. Mudar depois significa migração de dados clínicos
em produção, que é o pior tipo de migração que existe.

1. **Append-only para todo registro clínico (O-29).**
   Nenhum `UPDATE` destrutivo, nenhum `DELETE` em evolução, prescrição, anotação ou resultado.
   Retificação cria novo registro com ponteiro para o anterior (`substitui_id`) e motivo. A view
   "atual" é derivada. Isso é a **decisão arquitetural nº 1** e não tem volta se você errar.

2. **Autoria forte em toda linha clínica (O-03, O-09).**
   `autor_id`, `conselho_tipo` (CRM/COREN), `conselho_numero`, `conselho_uf`, `data_hora` (com
   timezone, em UTC no banco). **Congele o dado do conselho no momento do registro** — não faça
   join com a tabela de usuários na hora de exibir um registro de 2027, porque o profissional
   pode ter mudado de número, de nome ou ter saído do hospital.

3. **Trilha de auditoria desde o primeiro commit (O-28, A-03).**
   Tabela única `auditoria`: `quem, quando, o_que (entidade+id), acao (create/read/update/print/
   export), ip, user_agent, resultado`. **Inclua leitura.** Escrever isso no início custa um dia;
   retroalimentar depois é impossível — o histórico perdido não volta.

4. **Controle de acesso por papel, com clínico separado de administrativo (O-07, O-27).**
   Papéis mínimos: médico, enfermeiro, técnico/auxiliar de enfermagem, recepção/administrativo,
   diretor técnico, admin de sistema. Regra dura já no dia 1: técnico não registra Diagnóstico
   nem Prescrição de Enfermagem (COFEN 736/2024, arts. 6º e 7º). Se você está no Supabase, isso é
   RLS, e RLS retroativa em base povoada é sofrimento.

5. **Campos obrigatórios da CFM 1.638/2002, art. 5º (O-01).**
   Especialmente **nome da mãe** e **naturalidade (município + estado)** — são os que faltam em
   90% dos cadastros e são exigidos pelo texto. Acrescentar coluna depois é fácil; **preencher
   retroativamente 4.000 pacientes é que não é.**

6. **Base legal LGPD correta: tutela da saúde, não consentimento (O-23, A-06).**
   Custa zero implementar corretamente e evita um beco sem saída jurídico.

### Fase 2 — Próximos meses

7. **Exportação do prontuário completo do paciente (O-18, O-25).**
   Atende simultaneamente ao dever de fornecer cópias autênticas (CFM 1.638/2002) e ao direito de
   acesso da LGPD (art. 18). Um PDF íntegro e paginado já resolve. Alta relação valor/esforço.

8. **Política de backup escrita + teste de restauração (A-07).**
   Não há número mágico em norma vigente. O que protege é **ter política documentada e testes de
   restauração comprovados**. Se está no Supabase, entenda exatamente o que o plano contratado
   cobre — PITR não vem em todo plano — e documente RPO/RTO.

9. **Fluxo de emergência sem travas (O-04).**
   Registro que não exija anamnese completa, mas que force relato dos procedimentos. E **acesso
   de emergência ("quebra-vidro") logado**, que é evento auditável previsto no NGS1.

10. **Campos dos documentos médicos eletrônicos (O-08).**
    Se o Valentrax já emite receita ou atestado: incluir CRM, **endereço do médico**, **RQE**,
    documento legal do paciente, data e hora. É preenchimento de campo, não arquitetura — mas é
    conformidade imediata com a CFM 2.299/2021, art. 2º.

### Fase 3 — Quando houver decisão de negócio, não antes

11. **Assinatura digital ICP-Brasil (O-10, O-12).**
    Só faz sentido junto com a **decisão do hospital de eliminar o papel**. Enquanto o hospital
    imprime e assina fisicamente (COFEN 754/2024, art. 2º, §3º), você está em conformidade sem
    gastar com certificados, HSM e integração. Escopo inicial: apenas os documentos do art. 1º da
    CFM 2.299/2021, **não** cada evolução (A-04).
    **Não prometa "paperless" ao hospital antes disso** — sem NGS2, a eliminação do papel é
    expressamente não autorizada (CFM 1.821/2007, art. 4º).

12. **Estrutura de Sumário de Alta compatível com RNDS (D-02, A-08).**
    Não a integração — só **estruturar** o desfecho da internação em campos, não em texto livre.
    Barato agora, evita reescrita quando a RNDS apertar.

13. **Certificação SBIS (D-01).**
    Deixar por último. É voluntária, o convênio com o CFM acabou, e o custo de revalidação a cada
    versão é potencialmente incompatível com desenvolvimento contínuo. Reavaliar se surgir
    exigência de licitação ou de contrato com operadora.

### O que explicitamente NÃO fazer agora

- **Não** construir rotina de purga/descarte automático após 20 anos. O hospital é novo em PEP;
  ninguém vai eliminar prontuário nos próximos anos, e a lei exige decisão de comissão
  (Lei 13.787/2018, art. 3º).
- **Não** entrar no subprojeto de digitalização de acervo em papel (GED, scanner, indexação)
  junto com o PEP. São regimes jurídicos distintos (A-10) e escopos distintos.
- **Não** implementar apoio à decisão clínica, interação medicamentosa ou FHIR nativo. Estágios
  avançados de certificação, fora do alcance de 2 pessoas.
- **Não** exigir certificado digital de cada profissional (COFEN 754/2024, art. 4º: o ônus é da
  instituição, e enquanto se imprime, não é necessário).

### O critério de decisão, em uma frase

> Se errar custa **migração de dados clínicos em produção**, faça agora.
> Se errar custa **uma sprint**, faça depois.

---

## 7. Lacunas desta pesquisa

Declaradas para que ninguém trate este documento como completo:

1. **Não consegui abrir o texto primário** da Lei 13.787/2018, da Lei 14.063/2020 e do
   Decreto 12.560/2025 (portal do Planalto recusou as requisições). Os artigos citados dessas
   normas vêm de fontes secundárias consistentes e convergentes, mas **as redações exatas devem
   ser conferidas no Planalto** antes de uso jurídico. As resoluções CFM 1.638/2002, CFM
   1.821/2007, CFM 2.299/2021 e COFEN 754/2024 **foram lidas no texto oficial integral** e suas
   citações são confiáveis.
2. **Não confirmei** a existência de obrigação geral, com prazo e sanção, de envio de dados à
   RNDS por hospital privado/filantrópico de pequeno porte (seção 3).
3. **Não confirmei** a redação exata nem o parágrafo correto da exceção de "atos internos do
   ambiente hospitalar" da Lei 14.063/2020 (armadilha A-04) — que é justamente o ponto de maior
   impacto econômico do documento.
4. **Não localizei** tabela pública e atual de custos, prazos e regras de revalidação da
   certificação SBIS (seção 4).
5. **Não pesquisei** normas estaduais do RS nem municipais, vigilância sanitária estadual
   (CEVS/RS), RDC da ANVISA aplicáveis a serviços de saúde, nem exigências da ANS para prestador
   — que podem acrescentar requisitos.
6. **Não verifiquei** se a COFEN 514/2016 (Guia de Recomendações para registros de enfermagem)
   segue vigente após as revogações de 2024. Ela é guia de recomendações, não norma impositiva,
   mas convém checar.
