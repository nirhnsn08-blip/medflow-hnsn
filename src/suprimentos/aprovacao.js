// ═══════════════════════════════════════════════════════════
// APROVAÇÃO DE PEDIDO DE COMPRA — regra pura
//
// Dois buracos de segregação, verificados no código:
//
//   1) AUTOAPROVAÇÃO. `podeAprovar` conferia cargo — `(isMaster || perfil
//      === "matriz") && canEdit` — e nunca comparava quem criou o pedido
//      com quem está aprovando. A mesma pessoa criava, enviava e aprovava.
//      Some-se que o perfil "matriz" exige apenas `adm_silver`: ela vê
//      "+ Novo pedido" na aba Compras e aprova o próprio.
//
//   2) SEM ALÇADA POR VALOR. R$ 50 e R$ 50.000 percorriam exatamente o
//      mesmo caminho. Alçada é o controle mais básico de compra, e é o
//      primeiro que um auditor procura.
//
// 🔴 O que esta camada NÃO resolve, e precisa ficar dito: a política de
// escrita de `sup_pedidos` no banco é por `role`, e quase todo perfil é
// `adm_silver`. Pela API, aprovar continua ao alcance de quem tiver o
// crachá. Isto aqui fecha a tela e torna a regra explícita e testável —
// a barreira definitiva depende do RLS de escrita por módulo, que é item
// próprio da fila.
// ═══════════════════════════════════════════════════════════

/** Sem limite configurado, a alçada não opina — o comportamento é o de antes. */
export const SEM_LIMITE = null;

/**
 * Quem pediu e quem aprova são a mesma pessoa?
 *
 * Compara pelo nome porque é o que `sup_pedidos.usuario` guarda. É uma
 * comparação frágil por natureza — dois "Ana Silva" passariam —, e por isso
 * a mensagem da tela diz o nome, para o caso raro ficar visível em vez de
 * silencioso. A comparação boa virá quando o pedido guardar `usuario_id`,
 * como a trilha de auditoria passou a guardar.
 */
export function ehAutoaprovacao(pedido, usuario) {
  const criador = norm(pedido?.usuario);
  const aprovador = norm(usuario?.name);
  return !!criador && !!aprovador && criador === aprovador;
}

/**
 * O valor do pedido excede a alçada de quem está aprovando?
 *
 * `limite` em reais. `null`/ausente = sem limite configurado, e aí a regra
 * cala — hospital que ainda não definiu alçada não pode ter a compra
 * travada por um número que ninguém escolheu.
 *
 * O ADM Master não tem teto: é a porta de volta quando a matriz está
 * ausente e a compra não pode esperar. Fica na trilha de auditoria.
 */
export function excedeAlcada(total, { limite = SEM_LIMITE, isMaster = false } = {}) {
  if (isMaster) return false;
  const lim = Number(limite);
  if (!Number.isFinite(lim) || lim <= 0) return false;
  const v = Number(total);
  if (!Number.isFinite(v)) return false;
  return v > lim;
}

/**
 * Pode aprovar este pedido? Devolve `{ pode, motivo }`.
 *
 * A ordem das recusas é deliberada: primeiro cargo (quem não é aprovador
 * não deveria nem ver o botão), depois autoaprovação (é o defeito de
 * segregação), por último alçada (é limite, não impedimento de princípio).
 * Assim a mensagem que aparece é sempre a razão mais fundamental.
 */
export function podeAprovarPedido(pedido, { usuario, isMaster = false, ehMatriz = false, canEdit = true, limite = SEM_LIMITE, total = null } = {}) {
  if (!canEdit) return { pode: false, motivo: "Seu acesso é somente leitura." };
  if (!isMaster && !ehMatriz) {
    return { pode: false, motivo: "Só a matriz aprova pedido de compra." };
  }
  if (ehAutoaprovacao(pedido, usuario)) {
    return {
      pode: false,
      motivo: `Este pedido foi criado por ${pedido?.usuario} — quem pede não aprova o próprio pedido. Peça a outra pessoa da matriz.`,
    };
  }
  const v = total == null ? null : Number(total);
  if (v != null && excedeAlcada(v, { limite, isMaster })) {
    return {
      pode: false,
      motivo: `Valor acima da alçada configurada (limite de ${fmt(limite)}). Este pedido precisa da aprovação de um ADM Master.`,
    };
  }
  return { pode: true, motivo: null };
}

/**
 * O texto que explica a alçada vigente, para a tela.
 * Sem limite configurado, diz isso em vez de fingir que há controle.
 */
export function descreverAlcada(limite) {
  const lim = Number(limite);
  if (!Number.isFinite(lim) || lim <= 0) {
    return "Sem alçada configurada — qualquer valor segue o mesmo caminho de aprovação.";
  }
  return `Pedidos acima de ${fmt(lim)} exigem aprovação de um ADM Master.`;
}

/** Validação do valor ao configurar a alçada. */
export function validarLimite(valor) {
  const bruto = String(valor ?? "").trim();
  if (bruto === "") return { ok: true, valor: null, erro: null };   // desligar é válido
  const n = Number(bruto.replace(",", "."));
  if (!Number.isFinite(n)) return { ok: false, valor: null, erro: "Informe um número." };
  if (n < 0) return { ok: false, valor: null, erro: "A alçada não pode ser negativa." };
  if (n === 0) return { ok: false, valor: null, erro: "Alçada zero travaria toda compra. Deixe em branco para desligar." };
  return { ok: true, valor: n, erro: null };
}

// ── internos ────────────────────────────────────────────────

const norm = v => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();

const fmt = v => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
