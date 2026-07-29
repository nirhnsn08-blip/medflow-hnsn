-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO / RECEPÇÃO — a porta de entrada do hospital
--
-- O QUE MUDA
-- O sistema tinha a FICHA do paciente (migracao-pacientes-identificacao)
-- mas não tinha a PORTA. Hoje a recepção do PS digita iniciais e um número
-- de prontuário à mão, e nada garante que esse número corresponda a alguém
-- cadastrado. Três consequências, todas já presentes na base:
--
--   1. ATENDIMENTO ÓRFÃO — `ps_atendimentos.prontuario` é texto livre sem
--      referência. Um atendimento pode apontar para um prontuário que não
--      existe em `pacientes`, e o Paciente 360 abre vazio.
--
--   2. NÚMERO INVENTADO — ninguém emite o prontuário. Dois recepcionistas
--      podem escolher o mesmo número, e o mesmo paciente pode ganhar dois
--      números em duas visitas. O índice único de CPF/CNS criado na
--      migração anterior só protege quem já foi cadastrado; a porta não.
--
--   3. VÍNCULO POR STRING — um espaço a mais ou um zero à esquerda separa
--      o histórico da pessoa em dois. Fundir depois é operação de risco.
--
-- O QUE ESTA MIGRAÇÃO FAZ, NESTA ORDEM (a ordem importa)
--   1. Acrescenta em `pacientes` o que a recepção precisa registrar.
--   2. NORMALIZA os prontuários já gravados (trim; vazio vira NULL).
--   3. CRIA o cadastro que falta para todo atendimento/leito órfão.
--   4. Só então liga a CHAVE ESTRANGEIRA.
--   5. Cria a sequência e a função que EMITEM o próximo prontuário.
--
-- ⚠️ POR QUE O BACKFILL (passo 3) NÃO É OPCIONAL
--    Uma FK criada com `not valid` não confere as linhas antigas — mas
--    confere qualquer linha que for ATUALIZADA depois. E o PS atualiza a
--    linha do atendimento o tempo todo (triagem, início do atendimento,
--    desfecho). Sem o backfill, a primeira triagem de um paciente que já
--    estava na fila falharia — no meio do plantão, sem explicação na tela.
--    Por isso aqui se cria o cadastro que falta ANTES de ligar a trava.
--
--    Os cadastros criados assim ficam marcados com `origem_cadastro =
--    'backfill'` e sem nome: aparecem na tela como identificação pendente,
--    que é a verdade. O que a migração NÃO faz é inventar dado de pessoa.
--
-- ⚠️ RODAR NO SQL EDITOR **ANTES** DO MERGE DO CÓDIGO.
--    Sem isso, a tela de Atendimento abre e não consegue emitir prontuário.
--    É aditiva: `add column if not exists`, backfill idempotente e criação
--    condicional de constraint. Pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) O QUE A RECEPÇÃO REGISTRA
-- ═══════════════════════════════════════════════════════════
alter table public.pacientes
  -- Paciente que chega sem condição de se identificar (inconsciente, sem
  -- documento, sem acompanhante). A CFM 1.638/2002, art. 5º, I, "e", prevê
  -- o atendimento em que a anamnese não é possível — o que não se pode é
  -- deixar de registrar. Aqui ele entra com prontuário emitido e este
  -- marcador; a identificação é completada depois, sem perder o vínculo do
  -- que já foi feito com ele.
  add column if not exists nao_identificado boolean not null default false,

  -- Quando a identificação foi concluída. Enquanto for NULL num paciente
  -- marcado acima, o caso está aberto — é o que alimenta a lista de
  -- pendências da recepção.
  add column if not exists identificado_em timestamptz,

  -- De onde veio este cadastro: 'recepcao' (alguém cadastrou na porta),
  -- 'backfill' (criado por esta migração a partir de um atendimento órfão)
  -- ou NULL (cadastro anterior a este controle). Sem isso, daqui a seis
  -- meses ninguém distingue o registro que uma pessoa conferiu do registro
  -- que um script deduziu.
  add column if not exists origem_cadastro text;


-- ═══════════════════════════════════════════════════════════
-- 2) NORMALIZAÇÃO — antes de comparar, limpar
--
-- ' 48213' e '48213' são a mesma pessoa para o ser humano e duas chaves
-- diferentes para o banco. A FK do passo 4 recusaria a primeira. Vazio
-- vira NULL: string vazia exigiria um paciente de prontuário '' para
-- satisfazer a chave, o que não existe e não deve existir.
-- ═══════════════════════════════════════════════════════════
update public.ps_atendimentos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.leitos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.pacientes
   set prontuario = trim(prontuario)
 where prontuario <> trim(prontuario);


