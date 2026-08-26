// ═══════════════════════════════════════════════════════════
// VALIDADE DO LOTE — o que pode sair, e para onde
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// Dispensar lote vencido não era bloqueado — e era o CAMINHO DE MENOR
// RESISTÊNCIA. A ordenação FEFO ("o que vence antes sai antes") joga o
// lote mais velho para o topo, e o formulário já vinha com o primeiro
// escolhido. Ou seja: o lote vencido era a opção PRÉ-SELECIONADA, e a
// confirmação validava quantidade e saldo sem olhar a data. O único freio
// era a palavra "(VENCIDO)" no texto da opção.
//
// ⚠️ A ARMADILHA DESTE ARQUIVO, E É ELA QUE MOLDA TUDO:
// bloquear a SAÍDA de lote vencido é o remédio errado. Medicamento
// vencido PRECISA sair do estoque — por descarte, por devolução ao
// fornecedor, por ajuste de inventário. Uma trava que impeça isso prende o
// vencido na prateleira para sempre, some com ele do relatório de perdas e
// deixa o saldo mentindo. Seria trocar um risco por dois.
//
// Então a pergunta não é "pode sair?", é "PARA ONDE está indo?".
//   • para o PACIENTE (dispensação) → RECUSA, sem exceção
//   • para o lixo, o fornecedor ou o ajuste → PASSA, e é assim que se
//     limpa a prateleira
//
// ⚠️ FEFO CONTINUA VALENDO — só não sugere vencido.
// "O que vence antes sai antes" está certo entre lotes VÁLIDOS: é o que
// evita perda. O defeito era estender essa ordem ao que já venceu e
// chamar o pior lote de sugestão.
//
// ⚠️ VALIDADE AUSENTE NÃO É VALIDADE VENCIDA.
// Lote sem data cadastrada é lacuna de cadastro, não veneno. Recusar por
// falta de dado travaria a farmácia inteira (a tela ainda ensina a entrar
// sem lote), e a resposta certa é avisar para alguém completar.
// ═══════════════════════════════════════════════════════════

/** Motivos de saída que levam o medicamento ao PACIENTE. */
export const MOTIVOS_PARA_PACIENTE = ["Dispensação"];

/** Dias de antecedência em que o lote passa a ser "vencendo". */
export const DIAS_VENCENDO = 30;

const texto = v => String(v ?? "").trim();

/** Data civil de hoje, sem passar pelo fuso — 'YYYY-MM-DD' local. */
export function hojeLocal(agora = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/**
 * O estado de um lote pela data.
 *
 * Compara TEXTO 'YYYY-MM-DD'. Passar pela `new Date()` empurraria o dia
 * para trás no fuso do Brasil e faria um lote que vence hoje aparecer como
 * vencido ontem — erro que já custou caro neste projeto.
 *
 * Vence HOJE ainda vale: o medicamento é bom até o fim do dia impresso.
 */
export function situacaoDoLote(validade, agora = new Date()) {
  const v = texto(validade).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { estado: "sem_data", vencido: false };
  const hoje = hojeLocal(agora);
  if (v < hoje) return { estado: "vencido", vencido: true };

  const limite = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + DIAS_VENCENDO);
  const p = n => String(n).padStart(2, "0");
  const dataLimite = `${limite.getFullYear()}-${p(limite.getMonth() + 1)}-${p(limite.getDate())}`;
  if (v <= dataLimite) return { estado: "vencendo", vencido: false };
  return { estado: "ok", vencido: false };
}

/** Este motivo de saída entrega o medicamento a um paciente? */
export const vaiParaPaciente = motivo =>
  MOTIVOS_PARA_PACIENTE.some(m => m.toLowerCase() === texto(motivo).toLowerCase());

/**
 * Pode dar esta saída deste lote?
 *
 * Devolve `{ ok, erros, avisos }`. O `motivo` decide: vencido não vai para
 * paciente, mas SAI por descarte, devolução e ajuste — é assim que a
 * prateleira se limpa.
 */
export function podeSair({ lote, motivo, agora = new Date() } = {}) {
  const erros = [];
  const avisos = [];
  const s = situacaoDoLote(lote?.validade, agora);

  if (s.vencido && vaiParaPaciente(motivo)) {
    erros.push(
      `Este lote está VENCIDO (validade ${texto(lote?.validade).slice(0, 10)}) e não pode ser dispensado a paciente. ` +
      "Para tirá-lo do estoque, registre uma saída com o motivo “Perda / vencimento” — é assim que ele sai da prateleira e entra no relatório de perdas."
    );
  } else if (s.vencido) {
    avisos.push("Lote vencido saindo por baixa — confira se o motivo é o certo e guarde o comprovante do descarte.");
  } else if (s.estado === "vencendo" && vaiParaPaciente(motivo)) {
    avisos.push(`Lote vence em ${texto(lote?.validade).slice(0, 10)}. Ainda vale — use este antes dos outros.`);
  } else if (s.estado === "sem_data" && vaiParaPaciente(motivo)) {
    // Lacuna de cadastro, não veneno. Recusar travaria a farmácia inteira.
    avisos.push("Este lote está sem validade cadastrada. Sem ela não há alerta de vencimento nem recall — complete o cadastro do lote.");
  }

  return { ok: erros.length === 0, erros, avisos, situacao: s };
}

/**
 * Os lotes na ordem em que devem ser oferecidos, e qual vem escolhido.
 *
 * 🔴 É AQUI QUE O DEFEITO MORAVA. A lista era ordenada por FEFO e o
 * formulário escolhia `lotes[0]` — que, havendo vencido, era o vencido.
 *
 * Agora: os válidos primeiro, em FEFO entre si; os vencidos vão para o
 * fim, e nunca são a sugestão. Eles CONTINUAM na lista, porque é por ela
 * que se dá baixa de descarte — sumir com eles esconderia o problema.
 */
export function lotesParaEscolha(lotes = [], { motivo, agora = new Date() } = {}) {
  const lista = (Array.isArray(lotes) ? lotes : []).filter(l => Number(l?.quantidade) > 0);
  const chave = l => texto(l?.validade).slice(0, 10) || "9999-99-99";

  const validos = lista.filter(l => !situacaoDoLote(l?.validade, agora).vencido).sort((a, b) => chave(a).localeCompare(chave(b)));
  const vencidos = lista.filter(l => situacaoDoLote(l?.validade, agora).vencido).sort((a, b) => chave(a).localeCompare(chave(b)));

  const ordenados = [...validos, ...vencidos];
  // Para descarte, o vencido É o alvo — sugerir o válido faria a pessoa
  // dar baixa no lote errado.
  const sugerido = vaiParaPaciente(motivo) || !vencidos.length
    ? (validos[0] || null)
    : (vencidos[0] || null);

  return { lotes: ordenados, sugerido, temVencido: vencidos.length > 0, nVencidos: vencidos.length };
}
