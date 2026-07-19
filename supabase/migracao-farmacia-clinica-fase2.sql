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
