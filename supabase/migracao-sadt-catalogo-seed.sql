-- ═══════════════════════════════════════════════════════════
-- CATÁLOGO DE EXAMES E ANALITOS — A CARGA INICIAL
--
-- `migracao-sadt-exames.sql` criou a estrutura. Este arquivo põe conteúdo
-- nela: sem catálogo e sem analito, TODO exame cai no laudo em texto, e a
-- faixa de referência, o valor crítico e a curva não aparecem — ou seja, o
-- módulo fica estruturalmente novo e funcionalmente igual ao antigo.
--
-- ⚠️⚠️⚠️ LEIA ISTO ANTES DE RODAR — É A PARTE QUE IMPORTA
--
-- 🔴 AS FAIXAS DE REFERÊNCIA E OS VALORES CRÍTICOS ABAIXO SÃO UM PONTO DE
-- PARTIDA, NÃO UMA PRESCRIÇÃO. São os valores de adulto de uso corrente na
-- prática laboratorial brasileira. Eles PRECISAM ser revistos e assinados
-- pelo laboratório de análises clínicas do hospital antes de valerem, por
-- três motivos concretos:
--
--   1. FAIXA DE REFERÊNCIA DEPENDE DO MÉTODO E DO EQUIPAMENTO. Dois
--      analisadores dão faixas diferentes para o mesmo analito. A faixa que
--      vale é a do equipamento que está na bancada — e o laudo impresso cita
--      a faixa, então uma faixa errada aqui é um laudo errado.
--
--   2. A LISTA DE VALORES CRÍTICOS É O QUE FAZ ALGUÉM SER CHAMADO. É ela que
--      a acreditação cobra e que o laboratório é obrigado a comunicar. Um
--      limite frouxo deixa de acender; um limite apertado acende tanto que
--      se aprende a descontar — e aí o que importa some junto. Essa escolha
--      é do laboratório, não deste arquivo.
--
--   3. 🔴 ESTA TABELA NÃO SEPARA SEXO NEM IDADE, e isso é uma limitação
--      REAL da estrutura, não um descuido deste seed. Hemoglobina, hematócrito,
--      creatinina e ferritina têm faixas diferentes para homem e mulher;
--      criança tem faixa própria em quase tudo. As faixas abaixo foram
--      ALARGADAS para cobrir os dois sexos adultos — e alargar tem custo:
--      uma hemoglobina 12,5 numa mulher é normal e num homem é anemia, e
--      com faixa única ela sai "normal" para os dois. O conserto é uma
--      migração futura com `sexo`, `idade_min` e `idade_max` no analito.
--      Até lá, NÃO use este módulo como se ele soubesse disso.
--      ⚠️ PEDIATRIA: as faixas abaixo são de ADULTO. Para um hospital com
--      pediatria, elas acendem e deixam de acender nos lugares errados.
--
-- 💡 O QUE É SEGURO AQUI: o CÓDIGO não é inventado. Ele é BUSCADO em
-- `sigtap_procedimentos` pelo nome, e fica NULO quando não é encontrado.
-- Código ausente se resolve depois; código errado vira conta glosada. A
-- conferência no fim diz quantos acharam código e quantos não.
--
-- ⚠️ SE O SIGTAP AINDA NÃO FOI IMPORTADO (o arquivo do DATASUS), todos os
-- códigos ficam nulos e isso está CERTO. O exame funciona clinicamente sem
-- código; só não fatura. Rodar a importação do SIGTAP depois e repetir este
-- arquivo preenche os códigos sem duplicar nada.
--
-- IDEMPOTENTE: roda quantas vezes quiser. Exame já cadastrado tem o código
-- atualizado e o resto preservado; analito já cadastrado NÃO é sobrescrito
-- — se o laboratório já ajustou uma faixa, este arquivo não desfaz.
--
-- ADITIVA: não apaga nem altera nada que já exista.
-- ═══════════════════════════════════════════════════════════

set valentrax.quem = 'adauam';


