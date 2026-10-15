// ═══════════════════════════════════════════════════════════
// BUSCAR TODOS OS NÚMEROS DA MESMA PESSOA
//
// Duas consultas, no máximo, para qualquer quantidade de pacientes:
//
//   1. as fichas perguntadas (para descobrir quem foi unificado em quem) e
//      as que apontam para elas;
//   2. as origens dos CENTROS descobertos no passo 1 — sem isto, abrir a
//      ficha antiga mostraria o destino mas não as outras origens dele.
//
// 🔴 FALHA DE LEITURA NÃO VIRA "ESTA PESSOA TEM UM NÚMERO SÓ". Se a
// consulta não volta, `ok:false` sobe junto: quem lê alergia com base nisto
// precisa dizer que não conferiu, em vez de mostrar meia lista como se
// fosse inteira. Ver `util/leitura.js`.
// ═══════════════════════════════════════════════════════════

import { listaLida, naoDeuParaLer } from "../util/leitura.js";
import { agruparPorPessoa, centroDe } from "./pessoa.js";

const CAMPOS = "select=prontuario,unificado_para";
const lista = ps => ps.map(p => `"${String(p).replace(/"/g, '""')}"`).join(",");

/** `prontuario in (...) or unificado_para in (...)` — numa consulta só. */
async function fichasDe(sb, prontuarios) {
  if (!prontuarios.length) return [];
  const chaves = encodeURIComponent(lista(prontuarios));
  const r = await sb(`pacientes?or=(prontuario.in.(${chaves}),unificado_para.in.(${chaves}))&${CAMPOS}&limit=500`)
    .catch(() => null);
  return listaLida(r);
}

/**
 * Para cada prontuário pedido, todos os números da mesma pessoa.
 *
 * Devolve `{ ok, por }`. Com `ok:false`, `por` traz cada número sozinho —
 * é o comportamento antigo, e é o único seguro quando não se sabe: some
 * histórico, não aparece histórico de outra pessoa.
 */
export async function carregarProntuariosDaPessoa(sb, prontuarios) {
  const pedidos = [...new Set((Array.isArray(prontuarios) ? prontuarios : [])
    .map(p => String(p ?? "").trim()).filter(Boolean))];
  const sozinhos = Object.fromEntries(pedidos.map(p => [p, [p]]));
  if (!sb || !pedidos.length) return { ok: true, por: sozinhos };

  const primeira = await fichasDe(sb, pedidos);
  if (naoDeuParaLer(primeira)) return { ok: false, por: sozinhos };

  // Os centros que ainda não foram perguntados: as origens deles faltam.
  const centros = [...new Set(primeira.map(centroDe).filter(Boolean))];
  const novos = centros.filter(c => !pedidos.includes(c));
  let linhas = primeira;
  if (novos.length) {
    const segunda = await fichasDe(sb, novos);
    if (naoDeuParaLer(segunda)) return { ok: false, por: sozinhos };
    linhas = [...primeira, ...segunda];
  }
  return { ok: true, por: agruparPorPessoa(pedidos, linhas) };
}
