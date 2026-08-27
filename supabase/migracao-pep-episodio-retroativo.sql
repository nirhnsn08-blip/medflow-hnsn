-- ═══════════════════════════════════════════════════════════
-- ABRE O EPISÓDIO DE QUEM JÁ ESTÁ INTERNADO
--
-- POR QUE: `abrirEpisodio` existia no código e nenhuma tela a chamava —
-- `pep_episodios` tem ZERO linhas. Sem episódio ficam vazios, por
-- construção e sem erro na tela: evolução, prescrição do internado, sinais
-- vitais, NEWS, escalas de Braden e Morse, LPP, SAE inteira, reconciliação
-- medicamentosa, sumário de alta, e o Mapa de risco e a Checagem SAE do
-- Giro de Leitos.
--
-- O código agora liga os dois (ocupar leito → abrir episódio). Mas isso só
-- vale para internações NOVAS. Quem JÁ está no leito continuaria sem
-- prontuário da internação até receber alta — ou seja, a correção não
-- ajudaria nenhum dos pacientes internados hoje.
--
-- ⚠️ O QUE ESTE SCRIPT AFIRMA, E O QUE NÃO AFIRMA.
-- Ele cria o CONTINENTE, não o conteúdo: um episódio aberto, com o leito,
-- o setor, o CID e a data que JÁ ESTÃO no registro do leito. Não inventa
-- evolução, sinal vital nem diagnóstico — só abre o lugar onde a equipe
-- passa a poder registrar. `admissao_em` vem de `leitos.data_internacao`,
-- que é dado real; quando ela falta, usa-se `entrada_em`, e o episódio
-- fica marcado no motivo para ninguém confundir com registro de origem.
--
-- ⚠️ NÃO TOCA EM LEITO SEM PRONTUÁRIO. O episódio é chaveado por
-- prontuário; sem ele não há o que abrir. Esses leitos aparecem no recibo
-- como `sem_prontuario` — cada um é um paciente que o sistema não
-- consegue ligar a cadastro nenhum, e vale resolver na mão.
--
-- IDEMPOTENTE: rodar duas vezes não cria episódio repetido.
-- ═══════════════════════════════════════════════════════════

INSERT INTO public.pep_episodios
  (prontuario, iniciais, tipo, leito, setor, cid_principal, motivo_internacao,
   admissao_em, status, usuario)
SELECT
  l.prontuario,
  l.iniciais,
  'internacao',
  l.identificacao,
  l.setor,
  l.cid,
  coalesce(nullif(trim(l.motivo), ''), 'internação em curso') ||
    ' · episódio aberto retroativamente na implantação do prontuário da internação',
  coalesce(l.data_internacao::timestamptz, l.entrada_em, now()),
  'aberto',
  'migracao-retroativa'
FROM public.leitos l
WHERE l.status = 'ocupado'
  AND coalesce(trim(l.prontuario), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.pep_episodios e
     WHERE e.prontuario = l.prontuario AND e.status = 'aberto'
  );

-- ── RECIBO ──────────────────────────────────────────────────
SELECT
  (SELECT count(*) FROM public.leitos WHERE status = 'ocupado') AS leitos_ocupados,
  (SELECT count(*) FROM public.leitos
     WHERE status = 'ocupado' AND coalesce(trim(prontuario), '') = '') AS sem_prontuario,
  (SELECT count(*) FROM public.pep_episodios WHERE status = 'aberto') AS episodios_abertos,
  (SELECT count(*) FROM public.pep_episodios
     WHERE usuario = 'migracao-retroativa') AS abertos_por_este_script,
  -- deve ser ZERO: leito ocupado, com prontuário, e ainda sem episódio
  (SELECT count(*) FROM public.leitos l
     WHERE l.status = 'ocupado'
       AND coalesce(trim(l.prontuario), '') <> ''
       AND NOT EXISTS (SELECT 1 FROM public.pep_episodios e
                        WHERE e.prontuario = l.prontuario AND e.status = 'aberto')) AS ficaram_de_fora;

-- Toda migração termina se anotando (ver docs/MODELO-DE-TRABALHO.md §6).
insert into public.migracoes_aplicadas (arquivo)
values ('migracao-pep-episodio-retroativo.sql') on conflict do nothing;
