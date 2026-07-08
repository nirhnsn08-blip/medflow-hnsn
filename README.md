# MedFlow HNSN
### Plataforma de Gestão de Atendimentos Ambulatoriais
Hospital Nossa Senhora de Navegantes

App em **React + Vite**. Dados no **Supabase**, deploy automático na **Vercel**,
código versionado no **GitHub**.

---

## 🔄 Fluxo de publicação (automatizado)

```
editar o código  →  git push  →  GitHub recebe  →  Vercel publica sozinho ✅
```

No dia a dia, depois de mexer no código, basta:

```bash
git add .
git commit -m "descreva a mudança"
git push
```

Em ~1 min a Vercel publica a nova versão em https://medflow-hnsn.vercel.app
(não precisa mais subir arquivo na mão pelo site do GitHub nem pela Vercel).

---

## 📁 Estrutura
```
medflow-hnsn/
├── index.html              ← Página principal (contém as chaves do Supabase)
├── package.json            ← Dependências
├── vite.config.js          ← Build (Vite)
├── vercel.json             ← Config da Vercel
├── .gitignore / .gitattributes
├── .env.example            ← Modelo de credenciais (uso local opcional)
├── src/
│   ├── main.jsx            ← Ponto de entrada React
│   └── App.jsx             ← Aplicação completa
├── supabase/
│   └── schema.sql          ← Tabelas do banco (referência)
└── .github/workflows/
    └── ci.yml              ← Valida o build a cada push (opcional)
```

---

## 💻 Rodar localmente
```bash
npm install
npm run dev      # abre em http://localhost:5173
npm run build    # gera a versão de produção em /dist
```
> As chaves do Supabase já vêm embutidas no `index.html`, então o app conecta
> ao banco tanto local quanto publicado. (Para usar chaves diferentes em
> desenvolvimento, copie `.env.example` para `.env`.)

---

## 🗄️ Banco de dados (Supabase)
O schema das tabelas (`atendimentos`, `auditoria`) está em
[`supabase/schema.sql`](supabase/schema.sql) — serve de referência/backup.
Rode no **SQL Editor** do Supabase apenas se precisar recriar as tabelas.

---

## 👥 Credenciais padrão do app

| Usuário   | Senha       | Perfil          |
|-----------|-------------|-----------------|
| laura     | hnsn2025    | Administrador   |
| diretor   | diretor123  | Visualizador    |

**Altere as senhas após o primeiro acesso pela aba 👥 Usuários.**

---

Desenvolvido com ❤️ para o Ambulatório HNSN
