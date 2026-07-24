// ═══════════════════════════════════════════════════════════
// DATA E HORA — funções puras
//
// Extraídas do App.jsx sem mudança de lógica. Estão aqui por dois motivos:
//   1. São as mais reutilizadas do sistema (nowISO em ~80 lugares, fmtDur em
//      ~60, diffMin em ~50). Uma dúzia de funções resolvia um terço das
//      chamadas do arquivo monolítico.
//   2. É onde o projeto já teve o bug mais caro — `todayStr` usava UTC e
//      gravava dados no dia errado. Regra de fuso sem teste é regra que
//      volta a quebrar. Testadas em datas.test.js.
//
// Sem React, sem DOM, sem rede: o mesmo instante sempre produz a mesma
// saída (as que recebem a data por parâmetro), ou dependem só do relógio
// (as `now*`), que os testes tratam injetando a data.
// ═══════════════════════════════════════════════════════════

// Abreviações de mês. O módulo carrega a sua própria cópia para não
// depender de constante do App — é o que o torna testável isolado.
const MESES_ABREV = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Data civil LOCAL no formato YYYY-MM-DD.
 *
 * NÃO usar `toISOString()` para isto: ele devolve a data em UTC e, no Brasil
 * (UTC-3), depois das ~21h já aponta para o dia seguinte — o que fazia o app
 * gravar e filtrar dados no dia errado. Este é o conserto daquele bug, e o
 * motivo de existir teste para uma função de três linhas.
 */
export const todayStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Instante atual em ISO (UTC). Bom para timestamp de gravação, não para data civil. */
export const nowISO = () => new Date().toISOString();

/** Minutos entre dois instantes ISO (b − a). `null` se algum faltar ou for inválido. */
export function diffMin(a, b) {
  if (!a || !b) return null;
  const d = Math.round((new Date(b) - new Date(a)) / 60000);
  return isNaN(d) ? null : d;
}

/** Duração em minutos → "2h 30min" / "45min". Negativo vira 0; inválido vira "—". */
export function fmtDur(min) {
  if (min == null || isNaN(min)) return "—";
  if (min < 0) min = 0;
  const t = Math.round(min), h = Math.floor(t / 60), m = t % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/** Data/hora curta a partir de ISO: "dd/mm hh:mm". `null`/vazio → "—". */
export const horaFmt = iso =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * ISO → valor de `<input type="datetime-local">` (horário LOCAL).
 * Compensa o fuso para o input mostrar a hora que a pessoa espera ver.
 */
export const isoToLocal = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d - off * 60000).toISOString().slice(0, 16);
};

/** Valor de `<input datetime-local>` → ISO (UTC). Vazio → `null`. */
export const localToIso = v => (v ? new Date(v).toISOString() : null);

/**
 * Data ISO só-dia (YYYY-MM-DD) → dd/mm/aaaa, SEM escorregar de fuso.
 * O `T00:00:00` força interpretação local em vez de UTC — sem ele, a data
 * apareceria um dia antes à noite.
 */
export function fmtDataBR(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("pt-BR");
}

/** Competência (mês de referência) "YYYY-MM" a partir de ano e mês 0-11. */
export const compDe = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, "0")}`;

/** Competência "YYYY-MM" → rótulo curto "Jul/25". Vazio → "". */
export const compLabel = comp => {
  if (!comp) return "";
  const [a, m] = comp.split("-");
  return `${MESES_ABREV[Number(m) - 1] || m}/${a.slice(2)}`;
};

/** "HH:MM" → minutos desde a meia-noite. Vazio → `null`. */
export const horaMin = h => {
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
};
