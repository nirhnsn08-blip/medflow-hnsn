-- ═══════════════════════════════════════════════════════════
-- ATENDIMENTO — A TRAVA (chave estrangeira ps_atendimentos → pacientes)
--
-- ⚠️ ESTE ARQUIVO RODA **DEPOIS** DO MERGE DO CÓDIGO.
--    É o único do repositório em que a ordem se inverte, então vale ler o
--    porquê antes de rodar.
--
-- A regra da casa é rodar o SQL ANTES do merge, porque o código novo grava
-- em coluna nova — sem a coluna, a tela abre e não salva. Uma CONSTRAINT é
-- o contrário: ela não serve o código novo, ela COBRA do código que está no
-- ar.
--
-- O QUE ACONTECE SE ISTO RODAR CEDO DEMAIS
-- O formulário de chegada do PS anterior a esta feature aceita prontuário
-- digitado à mão sem conferir se existe. Com a FK no lugar, o PostgREST
-- recusa esse INSERT e o `sbFetch` devolve `null` sem alarde: a
-- recepcionista clica em "Registrar chegada", o formulário limpa, e o
-- paciente NÃO entra na fila da triagem. Ninguém é chamado.
--
-- O código que acompanha esta migração fecha esse buraco — a chegada do PS
-- passa a conferir se o prontuário existe e manda para a Recepção quando
-- não existe. Por isso: primeiro o código, depois esta trava.
--
-- ORDEM CORRETA
--   1. `migracao-atendimento-recepcao.sql` no banco   (aditiva, pode rodar já)
--   2. merge do código na main + deploy
--   3. ESTE ARQUIVO no banco
--
-- É idempotente: pode rodar duas vezes sem efeito colateral.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) NORMALIZAR E PREENCHER DE NOVO
--
-- A migração anterior já fez isto. Repete-se aqui porque entre uma e outra
-- passaram-se dias, e nesse intervalo o código antigo continuou aceitando
-- prontuário digitado à mão. Órfão criado ontem à noite aborta o passo 2 e
-- deixa a trava sem instalar — melhor limpar imediatamente antes.
-- ═══════════════════════════════════════════════════════════
update public.ps_atendimentos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

update public.leitos
   set prontuario = nullif(trim(prontuario), '')
 where prontuario is distinct from nullif(trim(prontuario), '');

insert into public.pacientes (prontuario, iniciais, origem_cadastro, usuario, updated_at)
select distinct on (a.prontuario)
       a.prontuario,
       coalesce(nullif(trim(a.iniciais), ''), '?'),
       'backfill',
       'migracao-atendimento-fk',
       now()
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario)
 order by a.prontuario, a.chegada_em desc
on conflict (prontuario) do nothing;


-- ═══════════════════════════════════════════════════════════
-- 2) A TRAVA
--
-- Sem `on update cascade` DE PROPÓSITO. Trocar o número do prontuário
-- parece inofensivo e não é: `leitos`, `cc_cirurgias`, `scih_casos`,
-- `pep_*` e `enf_*` guardam o mesmo número como texto solto e NÃO seriam
-- levados junto. Melhor a troca ser recusada aqui, à vista, do que
-- espalhar um histórico partido por seis tabelas.
--
-- O `exception` existe para a falha não levar junto a conferência do passo
-- 3, que é justamente o que diz onde está o problema.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'ps_atendimentos_paciente_fk'
       and conrelid = 'public.ps_atendimentos'::regclass
  ) then
    alter table public.ps_atendimentos
      add constraint ps_atendimentos_paciente_fk
      foreign key (prontuario) references public.pacientes (prontuario);
  end if;
exception when others then
  raise notice 'ATENCAO: nao foi possivel criar a FK (%). Rode a conferencia do passo 3 para achar o prontuario orfao.', sqlerrm;
end $$;


-- ═══════════════════════════════════════════════════════════
-- 3) CONFERÊNCIA
-- Espera-se `orfaos = 0` e `trava_instalada = true`.
-- ═══════════════════════════════════════════════════════════
select count(*) as orfaos
  from public.ps_atendimentos a
 where a.prontuario is not null
   and not exists (select 1 from public.pacientes p where p.prontuario = a.prontuario);

select exists (
  select 1 from pg_constraint
   where conname = 'ps_atendimentos_paciente_fk'
     and conrelid = 'public.ps_atendimentos'::regclass
) as trava_instalada;
