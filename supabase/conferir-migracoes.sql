-- ============================================================
-- Valentrax — O QUE FALTA RODAR NESTE BANCO
--
-- Rode em QUALQUER um dos dois bancos. Ele compara os arquivos que
-- existem no repositório com os que ESTE banco diz ter aplicado.
--
-- ⚠️ ARQUIVO GERADO — não edite à mão. Ao criar uma migração, rode:
--        node supabase/gerar-conferencia.mjs
--
-- ⚠️ DEPENDE DE `migracoes_aplicadas`. Se a tabela não existir, rode antes
--    `migracao-registro-de-migracoes.sql` — ela cria o registro e anota as
--    que já rodaram.
--
-- ⚠️ E CADA MIGRAÇÃO NOVA PRECISA TERMINAR COM ESTA LINHA:
--
--        insert into public.migracoes_aplicadas (arquivo)
--        values ('migracao-SEU-NOME-AQUI.sql') on conflict do nothing;
--
--    Sem ela a migração roda e não se anota — e o conferidor vai pedir
--    para rodar de novo, para sempre.
--
-- Cobertura: 83 migrações.
-- ============================================================

-- quem está rodando? (opcional, mas ajuda quando são duas pessoas)
-- set valentrax.quem = 'seu-nome';

with esperadas(arquivo, o_que_faz) as (values
  ('migracao-agenda-confirmacao.sql', 'A tela da Agenda exibe um KPI de ABSENTEÍSMO e o hospital não tem como'),
  ('migracao-agenda-remarcacao.sql', 'Remarcar não existe no sistema. Existe CANCELAR (com um motivo em texto'),
  ('migracao-agenda-vaga-por-profissional.sql', 'A trava que impede dois pacientes no mesmo horário estava na chave'),
  ('migracao-atendimento-agenda.sql', 'AGENDA DO AMBULATÓRIO — grade, marcação e o painel do dia'),
  ('migracao-atendimento-ciclo.sql', 'CICLO DE VIDA DO ATENDIMENTO — cancelamento com rastro'),
  ('migracao-atendimento-fase2.sql', 'ATENDIMENTO FASE 2 — A FICHA: quem paga, que tipo, para onde'),
  ('migracao-atendimento-faturamento.sql', 'FATURAMENTO — a conta do atendimento (fundação)'),
  ('migracao-atendimento-fk.sql', 'ATENDIMENTO — A TRAVA (chave estrangeira ps_atendimentos → pacientes)'),
  ('migracao-atendimento-recepcao.sql', 'ATENDIMENTO / RECEPÇÃO — a porta de entrada do hospital'),
  ('migracao-atendimento-responsavel.sql', 'RESPONSÁVEL DO EPISÓDIO — quem consente e quem recebe a alta'),
  ('migracao-auditoria-atribuivel.sql', 'AUDITORIA — trilha atribuível e consultável'),
  ('migracao-enf-escalas-lpp.sql', 'ENFERMAGEM — Escalas de risco + Lesão por Pressão (Tier 1, Fase 1a)'),
  ('migracao-enf-sae.sql', 'ENFERMAGEM — SAE / Processo de Enfermagem (Tier 1, Fase 1b)'),
  ('migracao-episodio-id-tipo.sql', '`episodio_id` DAS TABELAS DE ENFERMAGEM: uuid → bigint'),
  ('migracao-farmacia-clinica-fase1.sql', 'Idempotente nas colunas (add if not exists). O bloco de seed preenche'),
  ('migracao-farmacia-clinica-fase2.sql', 'Tabelas de PARES de substâncias, curáveis pela equipe. O seed traz'),
  ('migracao-farmacia-clinica-fase3.sql', 'NÃO altera estrutura (colunas ajuste_renal/ajuste_hepatico já existem'),
  ('migracao-farmacia-custos.sql', 'Não altera dados; só adiciona a coluna de custo. Os preços são'),
  ('migracao-farmacia-estorno-inventario.sql', 'FARMÁCIA — estorno com vínculo e inventário cíclico'),
  ('migracao-farmacia-faseA.sql', 'Idempotente: pode rodar de novo sem quebrar nada.'),
  ('migracao-farmacia-faseB.sql', 'Idempotente: pode rodar de novo sem quebrar nada.'),
  ('migracao-farmacia-intervencoes.sql', 'Registro das intervenções do farmacêutico sobre a prescrição, com'),
  ('migracao-farmacia-lote-vencido.sql', 'LOTE VENCIDO NÃO VAI PARA O PACIENTE'),
  ('migracao-farmacia-nao-padronizados.sql', 'Registro dos medicamentos que NÃO estão no catálogo do hospital e que'),
  ('migracao-farmacia-preparo-exige-baixa.sql', 'A PRESCRIÇÃO SÓ FICA "PRONTA" SE SAIU DO ESTOQUE'),
  ('migracao-farmacia-preparo.sql', 'Uma linha por prescrição assinada (registro_id). "aguardando" é implícito:'),
  ('migracao-farmacia-seed.sql', 'Idempotente: só insere o que ainda não existe (por nome).'),
  ('migracao-faturamento-remessa.sql', 'REMESSA TRANSMITIDA — quem, quando, e sob qual protocolo'),
  ('migracao-leitos-kanban-metas.sql', '(idempotente e reversível de fato — não apaga nem altera nada existente).'),
  ('migracao-leitos-nir-regulacao.sql', 'GIRO DE LEITOS — Regulação (NIR): rastro do "quem pegou o caso"'),
  ('migracao-leitos-saida-setor.sql', '(idempotente; não apaga nem altera nada existente).'),
  ('migracao-nsp-capacitacoes.sql', 'NSP — Capacitações em segurança do paciente (Fase 2d)'),
  ('migracao-nsp-comunicados.sql', 'NSP — Comunicação / mural de segurança (Fase 2d)'),
  ('migracao-nsp-incidentes.sql', 'NSP — Núcleo de Segurança do Paciente (Fase 2a): notificação de incidentes'),
  ('migracao-nsp-metas.sql', 'NSP — Indicadores automáticos + 6 Metas Internacionais (Fase 2c)'),
  ('migracao-nsp-protocolos.sql', 'NSP — Protocolos gerenciados de segurança (Fase 2d)'),
  ('migracao-nsp-rca-plano.sql', 'NSP — Análise de causa raiz (RCA) + Plano de ação (Fase 2b)'),
  ('migracao-pacientes-busca.sql', 'A busca da recepção não achava o paciente que está cadastrado. Três'),
  ('migracao-pacientes-identificacao.sql', 'IDENTIFICAÇÃO DO PACIENTE — conteúdo mínimo do prontuário'),
  ('migracao-pacientes-municipio-ibge.sql', 'CÓDIGO IBGE DO MUNICÍPIO DE RESIDÊNCIA'),
  ('migracao-pacientes-nacionalidade-etnia.sql', 'O cadastro atende mal duas populações que chegam no balcão, cada uma de'),
  ('migracao-pacientes-obito.sql', '`pacientes.obito` é lido em CINCO lugares do código e escrito em NENHUM.'),
  ('migracao-pacientes-recem-nascido.sql', 'O hospital faz parto e o bebê NÃO TINHA COMO SER CADASTRADO. Não é que o'),
  ('migracao-pacientes-unificacao.sql', 'UNIFICAÇÃO DE PRONTUÁRIO — ligar duas fichas da mesma pessoa'),
  ('migracao-pep-acessos.sql', 'PEP — REGISTRO DE ACESSO AO PRONTUÁRIO (quem abriu o de quem)'),
  ('migracao-pep-categoria-profissional.sql', 'PEP — CATEGORIA PROFISSIONAL E REGISTRO DE CONSELHO'),
  ('migracao-pep-episodio-retroativo.sql', 'ABRE O EPISÓDIO DE QUEM JÁ ESTÁ INTERNADO'),
  ('migracao-pep-fase1.sql', 'PRONTUÁRIO ELETRÔNICO DO PACIENTE (PEP) — Fase 1'),
  ('migracao-pep-fase3.sql', 'PEP — FASE 3: RECONCILIAÇÃO MEDICAMENTOSA E SUMÁRIO DE ALTA'),
  ('migracao-pep-perfis-update.sql', 'PERFIS — permitir que o administrador classifique a equipe'),
  ('migracao-pep-sinais-spo2.sql', 'PEP — saturação e suporte de O₂ nos sinais vitais'),
  ('migracao-perfis-acesso.sql', 'PERFIS DE ACESSO — o cargo vira um pacote de permissões'),
  ('migracao-perfis-auditoria-diretor.sql', 'AUDITORIA: DIRETOR TÉCNICO PASSA A SÓ CONSULTAR A TRILHA'),
  ('migracao-perfis-faturamento.sql', 'GRANTS DO MÓDULO FATURAMENTO — migração avulsa (Tier 1 — Fase 4)'),
  ('migracao-perfis-nsp.sql', 'SEGURANÇA DO PACIENTE ENTRA NOS PERFIS ASSISTENCIAIS'),
  ('migracao-protocolos-avc.sql', 'PROTOCOLOS CLÍNICOS — Fase 3c: AVC (seed do template)'),
  ('migracao-protocolos-iam.sql', 'PROTOCOLOS CLÍNICOS — Fase 3b: Dor torácica / IAM (seed do template)'),
  ('migracao-protocolos-tev.sql', 'PROTOCOLOS CLINICOS · Fase 3d: TEV / profilaxia (seed do template)'),
  ('migracao-protocolos.sql', 'PROTOCOLOS CLÍNICOS GERENCIADOS (Tier 1 — Fase 3a: Sepse)'),
  ('migracao-ps-checagem-medicacao.sql', 'PRONTO-SOCORRO — checagem de medicação administrada'),
  ('migracao-ps-comorbidades.sql', 'PRONTO-SOCORRO — Comorbidades na triagem'),
  ('migracao-ps-faixas-obstetricas.sql', 'PRONTO-SOCORRO — Critérios obstétricos de risco (Triagem Fase 3, obstétrica)'),
  ('migracao-ps-faixas-pediatricas.sql', 'PRONTO-SOCORRO — Faixas pediátricas de referência (Triagem Fase 3, peds)'),
  ('migracao-ps-origem-elo.sql', 'PRONTO-SOCORRO — origem da chegada + elo forte PS → leito'),
  ('migracao-ps-salas-censo.sql', 'PRONTO-SOCORRO — estrutura real das vagas + regra de censo'),
  ('migracao-ps-salas.sql', 'PRONTO-SOCORRO — Mapa de salas (Emergência / Observação / Sala Vermelha)'),
  ('migracao-ps-triagem-tipo.sql', 'PRONTO-SOCORRO — Tipo de triagem (Adulto / Obstétrica / Pediátrica)'),
  ('migracao-registro-de-migracoes.sql', 'REGISTRO DE MIGRAÇÕES — cada uma passa a se anotar ao rodar'),
  ('migracao-rls-leitura.sql', 'Regenere com:  node supabase/gerar-rls.mjs'),
  ('migracao-sigtap-valores.sql', 'Regenere com:  node supabase/importar-aih.mjs <arquivo.dbc> [·cnes N]'),
  ('migracao-sigtap.sql', 'SIGTAP — tabela de procedimentos do SUS (Tier 1 — Fase 4: Faturamento)'),
  ('migracao-suprimentos-ajuste-estorno.sql', 'SUPRIMENTOS — ajuste de inventário rastreável e estorno com vínculo'),
  ('migracao-suprimentos-alcada.sql', 'SUPRIMENTOS — alçada de aprovação de compra'),
  ('migracao-suprimentos-aprovacao.sql', 'SUPRIMENTOS — Aprovação de pedidos de compra pela matriz'),
  ('migracao-suprimentos-cotacao.sql', 'SUPRIMENTOS — Cotação de compra (comparar preços entre fornecedores)'),
  ('migracao-suprimentos-faseA.sql', 'SUPRIMENTOS (Estoque & Compras) — Fase A'),
  ('migracao-suprimentos-faseB.sql', 'SUPRIMENTOS — Fase B: requisições de materiais pelos setores'),
  ('migracao-suprimentos-faseC.sql', 'SUPRIMENTOS — Fase C: pedidos de compra'),
  ('migracao-suprimentos-integridade.sql', 'SUPRIMENTOS — integridade do saldo (travas duras no banco)'),
  ('migracao-suprimentos-inventario.sql', 'SUPRIMENTOS — Inventário cíclico + custo por entrada + código de barras'),
  ('migracao-suprimentos-ponto-de-pedido.sql', 'SUPRIMENTOS — Ponto de pedido: prazo de entrega por fornecedor'),
  ('migracao-suprimentos-seed.sql', 'SUPRIMENTOS — Seed do catálogo (~120 materiais comuns de hospital)'),
  ('migracao-suprimentos-unidade-compra.sql', 'SUPRIMENTOS — unidade de compra × unidade de consumo')
)
select
  case when a.arquivo is null then '>>> FALTA — rode este' else 'ok' end as situacao,
  e.arquivo,
  e.o_que_faz,
  to_char(a.aplicada_em, 'DD/MM/YYYY HH24:MI') as quando,
  a.aplicada_por as quem
