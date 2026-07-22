# 🤝 Handoff — Valentrax (progresso até checkpoint-v40)

Documento de passagem para retomar o trabalho num **novo chat**. Resumo de onde
estamos, como continuar e o que falta. Detalhes completos em
[CHECKPOINT.md](../CHECKPOINT.md).

## Onde estamos
- **Marca:** Valentrax Healthcare Operations (repo/URLs continuam `medflow-*`).
- **App:** React + Vite, arquivo único `src/App.jsx` (JS/JSX, sem TypeScript).
- **Back-end:** Supabase (Auth + Postgres + REST). Deploy Vercel a partir do `git push` em `main`.
- **Ponto seguro atual:** **`checkpoint-v40`** — publicado e funcionando em `medflow-hnsn.vercel.app`.
- **Banco DEMO congelado** desde 2026-07-16: trabalhar só no **HNSN**.
- **Equipe:** mais de uma pessoa desenvolvendo desde 2026-07-21. Ver `docs/GUIA-GIT.md`.

## Ciclo de trabalho (importante)
1. **Sincronizar antes de tudo:** `git fetch` → `git pull --rebase origin main`. A `main`
   diverge quando a outra pessoa mergeia. **Nunca** substituir a pasta local pelo ZIP do
   GitHub — isso apaga `.env`, `node_modules` e trabalho não commitado.
2. Editar `src/App.jsx` (e `supabase/schema.sql`).
3. Se a mudança usa **coluna/tabela nova**, avisar de forma **destacada** que exige
   migração e entregar o **SQL** (idempotente) → o usuário roda no **Supabase do HNSN**
   (SQL Editor) → confirma → **só então** publicar. Quem roda SQL é sempre o usuário.
4. **Publicar por branch + Pull Request** (decisão de 2026-07-21) — não empurrar direto
   na `main`. Fluxo: branch → push da branch → PR → revisão → **merge = vai ao ar na
   Vercel**. O build (`vite build`) valida o código; se falhar, o deploy anterior continua.
5. Ao concluir uma etapa: oferecer atualizar o **checkpoint** (tag git + CHECKPOINT.md +
   este arquivo). A tag só é criada **depois** do merge na `main`.
- **Testar escrita** de features novas: no HNSN, no uso real (o usuário faz). Nunca dar
  alta/baixa em leitos reais por seletor de UI. Cuidado com registros de teste em tabelas
  append-only — ficam para sempre (ver o caso do AQUARIO em CHECKPOINT.md).

## Módulos prontos
- **Pronto-Socorro** (triagem Manchester + jornada do paciente + prescrição estruturada +
  **checagem de medicação administrada**). Barra lateral dupla: TRIAGEM e EMERGÊNCIA (PS).
  ⚠️ Desfecho "Internação" com leito escolhido agora **reserva** o leito (não ocupa);
  a chegada é confirmada no Mapa de leitos ("✓ Chegou — internar").
  ⚠️ **Dispensado ≠ administrado:** a dispensação da Farmácia é baixa de estoque; o
  registro de que o paciente recebeu fica em `ps_administracoes` (append-only), na aba
  **Checagem** do atendimento e na tela **Checagem de medicação** da enfermagem.
- **Bloco Cirúrgico** (agenda, checklist OMS, indicadores).
- **SCIH** (A/B/C), **Paciente 360**, **Centro de Monitoramento**.
- **👤 Usuários (gestão pelo ADM Master):** na aba **Usuários**, o `adm_master` cria
  usuário, edita o perfil (papel) inline, redefine a senha de qualquer um e
  ativa/desativa o acesso (ban reversível). Via **Edge Function `admin-usuarios`**
  (service_role no servidor, valida o JWT e o papel adm_master; nenhuma chave admin
  no navegador). **Sem migração de banco.** Deploy: `supabase functions deploy
  admin-usuarios` — ou dois cliques em `deploy-funcao.bat` (após `npx.cmd --yes
  supabase login` uma vez). ⚠️ Se o front for ao ar antes do deploy da função, a tela
  só mostra um aviso — nada quebra.
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
`migracao-leitos-kanban-metas.sql` (Kanban de alta + metas por setor + motivo da espera) →
`migracao-leitos-saida-setor.sql` (setor na saída → permanência/giro por setor) →
`migracao-suprimentos-faseA.sql` → `-faseB.sql` → `-faseC.sql` → `-seed.sql` →
`migracao-suprimentos-inventario.sql` → `-ponto-de-pedido.sql` → `-cotacao.sql` →
`migracao-ps-salas.sql` → `migracao-ps-salas-censo.sql` (vagas do PS + regra de censo) →
`migracao-ps-origem-elo.sql` (origem da chegada + elo forte PS→fila→leito) →
`migracao-ps-checagem-medicacao.sql` (checagem de medicação administrada).
(O `schema.sql` já contém tudo consolidado para uma instalação nova, EXCETO as colunas
de `migracao-leitos-kanban-metas.sql` e `migracao-leitos-saida-setor.sql` — rodar essas
duas migrações à parte por enquanto.)
Para conferir o estado do banco a qualquer momento: rode `supabase/auditoria-banco.sql`
(somente leitura) no SQL Editor — ele relata tabelas, colunas, RLS, funções e trigger.

## Decisões que valem manter
- **Custo zero:** priorizar soluções locais/gratuitas; IA paga só como opcional com custo
  estimado (o usuário escolheu **assistente local**, sem LLM).
- **Visual BI corporativo discreto** (sem fundos coloridos; cor em pontos/bordas/acentos);
  cores Valentrax turquesa/azul/cinza; sem emojis decorativos (só funcionais).
- **Registros clínicos imutáveis** (evoluções, prescrições, kardex, intervenções são
  append-only / não editáveis).

## Próximas frentes (mapa do HIS, ainda não feitas)
- **Jornada do paciente no PS — blocos que faltam** (roadmap auditado com a usuária
  em 2026-07-22; blocos 1–3 já entregues):
  - **Bloco 4 — notificação ao NIR:** hoje o paciente entra na fila de leito e
    ninguém é avisado; depende de alguém abrir o Giro de Leitos por conta própria.
    É o mesmo tipo de furo que a checagem de medicação fechou. Provável tela/papel.
  - **Bloco 5 — BI de exames separando laboratorial × imagem** (a categoria já é
    gravada em `ps_registros.categoria`, o relatório é que não separa) + aviso de
    **exame pendente** ao registrar o desfecho.
  - Levantados e **ainda não decididos**: reavaliação obrigatória para quem estoura o
    tempo-alvo Manchester; recepção **puxar o paciente do Paciente 360** quando o
    prontuário já existir (evita duplicidade); indicadores **porta→primeira medicação**
    e **porta→primeiro exame**; **GERINT nos dois sentidos** (aceites × transferências).
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
git reset --hard checkpoint-v40
git push --force-with-lease origin main
```
