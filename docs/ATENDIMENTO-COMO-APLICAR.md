# Módulo Atendimento / Recepção — como aplicar

Feature em andamento na branch `feat/atendimento-recepcao`.
Escrito em 28/07/2026, para quem for mexer no banco ou no PS antes do merge.

---

## Em uma frase

O sistema tinha a **ficha** do paciente (PR #39) mas não tinha a **porta**: a
recepção do PS digitava iniciais e um número de prontuário à mão, e nada
garantia que esse número correspondesse a alguém cadastrado. Esta feature cria
a porta.

---

## ⚠️ A ordem de aplicação inverte a regra da casa — leia isto

A regra normal é **rodar o SQL antes do merge**, porque o código novo grava em
coluna nova; sem a coluna, a tela abre e não salva.

Esta feature tem **duas** migrações, e a segunda é o contrário disso.

| # | Arquivo | Quando | Por quê |
|---|---------|--------|---------|
| 1 | `supabase/migracao-atendimento-recepcao.sql` | **Pode rodar já** | 100% aditiva: colunas, backfill, sequência, função e permissões. Nenhuma linha dela recusa escrita do código atual. |
| 2 | *merge do código + deploy* | — | — |
| 3 | `supabase/migracao-atendimento-fk.sql` | **Só depois do merge** | Instala a chave estrangeira. Uma *constraint* não serve o código novo — ela **cobra do código que está no ar**. |
| 4 | `supabase/migracao-atendimento-fase2.sql` | **Antes do merge da fase 2** | A ficha: convênio, plano, classificação, procedimento. Volta à regra normal — é aditiva e não cobra nada do código atual. |

> Sem o passo 4 aplicado, a tela da Recepção **funciona**, mas os campos da
> ficha aparecem todos como "Nenhum cadastrado ainda" e o console registra
> 404 nas quatro tabelas de catálogo. Não quebra — só não serve para nada.

### O que acontece se a #3 rodar cedo demais

O formulário de chegada do PS que está hoje na `main` aceita prontuário
digitado à mão sem conferir se existe. Com a chave estrangeira instalada, o
PostgREST recusa esse INSERT e o `sbFetch` devolve `null` **sem alarde**:

> a recepcionista clica em "Registrar chegada", o formulário limpa,
> e o paciente **não entra na fila da triagem**. Ninguém é chamado.

É a mesma classe de defeito que o `contrato-banco.test.js` existe para impedir.
O código desta branch fecha o buraco — a chegada do PS passa a conferir o
cadastro e a mandar para a Recepção quando o prontuário não existe. Por isso:
**primeiro o código, depois a trava.**

---

## Se você for mexer no PS hoje

O `App.jsx` foi tocado em **cinco pontos pequenos**, todos fáceis de resolver
se der conflito:

1. Dois `import` novos no topo (`Recepcao.jsx` e `atendimento/dados.js`).
2. `PS_VIAS_TRANSF`, `PS_ORIGENS`, `PS_ORIGEM_UNIDADES` e `psPedeDetalhe`
   **saíram** do `App.jsx` e passaram para `src/atendimento/recepcao.js`.
   Se precisar acrescentar uma origem nova, é lá agora — a chegada do paciente
   passou a existir em duas telas, e duas cópias da lista divergiriam sem
   ninguém perceber.
3. Um ícone novo (`door`) no `ICON_PATHS`.
4. Uma entrada no `sidebarItems` e uma rota em `active === "atendimento"`.
5. `registrarChegada()` ganhou a conferência de cadastro descrita acima.

Nada foi renomeado nem removido do fluxo do PS. A triagem, as salas, a
checagem de medicação e o desfecho não foram tocados.

---

## Arquivos novos (não conflitam com nada)

```
src/atendimento/recepcao.js            regras puras, testadas
src/atendimento/dados.js               acesso ao banco (toda escrita passa aqui)
src/atendimento/Recepcao.jsx           a tela
src/atendimento/recepcao.test.js       36 testes
src/atendimento/contrato-banco.test.js 20 testes de contrato com o banco
supabase/migracao-atendimento-recepcao.sql
supabase/migracao-atendimento-fk.sql
```

`src/acesso/modulos.js` e `supabase/migracao-perfis-acesso.sql` ganharam o
módulo `atendimento` — os dois juntos, senão o `seed-perfis.test.js` acusa.

---

## Decisões que valem saber

**A tela começa pela busca, não pelo cadastro.** É regra, não layout: com fila
no balcão, quem atende preenche o formulário que estiver aberto em vez de
procurar quem já existe — é assim que nasce prontuário duplicado.

**O número do prontuário passa a ser emitido pelo banco** (sequência +
`proximo_prontuario()`, piso 1000, começando acima do maior número já usado).
Dois recepcionistas em dois computadores calculariam o mesmo "maior + 1"; a
sequência do Postgres é atômica. O formato é numérico simples — **decisão em
aberto**: se o hospital quiser prefixo (`T9035`), é trocar uma linha na função.

**Paciente sem identificação entra em um clique** (CFM 1.638/2002, art. 5º, I,
"e") e vira pendência visível numa lista da recepção. Ele **não** converte
idade aparente em data de nascimento: a triagem pediátrica escolhe faixa de
sinal vital pela idade, e faixa escolhida por palpite decide conduta com base
em nada. A idade observada fica em texto, na observação, onde nenhum cálculo a
consome.

**O backfill não é opcional.** A migração #1 cria o cadastro que falta para
todo atendimento órfão, marcado `origem_cadastro = 'backfill'` e sem nome —
aparece na tela como identificação pendente, que é a verdade. O que ela não faz
é inventar dado de pessoa.

---

## Estado da verificação

- 536 testes passando (eram 480); build limpo.
- App carrega no preview demo sem erro de console; o PS continua íntegro.
- **A tela da Recepção ainda não foi percorrida ponta a ponta** — sem a
  migração #1 o módulo nem aparece no menu (comportamento correto: o perfil no
  banco não tem o grant). É o primeiro passo de amanhã.
