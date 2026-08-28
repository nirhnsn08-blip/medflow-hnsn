# Carregar a metade ambulatorial do SIGTAP — como aplicar

**Para quando o hospital entrar em operação.** Não é urgente antes disso, e não precisa
ser feito no demo.

---

## O que está faltando, em uma frase

`sigtap_procedimentos` tem **219 procedimentos e todos são de internação** (`via = 'aih'`,
grupos 03 e 04). A alta de pronto-socorro e a consulta ambulatorial saem por **BPA**, e
não existe nenhuma linha de BPA na tabela.

Enquanto estiver assim, quem for escolher o procedimento de um atendimento ambulatorial vê:

> Há catálogo carregado, mas nenhum procedimento de BPA (produção ambulatorial) — que é a
> via deste atendimento. Escolher um código de outra via faria a conta voltar rejeitada.

A tela está certa em dizer isso. O que falta é o dado.

---

## Por que não veio pronto no código

O SIGTAP é **tabela oficial do DATASUS, versionada por competência** — muda por portaria,
todo mês. Código de procedimento inventado ou desatualizado não dá erro na hora: dá
**produção rejeitada**, descoberta no processamento do mês seguinte, quando refazer custa
caro.

Por isso o dado vem de arquivo oficial, e a ferramenta que o lê é versionada e testada —
do mesmo jeito que a metade de internação já veio (`supabase/importar-aih.mjs`).

---

## O que você precisa buscar

**Um arquivo.** A Produção Ambulatorial do SIA-SUS, do DATASUS:

```
ftp://ftp.datasus.gov.br/dissemin/publicos/SIASUS/200801_/Dados/PA<UF><AA><MM>.dbc
```

O nome se lê em pedaços: `PA` (produção ambulatorial) + a **sigla do estado** + **ano** com
dois dígitos + **mês** com dois dígitos.

O import de internação usou **Rio Grande do Sul, junho de 2026** (`RDRS2606.dbc`), então o
equivalente ambulatorial do mesmo mês é `PARS2606.dbc`. Para um mês mais recente, troque os
quatro últimos dígitos.

Dá para baixar colando o endereço no navegador, ou pelo TabNet. São algumas centenas de MB.

---

## O que rodar

```bash
node supabase/importar-bpa.mjs PARS2606.dbc
```

Só isso, na primeira vez. Sem mais nenhum argumento.

`--cnes <número>` é **opcional**: sem ele a ferramenta usa o estado inteiro, que aproxima
bem a tabela nacional — foi o que se fez no import de internação. Com ele, só a produção do
próprio hospital.

### O que vai acontecer

A ferramenta imprime quantas linhas leu, quantos procedimentos distintos achou, quantos já
existiam na tabela e **quantos são novos**.

Como a tabela hoje só tem procedimentos de internação, quase todos os de BPA serão novos —
e aí aparece o segundo passo.

---

## O segundo passo: os nomes

O arquivo de produção traz **código, valor e CID — não o nome do procedimento**. E a coluna
`nome` não aceita vazio.

A ferramenta **não inventa nome**. Nome inventado faria alguém escolher pelo rótulo errado, e
a conta voltaria rejeitada — que é exatamente o problema que este trabalho existe para
evitar. Então ela lista os códigos sem nome no cabeçalho do SQL gerado e não os insere.

Para incluí-los, rode de novo passando um CSV `codigo;nome`:

```bash
node supabase/importar-bpa.mjs PARS2606.dbc --nomes lista.csv
```

O CSV é simples — uma linha por procedimento:

```
0301010013;CONSULTA MEDICA EM ATENCAO ESPECIALIZADA
0302010013;SESSAO DE HEMODIALISE
```

**Onde conseguir os nomes:** o pacote oficial do SIGTAP (sigtap.datasus.gov.br → Download)
traz código e nome juntos. Quando chegar a hora, vale estender o importador para ler esse
pacote direto, em vez de montar o CSV à mão — o pacote vem com um arquivo de layout junto,
então dá para ler sem adivinhar formato. **Isso ainda não foi feito.**

---

## O que sai disso

`supabase/migracao-sigtap-bpa.sql` — aditiva, idempotente e auto-registrada em
`migracoes_aplicadas`.

Rode no **demo primeiro, depois no principal**, como toda migração desta casa. A conferência
no fim devolve uma linha; o número que importa é `bpa`:

| coluna | hoje | depois |
|---|---|---|
| `aih` | 219 | 219 |
| `bpa` | **0** | o que entrou |
| `bpa_sem_valor` | — | deve ser 0 |

Se `bpa` vier zero, o import não inseriu nada — quase certamente faltou o `--nomes`.

---

## Se der errado

A ferramenta **para e diz o que encontrou**, em vez de gerar número errado.

O layout do SIA-SUS mudou de nome de campo entre versões. Se o arquivo não tiver os campos
esperados, ela lista os campos reais e pede para ajustar `CAMPOS_PA` em
`supabase/importar-bpa.mjs` — **sem adivinhar**. Basta mandar essa saída para quem for
corrigir.

Isso é deliberado: `campoDe` devolve string vazia para campo inexistente, em silêncio. Sem
a conferência, um nome de campo errado produziria valores **zerados sem nenhum erro** — que
numa ferramenta de faturamento é o pior defeito possível, porque é número errado com cara
de certo.

---

## LGPD

O arquivo do SIA-SUS tem campos semi-identificáveis (idade, sexo, município). A ferramenta
processa **local** e só emite **agregado por procedimento** — nenhum registro de paciente
sai da máquina, e nada disso entra no SQL gerado.