from esperadas e
left join public.migracoes_aplicadas a on a.arquivo = e.arquivo
order by situacao, e.arquivo;

-- ── e o contrário: rodou algo que não está mais no repositório? ──
-- Não é erro: pode ser migração antiga renomeada. Mas vale saber.
select a.arquivo as registrada_mas_sem_arquivo,
       to_char(a.aplicada_em, 'DD/MM/YYYY') as quando, a.aplicada_por as quem
from public.migracoes_aplicadas a
where a.arquivo not in ('migracao-agenda-confirmacao.sql', 'migracao-agenda-remarcacao.sql', 'migracao-agenda-vaga-por-profissional.sql', 'migracao-atendimento-agenda.sql', 'migracao-atendimento-ciclo.sql', 'migracao-atendimento-fase2.sql', 'migracao-atendimento-faturamento.sql', 'migracao-atendimento-fk.sql', 'migracao-atendimento-recepcao.sql', 'migracao-atendimento-responsavel.sql', 'migracao-auditoria-atribuivel.sql', 'migracao-enf-escalas-lpp.sql', 'migracao-enf-sae.sql', 'migracao-episodio-id-tipo.sql', 'migracao-farmacia-clinica-fase1.sql', 'migracao-farmacia-clinica-fase2.sql', 'migracao-farmacia-clinica-fase3.sql', 'migracao-farmacia-custos.sql', 'migracao-farmacia-estorno-inventario.sql', 'migracao-farmacia-faseA.sql', 'migracao-farmacia-faseB.sql', 'migracao-farmacia-intervencoes.sql', 'migracao-farmacia-lote-vencido.sql', 'migracao-farmacia-nao-padronizados.sql', 'migracao-farmacia-preparo-exige-baixa.sql', 'migracao-farmacia-preparo.sql', 'migracao-farmacia-seed.sql', 'migracao-faturamento-remessa.sql', 'migracao-leitos-kanban-metas.sql', 'migracao-leitos-nir-regulacao.sql', 'migracao-leitos-saida-setor.sql', 'migracao-nsp-capacitacoes.sql', 'migracao-nsp-comunicados.sql', 'migracao-nsp-incidentes.sql', 'migracao-nsp-metas.sql', 'migracao-nsp-protocolos.sql', 'migracao-nsp-rca-plano.sql', 'migracao-pacientes-busca.sql', 'migracao-pacientes-identificacao.sql', 'migracao-pacientes-municipio-ibge.sql', 'migracao-pacientes-nacionalidade-etnia.sql', 'migracao-pacientes-obito.sql', 'migracao-pacientes-recem-nascido.sql', 'migracao-pacientes-unificacao.sql', 'migracao-pep-acessos.sql', 'migracao-pep-categoria-profissional.sql', 'migracao-pep-episodio-retroativo.sql', 'migracao-pep-fase1.sql', 'migracao-pep-fase3.sql', 'migracao-pep-perfis-update.sql', 'migracao-pep-sinais-spo2.sql', 'migracao-perfis-acesso.sql', 'migracao-perfis-auditoria-diretor.sql', 'migracao-perfis-faturamento.sql', 'migracao-perfis-nsp.sql', 'migracao-protocolos-avc.sql', 'migracao-protocolos-iam.sql', 'migracao-protocolos-tev.sql', 'migracao-protocolos.sql', 'migracao-ps-checagem-medicacao.sql', 'migracao-ps-comorbidades.sql', 'migracao-ps-faixas-obstetricas.sql', 'migracao-ps-faixas-pediatricas.sql', 'migracao-ps-origem-elo.sql', 'migracao-ps-salas-censo.sql', 'migracao-ps-salas.sql', 'migracao-ps-triagem-tipo.sql', 'migracao-registro-de-migracoes.sql', 'migracao-rls-leitura.sql', 'migracao-sigtap-valores.sql', 'migracao-sigtap.sql', 'migracao-suprimentos-ajuste-estorno.sql', 'migracao-suprimentos-alcada.sql', 'migracao-suprimentos-aprovacao.sql', 'migracao-suprimentos-cotacao.sql', 'migracao-suprimentos-faseA.sql', 'migracao-suprimentos-faseB.sql', 'migracao-suprimentos-faseC.sql', 'migracao-suprimentos-integridade.sql', 'migracao-suprimentos-inventario.sql', 'migracao-suprimentos-ponto-de-pedido.sql', 'migracao-suprimentos-seed.sql', 'migracao-suprimentos-unidade-compra.sql')
order by a.arquivo;

-- ── qual banco é este? ──────────────────────────────────────
-- As duas abas do SQL Editor são idênticas; a única diferença visível é
-- uma string na barra de endereço.
select
  case when (select count(*) from public.pacientes) >= 40
       then 'DEMO (banco de teste)' else 'PRINCIPAL (hospital)' end as banco,
  (select count(*) from public.pacientes) as pacientes,
  (select count(*) from public.migracoes_aplicadas) as migracoes_registradas;
