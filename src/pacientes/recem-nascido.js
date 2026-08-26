// ═══════════════════════════════════════════════════════════
// RECÉM-NASCIDO — o cadastro de quem nasceu aqui
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE
// O hospital faz parto e o bebê NÃO TINHA COMO ENTRAR NO SISTEMA. O cadastro
// pede nome, CPF e CNS; o recém-nascido não tem nenhum dos três no dia em
// que nasce. Ele tem outra identidade, e ela é bem definida:
//
//   • o NOME PROVISÓRIO "RN de <mãe>", convenção nacional;
//   • a DNV (Declaração de Nascido Vivo), que é o documento dele até sair a
//     certidão — e é numerada e única por nascimento;
//   • o VÍNCULO com o prontuário da mãe, que é por onde se reconstrói o
//     parto e por onde se confere a quem o bebê pertence na alta;
//   • a HORA do nascimento, que na primeira semana de vida é dado clínico e
//     não detalhe de cadastro.
//
// ⚠️ A REGRA MAIS IMPORTANTE DESTE ARQUIVO É SOBRE GÊMEOS.
// Dois irmãos nascidos no mesmo parto têm a MESMA mãe, a MESMA data de
// nascimento e nomes provisórios quase idênticos. Para o verificador de
// duplicidade eles são a mesma pessoa com 90% de confiança — e o caminho
// que a tela oferece nesse caso é "use o prontuário que já existe".
//
// Seguir esse conselho JUNTA DOIS BEBÊS NUM PRONTUÁRIO SÓ. A partir daí, a
// prescrição de um vale para o outro. É o erro de identificação mais grave
// que este sistema poderia produzir, e ele nasceria do recurso de segurança
// que existe para impedir duplicata.
//
// O que separa os dois é a DNV: ela é única por nascimento. Duas DNVs
// diferentes são duas pessoas diferentes, sempre — e `ordem_nascimento`
// (1º, 2º, 3º do parto) é o desempate quando a DNV ainda não saiu.
// ═══════════════════════════════════════════════════════════

import { normalizarNome, idadeDetalhada } from "./identidade.js";

/**
 * Prazo legal para registrar o nascimento — Lei 6.015/1973, art. 50.
 *
 * É por ele que o nome provisório vira PENDÊNCIA: passado o prazo, o bebê
 * já tem nome de registro e o cadastro continuar como "RN de" significa que
 * ninguém voltou para atualizar. Um "RN de Maria" de seis meses no acervo é
 * o começo do prontuário duplicado — na próxima visita ninguém acha a
 * criança pelo nome dela.
 */
export const DIAS_PARA_REGISTRO = 15;

/**
 * O nome provisório, na convenção que o país inteiro usa.
 *
 * MAIÚSCULA porque é assim que sai na pulseira e na etiqueta do berçário, e
 * porque distingue de longe o cadastro provisório do definitivo.
 *
 * `ordem` entra no nome quando o parto foi múltiplo: "RN 1 DE MARIA" e
 * "RN 2 DE MARIA" são duas pessoas, e um nome idêntico para as duas é
 * exatamente o que faz a enfermagem trocar um pelo outro.
 */
export function nomeProvisorioDoRN(nomeDaMae, { ordem } = {}) {
  const mae = String(nomeDaMae ?? "").trim().toUpperCase();
  if (!mae) return "";
  const n = Number(ordem);
  const prefixo = Number.isInteger(n) && n > 1 ? `RN ${n}` : "RN";
  return `${prefixo} DE ${mae}`;
}

/** É um cadastro de recém-nascido? O vínculo com a mãe é o que define. */
export const ehRecemNascido = paciente =>
  !!String(paciente?.prontuario_mae ?? "").trim();

/** O nome ainda é o provisório do nascimento? */
export const temNomeProvisorio = paciente =>
  /^rn(\s+\d+)?\s+de\s+/i.test(String(paciente?.nome_completo ?? "").trim());

/**
 * O que falta para abrir o cadastro do recém-nascido.
 *
 * NÃO BLOQUEIA — a mesma regra do resto do módulo. Bebê que nasce em parada
 * respiratória precisa de prontuário AGORA, e o número da DNV pode estar na
 * mão de outra pessoa. O que não pode é a pendência sumir.
 *
 * A MÃE é a única coisa sem a qual o cadastro não faz sentido: sem ela não
 * há nome provisório, não há vínculo, e a pulseira fica sem o identificador
 * que o protocolo de identificação do recém-nascido exige.
 */
