-- ═══════════════════════════════════════════════════════════
-- PEP — FASE 3: RECONCILIAÇÃO MEDICAMENTOSA E SUMÁRIO DE ALTA
--
-- O QUE FALTAVA
-- O PEP já cobre a internação inteira — admissão, prescrição, aprazamento,
-- checagem, sinais vitais, evolução. Faltavam as duas PONTAS, que é onde a
-- literatura de segurança do paciente concentra os erros de medicação:
--
--   • ENTRADA — o paciente chega tomando cinco remédios em casa e recebe
--     uma prescrição montada do zero. O anti-hipertensivo dele some sem que
--     ninguém tenha decidido suspendê-lo.
--   • SAÍDA  — ele vai para casa com o antibiótico do hospital e sem saber
--     se volta a tomar o que tomava antes.
--
-- Reconciliar é registrar uma DECISÃO EXPLÍCITA sobre cada medicamento em
-- cada transição. Suspender é ato clínico legítimo; esquecer não é — e os
-- dois produzem exatamente a mesma prescrição. A diferença é a
-- justificativa registrada, e é isso que estas tabelas guardam.
--
-- O sumário de alta fecha o episódio e é o único documento que o paciente
-- leva. Fica em campos separados (e não num texto corrido) porque as
-- Portarias GM/MS 8.025 e 8.026/2025 instituíram o modelo estruturado de
-- Sumário de Alta da RNDS: integrar depois é barato, extrair diagnóstico de
-- dentro de um parágrafo depois é migração de dado clínico.
--
-- ⚠️  RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--     Sem isso, as abas "Reconciliação" e "Alta" abrem vazias.
--     É aditiva: só `create table if not exists` e índices. Nada é
--     alterado nem removido. Pode rodar duas vezes sem efeito colateral.
--
-- APPEND-ONLY, como todo o resto do PEP. Nenhuma tabela aqui tem política
-- de update ou delete: corrigir é criar um registro novo que aponta para o
-- anterior (`substitui_id` / `corrige_id`).
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) MEDICAMENTOS DE USO DOMICILIAR
--
-- É a lista do que o paciente toma EM CASA, e ela é atributo da PESSOA, não
-- da internação — mesma decisão já tomada para alergia (`pep_alergias`).
-- Se fosse do episódio, seria redigitada a cada passagem, e o paciente
-- crônico que interna três vezes por ano teria três listas divergentes.
--
-- `pep_anamneses.medicamentos_em_uso` (texto livre) continua existindo e não
-- é substituído: é a narrativa da admissão. Esta tabela é a versão
-- ESTRUTURADA, que dá para comparar com a prescrição — texto corrido não
-- se compara com nada.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_medicamentos_uso (
  id bigserial primary key,
  prontuario text not null,
  -- em qual internação esta linha foi levantada (contexto, não dono)
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- como o paciente chama ("Selozok")
  substancia text,                        -- princípio ativo, quando identificado
  apresentacao text,
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  frequencia text,                        -- como falado ("1x ao dia", "de manhã")
  frequencia_dia numeric,
  uso_continuo boolean not null default true,
  indicacao text,                         -- "para pressão", "para diabetes"
  inicio date,

  -- De onde veio a informação. Muda a confiança: receita na mão é uma coisa,
  -- "acho que é um comprimido branco" é outra, e quem lê precisa saber qual
  -- das duas está olhando.
  fonte text not null default 'paciente', -- paciente | familiar | receita |
                                          -- farmacia | prontuario | outro
  confiabilidade text,                    -- alta | media | baixa

  situacao text not null default 'ativa', -- ativa | suspensa | encerrada

  -- "Perguntei e o paciente não usa nada em casa".
  -- É informação clínica, não ausência de informação — a mesma distinção já
  -- adotada em `pep_alergias` para "nega alergias". Lista vazia significa
  -- que NINGUÉM PERGUNTOU, e as duas coisas não podem ficar iguais na tela:
  -- sem isso, o paciente polimedicado que ninguém entrevistou parece
  -- idêntico ao que realmente não toma nada.
  sem_uso boolean not null default false,

  observacao text,

  corrige_id bigint references public.pep_medicamentos_uso(id) on delete set null,
  motivo_correcao text,

  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_meduso_pront_idx on public.pep_medicamentos_uso (prontuario, criado_em desc);
create index if not exists pep_meduso_epis_idx on public.pep_medicamentos_uso (episodio_id);
create index if not exists pep_meduso_corrige_idx on public.pep_medicamentos_uso (corrige_id);
alter table public.pep_medicamentos_uso enable row level security;
drop policy if exists pep_meduso_select on public.pep_medicamentos_uso;
drop policy if exists pep_meduso_insert on public.pep_medicamentos_uso;
create policy pep_meduso_select on public.pep_medicamentos_uso
  for select to authenticated
  using (true);
create policy pep_meduso_insert on public.pep_medicamentos_uso
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: a lista de uso é registro clínico


-- ═══════════════════════════════════════════════════════════
-- 2) RECONCILIAÇÃO — O ATO
--
-- Nasce JÁ CONCLUÍDA, como a prescrição: o profissional monta as decisões
-- na tela e assina o conjunto de uma vez. Não há rascunho no banco.
--
-- O motivo é o mesmo do append-only: uma reconciliação "em andamento" que
-- alguém abandonou no meio, e que o sistema conta como existente, é pior
-- que reconciliação nenhuma — a tela diria "já foi feita". Refazer é criar
-- outra apontando para esta em `substitui_id`; a anterior permanece.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_reconciliacoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  momento text not null default 'admissao',  -- admissao | alta | transferencia
  substitui_id bigint references public.pep_reconciliacoes(id) on delete set null,
  motivo_substituicao text,

  -- Placar congelado no momento da assinatura. É redundante com os itens de
  -- propósito: serve de indicador de qualidade sem varrer a tabela filha, e
  -- preserva o que era verdade naquele dia mesmo que a leitura mude.
  total_itens int not null default 0,
  total_discrepancias int not null default 0,
  total_pendentes int not null default 0,

  observacao text,
  concluida_em timestamptz not null default now(),
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_recon_pront_idx on public.pep_reconciliacoes (prontuario, criado_em desc);
create index if not exists pep_recon_epis_idx on public.pep_reconciliacoes (episodio_id, momento);
create index if not exists pep_recon_subst_idx on public.pep_reconciliacoes (substitui_id);
alter table public.pep_reconciliacoes enable row level security;
drop policy if exists pep_recon_select on public.pep_reconciliacoes;
drop policy if exists pep_recon_insert on public.pep_reconciliacoes;
create policy pep_recon_select on public.pep_reconciliacoes
  for select to authenticated
  using (true);
