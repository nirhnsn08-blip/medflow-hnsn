// ═══════════════════════════════════════════════════════════
// LER O XML DA NF-e
//
// 🔴 SAIU DE `SuprimentosPage.jsx` EM 04/09/2026 SEM UM TESTE SEQUER. É
// leitura de documento fiscal — o que ela devolve vira entrada de estoque,
// lote, validade e custo unitário. Um campo lido errado aqui não erra em
// tela: erra no saldo, no custo médio e no vencimento, e só aparece na
// conferência de inventário meses depois.
//
// ⚠️ Ela é PURA e devolve `{ erro }` OU `{ fornecedor, nf, itens }` — nunca
// os dois, e nunca lança. Quem chama decide o que fazer com o erro; jogar
// exceção de dentro de um leitor de arquivo faria o `FileReader` engolir a
// causa.
//
// ⚠️ `DOMParser` é API de navegador, mas determinística: o teste roda em
// jsdom e o XML de entrada é o mesmo que o SEFAZ emite.
// ═══════════════════════════════════════════════════════════

export // Lê o XML de uma NF-e e extrai fornecedor + itens (código, EAN, nome, qtd,
// unidade, custo unitário, lote/validade quando há rastreabilidade). Local, sem lib.
function parseNFe(xmlText) {
  let doc;
  try { doc = new DOMParser().parseFromString(xmlText, "application/xml"); }
  catch { return { erro: "Não consegui ler o arquivo." }; }
  if (!doc || doc.getElementsByTagName("parsererror").length) return { erro: "XML inválido ou corrompido." };
  const txt = (el, tag) => el ? (el.getElementsByTagName(tag)[0]?.textContent || "").trim() : "";
  const emit = doc.getElementsByTagName("emit")[0];
  const ide  = doc.getElementsByTagName("ide")[0];
  if (!emit && !doc.getElementsByTagName("det").length) return { erro: "Este arquivo não parece uma NF-e." };
  const fornecedor = { cnpj: txt(emit, "CNPJ"), nome: txt(emit, "xNome") };
  const nf = txt(ide, "nNF");
  const itens = Array.from(doc.getElementsByTagName("det")).map(det => {
    const prod = det.getElementsByTagName("prod")[0];
    const rastro = det.getElementsByTagName("rastro")[0];
    const ean = txt(prod, "cEAN");
    return {
      codigo: txt(prod, "cProd"),
      ean: /^[0-9]{8,14}$/.test(ean) ? ean : "",         // "SEM GTIN" e afins → ignora
      nome: txt(prod, "xProd"),
      unidade: txt(prod, "uCom").toLowerCase(),
      qtd: Number(txt(prod, "qCom")) || 0,
      custo_unit: Number(txt(prod, "vUnCom")) || 0,
      lote: rastro ? txt(rastro, "nLote") : "",
      validade: rastro ? txt(rastro, "dVal") : "",        // rastro/dVal já vem YYYY-MM-DD
    };
  }).filter(x => x.nome && x.qtd > 0);
  if (!itens.length) return { erro: "Nenhum item encontrado no XML." };
  return { fornecedor, nf, itens };
}
