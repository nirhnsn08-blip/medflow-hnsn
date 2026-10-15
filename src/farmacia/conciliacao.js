// ═══════════════════════════════════════════════════════════
// CHECAGEM × DISPENSAÇÃO — o que a enfermagem deu e o que a farmácia mandou
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// A enfermagem checa a dose à beira do leito; a farmácia registra o que saiu
// do estoque. Até 17/09/2026 os dois registros nunca se encontravam, e é
// exatamente no desencontro que aparecem perda e desvio:
//
//   ADMINISTRADO SEM DISPENSAÇÃO   a dose foi dada e nada saiu da farmácia
//                                  para aquele paciente. Veio do estoque do
//                                  posto, de outro paciente ou de fora — e o
//                                  consumo e o custo dele estão zerados.
//   DISPENSADO SEM ADMINISTRAÇÃO   saiu da farmácia e, passado o prazo,
//                                  nenhuma dose foi checada. Ou a checagem
//                                  não foi feita, ou o medicamento está
//                                  parado no posto (devolver), ou sumiu.
//
// ⚠️ O QUE ESTA CONTA NÃO FAZ: comparar QUANTIDADE. A dose checada é "500 mg"
// e a saída é "2 comprimidos" — sem a apresentação estruturada, converter uma
// na outra seria inventar número. A conciliação compara PRESENÇA (houve ou
// não houve) por paciente e medicamento, e diz isso na tela.
//
// ⚠️ POR MEDICAMENTO, NÃO POR ITEM. Na internação a prescrição é refeita todo
// dia e cada dia tem itens novos: a dose checada hoje aponta para o item de
// hoje, e a caixa pode ter saído ontem contra o item de ontem.
// ═══════════════════════════════════════════════════════════

export const PRAZO_SEM_CHECAGEM_H = 24;

const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const id = v => (v == null ? "" : String(v));
const ms = d => (d ? new Date(d).getTime() : NaN);

/**
 * Administrações que valem: status administrado, e a linha que foi corrigida
 * por outra sai (a correção é a que vale — `pep_administracoes.corrige_id`).
 */
export function administracoesValidas(adms = []) {
  const lista = Array.isArray(adms) ? adms : [];
  const corrigidas = new Set(lista.map(a => a?.corrige_id).filter(v => v != null).map(id));
  return lista.filter(a => a && !corrigidas.has(id(a.id)) && (a.status || "administrado") === "administrado");
}

/**
 * Cruza, por paciente (chave) e medicamento, as doses checadas com a saída
 * líquida do estoque.
 *
 *   administracoes  [{ chave, medicamento_id, administrado_em, ... }]
 *   movimentos      [{ chave, medicamento_id, tipo, quantidade, created_at, ... }]
 *                   (só os de paciente — dispensação, estorno, devolução)
 *   agora           Date (injetado para testar)
 *
 * Devolve uma linha por divergência:
 *   { chave, medicamento_id, tipo: "administrado_sem_dispensacao" | "dispensado_sem_administracao",
 *     doses, dispensado, primeiraDose, primeiraSaida }
 */
export function conciliar({ administracoes = [], movimentos = [], agora = new Date(), prazoHoras = PRAZO_SEM_CHECAGEM_H } = {}) {
  const grupos = new Map();
  const grupo = (chave, med) => {
    const k = `${id(chave)}|${id(med)}`;
    if (!grupos.has(k)) grupos.set(k, { chave, medicamento_id: med, doses: 0, dispensado: 0, primeiraDose: null, primeiraSaida: null });
    return grupos.get(k);
  };

  for (const a of administracoesValidas(administracoes)) {
    if (a.medicamento_id == null || a.chave == null) continue;   // item livre: não há estoque para comparar
    const g = grupo(a.chave, a.medicamento_id);
    g.doses += 1;
    if (!g.primeiraDose || ms(a.administrado_em) < ms(g.primeiraDose)) g.primeiraDose = a.administrado_em;
  }
  for (const m of Array.isArray(movimentos) ? movimentos : []) {
    if (!m || m.medicamento_id == null || m.chave == null) continue;
    const g = grupo(m.chave, m.medicamento_id);
    const q = num(m.quantidade);
    g.dispensado += m.tipo === "entrada" ? -q : q;
    if (m.tipo === "saida" && m.estorno_de == null && (!g.primeiraSaida || ms(m.created_at) < ms(g.primeiraSaida))) g.primeiraSaida = m.created_at;
  }

  const limite = agora.getTime() - prazoHoras * 3600000;
  const out = [];
  for (const g of grupos.values()) {
    if (g.doses > 0 && g.dispensado <= 0) out.push({ ...g, tipo: "administrado_sem_dispensacao" });
    else if (g.dispensado > 0 && g.doses === 0 && g.primeiraSaida && ms(g.primeiraSaida) < limite)
      out.push({ ...g, tipo: "dispensado_sem_administracao" });
  }
  return out.sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === "administrado_sem_dispensacao" ? -1 : 1));
}

export const TIPOS_DIVERGENCIA = {
  administrado_sem_dispensacao: {
    label: "Administrado sem dispensação",
    cor: "#f43f5e",
    explica: "A enfermagem checou a dose, e nada saiu da farmácia para este paciente. O consumo e o custo dele estão zerados, e a dose veio de outro estoque.",
  },
  dispensado_sem_administracao: {
    label: "Dispensado e não checado",
    cor: "#d97706",
    explica: `Saiu da farmácia há mais de ${PRAZO_SEM_CHECAGEM_H} h e nenhuma dose foi checada. Confirme a checagem ou registre a devolução.`,
  },
};
