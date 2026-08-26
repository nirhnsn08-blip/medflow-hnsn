// ═══════════════════════════════════════════════════════════
// PAINEL DE CHAMADA — o que a SALA DE ESPERA vê
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// A fila viva do ambulatório existe para quem está ATRÁS do balcão. Quem
// está sentado esperando não vê nada: a chamada é o nome gritado no
// corredor. Isso custa três coisas ao mesmo tempo —
//
//   • quem não ouve perde a vez, e vira FALTA no indicador que o hospital
//     usa para medir absenteísmo (o número passa a contar um problema de
//     acústica como se fosse desinteresse do paciente);
//   • o nome de quem está sendo atendido é anunciado para a sala inteira;
//   • a fila toda se levanta a cada chamada para perguntar se era ela.
//
// E A PRIORIDADE LEGAL PIOROU ISSO, NÃO MELHOROU.
// Desde que a fila passou a respeitar a Lei 10.048/2000, quem chegou às
// 9h00 vê alguém que chegou às 9h55 ser chamado na frente. Sem uma tela que
// explique, a ordem parece arbitrária — e ordem que não se explica é ordem
// que a sala contesta no balcão. O painel é o que torna a lei legível.
//
// ⚠️ A REGRA QUE MOLDA O ARQUIVO INTEIRO: ISTO É UMA TELA PÚBLICA.
// Fica numa TV que a sala de espera inteira enxerga, e qualquer pessoa que
// passe também. Então o painel mostra o MÍNIMO que permite a pessoa se
// reconhecer, e nada além:
//
//   ENTRA   iniciais, hora de chegada, especialidade, profissional, e o
//           SELO de prioridade.
//   NÃO ENTRA  nome completo, prontuário, queixa, CID, e o MOTIVO da
//           prioridade.
//
// O selo entra e o motivo não, e a diferença é deliberada: "PRIORITÁRIO" é
// o que todo serviço do país já exibe, e não conta nada que a sala não veja
// olhando a pessoa. "Gestante" ou "82 anos" ao lado das iniciais é
// informação de saúde numa parede. Quem precisa do motivo é o balcão, e lá
// ele aparece — na fila interna.
// ═══════════════════════════════════════════════════════════

import { comoExibir } from "../pacientes/identidade.js";

/**
 * Por quantos minutos a chamada continua no painel.
 *
 * O painel existe principalmente para quem NÃO OUVIU. Se a chamada sumisse
 * na chamada seguinte, quem voltou do banheiro trinta segundos depois
 * perderia a vez do mesmo jeito — e o painel teria resolvido nada.
 */
export const MINUTOS_EM_DESTAQUE = 5;

/** Quantos dos próximos aparecem. Lista longa numa TV ninguém lê. */
export const PROXIMOS_NO_PAINEL = 6;

/**
 * O que a TV mostra de UMA pessoa.
 *
 * Função separada e exportada de propósito: é o ponto único por onde os
 * dados de um paciente viram conteúdo de parede, e é ela que o teste
 * aponta para garantir que nome, prontuário e queixa não passam.
 *
 * `comoExibir` sem `{ completo: true }` já devolve as INICIAIS — é o padrão
 * da casa para exibir paciente, e aqui ele é obrigatório, não preferência.
 *
 * A HORA DE CHEGADA é o que desempata iniciais repetidas, e foi escolhida
 * por não ser sensível: a pessoa sabe a que horas chegou, e o horário não
 * conta nada sobre ela. Prontuário desempataria melhor e é identificador
 * permanente — numa parede, é o que não se põe.
 */
export function linhaDoPainel(atendimento, agora = new Date()) {
  const a = atendimento || {};
  return {
    id: a.id ?? null,
    iniciais: comoExibir(a.paciente || a.pacientes || a) || a.iniciais || "—",
    chegada: chegadaLegivel(a.chegada_em, agora),
    especialidade: String(a.especialidade_cod ?? "").trim(),
    profissional: String(a.medico ?? "").trim(),
    // Só o selo. O motivo fica na fila interna, que é do balcão.
    prioridade: a.prioridade?.tem ? a.prioridade.rotulo : "",
  };
}

