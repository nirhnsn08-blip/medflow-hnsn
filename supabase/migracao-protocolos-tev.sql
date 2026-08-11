-- ===========================================================
-- PROTOCOLOS CLINICOS -- Fase 3d: TEV / profilaxia (seed do template)
--
-- So semeia o template do TEV em prot_catalogo (as tabelas vieram na 3a).
-- TEV nao e bundle agudo: e uma AVALIACAO (escore de Padua) de todo internado.
-- Os "passos" aqui sao os FATORES de Padua (com pontos), nao etapas com relogio.
-- A estrutura fixa dos fatores e o corte (>=4) vivem no motor/catalogo JS; este
-- seed existe para o status "em validacao" e o registro do protocolo no banco.
--
-- Aditiva e idempotente. Rodar no SQL Editor -- DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar nao sobrescreve edicoes.
-- ===========================================================

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('tev',
   'Profilaxia de TEV no internado',
   'tromboembolismo',
   '{"tipo":"internacao","obs":"Rastreio de todo internado (nao e evento agudo)"}'::jsonb,
   '[
      {"chave":"cancer","rotulo":"Cancer ativo","pontos":3},
      {"chave":"tev_previo","rotulo":"TEV previo (exceto trombose venosa superficial)","pontos":3},
      {"chave":"mobilidade","rotulo":"Mobilidade reduzida (repouso >= 3 dias)","pontos":3},
      {"chave":"trombofilia","rotulo":"Trombofilia conhecida","pontos":3},
      {"chave":"trauma_cirurgia","rotulo":"Trauma e/ou cirurgia recente (<= 1 mes)","pontos":2},
      {"chave":"idade","rotulo":"Idade >= 70 anos","pontos":1},
      {"chave":"cardio_resp","rotulo":"Insuficiencia cardiaca e/ou respiratoria","pontos":1},
      {"chave":"iam_avc","rotulo":"IAM e/ou AVC isquemico","pontos":1},
      {"chave":"infeccao_reuma","rotulo":"Infeccao aguda e/ou doenca reumatologica","pontos":1},
      {"chave":"obesidade","rotulo":"Obesidade (IMC >= 30)","pontos":1},
      {"chave":"hormonio","rotulo":"Terapia hormonal em curso","pontos":1}
    ]'::jsonb,
   null,
   'Escore de Padua; ACCP; SBACV',
   'em_validacao')
on conflict (chave) do nothing;

select count(*) as tev_templates from public.prot_catalogo where chave = 'tev';
