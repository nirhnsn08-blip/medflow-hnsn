// ═══════════════════════════════════════════════════════════
// APRAZAMENTO — quem decide a hora da dose é a enfermagem
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 O QUE ISTO CONSERTA
//
// A grade de medicação deste sistema DERIVA os horários de uma âncora fixa
// de 06h: 8/8h vira 06h, 14h, 22h, para todo paciente, sempre. Isso é
// palpite, e palpite numa grade de medicação tem dois custos:
//
//   · o horário mostrado não é o que a enfermagem combinou — então a tela
//     e a beira do leito contam histórias diferentes;
//   · o atraso é medido contra uma hora que ninguém prometeu.
//
// Aprazar é ato de enfermagem com registro no conselho (COFEN). Por isso o
// aprazamento carimba QUEM aprazou, com conselho e número — e `pep_aprazamentos`
// já nascera com esses campos. Medido em 15/10/2026: a tabela existe
// inteira, com `previsto_para`, `dose_prevista`, `sequencia`, `aprazado_por`,
// `conselho`, `registro_conselho` — e ZERO usos em todo o código.
//
// 💡 UMA LINHA POR DOSE, e não uma lista de horários no item.
//
// Parece mais trabalho e é o que permite o caso real: adiar ou suspender
// UMA dose ("as 18h não, o paciente desce para cirurgia") sem mexer nas
// outras. Uma lista `["06:00","14:00","22:00"]` no item não consegue
// dizer isso — é tudo ou nada.
//
// ⚠️ APPEND-ONLY. Reaprazar não apaga: cancela as doses futuras com motivo
// e insere as novas. O rastro de quem aprazou o quê fica — é ato de
// enfermagem, e apagar quem fez é apagar a responsabilidade.
// ═══════════════════════════════════════════════════════════

import { diaLocal } from "../util/datas.js";
import { naoDeuParaLer } from "../util/leitura.js";

const texto = v => String(v ?? "").trim();
const pad2 = n => String(n).padStart(2, "0");

/** Quantos caracteres de motivo valem para cancelar uma dose aprazada. */
export const MIN_MOTIVO = 5;

/** Até onde o aprazamento alcança quando a prescrição não diz a duração. */
export const DIAS_PADRAO = 7;

/** O intervalo entre doses, em horas. `null` quando não dá para saber. */
export function intervaloDe(item) {
  if (!item || item.se_necessario) return null;
  const direto = Number(item.intervalo_horas);
  if (Number.isFinite(direto) && direto > 0) return direto;
  const freq = Number(item.frequencia_dia);
  if (Number.isFinite(freq) && freq > 0) return 24 / freq;
  return null;
}

/**
 * Os horários que a tela PROPÕE — a enfermagem ajusta antes de assinar.
 *
 * 🔴 COMEÇA NO INÍCIO DA PRESCRIÇÃO, não às 06h. É a diferença entre uma
 * sugestão que a enfermagem aceita e uma que ela corrige toda vez: uma
 * medicação 8/8h iniciada às 22h vira 22h, 06h, 14h — que é o que de fato
 * acontece na enfermaria.
 *
 * ⚠️ Devolve `[]` para SOS, e isso não é omissão: "se necessário" não tem
 * hora marcada por definição. Propor horário para SOS faria a grade cobrar
 * uma dose que ninguém prometeu.
 *
 * 🔴 `agora` EXISTE PORQUE PRESCRIÇÃO VELHA É O CASO COMUM, e isso foi
 * visto ANDANDO no demo (15/10/2026): um item de uma prescrição com 89
 * dias sugeria 21 doses começando em 23 de julho — todas no passado, todas
 * nascendo atrasadas. Aprazar é um ato de HOJE.
 *
 * ⚠️ Mas o RITMO continua vindo do início: as doses de uma prescrição
 * iniciada às 08:55 seguem caindo em 08:55/16:55/00:55, só que a partir de
 * agora. Reancorar no relógio do momento do aprazamento mudaria o horário
 * da medicação toda vez que alguém reaprazasse — e aí o paciente tomaria o
 * antibiótico numa hora diferente a cada turno.
 */