/** 'HH:MM' de um instante, ou "" — sem inventar hora que não existe. */
function horaCurta(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * 🔴 A HORA SOZINHA MENTE QUANDO A CHEGADA NÃO É DE HOJE.
 *
 * Achado percorrendo o painel: um atendimento aberto ONTEM e nunca encerrado
 * continua na fila, e a tela mostrava "chegou 15:45". A sala lê 15:45 de
 * hoje e conclui que a pessoa está ali — quando o que existe é um episódio
 * que ninguém fechou. A própria Agenda já avisa desses ("N ambulatoriais
 * aguardando encerramento"); o painel os exibia como se fossem gente
 * sentada.
 *
 * NÃO SE ESCONDE o que é de outro dia: sumir com a linha resolveria a
 * mentira criando outra, e quem chegou às 23h50 e é chamado às 00h10
 * desapareceria do painel. Aparece com o DIA, que denuncia o episódio
 * esquecido para quem opera e impede a sala de se enganar.
 */
function chegadaLegivel(valor, agora) {
  const hora = horaCurta(valor);
  if (!hora) return "";
  const d = new Date(valor);
  const dia = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (dia(d) === dia(agora)) return hora;

  const ontem = new Date(agora.getTime() - 86400000);
  if (dia(d) === dia(ontem)) return `ontem ${hora}`;

  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${hora}`;
}

/**
 * Minutos entre o instante e agora. `null` quando não dá para saber.
 */
function minutosDesde(quando, agora) {
  if (!quando) return null;
  const t = new Date(quando).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((agora.getTime() - t) / 60000);
}

/**
 * O painel, agora.
 *
 * Recebe a fila JÁ ORDENADA por `filaDoAmbulatorio` — a ordem da lei mora
 * lá, e repeti-la aqui criaria duas fontes que um dia divergem. Este
 * arquivo só decide o que APARECE e como.
 *
 * `chamando` sai de quem está em atendimento há pouco tempo, do mais
 * recente para o mais antigo: numa sala com dois consultórios, duas pessoas
 * podem ter sido chamadas quase juntas, e mostrar só a última faria a outra
 * continuar sentada.
 */
export function painelDeChamada(fila, { agora = new Date(), destaqueMin = MINUTOS_EM_DESTAQUE, limite = PROXIMOS_NO_PAINEL } = {}) {
  const emAtendimento = Array.isArray(fila?.emAtendimento) ? fila.emAtendimento : [];
  const esperando = Array.isArray(fila?.esperando) ? fila.esperando : [];

  const chamados = emAtendimento
    .map(a => ({ a, ha: minutosDesde(a.atendimento_em, agora) }))
    // `ha == null` fica de fora: sem hora de chamada não dá para saber se
    // foi agora ou ontem, e um nome parado na parede por tempo
    // indeterminado é pior que nome nenhum.
    .filter(x => x.ha != null && x.ha >= 0 && x.ha <= destaqueMin)
    .sort((x, y) => x.ha - y.ha)
    .map(x => ({ ...linhaDoPainel(x.a, agora), haMinutos: x.ha }));

  return {
    chamando: chamados,
    proximos: esperando.slice(0, limite).map(a => linhaDoPainel(a, agora)),
    // O total é da fila INTEIRA, não da fatia mostrada: "e mais 12
    // esperando" é o que diz à sala que a lista não acabou ali.
    aguardando: esperando.length,
    ocultos: Math.max(0, esperando.length - limite),
    // A sala precisa saber POR QUE a ordem não é a de chegada. Sem isto, o
    // painel exibe a lei e não a explica — e quem chegou primeiro vai ao
    // balcão perguntar, que é o que ele existe para evitar.
    temPrioritario: esperando.some(a => a.prioridade?.tem),
  };
}
