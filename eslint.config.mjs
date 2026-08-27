// ═══════════════════════════════════════════════════════════
// UMA REGRA SÓ: NENHUM NOME SOLTO
//
// 🔴 POR QUE ISTO EXISTE, COM DATA E NOME
// No PR #151 o `vite build` passou limpo e as 1.881 asserções passaram —
// com a tela quebrada. `valoresIniciais` era usado no `App.jsx` e não
// estava no import. O erro só apareceu como `ReferenceError` na hora de
// abrir o modal do desfecho, na tela, com o paciente na frente.
//
// Nem o bundler nem o Vitest pegam isso: o Rollup não resolve identificador
// livre (assume global), e nenhum dos 61 arquivos de teste renderiza JSX.
// O sistema inteiro dizia "verde" e a porta do Pronto-Socorro não abria.
//
// ⚠️ POR QUE UMA REGRA E NÃO UM PRESET
// `App.jsx` tem 17,8 mil linhas e nunca passou por lint. Ligar o
// `recommended` traria centenas de avisos de estilo, e a lista viraria
// ruído que ninguém lê — a mesma fadiga de alarme que esta casa trata
// como bug de primeira classe. Uma regra que aponta um defeito REAL e
// cala no resto é uma regra que alguém obedece.
//
// Quando quiser apertar mais, acrescente UMA regra por vez, e só depois de
// zerar a anterior.
//
// Rode com:  npm run lint
// ═══════════════════════════════════════════════════════════

import globals from "globals";

export default [
  {
    files: ["src/**/*.{js,jsx}", "supabase/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,       // os geradores em supabase/*.mjs
        ...globals.vitest,     // describe/it/expect nos *.test.js
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      // O defeito do PR #151, e o único motivo deste arquivo existir.
      "no-undef": "error",

      // ⚠️ `no-unused-vars` FICA DE FORA, e não por preguiça.
      // Ligada, ela acusou 259 erros — e quase todos eram FALSOS: sem o
      // `eslint-plugin-react`, o ESLint não conta uso dentro de JSX, então
      // todo componente importado aparece como "definido e nunca usado".
      // Uma lista de 259 em que 255 são engano não é um detector, é ruído
      // que ensina a ignorar a lista inteira — inclusive as 4 que
      // importavam. O `no-undef`, sozinho, acusou UM erro, e era real.
      //
      // Para ligá-la depois: instale `eslint-plugin-react` e use
      // `react/jsx-uses-vars`. Uma regra por vez, e só depois de zerar a
      // anterior.
    },
  },
];
