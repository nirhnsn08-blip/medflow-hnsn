# Fechar o RLS de leitura — como aplicar

**O que muda:** hoje qualquer usuário logado lê qualquer tabela pela API REST, inclusive
`pacientes` (nome completo, CPF, CNS, nome da mãe, endereço) e o prontuário inteiro. O
menu esconde o módulo; o dado continua alcançável por quem souber montar uma URL. Depois
desta migração, a leitura passa pelo **mesmo perfil** que monta o menu.

**Quem publica isto é o SQL, não o código.** O arquivo `supabase/migracao-rls-leitura.sql`
fecha o acesso sozinho, rodado no painel. O que vem no código é a fonte do mapa e os
testes que impedem tabela nova de entrar sem classificação.

**São dois arquivos, nesta ordem:**

| Ordem | Arquivo | O que faz |
|---|---|---|
| 1º | `supabase/migracao-perfis-nsp.sql` | Dá **Segurança do Paciente** aos perfis assistenciais, **e a `ti` e `provisorio`**. Notificar incidente é dever de quem presta o cuidado (RDC 36/2013, art. 8º) e nenhum perfil tinha o módulo — com a leitura fechada, isso viraria impedimento de verdade. |
| — | `supabase/conferencia-perfis.sql` | Só leitura. Confere a matriz inteira do banco contra o catálogo do código. |
| 2º | `supabase/migracao-rls-leitura.sql` | Fecha a leitura por módulo. |

Primeiro as chaves certas, depois a fechadura — o contrário deixaria a equipe sem o
módulo de notificação por alguns minutos.

**Ninguém perde acesso hoje.** A equipe inteira ainda está no perfil **Provisório**, que
concede todos os módulos. O aperto vale pessoa por pessoa, conforme a TI reclassifica —
é a ordem certa: fechar a porta antes de distribuir as chaves.

---

## Antes de começar

- Tenha as duas abas abertas: painel do **demo** (`ufxqdvxhruaswuzhmxyf`) e do
  **principal** (`riuvyxppixeclxudsgpv`). Confira o nome do projeto no topo antes de
  cada `Run` — é o erro que não tem desfazer.
- O arquivo é **aditivo**: não cria, não altera e não apaga nenhuma tabela, coluna ou
  linha. Só reescreve políticas.
- Ele é **idempotente**: rodar duas vezes não faz mal.

---

## Passo a passo

### 1. Rodar no DEMO

1. Abra o painel do **demo** → **SQL Editor** → **New query**.
2. Cole `supabase/migracao-perfis-nsp.sql` inteiro → **Run**. Esperado: **15 linhas,
   todas `✅ ok`**. Se alguma vier `❌ ficou de fora`, pare e me avise qual.
3. **New query** → cole `supabase/conferencia-perfis.sql` → **Run**. É somente leitura:
   compara a matriz inteira do banco com o catálogo do código. Esperado: **nenhuma
   linha `❌ FALTA NO BANCO`**. Foi ele que pegou `ti.nsp` e `provisorio.nsp` faltando
   nos dois bancos — grants que o seed declarava havia semanas e que
   `on conflict do nothing` nunca insere num banco já migrado.
4. **New query** → cole `supabase/migracao-rls-leitura.sql` inteiro → **Run**.
5. Leia a saída:
   - a tabela de resultado (`situacao · item · detalhe`) tem que vir **sem nenhuma
     linha começando com `❌`**. `❌ LEITURA AINDA ABERTA` é tabela lendo `using (true)`
     sem autorização do mapa; `❌ USUARIO SEM PERFIL` é gente que não lê mais nada e
     precisa ser classificada em **Usuários e Perfis**;
   - na aba **Messages**, `N politica(s) FOR ALL convertida(s).` e
     `86 tabela(s) com politica de leitura por modulo.`

### 2. Provar que fechou de verdade (no demo)

Teste de tela não prova a última linha de defesa — a barreira é da API. Faça o teste
pela API, com o crachá do próprio app:

1. No **SQL Editor do demo**, rebaixe temporariamente o usuário de teste:
   ```sql
   update public.profiles set perfil = 'almoxarifado' where username = 'demo';
   ```
