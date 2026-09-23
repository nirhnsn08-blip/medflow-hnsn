-- ═══════════════════════════════════════════════════════════
-- FARMÁCIA DO HOSPITAL — internação, validação, controlados e devolução
--
-- 🔴 O QUE ESTAVA FALTANDO (17/09/2026)
-- A farmácia só enxergava o PRONTO-SOCORRO. A prescrição feita no
-- prontuário de internação (`pep_prescricoes`) não chegava à fila: ninguém
-- validava, a dispensação do internado era "avulsa" com iniciais digitadas
-- à mão, e o custo por paciente furava justamente onde o hospital mais
-- gasta. Esta migração dá ao banco o que as telas novas precisam:
--
--   PASSO 1  a farmácia LÊ a prescrição da internação (sem ganhar escrita)
--   PASSO 2  a validação farmacêutica da prescrição (tabela nova, append-only)
--   PASSO 3  o kardex liga a saída ao item da internação
--   PASSO 4  devolução do setor ligada à dispensação que ela desfaz
--   PASSO 5  controlados: a lista da Portaria 344/98 e quem prescreveu
--   PASSO 6  intervenção farmacêutica também para o item da internação
--   PASSO 7  o preparo do PS passa a contar a baixa LÍQUIDA
--
-- ADITIVA: nenhuma coluna muda de tipo, nada é apagado, toda coluna nova
-- nasce nula. IDEMPOTENTE: pode rodar duas vezes.
--
-- ⚠️ ORDEM: DEMO primeiro, depois PRINCIPAL, e só então o merge. As telas
-- novas leem tabelas e colunas que só existem depois disto.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- PASSO 2 (vem antes do 1 porque o 1 dá leitura a esta tabela)
-- A VALIDAÇÃO FARMACÊUTICA DA PRESCRIÇÃO DA INTERNAÇÃO
--
-- Uma linha por avaliação. Não tem UPDATE nem DELETE: reavaliar é gravar
-- outra linha, e a última vale. Três resultados:
--   aprovada                sem ressalva
--   aprovada_com_ressalva   dispensa, mas a observação é obrigatória
--   pendente_prescritor     a farmácia NÃO libera até o prescritor responder
--                           (observação obrigatória)
--
-- Só farmacêutico grava — conferido no BANCO pela categoria do perfil, não
-- só na tela. Tela não é defesa: PATCH direto pela API passaria por cima.
-- ───────────────────────────────────────────────────────────
create table if not exists public.farm_validacoes (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  prontuario text not null,
  resultado text not null
    check (resultado in ('aprovada', 'aprovada_com_ressalva', 'pendente_prescritor')),
  observacao text,
  -- O retrato do que o farmacêutico viu ao validar. Se a base de interações
  -- mudar amanhã, dá para saber com quantos alertas ele aprovou.
  alertas_altos int not null default 0,
  alertas_total int not null default 0,
  intervencao_id bigint references public.farm_intervencoes(id) on delete set null,
  farmaceutico_nome text not null,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now(),
  constraint farm_valid_obs_ck
    check (resultado = 'aprovada' or nullif(btrim(coalesce(observacao, '')), '') is not null)
);
create index if not exists farm_valid_presc_idx on public.farm_validacoes (prescricao_id, criado_em desc);
create index if not exists farm_valid_ep_idx on public.farm_validacoes (episodio_id);

comment on table public.farm_validacoes is
  'Avaliação farmacêutica da prescrição da internação. Append-only: reavaliar é nova linha; vale a mais recente.';

alter table public.farm_validacoes enable row level security;

drop policy if exists farm_validacoes_leitura on public.farm_validacoes;
create policy farm_validacoes_leitura on public.farm_validacoes
  for select to authenticated
  using (public.pode_ver_algum('farmacia', 'paciente'));

drop policy if exists farm_validacoes_ins on public.farm_validacoes;
create policy farm_validacoes_ins on public.farm_validacoes
  for insert to authenticated
  with check (
    public.my_role() in ('adm_master', 'adm_silver')
    and exists (select 1 from public.profiles pr
                 where pr.id = auth.uid() and pr.categoria = 'farmaceutico')
  );

