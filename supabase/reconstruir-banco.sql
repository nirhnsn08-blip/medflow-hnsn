-- ============================================================
-- Valentrax — RECONSTRUÇÃO COMPLETA DO BANCO
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/gerar-reconstrucao.mjs
--
-- ⚠️⚠️ ESTE SCRIPT APAGA TODO O SCHEMA "public" E O RECRIA DO ZERO.
--    TODOS OS DADOS DAS TABELAS DA APLICAÇÃO SÃO PERDIDOS.
--
--    Use APENAS num banco descartável (demo/teste) ou num banco NOVO.
--    NUNCA rode no banco de um hospital em uso.
--
--    Antes de rodar, confirme no topo do painel que o projeto é o certo.
--
-- O QUE ELE PRESERVA
--    • Os usuários (o schema "auth" não é tocado).
--    • Os perfis e papéis (adm_master etc.) — são salvos em "_backup"
--      antes do drop e restaurados no fim. Sem isso, todo mundo voltaria
--      como "visualizador" e o admin perderia o acesso.
--
-- CONTEÚDO: 30 scripts, na ordem em que rodaram no banco principal.
-- ============================================================


-- ════════════════════════════════════════════════════════════
-- PARTE 0/4 — TRAVA DE SEGURANÇA
--
-- Colar este script no projeto errado destruiria o banco de um hospital.
-- Por isso ele exige uma confirmação deliberada: rode ANTES, sozinho,
-- NO MESMO projeto onde vai reconstruir:
--
--     create table public._confirmo_reconstruir();
--
-- Sem essa tabela, o script aborta e nada é alterado. Ela some junto no
-- drop, então a confirmação vale uma vez só — da próxima, confirme de novo.
-- ════════════════════════════════════════════════════════════
do $guarda$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = '_confirmo_reconstruir'
  ) then
    raise exception E'RECONSTRUCAO ABORTADA - nada foi alterado.\n\n'
      'Confirme que este e o banco DESCARTAVEL certo rodando, sozinho, neste projeto:\n'
      '    create table public._confirmo_reconstruir();\n\n'
      'Depois rode este script inteiro de novo.';
  end if;
end
$guarda$;


-- ════════════════════════════════════════════════════════════
-- PARTE 1/4 — Preservar perfis e papéis
-- ════════════════════════════════════════════════════════════
create schema if not exists _backup;

do $preservar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    drop table if exists _backup.profiles_antes;
    execute 'create table _backup.profiles_antes as select * from public.profiles';
    raise notice 'Perfis preservados em _backup.profiles_antes';
  else
    raise notice 'Nao havia public.profiles — nada a preservar';
  end if;
end
$preservar$;


-- ════════════════════════════════════════════════════════════
-- PARTE 2/4 — Zerar o schema public
-- ════════════════════════════════════════════════════════════
drop schema public cascade;
create schema public;

grant usage  on schema public to anon, authenticated, service_role;
grant all    on schema public to postgres, service_role;
alter default privileges in schema public
  grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- PARTE 3/4 — Estrutura (30 scripts na ordem cronológica)
-- ════════════════════════════════════════════════════════════

-- ┌────────────────────────────────────────────────────────────
-- │ 01/30 — schema.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- MedFlow HNSN — Schema do banco (Supabase / PostgreSQL)
-- Estrutura ATUAL e SEGURA (login via Supabase Auth + RLS por papel).
-- Serve de referência/backup. Rode no SQL Editor apenas se precisar recriar.
-- ⚠️ NÃO use policies "allow all" — isso abriria os dados para qualquer um.
-- ═══════════════════════════════════════════════════════════

-- ===== Perfis / papéis =====
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique,
  nome       text,
  role       text not null default 'visualizador',   -- adm_master | adm_silver | analista | visualizador
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create or replace function public.my_role() returns text
language sql security definer stable set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, nome, role)
  values (new.id, split_part(new.email,'@',1),
          coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'role', 'visualizador'))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_auth on public.profiles for select to authenticated using (true);

-- ===== Atendimentos =====
create table if not exists public.atendimentos (
  id bigserial primary key,
  data date not null, especialidade text not null,
  primeiras int default 0, retornos int default 0, ofertadas int default 0,
  realizadas int default 0, livres int default 0, emergencias int default 0, faltas int default 0,
  usuario text, created_at timestamptz default now(),
  unique (data, especialidade)
);
alter table public.atendimentos enable row level security;
drop policy if exists atend_select on public.atendimentos;
drop policy if exists atend_insert on public.atendimentos;
drop policy if exists atend_update on public.atendimentos;
drop policy if exists atend_delete on public.atendimentos;
create policy atend_select on public.atendimentos for select to authenticated using (true);
create policy atend_insert on public.atendimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy atend_update on public.atendimentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy atend_delete on public.atendimentos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Auditoria (imutável: só inserir e ler) =====
create table if not exists public.auditoria (
  id bigserial primary key, ts timestamptz default now(),
  usuario text, acao text, alvo text
);
alter table public.auditoria enable row level security;
drop policy if exists audit_insert on public.auditoria;
drop policy if exists audit_select on public.auditoria;
create policy audit_insert on public.auditoria for insert to authenticated with check (true);
create policy audit_select on public.auditoria for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));

-- ===== Giro de Leitos =====
create table if not exists public.leitos (
  identificacao text primary key,
  status text not null default 'livre',   -- livre | ocupado | interditado
  iniciais text, prontuario text, motivo text, cid text,
  data_internacao date, dias_previstos int, interdicao_motivo text,
  usuario text, updated_at timestamptz default now()
);
alter table public.leitos enable row level security;
drop policy if exists leitos_select on public.leitos;
drop policy if exists leitos_insert on public.leitos;
drop policy if exists leitos_update on public.leitos;
drop policy if exists leitos_delete on public.leitos;
create policy leitos_select on public.leitos for select to authenticated using (true);
create policy leitos_insert on public.leitos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy leitos_update on public.leitos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy leitos_delete on public.leitos for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.leitos_saidas (
  id bigserial primary key, leito text, iniciais text, prontuario text,
  cid text, motivo text, data_internacao date, data_alta date,
  usuario text, created_at timestamptz default now()
);
alter table public.leitos_saidas enable row level security;
drop policy if exists saidas_select on public.leitos_saidas;
drop policy if exists saidas_insert on public.leitos_saidas;
create policy saidas_select on public.leitos_saidas for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));
create policy saidas_insert on public.leitos_saidas for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Fase 2: tempos de fluxo do leito + histórico de turnover
alter table public.leitos
  add column if not exists solic_em   timestamptz, add column if not exists disp_em    timestamptz,
  add column if not exists pronto_em  timestamptz, add column if not exists entrada_em timestamptz;
alter table public.leitos_saidas
  add column if not exists disp_em timestamptz, add column if not exists dias_permanencia int,
  add column if not exists desfecho text default 'alta';   -- alta | obito
create table if not exists public.leitos_turnover (
  id bigserial primary key, leito text,
  solic_em timestamptz, disp_em timestamptz, pronto_em timestamptz, entrada_em timestamptz,
  usuario text, created_at timestamptz default now()
);
alter table public.leitos_turnover enable row level security;
drop policy if exists turnover_select on public.leitos_turnover;
drop policy if exists turnover_insert on public.leitos_turnover;
create policy turnover_select on public.leitos_turnover for select to authenticated using (public.my_role() in ('adm_master','adm_silver'));
create policy turnover_insert on public.leitos_turnover for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Referência CID → dias de internação (sugestão editável) =====
create table if not exists public.cid_referencia (
  cid        text primary key,
  descricao  text,
  dias       int not null default 0,
  tratamento text,
  usuario    text,
  updated_at timestamptz default now()
);
alter table public.cid_referencia add column if not exists tratamento text;
alter table public.cid_referencia enable row level security;
drop policy if exists cidref_select on public.cid_referencia;
drop policy if exists cidref_insert on public.cid_referencia;
drop policy if exists cidref_update on public.cid_referencia;
drop policy if exists cidref_delete on public.cid_referencia;
create policy cidref_select on public.cid_referencia for select to authenticated using (true);
create policy cidref_insert on public.cid_referencia for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy cidref_update on public.cid_referencia for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy cidref_delete on public.cid_referencia for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== SCIH: isolamento por leito + casos de vigilância =====
alter table public.leitos add column if not exists isolamento text;  -- null | aereo | contato | goticulas