create policy pep_recon_insert on public.pep_reconciliacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 3) RECONCILIAÇÃO — AS DECISÕES, UMA POR MEDICAMENTO
--
-- Cada linha guarda a posologia COPIADA, não só a referência. Parece
-- redundante — o item da prescrição está a um join de distância — mas a
-- prescrição de amanhã substitui a de hoje, e o registro precisa dizer o
-- que estava valendo quando a decisão foi tomada. Sem a cópia, reler a
-- reconciliação de terça mostraria a prescrição de quinta.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_reconciliacao_itens (
  id bigserial primary key,
  reconciliacao_id bigint not null references public.pep_reconciliacoes(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  origem text not null default 'domiciliar',   -- domiciliar | hospitalar
  medicamento_uso_id bigint references public.pep_medicamentos_uso(id) on delete set null,
  prescricao_item_id bigint references public.pep_prescricao_itens(id) on delete set null,
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,

  -- posologia congelada (ver comentário acima)
  descricao text not null,
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  frequencia text,
  frequencia_dia numeric,

  decisao text,                 -- manter | alterar | substituir | suspender |
                                -- reiniciar | novo
  justificativa text,
  discrepancia boolean not null default false,
  tipo_discrepancia text,       -- sem_decisao | omissao | dose_divergente |
                                -- via_divergente | frequencia_divergente |
                                -- duplicidade | sem_justificativa
  leva_para_casa boolean,       -- null = decisão ainda não tomada
  ordem int default 0,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_reconitem_rec_idx on public.pep_reconciliacao_itens (reconciliacao_id, ordem);
create index if not exists pep_reconitem_pront_idx on public.pep_reconciliacao_itens (prontuario, criado_em desc);
alter table public.pep_reconciliacao_itens enable row level security;
drop policy if exists pep_reconitem_select on public.pep_reconciliacao_itens;
drop policy if exists pep_reconitem_insert on public.pep_reconciliacao_itens;
create policy pep_reconitem_select on public.pep_reconciliacao_itens
  for select to authenticated
  using (true);
create policy pep_reconitem_insert on public.pep_reconciliacao_itens
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) SUMÁRIO DE ALTA
--
-- Campos separados, não um texto único: o modelo de Sumário de Alta da RNDS
-- (Portarias GM/MS 8.025 e 8.026/2025) é estruturado, e a CFM 1.638/2002,
-- art. 5º, já exige diagnóstico e tratamento efetuado como conteúdo mínimo.
--
-- `medicamentos_alta` e `medicamentos_suspensos` são jsonb com a receita
-- COMO FOI ENTREGUE. Não é desnormalização por preguiça: o documento que o
-- paciente levou no bolso precisa ser reproduzível anos depois, e ele não
-- muda quando a reconciliação for refeita ou a prescrição, substituída.
--
-- `texto_impressao` guarda a via impressa exatamente como saiu. Enquanto o
-- hospital não tiver assinatura qualificada (ICP-Brasil), a COFEN 754/2024,
-- art. 2º, §3º, manda imprimir e assinar à mão — então o papel é o
-- documento legal, e reimprimir precisa produzir a mesma folha, não uma
-- nova montagem a partir de dados que mudaram.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_sumarios_alta (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,

  admissao_em timestamptz,
  alta_em timestamptz not null default now(),
  dias_internacao int,
  setor text,
  leito text,

  desfecho text not null,        -- alta_melhorado | alta_inalterado |
                                 -- alta_pedido | transferencia | evasao | obito
  desfecho_detalhe text,
  diagnostico_principal text,
  cid_principal text,
  cid_secundarios text,
  motivo_internacao text,
  resumo_internacao text,
  procedimentos text,
  exames_relevantes text,
  condicao_alta text,            -- em óbito, é a causa e a circunstância
  orientacoes text,
  sinais_de_alerta text,         -- quando o paciente deve procurar o serviço
  retorno_em date,
  retorno_servico text,

  reconciliacao_id bigint references public.pep_reconciliacoes(id) on delete set null,
  medicamentos_alta jsonb not null default '[]',
  medicamentos_suspensos jsonb not null default '[]',
  texto_impressao text,

  substitui_id bigint references public.pep_sumarios_alta(id) on delete set null,
  motivo_substituicao text,

  assinado_em timestamptz not null default now(),
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_sumario_pront_idx on public.pep_sumarios_alta (prontuario, criado_em desc);
create index if not exists pep_sumario_epis_idx on public.pep_sumarios_alta (episodio_id);
create index if not exists pep_sumario_subst_idx on public.pep_sumarios_alta (substitui_id);
alter table public.pep_sumarios_alta enable row level security;
drop policy if exists pep_sumario_select on public.pep_sumarios_alta;
drop policy if exists pep_sumario_insert on public.pep_sumarios_alta;
create policy pep_sumario_select on public.pep_sumarios_alta
  for select to authenticated
  using (true);
create policy pep_sumario_insert on public.pep_sumarios_alta
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: sumário emitido é documento. Retificar = novo sumário
-- com `substitui_id` e `motivo_substituicao`, e o original continua legível.


-- ═══════════════════════════════════════════════════════════
-- 5) CONFERÊNCIA
-- Rode depois de aplicar. Devem aparecer as 4 tabelas, todas com RLS.
-- ═══════════════════════════════════════════════════════════
select
  c.relname as tabela,
  c.relrowsecurity as rls_ligado,
  (select count(*) from pg_policies p where p.tablename = c.relname) as politicas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('pep_medicamentos_uso','pep_reconciliacoes',
                    'pep_reconciliacao_itens','pep_sumarios_alta')
order by c.relname;
