// ═══════════════════════════════════════════════════════════
// GLOSA RECEBIDA — O PRAZO, O RECURSO E O QUE VOLTOU
//
// Existem DUAS glosas neste sistema, e elas não se misturam:
//
//   PREVENTIVA  `avaliarGlosa` em sigtap.js — olha a conta ANTES de sair e
//               avisa o que provavelmente será cortado. Evita o prejuízo.
//   RECEBIDA    este arquivo — o dinheiro que a operadora JÁ recusou. Só
//               volta por recurso, e só dentro do prazo.
//
// 🔴 O PRAZO É O PRODUTO INTEIRO.
// Glosa sem recurso no prazo não vira prejuízo depois: ela JÁ É prejuízo, e
// silencioso. Ninguém recebe aviso, nada apita, o dinheiro simplesmente não
// entra e some do relatório do mês seguinte como se nunca tivesse existido.
//
// ⚠️ TRÊS ESTADOS DE PRAZO, NÃO DOIS.
// "sem prazo informado" NÃO é "prazo ok". É a mesma armadilha de
// util/leitura.js num lugar diferente: ausência de dado lida como boa
// notícia. Uma glosa sem prazo pode estar vencendo hoje — só ninguém sabe,
// e é por isso que ela aparece com destaque próprio em vez de se esconder
// no fim de uma fila ordenada por data nula.
//
// ⚠️ FADIGA DE ALARME. Nem toda glosa é vermelha. Vermelho é só vencido e
// o que vence dentro da janela crítica; o resto é a fila normal de
// trabalho. Pintar tudo faria a tela virar decoração em duas semanas — a
// mesma lição do banner do painel e dos alertas da farmácia.
// ═══════════════════════════════════════════════════════════

import { listaLida } from "../util/leitura.js";

/**
 * O ciclo de vida da glosa.
 *
 * `aberta: true` = ainda dá para agir; é o que entra na fila de trabalho e
 * o que faz o prazo importar. Uma vez encerrada (recuperada/perdida/aceita)
 * o prazo deixa de significar qualquer coisa.
 */
export const SITUACOES = {
  recebida:        { label: "Recebida",       aberta: true,  cor: "#f59e0b", dica: "Chegou e ainda não foi analisada." },
  em_recurso:      { label: "Em recurso",     aberta: true,  cor: "#38bdf8", dica: "Em análise/preparo do recurso, ainda não enviado." },
  recurso_enviado: { label: "Recurso enviado", aberta: true, cor: "#818cf8", dica: "Protocolado na operadora, aguardando resposta." },
  recuperada:      { label: "Recuperada",     aberta: false, cor: "#22c55e", dica: "O recurso trouxe dinheiro de volta." },
  perdida:         { label: "Perdida",        aberta: false, cor: "#f43f5e", dica: "Recurso negado, ou o prazo passou." },
  aceita:          { label: "Aceita",         aberta: false, cor: "#8d99ab", dica: "O hospital reconheceu a glosa e não recorreu." },
};

export const SITUACOES_ABERTAS = Object.keys(SITUACOES).filter(k => SITUACOES[k].aberta);

/**
 * Dias que faltam para o prazo do recurso.
 * `null` quando não há prazo informado — e null aqui NÃO quer dizer "muito
 * tempo", quer dizer "não sei".
 */
