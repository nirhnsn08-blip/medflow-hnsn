// ═══════════════════════════════════════════════════════════
// OPME — ÓRTESES, PRÓTESES E MATERIAIS ESPECIAIS
//
// 🔴 ATÉ AQUI, OPME ERA UM `textarea`:
//
//     "Ex.: kit vídeo, clipes de titânio; OPME: prótese X (fornecedor Y)"
//
// Um campo de texto livre, sem lote, sem número de série, sem registro
// ANVISA, sem vínculo com o estoque. Quando o fabricante recolhe um lote
// de prótese, a pergunta é "em QUEM nós implantamos este lote?" — e com
// texto livre a resposta é ler cirurgia por cirurgia torcendo para alguém
// ter digitado o número. Na prática o hospital não responde, e não
// responder é não chamar de volta quem precisa de revisão.
//
// A RDC 751/2022 trata implantáveis como a classe de maior risco pela
// razão óbvia: o dispositivo fica dentro da pessoa por anos.
//
// ⚠️ A DISTINÇÃO QUE ORGANIZA O ARQUIVO INTEIRO é `implante`. Prótese,
// placa, parafuso, tela, stent e marca-passo exigem lote; campo cirúrgico
// e compressa não. Exigir lote de tudo faria a equipe preencher lixo para
// passar da tela, e aí nem o que importa seria confiável.
// ═══════════════════════════════════════════════════════════

import { MOTIVO_MIN } from "./cirurgia-segura.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { todayStr } from "../util/datas.js";

const txt = v => String(v ?? "").trim();
const num = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * As naturezas de material, e o que cada uma exige.
 *
 * Não é só rótulo: `exigeLote` é a regra, e ela também está no banco
 * (`cc_opme_implante_lote_ck`) porque tela não é defesa.
 */
export const NATUREZAS = Object.freeze([
  { chave: "implante",    label: "Implante (fica no paciente)", implante: true,  exigeLote: true },
  { chave: "descartavel", label: "Descartável / consumo",       implante: false, exigeLote: false },
  { chave: "instrumental", label: "Instrumental em comodato",   implante: false, exigeLote: false },
]);

export const NATUREZA_POR_CHAVE = Object.freeze(
  Object.fromEntries(NATUREZAS.map(n => [n.chave, n])));

/** A linha é um estorno, ou foi estornada por outra? */
export function estornada(linha, todas = []) {
  if (!linha) return false;
  return (Array.isArray(todas) ? todas : []).some(x => String(x.estorno_de) === String(linha.id));
}

/**
 * As linhas que VALEM: nem estornos, nem linhas que foram estornadas.
 *
 * ⚠️ Lista marcada de `FALHA` atravessa: filtrar devolveria array comum, e
 * aí "não consegui ler o material" viraria "não usou material nenhum" —
 * numa tela que decide recall.
 */
export function vigentes(linhas) {
  if (naoDeuParaLer(linhas)) return linhas;
  if (!Array.isArray(linhas)) return [];
  return linhas.filter(l => l.estorno_de == null && !estornada(l, linhas));
}

/** Só os implantes que valem — é o que o prontuário do paciente carrega. */
export function implantesVigentes(linhas) {
  const v = vigentes(linhas);
  if (naoDeuParaLer(v)) return v;
  return v.filter(l => l.implante);
}

/**
 * Confere o formulário antes de mandar.
 *
 * Repete as travas do banco de propósito: o banco recusa com a frase do
 * Postgres, que não serve para a instrumentadora com a caixa na mão.
 */
export function conferirOpme({ cirurgia, form = {} } = {}) {
  const erros = [], avisos = [];
  const nat = NATUREZA_POR_CHAVE[txt(form.natureza)] || null;

  if (!cirurgia) erros.push("Sem cirurgia selecionada.");
  else if (cirurgia.status === "cancelada")
    erros.push("Esta cirurgia está CANCELADA. Não há material consumido a registrar.");

  if (!nat) erros.push("Diga a natureza do material — é ela que decide o que o registro exige.");
  if (txt(form.descricao).length < 3)
    erros.push("Descreva o material. Três caracteres é o mínimo para alguém reconhecer o que foi usado.");

  // 🔴 A TRAVA CENTRAL.
  if (nat?.exigeLote && !txt(form.lote)) {
    erros.push("IMPLANTE SEM LOTE não entra. O lote é a única coisa que responde "
      + "\"em quem implantamos\" quando o fabricante recolher este produto — é por ele que um recall procura.");
  }

  const q = num(form.quantidade);
  if (q == null || q <= 0) erros.push("Quantidade tem de ser maior que zero.");

  // ── avisos: entram, mas custam ──────────────────────────
  if (nat?.implante && !txt(form.registro_anvisa)) {
    // ⚠️ AVISO e não erro, e a assimetria é deliberada: o LOTE é o que um
    // recall procura; o registro é o que um auditor procura. Recall é
    // emergência; auditoria tem prazo. Travar a sala por um número que
    // está na caixa trocaria um risco real por preenchimento apressado.
    avisos.push("Implante sem registro ANVISA. Não bloqueia — mas é exigência da RDC 751/2022, "
      + "e é o que falta quando a vigilância pede o rastreio do produto.");
  }
  if (nat?.implante && !txt(form.numero_serie)) {
    avisos.push("Implante sem número de série. Quando o fabricante identifica a peça por série e não por lote, "
      + "é este número que individualiza o que está dentro do paciente.");
  }
  if (!form.item_id && !form.consignado) {
    avisos.push("Material fora do catálogo do estoque e não marcado como consignado — "
      + "o registro vale para o rastreio, mas NÃO dá baixa no almoxarifado.");
  }
  // ⚠️ `todayStr()`, não `toISOString().slice(0,10)`: das 21h à meia-noite
  // o UTC já aponta para amanhã, e uma validade que vence HOJE passaria
  // por vencida no plantão da noite. A catraca do dia civil me pegou aqui.
  if (txt(form.validade) && txt(form.validade) < todayStr()) {
    avisos.push("A validade informada já passou. Confira a embalagem antes de concluir o registro.");
  }

  return { ok: !erros.length, erros, avisos };
}

