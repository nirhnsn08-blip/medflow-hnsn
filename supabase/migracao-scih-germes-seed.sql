-- ═══════════════════════════════════════════════════════════
-- SCIH — base de germes inicial
--
-- 🔴 POR QUE ISTO EXISTE
-- `scih_germes` nasceu vazia, e é ela que faz o cadastro de caso do SCIH
-- SUGERIR o isolamento e MARCAR multirresistente. Com a tabela vazia, a
-- tela abre, o campo do germe aceita qualquer coisa e nenhuma sugestão
-- aparece — o enfermeiro digita "Klebsiella" e o sistema não diz nada
-- sobre precaução de contato. O checklist de implantação da Visão Geral
-- lista isso como um dos cadastros que destravam módulos.
--
-- ⚠️ POR QUE SÓ ESTE, E NÃO SALAS E FORNECEDORES
-- Os outros dois cadastros que faltam são do HOSPITAL: as salas do bloco
-- e os fornecedores com quem ele compra. Ninguém de fora sabe quais são, e
-- inventá-los encheria a tela de dado falso com aparência de cadastro.
-- Esses dois têm que ser cadastrados pela equipe, pelas telas
-- (Bloco Cirúrgico → Salas · Estoque & Compras → Fornecedores).
--
-- Germe é diferente: é REFERÊNCIA CLÍNICA, a mesma em qualquer hospital.
--
-- ⚠️ E É REFERÊNCIA, NÃO VERDADE FINAL.
-- A própria tela avisa: "sempre validar com a CCIH e o antibiograma do
-- paciente". Esta lista é ponto de partida editável — a CCIH ajusta o
-- embasamento, acrescenta o que circula na casa e corrige o que mudar de
-- recomendação. Por isso o insert NÃO sobrescreve o que já existe: se a
-- CCIH já editou um germe, rodar de novo não desfaz o trabalho dela.
--
-- Idempotente: só insere o que ainda não existe (por nome).
-- ═══════════════════════════════════════════════════════════

insert into public.scih_germes (nome, tipo, isolamento, embasamento)
select v.nome, v.tipo, v.isolamento, v.embasamento
from (values
  -- ===== Multirresistentes de vigilância =====
  ('Klebsiella pneumoniae (KPC)', 'multirresistente', 'contato',
   'Enterobactéria produtora de carbapenemase. Precaução de contato (Anvisa/CDC). Terapia conforme antibiograma.'),
  ('Staphylococcus aureus resistente à meticilina (MRSA)', 'multirresistente', 'contato',
   'Precaução de contato (Anvisa/CDC). Quarto privativo ou coorte do mesmo agente.'),
  ('Acinetobacter baumannii multirresistente', 'multirresistente', 'contato',
   'Alta persistência em superfícies. Precaução de contato; equipamentos dedicados ao paciente.'),
  ('Enterococcus resistente à vancomicina (VRE)', 'multirresistente', 'contato',
   'Precaução de contato (Anvisa/CDC). Coorte permitida para o mesmo agente.'),
  ('Pseudomonas aeruginosa multirresistente', 'multirresistente', 'contato',
   'Precaução de contato. Atenção a reservatórios úmidos e a equipamentos respiratórios.'),

  -- ===== Sensíveis que ainda assim exigem precaução =====
  -- O tipo diz respeito à RESISTÊNCIA, não à gravidade: estes não são
  -- multirresistentes e mesmo assim isolam, cada um por um motivo próprio.
  ('Clostridioides difficile', 'sensivel', 'contato',
   'Precaução de contato. Higiene das mãos com ÁGUA E SABÃO — o álcool em gel não inativa o esporo.'),
  ('Mycobacterium tuberculosis', 'sensivel', 'aereo',
   'Precaução para aerossóis: quarto com pressão negativa e máscara N95/PFF2 ao entrar.'),
  ('Neisseria meningitidis', 'sensivel', 'goticulas',
   'Precaução por gotículas nas primeiras 24h de antibiótico eficaz. Avaliar quimioprofilaxia dos contatos.'),
  ('Vírus sincicial respiratório (VSR)', 'sensivel', 'contato',
   'Precaução de contato (Anvisa/CDC). Sazonal, com surtos em pediatria.'),
  ('Influenza', 'sensivel', 'goticulas',
   'Precaução por gotículas. Acrescentar precaução para aerossóis em procedimentos que os gerem.')
) as v(nome, tipo, isolamento, embasamento)
where not exists (
  select 1 from public.scih_germes g where g.nome = v.nome
);

-- ───────────────────────────────────────────────────────────
-- Anota que esta migração rodou NESTE banco
-- ───────────────────────────────────────────────────────────
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-scih-germes-seed.sql') on conflict do nothing;

-- ───────────────────────────────────────────────────────────
-- Conferência (leitura). É a ÚLTIMA consulta de propósito: o SQL Editor
-- só mostra o resultado dela.
--
-- `sem_tipo` e `sem_isolamento` devem vir ZERO. Germe sem esses dois campos
-- existe na lista e não serve para nada: a sugestão fica muda, que é a
-- mesma cegueira de tabela vazia com aparência de tabela cheia.
-- ───────────────────────────────────────────────────────────
select
  count(*)                                            as germes_na_base,
  count(*) filter (where coalesce(tipo, '') = '')     as sem_tipo,
  count(*) filter (where isolamento is null)          as sem_isolamento,
  count(*) filter (where tipo = 'multirresistente')   as multirresistentes,
  (select count(*) from public.migracoes_aplicadas
    where arquivo = 'migracao-scih-germes-seed.sql')  as migracao_anotada
from public.scih_germes;