export function diasAteOPrazo(glosa, hoje = new Date()) {
  const p = glosa?.prazo_recurso_em;
  if (!p) return null;
  const alvo = new Date(`${String(p).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(alvo.getTime())) return null;
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - base) / 86400000);
}

/** Dentro de quantos dias uma glosa em aberto já é urgente. */
export const DIAS_CRITICO = 7;
export const DIAS_ATENCAO = 15;

/**
 * O estado do prazo, para a tela pintar.
 *
 *   encerrada  já acabou, o prazo não importa mais
 *   sem_prazo  ninguém informou — pode estar vencendo HOJE
 *   vencido    passou
 *   critico    vence dentro de DIAS_CRITICO
 *   atencao    vence dentro de DIAS_ATENCAO
 *   ok         há tempo
 */
export function estadoDoPrazo(glosa, hoje = new Date()) {
  if (!SITUACOES[glosa?.situacao]?.aberta) return "encerrada";
  const d = diasAteOPrazo(glosa, hoje);
  if (d === null) return "sem_prazo";
  if (d < 0) return "vencido";
  if (d <= DIAS_CRITICO) return "critico";
  if (d <= DIAS_ATENCAO) return "atencao";
  return "ok";
}

// Quanto mais urgente, menor o número — é a ordem da fila.
const PESO = { vencido: 0, sem_prazo: 1, critico: 2, atencao: 3, ok: 4, encerrada: 5 };

/**
 * A fila de trabalho: só o que está em aberto, do mais urgente ao menos.
 *
 * ⚠️ `sem_prazo` vem LOGO DEPOIS do vencido, não no fim. Ordenar por data
 * com nulo no fim empurraria para o rodapé justamente a glosa sobre a qual
 * não se sabe nada — e some quem mais precisa de olho.
 */
export function filaDeTrabalho(glosas, hoje = new Date()) {
  const abertas = listaLida(glosas).filter(g => SITUACOES[g?.situacao]?.aberta);
  return abertas
    .map(g => ({ ...g, prazoEstado: estadoDoPrazo(g, hoje), diasRestantes: diasAteOPrazo(g, hoje) }))
    .sort((a, b) => {
      const p = PESO[a.prazoEstado] - PESO[b.prazoEstado];
      if (p !== 0) return p;
      // dentro do mesmo estado, o prazo mais curto primeiro; depois o valor maior
      if (a.diasRestantes !== null && b.diasRestantes !== null && a.diasRestantes !== b.diasRestantes) {
        return a.diasRestantes - b.diasRestantes;
      }
      return Number(b.valor_glosado || 0) - Number(a.valor_glosado || 0);
    });
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Os números do painel de glosas.
 *
 * 🔴 A TAXA DE RECUPERAÇÃO SÓ CONTA O QUE JÁ TERMINOU.
 * `valor_recuperado` nulo é "o recurso ainda não acabou", e contar isso
 * como zero recuperado faria a taxa despencar toda vez que chegasse glosa
 * nova — exatamente quando o setor está trabalhando MAIS. O denominador é
 * o que foi ENCERRADO, não o que foi glosado.
 */
export function resumoGlosas(glosas, hoje = new Date()) {
  const lista = listaLida(glosas);
  const r = {
    total: lista.length,
    valorGlosado: 0,
    valorRecuperado: 0,
    valorEmAberto: 0,
    glosadoEncerrado: 0,
    abertas: 0, vencidas: 0, criticas: 0, semPrazo: 0,
    taxaRecuperacao: null,
  };

  for (const g of lista) {
    const v = num(g?.valor_glosado);
    r.valorGlosado += v;

    const sit = SITUACOES[g?.situacao];
    if (sit?.aberta) {
      r.abertas++;
      r.valorEmAberto += v;
      const e = estadoDoPrazo(g, hoje);
      if (e === "vencido") r.vencidas++;
      else if (e === "critico") r.criticas++;
      else if (e === "sem_prazo") r.semPrazo++;
    } else if (sit) {
      // encerrada: entra no denominador da taxa
      r.glosadoEncerrado += v;
      r.valorRecuperado += num(g?.valor_recuperado);
    }
  }

  // null (e não 0) quando nada foi encerrado ainda: "sem histórico" não é
  // "0% de recuperação", e a diferença é a mesma de util/leitura.js.
  r.taxaRecuperacao = r.glosadoEncerrado > 0
    ? (r.valorRecuperado / r.glosadoEncerrado) * 100
    : null;

  return r;
}

/**
 * Por que a operadora glosou — agrupado, do que mais custa para o que menos.
 * Serve para atacar a causa: dez glosas do mesmo motivo é processo quebrado,
 * não azar.
 */
export function porMotivo(glosas) {
  const mapa = new Map();
  for (const g of listaLida(glosas)) {
    const chave = String(g?.motivo_codigo || g?.motivo || "(sem motivo informado)").trim() || "(sem motivo informado)";
    const at = mapa.get(chave) || { motivo: chave, descricao: g?.motivo || null, quantidade: 0, valor: 0 };
    at.quantidade++;
    at.valor += num(g?.valor_glosado);
    if (!at.descricao && g?.motivo) at.descricao = g.motivo;
    mapa.set(chave, at);
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

/**
 * O que impede de gravar. Devolve lista de recusas — vazia quer dizer pode.
 *
 * ⚠️ Espelha os CHECK do banco de propósito. A tela avisa antes; quem
 * RECUSA é o banco, porque glosa costuma chegar por import de planilha da
 * operadora e planilha não passa por tela nenhuma.
 */
export function recusasDaGlosa(g) {
  const fora = [];
  const valor = Number(g?.valor_glosado);

  if (!g?.conta_id) fora.push("Sem conta: a glosa precisa apontar para a conta glosada.");
  if (!Number.isFinite(valor) || valor <= 0) fora.push("Valor glosado tem que ser maior que zero.");
  if (!g?.recebida_em) fora.push("Sem a data de recebimento não há de quando contar o prazo.");

  if (g?.prazo_recurso_em && g?.recebida_em && g.prazo_recurso_em < g.recebida_em) {
    fora.push("O prazo do recurso não pode ser anterior ao recebimento.");
  }
  if (g?.recurso_enviado_em && g?.recebida_em && g.recurso_enviado_em < g.recebida_em) {
    fora.push("O recurso não pode ter sido enviado antes de a glosa chegar.");
  }

  const rec = g?.valor_recuperado;
  if (rec != null && rec !== "") {
    const n = Number(rec);
    if (!Number.isFinite(n) || n < 0) fora.push("Valor recuperado inválido.");
    else if (Number.isFinite(valor) && n > valor) {
      fora.push(`Não se recupera mais do que foi glosado (glosado ${valor}, recuperado ${n}).`);
    }
  }

  if (g?.situacao && !SITUACOES[g.situacao]) fora.push(`Situação desconhecida: ${g.situacao}.`);
  return fora;
}
