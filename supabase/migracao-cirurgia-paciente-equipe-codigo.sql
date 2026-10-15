-- ═══════════════════════════════════════════════════════════
-- A CIRURGIA PASSA A TER PACIENTE, EQUIPE E CÓDIGO
--
-- As três coisas entram juntas porque são a MESMA CHAVE: faturar uma
-- cirurgia exige paciente identificado E código de procedimento E equipe
-- com CBO. Faltando qualquer uma, a conta não sai — e fazer em três
-- migrações separadas só multiplicaria a aplicação manual no painel.
--
-- 🔴 1. A CIRURGIA PODE NÃO TER PACIENTE NENHUM.
-- `prontuario` é texto solto, sem FK. `migracao-atendimento-fk.sql` diz com
-- todas as letras que "`leitos`, `cc_cirurgias`, `scih_casos`, `pep_*` e
-- `enf_*` guardam o mesmo número como texto solto". A tela já passou a
-- exigir o campo (PR anterior), mas nada liga o número a um cadastro: dois
-- pacientes com as mesmas iniciais no mesmo dia são indistinguíveis, e um
-- número digitado errado aponta para o vazio. Identificação correta é a
-- Meta 1 da OMS, e é o pressuposto de todas as outras — um Sign In que
-- "confirma identidade" contra uma linha órfã não confirma nada.
--
-- 🔴 2. O PROCEDIMENTO É TEXTO LIVRE.
-- `procedimento text not null`, preenchido num input com placeholder
-- "Ex.: Colecistectomia videolaparoscópica". Cirurgia é o procedimento de
-- maior valor da tabela: sem código SIGTAP não há AIH, sem TUSS não há guia
-- TISS. Hoje a cirurgia acontece no Bloco e o faturista redigita tudo do
-- zero a partir do papel — que é exatamente onde `montar-conta.js` diz que
-- "nasce o código trocado, a diária esquecida e a conta que sai menor do
-- que o atendimento foi".
--
-- 🔴 3. A EQUIPE É UM SOBRENOME.
-- `cirurgiao text, anestesista text` — e `anestesista` nunca teve um único
-- input no sistema (coluna morta desde o schema). Isso impede três coisas:
--   • FATURAMENTO: `at_conta_itens` já tem `executante` E `executante_cbo`,
--     e `src/acesso/cbo.js` avisa que "CBO errado causa rejeição no
--     SISAIH01/BPA — e rejeição não é glosa, derruba o registro inteiro".
--     Na guia TISS cada membro entra com conselho e GRAU DE PARTICIPAÇÃO,
--     que é o que define o percentual pago.
--   • RASTREABILIDADE: "Silva" não identifica profissional nenhum.
--   • ESCALA: "produtividade por cirurgião" agrupa por digitação — "Silva",
--     "silva" e "Dr. Silva" viram três cirurgiões no painel da direção.
--
-- E mais duas, pequenas, que vêm junto porque são da mesma linha:
--   4. CARÁTER (eletiva/urgência/emergência) — exigido na AIH, e é o
--      separador de quase todo indicador do bloco: taxa de cancelamento de
--      ELETIVA é indicador de gestão; de urgência, não é comparável.
--   5. `cancelado_em` / `cancelado_por` — hoje só existe o motivo. Cirurgia
--      CANCELADA na véspera e cirurgia SUSPENSA com o paciente já em jejum
--      são indicadores diferentes, com donos diferentes, e eram a mesma
--      linha. Sem autor, a reunião de bloco vira "quem cancelou isso?".
--
-- ADITIVA. IDEMPOTENTE.
--
-- COMO DESFAZER:
--   alter table public.cc_cirurgias
--     drop constraint if exists cc_cirurgias_paciente_fk,
--     drop column if exists procedimento_cod, drop column if exists carater_cod,
--     drop column if exists cancelado_em,     drop column if exists cancelado_por;
--   drop table if exists public.cc_equipe;
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. COLUNAS NOVAS EM cc_cirurgias
-- ───────────────────────────────────────────────────────────
alter table public.cc_cirurgias
  add column if not exists procedimento_cod text,
  add column if not exists carater_cod      text,
  add column if not exists cancelado_em     timestamptz,
  add column if not exists cancelado_por    text;

comment on column public.cc_cirurgias.procedimento_cod is
  'Código do catálogo (at_procedimentos / SIGTAP). `procedimento` segue sendo o nome legível.';
comment on column public.cc_cirurgias.carater_cod is
  'Domínio `carater` de at_dominios. Exigido na AIH e separador dos indicadores do bloco.';


