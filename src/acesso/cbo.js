// ═══════════════════════════════════════════════════════════
// CBO DO PROFISSIONAL — a ocupação que decide se a produção é processada
//
// POR QUE ESTE ARQUIVO EXISTE
// A coluna `profiles.cbo` é lida em três lugares — `carregarProfissionais`,
// a linha do profissional na Recepção e na chegada da Agenda, e
// `conferirCbo` (ficha.js), que compara o CBO de quem atende com os
// `cbos_compativeis` do procedimento. A trava tem três estados, mensagem
// escrita e teste verde.
//
// E não havia UM `<input>` no sistema inteiro para preenchê-la. O CBO só
// entrava pelo SQL Editor, e ninguém sabia disso — então na prática toda a
// trava estava inerte, e a Recepção mostrava "sem CBO no cadastro" sem
// oferecer caminho nenhum.
//
// POR QUE NÃO EXISTE UMA TABELA DE CBOs AQUI DENTRO
// Seria fácil escrever uma lista de "os CBOs do hospital" de cabeça. Seria
// também a pior coisa a fazer: **CBO errado causa exatamente a rejeição que
// este campo existe para evitar** — e rejeição no SISAIH01/BPA não é glosa,
// derruba o registro inteiro e só aparece no processamento do mês seguinte.
// Um código inventado por mim, com cara de oficial, seria pior do que campo
// vazio, porque campo vazio pelo menos avisa.
//
// O que este arquivo faz é o que dá para fazer com segurança: conferir o
// FORMATO (CBO 2002 tem 6 dígitos) e sugerir os CBOs que JÁ EXISTEM no
// catálogo de procedimentos deste hospital — dado real, cadastrado por
// alguém daqui, não estimado. A fonte oficial é o CBO do MTE.
// ═══════════════════════════════════════════════════════════

/** Só os dígitos — quem digita usa o hífen do formato oficial. */
export const normalizarCbo = v => String(v ?? "").replace(/\D/g, "");

/**
 * O CBO serve?
 *
 * Vazio é VÁLIDO e devolve `{ ok: true, vazio: true }`: não preencher é uma
 * situação legítima (recepcionista, administrativo, quem não executa
 * procedimento). O que se recusa é o preenchido ERRADO — meia dúzia de
 * dígitos a menos vira um código que não existe, e um código que não existe
 * atravessa a tela, atravessa o congelamento no atendimento, e só falha no
 * processamento.
 *
 * Bloquear aqui é o certo, e não contradiz a regra do balcão: isto é tela de
 * cadastro da TI, sem paciente na frente.
 */
export function validarCbo(valor) {
  const bruto = String(valor ?? "").trim();
  const c = normalizarCbo(valor);
  // Campo em branco é "não preencheu". Campo COM texto e sem nenhum dígito é
  // outra coisa: alguém digitou e o que digitou não é um CBO. Tratar os dois
  // como vazio descartaria a digitação em silêncio — e silêncio aqui é o que
  // faz a pessoa achar que gravou.
  if (!bruto) return { ok: true, vazio: true, valor: null };
  if (!c) return { ok: false, erro: "CBO é só número — use o código de 6 dígitos (formato 0000-00)." };
  if (c.length !== 6) {
    return { ok: false, erro: `CBO tem 6 dígitos (formato 0000-00). Você digitou ${c.length}.` };
  }
  return { ok: true, vazio: false, valor: c };
}

/** "225125" → "2251-25", que é como o código é publicado. */
export function formatarCbo(valor) {
  const c = normalizarCbo(valor);
  if (c.length !== 6) return String(valor ?? "");
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/**
 * Os CBOs que já aparecem no catálogo de procedimentos deste hospital.
 *
 * É a única sugestão honesta que dá para oferecer: são os códigos que
 * alguém daqui cadastrou como compatíveis com algum procedimento, então
 * são exatamente os que fazem a conferência passar. Ordenados, sem
 * repetição, e só os de formato válido — um lixo no catálogo não vira
 * sugestão.
 */
export function cbosDoCatalogo(procedimentos = []) {
  const vistos = new Set();
  for (const p of Array.isArray(procedimentos) ? procedimentos : []) {
    for (const c of Array.isArray(p?.cbos_compativeis) ? p.cbos_compativeis : []) {
      const n = normalizarCbo(c);
      if (n.length === 6) vistos.add(n);
    }
  }
  return [...vistos].sort();
}
