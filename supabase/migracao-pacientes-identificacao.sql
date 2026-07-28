-- ═══════════════════════════════════════════════════════════
-- IDENTIFICAÇÃO DO PACIENTE — conteúdo mínimo do prontuário
--
-- O QUE MUDA
-- `pacientes` tinha quatro campos: prontuario, iniciais, ano_nascimento e
-- sexo. Era uma escolha consciente de guardar pouco — mas deixa o sistema
-- em duas dívidas, e a segunda machuca antes da primeira:
--
--   1. LEGAL — a CFM 1.638/2002, art. 5º, I, "a", define o conteúdo mínimo
--      de identificação: nome completo, data de nascimento com dia/mês/ano,
--      sexo, NOME DA MÃE, NATURALIDADE (município e estado) e endereço
--      completo. A CFM 2.299/2021, art. 2º, exige o documento legal do
--      paciente nos documentos emitidos (receita, atestado, laudo).
--
--   2. CLÍNICA — guardar só o ANO obriga a calcular idade por subtração, e
--      o erro chega a 11 meses. Um bebê nascido em 20/12 é "1 ano" em
--      janeiro: a triagem pediátrica passa a avaliar os sinais vitais dele
--      contra a faixa de 12 meses, que é outra fisiologia. `data_nascimento`
--      é o que conserta isso.
--
-- SOBRE A LGPD — leia, porque muda a urgência de outra decisão
-- Guardar nome, CPF e filiação NÃO viola a LGPD: a base legal do dado
-- assistencial é a tutela da saúde (art. 11, II, "f"), e a minimização
-- (art. 6º, III) é "o mínimo necessário para a finalidade" — a finalidade
-- aqui é identificação exigida por norma. Não coletar é que descumpre a
-- CFM 1.638.
--
-- ⚠️ O que muda é a EXPOSIÇÃO. A política de SELECT desta tabela é
--    `using (true)`: qualquer usuário autenticado lê a tabela inteira pela
--    API. Até hoje isso expunha "J.S.M., 1957". Depois desta migração passa
--    a expor nome completo, CPF, nome da mãe e endereço.
--    Esta migração NÃO altera a política — apertar RLS no escuro tira
--    acesso de quem tem direito no meio do plantão, e a decisão é do
--    hospital. Mas a decisão deixou de ser arquitetura e virou urgência:
--    resolver ANTES do primeiro paciente real.
--    A tela já ajuda: `comoExibir()` mostra INICIAIS por padrão, e o nome
--    completo só onde a tarefa exige.
--
-- ⚠️ RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--    Sem isso, a tela de cadastro abre e não grava.
--    É aditiva: só `add column if not exists` e índices. Nada é alterado
--    nem removido. Pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) IDENTIFICAÇÃO (CFM 1.638/2002, art. 5º, I, "a")
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists nome_completo text,

  -- Nome social: direito garantido no SUS (Decreto 8.727/2016; Portaria
  -- MS 2.836/2011). Não é apelido — é como a pessoa deve ser chamada e
  -- exibida. Chamar pelo nome de registro contra a vontade dela é
  -- constrangimento, não detalhe de cadastro.
  add column if not exists nome_social text,

  -- Data COMPLETA. `ano_nascimento` continua existindo e não é tocado:
  -- os cadastros antigos seguem funcionando enquanto alguém não completa.
  add column if not exists data_nascimento date,

  -- Filiação. O nome da mãe é o campo que mais desempata homônimo — e o
  -- mais esquecido nos cadastros.
  add column if not exists nome_mae text,
  add column if not exists nome_pai text,

  -- Naturalidade: a norma pede município E estado.
  add column if not exists naturalidade_municipio text,
  add column if not exists naturalidade_uf text,
  add column if not exists nacionalidade text,

  -- Raça/cor autodeclarada — quesito obrigatório nos sistemas de
  -- informação do SUS, e base dos indicadores de equidade.
  add column if not exists raca_cor text,   -- branca | preta | parda | amarela | indigena | nao_informado

  -- `sexo` (já existia) é o do registro civil, usado em referência clínica.
  -- Identidade de gênero é outra informação e não substitui a primeira:
  -- as faixas de exame e as condutas obstétricas dependem do primeiro
  -- campo, e o respeito à pessoa depende do segundo. Guardar os dois
  -- separados é o que permite acertar nos dois.
  add column if not exists identidade_genero text;


