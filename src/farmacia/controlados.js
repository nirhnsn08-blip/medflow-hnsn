// ═══════════════════════════════════════════════════════════
// CONTROLADOS — a lista da Portaria 344/98 e quem prescreveu
//
// Puro: não sabe o que é React nem banco.
//
// Até 17/09/2026 o catálogo dizia só "controlado: sim/não". A lista (A1,
// B1, C1…) é o que separa a escrituração e diz que tipo de receita a
// substância exige; e a saída de controlado para paciente não guardava QUEM
// PRESCREVEU — o primeiro dado que a fiscalização pede no livro.
//
// ⚠️ NENHUM MEDICAMENTO VEM CLASSIFICADO. A lista de cada item é decisão do
// farmacêutico responsável técnico do hospital, e um valor semeado por nós
// seria afirmação regulatória que não conferimos. O catálogo nasce vazio e
// o livro mostra "sem lista" até alguém classificar.
//
// O banco confere as mesmas duas coisas (migracao-farmacia-hospital.sql):
//   farm_med_lista_controle_ck            lista só em controlado, e só A1..C5
//   farm_controlado_exige_prescritor_trg  dispensação de controlado sem prescritor é recusada
// ═══════════════════════════════════════════════════════════

export const LISTAS_PORTARIA_344 = [
  { codigo: "A1", nome: "Entorpecentes" },
  { codigo: "A2", nome: "Entorpecentes de uso permitido em concentrações especiais" },
  { codigo: "A3", nome: "Psicotrópicos" },
  { codigo: "B1", nome: "Psicotrópicos" },
  { codigo: "B2", nome: "Psicotrópicos anorexígenos" },
  { codigo: "C1", nome: "Outras substâncias sujeitas a controle especial" },
  { codigo: "C2", nome: "Retinoides de uso sistêmico" },
  { codigo: "C3", nome: "Imunossupressores" },
  { codigo: "C4", nome: "Antirretrovirais" },
  { codigo: "C5", nome: "Anabolizantes" },
];

const CODIGOS = new Set(LISTAS_PORTARIA_344.map(l => l.codigo));

/** Normaliza o código ("a1 " → "A1"); fora da portaria vira null. */
export function listaValida(v) {
  const c = String(v ?? "").trim().toUpperCase();
  return CODIGOS.has(c) ? c : null;
}

export function rotuloDaLista(codigo) {
  const l = LISTAS_PORTARIA_344.find(x => x.codigo === codigo);
  return l ? `${l.codigo} — ${l.nome}` : "sem lista";
}

/**
 * O campo `lista_controle` para o corpo do salvar do catálogo.
 *
 * Mesmo cuidado de `camposGestacaoPeso`: a coluna só vai no corpo se já
 * existe no banco (veio na linha carregada) ou se alguém preencheu — senão o
 * editor quebraria num banco que ainda não rodou a migração. E medicamento
 * desmarcado como controlado perde a lista (o banco recusaria a combinação).
 */
export function camposControle(original, form) {
  const f = form || {};
  const valor = f.controlado ? listaValida(f.lista_controle) : null;
  const colunaExiste = !!original && Object.prototype.hasOwnProperty.call(original, "lista_controle");
  return colunaExiste || valor != null ? { lista_controle: valor } : {};
}

/** Esta saída precisa do prescritor? Só dispensação de medicamento controlado. */
export function exigePrescritor(med, motivo) {
  return !!med?.controlado && (motivo || "") === "Dispensação";
}

/** Confere os dados do prescritor antes de mandar ao banco. */
export function conferirPrescritor({ nome }) {
  return String(nome ?? "").trim()
    ? { ok: true, erros: [] }
    : { ok: false, erros: ["Medicamento controlado: informe quem prescreveu (a escrituração da Portaria 344/98 exige)."] };
}

/** Os campos do prescritor já limpos para o movimento. */
export function camposDoPrescritor({ nome, registro, receita } = {}) {
  const t = v => String(v ?? "").trim() || null;
  const out = { prescritor_nome: t(nome), prescritor_registro: t(registro) };
  if (t(receita)) out.receita_numero = t(receita);
  return out;
}
