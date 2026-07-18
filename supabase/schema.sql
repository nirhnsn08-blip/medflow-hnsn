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
