# 🏗️ Modelo de trabalho — como se constrói no Valentrax

> Companheiro do [`GUIA-GIT.md`](GUIA-GIT.md). Aquele ensina a **mover código sem
> quebrar a produção**; este define **o que é um trabalho pronto** e por que cada
> regra existe.
>
> Nada aqui é preferência de estilo. **Toda regra deste documento nasceu de um
> defeito real neste sistema** — a maioria descoberta tarde, alguns em produção. A
> história curta vem junto de propósito: regra sem motivo é a primeira a ser
> ignorada quando dá pressa.

---

## 1. Quem faz o quê

| Papel | Quem | Território |
|---|---|---|
| **Modelagem assistencial** | Laura (enfermeira, dona do repo) | fluxo clínico, NSP, enfermagem, SAE — o que é certo fazer com o paciente |
| **Engenharia** | Adauam (TI) | arquitetura, banco, integrações, o que é seguro construir |
| **Execução assistida** | IA (Claude) | escreve, testa, percorre a tela, levanta risco — **nunca publica sozinha** |

**A regra que evita a maior parte dos conflitos:** dividam por **módulo**, não por
arquivo. Enquanto duas pessoas tocam módulos diferentes, o Git resolve sozinho. O
`src/App.jsx` é o único ponto onde isso falha — ver §7.

---

## 2. A arquitetura em camadas (o padrão da casa)

Todo módulo novo nasce em três camadas, nesta ordem:

```
regras puras  →  dados  →  tela
(sem React,      (só acesso     (só desenho)
 sem rede)        ao banco)
```

Exemplo real, o módulo Atendimento:

```
recepcao.js · ficha.js · agenda.js · ciclo.js · producao.js · responsavel.js · faturamento.js
        ↓
      dados.js
        ↓
Recepcao.jsx · Agenda.jsx · Consultas.jsx · Faturamento.jsx · Tabelas.jsx
```

**Por que as regras vêm primeiro, e puras:** regra pura é testável por mutação —
dá para quebrá-la de propósito e ver o teste falhar. Regra dentro de componente
React só é testável levantando o navegador, e por isso na prática não é testada.

**Por que toda escrita passa por um `dados.js`:** ver §4.

---

## 3. O que significa "pronto"

Um trabalho está pronto quando **as quatro** estão feitas. Três não bastam.

### ✅ 1. Regra pura, com teste que falha quando o código quebra

Teste que passa com o código errado é decoração. **Valide por mutação:** quebre a
regra de propósito e confirme que o teste fica vermelho.

> Um teste meu conferia se a pulseira não vazava dado clínico procurando `"cid"` no
> JSON. Passava sempre — porque `"cid"` casa com "Apare**cid**a". O teste não
> conferia nada. Só apareceu quando o nome de teste era "Maria Aparecida".

### ✅ 2. Contrato com o banco

Toda tela que grava passa pelo `dados.js` do módulo, e um `contrato-banco.test.js`
confere **cada chave contra `supabase/auditoria-banco.sql`**.

> Existe porque o PEP gravava em 4 colunas inexistentes e o PostgREST recusava o
> INSERT **inteiro, em silêncio**. Nada era salvo. Passou por code review, build e
> 99 testes verdes.

### ✅ 3. A tela percorrida com dado real

**Teste unitário verde não cobre integração entre camadas.** Não é opinião —
três defeitos sérios passaram por centenas de testes verdes e só apareceram
clicando:

- o `<select>` de convênio guardava o **código** enquanto a busca procurava **id** —
  convênio sempre nulo, **sem nenhum erro na tela**;
- a consulta ambulatorial caía na **fila de triagem do PS**;
- o atendimento ambulatorial **nunca fechava**, e por isso a Recepção avisava
  "já tem 5 atendimentos em aberto" em toda visita.

### ✅ 4. A última linha de defesa no banco

Quando a regra protege **pessoa** (e não o hospital), ela também vira `CHECK`,
`unique index` ou FK. **Validação de tela não sobrevive a um import de planilha,
a um script, nem a uma tela nova escrita daqui a um ano.**

Exemplos vivos:
- `at_item_sus_nao_cobra_paciente` — atendimento SUS não é cobrado do paciente;
- `at_resp_judicial_exige_documento` — curador sem nº de processo é recusado;
- `ag_agend_vaga_unica` — duas recepcionistas no mesmo horário, no mesmo instante.

**Como provar que a trava existe:** tente gravar pela API **o que a tela impede**.
Se a tela é a única barreira, o banco aceita — e você acabou de descobrir isso
antes do hospital.

---

## 4. As armadilhas que já custaram caro

Confira estas antes de repetir o padrão.

### 🔴 O banco responde "deu certo" quando não fez nada