-- ───────────────────────────────────────────────────────────
-- 2. O PACIENTE — backfill e trava
--
-- Mesmo padrão de `migracao-atendimento-fk.sql`: primeiro adota os
-- prontuários órfãos em `pacientes` (para a FK não ser recusada por dado
-- antigo), depois trava.
--
-- ⚠️ Fica NULLABLE de propósito. Linha antiga sem prontuário existe, e
-- `not null` aqui recusaria a migração inteira por causa dela — a tela já
-- passou a exigir o campo no que nasce de hoje em diante. Transformar as
-- antigas é decisão de quem conhece os casos, não de uma migração.
--
-- Sem `on update cascade`, pela mesma razão que a FK do atendimento não
-- tem: trocar o número do prontuário arrastaria um histórico partido por
-- seis tabelas que guardam o mesmo número como texto.
-- ───────────────────────────────────────────────────────────
insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (c.prontuario)
       c.prontuario,
       coalesce(nullif(btrim(c.iniciais), ''), '?'),
       'backfill',
       'migracao-cirurgia-fk',
       now()
  from public.cc_cirurgias c
 where c.prontuario is not null
   and btrim(c.prontuario) <> ''
   and not exists (select 1 from public.pacientes p where p.prontuario = c.prontuario)
 order by c.prontuario, c.data desc
on conflict (prontuario) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'cc_cirurgias_paciente_fk'
       and conrelid = 'public.cc_cirurgias'::regclass
  ) then
    alter table public.cc_cirurgias
      add constraint cc_cirurgias_paciente_fk
      foreign key (prontuario) references public.pacientes (prontuario);
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK de cc_cirurgias (%). Veja a conferencia no fim.', sqlerrm;
end $$;