-- ───────────────────────────────────────────────────────────
-- 1. OS EXAMES
--
-- `prazo_rotina_min` e `prazo_urgente_min` são o prazo PACTUADO: é contra
-- eles que o sistema diz "atrasado". Sem prazo, o exame aparece como
-- "prazo não cadastrado" — que é honesto e diferente de "no prazo".
-- ───────────────────────────────────────────────────────────
-- 🔴 SEM `on commit drop`, E ISSO NÃO É DETALHE.
--
-- Com `on commit drop`, a tabela é apagada quando o `create` COMITA — e
-- tanto `reconstruir-banco.sql` quanto o SQL Editor executam declaração por
-- declaração, cada uma na sua transação. O `insert` seguinte então morria
-- com `relation "_exames" does not exist`, a 99% do script de reconstrução.
--
-- Quem pegou foi `banco-novo-nasce.test.js`, que EXECUTA o script num
-- Postgres de verdade em vez de conferir presença de arquivo — a catraca do
-- PR #279, nascida de um defeito parecido e pela mesma razão.
--
-- Sem a cláusula, a tabela vive até o fim da SESSÃO, que é o que se quer.
-- O `drop if exists` antes torna o arquivo repetível na mesma conexão.
drop table if exists _exames;
create temporary table _exames (
  nome text, categoria text, material text, preparo text,
  rotina int, urgente int, sigtap_como text
);

insert into _exames (nome, categoria, material, preparo, rotina, urgente, sigtap_como) values
  -- ── Hematologia ──
  ('Hemograma completo',        'laboratorial', 'sangue (EDTA)',   null, 240, 60, 'hemograma completo'),
  ('Coagulograma',              'laboratorial', 'sangue (citrato)',null, 240, 60, 'coagulograma'),
  ('Tipagem sanguínea ABO/Rh',  'laboratorial', 'sangue (EDTA)',   null, 240, 60, 'determinacao de grupo sanguineo'),

  -- ── Bioquímica ──
  ('Glicemia',                  'laboratorial', 'sangue (fluoreto)', 'jejum de 8h para rotina; urgência sem jejum', 180, 30, 'glicose'),
  ('Ureia',                     'laboratorial', 'soro', null, 240, 60, 'ureia'),
  ('Creatinina',                'laboratorial', 'soro', null, 240, 60, 'creatinina'),
  ('Eletrólitos (Na, K, Cl)',   'laboratorial', 'soro', null, 240, 45, 'sodio'),
  ('Cálcio e magnésio',         'laboratorial', 'soro', null, 240, 60, 'calcio'),
  ('Transaminases (TGO/TGP)',   'laboratorial', 'soro', null, 240, 90, 'transaminase'),
  ('Bilirrubinas',              'laboratorial', 'soro', null, 240, 90, 'bilirrubina'),
  ('Proteína C reativa (PCR)',  'laboratorial', 'soro', null, 240, 90, 'proteina c reativa'),
  ('Lactato',                   'laboratorial', 'sangue (fluoreto)', null, 120, 30, 'acido latico'),
  ('Troponina',                 'laboratorial', 'soro', null, 120, 30, 'troponina'),
  ('TSH e T4 livre',            'laboratorial', 'soro', null, 1440, null, 'hormonio tireoestimulante'),

  -- ── Gasometria ──
  ('Gasometria arterial',       'laboratorial', 'sangue arterial (heparinizado)', 'processar em até 15 minutos', 60, 20, 'gasometria'),

  -- ── Urina e microbiologia ──
  ('Urina tipo I (EAS)',        'laboratorial', 'urina (jato médio)', 'higiene prévia; primeira urina da manhã para rotina', 240, 90, 'analise de caracteres fisicos'),
  ('Urocultura',                'laboratorial', 'urina (jato médio)', 'colher antes do antibiótico', 4320, 4320, 'urocultura'),
  ('Hemocultura',               'laboratorial', 'sangue (dois frascos)', 'colher ANTES do antibiótico, dois sítios diferentes', 7200, 7200, 'hemocultura'),

  -- ── Gestação ──
  ('Beta-hCG',                  'laboratorial', 'soro', null, 240, 60, 'gonadotrofina corionica'),

  -- ── Imagem: laudo, sem analito ──
  ('Eletrocardiograma (ECG)',   'outro',  null, null, 60, 10, 'eletrocardiograma'),
  ('Radiografia de tórax',      'imagem', null, null, 120, 30, 'radiografia de torax'),
  ('Radiografia de abdome',     'imagem', null, null, 120, 30, 'radiografia de abdomen'),
  ('Tomografia de crânio',      'imagem', null, 'retirar objetos metálicos', 240, 60, 'tomografia computadorizada do cranio'),
  ('Tomografia de abdome',      'imagem', null, 'jejum de 4h quando com contraste', 360, 90, 'tomografia computadorizada de abdomen'),
  ('Ultrassonografia de abdome','imagem', null, 'jejum de 6h', 360, 90, 'ultrassonografia de abdomen'),
  ('Ultrassonografia obstétrica','imagem', null, null, 360, 120, 'ultrassonografia obstetrica');