create table if not exists public.scih_casos (
  id bigserial primary key,
  iniciais text not null,
  prontuario text,
  leito text,
  isolamento text,                 -- aereo | contato | goticulas
  data_coleta date,
  data_resultado date,
  germe text,
  multirresistente boolean default false,
  antibiotico text,
  dias_antibiotico int,
  observacao text,
  status text not null default 'ativo',   -- ativo | encerrado
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.scih_casos enable row level security;
drop policy if exists scih_casos_select on public.scih_casos;
drop policy if exists scih_casos_insert on public.scih_casos;
drop policy if exists scih_casos_update on public.scih_casos;
drop policy if exists scih_casos_delete on public.scih_casos;
create policy scih_casos_select on public.scih_casos for select to authenticated using (true);
create policy scih_casos_insert on public.scih_casos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_casos_update on public.scih_casos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_casos_delete on public.scih_casos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Bloco Cirúrgico: salas + agenda/mapa + workflow do dia =====
create table if not exists public.cc_salas (
  nome text primary key,
  ordem int default 0,
  ativa boolean default true,
  usuario text, updated_at timestamptz default now()
);
alter table public.cc_salas enable row level security;
drop policy if exists ccs_select on public.cc_salas;
drop policy if exists ccs_insert on public.cc_salas;
drop policy if exists ccs_update on public.cc_salas;
drop policy if exists ccs_delete on public.cc_salas;
create policy ccs_select on public.cc_salas for select to authenticated using (true);
create policy ccs_insert on public.cc_salas for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccs_update on public.cc_salas for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccs_delete on public.cc_salas for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.cc_cirurgias (
  id bigserial primary key,
  data date not null,
  hora_prevista time,
  duracao_prev_min int,
  sala text,
  iniciais text not null, prontuario text,
  procedimento text not null,
  cirurgiao text, anestesista text, tipo_anestesia text,
  opme text,                            -- materiais e OPME necessários
  observacao text,
  status text not null default 'agendada', -- agendada | checkin | em_cirurgia | recuperacao | concluida | cancelada
  chk_sign_in boolean default false,    -- checklist cirurgia segura (OMS)
  chk_time_out boolean default false,
  chk_sign_out boolean default false,
  checkin_em timestamptz, entrada_sala_em timestamptz,
  inicio_anestesia_em timestamptz, inicio_cirurgia_em timestamptz,
  fim_cirurgia_em timestamptz, saida_sala_em timestamptz,
  rpa_entrada_em timestamptz, rpa_saida_em timestamptz,
  cancelamento_motivo text,
  usuario text, updated_at timestamptz default now()
);
create index if not exists cc_cirurgias_data_idx on public.cc_cirurgias (data, sala);
alter table public.cc_cirurgias enable row level security;
drop policy if exists ccc_select on public.cc_cirurgias;
drop policy if exists ccc_insert on public.cc_cirurgias;
drop policy if exists ccc_update on public.cc_cirurgias;
drop policy if exists ccc_delete on public.cc_cirurgias;
create policy ccc_select on public.cc_cirurgias for select to authenticated using (true);
create policy ccc_insert on public.cc_cirurgias for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccc_update on public.cc_cirurgias for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ccc_delete on public.cc_cirurgias for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Paciente 360: cadastro mínimo + evoluções (registro clínico imutável) =====
create table if not exists public.pacientes (
  prontuario text primary key,
  iniciais text not null,
  ano_nascimento int,
  sexo text,
  usuario text, updated_at timestamptz default now()
);
alter table public.pacientes enable row level security;
drop policy if exists pac_select on public.pacientes;
drop policy if exists pac_insert on public.pacientes;
drop policy if exists pac_update on public.pacientes;
drop policy if exists pac_delete on public.pacientes;
create policy pac_select on public.pacientes for select to authenticated using (true);
create policy pac_insert on public.pacientes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy pac_update on public.pacientes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy pac_delete on public.pacientes for delete to authenticated using (public.my_role() = 'adm_master');

-- Evoluções: registro clínico APPEND-ONLY (sem update/delete — como a auditoria)
create table if not exists public.pep_evolucoes (
  id bigserial primary key,
  prontuario text not null,
  tipo text not null default 'evolucao_medica',
  texto text not null,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_evolucoes_prontuario_idx on public.pep_evolucoes (prontuario, criado_em desc);
alter table public.pep_evolucoes enable row level security;
drop policy if exists pep_select on public.pep_evolucoes;
drop policy if exists pep_insert on public.pep_evolucoes;
create policy pep_select on public.pep_evolucoes for select to authenticated using (true);
create policy pep_insert on public.pep_evolucoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Pronto-Socorro: triagem Manchester + jornada do paciente =====
create table if not exists public.ps_atendimentos (
  id bigserial primary key,
  iniciais text not null, prontuario text, queixa text,
  chegada_em timestamptz not null default now(),
  classificacao text,                -- vermelho | laranja | amarelo | verde | azul
  triagem_em timestamptz,
  atendimento_em timestamptz,
  desfecho text,                     -- alta | internacao | transferencia | evasao | obito
  desfecho_em timestamptz,
  setor_destino text,                -- quando desfecho = internacao
  status text not null default 'aguardando_triagem', -- aguardando_triagem | aguardando_atendimento | em_atendimento | finalizado
  observacao text,
  usuario text, updated_at timestamptz default now()
);
alter table public.ps_atendimentos enable row level security;
drop policy if exists ps_select on public.ps_atendimentos;
drop policy if exists ps_insert on public.ps_atendimentos;
drop policy if exists ps_update on public.ps_atendimentos;
drop policy if exists ps_delete on public.ps_atendimentos;
create policy ps_select on public.ps_atendimentos for select to authenticated using (true);
create policy ps_insert on public.ps_atendimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_update on public.ps_atendimentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_delete on public.ps_atendimentos for delete to authenticated using (public.my_role() = 'adm_master');

-- Sinais vitais coletados na triagem (sugerem a classificação de Manchester)
alter table public.ps_atendimentos
  add column if not exists pa_sist int,
  add column if not exists pa_diast int,
  add column if not exists fc int,
  add column if not exists fr int,
  add column if not exists spo2 int,
  add column if not exists temp numeric(4,1),
  add column if not exists dor int,
  add column if not exists consciencia text,
  add column if not exists glicemia int,
  add column if not exists medico text;   -- médico responsável no desfecho

-- Histórico de aferições de sinais vitais (triagem + reavaliações) — APPEND-ONLY
create table if not exists public.ps_sinais (
  id bigserial primary key,
  atendimento_id bigint not null,
  pa_sist int, pa_diast int, fc int, fr int, spo2 int,
  temp numeric, dor int, consciencia text, glicemia int,
  classificacao_sugerida text,
  classificacao_escolhida text,
  aferido_em timestamptz not null default now(),
  usuario text
);
create index if not exists ps_sinais_atend_idx on public.ps_sinais (atendimento_id, aferido_em desc);
alter table public.ps_sinais enable row level security;
drop policy if exists pss_select on public.ps_sinais;
drop policy if exists pss_insert on public.ps_sinais;
create policy pss_select on public.ps_sinais for select to authenticated using (true);
create policy pss_insert on public.ps_sinais for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Registros do atendimento médico no PS: evolução, prescrição e exames.
-- Evolução/prescrição são IMUTÁVEIS (update só para tipo=exame: status/resultado).
create table if not exists public.ps_registros (
  id bigserial primary key,
  atendimento_id bigint not null,
  tipo text not null,
  categoria text,
  texto text not null,
  status text,
  resultado text,
  resultado_em timestamptz,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_registros_atend_idx on public.ps_registros (atendimento_id, criado_em desc);
alter table public.ps_registros enable row level security;
drop policy if exists psr_select on public.ps_registros;
drop policy if exists psr_insert on public.ps_registros;
drop policy if exists psr_update on public.ps_registros;
create policy psr_select on public.ps_registros for select to authenticated using (true);
create policy psr_insert on public.ps_registros for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy psr_update on public.ps_registros for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver') and tipo = 'exame')
  with check (tipo = 'exame');

-- Itens estruturados da prescrição (Farmácia Fase B) — imutável
create table if not exists public.ps_prescricao_itens (
  id bigserial primary key,
  atendimento_id bigint not null,
  registro_id bigint,
  medicamento_id bigint,
  medicamento_nome text not null,
  unidade text,
  dose text,
  via text,
  quantidade numeric,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists ps_presc_itens_at_idx on public.ps_prescricao_itens (atendimento_id);
alter table public.ps_prescricao_itens enable row level security;
drop policy if exists ps_presc_itens_select on public.ps_prescricao_itens;
drop policy if exists ps_presc_itens_insert on public.ps_prescricao_itens;
create policy ps_presc_itens_select on public.ps_prescricao_itens for select to authenticated using (true);
create policy ps_presc_itens_insert on public.ps_prescricao_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- Checagem de medicação administrada — APPEND-ONLY.
-- A dispensação prova que o remédio saiu da farmácia; só esta tabela prova
-- que ele entrou no paciente, com hora e quem administrou.
create table if not exists public.ps_administracoes (
  id bigserial primary key,
  atendimento_id bigint not null references public.ps_atendimentos(id) on delete cascade,
  prescricao_item_id bigint references public.ps_prescricao_itens(id) on delete set null,
  medicamento_id bigint,
  medicamento_nome text not null,
  dose text,
  via text,
  status text not null default 'administrado',  -- administrado | nao_administrado
  motivo text,                                  -- preenchido quando nao_administrado
  observacao text,
  categoria text,                               -- enfermagem | tecnico | medica | outro
  administrado_em timestamptz not null default now(),
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_adm_atend_idx on public.ps_administracoes (atendimento_id, administrado_em desc);
create index if not exists ps_adm_item_idx  on public.ps_administracoes (prescricao_item_id);
alter table public.ps_administracoes enable row level security;
drop policy if exists ps_adm_select on public.ps_administracoes;
drop policy if exists ps_adm_insert on public.ps_administracoes;
create policy ps_adm_select on public.ps_administracoes for select to authenticated using (true);
create policy ps_adm_insert on public.ps_administracoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== SCIH Fase B: base de germes com embasamento =====
create table if not exists public.scih_germes (
  nome text primary key,
  tipo text not null default 'multirresistente',  -- multirresistente | sensivel
  isolamento text,                                 -- aereo | contato | goticulas | null
  embasamento text,
  observacao text,
  usuario text,
  updated_at timestamptz default now()
);
alter table public.scih_germes enable row level security;
drop policy if exists scih_germes_select on public.scih_germes;
drop policy if exists scih_germes_insert on public.scih_germes;
drop policy if exists scih_germes_update on public.scih_germes;
drop policy if exists scih_germes_delete on public.scih_germes;
create policy scih_germes_select on public.scih_germes for select to authenticated using (true);
create policy scih_germes_insert on public.scih_germes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_germes_update on public.scih_germes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_germes_delete on public.scih_germes for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== SCIH Fase C: indicadores mensais (lançamento manual) =====
create table if not exists public.scih_indicadores (
  competencia text primary key,          -- 'YYYY-MM'
  exames_lab int, exames_imagem int,
  culturas_coletadas int, culturas_positivas int,
  pacientes_dia int, ventilador_dia int,
  higiene_oportunidades int, higiene_realizadas int,
  pav_casos int,
  antimicrobiano_dot int,                -- dias de terapia antimicrobiana (DOT)
  cir_cesariana int, isc_cesariana int,
  cir_oftalmo int,   isc_oftalmo int,
  cir_artroplastia int, isc_artroplastia int,
  treinamentos int, treinamentos_participantes int,
  observacao text,
  usuario text, updated_at timestamptz default now()
);
alter table public.scih_indicadores enable row level security;
drop policy if exists scih_ind_select on public.scih_indicadores;
drop policy if exists scih_ind_insert on public.scih_indicadores;
drop policy if exists scih_ind_update on public.scih_indicadores;
drop policy if exists scih_ind_delete on public.scih_indicadores;
create policy scih_ind_select on public.scih_indicadores for select to authenticated using (true);
create policy scih_ind_insert on public.scih_indicadores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_ind_update on public.scih_indicadores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy scih_ind_delete on public.scih_indicadores for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Monitoramento: setores + fila de solicitações de leito =====
create table if not exists public.setores (
  nome text primary key,
  alerta_amarelo int default 90, alerta_vermelho int default 100, ordem int default 0,
  usuario text, updated_at timestamptz default now()
);
alter table public.setores enable row level security;
drop policy if exists setores_select on public.setores;
drop policy if exists setores_write  on public.setores;
create policy setores_select on public.setores for select to authenticated using (true);
create policy setores_write  on public.setores for all    to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));

alter table public.leitos add column if not exists setor text;

create table if not exists public.solicitacoes (
  id bigserial primary key,
  iniciais text, setor_origem text, setor_destino text,
  hora_pedido timestamptz default now(), status text default 'aguardando',
  usuario text, created_at timestamptz default now()
);
alter table public.solicitacoes enable row level security;
drop policy if exists solic_select on public.solicitacoes;
drop policy if exists solic_write  on public.solicitacoes;
create policy solic_select on public.solicitacoes for select to authenticated using (true);
create policy solic_write  on public.solicitacoes for all    to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));

-- ===== Farmácia — Fase A: catálogo + estoque (lote/validade, kardex) =====
create table if not exists public.farm_medicamentos (
  id bigserial primary key,
  nome text not null,                    -- descrição/apresentação (ex.: "Dipirona 500mg comprimido")
  principio_ativo text,
  classe text,                           -- classe terapêutica (analgésicos, antibióticos, insulinas...)
  forma text,                            -- comprimido, ampola, frasco...
  concentracao text,                     -- 500 mg, 10 mg/mL...
  unidade text default 'unidade',        -- unidade de dispensação (comprimido, mL, ampola)
  controlado boolean default false,      -- Portaria 344/98 (psicotrópicos/entorpecentes)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_medic_nome_idx on public.farm_medicamentos (lower(nome));
alter table public.farm_medicamentos enable row level security;
drop policy if exists farm_medic_select on public.farm_medicamentos;
drop policy if exists farm_medic_insert on public.farm_medicamentos;
drop policy if exists farm_medic_update on public.farm_medicamentos;
drop policy if exists farm_medic_delete on public.farm_medicamentos;
create policy farm_medic_select on public.farm_medicamentos for select to authenticated using (true);
create policy farm_medic_insert on public.farm_medicamentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_update on public.farm_medicamentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_delete on public.farm_medicamentos for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.farm_lotes (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists farm_lotes_uq on public.farm_lotes (medicamento_id, lote);
alter table public.farm_lotes enable row level security;
drop policy if exists farm_lotes_select on public.farm_lotes;
create policy farm_lotes_select on public.farm_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.farm_movimentos (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, dispensação, perda/vencimento, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  paciente_iniciais text, paciente_prontuario text,   -- p/ dispensação (Fase B)
  atendimento_id bigint,                -- ps_atendimentos.id (dispensação vinda do PS)
  prescricao_item_id bigint,            -- ps_prescricao_itens.id (item dispensado)
  setor text,                           -- destino (dispensação avulsa a internados)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_mov_medic_idx on public.farm_movimentos (medicamento_id, created_at desc);
create index if not exists farm_mov_presc_idx on public.farm_movimentos (prescricao_item_id);
create index if not exists farm_mov_atend_idx on public.farm_movimentos (atendimento_id);
alter table public.farm_movimentos enable row level security;
drop policy if exists farm_mov_select on public.farm_movimentos;
drop policy if exists farm_mov_insert on public.farm_movimentos;
create policy farm_mov_select on public.farm_movimentos for select to authenticated using (true);
create policy farm_mov_insert on public.farm_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.farm_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.farm_lotes
    where medicamento_id = new.medicamento_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.farm_lotes (medicamento_id, lote, validade, quantidade)
      values (new.medicamento_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.farm_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.farm_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists farm_movimento_trg on public.farm_movimentos;
create trigger farm_movimento_trg before insert on public.farm_movimentos
  for each row execute function public.farm_aplica_movimento();

-- ===== Farmácia Clínica — Fase 1: motor de alertas (atributos clínicos) =====
alter table public.farm_medicamentos
  add column if not exists grupo_terapeutico text,
  add column if not exists dose_maxima_dia numeric,
  add column if not exists dose_maxima_unid text,
  add column if not exists duracao_maxima_dias int,
  add column if not exists nao_triturar boolean default false,
  add column if not exists inapropriado_idoso boolean default false,
  add column if not exists motivo_idoso text,
  add column if not exists inapropriado_pediatrico boolean default false,
  add column if not exists motivo_pediatrico text,
  add column if not exists idade_pediatrica int,
  add column if not exists ajuste_renal text,
  add column if not exists ajuste_hepatico text,
  add column if not exists obs_clinica text;

alter table public.ps_prescricao_itens
  add column if not exists dose_valor numeric,
  add column if not exists dose_unidade text,
  add column if not exists frequencia_dia numeric,
  add column if not exists duracao_dias numeric;

alter table public.ps_atendimentos
  add column if not exists idade int,
  add column if not exists peso numeric(5,1),
  add column if not exists clearance_renal numeric,
  add column if not exists funcao_hepatica text,
  add column if not exists alergias text,
  add column if not exists em_sonda boolean default false,
  add column if not exists gestante boolean default false;

-- ===== Farmácia Clínica — Fase 2: interações + incompatibilidade em Y (pares) =====
create table if not exists public.farm_interacoes (
  id bigserial primary key,
  substancia_a text not null, substancia_b text not null,
  gravidade text not null default 'moderada',   -- grave | moderada | leve
  descricao text, conduta text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.farm_interacoes enable row level security;
drop policy if exists farm_inter_select on public.farm_interacoes;
drop policy if exists farm_inter_insert on public.farm_interacoes;
drop policy if exists farm_inter_update on public.farm_interacoes;
drop policy if exists farm_inter_delete on public.farm_interacoes;
create policy farm_inter_select on public.farm_interacoes for select to authenticated using (true);
create policy farm_inter_insert on public.farm_interacoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_update on public.farm_interacoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_delete on public.farm_interacoes for delete to authenticated using (public.my_role() = 'adm_master');

create table if not exists public.farm_incompat_y (
  id bigserial primary key,
  substancia_a text not null, substancia_b text not null,
  descricao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.farm_incompat_y enable row level security;
drop policy if exists farm_incy_select on public.farm_incompat_y;
drop policy if exists farm_incy_insert on public.farm_incompat_y;
drop policy if exists farm_incy_update on public.farm_incompat_y;
drop policy if exists farm_incy_delete on public.farm_incompat_y;
create policy farm_incy_select on public.farm_incompat_y for select to authenticated using (true);
create policy farm_incy_insert on public.farm_incompat_y for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_update on public.farm_incompat_y for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_delete on public.farm_incompat_y for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — fluxo de preparo (assinar→receber→preparo→pronto→retirada) =====
create table if not exists public.farm_preparo (
  id bigserial primary key,
  registro_id bigint not null unique,
  atendimento_id bigint,
  status text not null default 'preparo',    -- preparo | pronto | retirado | cancelado
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  retirado_em timestamptz, retirado_por text,
  observacao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_preparo_at_idx on public.farm_preparo (atendimento_id);
alter table public.farm_preparo enable row level security;
drop policy if exists farm_prep_select on public.farm_preparo;
drop policy if exists farm_prep_insert on public.farm_preparo;
drop policy if exists farm_prep_update on public.farm_preparo;
drop policy if exists farm_prep_delete on public.farm_preparo;
create policy farm_prep_select on public.farm_preparo for select to authenticated using (true);
create policy farm_prep_insert on public.farm_preparo for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_update on public.farm_preparo for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_delete on public.farm_preparo for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — custo unitário por medicamento (custos por paciente) =====
alter table public.farm_medicamentos
  add column if not exists custo_unitario numeric;

-- ===== Farmácia — medicamentos NÃO padronizados (trazidos pela família) =====
create table if not exists public.farm_nao_padronizados (
  id bigserial primary key,
  paciente_iniciais text not null,
  paciente_prontuario text, setor text,
  medicamento text not null, apresentacao text,
  quantidade numeric, unidade text,
  lote text, validade date,
  origem text, conferido boolean default false,
  status text not null default 'recebido',  -- recebido | em_uso | devolvido | descartado
  observacao text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_naopad_pac_idx on public.farm_nao_padronizados (paciente_prontuario);
alter table public.farm_nao_padronizados enable row level security;
drop policy if exists farm_naopad_select on public.farm_nao_padronizados;
drop policy if exists farm_naopad_insert on public.farm_nao_padronizados;
drop policy if exists farm_naopad_update on public.farm_nao_padronizados;
drop policy if exists farm_naopad_delete on public.farm_nao_padronizados;
create policy farm_naopad_select on public.farm_nao_padronizados for select to authenticated using (true);
create policy farm_naopad_insert on public.farm_nao_padronizados for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_update on public.farm_nao_padronizados for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_delete on public.farm_nao_padronizados for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Farmácia — Intervenção farmacêutica (estilo NoHarm) =====
create table if not exists public.farm_intervencoes (
  id bigserial primary key,
  atendimento_id bigint, prescricao_item_id bigint, medicamento_nome text,
  paciente_iniciais text, paciente_prontuario text,
  tipo text, gravidade text,
  problema text not null, conduta text,
  status text not null default 'pendente',  -- pendente | aceita | nao_aceita | resolvida | cancelada
  desfecho text, farmaceutico text,
  usuario text, created_at timestamptz default now(), updated_at timestamptz default now()
);
create index if not exists farm_interv_at_idx on public.farm_intervencoes (atendimento_id);
create index if not exists farm_interv_status_idx on public.farm_intervencoes (status);
alter table public.farm_intervencoes enable row level security;
drop policy if exists farm_interv2_select on public.farm_intervencoes;
drop policy if exists farm_interv2_insert on public.farm_intervencoes;
drop policy if exists farm_interv2_update on public.farm_intervencoes;
drop policy if exists farm_interv2_delete on public.farm_intervencoes;
create policy farm_interv2_select on public.farm_intervencoes for select to authenticated using (true);
create policy farm_interv2_insert on public.farm_intervencoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_update on public.farm_intervencoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_delete on public.farm_intervencoes for delete to authenticated using (public.my_role() = 'adm_master');

-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS (Estoque & Compras) — Fase A: fornecedores + catálogo de
-- materiais + estoque por lote/validade (kardex imutável)
-- ═══════════════════════════════════════════════════════════
-- Fornecedores (usados nas entradas; base das compras da Fase C)
create table if not exists public.sup_fornecedores (
  id bigserial primary key,
  nome text not null,                    -- razão social / nome fantasia
  cnpj text,
  contato text,                          -- pessoa de contato
  telefone text,
  email text,
  categorias text,                       -- o que fornece (texto livre: "material hospitalar, EPI")
  observacao text,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_forn_nome_idx on public.sup_fornecedores (lower(nome));
alter table public.sup_fornecedores enable row level security;
drop policy if exists sup_forn_select on public.sup_fornecedores;
drop policy if exists sup_forn_insert on public.sup_fornecedores;
drop policy if exists sup_forn_update on public.sup_fornecedores;
drop policy if exists sup_forn_delete on public.sup_fornecedores;
create policy sup_forn_select on public.sup_fornecedores for select to authenticated using (true);
create policy sup_forn_insert on public.sup_fornecedores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_update on public.sup_fornecedores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_delete on public.sup_fornecedores for delete to authenticated using (public.my_role() = 'adm_master');

-- Catálogo de materiais e insumos (almoxarifado)
create table if not exists public.sup_itens (
  id bigserial primary key,
  nome text not null,                    -- descrição (ex.: "Luva de procedimento M — cx 100")
  categoria text,                        -- material médico-hospitalar, higiene, EPI, escritório...
  unidade text default 'unidade',        -- unidade de controle (unidade, caixa, pacote, litro...)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  custo_unitario numeric,                -- R$ por unidade de controle (para BI)
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_itens_nome_idx on public.sup_itens (lower(nome));
alter table public.sup_itens enable row level security;
drop policy if exists sup_itens_select on public.sup_itens;
drop policy if exists sup_itens_insert on public.sup_itens;
drop policy if exists sup_itens_update on public.sup_itens;
drop policy if exists sup_itens_delete on public.sup_itens;
create policy sup_itens_select on public.sup_itens for select to authenticated using (true);
create policy sup_itens_insert on public.sup_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_update on public.sup_itens for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_delete on public.sup_itens for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.sup_lotes (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists sup_lotes_uq on public.sup_lotes (item_id, lote);
alter table public.sup_lotes enable row level security;
drop policy if exists sup_lotes_select on public.sup_lotes;
create policy sup_lotes_select on public.sup_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.sup_movimentos (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, consumo do setor, perda, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  fornecedor_id bigint references public.sup_fornecedores(id) on delete set null,
  setor text,                            -- destino do consumo (posto, centro cirúrgico...)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_mov_item_idx on public.sup_movimentos (item_id, created_at desc);
create index if not exists sup_mov_forn_idx on public.sup_movimentos (fornecedor_id);
alter table public.sup_movimentos enable row level security;
drop policy if exists sup_mov_select on public.sup_movimentos;
drop policy if exists sup_mov_insert on public.sup_movimentos;
create policy sup_mov_select on public.sup_movimentos for select to authenticated using (true);
create policy sup_mov_insert on public.sup_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();


-- ── Suprimentos Fase B: requisições de materiais pelos setores ──
create table if not exists public.sup_requisicoes (
  id bigserial primary key,
  setor text not null,
  itens jsonb not null default '[]',
  -- [{item_id, nome, unidade, qtd, qtd_atendida}]
  status text not null default 'aguardando',
  -- aguardando | separacao | pronto | entregue | cancelado
  observacao text,
  solicitado_por text,
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  entregue_em timestamptz, entregue_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_req_status_idx
  on public.sup_requisicoes (status, created_at desc);
alter table public.sup_requisicoes enable row level security;
drop policy if exists sup_req_select on public.sup_requisicoes;
drop policy if exists sup_req_insert on public.sup_requisicoes;
drop policy if exists sup_req_update on public.sup_requisicoes;
drop policy if exists sup_req_delete on public.sup_requisicoes;
create policy sup_req_select on public.sup_requisicoes
  for select to authenticated
  using (true);
create policy sup_req_insert on public.sup_requisicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_update on public.sup_requisicoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_delete on public.sup_requisicoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Suprimentos Fase C: pedidos de compra (materiais e medicamentos) ──
create table if not exists public.sup_pedidos (
  id bigserial primary key,
  fornecedor_id bigint
    references public.sup_fornecedores(id) on delete set null,
  fornecedor_nome text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade,
  --   qtd, custo_unit, qtd_recebida}]
  status text not null default 'aberto',
  -- aberto | enviado | parcial | recebido | cancelado
  previsao_entrega date,
  observacao text,
  enviado_em timestamptz,  enviado_por text,
  recebido_em timestamptz, recebido_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_ped_status_idx
  on public.sup_pedidos (status, created_at desc);
create index if not exists sup_ped_forn_idx
  on public.sup_pedidos (fornecedor_id);
alter table public.sup_pedidos enable row level security;
drop policy if exists sup_ped_select on public.sup_pedidos;
drop policy if exists sup_ped_insert on public.sup_pedidos;
drop policy if exists sup_ped_update on public.sup_pedidos;
drop policy if exists sup_ped_delete on public.sup_pedidos;
create policy sup_ped_select on public.sup_pedidos
  for select to authenticated
  using (true);
create policy sup_ped_insert on public.sup_pedidos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_update on public.sup_pedidos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_delete on public.sup_pedidos
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Suprimentos: inventário cíclico + custo por entrada + código de barras ──
-- 1) Contagens de inventário (append-only)
create table if not exists public.sup_inventarios (
  id bigserial primary key,
  item_id bigint not null
    references public.sup_itens(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_inv_item_idx
  on public.sup_inventarios (item_id, created_at desc);
alter table public.sup_inventarios enable row level security;
drop policy if exists sup_inv_select on public.sup_inventarios;
drop policy if exists sup_inv_insert on public.sup_inventarios;
create policy sup_inv_select on public.sup_inventarios
  for select to authenticated
  using (true);
create policy sup_inv_insert on public.sup_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: histórico de contagens imutável

-- 2) Custo unitário no movimento (compras reais → custo médio ponderado)
alter table public.sup_movimentos
  add column if not exists custo_unit numeric;
alter table public.farm_movimentos
  add column if not exists custo_unit numeric;

-- 3) Código de barras no catálogo
alter table public.sup_itens
  add column if not exists codigo_barras text;
create index if not exists sup_itens_barras_idx
  on public.sup_itens (codigo_barras);


-- ── Suprimentos: ponto de pedido (prazo de entrega por fornecedor) ──
alter table public.sup_fornecedores
  add column if not exists lead_time_dias int;

-- ── Suprimentos: cotação de compra (comparar preços entre fornecedores) ──
create table if not exists public.sup_cotacoes (
  id bigserial primary key,
  descricao text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade, qtd,
  --   precos: { <fornecedor_id>: preco_unit }}]
  fornecedores jsonb not null default '[]',   -- ids dos fornecedores cotados
  status text not null default 'aberta',      -- aberta | fechada | cancelada
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_cot_status_idx
  on public.sup_cotacoes (status, created_at desc);
alter table public.sup_cotacoes enable row level security;
drop policy if exists sup_cot_select on public.sup_cotacoes;
drop policy if exists sup_cot_insert on public.sup_cotacoes;
drop policy if exists sup_cot_update on public.sup_cotacoes;
drop policy if exists sup_cot_delete on public.sup_cotacoes;
create policy sup_cot_select on public.sup_cotacoes
  for select to authenticated
  using (true);
create policy sup_cot_insert on public.sup_cotacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_update on public.sup_cotacoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_delete on public.sup_cotacoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── Pronto-Socorro: mapa de salas (Emergência / Observação / Sala Vermelha) ──
create table if not exists public.ps_salas (
  id bigserial primary key,
  identificacao text not null unique,   -- "01", "02", "Sala 03"...
  area text not null default 'Emergência',  -- Emergência | Observação | Sala Vermelha | ...
  status text not null default 'disponivel', -- disponivel | ocupado | limpeza | manutencao
  atendimento_id bigint                     -- paciente do PS ocupando a sala
    references public.ps_atendimentos(id) on delete set null,
  ocupado_em timestamptz,
  observacao text,
  ordem int default 0,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_salas_area_idx on public.ps_salas (area, ordem);
create index if not exists ps_salas_atend_idx on public.ps_salas (atendimento_id);
alter table public.ps_salas enable row level security;
drop policy if exists ps_salas_select on public.ps_salas;
drop policy if exists ps_salas_insert on public.ps_salas;
drop policy if exists ps_salas_update on public.ps_salas;
drop policy if exists ps_salas_delete on public.ps_salas;
create policy ps_salas_select on public.ps_salas
  for select to authenticated
  using (true);
create policy ps_salas_insert on public.ps_salas
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_update on public.ps_salas
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_delete on public.ps_salas
  for delete to authenticated
  using (public.my_role() = 'adm_master');


-- ── PS: origem da chegada + elo forte PS → fila/leito ──
alter table public.ps_atendimentos
  add column if not exists origem text,
  add column if not exists origem_detalhe text;
alter table public.solicitacoes
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
alter table public.leitos
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;


-- ┌────────────────────────────────────────────────────────────
-- │ 02/30 — migracao-farmacia-faseA.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fase A (catálogo + estoque)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor) ANTES de publicar o código.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Catálogo de medicamentos =====
create table if not exists public.farm_medicamentos (
  id bigserial primary key,
  nome text not null,                    -- descrição/apresentação (ex.: "Dipirona 500mg comprimido")
  principio_ativo text,
  forma text,                            -- comprimido, ampola, frasco...
  concentracao text,                     -- 500 mg, 10 mg/mL...
  unidade text default 'unidade',        -- unidade de dispensação (comprimido, mL, ampola)
  controlado boolean default false,      -- Portaria 344/98 (psicotrópicos/entorpecentes)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_medic_nome_idx on public.farm_medicamentos (lower(nome));
alter table public.farm_medicamentos enable row level security;
drop policy if exists farm_medic_select on public.farm_medicamentos;
drop policy if exists farm_medic_insert on public.farm_medicamentos;
drop policy if exists farm_medic_update on public.farm_medicamentos;
drop policy if exists farm_medic_delete on public.farm_medicamentos;
create policy farm_medic_select on public.farm_medicamentos for select to authenticated using (true);
create policy farm_medic_insert on public.farm_medicamentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_update on public.farm_medicamentos for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_medic_delete on public.farm_medicamentos for delete to authenticated using (public.my_role() = 'adm_master');

-- ===== Saldo por lote (derivado dos movimentos — mantido pelo trigger) =====
create table if not exists public.farm_lotes (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists farm_lotes_uq on public.farm_lotes (medicamento_id, lote);
alter table public.farm_lotes enable row level security;
drop policy if exists farm_lotes_select on public.farm_lotes;
create policy farm_lotes_select on public.farm_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- ===== Kardex: movimentos de estoque (append-only — imutável) =====
create table if not exists public.farm_movimentos (
  id bigserial primary key,
  medicamento_id bigint not null references public.farm_medicamentos(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, dispensação, perda/vencimento, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  paciente_iniciais text, paciente_prontuario text,   -- p/ dispensação (Fase B)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists farm_mov_medic_idx on public.farm_movimentos (medicamento_id, created_at desc);
alter table public.farm_movimentos enable row level security;
drop policy if exists farm_mov_select on public.farm_movimentos;
drop policy if exists farm_mov_insert on public.farm_movimentos;
create policy farm_mov_select on public.farm_movimentos for select to authenticated using (true);
create policy farm_mov_insert on public.farm_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- ===== Trigger: aplica o movimento no saldo do lote (cria o lote se necessário) =====
create or replace function public.farm_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.farm_lotes
    where medicamento_id = new.medicamento_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.farm_lotes (medicamento_id, lote, validade, quantidade)
      values (new.medicamento_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.farm_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.farm_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists farm_movimento_trg on public.farm_movimentos;
create trigger farm_movimento_trg before insert on public.farm_movimentos
  for each row execute function public.farm_aplica_movimento();

-- Fim da Fase A da Farmácia.


-- ┌────────────────────────────────────────────────────────────
-- │ 03/30 — migracao-farmacia-seed.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · classe terapêutica + catálogo inicial
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: só insere o que ainda não existe (por nome).
-- NÃO cria estoque — apenas o catálogo. As quantidades entram
-- depois pela tela (Entrada), com lote e validade.
-- ============================================================

-- Coluna de classe terapêutica (para agrupar/filtrar)
alter table public.farm_medicamentos add column if not exists classe text;

insert into public.farm_medicamentos (nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
select v.nome, v.principio_ativo, v.classe, v.forma, v.concentracao, v.unidade, v.controlado
from (values
  -- ===== Analgésicos e antipiréticos =====
  ('Dipirona 500 mg comprimido','Dipirona sódica','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Dipirona 500 mg/mL solução injetável','Dipirona sódica','Analgésicos e antipiréticos','Ampola','500 mg/mL','ampola',false),
  ('Dipirona 500 mg/mL gotas','Dipirona sódica','Analgésicos e antipiréticos','Frasco','500 mg/mL','frasco',false),
  ('Paracetamol 500 mg comprimido','Paracetamol','Analgésicos e antipiréticos','Comprimido','500 mg','comprimido',false),
  ('Paracetamol 200 mg/mL gotas','Paracetamol','Analgésicos e antipiréticos','Frasco','200 mg/mL','frasco',false),
  ('Ácido acetilsalicílico 100 mg comprimido','Ácido acetilsalicílico','Analgésicos e antipiréticos','Comprimido','100 mg','comprimido',false),
  -- ===== Anti-inflamatórios (AINEs) =====
  ('Ibuprofeno 600 mg comprimido','Ibuprofeno','Anti-inflamatórios (AINEs)','Comprimido','600 mg','comprimido',false),
  ('Diclofenaco sódico 50 mg comprimido','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Comprimido','50 mg','comprimido',false),
  ('Diclofenaco sódico 25 mg/mL injetável','Diclofenaco sódico','Anti-inflamatórios (AINEs)','Ampola','25 mg/mL','ampola',false),
  ('Cetoprofeno 100 mg injetável','Cetoprofeno','Anti-inflamatórios (AINEs)','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Naproxeno 500 mg comprimido','Naproxeno','Anti-inflamatórios (AINEs)','Comprimido','500 mg','comprimido',false),
  ('Tenoxicam 20 mg injetável','Tenoxicam','Anti-inflamatórios (AINEs)','Frasco-ampola','20 mg','frasco-ampola',false),
  -- ===== Opioides =====
  ('Morfina 10 mg/mL injetável','Sulfato de morfina','Opioides','Ampola','10 mg/mL','ampola',true),
  ('Morfina 10 mg comprimido','Sulfato de morfina','Opioides','Comprimido','10 mg','comprimido',true),
  ('Fentanila 50 mcg/mL injetável','Citrato de fentanila','Opioides','Ampola','50 mcg/mL','ampola',true),
  ('Tramadol 50 mg/mL injetável','Cloridrato de tramadol','Opioides','Ampola','50 mg/mL','ampola',true),
  ('Tramadol 50 mg cápsula','Cloridrato de tramadol','Opioides','Cápsula','50 mg','cápsula',true),
  ('Codeína 30 mg comprimido','Fosfato de codeína','Opioides','Comprimido','30 mg','comprimido',true),
  ('Metadona 10 mg comprimido','Cloridrato de metadona','Opioides','Comprimido','10 mg','comprimido',true),
  -- ===== Anestésicos =====
  ('Lidocaína 2% sem vasoconstritor','Cloridrato de lidocaína','Anestésicos','Frasco','20 mg/mL','frasco',false),
  ('Lidocaína 2% geleia','Cloridrato de lidocaína','Anestésicos','Bisnaga/Pomada','20 mg/g','unidade',false),
  ('Bupivacaína 0,5% injetável','Cloridrato de bupivacaína','Anestésicos','Frasco-ampola','5 mg/mL','frasco-ampola',false),
  ('Propofol 10 mg/mL injetável','Propofol','Anestésicos','Ampola','10 mg/mL','ampola',false),
  ('Cetamina 50 mg/mL injetável','Cloridrato de cetamina','Anestésicos','Frasco-ampola','50 mg/mL','frasco-ampola',true),
  ('Etomidato 2 mg/mL injetável','Etomidato','Anestésicos','Ampola','2 mg/mL','ampola',false),
  -- ===== Antibióticos =====
  ('Amoxicilina 500 mg cápsula','Amoxicilina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Amoxicilina + Clavulanato 500+125 mg comprimido','Amoxicilina + clavulanato de potássio','Antibióticos','Comprimido','500+125 mg','comprimido',false),
  ('Ampicilina 1 g injetável','Ampicilina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefalexina 500 mg cápsula','Cefalexina','Antibióticos','Cápsula','500 mg','cápsula',false),
  ('Cefazolina 1 g injetável','Cefazolina sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ceftriaxona 1 g injetável','Ceftriaxona sódica','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Cefepima 1 g injetável','Cefepima','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Ciprofloxacino 500 mg comprimido','Ciprofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Ciprofloxacino 2 mg/mL bolsa','Ciprofloxacino','Antibióticos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Levofloxacino 500 mg comprimido','Levofloxacino','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Azitromicina 500 mg comprimido','Azitromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Claritromicina 500 mg comprimido','Claritromicina','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Clindamicina 150 mg/mL injetável','Fosfato de clindamicina','Antibióticos','Ampola','150 mg/mL','ampola',false),
  ('Metronidazol 500 mg comprimido','Metronidazol','Antibióticos','Comprimido','500 mg','comprimido',false),
  ('Metronidazol 5 mg/mL bolsa','Metronidazol','Antibióticos','Bolsa/Soro','5 mg/mL','bolsa',false),
  ('Gentamicina 40 mg/mL injetável','Sulfato de gentamicina','Antibióticos','Ampola','40 mg/mL','ampola',false),
  ('Amicacina 250 mg/mL injetável','Sulfato de amicacina','Antibióticos','Frasco-ampola','250 mg/mL','frasco-ampola',false),
  ('Vancomicina 500 mg injetável','Cloridrato de vancomicina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Piperacilina + Tazobactam 4,5 g injetável','Piperacilina + tazobactam','Antibióticos','Frasco-ampola','4,5 g','frasco-ampola',false),
  ('Meropenem 1 g injetável','Meropenem','Antibióticos','Frasco-ampola','1 g','frasco-ampola',false),
  ('Imipenem + Cilastatina 500 mg injetável','Imipenem + cilastatina','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Oxacilina 500 mg injetável','Oxacilina sódica','Antibióticos','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido','Sulfametoxazol + trimetoprima','Antibióticos','Comprimido','400+80 mg','comprimido',false),
  ('Polimixina B 500.000 UI injetável','Polimixina B','Antibióticos','Frasco-ampola','500.000 UI','frasco-ampola',false),
  -- ===== Antifúngicos =====
  ('Fluconazol 150 mg cápsula','Fluconazol','Antifúngicos','Cápsula','150 mg','cápsula',false),
  ('Fluconazol 2 mg/mL bolsa','Fluconazol','Antifúngicos','Bolsa/Soro','2 mg/mL','bolsa',false),
  ('Nistatina 100.000 UI/mL suspensão oral','Nistatina','Antifúngicos','Solução oral','100.000 UI/mL','frasco',false),
  ('Anfotericina B 50 mg injetável','Anfotericina B','Antifúngicos','Frasco-ampola','50 mg','frasco-ampola',false),
  ('Cetoconazol 200 mg comprimido','Cetoconazol','Antifúngicos','Comprimido','200 mg','comprimido',false),
  -- ===== Antivirais =====
  ('Aciclovir 200 mg comprimido','Aciclovir','Antivirais','Comprimido','200 mg','comprimido',false),
  ('Aciclovir 250 mg injetável','Aciclovir sódico','Antivirais','Frasco-ampola','250 mg','frasco-ampola',false),
  ('Oseltamivir 75 mg cápsula','Fosfato de oseltamivir','Antivirais','Cápsula','75 mg','cápsula',false),
  -- ===== Insulinas =====
  ('Insulina Regular 100 UI/mL','Insulina humana regular','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina NPH 100 UI/mL','Insulina humana NPH','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Glargina 100 UI/mL','Insulina glargina','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Lispro 100 UI/mL','Insulina lispro','Insulinas','Frasco','100 UI/mL','frasco',false),
  ('Insulina Asparte 100 UI/mL','Insulina asparte','Insulinas','Frasco','100 UI/mL','frasco',false),
  -- ===== Antidiabéticos orais =====
  ('Metformina 500 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','500 mg','comprimido',false),
  ('Metformina 850 mg comprimido','Cloridrato de metformina','Antidiabéticos orais','Comprimido','850 mg','comprimido',false),
  ('Glibenclamida 5 mg comprimido','Glibenclamida','Antidiabéticos orais','Comprimido','5 mg','comprimido',false),
  ('Gliclazida 30 mg comprimido','Gliclazida','Antidiabéticos orais','Comprimido','30 mg','comprimido',false),
  -- ===== Cardiovasculares e anti-hipertensivos =====
  ('Losartana potássica 50 mg comprimido','Losartana potássica','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Enalapril 10 mg comprimido','Maleato de enalapril','Cardiovasculares e anti-hipertensivos','Comprimido','10 mg','comprimido',false),
  ('Captopril 25 mg comprimido','Captopril','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Anlodipino 5 mg comprimido','Besilato de anlodipino','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Atenolol 50 mg comprimido','Atenolol','Cardiovasculares e anti-hipertensivos','Comprimido','50 mg','comprimido',false),
  ('Metoprolol 25 mg comprimido','Succinato de metoprolol','Cardiovasculares e anti-hipertensivos','Comprimido','25 mg','comprimido',false),
  ('Propranolol 40 mg comprimido','Cloridrato de propranolol','Cardiovasculares e anti-hipertensivos','Comprimido','40 mg','comprimido',false),
  ('Carvedilol 6,25 mg comprimido','Carvedilol','Cardiovasculares e anti-hipertensivos','Comprimido','6,25 mg','comprimido',false),
  ('Hidralazina 20 mg/mL injetável','Cloridrato de hidralazina','Cardiovasculares e anti-hipertensivos','Ampola','20 mg/mL','ampola',false),
  ('Amiodarona 200 mg comprimido','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Comprimido','200 mg','comprimido',false),
  ('Amiodarona 50 mg/mL injetável','Cloridrato de amiodarona','Cardiovasculares e anti-hipertensivos','Ampola','50 mg/mL','ampola',false),
  ('Digoxina 0,25 mg comprimido','Digoxina','Cardiovasculares e anti-hipertensivos','Comprimido','0,25 mg','comprimido',false),
  ('Isossorbida 5 mg sublingual','Dinitrato de isossorbida','Cardiovasculares e anti-hipertensivos','Comprimido','5 mg','comprimido',false),
  ('Nifedipino 20 mg comprimido','Nifedipino','Cardiovasculares e anti-hipertensivos','Comprimido','20 mg','comprimido',false),
  -- ===== Diuréticos =====
  ('Furosemida 40 mg comprimido','Furosemida','Diuréticos','Comprimido','40 mg','comprimido',false),
  ('Furosemida 10 mg/mL injetável','Furosemida','Diuréticos','Ampola','10 mg/mL','ampola',false),
  ('Hidroclorotiazida 25 mg comprimido','Hidroclorotiazida','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Espironolactona 25 mg comprimido','Espironolactona','Diuréticos','Comprimido','25 mg','comprimido',false),
  ('Manitol 20% frasco','Manitol','Diuréticos','Frasco','200 mg/mL','frasco',false),
  -- ===== Anticoagulantes e antitrombóticos =====
  ('Heparina sódica 5.000 UI/mL injetável','Heparina sódica','Anticoagulantes e antitrombóticos','Frasco-ampola','5.000 UI/mL','frasco-ampola',false),
  ('Enoxaparina 40 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','40 mg','seringa',false),
  ('Enoxaparina 60 mg seringa','Enoxaparina sódica','Anticoagulantes e antitrombóticos','Seringa','60 mg','seringa',false),
  ('Varfarina 5 mg comprimido','Varfarina sódica','Anticoagulantes e antitrombóticos','Comprimido','5 mg','comprimido',false),
  ('Rivaroxabana 20 mg comprimido','Rivaroxabana','Anticoagulantes e antitrombóticos','Comprimido','20 mg','comprimido',false),
  ('Clopidogrel 75 mg comprimido','Clopidogrel','Anticoagulantes e antitrombóticos','Comprimido','75 mg','comprimido',false),
  ('Alteplase 50 mg injetável','Alteplase','Anticoagulantes e antitrombóticos','Frasco-ampola','50 mg','frasco-ampola',false),
  -- ===== Drogas vasoativas =====
  ('Noradrenalina 2 mg/mL injetável','Hemitartarato de noradrenalina','Drogas vasoativas','Ampola','2 mg/mL','ampola',false),
  ('Adrenalina 1 mg/mL injetável','Epinefrina','Drogas vasoativas','Ampola','1 mg/mL','ampola',false),
  ('Dopamina 5 mg/mL injetável','Cloridrato de dopamina','Drogas vasoativas','Ampola','5 mg/mL','ampola',false),
  ('Dobutamina 12,5 mg/mL injetável','Cloridrato de dobutamina','Drogas vasoativas','Ampola','12,5 mg/mL','ampola',false),
  ('Vasopressina 20 UI/mL injetável','Vasopressina','Drogas vasoativas','Ampola','20 UI/mL','ampola',false),
  -- ===== Respiratório / broncodilatadores =====
  ('Salbutamol spray 100 mcg/dose','Sulfato de salbutamol','Respiratório / broncodilatadores','Spray/Aerossol','100 mcg/dose','frasco',false),
  ('Salbutamol 5 mg/mL solução p/ nebulização','Sulfato de salbutamol','Respiratório / broncodilatadores','Frasco','5 mg/mL','frasco',false),
  ('Ipratrópio 0,25 mg/mL solução','Brometo de ipratrópio','Respiratório / broncodilatadores','Frasco','0,25 mg/mL','frasco',false),
  ('Aminofilina 24 mg/mL injetável','Aminofilina','Respiratório / broncodilatadores','Ampola','24 mg/mL','ampola',false),
  ('Budesonida spray 200 mcg/dose','Budesonida','Respiratório / broncodilatadores','Spray/Aerossol','200 mcg/dose','frasco',false),
  -- ===== Corticoides =====
  ('Hidrocortisona 100 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','100 mg','frasco-ampola',false),
  ('Hidrocortisona 500 mg injetável','Succinato sódico de hidrocortisona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  ('Dexametasona 4 mg/mL injetável','Fosfato dissódico de dexametasona','Corticoides','Ampola','4 mg/mL','ampola',false),
  ('Dexametasona 4 mg comprimido','Dexametasona','Corticoides','Comprimido','4 mg','comprimido',false),
  ('Prednisona 20 mg comprimido','Prednisona','Corticoides','Comprimido','20 mg','comprimido',false),
  ('Prednisolona 3 mg/mL solução oral','Fosfato sódico de prednisolona','Corticoides','Solução oral','3 mg/mL','frasco',false),
  ('Metilprednisolona 500 mg injetável','Succinato sódico de metilprednisolona','Corticoides','Frasco-ampola','500 mg','frasco-ampola',false),
  -- ===== Antieméticos =====
  ('Metoclopramida 10 mg comprimido','Cloridrato de metoclopramida','Antieméticos','Comprimido','10 mg','comprimido',false),
  ('Metoclopramida 5 mg/mL injetável','Cloridrato de metoclopramida','Antieméticos','Ampola','5 mg/mL','ampola',false),
  ('Ondansetrona 2 mg/mL injetável','Cloridrato de ondansetrona','Antieméticos','Ampola','2 mg/mL','ampola',false),
  ('Ondansetrona 8 mg comprimido','Cloridrato de ondansetrona','Antieméticos','Comprimido','8 mg','comprimido',false),
  ('Bromoprida 10 mg comprimido','Bromoprida','Antieméticos','Comprimido','10 mg','comprimido',false),
  -- ===== Antiulcerosos / protetores gástricos =====
  ('Omeprazol 20 mg cápsula','Omeprazol','Antiulcerosos / protetores gástricos','Cápsula','20 mg','cápsula',false),
  ('Omeprazol 40 mg injetável','Omeprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Pantoprazol 40 mg comprimido','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Comprimido','40 mg','comprimido',false),
  ('Pantoprazol 40 mg injetável','Pantoprazol sódico','Antiulcerosos / protetores gástricos','Frasco-ampola','40 mg','frasco-ampola',false),
  ('Famotidina 20 mg comprimido','Famotidina','Antiulcerosos / protetores gástricos','Comprimido','20 mg','comprimido',false),
  -- ===== Sedativos e anticonvulsivantes =====
  ('Midazolam 5 mg/mL injetável','Midazolam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Midazolam 15 mg comprimido','Midazolam','Sedativos e anticonvulsivantes','Comprimido','15 mg','comprimido',true),
  ('Diazepam 5 mg/mL injetável','Diazepam','Sedativos e anticonvulsivantes','Ampola','5 mg/mL','ampola',true),
  ('Diazepam 10 mg comprimido','Diazepam','Sedativos e anticonvulsivantes','Comprimido','10 mg','comprimido',true),
  ('Clonazepam 2 mg comprimido','Clonazepam','Sedativos e anticonvulsivantes','Comprimido','2 mg','comprimido',true),
  ('Fenobarbital 100 mg comprimido','Fenobarbital','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',true),
  ('Fenobarbital 100 mg/mL injetável','Fenobarbital sódico','Sedativos e anticonvulsivantes','Ampola','100 mg/mL','ampola',true),
  ('Fenitoína 100 mg comprimido','Fenitoína sódica','Sedativos e anticonvulsivantes','Comprimido','100 mg','comprimido',false),
  ('Fenitoína 50 mg/mL injetável','Fenitoína sódica','Sedativos e anticonvulsivantes','Ampola','50 mg/mL','ampola',false),
  ('Ácido valproico 500 mg comprimido','Valproato de sódio','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  ('Levetiracetam 500 mg comprimido','Levetiracetam','Sedativos e anticonvulsivantes','Comprimido','500 mg','comprimido',false),
  -- ===== Antipsicóticos e antidepressivos =====
  ('Haloperidol 5 mg/mL injetável','Haloperidol','Antipsicóticos e antidepressivos','Ampola','5 mg/mL','ampola',false),
  ('Haloperidol 5 mg comprimido','Haloperidol','Antipsicóticos e antidepressivos','Comprimido','5 mg','comprimido',false),
  ('Clorpromazina 25 mg/mL injetável','Cloridrato de clorpromazina','Antipsicóticos e antidepressivos','Ampola','25 mg/mL','ampola',false),
  ('Quetiapina 25 mg comprimido','Fumarato de quetiapina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Risperidona 2 mg comprimido','Risperidona','Antipsicóticos e antidepressivos','Comprimido','2 mg','comprimido',false),
  ('Amitriptilina 25 mg comprimido','Cloridrato de amitriptilina','Antipsicóticos e antidepressivos','Comprimido','25 mg','comprimido',false),
  ('Sertralina 50 mg comprimido','Cloridrato de sertralina','Antipsicóticos e antidepressivos','Comprimido','50 mg','comprimido',false),
  ('Fluoxetina 20 mg cápsula','Cloridrato de fluoxetina','Antipsicóticos e antidepressivos','Cápsula','20 mg','cápsula',false),
  -- ===== Anti-histamínicos / antialérgicos =====
  ('Prometazina 25 mg/mL injetável','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Ampola','25 mg/mL','ampola',false),
  ('Prometazina 25 mg comprimido','Cloridrato de prometazina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  ('Dexclorfeniramina 2 mg comprimido','Maleato de dexclorfeniramina','Anti-histamínicos / antialérgicos','Comprimido','2 mg','comprimido',false),
  ('Difenidramina 50 mg/mL injetável','Cloridrato de difenidramina','Anti-histamínicos / antialérgicos','Ampola','50 mg/mL','ampola',false),
  ('Loratadina 10 mg comprimido','Loratadina','Anti-histamínicos / antialérgicos','Comprimido','10 mg','comprimido',false),
  ('Hidroxizina 25 mg comprimido','Cloridrato de hidroxizina','Anti-histamínicos / antialérgicos','Comprimido','25 mg','comprimido',false),
  -- ===== Soluções, eletrólitos e soros =====
  ('Cloreto de sódio 0,9% 500 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Cloreto de sódio 0,9% 250 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Bolsa/Soro','0,9%','bolsa',false),
  ('Glicose 5% 500 mL','Glicose','Soluções, eletrólitos e soros','Bolsa/Soro','5%','bolsa',false),
  ('Glicose 50% 10 mL','Glicose','Soluções, eletrólitos e soros','Ampola','50%','ampola',false),
  ('Ringer com lactato 500 mL','Solução de Ringer com lactato','Soluções, eletrólitos e soros','Bolsa/Soro','500 mL','bolsa',false),
  ('Cloreto de potássio 19,1% 10 mL','Cloreto de potássio','Soluções, eletrólitos e soros','Ampola','191 mg/mL','ampola',false),
  ('Cloreto de sódio 20% 10 mL','Cloreto de sódio','Soluções, eletrólitos e soros','Ampola','200 mg/mL','ampola',false),
  ('Gluconato de cálcio 10% injetável','Gluconato de cálcio','Soluções, eletrólitos e soros','Ampola','100 mg/mL','ampola',false),
  ('Sulfato de magnésio 50% 10 mL','Sulfato de magnésio','Soluções, eletrólitos e soros','Ampola','500 mg/mL','ampola',false),
  ('Bicarbonato de sódio 8,4% 10 mL','Bicarbonato de sódio','Soluções, eletrólitos e soros','Ampola','84 mg/mL','ampola',false),
  ('Água para injeção 10 mL','Água para injeção','Soluções, eletrólitos e soros','Ampola','10 mL','ampola',false),
  -- ===== Vitaminas e suplementos =====
  ('Complexo B injetável','Vitaminas do complexo B','Vitaminas e suplementos','Ampola','2 mL','ampola',false),
  ('Tiamina (B1) 100 mg/mL injetável','Cloridrato de tiamina','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina C 100 mg/mL injetável','Ácido ascórbico','Vitaminas e suplementos','Ampola','100 mg/mL','ampola',false),
  ('Vitamina K 10 mg/mL injetável','Fitomenadiona','Vitaminas e suplementos','Ampola','10 mg/mL','ampola',false),
  ('Ácido fólico 5 mg comprimido','Ácido fólico','Vitaminas e suplementos','Comprimido','5 mg','comprimido',false),
  ('Sulfato ferroso 40 mg comprimido','Sulfato ferroso','Vitaminas e suplementos','Comprimido','40 mg Fe','comprimido',false),
  ('Cianocobalamina (B12) 1 mg/mL injetável','Cianocobalamina','Vitaminas e suplementos','Ampola','1 mg/mL','ampola',false)
) as v(nome, principio_ativo, classe, forma, concentracao, unidade, controlado)
where not exists (
  select 1 from public.farm_medicamentos m where lower(m.nome) = lower(v.nome)
);

-- Confira quantos ficaram cadastrados:
-- select classe, count(*) from public.farm_medicamentos group by classe order by classe;


-- ┌────────────────────────────────────────────────────────────
-- │ 04/30 — migracao-farmacia-faseB.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fase B (prescrição estruturada + dispensação)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), DEPOIS da Fase A.
-- Idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- ===== Itens estruturados da prescrição do PS (imutável) =====
create table if not exists public.ps_prescricao_itens (
  id bigserial primary key,
  atendimento_id bigint not null,        -- ps_atendimentos.id
  registro_id bigint,                    -- ps_registros.id (a prescrição assinada)
  medicamento_id bigint,                 -- farm_medicamentos.id (null p/ item livre)
  medicamento_nome text not null,        -- snapshot do nome/apresentação
  unidade text,
  dose text,                             -- posologia (ex.: "1 comp 8/8h")
  via text,                              -- VO, IV, IM, SC, inalatória...
  quantidade numeric,                    -- quantidade a dispensar
  usuario text,
  created_at timestamptz default now()
);
create index if not exists ps_presc_itens_at_idx on public.ps_prescricao_itens (atendimento_id);
alter table public.ps_prescricao_itens enable row level security;
drop policy if exists ps_presc_itens_select on public.ps_prescricao_itens;
drop policy if exists ps_presc_itens_insert on public.ps_prescricao_itens;
create policy ps_presc_itens_select on public.ps_prescricao_itens for select to authenticated using (true);
create policy ps_presc_itens_insert on public.ps_prescricao_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- ===== Vínculos da dispensação no kardex de estoque =====
alter table public.farm_movimentos add column if not exists atendimento_id bigint;
alter table public.farm_movimentos add column if not exists prescricao_item_id bigint;
alter table public.farm_movimentos add column if not exists setor text;
create index if not exists farm_mov_presc_idx on public.farm_movimentos (prescricao_item_id);
create index if not exists farm_mov_atend_idx on public.farm_movimentos (atendimento_id);

-- Fim da Fase B da Farmácia.


-- ┌────────────────────────────────────────────────────────────
-- │ 05/30 — migracao-farmacia-clinica-fase1.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 1 (motor de alertas + base clínica)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Idempotente nas colunas (add if not exists). O bloco de seed preenche
-- atributos clínicos de referência (Beers, pediatria, dose máx, sonda) —
-- TUDO editável e sujeito a validação pela equipe de farmácia clínica.
-- ============================================================

-- 1) Atributos clínicos por medicamento (base de conhecimento curável)
alter table public.farm_medicamentos
  add column if not exists grupo_terapeutico text,
  add column if not exists dose_maxima_dia numeric,
  add column if not exists dose_maxima_unid text,
  add column if not exists duracao_maxima_dias int,
  add column if not exists nao_triturar boolean default false,
  add column if not exists inapropriado_idoso boolean default false,
  add column if not exists motivo_idoso text,
  add column if not exists inapropriado_pediatrico boolean default false,
  add column if not exists motivo_pediatrico text,
  add column if not exists idade_pediatrica int,          -- limiar (anos); null => usa 12
  add column if not exists ajuste_renal text,             -- usado na Fase 3
  add column if not exists ajuste_hepatico text,          -- usado na Fase 3
  add column if not exists obs_clinica text;

-- 2) Dose estruturada nos itens da prescrição (p/ checar dose máxima e duração)
alter table public.ps_prescricao_itens
  add column if not exists dose_valor numeric,
  add column if not exists dose_unidade text,
  add column if not exists frequencia_dia numeric,        -- vezes por dia (8/8h => 3)
  add column if not exists duracao_dias numeric;

-- 3) Contexto clínico do paciente (do episódio do PS)
alter table public.ps_atendimentos
  add column if not exists idade int,
  add column if not exists peso numeric(5,1),
  add column if not exists clearance_renal numeric,       -- ClCr / TFG estimada (mL/min)
  add column if not exists funcao_hepatica text,          -- normal | leve | moderada | grave
  add column if not exists alergias text,
  add column if not exists em_sonda boolean default false,
  add column if not exists gestante boolean default false;

-- ============================================================
-- SEED de atributos clínicos de referência (revisar com a equipe)
-- Fontes consagradas: Critérios de Beers (AGS), bulas/ANVISA, listas de
-- "não triturar". Valores conservadores; ajuste conforme protocolo local.
-- ============================================================
update public.farm_medicamentos m set
  grupo_terapeutico       = coalesce(v.grupo, m.grupo_terapeutico),
  dose_maxima_dia         = coalesce(v.dose_max, m.dose_maxima_dia),
  dose_maxima_unid        = coalesce(v.dose_unid, m.dose_maxima_unid),
  nao_triturar            = coalesce(v.sonda, m.nao_triturar),
  inapropriado_idoso      = coalesce(v.idoso, m.inapropriado_idoso),
  motivo_idoso            = coalesce(v.motivo_idoso, m.motivo_idoso),
  inapropriado_pediatrico = coalesce(v.ped, m.inapropriado_pediatrico),
  motivo_pediatrico       = coalesce(v.motivo_ped, m.motivo_pediatrico),
  idade_pediatrica        = coalesce(v.idade_ped, m.idade_pediatrica),
  obs_clinica             = coalesce(v.obs, m.obs_clinica)
from (values
  -- nome, grupo, dose_max(numeric), dose_unid, sonda(bool), idoso(bool), motivo_idoso, ped(bool), motivo_ped, idade_ped(int), obs
  ('Paracetamol 500 mg comprimido', null, 4000::numeric, 'mg', null::boolean, null::boolean, null, null::boolean, null, null::int, null),
  ('Paracetamol 200 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg comprimido', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL solução injetável', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Dipirona 500 mg/mL gotas', null, 4000, 'mg', null, null, null, null, null, null, null),
  ('Ácido acetilsalicílico 100 mg comprimido', null, null, null, null, null, null, true, 'Risco de síndrome de Reye em crianças/adolescentes (evitar em quadros virais)', 18, null),
  ('Ibuprofeno 600 mg comprimido', 'AINE', 3200, 'mg', null, null, null, null, null, null, null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE', 150, 'mg', true, null, null, null, null, null, 'Comprimido gastrorresistente — não triturar'),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE', 150, 'mg', null, null, null, null, null, null, null),
  ('Cetoprofeno 100 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Naproxeno 500 mg comprimido', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Tenoxicam 20 mg injetável', 'AINE', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Morfina 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Fentanila 50 mcg/mL injetável', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Tramadol 50 mg cápsula', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Tramadol 50 mg/mL injetável', 'Opioide', 400, 'mg', null, null, null, true, 'Não recomendado em menores de 12 anos (risco respiratório)', 12, null),
  ('Codeína 30 mg comprimido', 'Opioide', 240, 'mg', null, null, null, true, 'Contraindicada em menores de 12 anos (metabolização variável, risco respiratório)', 12, null),
  ('Metadona 10 mg comprimido', 'Opioide', null, null, null, null, null, null, null, null, null),
  ('Diazepam 10 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Diazepam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas, fraturas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 15 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Midazolam 5 mg/mL injetável', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação e depressão respiratória em idosos (Beers)', null, null, null, null),
  ('Clonazepam 2 mg comprimido', 'Benzodiazepínico', null, null, null, true, 'Benzodiazepínico — sedação, quedas e declínio cognitivo em idosos (Beers)', null, null, null, null),
  ('Amitriptilina 25 mg comprimido', null, null, null, null, true, 'Antidepressivo tricíclico — forte efeito anticolinérgico (Beers)', null, null, null, null),
  ('Clorpromazina 25 mg/mL injetável', null, null, null, null, true, 'Antipsicótico — efeitos anticolinérgicos e extrapiramidais em idosos (Beers)', null, null, null, null),
  ('Prometazina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Prometazina 25 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Dexclorfeniramina 2 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Difenidramina 50 mg/mL injetável', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Hidroxizina 25 mg comprimido', null, null, null, null, true, 'Anti-histamínico de 1ª geração — anticolinérgico (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg comprimido', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Fenobarbital 100 mg/mL injetável', null, null, null, null, true, 'Barbitúrico — alta taxa de dependência e sedação (Beers)', null, null, null, null),
  ('Glibenclamida 5 mg comprimido', null, null, null, null, true, 'Sulfonilureia de longa ação — hipoglicemia prolongada em idosos (Beers)', null, null, null, null),
  ('Digoxina 0,25 mg comprimido', null, null, null, null, true, 'Em idosos, evitar dose > 0,125 mg/dia (Beers)', null, null, null, null),
  ('Nifedipino 20 mg comprimido', null, null, null, null, true, 'Di-hidropiridina de ação rápida — risco de hipotensão em idosos (Beers)', null, null, null, null),
  ('Omeprazol 20 mg cápsula', 'IBP', null, null, true, null, null, null, null, null, 'Grânulos gastrorresistentes — abrir a cápsula, não triturar; dispersar e lavar bem a sonda'),
  ('Omeprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Pantoprazol 40 mg comprimido', 'IBP', null, null, true, null, null, null, null, null, 'Comprimido revestido entérico — não triturar'),
  ('Pantoprazol 40 mg injetável', 'IBP', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 100 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Hidrocortisona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg/mL injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Dexametasona 4 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisona 20 mg comprimido', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Prednisolona 3 mg/mL solução oral', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Metilprednisolona 500 mg injetável', 'Corticoide sistêmico', null, null, null, null, null, null, null, null, null),
  ('Ciprofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Ciprofloxacino 2 mg/mL bolsa', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Levofloxacino 500 mg comprimido', null, null, null, null, null, null, true, 'Fluoroquinolona — evitar em crianças/adolescentes salvo indicação específica (risco musculoesquelético)', 18, null),
  ('Metoclopramida 10 mg comprimido', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null),
  ('Metoclopramida 5 mg/mL injetável', null, null, null, null, null, null, true, 'Risco de reações extrapiramidais; restrito em menores de 1 ano', 1, null)
) as v(nome, grupo, dose_max, dose_unid, sonda, idoso, motivo_idoso, ped, motivo_ped, idade_ped, obs)
where lower(m.nome) = lower(v.nome);

-- Conferência sugerida:
-- select count(*) filter (where inapropriado_idoso) as beers,
--        count(*) filter (where inapropriado_pediatrico) as pediatria,
--        count(*) filter (where nao_triturar) as sonda,
--        count(*) filter (where dose_maxima_dia is not null) as dose_max
-- from public.farm_medicamentos;


-- ┌────────────────────────────────────────────────────────────
-- │ 06/30 — migracao-farmacia-clinica-fase2.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 2 (interações + incompatibilidade em Y)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Tabelas de PARES de substâncias, curáveis pela equipe. O seed traz
-- interações maiores clássicas — CONSERVADOR e SUJEITO A VALIDAÇÃO local.
-- ============================================================

-- 1) Interações medicamentosas (par de substâncias)
create table if not exists public.farm_interacoes (
  id bigserial primary key,
  substancia_a text not null,            -- termo minúsculo/sem acento (casa por princípio ativo/grupo)
  substancia_b text not null,
  gravidade text not null default 'moderada',   -- grave | moderada | leve
  descricao text,
  conduta text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.farm_interacoes enable row level security;
drop policy if exists farm_inter_select on public.farm_interacoes;
drop policy if exists farm_inter_insert on public.farm_interacoes;
drop policy if exists farm_inter_update on public.farm_interacoes;
drop policy if exists farm_inter_delete on public.farm_interacoes;
create policy farm_inter_select on public.farm_interacoes for select to authenticated using (true);
create policy farm_inter_insert on public.farm_interacoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_update on public.farm_interacoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_inter_delete on public.farm_interacoes for delete to authenticated using (public.my_role() = 'adm_master');

-- 2) Incompatibilidade em Y (par de substâncias na mesma via IV)
create table if not exists public.farm_incompat_y (
  id bigserial primary key,
  substancia_a text not null,
  substancia_b text not null,
  descricao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.farm_incompat_y enable row level security;
drop policy if exists farm_incy_select on public.farm_incompat_y;
drop policy if exists farm_incy_insert on public.farm_incompat_y;
drop policy if exists farm_incy_update on public.farm_incompat_y;
drop policy if exists farm_incy_delete on public.farm_incompat_y;
create policy farm_incy_select on public.farm_incompat_y for select to authenticated using (true);
create policy farm_incy_insert on public.farm_incompat_y for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_update on public.farm_incompat_y for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_incy_delete on public.farm_incompat_y for delete to authenticated using (public.my_role() = 'adm_master');

-- ============================================================
-- SEED — interações maiores clássicas (revisar com a equipe)
-- substâncias em minúsculo/sem acento; "aine", "opioide", "benzodiazep"
-- casam por grupo terapêutico dos medicamentos.
-- ============================================================
insert into public.farm_interacoes (substancia_a, substancia_b, gravidade, descricao, conduta)
select a, b, g, d, c from (values
  ('opioide','benzodiazep','grave','Depressão respiratória e do SNC aditiva','monitorar sedação/FR; usar menor dose'),
  ('varfarina','aine','grave','Risco elevado de sangramento','evitar; preferir analgésico alternativo'),
  ('varfarina','acido acetilsalicilico','grave','Risco elevado de sangramento','evitar associação'),
  ('varfarina','sulfametoxazol','grave','Aumento importante do INR','monitorar INR; evitar se possível'),
  ('varfarina','amiodarona','grave','Aumento do efeito anticoagulante','reduzir dose e monitorar INR'),
  ('varfarina','fluconazol','grave','Aumento do INR (inibição CYP)','monitorar INR'),
  ('varfarina','ciprofloxacino','moderada','Pode aumentar o INR','monitorar INR'),
  ('digoxina','amiodarona','grave','Aumenta níveis de digoxina (toxicidade)','reduzir digoxina ~50% e monitorar'),
  ('digoxina','furosemida','moderada','Hipocalemia potencializa toxicidade digitálica','monitorar potássio'),
  ('digoxina','espironolactona','moderada','Altera níveis/efeito da digoxina','monitorar'),
  ('espironolactona','enalapril','grave','Hipercalemia','monitorar potássio e função renal'),
  ('espironolactona','captopril','grave','Hipercalemia','monitorar potássio e função renal'),
  ('espironolactona','losartana','grave','Hipercalemia','monitorar potássio'),
  ('espironolactona','cloreto de potassio','grave','Hipercalemia','evitar associação'),
  ('enalapril','cloreto de potassio','grave','Hipercalemia','monitorar potássio'),
  ('captopril','cloreto de potassio','grave','Hipercalemia','monitorar potássio'),
  ('tramadol','sertralina','grave','Síndrome serotoninérgica e risco de convulsão','evitar; monitorar'),
  ('tramadol','fluoxetina','grave','Síndrome serotoninérgica e risco de convulsão','evitar; monitorar'),
  ('tramadol','amitriptilina','moderada','Risco de convulsão e efeito serotoninérgico','cautela'),
  ('fluoxetina','amitriptilina','moderada','Aumento dos níveis do tricíclico / serotoninérgico','monitorar'),
  ('amiodarona','ciprofloxacino','moderada','Prolongamento do intervalo QT','monitorar ECG/eletrólitos'),
  ('amiodarona','levofloxacino','moderada','Prolongamento do intervalo QT','monitorar ECG/eletrólitos'),
  ('amiodarona','claritromicina','grave','Prolongamento do QT / arritmias','evitar associação'),
  ('aine','enalapril','moderada','Reduz efeito anti-hipertensivo e risco renal','monitorar PA e função renal'),
  ('aine','captopril','moderada','Reduz efeito anti-hipertensivo e risco renal','monitorar PA e função renal'),
  ('aine','furosemida','moderada','Reduz efeito diurético','monitorar resposta'),
  ('metoclopramida','haloperidol','moderada','Efeitos extrapiramidais aditivos','cautela')
) as v(a, b, g, d, c)
where not exists (
  select 1 from public.farm_interacoes fi
  where (lower(fi.substancia_a) = v.a and lower(fi.substancia_b) = v.b)
     or (lower(fi.substancia_a) = v.b and lower(fi.substancia_b) = v.a)
);

-- SEED — incompatibilidades em Y (IV) clássicas (revisar com a equipe)
insert into public.farm_incompat_y (substancia_a, substancia_b, descricao)
select a, b, d from (values
  ('ceftriaxona','gluconato de calcio','Precipitação (sal de cálcio) — contraindicado, sobretudo em neonatos'),
  ('ceftriaxona','ringer','Solução com cálcio — risco de precipitação'),
  ('fenitoina','glicose','Precipita em soluções glicosadas — diluir apenas em SF 0,9%'),
  ('fenitoina','noradrenalina','Incompatível na mesma linha'),
  ('anfotericina','cloreto de sodio','Precipita em salina — diluir apenas em glicose 5%'),
  ('furosemida','midazolam','Precipitação'),
  ('furosemida','dobutamina','Incompatível'),
  ('vancomicina','ceftriaxona','Precipitação'),
  ('vancomicina','heparina','Incompatível'),
  ('midazolam','bicarbonato de sodio','Precipitação'),
  ('bicarbonato de sodio','noradrenalina','Inativa a catecolamina'),
  ('bicarbonato de sodio','adrenalina','Inativa a catecolamina'),
  ('bicarbonato de sodio','gluconato de calcio','Precipita (carbonato de cálcio)'),
  ('diazepam','furosemida','Precipitação')
) as v(a, b, d)
where not exists (
  select 1 from public.farm_incompat_y fy
  where (lower(fy.substancia_a) = v.a and lower(fy.substancia_b) = v.b)
     or (lower(fy.substancia_a) = v.b and lower(fy.substancia_b) = v.a)
);

-- Conferência:
-- select count(*) from public.farm_interacoes;
-- select count(*) from public.farm_incompat_y;


-- ┌────────────────────────────────────────────────────────────
-- │ 07/30 — migracao-farmacia-clinica-fase3.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia Clínica · Fase 3 (ajuste renal/hepático)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- NÃO altera estrutura (colunas ajuste_renal/ajuste_hepatico já existem
-- desde a Fase 1). Só preenche orientações de referência — CONSERVADOR e
-- SUJEITO A VALIDAÇÃO pela equipe de farmácia clínica.
-- ============================================================
update public.farm_medicamentos m set
  ajuste_renal    = coalesce(v.ren, m.ajuste_renal),
  ajuste_hepatico = coalesce(v.hep, m.ajuste_hepatico)
from (values
  -- nome, ajuste_renal, ajuste_hepatico
  ('Paracetamol 500 mg comprimido', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Paracetamol 200 mg/mL gotas', null, 'Hepatotóxico — reduzir a dose máxima diária na hepatopatia.'),
  ('Ibuprofeno 600 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal; monitorar função renal.', null),
  ('Diclofenaco sódico 50 mg comprimido', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Diclofenaco sódico 25 mg/mL injetável', 'AINE nefrotóxico — evitar na insuficiência renal.', null),
  ('Morfina 10 mg/mL injetável', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Morfina 10 mg comprimido', 'Reduzir dose/intervalo na insuficiência renal (acúmulo de metabólitos).', 'Reduzir dose/intervalo na insuficiência hepática.'),
  ('Tramadol 50 mg cápsula', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Tramadol 50 mg/mL injetável', 'Reduzir dose se ClCr < 30 mL/min.', 'Reduzir dose na insuficiência hepática.'),
  ('Codeína 30 mg comprimido', null, 'Cautela/reduzir na hepatopatia (metabolização variável).'),
  ('Diazepam 10 mg comprimido', null, 'Acúmulo na hepatopatia — usar menor dose ou benzodiazepínico de meia-vida curta.'),
  ('Diazepam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — usar menor dose.'),
  ('Midazolam 15 mg comprimido', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Midazolam 5 mg/mL injetável', null, 'Acúmulo na hepatopatia — reduzir dose.'),
  ('Clonazepam 2 mg comprimido', null, 'Cautela na hepatopatia.'),
  ('Haloperidol 5 mg/mL injetável', null, 'Cautela na insuficiência hepática.'),
  ('Haloperidol 5 mg comprimido', null, 'Cautela na insuficiência hepática.'),
  ('Clorpromazina 25 mg/mL injetável', null, 'Cautela/evitar na hepatopatia.'),
  ('Ácido valproico 500 mg comprimido', null, 'Hepatotóxico — contraindicado na hepatopatia; monitorar enzimas.'),
  ('Amiodarona 200 mg comprimido', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Amiodarona 50 mg/mL injetável', null, 'Hepatotóxico — monitorar enzimas hepáticas.'),
  ('Fluconazol 150 mg cápsula', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Fluconazol 2 mg/mL bolsa', 'Reduzir dose de manutenção se ClCr < 50 mL/min.', 'Hepatotóxico — monitorar enzimas.'),
  ('Cetoconazol 200 mg comprimido', null, 'Hepatotóxico — evitar/monitorar na hepatopatia.'),
  ('Metronidazol 500 mg comprimido', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Metronidazol 5 mg/mL bolsa', null, 'Reduzir dose na insuficiência hepática grave.'),
  ('Vancomicina 500 mg injetável', 'Nefrotóxico — ajustar dose/intervalo pela ClCr e monitorar nível sérico.', null),
  ('Gentamicina 40 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Amicacina 250 mg/mL injetável', 'Aminoglicosídeo nefrotóxico — ajustar por ClCr e monitorar nível sérico.', null),
  ('Meropenem 1 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Cefepima 1 g injetável', 'Ajustar dose se ClCr reduzido (risco de neurotoxicidade).', null),
  ('Piperacilina + Tazobactam 4,5 g injetável', 'Ajustar dose se ClCr reduzido.', null),
  ('Ciprofloxacino 500 mg comprimido', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Ciprofloxacino 2 mg/mL bolsa', 'Ajustar dose se ClCr < 30 mL/min.', null),
  ('Levofloxacino 500 mg comprimido', 'Ajustar dose/intervalo se ClCr < 50 mL/min.', null),
  ('Aciclovir 200 mg comprimido', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Aciclovir 250 mg injetável', 'Ajustar por ClCr; hidratar (risco de cristalúria/nefrotoxicidade).', null),
  ('Sulfametoxazol + Trimetoprima 400+80 mg comprimido', 'Ajustar dose se ClCr reduzido; evitar se ClCr < 15 mL/min.', null),
  ('Enoxaparina 40 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Enoxaparina 60 mg seringa', 'Reduzir dose se ClCr < 30 mL/min; considerar anti-Xa.', null),
  ('Metformina 500 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Metformina 850 mg comprimido', 'Contraindicada se ClCr < 30 mL/min (risco de acidose lática).', null),
  ('Digoxina 0,25 mg comprimido', 'Reduzir dose na insuficiência renal (acúmulo).', null),
  ('Espironolactona 25 mg comprimido', 'Risco de hipercalemia na insuficiência renal — monitorar potássio.', null)
) as v(nome, ren, hep)
where lower(m.nome) = lower(v.nome);

-- Conferência:
-- select count(*) filter (where ajuste_renal is not null) as com_ajuste_renal,
--        count(*) filter (where ajuste_hepatico is not null) as com_ajuste_hepatico
-- from public.farm_medicamentos;


-- ┌────────────────────────────────────────────────────────────
-- │ 08/30 — migracao-farmacia-preparo.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Fluxo de preparo (assinar→receber→preparo→pronto→retirada)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor), com o script INTEIRO.
-- Uma linha por prescrição assinada (registro_id). "aguardando" é implícito:
-- prescrição assinada SEM linha aqui = aguardando a farmácia receber.
-- ============================================================
create table if not exists public.farm_preparo (
  id bigserial primary key,
  registro_id bigint not null unique,        -- ps_registros (prescrição assinada)
  atendimento_id bigint,
  status text not null default 'preparo',    -- preparo | pronto | retirado | cancelado
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  retirado_em timestamptz, retirado_por text,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_preparo_at_idx on public.farm_preparo (atendimento_id);
alter table public.farm_preparo enable row level security;
drop policy if exists farm_prep_select on public.farm_preparo;
drop policy if exists farm_prep_insert on public.farm_preparo;
drop policy if exists farm_prep_update on public.farm_preparo;
drop policy if exists farm_prep_delete on public.farm_preparo;
create policy farm_prep_select on public.farm_preparo for select to authenticated using (true);
create policy farm_prep_insert on public.farm_preparo for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_update on public.farm_preparo for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_prep_delete on public.farm_preparo for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 09/30 — migracao-farmacia-custos.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Custos (custo unitário por medicamento)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Não altera dados; só adiciona a coluna de custo. Os preços são
-- preenchidos pela equipe no catálogo (Estoque → Editar).
-- ============================================================
alter table public.farm_medicamentos
  add column if not exists custo_unitario numeric;   -- R$ por unidade de dispensação


-- ┌────────────────────────────────────────────────────────────
-- │ 10/30 — migracao-farmacia-nao-padronizados.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Medicamentos NÃO padronizados (trazidos pela família)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro dos medicamentos que NÃO estão no catálogo do hospital e que
-- o paciente/família traz — recebidos e controlados pela farmácia.
-- ============================================================
create table if not exists public.farm_nao_padronizados (
  id bigserial primary key,
  paciente_iniciais text not null,
  paciente_prontuario text,
  setor text,
  medicamento text not null,             -- nome livre (fora do catálogo)
  apresentacao text,                      -- forma / concentração
  quantidade numeric,
  unidade text,
  lote text, validade date,
  origem text,                            -- quem trouxe (ex.: familiar, próprio paciente)
  conferido boolean default false,        -- conferido/aprovado pelo farmacêutico
  status text not null default 'recebido',-- recebido | em_uso | devolvido | descartado
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_naopad_pac_idx on public.farm_nao_padronizados (paciente_prontuario);
alter table public.farm_nao_padronizados enable row level security;
drop policy if exists farm_naopad_select on public.farm_nao_padronizados;
drop policy if exists farm_naopad_insert on public.farm_nao_padronizados;
drop policy if exists farm_naopad_update on public.farm_nao_padronizados;
drop policy if exists farm_naopad_delete on public.farm_nao_padronizados;
create policy farm_naopad_select on public.farm_nao_padronizados for select to authenticated using (true);
create policy farm_naopad_insert on public.farm_nao_padronizados for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_update on public.farm_nao_padronizados for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_naopad_delete on public.farm_nao_padronizados for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 11/30 — migracao-farmacia-intervencoes.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Farmácia · Intervenção farmacêutica (estilo NoHarm)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor).
-- Registro das intervenções do farmacêutico sobre a prescrição, com
-- problema, conduta proposta e desfecho (aceita/não aceita/resolvida).
-- ============================================================
create table if not exists public.farm_intervencoes (
  id bigserial primary key,
  atendimento_id bigint,
  prescricao_item_id bigint,
  medicamento_nome text,
  paciente_iniciais text, paciente_prontuario text,
  tipo text,                              -- categoria do problema (alerta que originou)
  gravidade text,                         -- alta | media | baixa
  problema text not null,                 -- descrição do problema identificado
  conduta text,                           -- conduta/recomendação proposta
  status text not null default 'pendente',-- pendente | aceita | nao_aceita | resolvida | cancelada
  desfecho text,                          -- observação do desfecho / resposta do prescritor
  farmaceutico text,                      -- quem interveio
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists farm_interv_at_idx on public.farm_intervencoes (atendimento_id);
create index if not exists farm_interv_status_idx on public.farm_intervencoes (status);
alter table public.farm_intervencoes enable row level security;
drop policy if exists farm_interv2_select on public.farm_intervencoes;
drop policy if exists farm_interv2_insert on public.farm_intervencoes;
drop policy if exists farm_interv2_update on public.farm_intervencoes;
drop policy if exists farm_interv2_delete on public.farm_intervencoes;
create policy farm_interv2_select on public.farm_intervencoes for select to authenticated using (true);
create policy farm_interv2_insert on public.farm_intervencoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_update on public.farm_intervencoes for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy farm_interv2_delete on public.farm_intervencoes for delete to authenticated using (public.my_role() = 'adm_master');


-- ┌────────────────────────────────────────────────────────────
-- │ 12/30 — migracao-leitos-kanban-metas.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Giro de Leitos · Kanban de alta + Metas por setor + Motivo da espera
-- Rodar UMA vez no HNSN (Supabase → SQL Editor). Só ADICIONA colunas
-- (idempotente e reversível de fato — não apaga nem altera nada existente).
-- As tabelas já têm RLS/policies; colunas novas herdam as mesmas regras.
-- ============================================================

-- 1) KANBAN DE ALTA (alta segura) — pendências que travam a alta do paciente,
--    guardadas no próprio leito ocupado (JSON de chaves resolvidas/pendentes).
alter table public.leitos
  add column if not exists alta_pendencias text,     -- JSON: {"exame":true,"receita":false,...} (true = resolvido)
  add column if not exists alta_periodo    text;      -- previsão de saída no dia: manha | tarde | noite

-- 2) METAS POR SETOR — alvos para farol verde/vermelho nos relatórios.
alter table public.setores
  add column if not exists meta_ocupacao    int,       -- % ocupação alvo (ex.: 85)
  add column if not exists meta_permanencia numeric,   -- dias de permanência alvo (ex.: 5)
  add column if not exists meta_giro        numeric;   -- giro de leitos alvo no mês (ex.: 4.0)

-- 3) MOTIVO DA ESPERA NA FILA — categoriza por que o paciente aguarda leito.
alter table public.solicitacoes
  add column if not exists motivo_espera text;         -- sem_vaga | aguardando_limpeza | aguardando_exame | aguardando_familia | aguardando_transporte | regulacao | outro

-- Pronto. Nada mais a fazer.


-- ┌────────────────────────────────────────────────────────────
-- │ 13/30 — migracao-leitos-saida-setor.sql
-- └────────────────────────────────────────────────────────────
-- ============================================================
-- Valentrax — Giro de Leitos · Setor na saída (permanência/giro POR SETOR)
-- Rodar UMA vez no HNSN (Supabase → SQL Editor). Só ADICIONA uma coluna
-- (idempotente; não apaga nem altera nada existente).
-- Guarda em qual setor o paciente estava ao dar saída, para apurar
-- permanência média e giro de leitos por setor (farol das metas).
-- ============================================================

alter table public.leitos_saidas
  add column if not exists setor text;   -- setor do leito no momento da saída (alta/óbito/transferência)

-- Opcional: retro-preencher com o setor ATUAL do leito, só onde ainda está vazio.
-- (Aproximação — o leito pode ter trocado de setor depois. Comente se não quiser.)
update public.leitos_saidas s
   set setor = l.setor
  from public.leitos l
 where s.setor is null
   and s.leito = l.identificacao
   and l.setor is not null;

-- Pronto.


-- ┌────────────────────────────────────────────────────────────
-- │ 14/30 — migracao-suprimentos-faseA.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS (Estoque & Compras) — Fase A
-- Catálogo de materiais + estoque por lote/validade (kardex imutável) + fornecedores
-- Rodar no SQL Editor do Supabase do HNSN. Idempotente (pode rodar de novo sem quebrar).
-- ═══════════════════════════════════════════════════════════

-- Fornecedores (usados nas entradas; base das compras da Fase C)
create table if not exists public.sup_fornecedores (
  id bigserial primary key,
  nome text not null,                    -- razão social / nome fantasia
  cnpj text,
  contato text,                          -- pessoa de contato
  telefone text,
  email text,
  categorias text,                       -- o que fornece (texto livre: "material hospitalar, EPI")
  observacao text,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_forn_nome_idx on public.sup_fornecedores (lower(nome));
alter table public.sup_fornecedores enable row level security;
drop policy if exists sup_forn_select on public.sup_fornecedores;
drop policy if exists sup_forn_insert on public.sup_fornecedores;
drop policy if exists sup_forn_update on public.sup_fornecedores;
drop policy if exists sup_forn_delete on public.sup_fornecedores;
create policy sup_forn_select on public.sup_fornecedores for select to authenticated using (true);
create policy sup_forn_insert on public.sup_fornecedores for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_update on public.sup_fornecedores for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_forn_delete on public.sup_fornecedores for delete to authenticated using (public.my_role() = 'adm_master');

-- Catálogo de materiais e insumos (almoxarifado)
create table if not exists public.sup_itens (
  id bigserial primary key,
  nome text not null,                    -- descrição (ex.: "Luva de procedimento M — cx 100")
  categoria text,                        -- material médico-hospitalar, higiene, EPI, escritório...
  unidade text default 'unidade',        -- unidade de controle (unidade, caixa, pacote, litro...)
  estoque_minimo numeric default 0,      -- ponto de ressuprimento
  custo_unitario numeric,                -- R$ por unidade de controle (para BI)
  ativo boolean default true,
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_itens_nome_idx on public.sup_itens (lower(nome));
alter table public.sup_itens enable row level security;
drop policy if exists sup_itens_select on public.sup_itens;
drop policy if exists sup_itens_insert on public.sup_itens;
drop policy if exists sup_itens_update on public.sup_itens;
drop policy if exists sup_itens_delete on public.sup_itens;
create policy sup_itens_select on public.sup_itens for select to authenticated using (true);
create policy sup_itens_insert on public.sup_itens for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_update on public.sup_itens for update to authenticated using (public.my_role() in ('adm_master','adm_silver')) with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_itens_delete on public.sup_itens for delete to authenticated using (public.my_role() = 'adm_master');

-- Saldo por lote (derivado dos movimentos — mantido pelo trigger)
create table if not exists public.sup_lotes (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote text not null default '',
  validade date,
  quantidade numeric not null default 0,
  updated_at timestamptz default now()
);
create unique index if not exists sup_lotes_uq on public.sup_lotes (item_id, lote);
alter table public.sup_lotes enable row level security;
drop policy if exists sup_lotes_select on public.sup_lotes;
create policy sup_lotes_select on public.sup_lotes for select to authenticated using (true);
-- escrita só pelo trigger (security definer); sem políticas de insert/update/delete direto

-- Kardex: movimentos de estoque (append-only — imutável)
create table if not exists public.sup_movimentos (
  id bigserial primary key,
  item_id bigint not null references public.sup_itens(id) on delete cascade,
  lote_id bigint,                        -- preenchido pelo trigger
  lote text,
  validade date,
  tipo text not null,                    -- entrada | saida
  quantidade numeric not null check (quantidade > 0),
  motivo text,                           -- compra/nota, consumo do setor, perda, ajuste...
  documento text,                        -- nº nota fiscal / requisição
  fornecedor_id bigint references public.sup_fornecedores(id) on delete set null,
  setor text,                            -- destino do consumo (posto, centro cirúrgico...)
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_mov_item_idx on public.sup_movimentos (item_id, created_at desc);
create index if not exists sup_mov_forn_idx on public.sup_movimentos (fornecedor_id);
alter table public.sup_movimentos enable row level security;
drop policy if exists sup_mov_select on public.sup_movimentos;
drop policy if exists sup_mov_insert on public.sup_movimentos;
create policy sup_mov_select on public.sup_movimentos for select to authenticated using (true);
create policy sup_mov_insert on public.sup_movimentos for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: kardex imutável

-- Trigger: aplica o movimento no saldo do lote (cria o lote se necessário)
create or replace function public.sup_aplica_movimento()
returns trigger language plpgsql security definer as $$
declare
  v_lote_id bigint;
  v_lote text := coalesce(new.lote, '');
  v_saldo numeric;
begin
  select id, quantidade into v_lote_id, v_saldo from public.sup_lotes
    where item_id = new.item_id and lote = v_lote;
  if v_lote_id is null then
    insert into public.sup_lotes (item_id, lote, validade, quantidade)
      values (new.item_id, v_lote, new.validade, 0)
      returning id, quantidade into v_lote_id, v_saldo;
  end if;
  if new.tipo = 'saida' and v_saldo < new.quantidade then
    raise exception 'Estoque insuficiente no lote (disponível: %).', v_saldo;
  end if;
  if new.validade is not null then
    update public.sup_lotes set validade = new.validade where id = v_lote_id;
  end if;
  update public.sup_lotes
    set quantidade = quantidade + (case when new.tipo = 'entrada' then new.quantidade else -new.quantidade end),
        updated_at = now()
    where id = v_lote_id;
  new.lote_id := v_lote_id;
  new.lote := v_lote;
  return new;
end $$;
drop trigger if exists sup_movimento_trg on public.sup_movimentos;
create trigger sup_movimento_trg before insert on public.sup_movimentos
  for each row execute function public.sup_aplica_movimento();

-- Verificação rápida (deve listar as 4 tabelas)
select table_name from information_schema.tables
 where table_schema = 'public' and table_name like 'sup_%' order by 1;


-- ┌────────────────────────────────────────────────────────────
-- │ 15/30 — migracao-suprimentos-faseB.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase B: requisições de materiais pelos setores
-- Fluxo: setor pede → almoxarifado recebe (bipe) → separa (baixa FEFO
-- automática no estoque) → pronto → setor confirma a entrega.
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_requisicoes (
  id bigserial primary key,
  setor text not null,
  itens jsonb not null default '[]',
  -- [{item_id, nome, unidade, qtd, qtd_atendida}]
  status text not null default 'aguardando',
  -- aguardando | separacao | pronto | entregue | cancelado
  observacao text,
  solicitado_por text,
  recebido_em timestamptz, recebido_por text,
  pronto_em timestamptz,   pronto_por text,
  entregue_em timestamptz, entregue_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_req_status_idx
  on public.sup_requisicoes (status, created_at desc);
alter table public.sup_requisicoes enable row level security;
drop policy if exists sup_req_select on public.sup_requisicoes;
drop policy if exists sup_req_insert on public.sup_requisicoes;
drop policy if exists sup_req_update on public.sup_requisicoes;
drop policy if exists sup_req_delete on public.sup_requisicoes;
create policy sup_req_select on public.sup_requisicoes
  for select to authenticated
  using (true);
create policy sup_req_insert on public.sup_requisicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_update on public.sup_requisicoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_req_delete on public.sup_requisicoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name = 'sup_requisicoes';


-- ┌────────────────────────────────────────────────────────────
-- │ 16/30 — migracao-suprimentos-seed.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Seed do catálogo (~120 materiais comuns de hospital)
-- Só catálogo (sem estoque). Insere apenas os que ainda NÃO existem
-- (comparação pelo nome) — seguro rodar de novo. Revisar com a equipe.
-- ═══════════════════════════════════════════════════════════
insert into public.sup_itens (nome, categoria, unidade)
select v.nome, v.categoria, v.unidade from (values
  -- Material médico-hospitalar
  ('Luva de procedimento P — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva de procedimento M — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva de procedimento G — caixa 100',            'Material médico-hospitalar', 'caixa'),
  ('Luva cirúrgica estéril 7,0 — par',              'Material médico-hospitalar', 'par'),
  ('Luva cirúrgica estéril 7,5 — par',              'Material médico-hospitalar', 'par'),
  ('Luva cirúrgica estéril 8,0 — par',              'Material médico-hospitalar', 'par'),
  ('Seringa 1 mL (insulina)',                       'Material médico-hospitalar', 'unidade'),
  ('Seringa 3 mL',                                  'Material médico-hospitalar', 'unidade'),
  ('Seringa 5 mL',                                  'Material médico-hospitalar', 'unidade'),
  ('Seringa 10 mL',                                 'Material médico-hospitalar', 'unidade'),
  ('Seringa 20 mL',                                 'Material médico-hospitalar', 'unidade'),
  ('Agulha 25x7',                                   'Material médico-hospitalar', 'unidade'),
  ('Agulha 25x8',                                   'Material médico-hospitalar', 'unidade'),
  ('Agulha 40x12',                                  'Material médico-hospitalar', 'unidade'),
  ('Scalp nº 21',                                   'Material médico-hospitalar', 'unidade'),
  ('Scalp nº 23',                                   'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 18',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 20',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 22',                     'Material médico-hospitalar', 'unidade'),
  ('Cateter intravenoso nº 24',                     'Material médico-hospitalar', 'unidade'),
  ('Equipo macrogotas',                             'Material médico-hospitalar', 'unidade'),
  ('Equipo microgotas',                             'Material médico-hospitalar', 'unidade'),
  ('Equipo para bomba de infusão',                  'Material médico-hospitalar', 'unidade'),
  ('Torneirinha 3 vias',                            'Material médico-hospitalar', 'unidade'),
  ('Extensor / polifix 2 vias',                     'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 14',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 16',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda Foley nº 18',                             'Material médico-hospitalar', 'unidade'),
  ('Sonda uretral nº 10',                           'Material médico-hospitalar', 'unidade'),
  ('Sonda uretral nº 12',                           'Material médico-hospitalar', 'unidade'),
  ('Sonda nasogástrica nº 14',                      'Material médico-hospitalar', 'unidade'),
  ('Sonda nasogástrica nº 16',                      'Material médico-hospitalar', 'unidade'),
  ('Coletor de urina sistema fechado',              'Material médico-hospitalar', 'unidade'),
  ('Coletor de urina sistema aberto',               'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 10 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 15 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Atadura de crepom 20 cm',                       'Material médico-hospitalar', 'unidade'),
  ('Compressa de gaze estéril 7,5x7,5 — pacote',    'Material médico-hospitalar', 'pacote'),
  ('Gaze não estéril — pacote 500',                 'Material médico-hospitalar', 'pacote'),
  ('Compressa cirúrgica 25x28',                     'Material médico-hospitalar', 'unidade'),
  ('Algodão hidrófilo 500 g — rolo',                'Material médico-hospitalar', 'rolo'),
  ('Esparadrapo 10 cm x 4,5 m',                     'Material médico-hospitalar', 'rolo'),
  ('Fita microporosa 2,5 cm',                       'Material médico-hospitalar', 'rolo'),
  ('Fita microporosa 5 cm',                         'Material médico-hospitalar', 'rolo'),
  ('Curativo transparente estéril',                 'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 11',                       'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 15',                       'Material médico-hospitalar', 'unidade'),
  ('Lâmina de bisturi nº 23',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 2-0',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 3-0',                       'Material médico-hospitalar', 'unidade'),
  ('Fio de sutura nylon 4-0',                       'Material médico-hospitalar', 'unidade'),
  ('Eletrodo para ECG — pacote 50',                 'Material médico-hospitalar', 'pacote'),
  ('Gel condutor 100 g',                            'Material médico-hospitalar', 'frasco'),
  ('Abaixador de língua — pacote 100',              'Material médico-hospitalar', 'pacote'),
  ('Máscara de nebulização adulto',                 'Material médico-hospitalar', 'unidade'),
  ('Máscara de nebulização infantil',               'Material médico-hospitalar', 'unidade'),
  ('Cateter nasal de O2 (óculos)',                  'Material médico-hospitalar', 'unidade'),
  ('Umidificador de O2 com frasco',                 'Material médico-hospitalar', 'unidade'),
  ('Swab de álcool 70% — caixa 100',                'Material médico-hospitalar', 'caixa'),
  ('Termômetro clínico digital',                    'Material médico-hospitalar', 'unidade'),
  -- EPI
  ('Máscara cirúrgica tripla — caixa 50',           'EPI', 'caixa'),
  ('Máscara N95 / PFF2',                            'EPI', 'unidade'),
  ('Avental descartável manga longa',               'EPI', 'unidade'),
  ('Avental impermeável',                           'EPI', 'unidade'),
  ('Touca descartável — pacote 100',                'EPI', 'pacote'),
  ('Propé descartável — par',                       'EPI', 'par'),
  ('Óculos de proteção',                            'EPI', 'unidade'),
  ('Protetor facial (face shield)',                 'EPI', 'unidade'),
  ('Luva nitrílica — caixa 100',                    'EPI', 'caixa'),
  -- Higiene e limpeza
  ('Álcool 70% — 1 L',                              'Higiene e limpeza', 'frasco'),
  ('Álcool gel 70% — 500 mL',                       'Higiene e limpeza', 'frasco'),
  ('Sabonete líquido — galão 5 L',                  'Higiene e limpeza', 'galão'),
  ('Clorexidina degermante 2% — 1 L',               'Higiene e limpeza', 'frasco'),
  ('Clorexidina alcoólica 0,5% — 1 L',              'Higiene e limpeza', 'frasco'),
  ('Hipoclorito de sódio 1% — 1 L',                 'Higiene e limpeza', 'frasco'),
  ('Desinfetante hospitalar — galão 5 L',           'Higiene e limpeza', 'galão'),
  ('Saco de lixo comum 100 L — pacote 100',         'Higiene e limpeza', 'pacote'),
  ('Saco de lixo infectante branco 100 L — pct',    'Higiene e limpeza', 'pacote'),
  ('Papel toalha interfolha — pacote 1000',         'Higiene e limpeza', 'pacote'),
  ('Papel higiênico rolão — fardo 8',               'Higiene e limpeza', 'pacote'),
  ('Pano multiuso — pacote',                        'Higiene e limpeza', 'pacote'),
  -- Escritório e expediente
  ('Papel A4 — resma 500',                          'Escritório e expediente', 'resma'),
  ('Caneta esferográfica azul',                     'Escritório e expediente', 'unidade'),
  ('Caneta esferográfica preta',                    'Escritório e expediente', 'unidade'),
  ('Caneta esferográfica vermelha',                 'Escritório e expediente', 'unidade'),
  ('Grampo 26/6 — caixa 5000',                      'Escritório e expediente', 'caixa'),
  ('Clips 2/0 — caixa 100',                         'Escritório e expediente', 'caixa'),
  ('Pasta AZ',                                      'Escritório e expediente', 'unidade'),
  ('Envelope A4',                                   'Escritório e expediente', 'unidade'),
  ('Etiqueta adesiva — rolo',                       'Escritório e expediente', 'rolo'),
  ('Pilha AA — par',                                'Escritório e expediente', 'par'),
  ('Pilha AAA — par',                               'Escritório e expediente', 'par'),
  -- Impressos e formulários
  ('Capa de prontuário',                            'Impressos e formulários', 'unidade'),
  ('Folha de evolução clínica — bloco',             'Impressos e formulários', 'pacote'),
  ('Folha de prescrição médica — bloco',            'Impressos e formulários', 'pacote'),
  ('Ficha de atendimento PS — bloco',               'Impressos e formulários', 'pacote'),
  ('Pulseira de identificação do paciente',         'Impressos e formulários', 'unidade'),
  ('Receituário comum — bloco',                     'Impressos e formulários', 'pacote'),
  -- Rouparia e enxoval
  ('Lençol solteiro',                               'Rouparia e enxoval', 'unidade'),
  ('Fronha',                                        'Rouparia e enxoval', 'unidade'),
  ('Cobertor',                                      'Rouparia e enxoval', 'unidade'),
  ('Toalha de banho',                               'Rouparia e enxoval', 'unidade'),
  ('Camisola de paciente',                          'Rouparia e enxoval', 'unidade'),
  ('Campo cirúrgico simples',                       'Rouparia e enxoval', 'unidade'),
  -- Nutrição e copa
  ('Copo descartável 200 mL — pacote 100',          'Nutrição e copa', 'pacote'),
  ('Copo descartável 50 mL — pacote 100',           'Nutrição e copa', 'pacote'),
  ('Colher descartável — pacote 100',               'Nutrição e copa', 'pacote'),
  ('Guardanapo — pacote',                           'Nutrição e copa', 'pacote'),
  ('Filtro de café nº 103 — caixa 30',              'Nutrição e copa', 'caixa'),
  -- Manutenção predial
  ('Lâmpada LED tubular',                           'Manutenção predial', 'unidade'),
  ('Fita isolante — rolo',                          'Manutenção predial', 'rolo'),
  ('Tomada / plugue',                               'Manutenção predial', 'unidade'),
  ('Bateria 9 V',                                   'Manutenção predial', 'unidade'),
  ('Cadeado',                                       'Manutenção predial', 'unidade'),
  -- Informática
  ('Toner de impressora (modelo padrão)',           'Informática', 'unidade'),
  ('Mouse USB',                                     'Informática', 'unidade'),
  ('Teclado USB',                                   'Informática', 'unidade'),
  ('Cabo de rede montado 2 m',                      'Informática', 'unidade'),
  -- Laboratório
  ('Tubo de coleta EDTA (tampa roxa)',              'Laboratório', 'unidade'),
  ('Tubo de coleta soro (tampa amarela)',           'Laboratório', 'unidade'),
  ('Agulha para coleta a vácuo',                    'Laboratório', 'unidade'),
  ('Lanceta descartável',                           'Laboratório', 'unidade'),
  ('Frasco de urina estéril',                       'Laboratório', 'unidade')
) as v(nome, categoria, unidade)
where not exists (
  select 1 from public.sup_itens s
   where lower(s.nome) = lower(v.nome)
);

-- Verificação: total por categoria
select categoria, count(*) as itens
  from public.sup_itens
 group by categoria
 order by categoria;


-- ┌────────────────────────────────────────────────────────────
-- │ 17/30 — migracao-suprimentos-faseC.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Fase C: pedidos de compra
-- Pedido por fornecedor com itens de MATERIAL (almoxarifado) e/ou
-- MEDICAMENTO (farmácia). Recebimento gera entrada automática no
-- estoque correspondente. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_pedidos (
  id bigserial primary key,
  fornecedor_id bigint
    references public.sup_fornecedores(id) on delete set null,
  fornecedor_nome text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade,
  --   qtd, custo_unit, qtd_recebida}]
  status text not null default 'aberto',
  -- aberto | enviado | parcial | recebido | cancelado
  previsao_entrega date,
  observacao text,
  enviado_em timestamptz,  enviado_por text,
  recebido_em timestamptz, recebido_por text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_ped_status_idx
  on public.sup_pedidos (status, created_at desc);
create index if not exists sup_ped_forn_idx
  on public.sup_pedidos (fornecedor_id);
alter table public.sup_pedidos enable row level security;
drop policy if exists sup_ped_select on public.sup_pedidos;
drop policy if exists sup_ped_insert on public.sup_pedidos;
drop policy if exists sup_ped_update on public.sup_pedidos;
drop policy if exists sup_ped_delete on public.sup_pedidos;
create policy sup_ped_select on public.sup_pedidos
  for select to authenticated
  using (true);
create policy sup_ped_insert on public.sup_pedidos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_update on public.sup_pedidos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_ped_delete on public.sup_pedidos
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_pedidos ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_pedidos');


-- ┌────────────────────────────────────────────────────────────
-- │ 18/30 — migracao-suprimentos-inventario.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Inventário cíclico + custo por entrada + código de barras
-- 1) sup_inventarios: contagens cegas (append-only) p/ acuracidade
-- 2) custo_unit nos movimentos (sup e farm) p/ custo médio ponderado
-- 3) codigo_barras no catálogo de materiais
-- Idempotente. Rodar no SQL Editor do Supabase do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Contagens de inventário (append-only)
create table if not exists public.sup_inventarios (
  id bigserial primary key,
  item_id bigint not null
    references public.sup_itens(id) on delete cascade,
  saldo_sistema numeric not null,
  contado numeric not null,
  diferenca numeric not null,          -- contado − sistema
  ajustado boolean default false,      -- ajuste lançado no kardex?
  observacao text,
  usuario text,
  created_at timestamptz default now()
);
create index if not exists sup_inv_item_idx
  on public.sup_inventarios (item_id, created_at desc);
alter table public.sup_inventarios enable row level security;
drop policy if exists sup_inv_select on public.sup_inventarios;
drop policy if exists sup_inv_insert on public.sup_inventarios;
create policy sup_inv_select on public.sup_inventarios
  for select to authenticated
  using (true);
create policy sup_inv_insert on public.sup_inventarios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: histórico de contagens imutável

-- 2) Custo unitário no movimento (compras reais → custo médio ponderado)
alter table public.sup_movimentos
  add column if not exists custo_unit numeric;
alter table public.farm_movimentos
  add column if not exists custo_unit numeric;

-- 3) Código de barras no catálogo
alter table public.sup_itens
  add column if not exists codigo_barras text;
create index if not exists sup_itens_barras_idx
  on public.sup_itens (codigo_barras);

-- Verificação
select 'inventario ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_inventarios')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_movimentos'
                  and column_name = 'custo_unit')
   and exists (select 1 from information_schema.columns
                where table_name = 'sup_itens'
                  and column_name = 'codigo_barras');


-- ┌────────────────────────────────────────────────────────────
-- │ 19/30 — migracao-suprimentos-ponto-de-pedido.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Ponto de pedido: prazo de entrega por fornecedor
-- 1 coluna nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
alter table public.sup_fornecedores
  add column if not exists lead_time_dias int;

-- Verificação
select 'lead_time ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'sup_fornecedores'
                  and column_name = 'lead_time_dias');


-- ┌────────────────────────────────────────────────────────────
-- │ 20/30 — migracao-suprimentos-cotacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- SUPRIMENTOS — Cotação de compra (comparar preços entre fornecedores)
-- 1 tabela. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.sup_cotacoes (
  id bigserial primary key,
  descricao text,
  itens jsonb not null default '[]',
  -- [{tipo:'material'|'medicamento', item_id, nome, unidade, qtd,
  --   precos: { <fornecedor_id>: preco_unit }}]
  fornecedores jsonb not null default '[]',   -- ids dos fornecedores cotados
  status text not null default 'aberta',      -- aberta | fechada | cancelada
  observacao text,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sup_cot_status_idx
  on public.sup_cotacoes (status, created_at desc);
alter table public.sup_cotacoes enable row level security;
drop policy if exists sup_cot_select on public.sup_cotacoes;
drop policy if exists sup_cot_insert on public.sup_cotacoes;
drop policy if exists sup_cot_update on public.sup_cotacoes;
drop policy if exists sup_cot_delete on public.sup_cotacoes;
create policy sup_cot_select on public.sup_cotacoes
  for select to authenticated
  using (true);
create policy sup_cot_insert on public.sup_cotacoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_update on public.sup_cotacoes
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy sup_cot_delete on public.sup_cotacoes
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'sup_cotacoes ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public'
                  and table_name = 'sup_cotacoes');


-- ┌────────────────────────────────────────────────────────────
-- │ 21/30 — migracao-ps-salas.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — Mapa de salas (Emergência / Observação / Sala Vermelha)
-- 1 tabela nova. Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.ps_salas (
  id bigserial primary key,
  identificacao text not null unique,   -- "01", "02", "Sala 03"...
  area text not null default 'Emergência',  -- Emergência | Observação | Sala Vermelha | ...
  status text not null default 'disponivel', -- disponivel | ocupado | limpeza | manutencao
  atendimento_id bigint                     -- paciente do PS ocupando a sala
    references public.ps_atendimentos(id) on delete set null,
  ocupado_em timestamptz,
  observacao text,
  ordem int default 0,
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_salas_area_idx on public.ps_salas (area, ordem);
create index if not exists ps_salas_atend_idx on public.ps_salas (atendimento_id);
alter table public.ps_salas enable row level security;
drop policy if exists ps_salas_select on public.ps_salas;
drop policy if exists ps_salas_insert on public.ps_salas;
drop policy if exists ps_salas_update on public.ps_salas;
drop policy if exists ps_salas_delete on public.ps_salas;
create policy ps_salas_select on public.ps_salas
  for select to authenticated
  using (true);
create policy ps_salas_insert on public.ps_salas
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_update on public.ps_salas
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_salas_delete on public.ps_salas
  for delete to authenticated
  using (public.my_role() = 'adm_master');

-- Verificação
select 'ps_salas ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_salas');


-- ┌────────────────────────────────────────────────────────────
-- │ 22/30 — migracao-ps-salas-censo.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — estrutura real das vagas + regra de censo
--
-- REGRA: retaguarda provisória de alta rotatividade NÃO entra nos 75 leitos
-- do hospital — conta só no panorama do PS.
--   NÃO contam: Observação, Procedimento, PCR e Isolamento infantil.
--   Contam:     Sala Vermelha, Sala Laranja, Sala AVC, Isolamento adulto,
--               Pediatria (leitos comuns).
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Coluna de censo
alter table public.ps_salas
  add column if not exists conta_censo boolean default true;

-- 2) Biblioteca de protocolos do PS (para "Abrir / cadastrar protocolo")
create table if not exists public.ps_protocolos (
  id bigserial primary key,
  titulo text not null,
  categoria text,                 -- ex.: PCR, AVC, Sepse, Dor torácica...
  resumo text,
  conteudo text,                  -- passos do protocolo
  referencia text,                -- literatura / fonte
  ativo boolean default true,
  usuario text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists ps_protoc_cat_idx on public.ps_protocolos (categoria, titulo);
alter table public.ps_protocolos enable row level security;
drop policy if exists ps_protoc_select on public.ps_protocolos;
drop policy if exists ps_protoc_insert on public.ps_protocolos;
drop policy if exists ps_protoc_update on public.ps_protocolos;
drop policy if exists ps_protoc_delete on public.ps_protocolos;
create policy ps_protoc_select on public.ps_protocolos
  for select to authenticated using (true);
create policy ps_protoc_insert on public.ps_protocolos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_protoc_update on public.ps_protocolos
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy ps_protoc_delete on public.ps_protocolos
  for delete to authenticated using (public.my_role() = 'adm_master');

-- 3) Vagas reais do PS (só insere as que ainda não existem)
insert into public.ps_salas (identificacao, area, ordem, conta_censo, status, ativo)
select v.ident, v.area, v.ord, v.censo, 'disponivel', true from (values
  -- Sala Vermelha — 3 leitos (contam no censo)
  ('VM-01','Sala Vermelha',1,true), ('VM-02','Sala Vermelha',2,true), ('VM-03','Sala Vermelha',3,true),
  -- Sala Laranja — 3 leitos (contam)
  ('LR-01','Sala Laranja',1,true), ('LR-02','Sala Laranja',2,true), ('LR-03','Sala Laranja',3,true),
  -- Sala AVC — 5 leitos (contam)
  ('AVC-01','Sala AVC',1,true), ('AVC-02','Sala AVC',2,true), ('AVC-03','Sala AVC',3,true),
  ('AVC-04','Sala AVC',4,true), ('AVC-05','Sala AVC',5,true),
  -- Isolamento adulto — 2 leitos (contam)
  ('AQUARIO','Isolamento',1,true), ('GUARIDA','Isolamento',2,true),
  -- Pediatria — 2 leitos comuns (contam) + 1 isolamento infantil (NÃO conta)
  ('PED-01','Pediatria',1,true), ('PED-02','Pediatria',2,true), ('PED-ISO','Pediatria',3,false),
  -- Retaguarda provisória — NÃO contam no censo dos 75
  ('OBS-01','Observação',1,false), ('OBS-02','Observação',2,false), ('OBS-03','Observação',3,false),
  ('PROC-01','Procedimento',1,false), ('PROC-02','Procedimento',2,false), ('PROC-03','Procedimento',3,false),
  ('PCR-01','PCR',1,false), ('PCR-02','PCR',2,false)
) as v(ident, area, ord, censo)
where not exists (select 1 from public.ps_salas s where s.identificacao = v.ident);

-- Verificação: vagas por área e quantas contam no censo
select area,
       count(*) as vagas,
       count(*) filter (where conta_censo) as no_censo_75,
       count(*) filter (where not conta_censo) as so_no_ps
  from public.ps_salas
 group by area
 order by area;


-- ┌────────────────────────────────────────────────────────────
-- │ 23/30 — migracao-ps-origem-elo.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — origem da chegada + elo forte PS → leito
--
-- 1) Origem/procedência do paciente (SAMU, GERINT, meios próprios…)
-- 2) Vínculo por ID entre o atendimento do PS, a fila de leito e o leito.
--    Hoje o elo é pelo NÚMERO DO PRONTUÁRIO como texto: se vier vazio ou
--    digitado diferente, o rastro do paciente quebra entre o PS e a internação.
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

-- 1) Origem da chegada
alter table public.ps_atendimentos
  add column if not exists origem text,          -- SAMU | Transalva | Polícia Militar | Bombeiros | Meios próprios | GERINT | Outro
  add column if not exists origem_detalhe text;  -- unidade de origem no GERINT (PA Torres, Arroio do Sal, Três Cachoeiras…)
create index if not exists ps_atend_origem_idx on public.ps_atendimentos (origem);

-- 2) Elo forte: fila de leito e leito apontam para o atendimento do PS
alter table public.solicitacoes
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists solic_ps_atend_idx on public.solicitacoes (ps_atendimento_id);

alter table public.leitos
  add column if not exists ps_atendimento_id bigint
    references public.ps_atendimentos(id) on delete set null;
create index if not exists leitos_ps_atend_idx on public.leitos (ps_atendimento_id);

-- Verificação
select 'origem+elo ok' as resultado
 where exists (select 1 from information_schema.columns
                where table_name = 'ps_atendimentos' and column_name = 'origem')
   and exists (select 1 from information_schema.columns
                where table_name = 'solicitacoes' and column_name = 'ps_atendimento_id')
   and exists (select 1 from information_schema.columns
                where table_name = 'leitos' and column_name = 'ps_atendimento_id');


-- ┌────────────────────────────────────────────────────────────
-- │ 24/30 — migracao-ps-checagem-medicacao.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTO-SOCORRO — checagem de medicação administrada
--
-- Hoje a cadeia do medicamento termina em "a farmácia dispensou"
-- (farm_movimentos, baixa de estoque). Isso prova que o remédio SAIU DA
-- FARMÁCIA, não que ele ENTROU NO PACIENTE. Falta o registro de quem
-- administrou, a que horas, e o motivo quando a dose não foi dada.
--
-- Registro clínico APPEND-ONLY: sem update, sem delete (igual a
-- ps_registros/ps_sinais/ps_prescricao_itens).
-- Idempotente. Rodar no SQL Editor do HNSN.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.ps_administracoes (
  id bigserial primary key,
  -- cascade: apagar o episódio (ação de adm_master, uso de limpeza de teste)
  -- leva junto a checagem; linha órfã apontando para episódio inexistente
  -- seria pior — não é editável nem auditável.
  atendimento_id bigint not null references public.ps_atendimentos(id) on delete cascade,
  prescricao_item_id bigint references public.ps_prescricao_itens(id) on delete set null,
  medicamento_id bigint,
  medicamento_nome text not null,
  dose text,
  via text,
  status text not null default 'administrado',  -- administrado | nao_administrado
  motivo text,                                  -- preenchido quando nao_administrado
  observacao text,
  categoria text,                               -- enfermagem | tecnico | medica | outro
  administrado_em timestamptz not null default now(),
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists ps_adm_atend_idx on public.ps_administracoes (atendimento_id, administrado_em desc);
create index if not exists ps_adm_item_idx  on public.ps_administracoes (prescricao_item_id);

alter table public.ps_administracoes enable row level security;
drop policy if exists ps_adm_select on public.ps_administracoes;
drop policy if exists ps_adm_insert on public.ps_administracoes;
create policy ps_adm_select on public.ps_administracoes for select to authenticated using (true);
create policy ps_adm_insert on public.ps_administracoes for insert to authenticated with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável

-- Verificação
select 'checagem de medicação ok' as resultado
 where exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name = 'ps_administracoes')
   and exists (select 1 from information_schema.columns
                where table_name = 'ps_administracoes' and column_name = 'administrado_em');


-- ┌────────────────────────────────────────────────────────────
-- │ 25/30 — migracao-pep-fase1.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP) — Fase 1
--
-- O QUE MUDA
-- O módulo "Paciente 360" de hoje é um RESUMO: ele lê o que os outros
-- módulos já gravaram (PS, leitos, SCIH, farmácia) e monta uma linha do
-- tempo. Registro clínico próprio ele só tem um: `pep_evolucoes`, um texto
-- livre com um `tipo`. Isso não é prontuário — não há admissão, não há
-- prescrição de internado, não há aprazamento, não há checagem, e a
-- alergia do paciente está presa ao episódio do PS.
--
-- Esta migração cria a espinha do PEP: episódio de cuidado, anamnese/exame
-- físico, prescrição (médica e de enfermagem) com aprazamento e checagem,
-- anotações de enfermagem, sinais vitais seriados e as listas persistentes
-- do paciente (alergias e problemas/condições).
--
-- O QUE **NÃO** É RECRIADO (já existe e continua valendo)
--   • `pacientes`            — cadastro mínimo LGPD (iniciais + prontuário).
--   • `pep_evolucoes`        — evolução multiprofissional. NÃO é substituída:
--                              ganha colunas (episódio, SOAP, correção, autor).
--   • `ps_atendimentos`,
--     `ps_sinais`,
--     `ps_registros`,
--     `ps_prescricao_itens`,
--     `ps_administracoes`    — o episódio do Pronto-Socorro continua inteiro
--                              no módulo dele. O PEP se pendura nele por
--                              `pep_episodios.ps_atendimento_id`, não o
--                              reescreve. Migrar o PS para as tabelas novas
--                              é decisão de outra fase.
--   • `leitos`, `leitos_saidas`, `leitos_turnover` — gestão de leito é
--                              estado do LEITO, não do paciente. O PEP não
--                              duplica isso; `pep_episodios` guarda apenas
--                              o leito/setor como texto de contexto.
--   • `farm_medicamentos` e o kardex — catálogo e estoque não são PEP.
--
-- ── REGRA 1: REGISTRO CLÍNICO É APPEND-ONLY ────────────────
-- Nenhuma tabela clínica desta migração tem política de UPDATE ou DELETE.
-- Sem política, o PostgREST recusa a operação para qualquer papel, inclusive
-- `adm_master` — é o mesmo mecanismo já usado em `ps_registros`,
-- `ps_administracoes` e no kardex da farmácia.
-- Corrigir = INSERIR um registro novo com `corrige_id` apontando para o
-- errado e `motivo_correcao` preenchido. O registro errado permanece: é o
-- que dá valor probatório ao prontuário.
-- Consequência prática para o front-end: a "versão atual" de um registro é
-- aquela que ninguém corrigiu, ou seja
--     ... where not exists (select 1 from <tabela> c where c.corrige_id = t.id)
--
-- A única exceção é `pep_episodios` — que é o CONTINENTE, não o conteúdo
-- clínico. Ele precisa ser fechado (alta/desfecho), exatamente como
-- `ps_atendimentos` já é. Tem UPDATE restrito e NÃO tem DELETE.
--
-- ── REGRA 2: `criado_em` E NÃO `created_at` ────────────────
-- O banco está dividido: 23 tabelas usam `created_at` e 3 usam `criado_em`.
-- A divisão não é aleatória — as 3 em português (`pep_evolucoes`,
-- `ps_registros`, `ps_administracoes`) são exatamente as tabelas de
-- REGISTRO CLÍNICO APPEND-ONLY. Aqui `criado_em` é adotado para todas as
-- tabelas novas, por três motivos:
--   1. `pep_evolucoes` já usa `criado_em`. Uma irmã com `created_at` faria
--      o mesmo módulo ordenar por dois nomes diferentes — erro que já
--      mordeu o time (ver comentário no App.jsx, carga do Paciente 360).
--   2. Vira uma regra que dá para lembrar: **tabela `pep_*` → `criado_em`**.
--   3. Reforça a leitura semântica: `criado_em` = carimbo imutável do fato
--      clínico; `created_at`/`updated_at` = tabela operacional editável.
-- `pep_episodios`, por ser operacional, tem também `atualizado_em`.
--
-- ── REGRA 3: MIGRAÇÃO ADITIVA ──────────────────────────────
-- Só `create table if not exists` / `add column if not exists` / índices.
-- Nenhum drop de tabela ou coluna. Idempotente: pode rodar de novo.
--
-- ── REGRA 4: LGPD ──────────────────────────────────────────
-- Nenhuma coluna de nome completo, CPF, endereço ou telefone do paciente.
-- A identificação continua sendo iniciais + prontuário. Os campos de NOME
-- que existem aqui (`profissional_nome`, `executor_nome`) são do
-- PROFISSIONAL, não do paciente — são exigência de rastreabilidade
-- assistencial (quem escreveu, quem administrou) e vêm acompanhados de
-- conselho + registro (CRM/COREN/CREFITO/CRN/CRESS).
--
-- ── SOBRE O `prontuario` SEM CHAVE ESTRANGEIRA ─────────────
-- `prontuario` é texto indexado, SEM foreign key para `pacientes`, igual a
-- `pep_evolucoes` e `ps_atendimentos`. É deliberado: o PS cadastra por
-- iniciais e muitos episódios reais existem antes de o paciente entrar em
-- `pacientes`. Uma FK aqui faria a enfermagem NÃO CONSEGUIR SALVAR uma
-- alergia no meio do plantão. Integridade por convenção, como no resto do
-- sistema. (Ver "Pontos em aberto" no relatório: fechar isso depois exige
-- backfill de `pacientes`.)
--
-- ── PAPÉIS ─────────────────────────────────────────────────
-- Segue EXATAMENTE o padrão vigente, via `public.my_role()`:
--   • SELECT  → todo autenticado (`using (true)`)  → analista e visualizador
--   • INSERT  → adm_master, adm_silver
--   • UPDATE  → adm_master, adm_silver  (só `pep_episodios`)
--   • DELETE  → adm_master             (nenhuma tabela desta migração)
-- Apertar o SELECT por papel é decisão CLÍNICA em aberto (CONTEXTO.md,
-- "Decisões em aberto" nº 0) e NÃO foi antecipada aqui: fazer isso sozinho
-- tiraria acesso de quem tem direito no meio do plantão.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) EPISÓDIO DE CUIDADO — a espinha do prontuário
--
-- Hoje não existe nada que represente "esta internação". `leitos` é o
-- estado atual de um LEITO (é sobrescrito na próxima ocupação) e
-- `leitos_saidas` só nasce na alta. Não há um id estável para pendurar
-- evolução, prescrição e checagem durante a internação inteira.
-- `pep_episodios` é esse id.
--
-- Todo registro clínico desta migração aponta para o PACIENTE
-- (`prontuario`, obrigatório) e OPCIONALMENTE para o episódio. Episódio
-- nulo é aceito de propósito: permite adotar o PEP por partes, sem exigir
-- que alguém abra episódio antes de registrar um sinal vital.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_episodios (
  id bigserial primary key,
  prontuario text not null,
  iniciais text,                          -- redundância proposital: a lista
                                          -- de episódios não depende de join
  tipo text not null default 'internacao', -- internacao | ps | ambulatorio | observacao | day_clinic
  -- Elo com o episódio do PS, quando a internação nasceu de lá. Mesmo
  -- padrão de `solicitacoes.ps_atendimento_id` e `leitos.ps_atendimento_id`.
  ps_atendimento_id bigint references public.ps_atendimentos(id) on delete set null,
  -- Leito/setor como TEXTO, não FK: `leitos.identificacao` é reaproveitado
  -- pelo próximo paciente. Guardar a FK apontaria para a ocupação errada
  -- daqui a dois dias.
  leito text,
  setor text,
  especialidade text,
  admissao_em timestamptz not null default now(),
  alta_em timestamptz,
  desfecho text,                          -- alta | obito | transferencia | evasao | alta_a_pedido
  desfecho_detalhe text,
  cid_principal text,
  cid_secundarios text,                   -- lista separada por vírgula
  motivo_internacao text,
  status text not null default 'aberto',  -- aberto | encerrado
  observacao text,
  usuario text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pep_epis_pront_idx on public.pep_episodios (prontuario, admissao_em desc);
create index if not exists pep_epis_status_idx on public.pep_episodios (status, admissao_em desc);
create index if not exists pep_epis_ps_idx on public.pep_episodios (ps_atendimento_id);
alter table public.pep_episodios enable row level security;
drop policy if exists pep_epis_select on public.pep_episodios;
drop policy if exists pep_epis_insert on public.pep_episodios;
drop policy if exists pep_epis_update on public.pep_episodios;
create policy pep_epis_select on public.pep_episodios
  for select to authenticated
  using (true);
create policy pep_epis_insert on public.pep_episodios
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
create policy pep_epis_update on public.pep_episodios
  for update to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem delete: episódio encerrado é histórico assistencial, não some


-- ═══════════════════════════════════════════════════════════
-- 2) ANAMNESE + EXAME FÍSICO — a admissão
--
-- É o registro de ENTRADA, e é multiprofissional: o médico faz anamnese e
-- exame físico; a enfermagem faz o histórico de enfermagem (SAE, primeira
-- etapa); nutrição faz a triagem nutricional; serviço social faz a
-- avaliação social. Todos preenchem a mesma tabela mudando `categoria` —
-- separar em cinco tabelas quase idênticas não pagaria o custo.
--
-- Os achados por sistema vão em `sistemas` (jsonb) porque a lista varia por
-- profissão e por protocolo do hospital; virar coluna cada um deles
-- engessaria o formulário e exigiria migração a cada ajuste clínico.
-- APPEND-ONLY. Corrigir = novo registro com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anamneses (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  categoria text not null default 'medica',
  -- medica | enfermagem | fisioterapia | nutricao | servico_social | psicologia | farmacia
  queixa_principal text,
  historia_doenca_atual text,
  antecedentes_pessoais text,
  antecedentes_familiares text,
  medicamentos_em_uso text,               -- reconciliação medicamentosa na entrada
  habitos text,                           -- tabagismo, etilismo, atividade física
  alergias_relatadas text,                -- o que o paciente RELATOU na admissão;
                                          -- a lista oficial é `pep_alergias`
  exame_fisico text,                      -- exame geral, texto livre
  sistemas jsonb not null default '{}',   -- {"cardiovascular":"...","respiratorio":"..."}
  escalas jsonb not null default '{}',    -- {"braden":18,"morse":45,"glasgow":15}
  hipoteses_diagnosticas text,
  cid_suspeito text,
  conduta_inicial text,
  plano_terapeutico text,
  observacao text,
  -- Cadeia de correção (append-only)
  corrige_id bigint references public.pep_anamneses(id) on delete set null,
  motivo_correcao text,
  -- Autoria assistencial (rastreabilidade; NÃO é dado do paciente)
  profissional_nome text,
  conselho text,                          -- CRM | COREN | CREFITO | CRN | CRESS | CRP | CRF
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anam_pront_idx on public.pep_anamneses (prontuario, criado_em desc);
create index if not exists pep_anam_epis_idx on public.pep_anamneses (episodio_id, criado_em desc);
create index if not exists pep_anam_corrige_idx on public.pep_anamneses (corrige_id);
alter table public.pep_anamneses enable row level security;
drop policy if exists pep_anam_select on public.pep_anamneses;
drop policy if exists pep_anam_insert on public.pep_anamneses;
create policy pep_anam_select on public.pep_anamneses
  for select to authenticated
  using (true);
create policy pep_anam_insert on public.pep_anamneses
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 3) EVOLUÇÃO MULTIPROFISSIONAL — extensão de `pep_evolucoes`
--
-- A tabela JÁ EXISTE e já é append-only, com `tipo` cobrindo
-- evolucao_medica | enfermagem | fisioterapia | nutricao | anotacao.
-- Recriá-la quebraria a tela do Paciente 360 e jogaria fora o histórico.
-- Ela só ganha o que faltava: vínculo com o episódio, estrutura SOAP
-- opcional, cadeia de correção e autoria com conselho profissional.
--
-- `tipo` é texto livre, então os valores novos entram sem migração:
--   servico_social | psicologia | farmacia_clinica | fonoaudiologia
-- ═══════════════════════════════════════════════════════════
alter table public.pep_evolucoes
  add column if not exists episodio_id bigint references public.pep_episodios(id) on delete set null,
  add column if not exists categoria text,             -- admissao | diaria | intercorrencia | alta | parecer
  -- SOAP: opcional e ADICIONAL a `texto`, que continua sendo o campo
  -- obrigatório. Quem escreve corrido não é obrigado a estruturar.
  add column if not exists subjetivo text,
  add column if not exists objetivo text,
  add column if not exists avaliacao text,
  add column if not exists plano text,
  add column if not exists corrige_id bigint references public.pep_evolucoes(id) on delete set null,
  add column if not exists motivo_correcao text,
  add column if not exists profissional_nome text,
  add column if not exists conselho text,
  add column if not exists registro_conselho text;
create index if not exists pep_evol_epis_idx on public.pep_evolucoes (episodio_id, criado_em desc);
create index if not exists pep_evol_corrige_idx on public.pep_evolucoes (corrige_id);
create index if not exists pep_evol_tipo_idx on public.pep_evolucoes (tipo, criado_em desc);
-- RLS e políticas (pep_select / pep_insert) já existem no schema.sql e
-- continuam corretas: select para autenticado, insert restrito, sem
-- update/delete. Nada a refazer aqui.


-- ═══════════════════════════════════════════════════════════
-- 4) PRESCRIÇÃO — cabeçalho (médica E de enfermagem)
--
-- No hospital a prescrição é um DOCUMENTO DO DIA, assinado, com validade
-- de 24h, e a do dia seguinte substitui a anterior. Por isso cabeçalho
-- separado dos itens: é ele que tem vigência, assinatura e substituição.
--
-- Uma tabela só para as duas naturezas (`tipo`), porque a estrutura é
-- idêntica — muda o prescritor e o que entra nos itens. Duas tabelas
-- gêmeas dobrariam o código de aprazamento e checagem sem ganho.
--
-- APPEND-ONLY: prescrição não é editada. Trocar a prescrição = inserir uma
-- nova com `substitui_id` apontando para a anterior. Suspender/reativar =
-- evento em `pep_prescricao_eventos` (item 6).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medica',    -- medica | enfermagem
  -- Data de referência SEM `current_date`: no Supabase o banco roda em UTC
  -- e, depois das 21h no Brasil, `current_date` já é o dia seguinte. Foi
  -- exatamente esse o bug crítico do PR #1 (`todayStr()` em UTC). Aqui o
  -- default é explicitamente o dia civil de São Paulo.
  data_referencia date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  inicio_em timestamptz not null default now(),
  validade_em timestamptz,                -- normalmente inicio_em + 24h
  substitui_id bigint references public.pep_prescricoes(id) on delete set null,
  motivo_substituicao text,               -- inclui "correção de erro de digitação"
  observacao text,
  -- Assinatura do prescritor
  prescritor_nome text,
  conselho text,                          -- CRM (médica) | COREN (enfermagem)
  registro_conselho text,
  assinada_em timestamptz,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_presc_pront_idx on public.pep_prescricoes (prontuario, data_referencia desc);
create index if not exists pep_presc_epis_idx on public.pep_prescricoes (episodio_id, data_referencia desc);
create index if not exists pep_presc_subst_idx on public.pep_prescricoes (substitui_id);
alter table public.pep_prescricoes enable row level security;
drop policy if exists pep_presc_select on public.pep_prescricoes;
drop policy if exists pep_presc_insert on public.pep_prescricoes;
create policy pep_presc_select on public.pep_prescricoes
  for select to authenticated
  using (true);
create policy pep_presc_insert on public.pep_prescricoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 5) ITENS DA PRESCRIÇÃO
--
-- Cobre medicamento, dieta, cuidado de enfermagem, procedimento, exame e
-- terapias. Um `tipo` só, porque todos precisam da mesma coisa: aprazar e
-- checar. "Mudança de decúbito 2/2h" e "Dipirona 500 mg 6/6h" têm o mesmo
-- ciclo de vida operacional.
--
-- Campos numéricos de dose repetem a escolha já feita em
-- `ps_prescricao_itens` (dose_valor / dose_unidade / frequencia_dia) — é o
-- que o motor de alerta da farmácia clínica consome. Texto livre de dose
-- não serve para calcular dose máxima diária.
--
-- `intervalo_horas` existe para GERAR o aprazamento; `frequencia` guarda o
-- que o prescritor escreveu ("6/6h", "ACM", "após as refeições").
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_itens (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,               -- desnormalizado: o Paciente 360
                                          -- consulta por paciente, não por
                                          -- prescrição
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  tipo text not null default 'medicamento',
  -- medicamento | dieta | cuidado_enfermagem | procedimento | exame |
  -- fisioterapia | oxigenoterapia | soro | curativo
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- o texto do item como prescrito
  apresentacao text,
  dose text,                              -- como escrito ("500 mg")
  dose_valor numeric,                     -- para o motor de alertas
  dose_unidade text,
  via text,                               -- VO | EV | IM | SC | SL | IN | RETAL | SONDA | TOP
  diluicao text,
  velocidade_infusao text,
  frequencia text,                        -- como escrito ("6/6h", "ACM")
  frequencia_dia numeric,                 -- doses por dia (cálculo de dose máxima)
  intervalo_horas numeric,                -- base do aprazamento automático
  duracao_dias numeric,
  quantidade numeric,
  unidade text,
  se_necessario boolean not null default false,  -- SOS/ACM: não gera aprazamento fixo
  condicao_sos text,                      -- "se dor", "se T > 37,8"
  ordem int default 0,
  observacao text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pitem_presc_idx on public.pep_prescricao_itens (prescricao_id, ordem);
create index if not exists pep_pitem_pront_idx on public.pep_prescricao_itens (prontuario, criado_em desc);
create index if not exists pep_pitem_med_idx on public.pep_prescricao_itens (medicamento_id);
alter table public.pep_prescricao_itens enable row level security;
drop policy if exists pep_pitem_select on public.pep_prescricao_itens;
drop policy if exists pep_pitem_insert on public.pep_prescricao_itens;
create policy pep_pitem_select on public.pep_prescricao_itens
  for select to authenticated
  using (true);
create policy pep_pitem_insert on public.pep_prescricao_itens
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 6) EVENTOS DA PRESCRIÇÃO — o estado sem UPDATE
--
-- Suspender um antibiótico é um ATO CLÍNICO com hora e responsável. Se
-- fosse uma coluna `status` atualizada, a informação de quando e por quem
-- se perderia — e violaria o append-only.
--
-- Mesma lógica do kardex da farmácia: o saldo não é digitado, é derivado
-- dos movimentos. Aqui o status vigente de um item é o `evento` do último
-- registro dele:
--     select distinct on (item_id) item_id, evento
--       from public.pep_prescricao_eventos
--      where item_id is not null
--      order by item_id, criado_em desc;
-- Item sem nenhum evento está vigente.
-- `item_id` nulo = evento vale para a prescrição inteira.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_prescricao_eventos (
  id bigserial primary key,
  prescricao_id bigint not null references public.pep_prescricoes(id) on delete cascade,
  item_id bigint references public.pep_prescricao_itens(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  evento text not null,                   -- suspenso | reativado | encerrado |
                                          -- cancelado | concluido | avaliado_farmacia
  motivo text,
  observacao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_pevt_item_idx on public.pep_prescricao_eventos (item_id, criado_em desc);
create index if not exists pep_pevt_presc_idx on public.pep_prescricao_eventos (prescricao_id, criado_em desc);
alter table public.pep_prescricao_eventos enable row level security;
drop policy if exists pep_pevt_select on public.pep_prescricao_eventos;
drop policy if exists pep_pevt_insert on public.pep_prescricao_eventos;
create policy pep_pevt_select on public.pep_prescricao_eventos
  for select to authenticated
  using (true);
create policy pep_pevt_insert on public.pep_prescricao_eventos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 7) APRAZAMENTO — o horário PLANEJADO de cada dose/cuidado
--
-- Aprazar é a enfermagem transformar "6/6h" em 06:00, 12:00, 18:00, 00:00.
-- Sem essa tabela não existe "dose atrasada" nem "dose não checada": só dá
-- para saber o que foi feito, nunca o que deixou de ser.
--
-- 1 item : N aprazamentos. Um item 6/6h por 3 dias gera 12 linhas.
-- Itens `se_necessario` (SOS) normalmente NÃO geram aprazamento — a
-- administração entra sem `aprazamento_id`.
--
-- Esta tabela guarda só o PLANO. O que aconteceu está em
-- `pep_administracoes` — assim o plano continua append-only e a checagem
-- não precisa de UPDATE. Dose pendente = aprazamento sem administração:
--     select a.* from public.pep_aprazamentos a
--      where not exists (select 1 from public.pep_administracoes x
--                         where x.aprazamento_id = a.id);
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_aprazamentos (
  id bigserial primary key,
  item_id bigint not null references public.pep_prescricao_itens(id) on delete cascade,
  prescricao_id bigint references public.pep_prescricoes(id) on delete cascade,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  previsto_para timestamptz not null,     -- timestamptz: o app manda o horário
                                          -- local já resolvido; nunca `date`
  sequencia int,                          -- 1..n dentro do item
  dose_prevista text,
  via text,
  observacao text,
  aprazado_por text,                      -- profissional que aprazou
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
-- Um item não pode ter dois aprazamentos no mesmo instante: a geração
-- automática rodando duas vezes duplicaria a fila de medicação da enfermagem.
create unique index if not exists pep_aprz_uq on public.pep_aprazamentos (item_id, previsto_para);
create index if not exists pep_aprz_pront_idx on public.pep_aprazamentos (prontuario, previsto_para);
create index if not exists pep_aprz_prev_idx on public.pep_aprazamentos (previsto_para);
create index if not exists pep_aprz_epis_idx on public.pep_aprazamentos (episodio_id, previsto_para);
alter table public.pep_aprazamentos enable row level security;
drop policy if exists pep_aprz_select on public.pep_aprazamentos;
drop policy if exists pep_aprz_insert on public.pep_aprazamentos;
create policy pep_aprz_select on public.pep_aprazamentos
  for select to authenticated
  using (true);
create policy pep_aprz_insert on public.pep_aprazamentos
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: o plano aprazado é registro clínico.
-- Reaprazar = inserir horário novo e registrar 'nao_administrado' + motivo
-- no horário antigo, em pep_administracoes.


-- ═══════════════════════════════════════════════════════════
-- 8) CHECAGEM / ADMINISTRAÇÃO — o que de fato foi feito
--
-- A dispensação da farmácia prova que o remédio SAIU DO ESTOQUE. Só esta
-- tabela prova que ele ENTROU NO PACIENTE — com hora, executor e, quando
-- não foi dado, o motivo. Vale também para cuidado de enfermagem
-- ("mudança de decúbito realizada às 14h") — por isso `descricao` e não
-- só medicamento.
--
-- POR QUE NÃO REUSAR `ps_administracoes`
-- Aquela tabela tem `atendimento_id bigint NOT NULL references
-- ps_atendimentos(id)`: um internado sem passagem pelo PS não cabe nela.
-- Relaxar o NOT NULL mexeria numa tabela em produção do módulo PS. As duas
-- convivem; convergir é decisão para uma fase futura (ver relatório).
-- APPEND-ONLY. Checagem errada se corrige com `corrige_id`.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_administracoes (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  -- Nulo em dose SOS/ACM (sem horário planejado) e em dose extra.
  aprazamento_id bigint references public.pep_aprazamentos(id) on delete set null,
  item_id bigint references public.pep_prescricao_itens(id) on delete set null,
  prescricao_id bigint references public.pep_prescricoes(id) on delete set null,
  medicamento_id bigint references public.farm_medicamentos(id) on delete set null,
  descricao text not null,                -- item executado, congelado no ato
  dose text,
  dose_valor numeric,
  dose_unidade text,
  via text,
  status text not null default 'administrado',
  -- administrado | nao_administrado | recusado | adiado | suspenso
  motivo text,                            -- obrigatório quando não administrado
  observacao text,
  previsto_para timestamptz,              -- cópia do aprazamento: permite
                                          -- calcular atraso sem join
  administrado_em timestamptz not null default now(),
  -- Quem executou (rastreabilidade assistencial — dado do PROFISSIONAL)
  executor_nome text,
  categoria text,                         -- enfermeiro | tecnico | medico | fisio | outro
  conselho text,
  registro_conselho text,
  corrige_id bigint references public.pep_administracoes(id) on delete set null,
  motivo_correcao text,
  usuario text,
  criado_em timestamptz not null default now(),
  -- Dose não dada sem motivo é buraco em auditoria de segurança do paciente.
  constraint pep_adm_motivo_ck check (status = 'administrado' or motivo is not null)
);
create index if not exists pep_adm_pront_idx on public.pep_administracoes (prontuario, administrado_em desc);
create index if not exists pep_adm_aprz_idx on public.pep_administracoes (aprazamento_id);
create index if not exists pep_adm_item_idx on public.pep_administracoes (item_id, administrado_em desc);
create index if not exists pep_adm_epis_idx on public.pep_administracoes (episodio_id, administrado_em desc);
alter table public.pep_administracoes enable row level security;
drop policy if exists pep_adm_select on public.pep_administracoes;
drop policy if exists pep_adm_insert on public.pep_administracoes;
create policy pep_adm_select on public.pep_administracoes
  for select to authenticated
  using (true);
create policy pep_adm_insert on public.pep_administracoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 9) ANOTAÇÕES DE ENFERMAGEM
--
-- NÃO é a mesma coisa que evolução de enfermagem. A evolução é o raciocínio
-- do turno, uma por plantão. A anotação é o fato pontual e frequente —
-- "evacuou", "aceitou 50% da dieta", "queda da própria altura às 03:20",
-- "punção de acesso em MSD". São dezenas por dia e é nelas que mora a
-- evidência de intercorrência. Misturar as duas em `pep_evolucoes` faria a
-- evolução clínica sumir no meio do ruído.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_anotacoes_enfermagem (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  turno text,                             -- manha | tarde | noite
  categoria text,
  -- eliminacoes | dieta | higiene | dor | intercorrencia | acesso_venoso |
  -- curativo | mobilizacao | dispositivo | queda | contencao | orientacao | outro
  texto text not null,
  ocorrido_em timestamptz not null default now(),  -- quando o fato aconteceu
                                                   -- (pode ser antes de anotar)
  intercorrencia boolean not null default false,   -- destaca no Paciente 360
  corrige_id bigint references public.pep_anotacoes_enfermagem(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,                          -- COREN
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_anot_pront_idx on public.pep_anotacoes_enfermagem (prontuario, ocorrido_em desc);
create index if not exists pep_anot_epis_idx on public.pep_anotacoes_enfermagem (episodio_id, ocorrido_em desc);
create index if not exists pep_anot_inter_idx on public.pep_anotacoes_enfermagem (intercorrencia, ocorrido_em desc);
alter table public.pep_anotacoes_enfermagem enable row level security;
drop policy if exists pep_anot_select on public.pep_anotacoes_enfermagem;
drop policy if exists pep_anot_insert on public.pep_anotacoes_enfermagem;
create policy pep_anot_select on public.pep_anotacoes_enfermagem
  for select to authenticated
  using (true);
create policy pep_anot_insert on public.pep_anotacoes_enfermagem
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 10) SINAIS VITAIS SERIADOS
--
-- `ps_sinais` já faz isso, mas amarrado a `ps_atendimentos` e carregando a
-- classificação de Manchester — é a aferição da TRIAGEM. O internado que
-- nunca passou pelo PS não tem onde registrar. Esta tabela é do PACIENTE:
-- serve a internação, ambulatório e observação.
--
-- Inclui balanço hídrico e escore de alerta precoce (NEWS2/MEWS), que é o
-- que transforma sinal vital em ação — sem escore, a deterioração só é
-- percebida quando alguém olha a folha.
-- APPEND-ONLY.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_sinais_vitais (
  id bigserial primary key,
  prontuario text not null,
  episodio_id bigint references public.pep_episodios(id) on delete set null,
  pa_sist int,
  pa_diast int,
  pam int,                                -- pressão arterial média
  fc int,
  fr int,
  spo2 int,
  suporte_o2 text,                        -- ar ambiente | cateter 2L | mascara | VNI | VM
  temp numeric(4,1),
  dor int,                                -- escala 0-10
  glicemia int,
  consciencia text,                       -- alerta | verbal | dor | irresponsivo (AVPU)
  glasgow int,
  peso numeric(5,1),                      -- entra aqui, não em `pacientes`:
  altura numeric(4,2),                    -- peso muda e serve para dose/dia
  diurese_ml numeric,
  balanco_hidrico_ml numeric,
  evacuacao text,
  escala_alerta text,                     -- news2 | mews | pews
  score_alerta int,
  observacao text,
  aferido_em timestamptz not null default now(),
  corrige_id bigint references public.pep_sinais_vitais(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_sv_pront_idx on public.pep_sinais_vitais (prontuario, aferido_em desc);
create index if not exists pep_sv_epis_idx on public.pep_sinais_vitais (episodio_id, aferido_em desc);
create index if not exists pep_sv_score_idx on public.pep_sinais_vitais (score_alerta);
alter table public.pep_sinais_vitais enable row level security;
drop policy if exists pep_sv_select on public.pep_sinais_vitais;
drop policy if exists pep_sv_insert on public.pep_sinais_vitais;
create policy pep_sv_select on public.pep_sinais_vitais
  for select to authenticated
  using (true);
create policy pep_sv_insert on public.pep_sinais_vitais
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 11) ALERGIAS DO PACIENTE — a correção do erro estrutural
--
-- Hoje alergia é `ps_atendimentos.alergias`, um texto livre preso ao
-- episódio do PS. Isso significa que:
--   • o mesmo paciente voltando ao PS chega SEM a alergia dele;
--   • o internado que nunca passou pelo PS não tem onde declarar alergia;
--   • o motor de alerta da farmácia clínica só enxerga alergia de quem
--     está num atendimento de PS aberto.
-- Alergia é do PACIENTE e atravessa todas as passagens dele pelo hospital.
--
-- `ps_atendimentos.alergias` NÃO é removido (migração aditiva, e o App.jsx
-- depende dele hoje). Ele passa a ser o que o paciente relatou NAQUELA
-- passagem; a lista oficial é esta.
--
-- `substancia` existe separado de `agente` porque o motor de alerta casa
-- por princípio ativo: o paciente diz "Novalgina", a prescrição diz
-- "Dipirona 500 mg". Sem o campo normalizado o alerta não dispara.
--
-- "Nega alergias" É informação clínica e precisa ser gravada — sem isso
-- não dá para distinguir "não tem alergia" de "ninguém perguntou".
-- Registrar com tipo = 'nenhuma_conhecida'.
--
-- APPEND-ONLY: refutar uma alergia (teste negativo) = novo registro com
-- `corrige_id` apontando para o anterior e `situacao` = 'refutada'.
-- Lista vigente = registros ativos que ninguém corrigiu.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_alergias (
  id bigserial primary key,
  prontuario text not null,
  agente text not null,                   -- como o paciente/prescritor chama
  substancia text,                        -- princípio ativo normalizado
  tipo text not null default 'medicamento',
  -- medicamento | alimento | material | ambiental | outro | nenhuma_conhecida
  reacao text,                            -- alergia | intolerancia | efeito_adverso
  manifestacao text,                      -- urticaria, broncoespasmo, anafilaxia...
  gravidade text,                         -- leve | moderada | grave
  criticidade text default 'alta',        -- alta | baixa — risco de vida se reexposto
  situacao text not null default 'ativa', -- ativa | refutada | resolvida | inativa
  fonte text,                             -- paciente | familiar | prontuario | teste | documento
  inicio date,
  observacao text,
  corrige_id bigint references public.pep_alergias(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_alrg_pront_idx on public.pep_alergias (prontuario, criado_em desc);
create index if not exists pep_alrg_subst_idx on public.pep_alergias (lower(substancia));
create index if not exists pep_alrg_corrige_idx on public.pep_alergias (corrige_id);
alter table public.pep_alergias enable row level security;
drop policy if exists pep_alrg_select on public.pep_alergias;
drop policy if exists pep_alrg_insert on public.pep_alergias;
create policy pep_alrg_select on public.pep_alergias
  for select to authenticated
  using (true);
create policy pep_alrg_insert on public.pep_alergias
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- 12) CONDIÇÕES PERSISTENTES — a lista de problemas
--
-- Separada de `pep_alergias` de propósito: alergia é alerta de SEGURANÇA
-- (agente, reação, criticidade, e o motor da farmácia lê); condição é
-- CONTEXTO clínico (CID, início, situação). Numa tabela só, metade das
-- colunas ficaria sempre nula e a consulta do motor de alerta pagaria
-- filtro extra.
--
-- Cobre comorbidade, diagnóstico ativo, precaução (isolamento, risco de
-- queda, restrição de decúbito), dispositivo permanente (marca-passo,
-- traqueostomia) e limitação — tudo que precisa atravessar internações.
-- APPEND-ONLY: resolver um problema = novo registro com `corrige_id` e
-- `situacao` = 'resolvida'.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.pep_condicoes (
  id bigserial primary key,
  prontuario text not null,
  descricao text not null,
  cid text,
  categoria text not null default 'comorbidade',
  -- comorbidade | diagnostico | precaucao | dispositivo | limitacao |
  -- risco | habito | historico_cirurgico
  situacao text not null default 'ativa', -- ativa | resolvida | descartada | inativa
  inicio date,
  fim date,
  gravidade text,                         -- leve | moderada | grave
  observacao text,
  corrige_id bigint references public.pep_condicoes(id) on delete set null,
  motivo_correcao text,
  profissional_nome text,
  conselho text,
  registro_conselho text,
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists pep_cond_pront_idx on public.pep_condicoes (prontuario, criado_em desc);
create index if not exists pep_cond_sit_idx on public.pep_condicoes (situacao);
create index if not exists pep_cond_corrige_idx on public.pep_condicoes (corrige_id);
alter table public.pep_condicoes enable row level security;
drop policy if exists pep_cond_select on public.pep_condicoes;
drop policy if exists pep_cond_insert on public.pep_condicoes;
create policy pep_cond_select on public.pep_condicoes
  for select to authenticated
  using (true);
create policy pep_cond_insert on public.pep_condicoes
  for insert to authenticated
  with check (public.my_role() in ('adm_master','adm_silver'));
-- sem update/delete: registro clínico imutável


-- ═══════════════════════════════════════════════════════════
-- VERIFICAÇÃO — deve listar as 11 tabelas novas com RLS ativo e
-- pelo menos 1 política cada. Qualquer linha com "❌" reprova a migração.
-- ═══════════════════════════════════════════════════════════
select
  t.table_name as tabela,
  case when c.relrowsecurity then '✅ RLS ativo' else '❌ RLS DESLIGADO' end as rls,
  case when count(p.polname) = 0 then '❌ SEM POLÍTICA'
       else '✅ ' || count(p.polname) || ' política(s)' end as politicas
from information_schema.tables t
join pg_class c on c.relname = t.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
left join pg_policy p on p.polrelid = c.oid
where t.table_schema = 'public'
  and t.table_name in (
    'pep_episodios','pep_anamneses','pep_prescricoes','pep_prescricao_itens',
    'pep_prescricao_eventos','pep_aprazamentos','pep_administracoes',
    'pep_anotacoes_enfermagem','pep_sinais_vitais','pep_alergias','pep_condicoes'
  )
group by t.table_name, c.relrowsecurity
order by t.table_name;

-- Conferência das colunas novas de pep_evolucoes (deve retornar 11):
-- select count(*) from information_schema.columns
--  where table_schema = 'public' and table_name = 'pep_evolucoes'
--    and column_name in ('episodio_id','categoria','subjetivo','objetivo',
--      'avaliacao','plano','corrige_id','motivo_correcao','profissional_nome',
--      'conselho','registro_conselho');


-- ┌────────────────────────────────────────────────────────────
-- │ 26/30 — migracao-pep-acessos.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PEP — REGISTRO DE ACESSO AO PRONTUÁRIO (quem abriu o de quem)
--
-- 1 tabela nova. Idempotente. Aditiva.
--
-- POR QUE EXISTE
-- O sistema já audita ESCRITA (`auditoria`), mas não LEITURA. Prontuário
-- é dado pessoal sensível (LGPD art. 11) e o art. 46 exige medidas de
-- proteção — na prática, saber quem consultou o quê. O Manual de
-- Certificação SBIS/CFM (NGS1) também trata trilha de acesso como
-- requisito de segurança.
--
-- Não existe artigo dizendo literalmente "logue leitura". A obrigação
-- nasce da combinação: dado sensível + dever de rastreabilidade + ônus da
-- prova. Numa suspeita de acesso indevido, quem não tem log não consegue
-- demonstrar que o acesso não ocorreu.
--
-- E ESTE É O PONTO: histórico não capturado NUNCA volta. Cada dia sem a
-- tabela é um dia que não existe se alguém questionar depois.
--
-- APPEND-ONLY, como todo registro clínico: sem UPDATE, sem DELETE. Um log
-- que pode ser alterado não serve como prova.
-- ═══════════════════════════════════════════════════════════

create table if not exists public.pep_acessos (
  id bigserial primary key,
  prontuario text not null,               -- de quem é o prontuário consultado
  origem text not null,                   -- paciente360 | ps_atendimento | leito | farmacia | scih
  contexto text,                          -- id do episódio/atendimento, quando houver
  usuario text,                           -- quem consultou (username do profissional)
  papel text,                             -- papel no momento do acesso
  criado_em timestamptz not null default now()
);

create index if not exists pep_acessos_prontuario_idx on public.pep_acessos (prontuario, criado_em desc);
create index if not exists pep_acessos_usuario_idx    on public.pep_acessos (usuario, criado_em desc);

alter table public.pep_acessos enable row level security;

-- Leitura do log restrita a quem administra: o log de acesso é, ele
-- próprio, informação sensível — mostra quais pacientes cada profissional
-- consultou. Analista e visualizador não veem.
drop policy if exists pep_acessos_select on public.pep_acessos;
create policy pep_acessos_select on public.pep_acessos
  for select to authenticated
  using (public.my_role() in ('adm_master','adm_silver'));

-- Qualquer usuário autenticado GRAVA o próprio acesso — senão o log teria
-- buraco justamente para os papéis de menor privilégio, que são os que
-- mais consultam.
drop policy if exists pep_acessos_insert on public.pep_acessos;
create policy pep_acessos_insert on public.pep_acessos
  for insert to authenticated
  with check (true);

-- Sem política de UPDATE e sem política de DELETE: com RLS ativo, o
-- PostgREST recusa as duas operações para qualquer papel, inclusive
-- adm_master. É o mesmo mecanismo que torna a evolução clínica imutável.

-- Conferência:
-- select count(*) from public.pep_acessos;


-- ┌────────────────────────────────────────────────────────────
-- │ 27/30 — migracao-pep-sinais-spo2.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PEP — saturação e suporte de O₂ nos sinais vitais
--
-- Aditiva e idempotente. Não altera nada existente.
--
-- POR QUE
-- `pep_sinais_vitais` nasceu com `escala_alerta` e `score_alerta` — ou
-- seja, com a intenção de calcular escore de deterioração clínica
-- (NEWS/MEWS). Mas faltava `spo2`, que é um dos seis parâmetros do NEWS.
--
-- Calcular NEWS sem saturação não dá um escore "quase certo": dá um
-- escore ERRADO PARA BAIXO, justamente no paciente que está dessaturando.
-- É o caso em que o alerta mais importa.
--
-- `o2_suplementar` entra junto porque o NEWS pontua o paciente em oxigênio
-- mesmo com saturação normal — respirar 95% em ar ambiente e respirar 95%
-- sob cateter são situações clínicas diferentes.
-- ═══════════════════════════════════════════════════════════

alter table public.pep_sinais_vitais
  add column if not exists spo2 int,                              -- saturação periférica (%)
  add column if not exists o2_suplementar boolean default false,  -- em O₂ suplementar?
  add column if not exists o2_dispositivo text,                   -- cateter | máscara | VNI | TOT
  add column if not exists o2_fluxo numeric;                      -- L/min ou FiO₂

-- Conferência:
-- select spo2, o2_suplementar, score_alerta from public.pep_sinais_vitais limit 5;


-- ┌────────────────────────────────────────────────────────────
-- │ 28/30 — migracao-pep-categoria-profissional.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PEP — CATEGORIA PROFISSIONAL E REGISTRO DE CONSELHO
--
-- Aditiva e idempotente.
--
-- POR QUE
-- O sistema tem um eixo só de permissão: o papel de ACESSO
-- (adm_master, adm_silver, analista, visualizador). Ele responde "quanto
-- esta pessoa pode mexer no sistema", mas não responde "o que esta pessoa
-- pode fazer clinicamente" — e as duas perguntas são diferentes.
--
-- Hoje um administrativo com perfil de edição consegue gravar "Evolução
-- médica" e assinar prescrição. A COFEN 736/2024 (arts. 6º e 7º) é
-- explícita: Diagnóstico e Prescrição de Enfermagem são PRIVATIVOS do
-- enfermeiro; técnico e auxiliar fazem Anotação de Enfermagem e checagem
-- de cuidados prescritos, sob supervisão. Não é recomendação — é norma, e
-- o software não pode permitir o contrário.
--
-- Então passam a existir DOIS eixos:
--   role      → o que pode mexer no sistema (já existia)
--   categoria → o que pode fazer clinicamente (novo)
--
-- Um adm_master administrativo continua administrando o sistema, e deixa
-- de conseguir assinar evolução médica. Um enfermeiro com perfil analista
-- registra o que é dele, mesmo sem poder mexer em configuração.
--
-- CRM/COREN entram junto porque a CFM 2.299/2021 (art. 2º) exige o
-- registro do conselho nos documentos emitidos, e a COFEN 754/2024
-- (art. 1º) exige identificação própria do profissional de enfermagem.
-- ═══════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists categoria text not null default 'administrativo',
  -- medico | enfermeiro | tecnico_enfermagem | fisioterapeuta | nutricionista
  -- | farmaceutico | assistente_social | administrativo
  add column if not exists conselho text,            -- CRM | COREN | CRF | CREFITO | CRN | CRESS
  add column if not exists registro_conselho text,   -- número da inscrição
  add column if not exists uf_conselho text;

create index if not exists profiles_categoria_idx on public.profiles (categoria);

-- Conferência — quem é quem:
-- select username, nome, role, categoria, conselho, registro_conselho
--   from public.profiles order by categoria, username;

-- Para classificar alguém (rode conforme a realidade do hospital):
-- update public.profiles
--    set categoria = 'enfermeiro', conselho = 'COREN', registro_conselho = '000000', uf_conselho = 'RS'
--  where username = 'usuario';


-- ┌────────────────────────────────────────────────────────────
-- │ 29/30 — migracao-pep-perfis-update.sql
-- └────────────────────────────────────────────────────────────
-- ═══════════════════════════════════════════════════════════
-- PERFIS — permitir que o administrador classifique a equipe
--
-- Aditiva e idempotente.
--
-- POR QUE
-- `profiles` tinha só política de SELECT. Ou seja: não existe caminho no
-- aplicativo para definir a categoria profissional de ninguém — só direto
-- no painel do Supabase. Com a categoria valendo como regra clínica
-- (COFEN 736/2024), isso deixaria a equipe inteira travada como
-- "administrativo", sem conseguir registrar nada.
--
-- O QUE ESTA POLÍTICA PERMITE — E O QUE ELA NÃO PERMITE
-- Só `adm_master` altera perfil. E há um limite importante: a política de
-- UPDATE em RLS avalia `using` (quem pode tentar) e `with check` (como o
-- resultado pode ficar). Aqui as duas exigem adm_master, então um usuário
-- comum não consegue nem tentar se promover.
--
-- O que ela NÃO impede é um adm_master rebaixar a si mesmo e ficar sem
-- administradores. Isso é decisão de negócio, não de banco — a tela avisa.
--
-- Continua sem DELETE: perfil não se apaga, se desativa. Histórico clínico
-- assinado por alguém precisa continuar apontando para um perfil existente.
-- ═══════════════════════════════════════════════════════════

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.my_role() = 'adm_master')
  with check (public.my_role() = 'adm_master');

-- Conferência:
-- select username, nome, role, categoria, conselho, registro_conselho
--   from public.profiles order by categoria, username;


-- ┌────────────────────────────────────────────────────────────
-- │ 30/30 — migracao-pep-fase3.sql
-- └────────────────────────────────────────────────────────────
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


-- ════════════════════════════════════════════════════════════
-- PARTE 4/4 — Restaurar perfis e papéis
-- ════════════════════════════════════════════════════════════
do $restaurar$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = '_backup' and table_name = 'profiles_antes'
  ) then
    execute $sql$
      insert into public.profiles (id, username, nome, role)
      select b.id, b.username, b.nome, b.role
        from _backup.profiles_antes b
        join auth.users u on u.id = b.id
      on conflict (id) do nothing
    $sql$;
    raise notice 'Perfis restaurados de _backup.profiles_antes';
  end if;
end
$restaurar$;

-- Usuário que existe no auth mas ficou sem perfil (conta criada enquanto
-- o schema estava zerado, ou banco que nunca teve profiles) entra como
-- 'visualizador' — o papel de menor privilégio. Promova manualmente quem
-- precisar, com o comando comentado no fim deste arquivo.
insert into public.profiles (id, username, nome, role)
select u.id,
       split_part(u.email, '@', 1),
       coalesce(u.raw_user_meta_data->>'nome', split_part(u.email, '@', 1)),
       coalesce(u.raw_user_meta_data->>'role', 'visualizador')
  from auth.users u
on conflict (id) do nothing;


-- ════════════════════════════════════════════════════════════
-- CONFERÊNCIA — o resultado deve bater com o banco principal
-- ════════════════════════════════════════════════════════════
select
  (select count(*) from information_schema.tables  where table_schema='public')  as tabelas,
  (select count(*) from information_schema.columns where table_schema='public')  as colunas,
  (select count(*) from public.profiles)                                          as perfis;

-- Depois rode supabase/auditoria-banco.sql para a conferência completa.
--
-- Se algum usuário precisar voltar a ser administrador:
--   update public.profiles set role = 'adm_master' where username = 'SEU_USUARIO';
--
-- Quando tudo estiver conferido, a cópia de segurança pode sair:
--   drop schema _backup cascade;
