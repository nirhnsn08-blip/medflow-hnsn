# Adicionar um novo hospital (multi-hospital)

O MedFlow usa **1 código-fonte** (este repositório) que atende **vários hospitais**,
cada um com **banco de dados totalmente separado** — isolamento físico, nenhum
hospital enxerga o dado do outro. É o modelo mais seguro e adequado à **LGPD**.

```
                      ┌────────────────────────────┐
   1 repositório  ──► │ Deploy Hospital A (Vercel)  │ ─► Supabase A (banco só do A)
   (mesmo app)        ├────────────────────────────┤
                 ──►  │ Deploy Hospital B (Vercel)  │ ─► Supabase B (banco só do B)
                      └────────────────────────────┘
```

Cada `git push` atualiza **todos** os hospitais (cada deploy compila com as suas
próprias variáveis). Os dados nunca se misturam porque cada um tem seu banco.

---

## Checklist para cada hospital novo (~15 min)

### 1) Criar o banco (Supabase)
1. **supabase.com → New project**. Dê um nome (ex.: `medflow-hospitalX`).
2. **Região:** prefira **South America (São Paulo)** — mantém os dados no Brasil (LGPD).
3. Guarde a senha do banco. Aguarde provisionar (~2 min).

### 2) Criar as tabelas + segurança
1. **SQL Editor → New query**, cole **todo** o [`supabase/schema.sql`](supabase/schema.sql) e **Run**.
2. Rode também o bloco de seed de CIDs (opcional) — ver README/histórico.

### 3) Configurar o login (Authentication → Providers/Settings)
- **Disable signup:** ON (ninguém se cadastra sozinho)
- **Confirm email / autoconfirm:** ON (contas criadas já entram)
- **JWT expiry:** 604800 (7 dias) — menos re-login
- **Site URL:** a URL do deploy desse hospital (passo 5)

### 4) Criar os usuários (Authentication → Users → Add user)
- E-mail no formato `usuario@hnsn.local` (troque o domínio se quiser).
- Marque **Auto Confirm**.
- Em **User Metadata**, defina o papel, ex.: `{ "role": "adm_master" }`
  (papéis: `adm_master`, `adm_silver`, `analista`, `visualizador`).

### 5) Publicar o site (Vercel)
1. **Add New → Project** → importe **este mesmo repositório** do GitHub.
2. Em **Environment Variables**, cadastre:

   | Variável | Valor |
   |----------|-------|
   | `VITE_SUPABASE_URL`   | Project URL do Supabase **desse** hospital |
   | `VITE_SUPABASE_KEY`   | chave **publishable/anon** desse hospital |
   | `VITE_HOSPITAL_SIGLA` | ex.: `HSCX` |
   | `VITE_HOSPITAL_NOME`  | ex.: `Hospital Santa Casa X` |

3. **Deploy.** A URL fica como `medflow-hospitalX.vercel.app` (ou domínio próprio).

### 6) Pronto
Entregue a URL + os logins ao hospital. O banco é exclusivo deles.

---

## Notas de segurança / LGPD
- **Isolamento físico:** cada hospital = 1 banco. Não há regra compartilhada que
  possa "vazar" — é impossível um cliente consultar o outro.
- **Dados no Brasil:** use a região São Paulo no Supabase de cada hospital.
- **Titularidade:** se o hospital exigir, o projeto Supabase pode ser criado **na
  conta dele** — assim ele é o dono/controlador do próprio dado.
- **Acesso:** login por Supabase Auth (senha com hash no servidor), regras por papel,
  e trilha de **auditoria** por hospital.
- **Chaves:** a chave `publishable/anon` pode ficar exposta (é pública por design);
  a `service_role` **nunca** vai para o app.

## Atualizações
Um `git push` na branch `main` recompila e publica **todos** os hospitais.
Se o `schema.sql` mudar (novas tabelas/colunas), rode o SQL novo em **cada** banco.