2. Abra o preview **`medflow-demo`**, entre com esse usuário e recarregue a página
   (o perfil é relido a cada carga).
3. Abra o console do navegador (**F12**) e cole:
   ```js
   const orig = window.fetch; window.__cracha = null; window.__url = null;
   window.fetch = function (u, o) {
     if (o?.headers?.Authorization) { window.__cracha = o.headers; window.__url = String(u).split('/rest/v1/')[0]; }
     return orig.apply(this, arguments);
   };
   ```
4. Clique em qualquer tela para o app fazer uma chamada, e então rode:
   ```js
   const r = await (await orig(`${window.__url}/rest/v1/pacientes?select=nome_completo,cpf&limit=5`, { headers: window.__cracha })).json();
   console.log('pacientes visíveis:', r);
   ```
   **Esperado: `[]`.** O almoxarifado não enxerga paciente nenhum.
   Repita trocando `pacientes` por `pep_evolucoes` e `leitos` — tudo `[]`.
   Depois troque por `sup_itens`: aí **tem** que voltar lista cheia (é o módulo dele).
5. Devolva o perfil e recarregue:
   ```sql
   update public.profiles set perfil = 'ti' where username = 'demo';
   ```
6. Com o perfil de volta, percorra as telas do demo: Recepção, PS, Giro de Leitos,
   Paciente 360, Farmácia e Estoque. Nenhuma pode ficar vazia.

> ⚠️ **Lista vazia não é erro na tela.** RLS bloqueando leitura devolve **200 com `[]`**,
> não 403. Se uma tela esvaziar, não vai aparecer aviso nenhum — é por isso que o
> passo 6 é obrigatório e não pode ser substituído por "os testes passaram".

### 3. Rodar no PRINCIPAL

7. Mesma coisa dos passos 1–3, agora no painel do **principal** — os **dois** arquivos,
   na mesma ordem (perfis-nsp primeiro). Confira o nome do projeto no topo.
8. Confira as mesmas saídas: 13 linhas `✅ ok` no primeiro, zero `❌` no segundo.
9. Percorra as telas do app de produção (menu completo, como adm_master). Como todo
   mundo ainda está no Provisório, nada deve mudar.

### 4. Mergear o PR

10. Só depois de 7–9, mergear. O código não depende do SQL para funcionar — mas o
    teste `mapa-tabelas.test.js` passa a cobrar classificação de toda tabela nova.

---

## Se alguma tela esvaziar em pleno plantão

O caminho certo é quase sempre **acrescentar o módulo que falta ao perfil da pessoa**,
na tela de Usuários — não reabrir o banco.

Reabrir é o último recurso, e está pronto no rodapé de
`supabase/migracao-rls-leitura.sql`, na seção **VOLTAR ATRÁS**: um bloco que devolve
todas as políticas de leitura ao estado anterior sem tocar em dado nenhum.

---

## Depois disto

1. **Reclassificar a equipe** (Usuários → Cargo). Agora tirar um módulo do perfil tira
   também o acesso ao dado — a reclassificação deixou de ser cosmética.
2. **Auditoria continua fora de todo perfil assistencial** — só TI, gestão e diretor
   técnico a enxergam. Pode estar certo (quem é auditado não administra a própria
   trilha), mas é decisão a tomar, não esquecimento. É ajuste de matriz
   (`src/acesso/modulos.js` + seed), não de RLS.
3. **Visão Geral do perfil Matriz** vai mostrar zeros onde ele não tem módulo, e zero
   parece número real. Hoje só alcança esse perfil; a correção é a tela conferir a
   permissão e escrever "sem acesso".

## O que este passo **não** resolve

- **Não filtra linha.** Quem alcança `pacientes` alcança todos os pacientes, não só os
  do seu setor. Depende de `profiles.setor` confiável.
- **Não mexe em escrita.** `insert/update/delete` continuam decidindo por `role`
  (`adm_master`/`adm_silver`), não por módulo. As funções `public.pode_editar()` já
  ficaram prontas no banco, sem uso.
