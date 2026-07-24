// ═══════════════════════════════════════════════════════════
// LEITOS — previsão de alta e sinalização, funções puras
//
// Extraídas do App.jsx sem mudar a lógica. É a régua que o Giro de Leitos
// usa para dizer, num relance, quais pacientes já passaram da alta prevista
// (`sinalLeito` aparece em ~12 lugares).
//
// `sinalLeito` e `diasDesde` dependiam de `new Date()` interno, o que as
// tornava impossíveis de testar sem manipular o relógio da máquina. Aqui
// recebem a data de referência por parâmetro (padrão = agora), do mesmo
// jeito que `src/clinico/prontuario.js` faz — quem já chamava sem o
// argumento continua funcionando igual.
//
// As cores vêm junto de propósito: seguem o padrão de `alertas.js`
// (FARM_GRAV) — é dado de apresentação, não JSX, e mantê-lo aqui evita que
// a mesma sinaleira ganhe cores diferentes em telas diferentes.
// ═══════════════════════════════════════════════════════════

import { todayStr } from "../util/datas.js";

/**
 * Sugere a linha de referência de CID que casa com o que foi digitado.
 * Ordem: igual exato → prefixo (um contém o começo do outro) → busca no
 * texto da descrição (só com 3+ caracteres, para não casar por acaso).
 * Devolve a linha inteira (tem `dias`, `descricao`) ou null.
 */
export function sugerirCid(cidDigitado, refs) {
  if (!cidDigitado || !refs || !refs.length) return null;
  const c = cidDigitado.trim().toUpperCase();
  if (c.length < 2) return null;
  let m = refs.find(r => (r.cid || "").toUpperCase() === c);
  if (!m) m = refs.find(r => { const rc = (r.cid || "").toUpperCase(); return rc && (c.startsWith(rc) || rc.startsWith(c)); });
  if (!m && c.length >= 3) m = refs.find(r => (r.descricao || "").toUpperCase().includes(c));
  return m || null;
}

/** Previsão de alta = data de internação + dias previstos. Date, ou null se faltar dado. */
export function calcAlta(dataInternacao, diasPrevistos) {
  if (!dataInternacao || !diasPrevistos) return null;
  const d = new Date(dataInternacao + "T00:00:00");
  d.setDate(d.getDate() + Number(diasPrevistos));
  return d;
}

/**
 * Sinaleira da permanência: verde (2+ dias), amarelo (falta ≤1 dia / alta
 * hoje), vermelho (já passou). Devolve { cor, texto, restam }.
 * `agora` é injetável para teste; por padrão é o instante atual.
 */
export function sinalLeito(dataInternacao, diasPrevistos, agora = new Date()) {
  const alta = calcAlta(dataInternacao, diasPrevistos);
  if (!alta) return { cor: "var(--text-muted)", texto: "sem previsão", restam: null };
  const hoje = new Date(agora); hoje.setHours(0, 0, 0, 0);
  const restam = Math.round((alta - hoje) / 86400000);
  const dataFmt = alta.toLocaleDateString("pt-BR");
  if (restam < 0)  return { cor: "#f43f5e", texto: `${Math.abs(restam)}d após a alta (${dataFmt})`, restam };
  if (restam <= 1) return { cor: "#fbbf24", texto: restam === 0 ? `alta prevista hoje (${dataFmt})` : `falta 1 dia (${dataFmt})`, restam };
  return { cor: "#34d399", texto: `faltam ${restam} dias (${dataFmt})`, restam };
}

/**
 * Dias entre uma data (YYYY-MM-DD) e hoje. Nunca negativo (data futura → 0).
 * `hoje` é injetável para teste; por padrão usa a data civil local de agora.
 */
export function diasDesde(dateStr, hoje = todayStr()) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d)) return null;
  return Math.max(0, Math.round((new Date(hoje + "T00:00:00") - d) / 86400000));
}