-- ───────────────────────────────────────────────────────────
-- 3. A EQUIPE CIRÚRGICA
--
-- Uma linha por profissional, com o PAPEL. O nome, o conselho e o CBO são
-- CARIMBADOS no ato, e não lidos de `profiles` na hora de faturar: o
-- cadastro muda (muda de CBO, renova conselho, sai do hospital) e o
-- registro de quem operou aquele paciente naquele dia não pode mudar junto.
-- É o mesmo princípio do `executante_cbo` em `at_conta_itens`.
--
-- `profissional_username` fica como referência FRACA (sem FK): serve para
-- ligar ao cadastro quando ele existe, e não impede registrar o cirurgião
-- externo que opera no hospital sem ter login.
-- ───────────────────────────────────────────────────────────
create table if not exists public.cc_equipe (
  id bigserial primary key,
  cirurgia_id bigint not null,
  papel text not null,
  profissional_username text,
  nome text not null,
  conselho text, registro_conselho text, uf_conselho text,
  cbo text,
  -- Grau de participação da TISS: é ele que define o percentual pago a cada
  -- membro. Guardado separado do papel porque o papel é clínico ("quem fez
  -- o quê") e o grau é contratual ("quanto recebe por isso").
  grau_participacao text,
  usuario text, criado_em timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cc_equipe_papel_ck') then
    alter table public.cc_equipe add constraint cc_equipe_papel_ck
      check (papel in ('cirurgiao', 'primeiro_auxiliar', 'segundo_auxiliar',
                       'instrumentador', 'circulante', 'anestesista', 'perfusionista'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cc_equipe_nome_ck') then
    alter table public.cc_equipe add constraint cc_equipe_nome_ck
      check (length(btrim(nome)) >= 2);
  end if;
  -- Um cirurgião principal por cirurgia. Dois significaria que ninguém é o
  -- responsável, e é o responsável que responde pelo ato.
  if not exists (select 1 from pg_class where relname = 'cc_equipe_um_cirurgiao_idx') then
    create unique index cc_equipe_um_cirurgiao_idx
      on public.cc_equipe (cirurgia_id) where papel = 'cirurgiao';
  end if;
end $$;

create index if not exists cc_equipe_cirurgia_idx on public.cc_equipe (cirurgia_id);


-- ───────────────────────────────────────────────────────────
-- 4. MIGRAR O QUE JÁ EXISTE
--
-- `cc_cirurgias.cirurgiao` é texto livre e vira a primeira linha da equipe.
-- Não se inventa conselho nem CBO: o que não se sabe fica NULO, e a tela
-- mostra a lacuna. Preencher com palpite aqui seria pior que a ausência —
-- CBO errado derruba o registro inteiro no processamento.
-- ───────────────────────────────────────────────────────────
insert into public.cc_equipe (cirurgia_id, papel, nome, usuario)
select c.id, 'cirurgiao', btrim(c.cirurgiao), 'migracao-equipe'
  from public.cc_cirurgias c
 where c.cirurgiao is not null
   and length(btrim(c.cirurgiao)) >= 2
   and not exists (select 1 from public.cc_equipe e
                    where e.cirurgia_id = c.id and e.papel = 'cirurgiao');


-- ───────────────────────────────────────────────────────────
-- 5. QUEM PODE
-- ───────────────────────────────────────────────────────────
alter table public.cc_equipe enable row level security;

drop policy if exists cc_equipe_leitura on public.cc_equipe;
create policy cc_equipe_leitura on public.cc_equipe
  for select to authenticated
  using (public.pode_ver_algum('bloco'));

drop policy if exists cc_equipe_ins on public.cc_equipe;
create policy cc_equipe_ins on public.cc_equipe
  for insert to authenticated
  with check (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_equipe_upd on public.cc_equipe;
create policy cc_equipe_upd on public.cc_equipe
  for update to authenticated
  using (public.my_role() in ('adm_master', 'adm_silver'))
  with check (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_equipe_del on public.cc_equipe;
create policy cc_equipe_del on public.cc_equipe
  for delete to authenticated
  using (public.my_role() in ('adm_master', 'adm_silver'));

drop policy if exists cc_equipe_mod_ins on public.cc_equipe;
create policy cc_equipe_mod_ins on public.cc_equipe
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('bloco'));

drop policy if exists cc_equipe_mod_upd on public.cc_equipe;
create policy cc_equipe_mod_upd on public.cc_equipe
  as restrictive for update to authenticated
  using (public.pode_editar_algum('bloco'))
  with check (public.pode_editar_algum('bloco'));

drop policy if exists cc_equipe_mod_del on public.cc_equipe;
create policy cc_equipe_mod_del on public.cc_equipe
  as restrictive for delete to authenticated
  using (public.pode_editar_algum('bloco'));

-- ⚠️ A EQUIPE É CORRIGÍVEL (tem UPDATE e DELETE), ao contrário da trilha de
-- cirurgia segura. E é diferente de propósito: a equipe é cadastro do ato,
-- não registro de conferência. Trocar o auxiliar que entrou na sala é
-- correção administrativa normal, e exigir linha nova para isso encheria a
-- conta de membros fantasma. Quem conferiu segurança é append-only
-- (`cc_checklist`); quem operou é editável até a conta fechar.


-- ───────────────────────────────────────────────────────────
-- 6. O CARÁTER, no domínio que o Atendimento já usa
--
-- Reaproveita `at_dominios` em vez de criar lista nova: o hospital já
-- configura caráter ali para o atendimento, e duas listas divergiriam —
-- que é exatamente o defeito da taxonomia duplicada que já fez seis grupos
-- sumirem do menu.
-- ───────────────────────────────────────────────────────────
-- ⚠️ `where not exists` e NÃO `on conflict`: `at_dominios` não tem índice
-- único em (dominio, codigo) — só um índice comum de listagem. Com
-- `on conflict do nothing` nada conflitaria, e rodar a migração duas vezes
-- criaria caráter duplicado na lista do hospital.
insert into public.at_dominios (dominio, codigo, nome, ordem, ativo, usuario)
select v.codigo_dominio, v.codigo, v.nome, v.ordem, true, 'migracao-cirurgia-carater'
  from (values ('carater', 'eletivo',    'Eletivo',    1),
               ('carater', 'urgencia',   'Urgência',   2),
               ('carater', 'emergencia', 'Emergência', 3))
       as v(codigo_dominio, codigo, nome, ordem)
 where not exists (select 1 from public.at_dominios d
                    where d.dominio = v.codigo_dominio and d.codigo = v.codigo);


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-cirurgia-paciente-equipe-codigo.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'coluna cc_cirurgias.' || c as item,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_cirurgias' and column_name = c) as ok
    from unnest(array['procedimento_cod','carater_cod','cancelado_em','cancelado_por']) c
  union all
  select '🔴 FK cirurgia → paciente',
         exists (select 1 from pg_constraint where conname = 'cc_cirurgias_paciente_fk')
  union all
  select 'nenhuma cirurgia com prontuário órfão',
         not exists (select 1 from public.cc_cirurgias c
                      where c.prontuario is not null and btrim(c.prontuario) <> ''
                        and not exists (select 1 from public.pacientes p where p.prontuario = c.prontuario))
  union all
  select 'tabela cc_equipe existe', to_regclass('public.cc_equipe') is not null
  union all
  select 'coluna cc_equipe.' || c,
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'cc_equipe' and column_name = c)
    from unnest(array['cirurgia_id','papel','profissional_username','nome','conselho',
                      'registro_conselho','cbo','grau_participacao']) c
  union all
  select 'trava ' || k, exists (select 1 from pg_constraint where conname = k)
    from unnest(array['cc_equipe_papel_ck','cc_equipe_nome_ck']) k
  union all
  select 'só um cirurgião principal por cirurgia',
         exists (select 1 from pg_class where relname = 'cc_equipe_um_cirurgiao_idx')
  union all
  select 'política ' || p,
         exists (select 1 from pg_policies where tablename = 'cc_equipe' and policyname = p)
    from unnest(array['cc_equipe_leitura','cc_equipe_ins','cc_equipe_upd','cc_equipe_del',
                      'cc_equipe_mod_ins','cc_equipe_mod_upd','cc_equipe_mod_del']) p
  union all
  select 'caráter no domínio ' || d,
         exists (select 1 from public.at_dominios where dominio = 'carater' and codigo = d)
    from unnest(array['eletivo','urgencia','emergencia']) d
  union all
  select 'cirurgiões antigos viraram linha de equipe',
         not exists (select 1 from public.cc_cirurgias c
                      where c.cirurgiao is not null and length(btrim(c.cirurgiao)) >= 2
                        and not exists (select 1 from public.cc_equipe e
                                         where e.cirurgia_id = c.id and e.papel = 'cirurgiao'))
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas
                  where arquivo = 'migracao-cirurgia-paciente-equipe-codigo.sql')
) x;