-- O código vem do SIGTAP, por NOME, sem acento e sem caixa. Nulo quando
-- não encontrado — e nulo é honesto.
--
-- 🔴 `public.f_unaccent`, E NÃO `public.unaccent` (14/10/2026).
--
-- No Supabase a extensão `unaccent` é instalada no schema `extensions`, não
-- em `public` — `migracao-pacientes-busca.sql` faz isso e cria o envelope
-- `public.f_unaccent`, que fixa o dicionário e é IMUTÁVEL. Chamar
-- `public.unaccent` direto morre com "function public.unaccent(text) does
-- not exist", e foi o que aconteceu ao rodar este arquivo no demo.
--
-- ⚠️ `banco-novo-nasce.test.js` NÃO pegou, e a razão importa: o PRELÚDIO
-- dele criava um `public.unaccent` de mentira para substituir a extensão
-- que o PGlite não tem. O substituto tornava verdadeira uma chamada que o
-- banco real recusa. Substituto de ambiente que não imita o ambiente vira
-- teste que aprova o que não funciona — o stub foi corrigido junto.
--
-- ⚠️ `limit 1` com ordem por tamanho do nome: "hemograma completo" casa com
-- um procedimento só, mas "ureia" casa com vários (dosagem de ureia,
-- ureia em líquidos). O mais CURTO é o mais genérico, que é o que se quer
-- para um exame de rotina. É um palpite, e é por isso que a conferência no
-- fim MOSTRA o que foi casado para alguém olhar.
insert into public.sadt_catalogo
  (codigo, nome, categoria, material, preparo, prazo_rotina_min, prazo_urgente_min, usuario)
select (select s.codigo
          from public.sigtap_procedimentos s
         where public.f_unaccent(lower(s.nome)) like '%' || public.f_unaccent(lower(e.sigtap_como)) || '%'
         order by length(s.nome), s.codigo
         limit 1),
       e.nome, e.categoria, e.material, e.preparo, e.rotina, e.urgente, 'adauam'
  from _exames e
 where not exists (select 1 from public.sadt_catalogo c where lower(c.nome) = lower(e.nome));

-- Quem já estava cadastrado SEM código ganha o código, se o SIGTAP tiver
-- sido importado depois. O resto da linha fica como está — o laboratório
-- pode ter ajustado prazo ou preparo, e isto não desfaz.
update public.sadt_catalogo c
   set codigo = (select s.codigo
                   from public.sigtap_procedimentos s
                  where public.f_unaccent(lower(s.nome)) like '%' || public.f_unaccent(lower(e.sigtap_como)) || '%'
                  order by length(s.nome), s.codigo
                  limit 1),
       updated_at = now()
  from _exames e
 where lower(c.nome) = lower(e.nome)
   and c.codigo is null;


