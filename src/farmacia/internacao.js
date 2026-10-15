// ═══════════════════════════════════════════════════════════
// A INTERNAÇÃO NA FARMÁCIA — fila, validação e o que falta dispensar
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE (17/09/2026)
// A farmácia só lia o pronto-socorro. A prescrição do prontuário de
// internação — que é onde está a maior parte do trabalho de uma farmácia
// hospitalar, a dose das 24 horas — não chegava a nenhuma tela: ninguém a
// validava, e o internado era dispensado pela "dispensação avulsa", com as
// iniciais digitadas à mão e sem vínculo com o item prescrito.
//
// A PRESCRIÇÃO QUE VALE
// Não se reinventa aqui: `prescricaoVigente` e `itensAtivos` são as MESMAS
// funções que o prontuário usa para mostrar a prescrição ao médico. Se a
// farmácia tivesse a sua regra de "vigente", mais cedo ou mais tarde ela
// dispensaria um item que o prontuário já mostra suspenso.
//
// O VÍNCULO
// A saída do kardex aponta para o item em `pep_item_id`. O item do PS usa
// `prescricao_item_id` — são tabelas diferentes com ids que se repetem, e
// a conta de "quanto saiu" (`dispensadoDoItem`) recebe a chave explícita.
// ═══════════════════════════════════════════════════════════

import { itensAtivos, prescricaoVigente, estadoDosItens } from "../clinico/prontuario.js";
import { naoDeuParaLer } from "../util/leitura.js";
import { dispensadoDoItem } from "./preparo.js";

export const CHAVE_ITEM_INTERNACAO = "pep_item_id";

/** Os resultados da avaliação farmacêutica, como a tela os mostra. */
export const RESULTADOS_VALIDACAO = {
  aprovada:              { label: "Validada",                 cor: "#34d399" },
  aprovada_com_ressalva: { label: "Validada com ressalva",    cor: "#d97706" },
  pendente_prescritor:   { label: "Pendente do prescritor",   cor: "#f43f5e" },
};

/** Estados que não são resultado gravado. */
export const SEM_VALIDACAO = {
  nao_validada: { label: "Não validada",               cor: "#8d99ab" },
  nao_lida:     { label: "Validação NÃO conferida",    cor: "#f43f5e" },
};

const id = v => (v == null ? "" : String(v));
const quando = r => new Date(r?.criado_em || 0).getTime();

/** A avaliação mais recente de uma prescrição, ou null. */
export function ultimaValidacao(validacoes, prescricaoId) {
  let melhor = null;
  for (const v of Array.isArray(validacoes) ? validacoes : []) {
    if (!v || id(v.prescricao_id) !== id(prescricaoId)) continue;
    if (!melhor || quando(v) > quando(melhor) || (quando(v) === quando(melhor) && Number(v.id) > Number(melhor.id))) melhor = v;
  }
  return melhor;
}

/**
 * Em que pé está a validação da prescrição.
 *
 * ⚠️ `nao_lida` NÃO é `nao_validada`. Se a leitura da tabela falhou, dizer
 * "não validada" mandaria o farmacêutico validar de novo o que já validou;
 * dizer "validada" seria pior. A tela diz que não conseguiu conferir.
 */
export function situacaoDaValidacao(validacoes, prescricao) {
  if (!prescricao) return { estado: "sem_prescricao", linha: null };
  if (naoDeuParaLer(validacoes)) return { estado: "nao_lida", linha: null };
  const linha = ultimaValidacao(validacoes, prescricao.id);
  return linha ? { estado: linha.resultado, linha } : { estado: "nao_validada", linha: null };
}

/** Rótulo e cor de qualquer estado de validação. */
export function rotuloDaValidacao(estado) {
  return RESULTADOS_VALIDACAO[estado] || SEM_VALIDACAO[estado] || { label: "—", cor: "#8d99ab" };
}

/**
 * Pode dispensar os itens desta prescrição?
 *
 * Só a pendência RECUSA: foi o farmacêutico que disse "não sai até o
 * prescritor responder", e a dispensação que passasse por cima desfaria a
 * decisão dele. Prescrição ainda não validada AVISA e deixa seguir — a
 * primeira dose de um antibiótico não espera a farmácia clínica abrir.
 */
