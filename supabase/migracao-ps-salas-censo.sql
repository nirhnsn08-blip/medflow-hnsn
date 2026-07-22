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