-- ───────────────────────────────────────────────────────────
-- 2. OS ANALITOS
--
-- 🔴 É AQUI QUE O EXAME DEIXA DE SER TEXTO. "Hemograma" não tem valor de
-- referência; hemoglobina tem.
--
-- `critico_min`/`critico_max` NULOS significam "este analito não tem valor
-- crítico definido" — e nulo NÃO inventa pânico: o gatilho não acende
-- `critico` para ele. Deixar nulo é a resposta certa para analito que não
-- tem faixa de pânico reconhecida (VCM, RDW, eosinófilos).
--
-- `ref_texto` é para o que não é faixa numérica: "negativo", "ausente",
-- "flora normal". Forçar tudo em número faria a cultura de urina não caber
-- — e aí ela voltaria para o texto livre de onde o módulo saiu.
-- ───────────────────────────────────────────────────────────
-- Sem `on commit drop`, pela mesma razão anotada em `_exames`.
drop table if exists _analitos;
create temporary table _analitos (
  exame text, nome text, unidade text, ordem int,
  ref_min numeric, ref_max numeric, ref_texto text,
  critico_min numeric, critico_max numeric
);

insert into _analitos (exame, nome, unidade, ordem, ref_min, ref_max, ref_texto, critico_min, critico_max) values
  -- ── HEMOGRAMA ─────────────────────────────────────────────
  -- ⚠️ Hemoglobina e hematócrito ALARGADOS para cobrir os dois sexos: a
  -- tabela não separa sexo (ver o cabeçalho). O custo é real e está dito lá.
  ('Hemograma completo', 'Hemoglobina',    'g/dL',   1, 12.0, 17.5, null,  7.0, 20.0),
  ('Hemograma completo', 'Hematócrito',    '%',      2, 36,   52,   null,  21,  60),
  ('Hemograma completo', 'Hemácias',       'milhões/mm³', 3, 4.0, 6.1, null, null, null),
  ('Hemograma completo', 'VCM',            'fL',     4, 80,   100,  null, null, null),
  ('Hemograma completo', 'HCM',            'pg',     5, 27,   32,   null, null, null),
  ('Hemograma completo', 'RDW',            '%',      6, 11.5, 14.5, null, null, null),
  ('Hemograma completo', 'Leucócitos',     '/mm³',   7, 4000, 11000, null, 1000, 50000),
  -- 🔴 Neutropenia: ≤500 é neutropenia grave, e neutropenia febril é
  -- emergência infecciosa. É um dos críticos que mais muda conduta.
  ('Hemograma completo', 'Neutrófilos',    '/mm³',   8, 1800, 7700, null,  500, null),
  ('Hemograma completo', 'Bastonetes',     '%',      9, 0,    5,    null, null, null),
  ('Hemograma completo', 'Linfócitos',     '/mm³',  10, 1000, 4800, null, null, null),
  ('Hemograma completo', 'Monócitos',      '/mm³',  11, 100,  800,  null, null, null),
  ('Hemograma completo', 'Eosinófilos',    '/mm³',  12, 0,    500,  null, null, null),
  ('Hemograma completo', 'Basófilos',      '/mm³',  13, 0,    200,  null, null, null),
  ('Hemograma completo', 'Plaquetas',      '/mm³',  14, 150000, 450000, null, 20000, 1000000),

  -- ── COAGULOGRAMA ──────────────────────────────────────────
  ('Coagulograma', 'TAP (tempo de protrombina)', 'segundos', 1, 10, 14, null, null, null),
  ('Coagulograma', 'INR',                        null,       2, 0.9, 1.2, null, null, 5.0),
  ('Coagulograma', 'TTPA',                       'segundos', 3, 25, 35, null, null, null),
  ('Coagulograma', 'TTPA (relação)',             null,       4, 0.8, 1.2, null, null, null),
  ('Coagulograma', 'Fibrinogênio',               'mg/dL',    5, 200, 400, null, 100, null),

  -- ── TIPAGEM ───────────────────────────────────────────────
  -- Texto, não número: grupo sanguíneo não tem faixa.
  ('Tipagem sanguínea ABO/Rh', 'Grupo ABO',  null, 1, null, null, 'A, B, AB ou O',       null, null),
  ('Tipagem sanguínea ABO/Rh', 'Fator Rh',   null, 2, null, null, 'positivo ou negativo', null, null),

  -- ── BIOQUÍMICA ────────────────────────────────────────────
  ('Glicemia', 'Glicose', 'mg/dL', 1, 70, 99, null, 45, 500),
  ('Ureia',    'Ureia',   'mg/dL', 1, 15, 45, null, null, 200),
  -- ⚠️ Creatinina também difere por sexo e por massa muscular. Alargada.
  ('Creatinina', 'Creatinina', 'mg/dL', 1, 0.6, 1.3, null, null, 7.0),

  -- 🔴 ELETRÓLITOS: potássio é o crítico clássico — 7,2 é arritmia, e a
  -- diferença entre 5,5 e 6,5 é a diferença entre ajustar a dieta e ir
  -- para a sala de emergência.
  ('Eletrólitos (Na, K, Cl)', 'Sódio',   'mEq/L', 1, 135, 145, null, 120, 160),
  ('Eletrólitos (Na, K, Cl)', 'Potássio','mEq/L', 2, 3.5, 5.1, null, 2.5, 6.5),
  ('Eletrólitos (Na, K, Cl)', 'Cloro',   'mEq/L', 3, 98,  107, null, null, null),

  ('Cálcio e magnésio', 'Cálcio total',  'mg/dL', 1, 8.5, 10.5, null, 6.0, 13.0),
  ('Cálcio e magnésio', 'Cálcio iônico', 'mg/dL', 2, 4.5, 5.3,  null, 3.0, 6.5),
  ('Cálcio e magnésio', 'Magnésio',      'mg/dL', 3, 1.6, 2.6,  null, 1.0, 4.7),

  ('Transaminases (TGO/TGP)', 'TGO (AST)', 'U/L', 1, 10, 40, null, null, null),
  ('Transaminases (TGO/TGP)', 'TGP (ALT)', 'U/L', 2, 7,  56, null, null, null),

  ('Bilirrubinas', 'Bilirrubina total',    'mg/dL', 1, 0.3, 1.2, null, null, null),
  ('Bilirrubinas', 'Bilirrubina direta',   'mg/dL', 2, 0.0, 0.3, null, null, null),
  ('Bilirrubinas', 'Bilirrubina indireta', 'mg/dL', 3, 0.1, 0.9, null, null, null),

  ('Proteína C reativa (PCR)', 'PCR', 'mg/L', 1, null, 5.0, null, null, null),

  -- 🔴 LACTATO ≥ 4: é critério de choque séptico, e o gatilho do protocolo
  -- de sepse que este sistema já tem. É um crítico que já conversa com
  -- outro módulo.
  ('Lactato', 'Lactato', 'mmol/L', 1, 0.5, 2.2, null, null, 4.0),

  -- ⚠️ TROPONINA NÃO LEVA FAIXA NUMÉRICA, e é de propósito: o valor de
  -- corte depende do método (troponina I × T, ultrassensível ou não) e
  -- muda com o fabricante do kit. Inventar um número aqui faria o sistema
  -- acender ou deixar de acender infarto. O laboratório preenche com o
  -- corte DO equipamento dele.
  ('Troponina', 'Troponina', null, 1, null, null, 'conforme o método do laboratório — preencher', null, null),

  ('TSH e T4 livre', 'TSH',      'µUI/mL', 1, 0.4, 4.0, null, null, null),
  ('TSH e T4 livre', 'T4 livre', 'ng/dL',  2, 0.8, 1.8, null, null, null),

  -- ── GASOMETRIA ARTERIAL ───────────────────────────────────
  ('Gasometria arterial', 'pH',           null,     1, 7.35, 7.45, null, 7.20, 7.60),
  ('Gasometria arterial', 'pCO₂',         'mmHg',   2, 35,   45,   null, 20,   70),
  ('Gasometria arterial', 'pO₂',          'mmHg',   3, 80,   100,  null, 40,   null),
  ('Gasometria arterial', 'HCO₃⁻',        'mEq/L',  4, 22,   26,   null, 10,   40),
  ('Gasometria arterial', 'Excesso de base', 'mEq/L', 5, -3,  3,   null, -10,  null),
  ('Gasometria arterial', 'Saturação O₂', '%',      6, 95,   100,  null, 80,   null),

  -- ── URINA TIPO I ──────────────────────────────────────────
  -- Quase tudo texto: é o exame que ensina por que `ref_texto` existe.
  ('Urina tipo I (EAS)', 'Densidade',   null, 1, 1.005, 1.030, null, null, null),
  ('Urina tipo I (EAS)', 'pH',          null, 2, 5.0,   7.0,   null, null, null),
  ('Urina tipo I (EAS)', 'Proteínas',   null, 3, null, null, 'ausente',  null, null),
  ('Urina tipo I (EAS)', 'Glicose',     null, 4, null, null, 'ausente',  null, null),
  ('Urina tipo I (EAS)', 'Corpos cetônicos', null, 5, null, null, 'ausente', null, null),
  ('Urina tipo I (EAS)', 'Hemoglobina', null, 6, null, null, 'ausente',  null, null),
  ('Urina tipo I (EAS)', 'Nitrito',     null, 7, null, null, 'negativo', null, null),
  ('Urina tipo I (EAS)', 'Leucócitos',  '/campo', 8, 0, 5, null, null, null),
  ('Urina tipo I (EAS)', 'Hemácias',    '/campo', 9, 0, 3, null, null, null),
  ('Urina tipo I (EAS)', 'Cilindros',   null, 10, null, null, 'ausentes', null, null),
  ('Urina tipo I (EAS)', 'Flora bacteriana', null, 11, null, null, 'ausente ou escassa', null, null),

  -- ── CULTURAS ──────────────────────────────────────────────
  -- ⚠️ Cultura POSITIVA não é "valor crítico" no sentido numérico: ela é
  -- texto. Quem precisa ser avisado de uma hemocultura positiva é o
  -- plantão e o SCIH, e isso é a PR da comunicação de crítico — não um
  -- número nesta tabela.
  ('Urocultura',  'Resultado da cultura', null, 1, null, null, 'negativo', null, null),
  ('Urocultura',  'Contagem de colônias', 'UFC/mL', 2, null, null, '< 10.000', null, null),
  ('Urocultura',  'Antibiograma',         null, 3, null, null, 'quando houver crescimento', null, null),
  ('Hemocultura', 'Resultado da cultura', null, 1, null, null, 'negativo', null, null),
  ('Hemocultura', 'Antibiograma',         null, 2, null, null, 'quando houver crescimento', null, null),

  -- ── GESTAÇÃO ──────────────────────────────────────────────
  ('Beta-hCG', 'Beta-hCG', 'mUI/mL', 1, null, 5.0, null, null, null);

