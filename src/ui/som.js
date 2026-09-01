// ═══════════════════════════════════════════════════════════
// O AVISO SONORO DA CASA
//
// Saiu do App.jsx, onde se chamava `farmBeep` e morava no meio da Farmácia.
// Não é da Farmácia: quem toca são as Requisições do almoxarifado, os dois
// avisos do Pronto-Socorro (retirada e intervenção) e o preparo da
// Farmácia — três módulos que não se conhecem.
//
// 🔴 O SOM É OPT-IN, E ISSO É REGRA, NÃO PREFERÊNCIA.
// Um posto de trabalho que apita sozinho vira um posto com o som desligado
// no primeiro dia — e aí o aviso que importava também não toca. Quem liga é
// a pessoa, na tela dela, e a escolha fica no navegador dela.
//
// ⚠️ Nada aqui pode estourar. Toca depois de um evento que já aconteceu
// (chegou requisição, saiu prescrição); se o áudio falhar, o trabalho
// segue. Navegador sem AudioContext, aba sem permissão de som, modo
// restrito: tudo cai no `catch` e some.
// ═══════════════════════════════════════════════════════════

const CHAVE = "hnsn_som";

/** A pessoa ligou o som neste navegador? Falha fechada: no silêncio. */
export const somLigado = () => {
  try { return localStorage.getItem(CHAVE) === "1"; } catch { return false; }
};

/** Liga ou desliga, para este navegador. */
export const ligarSom = v => {
  try { localStorage.setItem(CHAVE, v ? "1" : "0"); } catch { /* modo restrito: fica só nesta sessão */ }
};

/**
 * Dois tons curtos (880 Hz, e 1175 Hz quando `duplo`).
 *
 * ⚠️ NÃO confere `somLigado()` — quem chama decide. É de propósito: há
 * chamada que toca por evento novo e chamada que toca ao testar o botão,
 * e misturar as duas decisões aqui esconderia qual é qual.
 */
export function avisoSonoro(duplo) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC();
    const toca = (t0, freq) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32); o.start(t0); o.stop(t0 + 0.34);
    };
    toca(ctx.currentTime, 880); if (duplo) toca(ctx.currentTime + 0.18, 1175);
    setTimeout(() => ctx.close(), 800);
  } catch { /* sem áudio: o aviso visual continua na tela */ }
}