export function horariosSugeridos(item, inicio, dias = null, agora = new Date()) {
  const intervalo = intervaloDe(item);
  if (!intervalo) return [];
  // 🔴 `new Date(null)` É 1970, NÃO data inválida — e `new Date(undefined)`
  // é inválida. Sem esta guarda, um item sem início geraria sete dias de
  // doses em 1970: lixo com cara de aprazamento, que a grade mostraria.
  // Pego pelo próprio teste ao escrever.
  if (inicio === null || inicio === undefined || inicio === "") return [];
  const t0 = new Date(inicio);
  if (Number.isNaN(t0.getTime())) return [];

  const quantosDias = Number(dias ?? item?.duracao_dias) > 0
    ? Number(dias ?? item.duracao_dias) : DIAS_PADRAO;

  // ⚠️ Arredonda o início para o minuto: segundos na hora da dose não
  // significam nada e fariam cada reaprazamento gerar horários diferentes.
  t0.setSeconds(0, 0);

  // 🔴 A PRIMEIRA DOSE É A PRIMEIRA QUE AINDA NÃO PASSOU, mantendo o ritmo
  // do início. Avança em passos do intervalo em vez de reancorar no
  // relógio: assim 08:55/16:55/00:55 continua sendo 08:55/16:55/00:55.
  const ms = intervalo * 3600000;
  const tAgora = new Date(agora).getTime();
  let inicioReal = t0.getTime();
  if (Number.isFinite(tAgora) && inicioReal < tAgora) {
    const passos = Math.ceil((tAgora - inicioReal) / ms);
    inicioReal += passos * ms;
  }

  const out = [];
  const fim = inicioReal + quantosDias * 24 * 3600000;
  for (let t = inicioReal, seq = 1; t < fim; t += ms, seq++) {
    out.push({ previsto_para: new Date(t), sequencia: seq });
  }
  return out;
}