insert into public.sadt_analitos
  (catalogo_id, nome, unidade, ordem, ref_min, ref_max, ref_texto, critico_min, critico_max, usuario)
select c.id, a.nome, a.unidade, a.ordem, a.ref_min, a.ref_max, a.ref_texto,
       a.critico_min, a.critico_max, 'adauam'
  from _analitos a
  join public.sadt_catalogo c on lower(c.nome) = lower(a.exame)
 -- ⚠️ NÃO SOBRESCREVE: se o laboratório já ajustou uma faixa, este arquivo
 -- não desfaz o ajuste. Rodar de novo só acrescenta o que falta.
 where not exists (select 1 from public.sadt_analitos x
                    where x.catalogo_id = c.id and lower(x.nome) = lower(a.nome));


insert into public.migracoes_aplicadas (arquivo)
values ('migracao-sadt-catalogo-seed.sql') on conflict do nothing;

reset valentrax.quem;

notify pgrst, 'reload schema';


-- ───────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ───────────────────────────────────────────────────────────
select item, case when ok then '✅' else '❌' end as situacao, detalhe from (
  -- ⚠️ 26 e 63 são o que ESTE arquivo cadastra, contados — não arredondados.
  -- Quem acrescentar um exame aqui tem de mexer nestes números, e isso é de
  -- propósito: um `>= 1` passaria verde com metade da carga faltando, e
  -- metade de um catálogo de exames é pior que nenhum, porque parece pronto.
  select 'exames no catálogo' as item, count(*) >= 26 as ok, count(*)::text as detalhe
    from public.sadt_catalogo
  union all
  select 'analitos cadastrados', count(*) >= 63, count(*)::text
    from public.sadt_analitos
  union all
  -- 🔴 A faixa invertida é recusada pelo check — se esta linha falhar, a
  -- migração não está aplicada.
  select 'nenhuma faixa de referência invertida',
         not exists (select 1 from public.sadt_analitos
                      where ref_min is not null and ref_max is not null and ref_min > ref_max),
         'conferido'
  union all
  select 'nenhuma faixa crítica invertida',
         not exists (select 1 from public.sadt_analitos
                      where critico_min is not null and critico_max is not null and critico_min > critico_max),
         'conferido'
  union all
  -- ⚠️ O crítico TEM de ficar FORA da referência; se ficasse dentro, todo
  -- valor normal sairia crítico. É a conferência que pega erro de digitação
  -- nas faixas acima.
  select '🔴 todo limite crítico fica FORA da faixa de referência',
         not exists (select 1 from public.sadt_analitos
                      where (critico_min is not null and ref_min is not null and critico_min > ref_min)
                         or (critico_max is not null and ref_max is not null and critico_max < ref_max)),
         'conferido'
  union all
  select 'todo analito pertence a um exame que existe',
         not exists (select 1 from public.sadt_analitos a
                      where not exists (select 1 from public.sadt_catalogo c where c.id = a.catalogo_id)),
         'conferido'
  union all
  select 'a carga está anotada no registro',
         exists (select 1 from public.migracoes_aplicadas where arquivo = 'migracao-sadt-catalogo-seed.sql'),
         'conferido'
) x;