-- A mesma trava restritiva que o gerar-rls.mjs põe em toda tabela de módulo.
drop policy if exists farm_validacoes_mod_ins on public.farm_validacoes;
create policy farm_validacoes_mod_ins on public.farm_validacoes
  as restrictive for insert to authenticated
  with check (public.pode_editar_algum('farmacia'));
-- (sem política de update/delete: a avaliação é imutável)


-- ───────────────────────────────────────────────────────────
-- PASSO 1 — a farmácia LÊ a prescrição da internação
--
-- Espelha `LEITURA_EXTRA` de src/acesso/mapa-tabelas.js. O farmacêutico já
-- lia estas tabelas (tem `paciente: leitura`); quem não lia era o AUXILIAR,
-- que é quem separa — e, sem ler `pep_alergias`, recebia lista vazia, que o
-- RLS não distingue de "sem alergia".
--
-- 🔴 SÓ LEITURA. As políticas de escrita destas tabelas não são tocadas:
-- a farmácia não passa a gravar prescrição, evento nem alergia.
--
-- Apaga TODA política de SELECT antes de criar a nova: políticas
-- permissivas se somam, e uma sobra antiga manteria a regra anterior.
-- ───────────────────────────────────────────────────────────
do $leitura_farmacia$
declare
  t record;
  pol record;
begin
  for t in
    select * from (values
      ('pep_episodios',          'public.pode_ver_algum(''paciente'', ''farmacia'')'),
      ('pep_prescricoes',        'public.pode_ver_algum(''paciente'', ''farmacia'')'),
      ('pep_prescricao_itens',   'public.pode_ver_algum(''paciente'', ''farmacia'')'),
      ('pep_prescricao_eventos', 'public.pode_ver_algum(''paciente'', ''farmacia'')'),
      ('pep_alergias',           'public.pode_ver_algum(''paciente'', ''farmacia'')')
    ) as v(tabela, cond)
  loop
    if to_regclass('public.' || t.tabela) is null then
      raise notice 'PULADA (não existe aqui): %', t.tabela;
      continue;
    end if;
    for pol in
      select polname from pg_policy
       where polrelid = ('public.' || t.tabela)::regclass and polcmd = 'r'
    loop
      execute format('drop policy %I on public.%I', pol.polname, t.tabela);
    end loop;
    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   t.tabela || '_leitura', t.tabela, t.cond);
  end loop;
end
$leitura_farmacia$;


-- ───────────────────────────────────────────────────────────
-- PASSO 3 — o kardex liga a saída ao item da INTERNAÇÃO
--
-- `prescricao_item_id` já existe e aponta para o item do PS
-- (`ps_prescricao_itens`). O item da internação é OUTRA tabela, com ids que
-- se repetem entre as duas: guardar os dois na mesma coluna faria o item 5
-- do PS e o item 5 da internação somarem a mesma dispensação. Por isso uma
-- coluna nova, e a trava de que um movimento não aponta para os dois.
-- ───────────────────────────────────────────────────────────
alter table public.farm_movimentos
  add column if not exists pep_item_id bigint
    references public.pep_prescricao_itens(id) on delete set null,
  add column if not exists episodio_id bigint
    references public.pep_episodios(id) on delete set null;

create index if not exists farm_mov_pep_item_idx on public.farm_movimentos (pep_item_id)
  where pep_item_id is not null;
create index if not exists farm_mov_episodio_idx on public.farm_movimentos (episodio_id)
  where episodio_id is not null;

do $um_vinculo$
begin
  if not exists (select 1 from pg_constraint where conname = 'farm_mov_um_item_ck') then
    alter table public.farm_movimentos
      add constraint farm_mov_um_item_ck
      check (prescricao_item_id is null or pep_item_id is null);
  end if;
end
$um_vinculo$;

comment on column public.farm_movimentos.pep_item_id is
  'Item da prescrição da INTERNAÇÃO (pep_prescricao_itens). O do PS é prescricao_item_id — nunca os dois.';
comment on column public.farm_movimentos.episodio_id is
  'Episódio de internação da dispensação (custo por paciente internado).';