export function validarRecemNascido({ mae, dnv, data_nascimento, ordem } = {}) {
  const erros = [];
  const pendencias = [];

  if (!String(mae?.prontuario ?? "").trim())
    erros.push("Escolha a mãe. É dela que sai o nome provisório do bebê, o vínculo do parto e o identificador da pulseira.");
  if (!String(mae?.nome_completo ?? "").trim() && !erros.length)
    erros.push("A mãe está cadastrada sem nome completo — sem ele não há como formar \"RN de\". Complete o cadastro dela primeiro.");

  if (!String(data_nascimento ?? "").trim())
    pendencias.push({ campo: "data_nascimento", texto: "Sem data de nascimento a idade do bebê não é calculável — e na primeira semana de vida ela decide conduta." });

  if (!String(dnv ?? "").trim())
    pendencias.push({ campo: "dnv", texto: "Sem a DNV o bebê fica sem documento até a certidão sair — e é ela que separa um gêmeo do outro." });

  const n = Number(ordem);
  if (ordem != null && String(ordem).trim() !== "" && (!Number.isInteger(n) || n < 1))
    erros.push("A ordem de nascimento é 1 para o primeiro do parto, 2 para o segundo, e assim por diante.");

  return { ok: erros.length === 0, erros, pendencias };
}

/**
 * O cadastro provisório já passou do prazo de registro?
 *
 * `null` quando não há o que cobrar. Aviso que aparece desde o primeiro dia
 * seria ruído: nos primeiros quinze dias o nome provisório está CERTO.
 */
export function pendenciaDeNomeDefinitivo(paciente, hoje = new Date()) {
  if (!ehRecemNascido(paciente) || !temNomeProvisorio(paciente)) return null;
  const idade = idadeDetalhada(paciente?.data_nascimento, hoje);
  if (!idade) return null;

  const dias = idade.totalMeses * 30 + idade.dias;   // aproximação suficiente para um prazo de 15 dias
  if (dias < DIAS_PARA_REGISTRO) return null;

  return {
    dias,
    texto: `Este cadastro ainda usa o nome provisório do nascimento, e o bebê tem ${idade.rotulo}. `
      + `O registro civil vence em ${DIAS_PARA_REGISTRO} dias (Lei 6.015/1973, art. 50) — troque pelo nome da certidão. `
      + `Enquanto for "RN de", ninguém acha esta criança pelo nome dela na próxima visita.`,
  };
}

/**
 * 🔴 ESTES DOIS SÃO A MESMA PESSOA, OU SÃO IRMÃOS DO MESMO PARTO?
 *
 * Devolve `true` quando dá para AFIRMAR que são pessoas diferentes. É usado
 * para tirar gêmeos da lista de duplicatas — e só afirma quando tem prova,
 * nunca por parecer.
 *
 * A DNV é a prova: é numerada e única por nascimento, então duas DNVs
 * diferentes são dois nascimentos diferentes. `ordem_nascimento` é a prova
 * de segunda linha, para quando a DNV ainda não saiu: dentro do mesmo parto
 * (mesma mãe, mesma data), o 1º e o 2º são pessoas distintas.
 *
 * Sem nenhuma das duas provas devolve `false` — e aí a duplicidade volta a
 * avisar, que é o certo: dois cadastros "RN de Maria" no mesmo dia sem DNV e
 * sem ordem PODEM mesmo ser o mesmo bebê cadastrado duas vezes.
 */
export function saoIrmaosDoMesmoParto(a, b) {
  if (!a || !b) return false;

  // A DNV DECIDE SOZINHA quando os dois a têm — ela é única POR NASCIMENTO.
  //
  // Diferente: dois nascimentos, duas pessoas, sempre.
  // IGUAL: um nascimento só. São o MESMO bebê cadastrado duas vezes, e a
  // duplicidade tem que continuar avisando — mesmo que a ordem do parto
  // esteja divergente nos dois registros, porque aí a ordem é erro de
  // digitação, não parto múltiplo.
  //
  // A primeira versão só tratava o caso "diferente" e deixava o "igual"
  // cair na regra de baixo, que o classificava como gêmeo pela ordem. A
  // mutação passou verde e o teste novo pegou: era a duplicata mais clara
  // que existe sumindo do aviso.
  const dnvA = String(a.dnv ?? "").trim();
  const dnvB = String(b.dnv ?? "").trim();
  if (dnvA && dnvB) return dnvA !== dnvB;

  const maeA = String(a.prontuario_mae ?? "").trim() || normalizarNome(a.nome_mae);
  const maeB = String(b.prontuario_mae ?? "").trim() || normalizarNome(b.nome_mae);
  const mesmaMae = !!maeA && maeA === maeB;

  const nascA = String(a.data_nascimento ?? "").slice(0, 10);
  const nascB = String(b.data_nascimento ?? "").slice(0, 10);
  const mesmoDia = !!nascA && nascA === nascB;

  const ordA = Number(a.ordem_nascimento);
  const ordB = Number(b.ordem_nascimento);
  const ordensValidas = Number.isInteger(ordA) && Number.isInteger(ordB);

  return mesmaMae && mesmoDia && ordensValidas && ordA !== ordB;
}

