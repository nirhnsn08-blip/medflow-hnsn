-- ============================================================
-- Valentrax — SIGTAP: valores e permanência REAIS (SIH-SUS)
--
-- ⚠️ ARQUIVO GERADO — não edite à mão.
--    Regenere com:  node supabase/importar-aih.mjs <arquivo.dbc> [--cnes N]
--
-- Preenche valor_sh, valor_sp (centavos) e media_permanencia dos
-- procedimentos que o HNSN fatura, a partir das AIHs REAIS pagas no Rio Grande do Sul (RS)
-- em junho/2026 (arquivo SIH-SUS RDRS2606.dbc).
--
-- MÉTODO: por procedimento, a MEDIANA de VAL_SH e VAL_SP (robusta aos
-- casos com UTI/complicação que inflam a média) e a MÉDIA de DIAS_PERM.
-- 215 dos 219 procedimentos tiveram AIH neste recorte;
-- os demais ficam como estão (sem valor até haver dado).
--
-- POR QUE SH+SP: na AIH, VAL_SH cobre a permanência PADRÃO do procedimento;
-- a permanência acima da média é que vira diária a maior. Então SH+SP é o
-- valor-base do ato — as diárias da conta seguem informativas, sem duplicar.
--
-- É ADITIVO E IDEMPOTENTE: só UPDATE de colunas já existentes; rodar duas
-- vezes não faz mal. NÃO cria, altera ou apaga tabela/coluna.
--
-- ⚠️ Roda no DEMO primeiro, depois no principal.
-- ============================================================

begin;

