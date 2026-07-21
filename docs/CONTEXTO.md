# 📄 Contexto do Projeto — Valentrax / MedFlow HNSN

> Resumo de referência para onboarding rápido de novos colaboradores (humanos ou IA).
> Gerado a partir de um raio-x completo do repositório em 2026-07-20.

**Projeto:** Valentrax Healthcare Operations (repo/URLs ainda `medflow-hnsn`) — plataforma web de gestão operacional hospitalar (HIS enxuto) em produção real no Hospital Nossa Senhora de Navegantes.

**O que faz:** Centraliza atendimentos ambulatoriais, giro/ocupação de leitos, pronto-socorro (triagem Manchester), bloco cirúrgico, SCIH (controle de infecção), farmácia clínica (com motor de 9 alertas) e prontuário-resumo do paciente, com BI/indicadores. Multi-hospital por isolamento físico (1 banco Supabase por hospital, região Brasil, por LGPD).

**Stack:** React 18 + Vite 5 (JS/JSX, sem TypeScript) · Recharts · Supabase (Auth + Postgres + REST + Edge Functions em Deno) · deploy automático na Vercel via `git push` em `main` · CI no GitHub só valida build · Edge Function opcional de resumo clínico com Claude (`claude-opus-4-8`).

**Arquitetura:** Todo o front num único `src/App.jsx` de **9.052 linhas**. Acesso ao Supabase via `fetch` REST direto (apikey anon + JWT do usuário). Fallback para localStorage quando offline/sem config. Banco com ~30 tabelas, RLS por papel (`adm_master`/`adm_silver`/`analista`/`visualizador`) via função `my_role()`; registros clínicos append-only (evoluções, prescrições, kardex, auditoria).

**Estágio:** MVP maduro, versionado por checkpoints (atual `checkpoint-v28`, 2026-07-20). Rebrand MedFlow→Valentrax em andamento. Documentação excepcional (README/ONBOARDING/HANDOFF/CHECKPOINT).

**Forças:** Segurança de auth bem pensada (senhas no Auth, service_role só no servidor com revalidação de JWT+papel, sem XSS aparente); isolamento LGPD sólido; imutabilidade clínica; documentação e diário de bordo exemplares.

**Riscos/dívidas:**
1. Monólito de 9k linhas — manutenção e PRs/branches difíceis, conflitos de merge prováveis.
2. **Zero testes automatizados** num sistema clínico/de medicação.
3. Vulnerabilidades de dev em Vite/esbuild + Recharts deprecado.
4. Deploy acoplado a migração SQL manual por hospital (frágil se sair de ordem).
5. CORS `*` nas Edge Functions.
6. Validação de dados clínicos majoritariamente no front.
7. Conformidade LGPD formal (DPA/registro) não evidenciada no repo.

**Primeiros passos ao contribuir:** configurar `.env` (Supabase anon) → `npm run dev`; começar por telas isoladas; prioridades de evolução = modularizar o `App.jsx` e adicionar testes ao motor de farmácia. Não testar escrita em leitos reais de produção. Confirmar com o autor: estado da `main`, existência de staging, plano de migrações e conformidade LGPD.

---

## Perguntas em aberto para o autor
1. Estado real da branch `main` no GitHub vs. produção no HNSN? Fluxo é PR ou push direto?
2. Existe ambiente de staging/banco de teste, ou todo teste de escrita é no HNSN em produção? (Banco DEMO congelado desde 2026-07-16.)
3. Há intenção de modularizar o `App.jsx`, ou o arquivo único é restrição a manter?
4. Plano de migrações entre hospitais — como evitar schema e código fora de sincronia?
5. LGPD: existe registro de tratamento, DPA com hospitais e política de uso da IA com dados clínicos?