O PostgREST devolve **2xx mesmo alterando ZERO linhas**. `DELETE` bloqueado por
RLS: **204**. `PATCH` bloqueado: **204**.

**Nunca confie no status.** Peça `Prefer: return=representation` e confira o
retorno, ou reconsulte a linha. Isso já me enganou duas vezes — inclusive nesta
sessão, conferindo o próprio trabalho.

### 🔴 Data civil não passa por `new Date`

`new Date("2026-07-29")` é meia-noite **UTC**; no Brasil volta para o dia 28. Já
trocou o dia da semana da grade da agenda, e foi o bug crítico do PR #1.

- dia civil → `diaCivil()` / `dataBR()` (fatiam a string, não convertem)
- borda de período em coluna **timestamp** → `lt` no dia seguinte, nunca `lte` no
  dia final (quem chegou 23:59:30 ficava fora da própria data)
- em coluna **date**, `lte` está certo — a regra acima é só para timestamp

### 🔴 `null` não é zero, e "não sei" não é "não"

Três estados diferentes que o sistema é obrigado a distinguir:

| Estado | Significa | Como imprime |
|---|---|---|
| valor | o dado existe | `R$ 10,50` |
| `0` / "nega" | alguém apurou e é zero/nenhum | `R$ 0,00` / "nega alergias" |
| `null` | **ninguém perguntou** | `—` / "sem registro" |

> Imprimir "sem alergias" onde ninguém perguntou é a mentira mais cara que uma
> ficha pode contar. Imprimir `R$ 0,00` onde não há preço faz a conta fechar
> zerada com cara de conta fechada.

E `Number(undefined)` é **NaN**, que não é `null` nem `""`. No cálculo do NEWS
isso fazia parâmetro **ausente** somar 3 pontos e classificar paciente estável
como crítico. Sempre barre `Number.isNaN`.

### 🔴 Aviso que sempre dispara é aviso que ninguém lê

Fadiga de alarme é **bug**, não incômodo. O ambulatorial que nunca fechava fazia a
Recepção avisar "já tem 5 atendimentos em aberto" toda vez — e aí a duplicidade
**real** passava junto com as falsas.

Antes de acrescentar um aviso, pergunte: *em que fração dos casos ele vai estar
certo?* Se for baixa, ele destrói os avisos vizinhos.

### 🔴 Estado desconhecido conta como ABERTO

Se um dia alguém gravar um status que o código não conhece, o paciente **aparece**
na fila em vez de sumir dela. **Errar mostrando é recuperável; errar escondendo
não** — ninguém procura o que não sabe que existe.

Corolário: conceito de estado mora **num lugar só** (`ciclo.js`). Espalhado como
`status !== "finalizado"` em 4 pontos, o status `cancelado` fazia o Paciente 360
dizer "está no PS agora (cancelado)".

### 🔴 Catálogo é DADO, não código

Convênio, procedimento, especialidade, via de faturamento: tudo cadastro. Cravar
em JavaScript faz **cada negociação comercial e cada portaria virar um deploy**.

E **catálogo vazio não bloqueia**: mostra "Nenhum cadastrado ainda". Cobrar da
recepcionista o que só o analista comercial resolve ensina a ignorar a tela
inteira.

### 🔴 Migração que DEDUZ dado não alimenta decisão

A sequência do prontuário ancorava no maior número de qualquer paciente —
inclusive nos que um backfill acabara de criar a partir de lixo digitado no PS. No
demo parou em 990001; em produção, um CPF no campo errado faria os prontuários
reais nascerem em 52.998.224.726, **permanente**.

### 🔴 Artefato gerado se resolve REGENERANDO

`auditoria-banco.sql`, `reconstruir-banco.sql` e a lista `ORDEM` conflitam sempre
que duas pessoas criam migração na mesma semana.

**Nunca costure o conflito à mão.** Aceite a versão da `main`, acrescente sua
migração na `ORDEM` em posição cronológica, e rode:

```bash
node supabase/validar-sql.mjs
node supabase/gerar-auditoria.mjs
node supabase/gerar-reconstrucao.mjs
```

Auditoria mantida à mão já ficou cega em módulo novo **duas vezes** — e auditoria
cega é pior que nenhuma, porque dá falsa confiança.

---

## 5. Quando bloquear e quando avisar

A distinção mais importante do sistema, e ela **muda conforme o momento**:

| Momento | Pendência administrativa | Por quê |
|---|---|---|
| **No balcão** (abrir atendimento) | **avisa**, nunca bloqueia | a pessoa está na frente; faturamento se resolve depois, cuidado não |
| **No fechamento da conta** | **bloqueia** | é exatamente o que faz a produção ser rejeitada, e ninguém está esperando |

E a regra que atravessa tudo:

> **Quando um dado aproximado pode trocar decisão clínica, recusar é melhor do que
> estimar.**

