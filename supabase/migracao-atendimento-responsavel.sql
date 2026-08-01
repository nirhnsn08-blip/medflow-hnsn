-- ═══════════════════════════════════════════════════════════
-- RESPONSÁVEL DO EPISÓDIO — quem consente e quem recebe a alta
--
-- Equivale ao botão "2- Responsável" do MV. Responde duas perguntas que
-- hoje só vivem na memória de quem estava no balcão: quem autorizou o
-- procedimento, e a quem o paciente pode ser entregue.
--
-- ⚠️ A REGRA QUE ORGANIZA A TABELA: CAPACIDADE NÃO SE DEDUZ.
-- A Lei 13.146/2015 (Estatuto da Pessoa com Deficiência) fez da curatela
-- medida EXCEPCIONAL e JUDICIAL — deficiência não é incapacidade. Por isso
-- os vínculos que só existem por decisão de juiz (tutor, curador, guardião,
-- responsável institucional) têm CHECK exigindo o número do processo. Não é
-- redundância da validação em JavaScript: é a última linha de defesa, a
-- mesma ideia do índice único que impede dois pacientes no mesmo horário da
-- agenda. Validação de tela não sobrevive a um script, a um import ou a uma
-- tela nova que alguém escreva daqui a um ano.
--
-- POR QUE A LINHA É POR ATENDIMENTO, E NÃO POR PACIENTE
-- Consentimento é ATO NO TEMPO. Quem autorizou a cirurgia de março pode não
-- ser quem trouxe o paciente em setembro, e a mãe que assinava pelo
-- adolescente de 15 não assina mais quando ele faz 18. Guardar no paciente
-- faria o registro de hoje reescrever a história de ontem. A tela oferece
-- copiar do episódio anterior, que resolve a digitação sem apagar o
-- passado.
--
-- ⚠️ RODAR NO SQL EDITOR ANTES DO MERGE DO CÓDIGO.
--    Aditiva e idempotente: cria UMA tabela nova e não toca em nenhuma
--    existente. Nenhuma constraint cobra de linha que já esteja no ar.
--    DEMO primeiro, depois o principal.
-- ═══════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════
-- 1) A TABELA
--
-- `consente` e `recebe_alta` são colunas, e não expressões derivadas do
-- papel, porque é isso que permite a consulta "a quem este paciente pode
-- ser entregue?" sem o consumidor precisar conhecer a regra. Quem as
-- preenche é `camposDoResponsavel` (responsavel.js), sempre a partir do
-- papel — a tela não escolhe.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.at_responsaveis (
  id                 bigserial primary key,
  -- O episódio. `on delete cascade` NÃO se aplica: atendimento não é
  -- apagado neste sistema (cancelar é estado), então a FK só garante que a
  -- linha aponta para um episódio que existe.
  atendimento_id     bigint references public.ps_atendimentos (id),
  -- Redundante com o atendimento de propósito: é o que permite listar o
  -- histórico de responsáveis de um paciente sem varrer os atendimentos, e
  -- o que sobra quando o responsável é cadastrado antes de abrir o episódio.
  prontuario         text,

  nome               text not null,
  cpf                text,
  data_nascimento    date,
  telefone           text,

  -- mae | pai | filho | conjuge | irmao | avo | tutor | curador | guardiao
  -- | instituicao | outro
  vinculo            text,
  -- representante | assistente | acompanhante
  papel              text not null default 'acompanhante',
  -- Número do processo. Obrigatório nos vínculos judiciais — ver o CHECK.
  documento_judicial text,

  consente           boolean not null default false,
  recebe_alta        boolean not null default false,

  observacao         text,
  ativo              boolean not null default true,
  usuario            text,
  criado_em          timestamptz not null default now(),
  updated_at         timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════
-- 2) OS DOIS CHECKS QUE VALEM MAIS QUE A TELA
--
-- O primeiro impede papel inventado. O segundo é o que protege capacidade
-- civil: sem número de processo, ninguém vira curador, tutor ou guardião
-- por digitação de balcão.
--
-- `add constraint if not exists` não existe no Postgres; o bloco abaixo faz
-- o equivalente idempotente.
-- ═══════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'at_resp_papel_valido') then
    alter table public.at_responsaveis
      add constraint at_resp_papel_valido
      check (papel in ('representante', 'assistente', 'acompanhante'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'at_resp_judicial_exige_documento') then
    alter table public.at_responsaveis
      add constraint at_resp_judicial_exige_documento
      check (
        vinculo is null
        or vinculo not in ('tutor', 'curador', 'guardiao', 'instituicao')
        or coalesce(btrim(documento_judicial), '') <> ''
      );
  end if;

  -- Acompanhante não consente e não recebe alta. É a regra que separa
  -- "direito de ficar ao lado" (ECA art. 12; Estatuto do Idoso art. 16) de
  -- procuração — e o defeito mais provável desta feature seria uma tela
  -- nova marcando as duas caixas para quem só acompanha.
  if not exists (select 1 from pg_constraint where conname = 'at_resp_acompanhante_sem_poder') then
    alter table public.at_responsaveis
      add constraint at_resp_acompanhante_sem_poder
      check (papel <> 'acompanhante' or (consente = false and recebe_alta = false));
  end if;
end $$;

create index if not exists at_resp_atend_idx
  on public.at_responsaveis (atendimento_id, ativo);
create index if not exists at_resp_prontuario_idx
  on public.at_responsaveis (prontuario, criado_em desc);


-- ═══════════════════════════════════════════════════════════
-- 3) RLS — mesmo padrão do resto do módulo
--
-- ⚠️ O `select using (true)` repete a política já usada em todas as tabelas
-- do sistema. Está aqui por COERÊNCIA, e não por concordância: a decisão de
-- fechar a leitura por perfil continua pendente para antes do primeiro
-- paciente real, e esta tabela guarda CPF e telefone de terceiros — gente
-- que nem paciente é. Quando o RLS for endurecido, esta tabela deve entrar
-- na mesma leva.
-- ═══════════════════════════════════════════════════════════
alter table public.at_responsaveis enable row level security;
drop policy if exists at_resp_select on public.at_responsaveis;
drop policy if exists at_resp_write  on public.at_responsaveis;
create policy at_resp_select on public.at_responsaveis for select to authenticated using (true);
create policy at_resp_write on public.at_responsaveis for all to authenticated
  using (public.my_role() in ('adm_master','adm_silver'))
  with check (public.my_role() in ('adm_master','adm_silver'));


-- ═══════════════════════════════════════════════════════════
-- 4) CONFERÊNCIA
-- ═══════════════════════════════════════════════════════════
select 'tabela at_responsaveis criada' as item,
       count(*)::text as valor
  from information_schema.tables
 where table_schema = 'public' and table_name = 'at_responsaveis'

union all
select 'colunas', count(*)::text
  from information_schema.columns
 where table_schema = 'public' and table_name = 'at_responsaveis'

union all
select 'checks de protecao (esperado 3)', count(*)::text
  from pg_constraint
 where conname in ('at_resp_papel_valido',
                   'at_resp_judicial_exige_documento',
                   'at_resp_acompanhante_sem_poder')

union all
select 'politicas RLS (esperado 2)', count(*)::text
  from pg_policies
 where schemaname = 'public' and tablename = 'at_responsaveis';
