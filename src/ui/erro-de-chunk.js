// ═══════════════════════════════════════════════════════════
// "NÃO DEU PARA BAIXAR O MÓDULO" — reconhecer, e dar o conselho certo
//
// Com as telas carregando sob demanda (`lazy` + `Suspense`), existe um erro
// que ANTES não existia: o navegador pede um arquivo de módulo e não recebe.
//
// 🔴 ELE PEDE O CONSELHO OPOSTO DO ERRO COMUM. O limite de erro dizia
// "o resto do sistema continua funcionando — é só trocar de módulo". Para um
// erro de render, verdade. Para falha de download, MENTIRA: se o deploy
// trocou o nome dos arquivos, TODOS os módulos vão falhar igual, e a pessoa
// vai clicar num por um até desistir e ligar para o suporte.
//
// As duas causas reais, e as duas se resolvem recarregando:
//   • o sistema foi atualizado enquanto a aba estava aberta (nomes com hash
//     mudam a cada deploy, e o arquivo antigo some)
//   • a rede oscilou no meio do download
//
// ⚠️ ESTA FUNÇÃO VIVE FORA DO App.jsx DE PROPÓSITO. Dentro dele não teria
// como ser testada sem montar o app inteiro — e o que precisa de teste aqui
// é justamente a lista de frases, que muda com o navegador.
// ═══════════════════════════════════════════════════════════

/**
 * Cada navegador escreve esse erro com outras palavras. As quatro formas
 * abaixo são as que aparecem no mundo real:
 *
 *   Chrome/Edge  "Failed to fetch dynamically imported module: https://…"
 *   Firefox      "error loading dynamically imported module"
 *   Safari       "Importing a module script failed."
 *   bundlers     "Loading chunk 12 failed."
 *
 * ⚠️ NÃO basta procurar "fetch": `TypeError: Failed to fetch` também é o que
 * uma chamada de API dá quando a rede cai, e isso NÃO é erro de módulo — o
 * conselho ali é outro. Por isso "fetch" só conta acompanhado de "module".
 */
const FRASES = [
  /dynamically imported module/i,
  /importing a module script failed/i,
  /loading chunk \S+ failed/i,
  /failed to fetch.*module/i,
  /error loading .*module/i,
  // 🔴 ESTE FALTAVA, e é o mais provável dos cinco em produção.
  // Quando o arquivo do módulo some, o servidor NÃO devolve 404: a Vercel
  // (e o `vite preview`) caem no `index.html` para qualquer caminho
  // desconhecido, porque é um app de página única. O navegador recebe HTML
  // onde esperava JavaScript e reclama do TIPO, sem falar em "fetch" nem em
  // "dynamically imported". Descoberto ao apagar um chunk do `dist` e
  // servir o build de verdade — nenhum dos outros quatro pegava.
  /failed to load module script/i,
  /expected a javascript.*module script/i,
];

/** Este erro é falha ao BAIXAR um módulo (e não um erro de render)? */
export function ehErroDeChunk(erro) {
  if (!erro) return false;
  const txt = typeof erro === "string"
    ? erro
    : `${erro.name || ""} ${erro.message || ""}`;
  if (!txt.trim()) return false;
  return FRASES.some(re => re.test(txt));
}

export const TEXTO_CHUNK = {
  titulo: "Não deu para baixar este módulo",
  corpo: "Quase sempre é uma de duas coisas: o sistema foi atualizado enquanto esta aba estava aberta, ou a rede oscilou. Recarregar resolve as duas — e nada do que você digitou e salvou se perde.",
  botao: "Recarregar",
};
