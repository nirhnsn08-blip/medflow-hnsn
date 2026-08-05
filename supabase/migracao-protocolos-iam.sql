-- ═══════════════════════════════════════════════════════════
-- PROTOCOLOS CLÍNICOS — Fase 3b: Dor torácica / IAM (seed do template)
--
-- Só semeia o template do IAM em prot_catalogo (as tabelas já vieram na
-- migracao-protocolos.sql da 3a). Pacote porta→ECG: a estrela é o ECG de 12
-- derivações em ≤ 10 min. Gatilho por queixa (texto livre) → sugestão; o
-- acionamento é manual. Passos/alvos editáveis na tela pelo ADM Master.
--
-- Aditiva e idempotente. Rodar no SQL Editor — DEMO primeiro, depois HNSN.
-- ON CONFLICT (chave) DO NOTHING: reexecutar não sobrescreve edições da equipe.
-- ═══════════════════════════════════════════════════════════

insert into public.prot_catalogo (chave, titulo, categoria, gatilho, passos, janela_min, referencia, status) values
  ('iam',
   'Dor torácica / IAM — porta→ECG',
   'cardiologico',
   '{"tipo":"queixa","termos":["dor torácica","precordial","dor no peito"],"obs":"ECG em <= 10 min da chegada; acionamento manual com sugestão pela queixa"}'::jsonb,
   '[
      {"chave":"ecg",        "rotulo":"ECG de 12 derivações",                                                "alvo_min":10, "ordem":1, "critico":true},
      {"chave":"aas",        "rotulo":"AAS 150-300 mg VO (mastigar), se sem contraindicação",                "alvo_min":10, "ordem":2, "critico":true},
      {"chave":"troponina",  "rotulo":"Coletar troponina",                                                   "alvo_min":20, "ordem":3, "critico":true},
      {"chave":"monitor",    "rotulo":"Monitorização + acesso venoso + O2 se SpO2 < 90",                     "alvo_min":10, "ordem":4, "critico":false},
      {"chave":"reperfusao", "rotulo":"Avaliar SCA: com supra de ST -> reperfusão; sem supra -> estratificar","alvo_min":60, "ordem":5, "critico":true},
      {"chave":"analgesia",  "rotulo":"Analgesia / nitrato conforme protocolo",                              "alvo_min":30, "ordem":6, "critico":false}
    ]'::jsonb,
   10,
   'AHA/ACC; Diretriz SBC de Síndromes Coronarianas Agudas',
   'em_validacao')
on conflict (chave) do nothing;

-- Verificação
select 'PROTOCOLOS 3b: template IAM ok — ' || (select count(*) from public.prot_catalogo where chave = 'iam') || ' linha(s)' as resultado;