A triagem pediátrica escolhe faixa de sinais vitais pela idade em **meses**, e o
cadastro só tinha o **ano**: `(2026-2025)*12` fazia um bebê de 26 dias ser avaliado
como se tivesse 12 meses. Hoje, **abaixo de 2 anos o sistema recusa a idade
aproximada** em vez de sugerir por chute.

---

## 6. O banco: cinco regras não negociáveis

1. **Toda migração é aditiva.** `add column if not exists`, `create table if not
   exists`. Nunca `drop` com dado dentro. **Rollback de banco não existe.**
2. **Demo primeiro, principal depois.** Nessa ordem, sempre.
3. **SQL roda ANTES do merge do código.** O código sobe sozinho na Vercel; o banco
   não. Invertendo, a tela nova chega procurando coluna que não existe.
4. **Avise a outra pessoa antes** de rodar SQL no principal.
5. **Regenere a auditoria** depois de toda migração nova.

**Ao entregar qualquer feature, diga em qual dos dois casos ela cai** — e diga
explicitamente, mesmo quando for o caso fácil:

- **Só leitura** → "funciona sozinho, nada a rodar";
- **Estrutura nova** → entregue o `.sql` e avise que precisa rodar antes do merge.

---

## 7. A dívida que atrasa todo mundo

`src/App.jsx` passa de **15.000 linhas**. Consequências medidas:

- dois editando ao mesmo tempo = conflito doloroso;
- o Babel avisa que desotimiza o arquivo por exceder 500 kB;
- o chunk do app fica em ~1,3 MB mesmo com os vendors separados;
- code-splitting por rota é impossível sem mexer nele.

**Mitigação de hoje:** território por módulo, e extrair para `src/<dominio>/` tudo
que for novo. Já saíram: `clinico/`, `prontuario/`, `acesso/`, `util/`,
`pacientes/`, `atendimento/`, `ambulatorio/`.

**Padrão de extração que funciona:**
1. escolha um bloco de funções **puras** (sem React, DOM ou rede);
2. **capture o comportamento ANTES** no demo;
3. extraia;
4. **compare DEPOIS**, byte a byte;
5. escreva o teste e **valide por mutação**.

Foi assim que o motor de alertas saiu sem regressão.

---

## 8. Trabalhando com a IA

O que ela **deve** fazer sem ser pedido:

- `git fetch` no início **e antes de cada etapa nova** — a `main` já andou 5, 7 e 6
  commits no meio de uma sessão;
- avisar **sempre** que algo toca o banco;
- dar **passo a passo numerado** quando a ordem importa (um comando por passo, com
  o resultado esperado) — prosa espalhada já fez a FK rodar antes do merge e
  quebrar em silêncio a chegada do PS no demo;
- **desafiar**: apontar o que pode ser melhor, discordar quando a abordagem não for
  a melhor, levantar risco **antes** de executar;
- percorrer a tela no demo antes de dizer que está pronto.

O que ela **nunca** faz:

- **merge sem OK explícito** — merge publica para o hospital;
- confiar num `2xx` do PostgREST;
- digitar senha (se a sessão cair, pede login);
- deduzir qual ação um "pode" curto autoriza, quando uma delas publica ou apaga
  dado — **pergunta qual**.

E uma armadilha da ferramenta, descoberta na marra: **`console.clear()` não limpa o
buffer de leitura do navegador automatizado**. Para datar um erro de console, abra
**aba nova** — senão você lê mensagem velha e reporta bug que não existe.

---

## 9. Checklist do PR

```
[ ] git fetch — a main não andou desde que comecei?
[ ] regra pura, com teste validado por mutação
[ ] contrato-banco atualizado (se grava)
[ ] a tela percorrida no DEMO com dado real
[ ] trava no banco, se a regra protege a pessoa
[ ] npx vitest run          → tudo verde
[ ] npm run build           → limpo
[ ] node supabase/validar-sql.mjs   (se mexeu em SQL)
[ ] auditoria e reconstrução regeneradas (se criou migração)
[ ] o PR diz: precisa de migração? qual arquivo? em que ordem?
[ ] CI verde nos 3 checks + preview do DEMO testado
[ ] merge só com OK de quem não escreveu o código
```

---

## 10. O critério final

Antes de dar por pronto, uma pergunta:

> **Se este código errar, quem paga?**

- Se paga **o hospital** (glosa, retrabalho, número errado no relatório): avise,
  deixe visível, siga.
- Se paga **o paciente** (identificação, consentimento, cobrança indevida, dose,
  alergia): **recuse**, em todas as camadas, e escreva o teste que prova a recusa.

É essa pergunta que separa o aviso do bloqueio, o `null` do zero, e o que vira
`CHECK` no banco do que fica só na tela.
