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
}))
