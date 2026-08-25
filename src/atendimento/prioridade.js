// ═══════════════════════════════════════════════════════════
// PRIORIDADE LEGAL NO ATENDIMENTO
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// A fila do ambulatório ordenava por TEMPO DE ESPERA e nada mais. Quem
// chegou antes era chamado antes, ponto — e a lei diz outra coisa:
//
//   Lei 10.048/2000, art. 1º — atendimento prioritário para pessoa com
//   deficiência, idoso com 60 anos ou mais, gestante, lactante, pessoa com
//   criança de colo e obeso.
//
//   Estatuto do Idoso (Lei 10.741/2003), art. 3º, §2º — entre os idosos, o
//   maior de 80 tem prioridade ESPECIAL sobre os demais idosos.
//
// O sistema não errava por conta própria: ele não sabia que prioridade
// existe, e quem opera o balcão sabe. O resultado é que a ordem real passava
// a ser combinada por fora da tela — e aí o tempo de espera que o relatório
// mostra deixa de descrever o que aconteceu de verdade.
//
// ⚠️ O QUE ESTE ARQUIVO NÃO FAZ, E É DE PROPÓSITO
// Não inventa proporção ("um prioritário a cada três normais"). A lei não
// fixa nenhuma, e cravar uma aqui seria política de atendimento decidida
// pelo programador. A ordem é a que a lei descreve — prioridade primeiro,
// tempo de espera para desempatar dentro de cada nível.
//
// O preço disso é que a fila normal pode ser ultrapassada indefinidamente
// num ambulatório de perfil idoso. Esse preço não fica escondido:
// `LIMITE_ESPERA_MIN` marca quem passou do tempo, prioritário ou não, para
// a espera longa aparecer em vez de ser absorvida pela ordenação.
// ═══════════════════════════════════════════════════════════

import { idadeDetalhada } from "../pacientes/identidade.js";

/** 60 anos — Lei 10.048/2000, art. 1º, e Estatuto do Idoso, art. 1º. */
export const IDOSO_ANOS = 60;

/**
 * 80 anos — Estatuto do Idoso, art. 3º, §2º.
 *
 * O texto diz "maiores de 80". Aqui vale a partir de 80 COMPLETOS, que é a
 * leitura corrente nos serviços: quem completou 80 já é tratado como
 * prioridade especial. A alternativa (só a partir de 81) tiraria a
 * prioridade de quem está exatamente na fronteira — e o erro nessa direção
 * é o que a lei quis evitar.
 */
export const IDOSO_ESPECIAL_ANOS = 80;

/**
 * Até 2 anos conta como criança de colo.
 *
 * A lei não define idade. Dois anos é a convenção dos serviços, e está aqui
 * como constante nomeada porque é o número que um hospital vai querer
 * discutir — melhor discutir uma linha do que caçar "2" no meio de uma
 * comparação.
 */
export const CRIANCA_DE_COLO_ANOS = 2;

/**
 * Depois de quanto tempo a espera vira aviso — para qualquer um.
 *
 * Não é regra legal: é a trava contra o efeito colateral da própria
 * prioridade. Sem ela, num dia de fila cheia de idosos, quem não tem
 * prioridade some do topo e ninguém percebe.
 */
export const LIMITE_ESPERA_MIN = 60;

/**
 * Os três níveis. Número, e não string, porque é por ele que se ORDENA —
 * comparar rótulo dá ordem alfabética, que aqui poria "normal" na frente.
 */
export const NIVEIS = {
  2: { chave: "especial", rotulo: "Prioridade especial", norma: "Estatuto do Idoso, art. 3º, §2º" },
  1: { chave: "prioritario", rotulo: "Prioritário", norma: "Lei 10.048/2000, art. 1º" },
  0: { chave: "normal", rotulo: "", norma: "" },
};