-- ═══════════════════════════════════════════════════════════
-- 3) BACKFILL — todo atendimento passa a ter paciente
--
-- `distinct on` com `order by ... chegada_em desc` pega as iniciais do
-- registro MAIS RECENTE daquele prontuário: se alguém corrigiu a digitação
-- na última visita, é a versão corrigida que vira cadastro.
-- ═══════════════════════════════════════════════════════════
insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (a.prontuario)
       a.prontuario,
       coalesce(nullif(trim(a.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-recepcao',
       now()
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario)
 order by a.prontuario, a.chegada_em desc
on conflict (prontuario) do nothing;

-- Mesma coisa pelo lado da internação: um leito ocupado por prontuário que
-- nunca virou cadastro é o mesmo buraco visto de outro módulo.
insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (l.prontuario)
       l.prontuario,
       coalesce(nullif(trim(l.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-recepcao',
       now()
  from public.leitos l
 where l.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = l.prontuario)
 order by l.prontuario, l.updated_at desc nulls last
on conflict (prontuario) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 4) A TRAVA MORA EM OUTRO ARQUIVO — E ISSO É DE PROPÓSITO
--
-- A chave estrangeira de ps_atendimentos → pacientes está em
-- `migracao-atendimento-fk.sql`, que se roda DEPOIS do merge do código.
--
-- POR QUE A ORDEM INVERTE AQUI
-- A regra da casa é rodar o SQL ANTES do merge, porque o código novo grava
-- em coluna nova. Uma CONSTRAINT é o contrário: ela cobra do código que
-- está no ar. O formulário de chegada do PS que está hoje na `main` aceita
-- prontuário digitado à mão, sem conferir se existe — com a FK no lugar,
-- esse INSERT passa a ser recusado, e o sbFetch devolve `null` sem alarde.
-- A recepcionista clicaria em "Registrar chegada" e o paciente não entraria
-- na fila da triagem.
--
-- Este arquivo é 100% aditivo: nenhuma linha dele pode recusar uma escrita
-- do código antigo. Pode rodar quando quiser.
-- ═══════════════════════════════════════════════════════════
create index if not exists ps_atendimentos_prontuario_idx
  on public.ps_atendimentos (prontuario);


-- ═══════════════════════════════════════════════════════════
-- 5) EMISSÃO DO PRONTUÁRIO — o número deixa de ser inventado
--
-- A sequência continua de onde a numeração do hospital já estava: começa
-- acima do maior prontuário CONFIÁVEL que existe. Prontuários alfanuméricos
-- ("T9035") entram pela parte numérica.
--
-- O piso de 1000 evita emitir prontuário de um dígito num hospital que
-- ainda tem poucos cadastros — número curto é fácil de confundir na fala
-- e no papel.
--
-- "Confiável" faz muito trabalho nessa frase. Ver o bloco abaixo.
-- ═══════════════════════════════════════════════════════════
create sequence if not exists public.prontuario_seq as bigint;

-- ⚠️ O QUE **NÃO** PODE ANCORAR A SEQUÊNCIA — descoberto rodando no demo
--
-- A primeira versão disto olhava TODOS os pacientes. Resultado no banco de
-- teste: a sequência parou em 990001 e o próximo prontuário do hospital
-- seria 990002.
--
-- A causa é uma corrente de dois passos que só aparece junta:
--   1. alguém digitou "990001" no campo prontuário da chegada do PS;
--   2. o backfill (passo 3) transformou isso num cadastro de verdade;
--   3. a sequência então ancorou nesse cadastro.
--
-- Ou seja: QUALQUER número digitado errado no PS viraria a âncora de toda
-- a numeração futura do hospital. Um CPF digitado no campo errado (11
-- dígitos, passa no filtro de tamanho) faria os prontuários reais nascerem
-- em 52.998.224.726.
--
-- Duas defesas, e a segunda é a que importa:
--
--   `origem_cadastro is distinct from 'backfill'` — cadastro que o backfill
--   deduziu de um atendimento órfão não é fonte confiável de numeração.
--   Ninguém conferiu aquele número; ele existe só para o histórico não se
--   perder. Cadastro que uma pessoa criou, sim, ancora.
--
--   `length(...) <= 6` — prontuário de hospital não tem sete dígitos. Isso
--   segura CPF, CNS, telefone e data digitados no campo errado, inclusive
--   nos cadastros antigos, que não têm `origem_cadastro` preenchido.
--
-- E a rede de segurança final é o laço em `proximo_prontuario()`: se
-- mesmo assim o número calculado colidir com um prontuário existente, ele
-- pula para o próximo em vez de devolver um número que o INSERT recusaria.
-- É por causa desse laço que ancorar baixo demais é seguro — e ancorar
-- alto demais, não.
do $$
declare maior bigint;
begin
  select coalesce(max(n), 0) into maior
    from (
      select (regexp_replace(prontuario, '[^0-9]', '', 'g'))::bigint as n
        from public.pacientes
       where prontuario ~ '[0-9]'
         and length(regexp_replace(prontuario, '[^0-9]', '', 'g')) between 1 and 6
         and origem_cadastro is distinct from 'backfill'
    ) t;
  perform setval('public.prontuario_seq', greatest(maior, 1000), true);
end $$;

-- `security definer` para a recepção não precisar de permissão direta na
-- sequência. O laço é seguro-contra-colisão: se o número sorteado já
-- existir como prontuário digitado à mão, pula para o próximo em vez de
-- devolver um número que o INSERT recusaria depois.
create or replace function public.proximo_prontuario()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidato text;
  tentativas int := 0;
begin
  loop
    candidato := nextval('public.prontuario_seq')::text;
    exit when not exists (select 1 from public.pacientes where prontuario = candidato);
    tentativas := tentativas + 1;
    -- Teto para o laço não virar espera infinita se a sequência for
    -- reposicionada muito abaixo da numeração real. Falhar com uma
    -- mensagem que diz o que fazer é melhor do que a recepção olhando
    -- uma tela travada com o paciente no balcão.
    if tentativas > 10000 then
      raise exception 'Nao foi possivel emitir prontuario: 10000 numeros seguidos ja estao em uso a partir de %. Reposicione a sequencia com: select setval(''public.prontuario_seq'', <maior numero em uso>, true);', candidato;
    end if;
  end loop;
  return candidato;
end;
$$;

revoke all on function public.proximo_prontuario() from public;
grant execute on function public.proximo_prontuario() to authenticated;


-- ═══════════════════════════════════════════════════════════
-- 6) NATUREZA DO ATENDIMENTO
--
-- A recepção precisa dizer O QUE está abrindo. Hoje todo `ps_atendimentos`
-- é emergência por construção; a coluna registra isso explicitamente e
-- abre caminho para o atendimento ambulatorial sem outra migração de
-- estrutura depois.
--
-- Não confundir com `triagem_tipo` (adulto | obstetrica | pediatrica), que
-- é o protocolo de triagem, nem com `ps_registros.tipo`, que é o tipo do
-- registro clínico.
-- ═══════════════════════════════════════════════════════════
alter table public.ps_atendimentos
  add column if not exists tipo_atendimento text not null default 'emergencia';


-- ═══════════════════════════════════════════════════════════
-- 6.5) ACESSO AO MÓDULO NOVO
--
-- Sem isto a feature sobe INVISÍVEL. `migracao-perfis-acesso.sql` também
-- ganhou estas linhas — mas ela já foi aplicada nos bancos que existem, e
-- editar um script já rodado não muda banco nenhum. Quem só rodasse aquele
-- arquivo teria o módulo num banco novo e não teria nos atuais.
--
-- 'provisorio' está na lista por um motivo prático: hoje é o perfil de
-- quase toda a equipe. Sem o grant nele, o menu não apareceria para
-- ninguém até a reclassificação terminar.
--
-- Nível por perfil, e o porquê:
--   escrita  — recepção (é o dono da tela), enfermeiro (admite à noite,
--              quando não há recepcionista), TI e provisório.
--   leitura  — médico, técnico, faturamento, gestão e diretor técnico:
--              precisam CONSULTAR quem é quem, não abrir atendimento.
-- ═══════════════════════════════════════════════════════════
-- O `where exists` não é excesso de zelo: `perfis_permissoes` tem chave
-- estrangeira para `perfis_acesso`, e um INSERT direto abortaria o script
-- inteiro num banco onde algum destes perfis não existe — levando junto a
-- conferência do passo 7. Assim, perfil que não existe é pulado.
do $$
begin
  if to_regclass('public.perfis_permissoes') is null then
    raise notice 'perfis_permissoes nao existe neste banco - rode migracao-perfis-acesso.sql antes. Modulo Atendimento ficara invisivel ate la.';
    return;
  end if;

  insert into public.perfis_permissoes (perfil_chave, modulo, nivel)
  select v.perfil, 'atendimento', v.nivel
    from (values
            ('recepcao','escrita'),
            ('enfermeiro','escrita'),
            ('ti','escrita'),
            ('provisorio','escrita'),
            ('medico','leitura'),
            ('tecnico_enfermagem','leitura'),
            ('faturamento','leitura'),
            ('gestao','leitura'),
            ('diretor_tecnico','leitura')
         ) as v(perfil, nivel)
   where exists (select 1 from public.perfis_acesso pa where pa.chave = v.perfil)
  on conflict (perfil_chave, modulo) do nothing;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 7) CONFERÊNCIA
-- Rode depois de aplicar. Espera-se `orfaos = 0` na segunda consulta.
-- ═══════════════════════════════════════════════════════════
select
  count(*)                                                   as pacientes,
  count(*) filter (where origem_cadastro = 'backfill')       as criados_pelo_backfill,
  count(*) filter (where nao_identificado)                   as nao_identificados,
  count(*) filter (where nome_completo is not null)          as com_nome
from public.pacientes;

select count(*) as orfaos
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario);

-- Onde a emissão está. Consultar `last_value` NÃO consome número.
select last_value as ultimo_prontuario_emitido from public.prontuario_seq;

-- Para provar que a função responde (permissão, search_path), rode a linha
-- abaixo à mão. Ela CONSOME um número da sequência — o que é inofensivo
-- (número pulado não faz falta), mas não é para deixar num script que
-- alguém roda duas vezes por precaução.
--   select public.proximo_prontuario();
