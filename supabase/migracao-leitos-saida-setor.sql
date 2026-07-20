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
