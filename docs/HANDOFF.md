# 🤝 Handoff — Valentrax (progresso até checkpoint-v27)

Documento de passagem para retomar o trabalho num **novo chat**. Resumo de onde
estamos, como continuar e o que falta. Detalhes completos em
[CHECKPOINT.md](../CHECKPOINT.md).

## Onde estamos
- **Marca:** Valentrax Healthcare Operations (repo/URLs continuam `medflow-*`).
- **App:** React + Vite, arquivo único `src/App.jsx` (JS/JSX, sem TypeScript).
- **Back-end:** Supabase (Auth + Postgres + REST). Deploy Vercel a partir do `git push` em `main`.
- **Ponto seguro atual:** **`checkpoint-v27`** — publicado e funcionando em `medflow-hnsn.vercel.app`.
- **Banco DEMO congelado** desde 2026-07-16: trabalhar só no **HNSN**.

## Ciclo de trabalho (importante)
1. Editar `src/App.jsx` (e `supabase/schema.sql`).
2. Se a mudança usa **coluna/tabela nova**, entregar o **SQL de migração** → o usuário
   roda no **Supabase do HNSN** (SQL Editor) → confirma → **só então** `git push`.
3. `git push origin main` → Vercel publica → verificar ao vivo (o build valida o código;
   se falhar, o deploy anterior continua no ar).
4. Ao concluir uma etapa: oferecer atualizar o **checkpoint** (tag git + CHECKPOINT.md).
- **Testar escrita** de features novas: no HNSN, no uso real (o usuário faz). Nunca dar
  alta/baixa em leitos reais por seletor de UI.

## Módulos prontos
- **Pronto-Socorro** (triagem Manchester + jornada do paciente + prescrição estruturada).
  ⚠️ Desfecho "Internação" com leito escolhido agora **reserva** o leito (não ocupa);
  a chegada é confirmada no Mapa de leitos ("✓ Chegou — internar").
- **Bloco Cirúrgico** (agenda, checklist OMS, indicadores).
- **SCIH** (A/B/C), **Paciente 360**, **Centro de Monitoramento**.
- **🛏️ GIRO DE LEITOS — reformulado (v26), sem migração de banco:** barra lateral própria
  (Dashboard · Mapa de leitos · Fila de internação · Pacientes · Altas · Transferências
  ext. · Internações · Relatórios & BI · Alertas inteligentes · IA Assistente).
  Destaques: KPIs com giro vs mês anterior e fator de utilização; mapa com chips por
  setor na **ordem fixa** (Emergência, AVC, Posto 1–3, Psiquiatria, UTI) e cards
  corporativos; **6 status** (+ reservado/manutenção/bloqueado externo); transferência
  externa (desfecho=transferencia, destino no motivo — sem coluna nova); BI com Δ mensal
  e PDF; alertas locais; assistente local; **previsão de vagas 24/48h**; **média real de
  permanência por CID** (aprende do histórico); **reserva automática do PS**; **Modo TV**
  (painel de parede, refresh 60s, Esc sai); **Kanban de alta segura** (checklist de
  pendências + turno, colunas automáticas); **Metas por setor** (farol no BI);
  **Motivo da espera na fila** (gargalos). Migração: `migracao-leitos-kanban-metas.sql`.
- **FARMÁCIA — completa**, com barra lateral própria (cores Valentrax):
  - **Dashboard** · **Prescrições** (análise clínica + score) · **Solicitações** (fluxo de
    preparo com bipe/notificação) · **Dispensações** (fila priorizada + filtros NoHarm) ·
    **Intervenção** farmacêutica · **Estoque** (lote/validade FEFO + **previsão de demanda
    7 dias**) · **Interações** · **Controlados** (livro Portaria 344) · **Não padronizados**
    (trazidos pela família) · **Relatórios & BI** (ABC, top 5, prescrição por status, custos,
    PDF) · **Assistente AI** (local/grátis, por palavras-chave).
  - **Farmácia Clínica = motor de 9 alertas** (dose máx, interação, incompatibilidade em Y,
    alergia + reatividade cruzada, duplicidade, tempo de tratamento, ajuste renal/hepático,
    idoso Beers, criança, sonda) + **score de prescrição 0–3** (local).
  - **Refino (v25):** a intervenção do farmacêutico **avisa o prescritor no PS** (banner com
    problema/conduta; médico responde aceita/não aceita, fecha o ciclo, com bipe). Assistente
    AI ampliado (panorama, zerados, consumo por classe, dispensações mês/hoje, catálogo,
    validade detalhada). **Sem tabela nova.**

## Migrações já rodadas no HNSN (referência p/ recriar do zero)
Na pasta `supabase/` (rodar na ordem se precisar montar um banco novo):
`schema.sql` (base) → `migracao-farmacia-faseA.sql` → `migracao-farmacia-seed.sql` →
`migracao-farmacia-faseB.sql` → `migracao-farmacia-clinica-fase1.sql` →
`migracao-farmacia-clinica-fase2.sql` → `migracao-farmacia-clinica-fase3.sql` →
`migracao-farmacia-preparo.sql` → `migracao-farmacia-custos.sql` →
`migracao-farmacia-nao-padronizados.sql` → `migracao-farmacia-intervencoes.sql` →
`migracao-leitos-kanban-metas.sql` (Kanban de alta + metas por setor + motivo da espera).
(O `schema.sql` já contém tudo consolidado para uma instalação nova, EXCETO as colunas
de `migracao-leitos-kanban-metas.sql` — rodar essa migração à parte por enquanto.)

## Decisões que valem manter
- **Custo zero:** priorizar soluções locais/gratuitas; IA paga só como opcional com custo
  estimado (o usuário escolheu **assistente local**, sem LLM).
- **Visual BI corporativo discreto** (sem fundos coloridos; cor em pontos/bordas/acentos);
  cores Valentrax turquesa/azul/cinza; sem emojis decorativos (só funcionais).
- **Registros clínicos imutáveis** (evoluções, prescrições, kardex, intervenções são
  append-only / não editáveis).

## Próximas frentes (mapa do HIS, ainda não feitas)
- **Giro de Leitos — evoluções possíveis:** apuração de permanência/giro **por setor**
  (hoje `leitos_saidas` não guarda o setor da alta — exige coluna nova) para dar farol
  real às metas de permanência/giro; métrica "altas antes das 10h" (usar hora de `disp_em`).
- **Painel do PS no Monitoramento** (Visão Geral) — menor esforço, sem tabela nova.
- **Faturamento (AIH/SUS)** — módulo grande.
- **Modo autodidático** (ajuda/onboarding contextual).
- Refinos possíveis na Farmácia: custo por lote/compra (em vez de custo unitário).
  (Feitos em v25: notificar o prescritor da intervenção no PS · assistente com mais intents.)
- Alinhar o **Centro de Monitoramento** aos status novos de leito (manutenção/bloqueado
  hoje não descontam da ocupação lá — só no módulo Giro de Leitos).

## Como restaurar este ponto
```bash
git fetch --tags
git reset --hard checkpoint-v27
git push --force-with-lease origin main
```
