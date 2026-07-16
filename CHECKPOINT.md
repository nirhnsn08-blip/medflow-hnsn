# 📍 Ponto de restauração — checkpoint-v1

Este é um **ponto seguro** do projeto. Se alguma mudança futura quebrar algo,
dá pra voltar exatamente para este estado.

- **Tag Git:** `checkpoint-v1`
- **Data:** 2026-07-16
- **Está publicado e funcionando** no HNSN (`medflow-hnsn.vercel.app`) e no demo (`medflow-demo.vercel.app`).

## O que já está pronto neste ponto
- **Login seguro** (Supabase Auth) + permissões por papel + auditoria.
- **Banco trancado** por RLS (só quem tem login acessa; nada exposto).
- **Atendimentos** por especialidade, com sincronização entre computadores.
- **Giro de Leitos — Fase 1:** painel de leitos (livre/ocupado/interditado), internação
  (iniciais+prontuário, CID, diária de AIH), previsão de alta e sinaleira 🟢🟡🔴.
- **Giro de Leitos — Fase 2:** fluxo de higienização com cronômetro (alta → higienização →
  pronto → nova internação), tempos de solicitado/disponibilizado/pronto/entrada e
  painel 📊 de indicadores (permanência, giro, tempos médios).
- **Sugestão de dias por CID** (tabela de referência editável).
- **Multi-hospital:** mesmo código serve vários hospitais, cada um com seu banco
  (isolamento físico). Nome configurável por `VITE_HOSPITAL_*`. Ver [ONBOARDING.md](ONBOARDING.md).
- **Barra lateral:** especialidades agrupadas na aba **Ambulatório** (expansível).

## Como VOLTAR para este ponto (restaurar)

### Opção simples — reverter o código para o checkpoint
Na pasta do projeto:
```bash
git fetch --tags
git reset --hard checkpoint-v1
git push --force-with-lease origin main
```
Em ~1 min a Vercel republica os dois sites neste estado. ⚠️ Isso descarta as
mudanças feitas *depois* do checkpoint (é justamente o objetivo de "voltar").

### Opção sem apagar nada — criar um branch a partir do checkpoint
```bash
git fetch --tags
git checkout -b recuperacao checkpoint-v1
```
Abre uma cópia do estado seguro sem mexer no `main`.

## ⚠️ Importante: código ≠ dados
Este checkpoint salva o **código** (o app). Ele **não** desfaz alterações nos
**dados** (atendimentos, leitos), que ficam no Supabase. Para proteger os dados,
o ideal é um **backup do banco** — no Supabase de cada hospital:
*Database → Backups* (ou exportar as tabelas). Posso te guiar nisso quando quiser.

## Commits incluídos neste checkpoint (mais recentes no topo)
- `39bba1a` aba "Ambulatório" expansível
- `cb71266` Giro de Leitos Fase 2 (tempos + indicadores)
- `4753e82` multi-hospital (VITE_HOSPITAL_*)
- `e65ea2f` sugestão de dias por CID
- `cb8b7a7` Giro de Leitos Fase 1
- (histórico completo: `git log`)