/**
 * As categorias da Lei 10.048 que este sistema AINDA NÃO SABE reconhecer.
 *
 * Está exportado para a tela poder dizer isso em voz alta. Uma fila que
 * ordena por prioridade e silencia sobre o que não enxerga é pior que a fila
 * sem prioridade nenhuma: a recepcionista passa a confiar na ordem e para de
 * conferir justamente as categorias que dependem dela.
 *
 * `pessoa com deficiência`, `lactante` e `obeso` não são deriváveis de nada
 * que o cadastro guarda hoje — precisam de campo, e campo declarado no
 * balcão. Enquanto não existir, quem opera continua responsável por elas.
 */
export const CATEGORIAS_SEM_CAMPO = [
  { chave: "pcd", rotulo: "Pessoa com deficiência" },
  { chave: "lactante", rotulo: "Lactante" },
  { chave: "obeso", rotulo: "Obeso" },
];

/**
 * A prioridade legal desta pessoa, agora.
 *
 * `motivos` é lista porque acumula: uma gestante de 82 anos é os dois, e a
 * tela que mostrar só um dos rótulos vai parecer errada para quem está
 * olhando a pessoa.
 *
 * A idade vem de `data_nascimento`, pela mesma função que a triagem
 * pediátrica usa — data civil, sem passar por `new Date` na string crua.
 * Sem data de nascimento não se chuta idade: quem não tem data fica no nível
 * normal e o motivo diz que a idade é desconhecida, para alguém conferir com
 * a pessoa em vez de o sistema decidir por ela.
 */
export function prioridadeLegal({ paciente, atendimento, agora = new Date() } = {}) {
  const motivos = [];
  let nivel = 0;

  const idade = idadeDetalhada(paciente?.data_nascimento, agora);
  const anos = idade?.anos ?? null;

  if (anos == null) {
    motivos.push({ chave: "idade_desconhecida", rotulo: "Idade desconhecida — confira com a pessoa", legal: false });
  } else if (anos >= IDOSO_ESPECIAL_ANOS) {
    nivel = 2;
    motivos.push({ chave: "idoso_especial", rotulo: `${anos} anos`, legal: true });
  } else if (anos >= IDOSO_ANOS) {
    nivel = Math.max(nivel, 1);
    motivos.push({ chave: "idoso", rotulo: `${anos} anos`, legal: true });
  } else if (anos < CRIANCA_DE_COLO_ANOS) {
    // A lei dá prioridade a "pessoa com criança de colo" — ou seja, a quem
    // TROUXE o bebê, não ao bebê. Na fila do ambulatório o paciente é o
    // bebê, e quem o trouxe está do lado: o efeito é o mesmo, mas o rótulo
    // diz de quem é o direito, para ninguém achar que a lei fala do bebê.
    nivel = Math.max(nivel, 1);
    motivos.push({ chave: "crianca_de_colo", rotulo: "Criança de colo — a prioridade é de quem a trouxe", legal: true });
  }

  // Gestante vem do EPISÓDIO, não do cadastro: é estado, não atributo da
  // pessoa. A triagem obstétrica do PS já grava isso.
  if (atendimento?.gestante) {
    nivel = Math.max(nivel, 1);
    motivos.push({ chave: "gestante", rotulo: "Gestante", legal: true });
  }

  return {
    nivel,
    chave: NIVEIS[nivel].chave,
    rotulo: NIVEIS[nivel].rotulo,
    norma: NIVEIS[nivel].norma,
    motivos,
    // O que a tela usa para não desenhar selo em quem não tem prioridade.
    tem: nivel > 0,
  };
}

/**
 * A comparação que ordena a fila.
 *
 * Nível primeiro, tempo de espera para desempatar DENTRO do nível. Devolve
 * número, no formato que `Array.sort` espera.
 *
 * `esperaMin` nulo vai para o fim do seu nível em vez de para o começo: sem
 * hora de chegada não se sabe há quanto tempo a pessoa está lá, e mandar um
 * desconhecido para o topo tiraria a vez de quem tem a espera comprovada.
 */
export function compararNaFila(a, b) {
  const na = a?.prioridade?.nivel ?? 0;
  const nb = b?.prioridade?.nivel ?? 0;
  if (na !== nb) return nb - na;
  return (b?.esperaMin ?? -1) - (a?.esperaMin ?? -1);
}
