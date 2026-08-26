// ═══════════════════════════════════════════════════════════
// UNIFICAÇÃO DE PRONTUÁRIO — ligar duas fichas da mesma pessoa
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// A mesma pessoa acaba com duas fichas — chegou sem documento e depois com
// ele, o nome foi digitado de dois jeitos, veio pela emergência e depois
// pelo ambulatório. A partir daí o histórico fica PARTIDO: a alergia está
// numa ficha e a prescrição na outra, e quem atende só vê metade.
//
// ⚠️ O QUE ESTA FASE FAZ, E O QUE NÃO FAZ — leia antes de mexer.
//
// FAZ: registrar que o prontuário A é a mesma pessoa do prontuário B, com
// autor, data e o motivo escrito; e fazer as duas pontas se enxergarem.
//
// NÃO FAZ: MOVER o dado clínico de uma ficha para a outra. Não é
// esquecimento — é a única decisão possível hoje. `prontuario` aparece em
// TRINTA E QUATRO tabelas, e o PostgREST não tem transação entre
// requisições. Repontar 34 tabelas em 34 chamadas significa que uma falha
// no meio (rede, RLS, timeout) deixa o paciente partido num estado que
// ninguém sabe qual é — pior que a duplicata que se queria consertar,
// porque a duplicata pelo menos é visível. Mover exige uma função no
// Postgres, numa transação só; e ela é outro passo.
//
// Ligar sem mover já resolve a metade que mata: o "ninguém sabe que existe
// a outra ficha". Quem abre qualquer uma das duas passa a ver a outra.
//
// ⚠️ E O PONTEIRO NÃO SUBSTITUI A FICHA VELHA. Número de prontuário está
// em pulseira, em papel impresso, na memória das pessoas e em sistema de
// fora. A ficha antiga continua existindo e resolvível para sempre — ela
// só passa a dizer para onde olhar.
//
// 🔴 A RECUSA MAIS IMPORTANTE DO ARQUIVO: GÊMEOS.
// Dois irmãos do mesmo parto têm a mesma mãe, a mesma data de nascimento e
// nomes provisórios quase idênticos — 90% de confiança para o detector de
// duplicata. Unificá-los junta DUAS PESSOAS numa ficha só, e a partir dali
// a prescrição de um vale para o outro. É o erro mais grave que este
// sistema poderia produzir, e nasceria do recurso feito para evitar erro.
// Aqui isso é RECUSA, não aviso: aviso se fecha sem ler.
// ═══════════════════════════════════════════════════════════

import { limparDoc, normalizarNome } from "./identidade.js";
import { saoIrmaosDoMesmoParto } from "./recem-nascido.js";

const texto = v => String(v ?? "").trim();

/** O motivo é escrito por gente, e é o que alguém vai ler numa auditoria. */
export const MOTIVO_MIN = 15;

/**
 * Onde este prontuário virou — ou ele mesmo, quando não foi unificado.
 *
 * Uma volta só, de propósito: cadeia (A→B→C) não é criada, porque
 * `podeUnificar` recusa destino que já foi unificado. Se aparecer mesmo
 * assim (importação, correção manual no banco), é melhor devolver o passo
 * seguinte do que entrar em laço — laço não fica vermelho no teste, fica
 * TRAVADO, e isso já custou caro aqui.
 */
export const prontuarioVigente = paciente =>
  texto(paciente?.unificado_para) || texto(paciente?.prontuario);

/** Esta ficha foi unificada em outra? */
export const foiUnificado = paciente => !!texto(paciente?.unificado_para);

/**
 * Pode ligar `origem` em `destino`?
 *
 * `origem` é a ficha que passa a apontar; `destino` é a que sobrevive como
 * número de referência. Devolve `{ ok, erros, avisos }`.
 *
 * ⚠️ Os AVISOS aqui são sinais de que podem ser PESSOAS DIFERENTES. Eles
 * não bloqueiam porque cada um tem explicação inocente frequente (data
 * digitada errada, sexo em branco no cadastro antigo) — mas são exatamente
 * o que a pessoa precisa ler antes de confirmar.
 */
