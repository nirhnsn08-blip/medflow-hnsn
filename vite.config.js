import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Porta fixa por ambiente — 5173 é o hospital, 5174 é o banco de teste.
//
// Antes as duas disputavam a 5173 e o Vite escorregava para a próxima porta
// livre em silêncio. Isso invertia a proteção: com o demo já ocupando a 5173,
// um `npm run dev` distraído subia o HOSPITAL na 5174 — justamente a porta
// que a equipe aprendeu a tratar como segura.
//
// `strictPort` é o que faz a regra valer: se a porta estiver ocupada, o Vite
// PARA com erro em vez de mudar de porta por conta própria. Melhor recusar a
// subir do que subir no lugar errado.
//
// A faixa laranja no topo da tela continua sendo a confirmação final de qual
// banco está em uso — a porta é o primeiro aviso, não o único.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    port: mode === 'demo' ? 5174 : 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      output: {
        // O bundle era UM arquivo de ~1,8 MB, rebaixado inteiro a cada
        // deploy. Como o `App.jsx` muda quase todo dia e as bibliotecas
        // quase nunca, o hospital rebaixava React e recharts de novo a cada
        // publicação — em conexão ruim, isso é a diferença entre a tela
        // abrir e a recepcionista achar que travou.
        //
        // Separar por biblioteca deixa os vendors em cache do navegador
        // entre um deploy e outro. Não é code-splitting por rota (isso
        // exigiria mexer no App.jsx, que é território compartilhado) — é a
        // metade do ganho pela fração do risco.
        // Por CAMINHO, e não por nome de pacote: a forma declarativa
        // (`{ react: ['react'] }`) produziu um chunk de 0,03 kB porque o
        // React já tinha sido puxado para dentro do chunk principal pelo
        // grafo de imports. Testar o `id` pega a árvore inteira.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/[\\/]node_modules[\\/](recharts|d3-|victory|decimal)/.test(id)) return 'charts';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/.test(id)) return 'react';
          return 'vendor';
        },
      },
    },
    // O aviso padrão dispara em 500 kB e apontava para o bundle único.
    // Com os vendors separados, o que sobra é o código do app; manter o
    // aviso num teto que ele ainda ultrapassa serve de lembrete de que a
    // modularização do App.jsx continua pendente.
    chunkSizeWarningLimit: 700,
  },
}))