-- ───────────────────────────────────────────────────────────
-- PASSO 4 — DEVOLUÇÃO DO SETOR
--
-- Medicamento suspenso, alta com sobra, dose que não foi dada: volta para a
-- farmácia. Antes a única saída era o ESTORNO, que diz "este lançamento
-- estava errado" — e a dispensação não estava. Devolução diz "saiu certo e
-- voltou", e pode ser PARCIAL.
--
-- O banco garante, porque a tela não é barreira:
--   • é ENTRADA apontando para uma SAÍDA de dispensação;
--   • mesmo medicamento e mesmo lote (o comprimido volta para a caixa de
--     onde saiu — é o que mantém a validade e o rastro do lote);
--   • a soma das devoluções nunca passa do que saiu (senão se inventa
--     estoque, igual ao estorno duplo que o índice único já impede);
--   • dispensação estornada não recebe devolução, e dispensação com
--     devolução não pode ser estornada (as duas juntas devolveriam o mesmo
--     comprimido duas vezes).
-- ───────────────────────────────────────────────────────────
alter table public.farm_movimentos
  add column if not exists devolucao_de bigint
    references public.farm_movimentos(id) on delete restrict,
  -- Por que voltou ("item suspenso", "alta", "dose não administrada"). O
  -- kardex não tinha campo livre: o motivo ia parar em `documento`, que é o
  -- número da nota ou da requisição.
  add column if not exists observacao text;

create index if not exists farm_mov_devolucao_idx on public.farm_movimentos (devolucao_de)
  where devolucao_de is not null;

do $devolucao_ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'farm_mov_estorno_ou_devolucao_ck') then
    alter table public.farm_movimentos
      add constraint farm_mov_estorno_ou_devolucao_ck
      check (estorno_de is null or devolucao_de is null);
  end if;
end
$devolucao_ck$;

comment on column public.farm_movimentos.devolucao_de is
  'Dispensação (saída) que esta entrada devolve. Parcial permitido; a soma não passa do que saiu.';

-- Quanto de uma dispensação já voltou, LÍQUIDO: devolução estornada (lançada
-- por engano e desfeita) não conta.
create or replace function public.farm_devolvido_de(p_saida bigint)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(d.quantidade), 0)
    from public.farm_movimentos d
   where d.devolucao_de = p_saida
     and not exists (select 1 from public.farm_movimentos e where e.estorno_de = d.id)
$$;

create or replace function public.farm_valida_devolucao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o record;
  ja_devolvido numeric;
begin
  -- (a) estorno de uma dispensação que tem devolução em vigor: recusa
  if new.estorno_de is not null then
    if public.farm_devolvido_de(new.estorno_de) > 0 then
      raise exception 'Esta dispensação tem devolução registrada. Estornar agora devolveria ao estoque o que já voltou. Estorne primeiro a devolução.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.devolucao_de is null then
    return new;
  end if;

  -- trava a linha original: duas devoluções simultâneas não podem ler o
  -- mesmo "já devolvido" e passar as duas
  select id, medicamento_id, lote, tipo, motivo, quantidade, estorno_de into o
    from public.farm_movimentos where id = new.devolucao_de for update;

  if o.id is null then
    raise exception 'Devolução aponta para um movimento inexistente (id %).', new.devolucao_de;
  end if;
  if new.tipo <> 'entrada' then
    raise exception 'Devolução é entrada no estoque.' using errcode = 'check_violation';
  end if;
  if o.tipo <> 'saida' or coalesce(o.motivo, '') <> 'Dispensação' or o.estorno_de is not null then
    raise exception 'Só se devolve uma dispensação (saída com motivo Dispensação).' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.farm_movimentos where estorno_de = o.id) then
    raise exception 'Esta dispensação foi estornada — não há o que devolver.' using errcode = 'check_violation';
  end if;
  if o.medicamento_id <> new.medicamento_id then
    raise exception 'Devolução tem que ser do mesmo medicamento que saiu.' using errcode = 'check_violation';
  end if;
  if coalesce(o.lote, '') <> coalesce(new.lote, '') then
    raise exception 'Devolução volta para o mesmo lote de onde saiu ("%").', coalesce(o.lote, '')
      using errcode = 'check_violation';
  end if;

  ja_devolvido := public.farm_devolvido_de(o.id);
  if ja_devolvido + new.quantidade > o.quantidade then
    raise exception 'Devolução maior que o dispensado: saíram %, já voltaram %, cabem no máximo %.',
      o.quantidade, ja_devolvido, o.quantidade - ja_devolvido
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists farm_valida_devolucao_trg on public.farm_movimentos;
create trigger farm_valida_devolucao_trg before insert on public.farm_movimentos
  for each row execute function public.farm_valida_devolucao();