update public.sigtap_procedimentos set valor_sh = 4134, valor_sp = 1088, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0301060088';
update public.sigtap_procedimentos set valor_sh = 103796, valor_sp = 7222, media_permanencia = 10, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010037';
update public.sigtap_procedimentos set valor_sh = 30940, valor_sp = 3950, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010061';
update public.sigtap_procedimentos set valor_sh = 17510, valor_sp = 3535, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010070';
update public.sigtap_procedimentos set valor_sh = 19507, valor_sp = 3535, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010134';
update public.sigtap_procedimentos set valor_sh = 64377, valor_sp = 17848, media_permanencia = 11, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303010215';
update public.sigtap_procedimentos set valor_sh = 47366, valor_sp = 3965, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020032';
update public.sigtap_procedimentos set valor_sh = 31532, valor_sp = 3797, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020040';
update public.sigtap_procedimentos set valor_sh = 30876, valor_sp = 3294, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303020059';
update public.sigtap_procedimentos set valor_sh = 39804, valor_sp = 5001, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030038';
update public.sigtap_procedimentos set valor_sh = 17977, valor_sp = 2350, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030046';
update public.sigtap_procedimentos set valor_sh = 39239, valor_sp = 4599, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303030054';
update public.sigtap_procedimentos set valor_sh = 64904, valor_sp = 5794, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040076';
update public.sigtap_procedimentos set valor_sh = 26321, valor_sp = 7633, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040084';
update public.sigtap_procedimentos set valor_sh = 50554, valor_sp = 5794, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040092';
update public.sigtap_procedimentos set valor_sh = 67779, valor_sp = 6438, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040149';
update public.sigtap_procedimentos set valor_sh = 21832, valor_sp = 2752, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040165';
update public.sigtap_procedimentos set valor_sh = 41474, valor_sp = 5643, media_permanencia = 10, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040203';
update public.sigtap_procedimentos set valor_sh = 55513, valor_sp = 3994, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040211';
update public.sigtap_procedimentos set valor_sh = 52633, valor_sp = 5205, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040238';
update public.sigtap_procedimentos set valor_sh = 228729, valor_sp = 6438, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303040300';
update public.sigtap_procedimentos set valor_sh = 77552, valor_sp = 4605, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060018';
update public.sigtap_procedimentos set valor_sh = 29977, valor_sp = 5629, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060026';
update public.sigtap_procedimentos set valor_sh = 32927, valor_sp = 4971, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060034';
update public.sigtap_procedimentos set valor_sh = 67973, valor_sp = 28941, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060042';
update public.sigtap_procedimentos set valor_sh = 59033, valor_sp = 11037, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060050';
update public.sigtap_procedimentos set valor_sh = 65116, valor_sp = 9471, media_permanencia = 10, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060077';
update public.sigtap_procedimentos set valor_sh = 82800, valor_sp = 3650, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060131';
update public.sigtap_procedimentos set valor_sh = 64428, valor_sp = 5940, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060140';
update public.sigtap_procedimentos set valor_sh = 69417, valor_sp = 11672, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060190';
update public.sigtap_procedimentos set valor_sh = 49113, valor_sp = 5063, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060204';
update public.sigtap_procedimentos set valor_sh = 82839, valor_sp = 4017, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060212';
update public.sigtap_procedimentos set valor_sh = 45536, valor_sp = 4971, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060239';
update public.sigtap_procedimentos set valor_sh = 46557, valor_sp = 10971, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060255';
update public.sigtap_procedimentos set valor_sh = 42776, valor_sp = 5063, media_permanencia = 10, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060263';
update public.sigtap_procedimentos set valor_sh = 76233, valor_sp = 30828, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060280';
update public.sigtap_procedimentos set valor_sh = 32740, valor_sp = 5068, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303060298';
update public.sigtap_procedimentos set valor_sh = 58719, valor_sp = 5970, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070072';
update public.sigtap_procedimentos set valor_sh = 26745, valor_sp = 3705, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070099';
update public.sigtap_procedimentos set valor_sh = 43045, valor_sp = 5358, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070102';
update public.sigtap_procedimentos set valor_sh = 31081, valor_sp = 2751, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070110';
update public.sigtap_procedimentos set valor_sh = 37971, valor_sp = 4195, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303070129';
update public.sigtap_procedimentos set valor_sh = 23676, valor_sp = 3323, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303080086';
update public.sigtap_procedimentos set valor_sh = 27759, valor_sp = 3983, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303080094';
update public.sigtap_procedimentos set valor_sh = 14541, valor_sp = 2698, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303100036';
update public.sigtap_procedimentos set valor_sh = 12815, valor_sp = 2399, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303100044';
update public.sigtap_procedimentos set valor_sh = 30035, valor_sp = 5872, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303110066';
update public.sigtap_procedimentos set valor_sh = 51720, valor_sp = 2571, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140046';
update public.sigtap_procedimentos set valor_sh = 62268, valor_sp = 3133, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140054';
update public.sigtap_procedimentos set valor_sh = 23944, valor_sp = 3129, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140070';
update public.sigtap_procedimentos set valor_sh = 17697, valor_sp = 2410, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140100';
update public.sigtap_procedimentos set valor_sh = 52435, valor_sp = 6150, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140119';
update public.sigtap_procedimentos set valor_sh = 62583, valor_sp = 2940, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140135';
update public.sigtap_procedimentos set valor_sh = 22581, valor_sp = 2651, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140143';
update public.sigtap_procedimentos set valor_sh = 57408, valor_sp = 7835, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303140151';
update public.sigtap_procedimentos set valor_sh = 29257, valor_sp = 3455, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303150050';
update public.sigtap_procedimentos set valor_sh = 38939, valor_sp = 5421, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303150068';
update public.sigtap_procedimentos set valor_sh = 25575, valor_sp = 3879, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160047';
update public.sigtap_procedimentos set valor_sh = 691426, valor_sp = 163866, media_permanencia = 19, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160055';
update public.sigtap_procedimentos set valor_sh = 421801, valor_sp = 103214, media_permanencia = 14, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303160063';
update public.sigtap_procedimentos set valor_sh = 29379, valor_sp = 3610, media_permanencia = 13, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170131';
update public.sigtap_procedimentos set valor_sh = 44802, valor_sp = 5776, media_permanencia = 15, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170140';
update public.sigtap_procedimentos set valor_sh = 59736, valor_sp = 7942, media_permanencia = 18, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170166';
update public.sigtap_procedimentos set valor_sh = 19912, valor_sp = 2888, media_permanencia = 14, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170174';
update public.sigtap_procedimentos set valor_sh = 31736, valor_sp = 4332, media_permanencia = 16, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0303170182';
update public.sigtap_procedimentos set valor_sh = 32046, valor_sp = 4075, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0304100013';
update public.sigtap_procedimentos set valor_sh = 108964, valor_sp = 11907, media_permanencia = 12, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305010174';
update public.sigtap_procedimentos set valor_sh = 24114, valor_sp = 2794, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020013';
update public.sigtap_procedimentos set valor_sh = 20606, valor_sp = 2677, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020021';
update public.sigtap_procedimentos set valor_sh = 42897, valor_sp = 4535, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020048';
update public.sigtap_procedimentos set valor_sh = 65819, valor_sp = 6872, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0305020056';
update public.sigtap_procedimentos set valor_sh = 21012, valor_sp = 2921, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010019';
update public.sigtap_procedimentos set valor_sh = 44530, valor_sp = 4660, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010035';
update public.sigtap_procedimentos set valor_sh = 25830, valor_sp = 4702, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308010043';
update public.sigtap_procedimentos set valor_sh = 13433, valor_sp = 2662, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308020030';
update public.sigtap_procedimentos set valor_sh = 27607, valor_sp = 2655, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308030036';
update public.sigtap_procedimentos set valor_sh = 32397, valor_sp = 2921, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0308040015';
update public.sigtap_procedimentos set valor_sh = 31560, valor_sp = 25594, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0310010039';
update public.sigtap_procedimentos set valor_sh = 29104, valor_sp = 10655, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020053';
update public.sigtap_procedimentos set valor_sh = 12921, valor_sp = 5529, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020070';
update public.sigtap_procedimentos set valor_sh = 13806, valor_sp = 6083, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0401020100';
update public.sigtap_procedimentos set valor_sh = 20143, valor_sp = 18075, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0403020077';
update public.sigtap_procedimentos set valor_sh = 14518, valor_sp = 20244, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0403020123';
update public.sigtap_procedimentos set valor_sh = 19185, valor_sp = 13334, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404010067';
update public.sigtap_procedimentos set valor_sh = 9628, valor_sp = 14003, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404010318';
update public.sigtap_procedimentos set valor_sh = 86746, valor_sp = 13567, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0404020550';
update public.sigtap_procedimentos set valor_sh = 9608, valor_sp = 2345, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0405010079';
update public.sigtap_procedimentos set valor_sh = 132923, valor_sp = 38086, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0406010684';
update public.sigtap_procedimentos set valor_sh = 33477, valor_sp = 16103, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020039';
update public.sigtap_procedimentos set valor_sh = 32375, valor_sp = 17843, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020047';
update public.sigtap_procedimentos set valor_sh = 12957, valor_sp = 7328, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020144';
update public.sigtap_procedimentos set valor_sh = 41280, valor_sp = 16604, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020268';
update public.sigtap_procedimentos set valor_sh = 19110, valor_sp = 12484, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020284';
update public.sigtap_procedimentos set valor_sh = 66569, valor_sp = 15355, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407020365';
update public.sigtap_procedimentos set valor_sh = 68873, valor_sp = 35601, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030026';
update public.sigtap_procedimentos set valor_sh = 82641, valor_sp = 24599, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030034';
update public.sigtap_procedimentos set valor_sh = 60381, valor_sp = 22988, media_permanencia = 11, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030042';
update public.sigtap_procedimentos set valor_sh = 149431, valor_sp = 54122, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407030255';
update public.sigtap_procedimentos set valor_sh = 77997, valor_sp = 15219, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040013';
update public.sigtap_procedimentos set valor_sh = 36876, valor_sp = 11615, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040030';
update public.sigtap_procedimentos set valor_sh = 68882, valor_sp = 21491, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040064';
update public.sigtap_procedimentos set valor_sh = 51723, valor_sp = 14769, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040080';
update public.sigtap_procedimentos set valor_sh = 53357, valor_sp = 21049, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040099';
update public.sigtap_procedimentos set valor_sh = 52952, valor_sp = 21045, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040102';
update public.sigtap_procedimentos set valor_sh = 50157, valor_sp = 19676, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040110';
update public.sigtap_procedimentos set valor_sh = 31455, valor_sp = 13644, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040129';
update public.sigtap_procedimentos set valor_sh = 36189, valor_sp = 10645, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040145';
update public.sigtap_procedimentos set valor_sh = 92369, valor_sp = 13999, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040161';
update public.sigtap_procedimentos set valor_sh = 87880, valor_sp = 14522, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040188';
update public.sigtap_procedimentos set valor_sh = 34500, valor_sp = 11875, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040226';
update public.sigtap_procedimentos set valor_sh = 139059, valor_sp = 21039, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0407040250';
update public.sigtap_procedimentos set valor_sh = 26505, valor_sp = 19086, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010142';
update public.sigtap_procedimentos set valor_sh = 57542, valor_sp = 10318, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010150';
update public.sigtap_procedimentos set valor_sh = 28344, valor_sp = 10215, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010185';
update public.sigtap_procedimentos set valor_sh = 20045, valor_sp = 13335, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010193';
update public.sigtap_procedimentos set valor_sh = 36682, valor_sp = 10126, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408010223';
update public.sigtap_procedimentos set valor_sh = 11695, valor_sp = 8858, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020121';
update public.sigtap_procedimentos set valor_sh = 11695, valor_sp = 8858, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020148';
update public.sigtap_procedimentos set valor_sh = 6287, valor_sp = 6314, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020164';
update public.sigtap_procedimentos set valor_sh = 18257, valor_sp = 9523, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020229';
update public.sigtap_procedimentos set valor_sh = 15196, valor_sp = 9119, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020326';
update public.sigtap_procedimentos set valor_sh = 39271, valor_sp = 13459, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020334';
update public.sigtap_procedimentos set valor_sh = 12269, valor_sp = 8291, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020342';
update public.sigtap_procedimentos set valor_sh = 25547, valor_sp = 12117, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020369';
update public.sigtap_procedimentos set valor_sh = 15475, valor_sp = 11151, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020377';
update public.sigtap_procedimentos set valor_sh = 39906, valor_sp = 13468, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020385';
update public.sigtap_procedimentos set valor_sh = 54409, valor_sp = 12244, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020393';
update public.sigtap_procedimentos set valor_sh = 18549, valor_sp = 9431, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020407';
update public.sigtap_procedimentos set valor_sh = 24445, valor_sp = 9594, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020431';
update public.sigtap_procedimentos set valor_sh = 14967, valor_sp = 9006, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020512';
update public.sigtap_procedimentos set valor_sh = 11770, valor_sp = 8290, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020539';
update public.sigtap_procedimentos set valor_sh = 21577, valor_sp = 11015, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408020547';
update public.sigtap_procedimentos set valor_sh = 45985, valor_sp = 33339, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408030399';
update public.sigtap_procedimentos set valor_sh = 981399, valor_sp = 94522, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040050';
update public.sigtap_procedimentos set valor_sh = 7143, valor_sp = 6908, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040190';
update public.sigtap_procedimentos set valor_sh = 32074, valor_sp = 7920, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040246';
update public.sigtap_procedimentos set valor_sh = 149723, valor_sp = 29542, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408040343';
update public.sigtap_procedimentos set valor_sh = 27083, valor_sp = 11659, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050020';
update public.sigtap_procedimentos set valor_sh = 129085, valor_sp = 33203, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050136';
update public.sigtap_procedimentos set valor_sh = 723109, valor_sp = 161474, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050160';
update public.sigtap_procedimentos set valor_sh = 226394, valor_sp = 33202, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050179';
update public.sigtap_procedimentos set valor_sh = 8225, valor_sp = 10879, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050217';
update public.sigtap_procedimentos set valor_sh = 5582, valor_sp = 5643, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050225';
update public.sigtap_procedimentos set valor_sh = 8962, valor_sp = 7732, media_permanencia = 9, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050233';
update public.sigtap_procedimentos set valor_sh = 21452, valor_sp = 9136, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050322';
update public.sigtap_procedimentos set valor_sh = 22401, valor_sp = 12559, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050470';
update public.sigtap_procedimentos set valor_sh = 147271, valor_sp = 24663, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050489';
update public.sigtap_procedimentos set valor_sh = 44381, valor_sp = 16913, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050497';
update public.sigtap_procedimentos set valor_sh = 140586, valor_sp = 21511, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050500';
update public.sigtap_procedimentos set valor_sh = 180566, valor_sp = 24780, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050519';
update public.sigtap_procedimentos set valor_sh = 37341, valor_sp = 15958, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050527';
update public.sigtap_procedimentos set valor_sh = 38250, valor_sp = 11413, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050535';
update public.sigtap_procedimentos set valor_sh = 101949, valor_sp = 20295, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050543';
update public.sigtap_procedimentos set valor_sh = 55208, valor_sp = 14507, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050551';
update public.sigtap_procedimentos set valor_sh = 51386, valor_sp = 12403, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050578';
update public.sigtap_procedimentos set valor_sh = 30008, valor_sp = 14507, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050594';
update public.sigtap_procedimentos set valor_sh = 44416, valor_sp = 17474, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050608';
update public.sigtap_procedimentos set valor_sh = 178348, valor_sp = 24780, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050632';
update public.sigtap_procedimentos set valor_sh = 83636, valor_sp = 15016, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050667';
update public.sigtap_procedimentos set valor_sh = 153696, valor_sp = 58076, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050896';
update public.sigtap_procedimentos set valor_sh = 141890, valor_sp = 28343, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408050926';
update public.sigtap_procedimentos set valor_sh = 17014, valor_sp = 9179, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060018';
update public.sigtap_procedimentos set valor_sh = 28837, valor_sp = 10980, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060042';
update public.sigtap_procedimentos set valor_sh = 5240, valor_sp = 3909, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060212';
update public.sigtap_procedimentos set valor_sh = 9570, valor_sp = 5596, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060352';
update public.sigtap_procedimentos set valor_sh = 9571, valor_sp = 5596, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060360';
update public.sigtap_procedimentos set valor_sh = 17160, valor_sp = 6156, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060379';
update public.sigtap_procedimentos set valor_sh = 12425, valor_sp = 8166, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060450';
update public.sigtap_procedimentos set valor_sh = 50640, valor_sp = 17380, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060476';
update public.sigtap_procedimentos set valor_sh = 39559, valor_sp = 15413, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060557';
update public.sigtap_procedimentos set valor_sh = 16726, valor_sp = 11415, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060573';
update public.sigtap_procedimentos set valor_sh = 70095, valor_sp = 16442, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0408060590';
update public.sigtap_procedimentos set valor_sh = 39766, valor_sp = 16006, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010065';
update public.sigtap_procedimentos set valor_sh = 51976, valor_sp = 13960, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010090';
update public.sigtap_procedimentos set valor_sh = 33793, valor_sp = 7980, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010170';
update public.sigtap_procedimentos set valor_sh = 22590, valor_sp = 14664, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409010430';
update public.sigtap_procedimentos set valor_sh = 25786, valor_sp = 14861, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409020150';
update public.sigtap_procedimentos set valor_sh = 24439, valor_sp = 8353, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409020176';
update public.sigtap_procedimentos set valor_sh = 65604, valor_sp = 42647, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409030023';
update public.sigtap_procedimentos set valor_sh = 47382, valor_sp = 47047, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409030040';
update public.sigtap_procedimentos set valor_sh = 32605, valor_sp = 10199, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040010';
update public.sigtap_procedimentos set valor_sh = 12388, valor_sp = 10998, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040096';
update public.sigtap_procedimentos set valor_sh = 48081, valor_sp = 14667, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040185';
update public.sigtap_procedimentos set valor_sh = 18785, valor_sp = 7512, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040215';
update public.sigtap_procedimentos set valor_sh = 13348, valor_sp = 14665, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040223';
update public.sigtap_procedimentos set valor_sh = 17324, valor_sp = 8432, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040231';
update public.sigtap_procedimentos set valor_sh = 19092, valor_sp = 24795, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409040240';
update public.sigtap_procedimentos set valor_sh = 34188, valor_sp = 18334, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050075';
update public.sigtap_procedimentos set valor_sh = 9772, valor_sp = 12140, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050083';
update public.sigtap_procedimentos set valor_sh = 32167, valor_sp = 25674, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409050113';
update public.sigtap_procedimentos set valor_sh = 34598, valor_sp = 13846, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060038';
update public.sigtap_procedimentos set valor_sh = 10710, valor_sp = 7652, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060070';
update public.sigtap_procedimentos set valor_sh = 55728, valor_sp = 27343, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060127';
update public.sigtap_procedimentos set valor_sh = 70364, valor_sp = 31749, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060135';
update public.sigtap_procedimentos set valor_sh = 31876, valor_sp = 19901, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060186';
update public.sigtap_procedimentos set valor_sh = 36150, valor_sp = 15287, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060232';
update public.sigtap_procedimentos set valor_sh = 27506, valor_sp = 18334, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409060240';
update public.sigtap_procedimentos set valor_sh = 25113, valor_sp = 14665, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070092';
update public.sigtap_procedimentos set valor_sh = 9414, valor_sp = 4582, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070190';
update public.sigtap_procedimentos set valor_sh = 4873, valor_sp = 7062, media_permanencia = 0, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0409070262';
update public.sigtap_procedimentos set valor_sh = 14268, valor_sp = 4893, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0410010014';
update public.sigtap_procedimentos set valor_sh = 43588, valor_sp = 27643, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010034';
update public.sigtap_procedimentos set valor_sh = 49145, valor_sp = 27643, media_permanencia = 3, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010042';
update public.sigtap_procedimentos set valor_sh = 8876, valor_sp = 5682, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411010077';
update public.sigtap_procedimentos set valor_sh = 14999, valor_sp = 7041, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411020013';
update public.sigtap_procedimentos set valor_sh = 39946, valor_sp = 12870, media_permanencia = 2, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0411020048';
update public.sigtap_procedimentos set valor_sh = 274953, valor_sp = 76816, media_permanencia = 6, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0412020033';
update public.sigtap_procedimentos set valor_sh = 109932, valor_sp = 44043, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0412040166';
update public.sigtap_procedimentos set valor_sh = 39180, valor_sp = 9816, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413010015';
update public.sigtap_procedimentos set valor_sh = 87184, valor_sp = 35727, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413010082';
update public.sigtap_procedimentos set valor_sh = 61303, valor_sp = 20182, media_permanencia = 4, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413040178';
update public.sigtap_procedimentos set valor_sh = 23187, valor_sp = 10033, media_permanencia = 1, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0413040240';
update public.sigtap_procedimentos set valor_sh = 128770, valor_sp = 54604, media_permanencia = 5, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415010012';
update public.sigtap_procedimentos set valor_sh = 43983, valor_sp = 17011, media_permanencia = 8, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415040027';
update public.sigtap_procedimentos set valor_sh = 44584, valor_sp = 21591, media_permanencia = 7, origem = 'datasus-sih-rs-2606', updated_at = now() where competencia = '2026-08' and codigo = '0415040035';

commit;

-- conferência (esperado: 215 com valor)
select
  count(*) filter (where valor_sh is not null) as com_valor,
  count(*) as total
from public.sigtap_procedimentos where competencia = '2026-08';
