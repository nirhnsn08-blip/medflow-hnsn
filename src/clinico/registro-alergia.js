// ═══════════════════════════════════════════════════════════
// REGISTRAR ALERGIA — o formulário que não existia
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE, e é a forma mais aguda do defeito da casa
// `pep_alergias` é LIDA em quatro lugares — inclusive na pulseira que vai
// no punho do paciente — e ESCRITA por nenhum. `registrarAlergia` existe
// em `prontuario/dados.js` e nenhuma tela a chama.
//
// Pior: o sistema MANDA registrar. Em duas telas ele diz
//
//     "Alergias não avaliadas — pergunte ao paciente e registre.
//      Campo em branco não é o mesmo que 'não tem'."
//
// …e não oferece caminho nenhum para fazer isso. Instruir alguém a fazer
// o que o sistema não permite é pior que não instruir: ensina que as
// mensagens da tela não valem.
//
// ⚠️ "NEGA ALERGIAS" É REGISTRO, NÃO AUSÊNCIA DE REGISTRO.
// A distinção já está no motor (`TIPO_NENHUMA`) e é a razão de o campo em
// branco não poder ser lido como "não tem": em branco significa que
// NINGUÉM PERGUNTOU. Por isso o formulário tem duas portas — declarar uma
// alergia, ou declarar que perguntou e o paciente nega.
//
// ⚠️ SUBSTÂNCIA É O QUE FAZ O ALERTA FUNCIONAR.
// O motor de interação casa por princípio ativo: sem `substancia`,
// "Novalgina" não bate com "Dipirona" e o alerta nunca dispara. Mas exigir
// substância travaria quem só sabe o nome comercial que o paciente falou —
// e o registro incompleto vale mais que registro nenhum. Então: pede,
// avisa que sem ela o alerta não pega, e deixa seguir.
//
// ⚠️ E NÃO SE APAGA ALERGIA.
// `pep_alergias` é append-only. Enganos se corrigem com um registro novo
// apontando para o anterior (`corrige_id`), e a situação muda para
// "refutada" — o histórico continua, porque saber que alguém já suspeitou
// de uma alergia é informação clínica.
// ═══════════════════════════════════════════════════════════

import { TIPO_NENHUMA } from "./alergias.js";

const texto = v => String(v ?? "").trim();

/** O que o paciente reagiu: medicamento, alimento, e assim por diante. */
export const TIPOS = [
  { chave: "medicamento", rotulo: "Medicamento" },
  { chave: "alimento", rotulo: "Alimento" },
  { chave: "latex", rotulo: "Látex" },
  { chave: "contraste", rotulo: "Contraste iodado" },
  { chave: "outro", rotulo: "Outro" },
];

/**
 * Gravidade da reação — e ela decide conduta, não é adjetivo.
 * `grave` é o que exige o registro na pulseira e alerta em toda prescrição.
 */
export const GRAVIDADES = [
  { chave: "leve", rotulo: "Leve", nota: "exantema, prurido localizado" },
  { chave: "moderada", rotulo: "Moderada", nota: "urticária extensa, broncoespasmo leve" },
  { chave: "grave", rotulo: "Grave", nota: "anafilaxia, angioedema, Stevens-Johnson" },
];

export const ehGrave = g => texto(g) === "grave";

/**
 * Pode gravar este registro de alergia?
 *
 * Devolve `{ ok, erros, avisos }`. Os avisos não impedem: registro
 * incompleto de alergia vale mais que alergia não registrada.
 */
export function validarAlergia(f = {}) {
  const erros = [];
  const avisos = [];
  const nega = !!f.nega;

  if (nega) {
    // "Nega alergias" não precisa de mais nada — o valor está em alguém
    // ter perguntado, e isso o próprio registro já prova.
    return { ok: true, erros, avisos };
  }

  if (!texto(f.agente)) {
    erros.push("Informe a que o paciente é alérgico — como ele chama, mesmo que seja o nome comercial.");
  }

  if (!texto(f.tipo)) {
    erros.push("Escolha o tipo: medicamento, alimento, látex, contraste ou outro.");
  }

  if (!texto(f.gravidade)) {
    avisos.push("Sem a gravidade, quem for prescrever não sabe se isto é um exantema ou uma anafilaxia.");
  }

  // ⚠️ O aviso que decide se o alerta vai funcionar.
  if (texto(f.tipo) === "medicamento" && !texto(f.substancia)) {
    avisos.push(
      "Sem o princípio ativo, o alerta automático não vai pegar: o motor casa por substância, " +
      "então “Novalgina” só bate com uma prescrição de dipirona se alguém escrever “dipirona” aqui."
    );
  }

  if (!texto(f.reacao)) {
    avisos.push("O que aconteceu com o paciente ajuda quem vier depois a julgar se é alergia mesmo ou efeito adverso.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * O que vai para `registrarAlergia`.
 *
 * `situacao: "ativa"` porque registro novo vale agora; refutar é outro ato,
 * com `corrige_id`. Campo vazio vira `null` e não string vazia — senão
 * "não preenchido" deixaria de ser distinguível de "preenchido em branco".
 */
export function dadosDaAlergia(f = {}, { fonte = "declarada" } = {}) {
  if (f.nega) {
    return {
      tipo: TIPO_NENHUMA,
      agente: null, substancia: null, gravidade: null, reacao: null,
      manifestacao: null, criticidade: null, inicio: null,
      observacao: texto(f.observacao) || null,
      situacao: "ativa", fonte,
    };
  }
  return {
    tipo: texto(f.tipo) || null,
    agente: texto(f.agente) || null,
    substancia: texto(f.substancia) || null,
    gravidade: texto(f.gravidade) || null,
    criticidade: ehGrave(f.gravidade) ? "alta" : null,
    reacao: texto(f.reacao) || null,
    manifestacao: texto(f.reacao) || null,
    inicio: texto(f.inicio) || null,
    observacao: texto(f.observacao) || null,
    situacao: "ativa",
    fonte,
  };
}

/**
 * O que dizer depois de gravar.
 *
 * Alergia grave muda o que precisa acontecer em seguida — a pulseira já
 * impressa está desatualizada, e ninguém vai lembrar disso sozinho.
 */
export function recadoDepoisDeGravar(f = {}) {
  if (f.nega) return "Registrado que o paciente NEGA alergias conhecidas. Isso é diferente de campo em branco: agora consta que alguém perguntou.";
  const base = `Alergia a ${texto(f.agente) || "—"} registrada.`;
  if (ehGrave(f.gravidade)) {
    return base + " Como é GRAVE, reimprima a pulseira do paciente — a que está no punho dele foi impressa sem esta informação.";
  }
  return base + " Ela passa a aparecer na pulseira, no prontuário e no alerta de prescrição.";
}
