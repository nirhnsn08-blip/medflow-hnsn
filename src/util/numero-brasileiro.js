// ═══════════════════════════════════════════════════════════
// LER NÚMERO ESCRITO POR GENTE
//
// 🔴 O DEFEITO QUE ISTO CONSERTA. O jeito antigo de ler valor digitado era:
//
//     Number(String(v).replace(/\./g, "").replace(",", "."))
//
// que trata TODO ponto como separador de milhar. Quem digitasse `1234.56`
// gravava **123456** — cem vezes mais —, sem erro nenhum em tela, num campo
// de preço. E ponto decimal não é digitação exótica: é o que sai de qualquer
// exportação de sistema, e é o que o teclado numérico produz.
//
// ⚠️ ESTE ARQUIVO NÃO SABE SE É PREÇO. Ele só lê número. Quem decide que
// negativo não vale, ou que zero vale, é quem chama.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "./leitura.js";

/** Como o texto escreve decimal. Não é "país": é qual sinal separa centavos. */
export const ESTILO = {
  VIRGULA: "virgula_decimal",   // 1.234,56  — o padrão brasileiro
  PONTO:   "ponto_decimal",     // 1,234.56
};

/**
 * `1.234` vale MIL DUZENTOS E TRINTA E QUATRO ou UM E POUCO?
 *
 * Olhando só para ele, não dá para saber. E errar aqui não é errar um
 * pouco: é errar por MIL.
 *
 * Então, sem `estilo`, esta função NÃO ESCOLHE — devolve `ambiguo` e o
 * motivo com as duas leituras lado a lado. Com `estilo`, resolve.
 *
 * Ambíguo é exatamente um caso: UM separador seguido de EXATAMENTE três
 * dígitos, sem nada que desempate. `1.234,56` não é (tem os dois, e o
 * último manda). `1234,56` não é (dois dígitos depois). `1.234.567` não é
 * (dois pontos só podem ser milhar).
 *
 * ⚠️ O `estilo` só age NESSE caso. `1234.56` com estilo vírgula continua
 * sendo 1234,56 — porque duas casas depois do ponto não são milhar em
 * convenção nenhuma, e é justamente a digitação que o jeito antigo comia.
 */
export function lerNumero(bruto, estilo = null) {
  // 🔴 Número já é número. Sem isto, o valor 1.234 (mil e duzentos e trinta
  // e quatro milésimos) viraria texto "1.234", cairia no caso ambíguo e
  // sairia como 1234 — mil vezes maior, por ter passado por aqui à toa.
  if (typeof bruto === "number") {
    return Number.isFinite(bruto)
      ? { valor: bruto, ambiguo: false, motivo: null }
      : { valor: null, ambiguo: false, motivo: "Valor não é um número finito." };
  }

  const limpo = String(bruto ?? "")
    .replace(/r\$/gi, "")
    .replace(/[\s ]/g, "")
    .trim();

  if (!limpo) return { valor: null, ambiguo: false, motivo: "Sem valor." };
  if (!/^-?[\d.,]+$/.test(limpo) || !/\d/.test(limpo)) {
    return { valor: null, ambiguo: false, motivo: `"${bruto}" não é um número.` };
  }

  const neg = limpo.startsWith("-");
  const n = limpo.replace(/^-/, "");
  const pontos = (n.match(/\./g) || []).length;
  const virgulas = (n.match(/,/g) || []).length;
  const fim = v => (neg ? -v : v);

  const comoDecimal = sinal => {
    const partes = n.replace(sinal === "," ? /\./g : /,/g, "").split(sinal);
    const dec = partes.pop();
    return Number(partes.join("") + "." + dec);
  };
  const comoMilhar = () => Number(n.replace(/[.,]/g, ""));

  // Os dois sinais presentes: o ÚLTIMO é o decimal. Não há dúvida.
  if (pontos && virgulas) {
    const ultimo = n.lastIndexOf(".") > n.lastIndexOf(",") ? "." : ",";
    return { valor: fim(comoDecimal(ultimo)), ambiguo: false, motivo: null };
  }

  const sinal = pontos ? "." : virgulas ? "," : null;
  if (!sinal) return { valor: fim(Number(n)), ambiguo: false, motivo: null };

  // Dois ou mais do mesmo sinal só existem como milhar: 1.234.567
  if ((pontos || virgulas) > 1) return { valor: fim(comoMilhar()), ambiguo: false, motivo: null };

  // Um sinal, três dígitos depois: milhar ou decimal? É AQUI.
  if (n.length - n.lastIndexOf(sinal) - 1 === 3) {
    if (estilo === ESTILO.VIRGULA) return { valor: fim(sinal === "," ? comoDecimal(",") : comoMilhar()), ambiguo: false, motivo: null };
    if (estilo === ESTILO.PONTO)   return { valor: fim(sinal === "." ? comoDecimal(".") : comoMilhar()), ambiguo: false, motivo: null };
    return {
      valor: null, ambiguo: true,
      motivo: `"${bruto}" pode ser ${comoMilhar()} ou ${comoDecimal(sinal)} — está escrito de um jeito que não deixa claro, e a diferença é de mil vezes.`,
    };
  }

  return { valor: fim(comoDecimal(sinal)), ambiguo: false, motivo: null };
}

/**
 * Uma coluna de planilha escreve decimal de um jeito só. Basta UM valor sem
 * ambiguidade para decidir todos os ambíguos — é assim que `1.234` no meio
 * de uma coluna cheia de `99,90` deixa de ser dúvida.
 *
 * ⚠️ Devolve null quando a coluna se contradiz (tem `9,90` E `9.90`). Aí é
 * planilha mal montada, e o certo é recusar em vez de escolher um lado.
 */
export function estiloDaColuna(brutos) {
  let virgula = 0, ponto = 0;
  for (const b of listaLida(brutos)) {
    const n = String(b ?? "").replace(/r\$/gi, "").replace(/[\s ]/g, "").replace(/^-/, "");
    if (!n || !/^[\d.,]+$/.test(n) || !/\d/.test(n)) continue;
    const p = (n.match(/\./g) || []).length, v = (n.match(/,/g) || []).length;
    if (p && v) { (n.lastIndexOf(".") > n.lastIndexOf(",") ? ponto++ : virgula++); continue; }
    const sinal = p ? "." : v ? "," : null;
    if (!sinal || (p || v) > 1) continue;                       // sem sinal, ou milhar puro
    if (n.length - n.lastIndexOf(sinal) - 1 === 3) continue;    // é justamente o ambíguo
    (sinal === "," ? virgula++ : ponto++);
  }
  if (virgula && ponto) return null;
  if (virgula) return ESTILO.VIRGULA;
  if (ponto) return ESTILO.PONTO;
  return null;
}

/**
 * Valor digitado num campo brasileiro → número, ou null.
 *
 * ⚠️ Assume vírgula decimal DE PROPÓSITO, e só no caso ambíguo: o campo
 * está na frente de uma pessoa, num sistema em português, e quem escreve
 * `1.234` ali quer mil duzentos e trinta e quatro. Planilha importada de
 * origem desconhecida é outra história — lá o ambíguo é recusado.
 */
export function numeroDigitado(bruto) {
  return lerNumero(bruto, ESTILO.VIRGULA).valor;
}
