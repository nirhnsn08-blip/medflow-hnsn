# MedFlow HNSN
### Plataforma de Gestão de Atendimentos Ambulatoriais
Hospital Nossa Senhora de Navegantes

---

## 🚀 Como publicar no Vercel (passo a passo)

### Opção A — Pelo site do Vercel (mais fácil, sem instalar nada)

1. Acesse **https://vercel.com** e crie uma conta gratuita (pode entrar com Google)
2. No painel, clique em **"Add New → Project"**
3. Clique em **"Import Third-Party Git Repository"** → ou use o método abaixo sem Git

### Opção B — Upload direto (recomendado para você)

1. Acesse **https://vercel.com/new**
2. Faça login ou crie uma conta gratuita
3. Clique em **"Deploy from CLI"** ou use o drag-and-drop:
   - Acesse https://vercel.com/docs/cli
   - Instale o Vercel CLI: `npm install -g vercel`
   - Na pasta do projeto, rode: `vercel`
   - Siga as instruções — em 2 minutos estará no ar

### Opção C — Via GitHub (mais profissional)

1. Crie uma conta no **https://github.com**
2. Crie um repositório novo chamado `medflow-hnsn`
3. Faça upload de todos os arquivos desta pasta
4. Acesse **https://vercel.com**, conecte sua conta GitHub
5. Importe o repositório `medflow-hnsn`
6. Clique em **Deploy** — pronto!

---

## 🔗 Seu link ficará assim
```
https://medflow-hnsn.vercel.app
```
(ou personalize em Settings → Domains dentro do Vercel)

---

## 👥 Credenciais padrão

| Usuário   | Senha       | Perfil          |
|-----------|-------------|-----------------|
| laura     | hnsn2025    | Administrador   |
| diretor   | diretor123  | Visualizador    |

**Altere as senhas após o primeiro acesso pela aba 👥 Usuários.**

---

## 📁 Estrutura do projeto
```
medflow-hnsn/
├── index.html          ← Página principal
├── package.json        ← Dependências
├── vite.config.js      ← Configuração do build
├── vercel.json         ← Configuração do Vercel
└── src/
    ├── main.jsx        ← Ponto de entrada React
    └── App.jsx         ← Aplicação completa
```

---

Desenvolvido com ❤️ para o Ambulatório HNSN
