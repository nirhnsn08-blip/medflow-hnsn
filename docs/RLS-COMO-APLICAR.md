# Fechar o RLS de leitura — como aplicar

**O que muda:** hoje qualquer usuário logado lê qualquer tabela pela API REST, inclusive
`pacientes` (nome completo, CPF, CNS, nome da mãe, endereço) e o prontuário inteiro. O
menu esconde o módulo; o dado continua alcançável por quem souber montar uma URL. Depois
desta migração, a leitura passa pelo **mesmo perfil** que monta o menu.

**Quem publica isto é o SQL, não o código.** O arquivo `supabase/migracao-rls-leitura.sql`
fecha o acesso sozinho, rodado no painel. O que vem no código é a fonte do mapa e os
testes que impedem tabela nova de entrar sem classificação.

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
2. Cole o conteúdo inteiro de `supabase/migracao-rls-leitura.sql`.
3. **Run**.
4. Leia a saída, nesta ordem:
   - a aba **Messages** deve mostrar `N politica(s) FOR ALL convertida(s).` e
     `86 tabela(s) com politica de leitura por modulo.`;
   - a **primeira consulta** de conferência (`tabela_ainda_aberta`) deve vir **vazia**.
     Se vier alguma linha, é tabela lendo `using (true)` sem autorização do mapa —
     pare e me avise qual;
   - a **terceira** lista quem está sem perfil. Quem aparecer ali não lê mais nada:
     classifique em **Usuários e Perfis**.

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

7. Mesma coisa do passo 1, agora no painel do **principal**. Confira o nome do projeto
   no topo.
8. Confira as mesmas três consultas de saída.
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
2. **Duas lacunas conhecidas na matriz de perfis**, que a reclassificação vai expor:
   - nenhum perfil assistencial tem **Segurança do Paciente** (`nsp`), embora notificar
     incidente seja dever de todos (RDC 36/2013);
   - nenhum tem **Auditoria** além de TI, gestão e diretor técnico.

   São ajustes de matriz (`src/acesso/modulos.js` + seed), não de RLS.
3. **Visão Geral do perfil Matriz** vai mostrar zeros onde ele não tem módulo, e zero
   parece número real. Hoje só alcança esse perfil; a correção é a tela conferir a
   permissão e escrever "sem acesso".

## O que este passo **não** resolve

- **Não filtra linha.** Quem alcança `pacientes` alcança todos os pacientes, não só os
  do seu setor. Depende de `profiles.setor` confiável.
- **Não mexe em escrita.** `insert/update/delete` continuam decidindo por `role`
  (`adm_master`/`adm_silver`), não por módulo. As funções `public.pode_editar()` já
  ficaram prontas no banco, sem uso.