-- ───────────────────────────────────────────────────────────
-- PASSO 5 — CONTROLADOS: a lista da Portaria 344/98 e quem prescreveu
--
-- Até aqui o medicamento era só "controlado: sim/não". A lista (A1, B1,
-- C1…) é o que diz o tipo de receita e separa a escrituração, e a saída de
-- controlado para paciente não guardava QUEM PRESCREVEU — o dado que a
-- fiscalização pede primeiro.
--
-- A lista nasce vazia: cada hospital classifica o próprio catálogo
-- (Farmácia → Estoque → editar medicamento). Nenhum valor é semeado.
--
-- A trava de prescritor vale para a saída de DISPENSAÇÃO de medicamento
-- marcado como controlado, a partir de agora. Lançamento antigo não é
-- tocado; estorno e devolução não precisam (apontam para a saída original).
-- ───────────────────────────────────────────────────────────
alter table public.farm_medicamentos
  add column if not exists lista_controle text;

do $lista_ck$
begin
  if not exists (select 1 from pg_constraint where conname = 'farm_med_lista_controle_ck') then
    alter table public.farm_medicamentos
      add constraint farm_med_lista_controle_ck
      check (lista_controle is null
             or (lista_controle in ('A1','A2','A3','B1','B2','C1','C2','C3','C4','C5')
                 and controlado is true));
  end if;
end
$lista_ck$;

comment on column public.farm_medicamentos.lista_controle is
  'Lista da Portaria SVS/MS 344/98 (A1..C5). Só em medicamento controlado.';

alter table public.farm_movimentos
  add column if not exists prescritor_nome text,
  add column if not exists prescritor_registro text,   -- CRM/UF, CRO/UF…
  add column if not exists receita_numero text;        -- notificação/receita, quando houver

comment on column public.farm_movimentos.prescritor_nome is
  'Quem prescreveu. Obrigatório na dispensação de medicamento controlado.';
comment on column public.farm_movimentos.receita_numero is
  'Número da notificação ou receita, quando a dispensação veio de receita (ex.: avulsa).';

create or replace function public.farm_controlado_exige_prescritor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.tipo <> 'saida' or coalesce(new.motivo, '') <> 'Dispensação' or new.estorno_de is not null then
    return new;
  end if;
  if not exists (select 1 from public.farm_medicamentos m
                  where m.id = new.medicamento_id and m.controlado is true) then
    return new;
  end if;
  if nullif(btrim(coalesce(new.prescritor_nome, '')), '') is null then
    raise exception 'Dispensação de medicamento controlado sem o nome de quem prescreveu. A escrituração da Portaria 344/98 exige o prescritor.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists farm_controlado_exige_prescritor_trg on public.farm_movimentos;
create trigger farm_controlado_exige_prescritor_trg before insert on public.farm_movimentos
  for each row execute function public.farm_controlado_exige_prescritor();


-- ───────────────────────────────────────────────────────────
-- PASSO 6 — intervenção farmacêutica no item da internação
-- ───────────────────────────────────────────────────────────
alter table public.farm_intervencoes
  add column if not exists pep_item_id bigint
    references public.pep_prescricao_itens(id) on delete set null,
  add column if not exists episodio_id bigint
    references public.pep_episodios(id) on delete set null;