export function podeDispensarInternado(situacao) {
  const s = situacao || {};
  const obs = s.linha?.observacao ? ` Motivo: ${s.linha.observacao}` : "";
  switch (s.estado) {
    case "pendente_prescritor":
      return { ok: false, erros: [`O farmacêutico marcou esta prescrição como PENDENTE DO PRESCRITOR.${obs} Dispense depois da reavaliação.`], avisos: [] };
    case "aprovada_com_ressalva":
      return { ok: true, erros: [], avisos: [`Validada com ressalva.${obs}`] };
    case "nao_validada":
      return { ok: true, erros: [], avisos: ["Esta prescrição ainda não foi validada pelo farmacêutico."] };
    case "nao_lida":
      return { ok: true, erros: [], avisos: ["Não foi possível ler a validação farmacêutica desta prescrição. Confira antes de dispensar."] };
    case "sem_prescricao":
      return { ok: false, erros: ["Não há prescrição assinada vigente para este paciente."], avisos: [] };
    default:
      return { ok: true, erros: [], avisos: [] };
  }
}

/** Episódio aberto: status aberto e sem alta registrada. */
export const episodioAberto = e => !!e && (e.status || "aberto") === "aberto" && !e.alta_em;

/**
 * A fila da internação: um cartão por episódio aberto com prescrição
 * vigente que tenha medicamento.
 *
 * Cada linha traz:
 *   presc        a prescrição vigente (mesma regra do prontuário)
 *   itens        os itens ATIVOS de medicamento, com `medicamento_nome`
 *                (o motor de alertas nasceu no PS e lê esse nome)
 *   aDispensar   itens com medicamento do catálogo e nada dispensado
 *   semCatalogo  medicamento escrito à mão: não há o que baixar do estoque
 *   suspensosComSaida  item suspenso/encerrado que já saiu — candidato a devolução
 *   validacao    { estado, linha }
 */
export function filaDaInternacao({ episodios = [], prescricoes = [], itens = [], eventos = [], movimentos = [], validacoes = [] } = {}) {
  const fila = [];
  const estado = estadoDosItens(eventos);
  for (const ep of (Array.isArray(episodios) ? episodios : []).filter(episodioAberto)) {
    const doEp = (Array.isArray(prescricoes) ? prescricoes : []).filter(p => id(p.episodio_id) === id(ep.id));
    const presc = prescricaoVigente(doEp);
    if (!presc) continue;

    const daPresc = (Array.isArray(itens) ? itens : []).filter(i => id(i.prescricao_id) === id(presc.id));
    const deMedicamento = i => (i.tipo || "medicamento") === "medicamento";
    const comNome = i => ({ ...i, medicamento_nome: i.medicamento_nome || i.descricao });

    const ativos = itensAtivos(daPresc, eventos).filter(deMedicamento).map(comNome);
    if (!ativos.length) continue;

    const saiu = i => dispensadoDoItem(i.id, movimentos, CHAVE_ITEM_INTERNACAO);
    const suspensosComSaida = daPresc
      .filter(deMedicamento)
      .filter(i => (estado[i.id] || "ativo") !== "ativo" && saiu(i) > 0)
      .map(i => ({ ...comNome(i), estado: estado[i.id], dispensado: saiu(i) }));

    fila.push({
      ep,
      presc,
      itens: ativos,
      aDispensar: ativos.filter(i => i.medicamento_id && saiu(i) <= 0),
      semCatalogo: ativos.filter(i => !i.medicamento_id),
      suspensosComSaida,
      validacao: situacaoDaValidacao(validacoes, presc),
    });
  }
  return fila;
}

/** O que vai no movimento de estoque quando a saída é para um item da internação. */
export function vinculoDoInternado(ep, presc) {
  return {
    episodio_id: ep?.id ?? null,
    paciente_iniciais: ep?.iniciais || null,
    paciente_prontuario: ep?.prontuario || null,
    setor: [ep?.setor, ep?.leito ? `leito ${ep.leito}` : null].filter(Boolean).join(" · ") || null,
    prescritor_nome: presc?.prescritor_nome || null,
    prescritor_registro: presc?.registro_conselho
      ? [presc.conselho, presc.registro_conselho].filter(Boolean).join(" ")
      : null,
  };
}