/** Confere o estorno. */
export function conferirEstorno({ linha, motivo = "", todas = [] } = {}) {
  if (!linha) return "Nada selecionado para estornar.";
  if (linha.estorno_de != null) return "Esta linha já é um estorno — não se estorna um estorno.";
  if (estornada(linha, todas)) return "Esta linha já foi estornada.";
  if (txt(motivo).length < MOTIVO_MIN)
    return `O estorno exige o motivo (mínimo ${MOTIVO_MIN} caracteres): o material não foi usado, foi lançado em dobro, o lote estava errado.`;
  return null;
}

/** A linha para gravar. A baixa de estoque é decidida pelo BANCO. */
export function linhaDeOpme({ cirurgia, form = {}, assinatura = null } = {}) {
  const nat = NATUREZA_POR_CHAVE[txt(form.natureza)] || null;
  return {
    cirurgia_id: cirurgia?.id ?? null,
    implante: !!nat?.implante,
    item_id: form.item_id ? Number(form.item_id) : null,
    descricao: txt(form.descricao),
    lote: txt(form.lote) || null,
    numero_serie: txt(form.numero_serie) || null,
    registro_anvisa: txt(form.registro_anvisa) || null,
    fabricante: txt(form.fabricante) || null,
    validade: txt(form.validade) || null,
    quantidade: num(form.quantidade) ?? 1,
    consignado: !!form.consignado,
    assinatura: txt(assinatura) || null,
  };
}

/** A linha de estorno — devolve ao estoque o que a original tirou. */
export function linhaDeEstorno({ linha, motivo, assinatura = null } = {}) {
  return {
    cirurgia_id: linha?.cirurgia_id ?? null,
    implante: !!linha?.implante,
    item_id: linha?.item_id ?? null,
    descricao: linha?.descricao ?? "",
    lote: linha?.lote ?? null,
    quantidade: linha?.quantidade ?? 1,
    consignado: !!linha?.consignado,
    estorno_de: linha?.id ?? null,
    estorno_motivo: txt(motivo) || null,
    assinatura: txt(assinatura) || null,
  };
}

/**
 * O que ficou pendente de conciliação com o almoxarifado.
 *
 * A baixa que não aplicou NÃO é falha do registro — é falha de
 * contabilidade, e fica visível para alguém resolver. O inverso (derrubar
 * o registro porque o saldo não bate) perderia a rastreabilidade para
 * proteger o estoque, que é a troca errada.
 */
export function pendentesDeBaixa(linhas = []) {
  const v = vigentes(linhas);
  if (naoDeuParaLer(v)) return [];
  return v.filter(l => !l.baixa_estoque && !l.consignado && l.item_id != null);
}

/** Uma linha de texto do material, para o cartão e para o prontuário. */
export function resumoDoMaterial(l) {
  if (!l) return null;
  return [
    l.quantidade && Number(l.quantidade) !== 1 ? `${l.quantidade}×` : null,
    l.descricao,
    l.lote ? `lote ${l.lote}` : null,
    l.numero_serie ? `série ${l.numero_serie}` : null,
    l.fabricante || null,
    l.consignado ? "consignado" : null,
  ].filter(Boolean).join(" · ");
}

/**
 * 🔴 O TERMO DE BUSCA DO RECALL, normalizado.
 *
 * Lote vem de etiqueta e é digitado por gente: " lot-a77 " e "LOT-A77" são
 * o mesmo lote, e um recall que erra por causa de espaço em branco é um
 * recall que não aconteceu. O índice do banco é sobre
 * `lower(btrim(lote))` — a mesma normalização, dos dois lados.
 */
export function termoDeBusca(v) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Monta a resposta do recall a partir das linhas cruas.
 *
 * Agrupa por PACIENTE, não por cirurgia: quem conduz o recall precisa
 * ligar para pessoas, e a mesma pessoa pode ter recebido duas peças do
 * lote em duas cirurgias.
 */
export function agruparRecall(linhas = []) {
  const porPaciente = new Map();
  for (const l of (Array.isArray(linhas) ? linhas : [])) {
    const chave = l.prontuario || `cirurgia-${l.cirurgia_id}`;
    if (!porPaciente.has(chave)) {
      porPaciente.set(chave, {
        prontuario: l.prontuario || null,
        nome: l.nome_completo || l.iniciais || null,
        itens: [],
      });
    }
    porPaciente.get(chave).itens.push(l);
  }
  return [...porPaciente.values()]
    .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
}
