// ═══════════════════════════════════════════════════════════
// REMESSA — o ato de transmitir, registrado
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// `faturada` era um estado INALCANÇÁVEL. A função que o escreve existe em
// `dados.js` desde sempre e nenhuma tela a chama — então nenhuma conta
// jamais saiu de "fechada". Três leitores dependiam disso:
//   · o KPI "Faturadas — já transmitidas ao SUS", sempre zero;
//   · a linha "N faturadas" do painel do SUS, sempre zero;
//   · `concluidas = fechada + faturada`, que era só `fechada`.
// Um indicador que não pode mudar é pior que indicador nenhum: quem olha
// para ele todo mês aprende que o número não quer dizer nada.
//
// ⚠️ O QUE O SISTEMA NÃO FAZ, E CONTINUA NÃO FAZENDO
// Gerar o ARQUIVO de remessa (BPA-I/BPA-C, SISAIH01, XML do TISS). Isso é
// recusa deliberada e documentada em `faturamento.js`: layout versionado,
// muda por portaria, passa por homologação, e um gerador escrito contra
// layout não conferido produz arquivo que o DATASUS rejeita inteiro.
//
// Então o que se registra aqui não é "o sistema transmitiu" — é "alguém
// transmitiu, e disse quando e sob qual protocolo". O sistema guarda o
// FATO, que é o que falta quando a glosa chega.
//
// ⚠️ TRANSMITIR É EM LOTE, NÃO CONTA A CONTA.
// A remessa é do mês inteiro por via. Uma tela que pedisse um clique por
// conta seria uma tela que ninguém usa num mês de trezentas contas — e
// aí o estado voltaria a ser inalcançável, só que com botão.
//
// ⚠️ E É SEM VOLTA. `faturada` não reabre: a partir dela existe arquivo
// transmitido, e mexer no que já foi enviado faz a conta e a remessa
// contarem histórias diferentes. Correção depois disso é glosa, que é
// outro fluxo. Por isso este arquivo recusa mais do que avisa.
// ═══════════════════════════════════════════════════════════

/** Só conta FECHADA entra em remessa. Aberta não foi conferida ainda. */
export const STATUS_TRANSMISSIVEL = "fechada";

/** O protocolo que o órgão devolve. Cabe folgado; o que não cabe é engano. */
export const PROTOCOLO_MAX = 40;

const texto = v => String(v ?? "").trim();

/** Data civil de hoje SEM passar pelo fuso — 'YYYY-MM-DD' local. */
export function hojeLocal(agora = new Date()) {
  const d = agora;
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * As contas que a remessa leva.
 *
 * Filtra por competência e, quando informada, por via — a remessa do BPA
 * não leva AIH junto. `null`/vazio em `via` quer dizer "todas as vias",
 * que é o caso de quem transmite tudo de uma vez.
 */
export function contasTransmissiveis(contas, { competencia, via } = {}) {
  const comp = texto(competencia);
  const v = texto(via);
  return (Array.isArray(contas) ? contas : []).filter(c => {
    if (!c || c.status !== STATUS_TRANSMISSIVEL) return false;
    if (comp && texto(c.competencia) !== comp) return false;
    if (v && texto(c.via) !== v) return false;
    return true;
  });
}

/** Quantas ficariam de fora por ainda estarem abertas. */
export function contasQueFicamDeFora(contas, { competencia, via } = {}) {
  const comp = texto(competencia);
  const v = texto(via);
  return (Array.isArray(contas) ? contas : []).filter(c => {
    if (!c || c.status !== "aberta") return false;
    if (comp && texto(c.competencia) !== comp) return false;
    if (v && texto(c.via) !== v) return false;
    return true;
  });
}

/**
 * Pode registrar esta transmissão?
 *
 * Devolve `{ ok, erros, avisos, contas }`. `contas` é o que de fato vai —
 * a tela não recalcula, para não haver duas respostas para a mesma
 * pergunta.
 */
export function validarTransmissao({ contas, competencia, via, protocolo, quando, agora = new Date() } = {}) {
  const erros = [];
  const avisos = [];

  const comp = texto(competencia);
  if (!comp) erros.push("Informe a competência — é ela que diz a qual mês esta remessa pertence.");

  const dia = texto(quando);
  if (!dia) {
    erros.push("Informe a data em que a remessa foi transmitida.");
  } else if (dia > hojeLocal(agora)) {
    // Comparação de strings 'YYYY-MM-DD': data civil não passa por
    // `new Date()`, que empurraria o dia para trás no fuso do Brasil.
    erros.push("A data é no futuro. Só se registra transmissão que já aconteceu.");
  }

  const prot = texto(protocolo);
  if (prot.length > PROTOCOLO_MAX) {
    erros.push(`O protocolo passa de ${PROTOCOLO_MAX} caracteres — confira se não veio texto junto.`);
  }

  const vao = contasTransmissiveis(contas, { competencia: comp, via });
  if (!vao.length) {
    erros.push("Nenhuma conta fechada nesta seleção. Só conta fechada entra em remessa — a aberta ainda não foi conferida.");
  }

  // ⚠️ AVISO QUE SÓ ACENDE COM SINAL REAL. Conta aberta na mesma
  // competência é dinheiro que fica para trás nesta remessa, e quem está
  // transmitindo é a única pessoa em posição de decidir se fecha antes.
  const ficam = contasQueFicamDeFora(contas, { competencia: comp, via });
  if (ficam.length) {
    avisos.push(
      `${ficam.length} ${ficam.length === 1 ? "conta ainda aberta fica" : "contas ainda abertas ficam"} de fora desta remessa. ` +
      `Fechar antes de transmitir é o que evita ${ficam.length === 1 ? "ela ficar" : "elas ficarem"} para a competência seguinte.`);
  }

  if (!prot) {
    avisos.push("Sem número de protocolo. Quando a glosa chegar, é por ele que se acha em qual remessa a conta foi — dá para registrar, mas fica mais difícil de rastrear.");
  }

  return { ok: erros.length === 0, erros, avisos, contas: vao };
}

/** O que a tela mostra antes de confirmar — e o recibo depois. */
export function resumoDaTransmissao(contas) {
  const lista = Array.isArray(contas) ? contas : [];
  const porVia = {};
  for (const c of lista) {
    const v = texto(c?.via) || "sem via";
    porVia[v] = (porVia[v] || 0) + 1;
  }
  return {
    quantas: lista.length,
    porVia,
    vias: Object.keys(porVia).sort(),
  };
}