-- ═══════════════════════════════════════════════════════════
-- 2) DOCUMENTOS (CFM 2.299/2021, art. 2º + faturamento SUS)
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists cpf text,
  add column if not exists rg text,
  add column if not exists rg_orgao_emissor text,
  -- Cartão Nacional de Saúde: sem ele o atendimento não fecha no SUS.
  add column if not exists cns text;


-- ═══════════════════════════════════════════════════════════
-- 3) ENDEREÇO (CFM 1.638/2002 — "endereço completo")
-- Em campos separados, não numa linha só: endereço em texto corrido não
-- vira indicador territorial, não agrupa por bairro e não exporta para a
-- RNDS sem alguém reprocessar à mão depois.
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists end_logradouro text,
  add column if not exists end_numero text,
  add column if not exists end_complemento text,
  add column if not exists end_bairro text,
  add column if not exists end_municipio text,
  add column if not exists end_uf text,
  add column if not exists end_cep text,
  add column if not exists end_referencia text;


-- ═══════════════════════════════════════════════════════════
-- 4) CONTATO E RESPONSÁVEL
-- O responsável não é burocracia: menor de idade e paciente incapaz
-- precisam de quem consinta e de quem receba a alta.
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  add column if not exists telefone text,
  add column if not exists telefone_alt text,
  add column if not exists email text,
  add column if not exists responsavel_nome text,
  add column if not exists responsavel_documento text,
  add column if not exists responsavel_parentesco text,
  add column if not exists responsavel_telefone text;


-- ═══════════════════════════════════════════════════════════
-- 5) SITUAÇÃO E CONTROLE
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  -- Óbito registrado no cadastro evita o constrangimento de convocar para
  -- consulta quem faleceu — e é dado de desfecho.
  add column if not exists obito boolean not null default false,
  add column if not exists obito_em date,

  -- Quando o registro nasceu (o `updated_at` sozinho não conta essa
  -- história) e quem o completou.
  add column if not exists criado_em timestamptz not null default now(),
  add column if not exists cadastro_completo_em timestamptz,
  add column if not exists observacao text;


-- ═══════════════════════════════════════════════════════════
-- 6) ÍNDICES — busca e trava de duplicidade
--
-- Prontuário duplicado é o defeito mais caro de sistema hospitalar: metade
-- do histórico fica num registro, metade no outro, e o médico decide vendo
-- metade. O índice ÚNICO em CPF e CNS é a última linha de defesa, depois da
-- checagem que a tela faz antes de gravar.
--
-- Criado dentro de bloco com exceção de propósito: se o banco já tiver
-- duplicata, um `create unique index` normal ABORTARIA a migração inteira e
-- as colunas acima não seriam criadas. Aqui a migração termina de qualquer
-- jeito e avisa o que precisa ser limpo à mão.
-- ═══════════════════════════════════════════════════════════
create index if not exists pacientes_nome_idx on public.pacientes (lower(nome_completo));
create index if not exists pacientes_mae_idx  on public.pacientes (lower(nome_mae));
create index if not exists pacientes_nasc_idx on public.pacientes (data_nascimento);

do $$
begin
  begin
    create unique index if not exists pacientes_cpf_uniq
      on public.pacientes (cpf) where cpf is not null and cpf <> '';
  exception when others then
    raise notice 'ATENCAO: nao foi possivel criar indice unico de CPF (% ). Ha CPF duplicado na base - limpe e rode: create unique index pacientes_cpf_uniq on public.pacientes (cpf) where cpf is not null and cpf <> '''';', sqlerrm;
  end;

  begin
    create unique index if not exists pacientes_cns_uniq
      on public.pacientes (cns) where cns is not null and cns <> '';
  exception when others then
    raise notice 'ATENCAO: nao foi possivel criar indice unico de CNS (%).', sqlerrm;
  end;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar. Espera-se 1 linha com as contagens.
-- ═══════════════════════════════════════════════════════════
select
  count(*)                                                as pacientes,
  count(*) filter (where nome_completo   is not null)     as com_nome,
  count(*) filter (where data_nascimento is not null)     as com_data_nascimento,
  count(*) filter (where nome_mae        is not null)     as com_nome_da_mae,
  count(*) filter (where cpf             is not null)     as com_cpf,
  count(*) filter (where cns             is not null)     as com_cartao_sus
from public.pacientes;