-- ───────────────────────────────────────────────────────────
-- PASSO 7 — o preparo do PS conta a baixa LÍQUIDA
--
-- O trigger `preparo_exige_baixa` contava só as SAÍDAS. Uma separação
-- estornada inteira (saiu 2, voltou 2) ainda deixava marcar "pronto" — a
-- mesma mentira que ele existe para impedir, pela outra ponta. A regra da
-- tela (`dispensadoDoItem`, em src/farmacia/preparo.js) já era líquida.
-- ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION preparo_exige_baixa() RETURNS trigger AS $$
DECLARE
  n_itens    int;
  n_liquido  numeric;
  v_atend    bigint;
BEGIN
  IF NEW.status IS DISTINCT FROM 'pronto' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'pronto' THEN RETURN NEW; END IF;

  SELECT atendimento_id INTO v_atend
    FROM public.ps_registros WHERE id = NEW.registro_id;

  SELECT count(*) INTO n_itens
    FROM public.ps_prescricao_itens i
   WHERE i.registro_id = NEW.registro_id
      OR (i.registro_id IS NULL AND v_atend IS NOT NULL AND i.atendimento_id = v_atend);

  IF n_itens = 0 THEN RETURN NEW; END IF;

  -- líquido POR ITEM: basta um item com saldo de saída positivo
  SELECT count(*) INTO n_liquido FROM (
    SELECT m.prescricao_item_id
      FROM public.farm_movimentos m
      JOIN public.ps_prescricao_itens i ON i.id = m.prescricao_item_id
     WHERE (i.registro_id = NEW.registro_id
            OR (i.registro_id IS NULL AND v_atend IS NOT NULL AND i.atendimento_id = v_atend))
     GROUP BY m.prescricao_item_id
    HAVING sum(CASE WHEN m.tipo = 'entrada' THEN -m.quantidade ELSE m.quantidade END) > 0
  ) x;

  IF n_liquido = 0 THEN
    RAISE EXCEPTION
      'A prescrição % não tem nenhum item separado (% item(ns) prescrito(s), 0 baixa líquida de estoque). '
      'Marcar como pronta faria o sistema afirmar que o paciente recebeu um medicamento que ninguém '
      'tirou da prateleira — ou que voltou para ela.', NEW.registro_id, n_itens
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- O PostgREST guarda o esquema em cache: sem isto as colunas e a tabela
-- novas só aparecem para o app depois que o cache expirar.
notify pgrst, 'reload schema';

insert into public.migracoes_aplicadas (arquivo)
values ('migracao-farmacia-hospital.sql') on conflict do nothing;

reset valentrax.quem;


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA — é a ÚLTIMA consulta de propósito: o SQL Editor só mostra
-- o resultado dela. Toda linha deve vir com ✅.
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao from (
  select 'tabela farm_validacoes' as item,
         to_regclass('public.farm_validacoes') is not null as ok
  union all
  select 'só farmacêutico grava validação (política)',
         exists (select 1 from pg_policies where tablename = 'farm_validacoes' and policyname = 'farm_validacoes_ins')
  union all
  select 'farmácia lê ' || t,
         exists (select 1 from pg_policies where tablename = t and cmd = 'SELECT' and qual like '%farmacia%')
    from unnest(array['pep_episodios','pep_prescricoes','pep_prescricao_itens','pep_prescricao_eventos','pep_alergias']) t
  union all
  select 'kardex: coluna ' || c,
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'farm_movimentos' and column_name = c)
    from unnest(array['pep_item_id','episodio_id','devolucao_de','observacao','prescritor_nome','prescritor_registro','receita_numero']) c
  union all
  select 'catálogo: coluna lista_controle',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'farm_medicamentos' and column_name = 'lista_controle')
  union all
  select 'intervenção: coluna pep_item_id',
         exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'farm_intervencoes' and column_name = 'pep_item_id')
  union all
  select 'trigger ' || g, exists (select 1 from pg_trigger where tgname = g)
    from unnest(array['farm_valida_devolucao_trg','farm_controlado_exige_prescritor_trg','farm_preparo_exige_baixa']) g
  union all
  select 'migração anotada no registro',
         exists (select 1 from public.migracoes_aplicadas where arquivo = 'migracao-farmacia-hospital.sql')
) x;