// ═══════════════════════════════════════════════════════════
// A IDADE DA MÃE — um aviso sobre VÍNCULO, não sobre biologia
// ═══════════════════════════════════════════════════════════
//
// 🔴 O ERRO QUE ISTO PROCURA não é gravidez improvável: é o bebê ligado ao
// PRONTUÁRIO ERRADO. Quem traz o recém-nascido ao balcão muitas vezes é a
// avó, e escolher a linha errada numa lista de homônimas é fácil. A partir
// daí o parto fica pendurado na pessoa errada, e é por esse vínculo que se
// confere a quem o bebê pertence na alta.
//
// A idade materna implausível é o sintoma barato de um vínculo trocado —
// não a doença. Por isso a frase do aviso manda CONFERIR A MÃE, que é a
// coisa que a recepção pode fazer, e não comenta a gestação.
//
// ⚠️ NUNCA BLOQUEIA, e a faixa é larga de propósito.
// Mãe adolescente existe, e um sistema que se recusa a cadastrar o filho
// dela inverte a prioridade: o bebê é quem fica sem prontuário. Além disso,
// aviso que acende em dado CORRETO é o que ensina a equipe a fechar aviso
// sem ler — e aí o próximo, que é de verdade, passa junto. Só acende onde
// o vínculo trocado é MAIS PROVÁVEL que o fato.
//
// Abaixo de 10 e a partir de 55 a gravidez espontânea é rara a ponto de o
// erro de digitação e o prontuário trocado serem a explicação mais provável
// — em 55+, tipicamente a avó. Entre os dois, silêncio.

/** Piso e teto da faixa em que NÃO se diz nada. Ver o comentário acima. */
export const IDADE_MATERNA_MIN = 10;
export const IDADE_MATERNA_MAX = 55;

/**
 * A idade da mãe no dia do parto merece uma conferida?
 *
 * `null` = nada a dizer. Também `null` quando falta data — de um dos dois:
 * sem as duas datas não há idade, e "não sei" não é motivo de alarme (a
 * pendência de cadastro incompleto já cobra a data por outro caminho).
 *
 * Devolve `{ tipo, anos, texto }` para a tela desenhar. `tipo` distingue o
 * IMPOSSÍVEL (mãe nascida depois do bebê — erro certo) do IMPLAUSÍVEL
 * (idade fora da faixa — quase sempre vínculo trocado), porque a primeira
 * não comporta "confira" e sim "está errado".
 */
export function conferirIdadeDaMae({ mae, data_nascimento } = {}) {
  const nascMae = String(mae?.data_nascimento ?? "").trim();
  const nascBebe = String(data_nascimento ?? "").trim();
  if (!nascMae || !nascBebe) return null;

  // Datas civis comparadas como TEXTO 'YYYY-MM-DD'. Passar pelo `new Date()`
  // empurraria o dia para trás no fuso do Brasil — já causou bug real aqui.
  if (nascMae >= nascBebe) {
    return {
      tipo: "impossivel",
      anos: null,
      texto: "A mãe escolhida nasceu na mesma data do bebê ou depois dela. " +
             "Não é uma idade improvável, é um vínculo impossível — confira se a mãe " +
             "selecionada é a certa, ou se a data de nascimento de alguém está trocada.",
    };
  }

  const anos = idadeDetalhada(nascMae, new Date(`${nascBebe}T12:00:00`))?.anos;
  if (!Number.isInteger(anos)) return null;
  if (anos >= IDADE_MATERNA_MIN && anos < IDADE_MATERNA_MAX) return null;

  return {
    tipo: "implausivel",
    anos,
    texto: `A mãe selecionada tinha ${anos} anos na data do parto. ` +
           "Confira se é a mãe certa — quem traz o bebê ao balcão às vezes é a avó, " +
           "e é por este vínculo que se confere a quem o bebê pertence na alta. " +
           "Se estiver certo, siga: o cadastro não fica travado por isto.",
  };
}