-- 🔴 OS CÓDIGOS SIGTAP: o que foi casado, para alguém OLHAR.
--
-- ⚠️ Se `com_codigo` for 0, o SIGTAP não foi importado — e isso está certo:
-- o exame funciona clinicamente sem código, só não fatura. Rodar a
-- importação do DATASUS e repetir este arquivo preenche sem duplicar.
select count(*) filter (where codigo is not null) as com_codigo,
       count(*) filter (where codigo is null)     as sem_codigo,
       count(*)                                    as total
  from public.sadt_catalogo;

-- Os nomes casados, um por um. Confira os que parecerem estranhos: o
-- casamento é por semelhança de nome, e nome parecido não é o mesmo
-- procedimento.
select c.nome as exame_no_valentrax, c.codigo, s.nome as nome_no_sigtap
  from public.sadt_catalogo c
  left join public.sigtap_procedimentos s on s.codigo = c.codigo
 order by (c.codigo is null), c.categoria, c.nome;

-- 🔴 OS VALORES CRÍTICOS CADASTRADOS — a lista que o laboratório tem de
-- assinar. É ela que faz alguém ser chamado.
select c.nome as exame, a.nome as analito, a.unidade,
       coalesce(a.ref_texto, concat_ws(' a ', a.ref_min, a.ref_max)) as referencia,
       a.critico_min, a.critico_max
  from public.sadt_analitos a
  join public.sadt_catalogo c on c.id = a.catalogo_id
 where a.critico_min is not null or a.critico_max is not null
 order by c.nome, a.ordem;
