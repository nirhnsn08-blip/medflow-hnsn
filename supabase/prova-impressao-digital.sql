-- ═══════════════════════════════════════════════════════════
-- PROVA: A IMPRESSÃO DIGITAL ACUSA ADULTERAÇÃO?
--
-- ⚠️ RODE SÓ NO DEMO (ufxqdvxhruaswuzhmxyf). Este arquivo ALTERA um laudo
-- de propósito, para que o selo "ALTERADO" tenha o que acusar na tela.
-- O passo 4 desfaz tudo e devolve o laudo ao estado original.
--
-- 💡 POR QUE PRECISA DE SQL E NÃO DÁ PARA FAZER PELO APLICATIVO
--
-- `sadt_resultados` é append-only: a RLS não tem política de UPDATE, então
-- um PATCH pelo app é recusado — o que está certo, e foi conferido. A
-- adulteração que esta camada existe para pegar é justamente a que vem por
-- FORA do caminho do aplicativo. Para prová-la, é preciso vir por fora.
--
-- 🔴 ESTA PROVA SE AUTO-VERIFICA. Se o gatilho NOVO estiver no ar, o hash
-- não muda com o UPDATE e passa a não descrever mais a linha. Se o ANTIGO
-- ainda estiver, o hash é recarimbado e nada acusa nada — e o passo 2 diz
-- isso com todas as letras, em vez de deixar você concluir errado.
-- ═══════════════════════════════════════════════════════════


-- ── 1. COMO ESTÁ AGORA ─────────────────────────────────────
-- A digital bate com o conteúdo? Tem de dizer ✅ em tudo que tem digital.
select r.id, r.nome, r.valor_num, r.critico,
       left(r.conteudo_hash, 12) as digital,
       case
         when r.conteudo_hash is null then '— sem digital (anterior à migração)'
         when r.conteudo_hash = encode(sha256(convert_to(public.doc_canonico_resultado(r.*), 'UTF8')), 'hex')
              then '✅ bate'
         else '🔴 NÃO BATE'
       end as confere
  from public.sadt_resultados r
 order by r.id;


-- ── 2. A ADULTERAÇÃO ───────────────────────────────────────
-- Vira o laudo de sódio 118 (crítico) em 140 (normal). É a alteração mais
-- perigosa que este banco permitiria: apagar um valor crítico.
do $$
declare
  alvo bigint;
  antes text;
  depois text;
  canonico text;
begin
  select id, conteudo_hash into alvo, antes
    from public.sadt_resultados
   where nome = 'Sódio' and conteudo_hash is not null
   order by id desc limit 1;

  if alvo is null then
    raise notice '⚠️  Nenhum laudo de Sódio COM digital. Lance um pela tela antes (aba Exames do paciente I.A.) e rode de novo.';
    return;
  end if;

  update public.sadt_resultados
     set valor_num = 140, critico = false, anormal = false
   where id = alvo;

  select conteudo_hash, encode(sha256(convert_to(public.doc_canonico_resultado(t.*), 'UTF8')), 'hex')
    into depois, canonico
    from public.sadt_resultados t where id = alvo;

  raise notice '— laudo adulterado: #% (sódio 118 crítico → 140 normal)', alvo;

  if depois is distinct from antes then
    raise notice '🔴 O GATILHO ANTIGO AINDA ESTÁ NO AR: a digital foi RECARIMBADA (% → %).', left(antes,12), left(depois,12);
    raise notice '   Rode `migracao-documento-impressao-digital.sql` de novo e repita esta prova.';
  elsif depois is distinct from canonico then
    raise notice '✅ A digital NÃO mudou (%) e deixou de descrever a linha.', left(depois,12);
    raise notice '   Agora a tela tem o que acusar. Abra o paciente I.A. → aba Exames.';
  else
    raise notice '⚠️  Inesperado: a digital não mudou mas ainda bate. Confira a forma canônica.';
  end if;
end $$;


-- ── 3. O QUE A TELA VAI VER ────────────────────────────────
select r.id, r.nome, r.valor_num, r.critico,
       case
         when r.conteudo_hash is null then '— sem digital'
         when r.conteudo_hash = encode(sha256(convert_to(public.doc_canonico_resultado(r.*), 'UTF8')), 'hex')
              then '✅ bate'
         else '🔴 ALTERADO — é isto que o selo mostra'
       end as confere
  from public.sadt_resultados r
 order by r.id;


-- ═══════════════════════════════════════════════════════════
-- ── 4. DESFAZER ────────────────────────────────────────────
--
-- ⚠️ RODE DEPOIS DE OLHAR A TELA, não antes. Devolve o laudo ao valor
-- original; a digital volta a bater porque ela nunca mudou.
--
-- Descomente as cinco linhas abaixo e execute só elas.
-- ═══════════════════════════════════════════════════════════

-- update public.sadt_resultados
--    set valor_num = 118, critico = true, anormal = true
--  where nome = 'Sódio' and conteudo_hash is not null
--    and id = (select max(id) from public.sadt_resultados where nome = 'Sódio');