/** "HH:MM" de um instante, para a tela. */
export function hhmm(d) {
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? "" : `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
}

/**
 * O aprazamento pode ser assinado?
 *
 * ⚠️ As recusas são poucas de propósito. A enfermagem conhece o serviço
 * melhor que esta função: recusar um horário "estranho" (uma dose às 03h)
 * seria o sistema discutindo com quem está na enfermaria. O que se recusa
 * é o que não pode estar certo de jeito nenhum.
 */
export function conferirAprazamento({ item, doses, profissional } = {}) {
  if (!item) return "Escolha o item da prescrição.";
  if (item.se_necessario) {
    return "Item 'se necessário' não se apraza: por definição ele não tem hora marcada. Quem decide é quem avalia o paciente na hora.";
  }
  const lista = (Array.isArray(doses) ? doses : []).filter(Boolean);
  if (!lista.length) return "Nenhuma dose aprazada. Informe ao menos um horário.";

  const instantes = lista.map(d => new Date(d.previsto_para).getTime());
  if (instantes.some(t => Number.isNaN(t))) {
    return "Há horário que não é uma data válida.";
  }
  // 🔴 DUAS DOSES NA MESMA HORA é erro de digitação com cara de rotina — e
  // o resultado é dose dobrada ou dose que ninguém dá, porque a segunda
  // "já aparece administrada".
  if (new Set(instantes).size !== instantes.length) {
    return "Há duas doses no mesmo horário. Confira — dose repetida vira dose dobrada ou dose que ninguém dá.";
  }

  // ⚠️ AVISO, NÃO RECUSA: o número de doses pode legitimamente diferir da
  // frequência no primeiro e no último dia.
  const p = profissional || {};
  if (!texto(p.conselho) || !texto(p.registro_conselho)) {
    return "Aprazar é ato de enfermagem com registro no conselho. Sem conselho e número no seu cadastro, o aprazamento não pode ser assinado.";
  }
  return null;
}

/**
 * O que diverge da frequência prescrita — aviso, não recusa.
 *
 * 🔴 A frequência é do MÉDICO e o horário é da ENFERMAGEM; quando o número
 * de doses do dia não bate com a frequência, alguém precisa olhar. Mas
 * recusar seria errado: o primeiro e o último dia têm legitimamente menos
 * doses, e há serviços que concentram horários por rotina da unidade.
 */
export function divergenciasDeFrequencia(item, doses) {
  const freq = Number(item?.frequencia_dia);
  if (!Number.isFinite(freq) || freq <= 0) return [];
  const porDia = new Map();
  for (const d of (Array.isArray(doses) ? doses : [])) {
    const dia = diaLocal(d.previsto_para);
    porDia.set(dia, (porDia.get(dia) || 0) + 1);
  }
  const dias = [...porDia.keys()].sort();
  // O primeiro e o último dia ficam de fora: é esperado que sejam parciais.
  return dias.slice(1, -1)
    .filter(dia => porDia.get(dia) !== freq)
    .map(dia => `${dia}: ${porDia.get(dia)} dose(s), e a prescrição diz ${freq} por dia.`);
}

// ── O QUE VAI PARA O BANCO ──────────────────────────────────

/**
 * ⚠️ NÃO manda `id` nem `criado_em`. E manda `conselho`/`registro_conselho`
 * CARIMBADOS: o cadastro do profissional muda, e quem aprazou ontem
 * aprazou com o registro que tinha ontem.
 */
export function linhasDoAprazamento({ item, episodio, doses, profissional, observacao } = {}) {
  return (Array.isArray(doses) ? doses : []).filter(Boolean).map(d => ({
    item_id: item?.id ?? null,
    prescricao_id: item?.prescricao_id ?? null,
    episodio_id: episodio?.id ?? null,
    prontuario: episodio?.prontuario ?? null,
    previsto_para: new Date(d.previsto_para).toISOString(),
    sequencia: d.sequencia ?? null,
    dose_prevista: texto(d.dose_prevista ?? item?.dose) || null,
    via: texto(item?.via) || null,
    observacao: texto(observacao) || null,
    aprazado_por: texto(profissional?.nome ?? profissional?.profissional_nome) || null,
    conselho: texto(profissional?.conselho) || null,
    registro_conselho: texto(profissional?.registro_conselho) || null,
  }));
}

// ── O QUE VALE AGORA ────────────────────────────────────────

/**
 * As doses aprazadas e NÃO canceladas de um item.
 *
 * 🔴 `FALHA` atravessa como `null`. Lista vazia na grade lê-se "este item
 * não foi aprazado", e aí a tela volta a derivar da âncora — inventando
 * horário em cima de uma leitura que não desceu.
 */
export function dosesVigentes(aprazamentos, itemId) {
  if (naoDeuParaLer(aprazamentos)) return null;
  return (Array.isArray(aprazamentos) ? aprazamentos : [])
    .filter(a => a && String(a.item_id) === String(itemId))
    .filter(a => !a.cancelado_em)
    .sort((a, b) => new Date(a.previsto_para) - new Date(b.previsto_para));
}

/**
 * Das doses vigentes, as que um reaprazamento pode trocar.
 *
 * 🔴 ACHADO CAMINHANDO NO DEMO (16/10/2026). O painel de reaprazamento
 * vinha com TODAS as vigentes — inclusive as do passado e a que já tinha
 * sido administrada — enquanto o texto logo acima dizia o contrário: "as
 * que já foram dadas ficam como estão". Duas consequências:
 *
 *   1. reaprazar REINSERIA doses no passado, que é o defeito da
 *      prescrição velha voltando por outra porta;
 *   2. a dose já administrada continua VIGENTE (não se cancela o que
 *      aconteceu), então reinseri-la no mesmo instante batia no índice
 *      único e derrubava o reaprazamento inteiro.
 *
 * ⚠️ DOSE PASSADA E NÃO ADMINISTRADA TAMBÉM FICA. Ela é a prova de que
 * uma dose foi perdida; cancelá-la apagaria a falha junto com o plano.
 *
 * 🔴 `null` atravessa: leitura que não desceu não é "não há dose".
 */
export function dosesSubstituiveis(vigentes, administracoes, agora = new Date()) {
  if (vigentes == null || naoDeuParaLer(vigentes)) return null;
  const t = new Date(agora).getTime();
  if (!Number.isFinite(t)) return null;
  const dadas = new Set((Array.isArray(administracoes) ? administracoes : [])
    .filter(a => a && a.aprazamento_id != null
              && (a.status || "administrado") === "administrado")
    .map(a => String(a.aprazamento_id)));
  return (Array.isArray(vigentes) ? vigentes : []).filter(d => {
    if (!d || dadas.has(String(d.id))) return false;
    const q = new Date(d.previsto_para).getTime();
    return Number.isFinite(q) && q > t;
  });
}

/**
 * Este item foi aprazado?
 *
 * ⚠️ `null` quando não se sabe — e quem chama precisa distinguir, porque a
 * resposta "não foi aprazado" faz a grade derivar horários, e derivar em
 * cima de ignorância é inventar.
 */
export function foiAprazado(aprazamentos, itemId) {
  const v = dosesVigentes(aprazamentos, itemId);
  return v === null ? null : v.length > 0;
}

/**
 * Os horários do DIA para um item: os aprazados, quando existem.
 *
 * 🔴 Devolve `{ horarios, origem }`, e a origem importa na tela: um
 * horário APRAZADO foi combinado por alguém e tem nome; um DERIVADO é
 * palpite do sistema. Mostrar os dois iguais faria a enfermagem confiar
 * no palpite do mesmo jeito que confia no combinado.
 */
export function horariosDoItemNoDia(aprazamentos, item, dia) {
  const v = dosesVigentes(aprazamentos, item?.id);
  if (v === null) return { horarios: null, origem: "indisponivel" };
  const alvo = diaLocal(dia);
  const doDia = v.filter(a => diaLocal(a.previsto_para) === alvo);
  if (!doDia.length) return { horarios: [], origem: v.length ? "aprazado" : "sem_aprazamento" };
  return {
    horarios: doDia.map(a => new Date(a.previsto_para)),
    doses: doDia,
    origem: "aprazado",
  };
}

/**
 * Qual dose aprazada uma administração cumpriu.
 *
 * 🔴 ISTO SUBSTITUI UMA INFERÊNCIA. Hoje `checarAprazamento` adivinha
 * ("o último horário previsto igual ou anterior à administração"). Com o
 * aprazamento gravado, a administração pode DIZER qual dose cumpriu — e
 * `pep_administracoes.aprazamento_id` e `previsto_para` existem para isso,
 * também com zero usos.
 *
 * ⚠️ Devolve `null` quando nenhuma dose aprazada está aberta. Isso é
 * legítimo: uma dose extra, um SOS, uma administração fora do plano. Forçar
 * um casamento inventaria que a dose das 14h foi dada quando ninguém a deu.
 */
export function doseQueEstaSendoCumprida(doses, agora, toleranciaMin = 240) {
  const lista = (Array.isArray(doses) ? doses : [])
    .filter(d => d && !d.cancelado_em && !d.administrado)
    .sort((a, b) => new Date(a.previsto_para) - new Date(b.previsto_para));
  const t = new Date(agora).getTime();
  if (Number.isNaN(t)) return null;

  // A última dose que já venceu e ainda não foi cumprida. Se nenhuma
  // venceu, a próxima dentro da tolerância — quem administra 10 minutos
  // antes da hora está cumprindo aquela dose, não criando uma extra.
  let vencida = null;
  for (const d of lista) {
    const p = new Date(d.previsto_para).getTime();
    if (p <= t) vencida = d;
    else if (vencida === null && p - t <= toleranciaMin * 60000) return d;
    else break;
  }
  return vencida;
}
