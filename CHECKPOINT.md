# 📍 Ponto de restauração — checkpoint-v13

Este é um **ponto seguro** do projeto. Se alguma mudança futura quebrar algo,
dá pra voltar exatamente para este estado.

- **Tag Git mais recente:** `checkpoint-v13` (anteriores: `checkpoint-v12` … `checkpoint-v1`)
- **Data:** 2026-07-17
- **Publicado e funcionando** no HNSN (`medflow-hnsn.vercel.app`).
- ⚠️ **Banco do demo congelado** (decisão de 2026-07-16): trabalhamos só no HNSN.
  O site demo recebe o código novo, mas sem as migrações de banco — salvar nas
  telas novas dá erro lá (esperado).

## O que já está pronto neste ponto
- **Login seguro** (Supabase Auth) + permissões por papel + auditoria. Banco trancado por RLS.
- **Atendimentos** por especialidade, com sincronização entre computadores.
- **Giro de Leitos — Fase 1:** painel de leitos (livre/ocupado/interditado), internação
  (iniciais+prontuário, CID, diária de AIH), previsão de alta e sinaleira 🟢🟡🔴.
- **Giro de Leitos — Fase 2:** fluxo de higienização com cronômetro, tempos de
  solicitado/disponibilizado/pronto/entrada e painel 📊 de indicadores.
- **Sugestão de dias por CID** (tabela de referência editável).
- **Multi-hospital:** mesmo código serve vários hospitais, cada um com seu banco
  (isolamento físico). Nome por `VITE_HOSPITAL_*`. Ver [ONBOARDING.md](ONBOARDING.md).
- **Barra lateral:** especialidades agrupadas na aba **Ambulatório** (expansível).
- **Fase 3 — Modo claro/escuro** (botão 🌙/☀️, tema via CSS variables, salvo por navegador).
- **Fase 3 — Visão Geral = Centro de Monitoramento:** ocupação global, giro, permanência,
  **alertas por setor** (com fila + "restringir"), **fila de solicitações de leito**
  (origem→destino, tempo de espera) e metas das especialidades. Setores geridos em
  Giro de Leitos → 🏷️ Setores; cada leito tem um seletor de setor.
- **💊 Tratamento sugerido por CID:** cada referência de CID pode ter um texto de
  tratamento (base na literatura, revisado pela equipe). Aparece no 📚 Referências
  de CID e no modal de internação ao digitar o CID. 8 CIDs pré-preenchidos no HNSN.
- **⏳ Fila de espera separada da ocupação:** a lista de espera por leito não conta
  mais na % de ocupação do setor; aparece como selo âmbar com tempo de espera.
- **🦠 Aba SCIH — Fase A:** precauções/isolamentos (aéreo/contato/gotículas, base
  Anvisa/CDC), sinalização de isolamento por leito (selo + seletor no card),
  cadastro de casos de vigilância (cultura, germe, multirresistente, antibiótico,
  dias de ATB) com contagem de dias.
- **🦠 Aba SCIH — Fase B:** base de germes (🧬) com embasamento literário; ao digitar
  o germe no caso, sugere o isolamento e marca multirresistente. 14 germes pré-carregados.
- **🦠 Aba SCIH — Fase C:** alternador Vigilância | Indicadores. Lançamento mensal
  manual (exames, culturas, higiene de mãos, PAV, cirurgias limpas+ISC, antimicrobiano
  DOT, treinamentos), taxas calculadas automaticamente, tendência dos últimos meses
  e relatório do mês (imprimir/PDF) para a CCIH.
- **✨ Rebrand VALENTRAX (Healthcare Operations):** nova marca "Inteligência para o
  fluxo hospitalar" — logo hub de correntes convergindo no núcleo, login corporativo
  azul-marinho, cabeçalho com hospital à direita, favicon/título novos e relatórios
  assinados pela Valentrax.
- **✨ Identidade interna corporativa:** tema escuro em azul-marinho e claro em
  cinza-frio; ícones SVG de linha na barra lateral (sem emojis decorativos no app);
  paleta de gráficos categórica validada por script (contraste + daltonismo):
  teal/azul/âmbar/índigo/rosé; botões secundários neutros; cores de status
  (verde/âmbar/vermelho) reservadas para semântica real.
- **🏥 Pronto-Socorro (1º módulo do HIS por processos):** chegada → triagem com
  classificação de risco Manchester (guia embutido) → fila por prioridade com
  cronômetro contra o tempo-alvo (alerta de estouro) → atendimento → desfecho.
  Triagem coleta **sinais vitais** (PA, FC, FR, SpO2, temp, dor, AVPU, glicemia) e
  **sugere a classificação automaticamente** pelos discriminadores (selo SUGERIDA;
  decisão final da triadora; aviso pediátrico <13 anos desativa a sugestão).
  Reavaliação com histórico de aferições (ps_sinais append-only, sugerida × escolhida)
  e indicadores do dia (distribuição por cor, % no tempo-alvo, matriz sóbria).
  Desfecho "Internação" abre a solicitação de leito
  automaticamente — primeira
  **jornada do paciente ponta a ponta**: PS → fila → leito → alta → higienização.
  Indicadores: porta→triagem, permanência média, atendidos hoje. Testado e validado.
