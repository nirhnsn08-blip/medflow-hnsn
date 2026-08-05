-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS — Fase 3c: AVC (seed do template)
--
-- Só semeia o template do AVC em prot_catalogo (as tabelas vieram na
-- migracao-protocolos.sql da 3a). Pacote porta→TC: TC de crânio ≤ 25 min.
-- Gatilho por queixa (texto livre) → sugestão; acionamento manual.
--
-- ⚠️ O dado mais decisivo do AVC é o INÍCIO DOS SINTOMAS ("último visto bem"):
-- define a janela de trombólise (≤ 4,5h). Ele é capturado no acionamento e
-- guardado em prot_ativacoes.gatilho_ref (jsonb) — a janela de 4,5h é constante
-- clínica no motor (janelaTerapeutica), não precisa de coluna nem de config.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('avc',
   'AVC — porta→TC/trombólise',
   'neurologico',
   '{"tipo":"queixa","termos":["déficit neurológico","fraqueza","boca torta","fala alterada"],"obs":"Sugestão pela queixa; acionamento manual. Checar SEMPRE o início dos sintomas (janela de trombólise <= 4,5h)."}'::jsonb,
   '[
      {"chave":"codigo_avc", "rotulo":"Acionar código AVC + glicemia capilar",          "alvo_min":5,  "ordem":1, "critico":false},
      {"chave":"tc",         "rotulo":"TC de crânio sem contraste",                      "alvo_min":25, "ordem":2, "critico":true},
      {"chave":"laudo",      "rotulo":"Laudo da TC",                                     "alvo_min":45, "ordem":3, "critico":true},
      {"chave":"nihss",      "rotulo":"NIHSS (gravidade do déficit)",                    "alvo_min":20, "ordem":4, "critico":false},
      {"chave":"reperfusao", "rotulo":"Avaliar trombólise/trombectomia (porta->agulha)","alvo_min":60, "ordem":5, "critico":true}
    ]'::jsonb,
   25,
   'AHA/ASA; Linha de Cuidado do AVC (Ministério da Saúde)',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS 3c: template AVC ok — ' || (select count(*) from public.prot_catalogo where chave = 'avc') || ' linha(s)' as resultado;
