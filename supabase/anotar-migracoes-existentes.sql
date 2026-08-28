-- ============================================================
-- Valentrax — ANOTAR AS MIGRAÇÕES QUE JÁ RODARAM NESTE BANCO
--
-- Rode UMA VEZ por banco, logo depois de migracao-registro-de-migracoes.sql.
--
-- ⚠️ ARQUIVO GERADO — não edite à mão (node supabase/gerar-conferencia.mjs).
--
-- ⚠️ O QUE ELE ASSUME, E COMO CONFERIR ANTES DE ACREDITAR
-- Ele marca as 84 migrações do repositório como aplicadas. A
-- suposição é que o esquema deste banco está completo — razoável num
-- sistema em uso, mas NÃO é fato até alguém olhar.
--
-- Quem responde isso é o auditoria-banco.sql: ele confere, coluna por
-- coluna, se o banco tem tudo o que deveria. RODE ELE ANTES. Se acusar
-- "❌ FALTANDO", NÃO rode este arquivo — a migração correspondente não
-- rodou, e marcá-la como aplicada esconderia justamente o que procuramos.
-- ============================================================

insert into public.migracoes_aplicadas (arquivo, aplicada_por, observacao)
values
  ('migracao-agenda-confirmacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-agenda-remarcacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-agenda-vaga-por-profissional.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-agenda.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-ciclo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-fase2.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-faturamento.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-fk.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-recepcao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-atendimento-responsavel.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-auditoria-atribuivel.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-enf-escalas-lpp.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-enf-sae.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-episodio-id-tipo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-clinica-fase1.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-clinica-fase2.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-clinica-fase3.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-custos.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-estorno-inventario.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-faseA.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-faseB.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-intervencoes.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-lote-vencido.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-nao-padronizados.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-preparo-exige-baixa.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-preparo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-farmacia-seed.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-faturamento-remessa.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-leitos-kanban-metas.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-leitos-nir-regulacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-leitos-saida-setor.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-capacitacoes.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-comunicados.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-incidentes.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-metas.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-protocolos.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-nsp-rca-plano.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-busca.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-identificacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-municipio-ibge.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-nacionalidade-etnia.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-obito.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-recem-nascido.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pacientes-unificacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-acessos.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-categoria-profissional.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-episodio-retroativo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-fase1.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-fase3.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-perfis-update.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-pep-sinais-spo2.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-perfis-acesso.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-perfis-auditoria-diretor.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-perfis-faturamento.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-perfis-nsp.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-protocolos-avc.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-protocolos-iam.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-protocolos-tev.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-protocolos.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-checagem-medicacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-comorbidades.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-faixas-obstetricas.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-faixas-pediatricas.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-origem-elo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-salas-censo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-salas.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-ps-triagem-tipo.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-registro-de-migracoes.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-rls-leitura.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-scih-germes-seed.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-sigtap-valores.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-sigtap.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-ajuste-estorno.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-alcada.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-aprovacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-cotacao.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-faseA.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-faseB.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-faseC.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-integridade.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-inventario.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-ponto-de-pedido.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-seed.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql'),
  ('migracao-suprimentos-unidade-compra.sql', 'anotacao-inicial', 'esquema conferido pelo auditoria-banco.sql')
on conflict (arquivo) do nothing;

select
  case when (select count(*) from public.pacientes) >= 40
       then 'DEMO (banco de teste)' else 'PRINCIPAL (hospital)' end as banco,
  (select count(*) from public.migracoes_aplicadas) as registradas,
  84 as esperadas;