- **📋 Paciente 360 (embrião do prontuário eletrônico):** busca por prontuário/iniciais,
  cadastro mínimo (LGPD), linha do tempo automática agregando PS + internações +
  altas + SCIH + evoluções, alertas sentinela, evoluções multiprofissionais
  imutáveis (sem UPDATE/DELETE no banco) com ditado por voz (pt-BR) e **resumo de
  passagem de plantão** gerado localmente (gratuito, dados não saem do navegador;
  versão IA dormante em supabase/functions). Testado.
- **🔪 Bloco Cirúrgico (completo, A+B+C):** salas com reserva e detecção de conflito,
  agenda com materiais/OPME, mapa cirúrgico do dia, check-in, checklist de Cirurgia
  Segura da OMS (Sign In/Time Out/Sign Out com itens oficiais), tempos cirúrgicos,
  RPA com cronômetro, cancelamento com motivo padronizado e indicadores (ocupação
  de salas, taxa/motivos de cancelamento, produtividade por cirurgião, adesão ao
  checklist). Testado e validado.

## Como VOLTAR para este ponto (restaurar)

### Reverter o código para o checkpoint
```bash
git fetch --tags
git reset --hard checkpoint-v13
git push --force-with-lease origin main
```
Em ~1 min a Vercel republica os dois sites neste estado. ⚠️ Descarta o que foi feito
*depois* do checkpoint (é o objetivo de "voltar").

### Sem apagar nada — branch a partir do checkpoint
```bash
git fetch --tags
git checkout -b recuperacao checkpoint-v13
```

## ⚠️ Importante: código ≠ dados
Este checkpoint salva o **código**. Ele **não** desfaz alterações nos **dados**
(atendimentos, leitos), que ficam no Supabase. Para proteger os dados, faça
**backup do banco** — ver a pasta local `backups/` (peça "faz um backup dos dados").

## Pendências conhecidas (não urgentes)
- Equipe médica revisar os 8 textos de tratamento por CID (editáveis no 📚).
- **DEMO congelado**: banco sem as migrações da Fase 3 pt2 e do tratamento por CID.
  Se um dia voltarmos a usar o demo, rodar as migrações acumuladas antes.
- 2 registros falsos do AQUARIO no histórico do HNSN (leitos_saidas/leitos_turnover),
  se o SQL de limpeza ainda não foi rodado.

## Marcos incluídos (mais recentes no topo)
- `329e8dc` 🚑 Pacote triagem — aviso pediátrico, reavaliação com histórico, indicadores
- `a01445b` 🚑 Triagem com sinais vitais + sugestão automática de Manchester
- `ab00284` 🔪 Bloco Cirúrgico Fase C — indicadores (ocupação, cancelamentos, produtividade)
- `0a48ef5` 🔪 Bloco Cirúrgico Fase B — check-in, checklist OMS, tempos, RPA
- `8ccf7b8` 🔪 Bloco Cirúrgico Fase A — agenda, mapa por sala, cancelamentos
- `d832105` 📋 Resumo de passagem de plantão gratuito (local) no Paciente 360
- `45472e5` 📋 Paciente 360 — registro clínico integrado (timeline + evoluções + voz)
- `c6d1c0d` 🏥 Pronto-Socorro — triagem Manchester + jornada do paciente
- `dc8b5a9` 🎨 paleta de gráficos profissional validada
- `225b70e` 🎨 rebrand profundo — paleta marinho + interface sem emojis
- `82e2604` ✨ rebrand Valentrax — marca, login, cabeçalho, favicon
- `0aebdf9` 🦠 SCIH Fase C — indicadores mensais + dashboard + relatório
- `2678bdd` 🦠 SCIH Fase B — base de germes com embasamento + sugestão de isolamento
- `8852264` 🦠 SCIH Fase A — isolamentos por leito + casos de vigilância
- `1d97345` ⏳ fila de espera separada da ocupação do setor
- `9b4ca54` 💊 Tratamento sugerido por CID (referências + modal de internação)
- `baabe17` Fase 3 pt2 — Centro de Monitoramento (setores, solicitações, alertas)
- `ebc40d3` Fase 3 pt1 — modo claro/escuro
- `39bba1a` aba "Ambulatório" expansível · `cb71266` Giro de Leitos Fase 2
- `4753e82` multi-hospital · `e65ea2f` sugestão de CID · `cb8b7a7` Giro de Leitos Fase 1
- (histórico completo: `git log`)