export function podeUnificar({ origem, destino, motivo } = {}) {
  const erros = [];
  const avisos = [];

  const a = texto(origem?.prontuario);
  const b = texto(destino?.prontuario);

  if (!a || !b) {
    erros.push("Escolha os dois prontuários: o que será unificado e o que fica como referência.");
    return { ok: false, erros, avisos };
  }
  if (a === b) {
    erros.push("São o mesmo prontuário.");
    return { ok: false, erros, avisos };
  }

  // 🔴 GÊMEOS: recusa, não aviso. Ver o cabeçalho.
  if (saoIrmaosDoMesmoParto(origem, destino)) {
    erros.push(
      "Estes dois nasceram do MESMO PARTO e são pessoas diferentes — a DNV ou a ordem de " +
      "nascimento provam. Unificar juntaria dois bebês numa ficha só, e a partir daí a " +
      "prescrição de um valeria para o outro.");
    return { ok: false, erros, avisos };
  }

  // Cadeia não se cria: o destino tem que ser o fim da linha.
  if (foiUnificado(destino)) {
    erros.push(
      "O prontuário " + b + " já foi unificado em " + prontuarioVigente(destino) + ". " +
      "Unifique em " + prontuarioVigente(destino) + ", que é o que está valendo.");
  }
  if (foiUnificado(origem)) {
    erros.push("O prontuário " + a + " já foi unificado em " + prontuarioVigente(origem) + ".");
  }

  // Documento diferente é prova de pessoa diferente — não é palpite.
  const cpfA = limparDoc(origem?.cpf), cpfB = limparDoc(destino?.cpf);
  if (cpfA.length === 11 && cpfB.length === 11 && cpfA !== cpfB) {
    erros.push("Os dois têm CPF, e são CPFs DIFERENTES. Isso não é duplicata: são duas pessoas.");
  }
  const cnsA = limparDoc(origem?.cns), cnsB = limparDoc(destino?.cns);
  if (cnsA.length === 15 && cnsB.length === 15 && cnsA !== cnsB) {
    erros.push("Os dois têm Cartão SUS, e são cartões DIFERENTES. Confira antes — o CNS é por pessoa.");
  }

  if (texto(motivo).length < MOTIVO_MIN) {
    erros.push(
      "Escreva por que são a mesma pessoa. Não é burocracia: é o que alguém vai ler daqui a um " +
      "ano para saber se a junção estava certa, e é a única coisa que a máquina não tem como saber.");
  }

  // ── sinais de pessoas diferentes: avisam, não impedem ──────
  const nascA = texto(origem?.data_nascimento).slice(0, 10);
  const nascB = texto(destino?.data_nascimento).slice(0, 10);
  if (nascA && nascB && nascA !== nascB) {
    avisos.push("As datas de nascimento são diferentes (" + nascA + " e " + nascB + "). " +
                "Uma das duas está errada — ou não é a mesma pessoa.");
  }

  const sexoA = texto(origem?.sexo), sexoB = texto(destino?.sexo);
  if (sexoA && sexoB && sexoA !== sexoB) {
    avisos.push("O sexo registrado é diferente nas duas fichas. Confira qual está certo antes de seguir.");
  }

  const maeA = normalizarNome(origem?.nome_mae), maeB = normalizarNome(destino?.nome_mae);
  if (maeA && maeB && maeA !== maeB) {
    avisos.push("O nome da mãe é diferente nas duas fichas — é o dado que mais separa homônimo de duplicata.");
  }

  if (origem?.obito && destino?.obito) {
    avisos.push("As duas fichas têm óbito registrado. Confira as datas: dois óbitos são duas pessoas.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * O que a tela diz em cima da ficha que foi unificada.
 *
 * `null` quando não há nada a dizer — aviso que aparece sempre não é lido.
 */
export function avisoDaFichaUnificada(paciente) {
  if (!foiUnificado(paciente)) return null;
  const para = prontuarioVigente(paciente);
  return {
    para,
    texto: "Este prontuário foi unificado em " + para + " — é a mesma pessoa. " +
           "O que foi registrado aqui continua aqui; o cadastro que vale é o " + para + ".",
  };
}

/**
 * O que a tela diz em cima da ficha que SOBREVIVEU.
 *
 * Sem isto o ponteiro seria de mão única: quem abre o prontuário certo não
 * saberia que existe histórico embaixo de outro número, que é exatamente o
 * problema que a unificação existe para resolver.
 */
export function avisoDaFichaDestino(unificados = []) {
  const lista = (Array.isArray(unificados) ? unificados : []).map(x => texto(x?.prontuario)).filter(Boolean);
  if (!lista.length) return null;
  const um = lista.length === 1;
  return {
    prontuarios: lista,
    texto: (um ? "O prontuário " : "Os prontuários ") + lista.join(", ") +
           (um ? " foi unificado" : " foram unificados") + " neste — é a mesma pessoa. " +
           "O histórico clínico registrado " + (um ? "nele" : "neles") + " continua no número de origem.",
  };
}

/** Todos os números pelos quais esta pessoa pode ter histórico. */
export function prontuariosDaPessoa(paciente, unificados = []) {
  const base = texto(paciente?.prontuario);
  const out = base ? [base] : [];
  for (const u of Array.isArray(unificados) ? unificados : []) {
    const x = texto(u?.prontuario);
    if (x && !out.includes(x)) out.push(x);
  }
  return out;
}
