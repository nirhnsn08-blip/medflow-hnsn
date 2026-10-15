// ═══════════════════════════════════════════════════════════
// AS INICIAIS DA CIRURGIA SÃO AS DO PACIENTE AGENDADO?
//
// 🔴 O PIOR LUGAR DO SISTEMA PARA UMA INICIAL ERRADA.
//
// O item 1 do Sign In é "Paciente confirmou identidade, sítio cirúrgico,
// procedimento e consentimento" (Meta 1 da OMS / Protocolo de Cirurgia
// Segura, Anvisa). A tela onde essa conferência acontece mostrava as
// iniciais DIGITADAS no agendamento — texto livre, nunca comparado com o
// cadastro. No banco de teste, o prontuário T9060 ("Clara Lima Barbosa")
// tem três cirurgias, agendadas como "T.S.T.", "A.B.C." e "M.O.S.".
// Nenhuma das três é a pessoa, e nada na tela dizia isso.
//
// A FK existe desde `migracao-cirurgia-paciente-equipe-codigo.sql`: a
// cirurgia aponta para um paciente de verdade. O número está certo e o
// rótulo ao lado dele está errado — que é a pior combinação possível, porque
// o rótulo é o que a equipe lê em voz alta.
//
// ── CARIMBAR OU DERIVAR? ────────────────────────────────────
// As duas coisas, com papéis separados. Este foi o ponto a decidir.
//
// CARIMBAR tem razão de ser: `cc_cirurgias` é o CADASTRO DO ATO, e o mapa
// precisa renderizar quando a leitura de `pacientes` falha — "não li" não
// pode virar cartão sem nome (o módulo inteiro foi corrigido em 07/10 por
// esse motivo). O carimbo é também o registro do que a agenda dizia.
//
// Mas o carimbo NÃO PODE SER O VENCEDOR SILENCIOSO numa tela que confere
// identidade. Então:
//
//   • QUEM É       → vem do cadastro, pelo prontuário. É o que a tela
//                    mostra quando dá para ler.
//   • O CARIMBO    → fica guardado e APARECE como divergência, nunca
//                    apagado. Apagar esconderia que a agenda e o cadastro
//                    discordam — e quem vai confirmar a identidade em voz
//                    alta precisa saber que existe discordância.
//   • NÃO DEU PARA LER → diz isso. Não "confere", não "divergem".
//
// E no AGENDAMENTO as iniciais param de ser digitadas: quando o prontuário
// existe no cadastro, o campo vem preenchido e travado (é o mesmo que o PS
// já faz em `conferirIniciaisDaChegada` — lá a inicial que vai para a fila é
// SEMPRE a do cadastro). Digitação livre sobra só para quem o cadastro não
// sabe nomear, que é o caso dos órfãos adotados pela migração: cadastro com
// iniciais e sem nome. Aí o campo gravado é a única fonte, e inventar seria
// pior que repetir.
//
// Regras puras, sem React e sem rede, para serem testadas sozinhas.
// ═══════════════════════════════════════════════════════════

import { chaveDasIniciais, comoExibir } from "../pacientes/identidade.js";
import { naoDeuParaLer } from "../util/leitura.js";

/**
 * Os cadastros do dia, por prontuário — ou `null` quando não deu para ler.
 *
 * `null` e não mapa vazio de propósito: mapa vazio responde "não achei
 * este paciente" para toda pergunta, e é indistinguível de uma lista que
 * voltou cheia sem o prontuário procurado. O chamador tem de ver a
 * diferença, porque uma leva a "não conferi" e a outra a um alerta.
 */
export function indexarCadastros(lista) {
  if (naoDeuParaLer(lista) || !Array.isArray(lista)) return null;
  const m = new Map();
  for (const p of lista) {
    const k = String(p?.prontuario ?? "").trim();
    if (k) m.set(k, p);
  }
  return m;
}

/**
 * Confere uma cirurgia contra o cadastro e diz o que a tela deve mostrar.
 *
 * `cadastros` é o que `indexarCadastros` devolveu (Map ou null).
 *
 * Devolve `{ estado, exibir, carimbadas, doCadastro, nome, aviso, grave }`:
 *   estado "confere"          — bateu com o cadastro
 *   estado "divergem"         — 🔴 bateu com nada do cadastro
 *   estado "so-carimbo"       — o cadastro não tem nome nem iniciais; o
 *                               carimbo é a única fonte (órfão adotado)
 *   estado "sem-prontuario"   — cirurgia antiga, sem o número
 *   estado "nao-conferido"    — não deu para ler, ou o prontuário não veio
 *                               na leitura (que sob RLS é a mesma coisa)
 */
export function conferirIniciaisDaCirurgia(cirurgia, cadastros) {
  const carimbadas = String(cirurgia?.iniciais ?? "").trim();
  const prontuario = String(cirurgia?.prontuario ?? "").trim();
  const base = { carimbadas, doCadastro: "", nome: "", grave: false };

  if (!prontuario) {
    return {
      ...base, estado: "sem-prontuario", exibir: carimbadas || "—",
      aviso: "Sem prontuário: não há cadastro com que conferir estas iniciais.",
    };
  }
  // Nunca li, ou li e este número não veio. Sob RLS as duas são a MESMA
  // resposta (lista sem a linha), e a FK garante que o paciente existe —
  // então "não veio" é problema de leitura, não paciente inexistente.
  // Afirmar "não cadastrado" aqui seria inventar um diagnóstico.
  const cadastro = cadastros ? cadastros.get(prontuario) : null;
  if (!cadastro) {
    return {
      ...base, estado: "nao-conferido", exibir: carimbadas || "—",
      aviso: `Não conferi estas iniciais com o cadastro do prontuário ${prontuario}. A ausência de aviso aqui não quer dizer que conferem.`,
    };
  }

  const doCadastro = comoExibir(cadastro) || "";
  const nome = comoExibir(cadastro, { completo: true }) || "";
  // O cadastro não sabe nomear este paciente (órfão adotado pela migração,
  // com iniciais e sem nome). O carimbo é a única fonte — e `comoExibir`
  // já devolve justamente a coluna `iniciais` nesse caso, então quando ele
  // vem vazio não há NADA no cadastro.
  if (!doCadastro) {
    return {
      ...base, estado: "so-carimbo", exibir: carimbadas || "—",
      aviso: carimbadas
        ? null
        : `O cadastro do prontuário ${prontuario} não tem nome nem iniciais, e a cirurgia também não.`,
    };
  }

  // Aceita o que o cadastro aceitaria: nome social OU de registro OU a
  // coluna gravada. Mesma regra do PS — exigir o preferido faria divergir
  // todo cadastro com nome social e toda ficha importada.
  const aceitas = [
    doCadastro,
    comoExibir(cadastro, { completo: true }),
    cadastro.iniciais,
    cadastro.nome_completo ? comoExibir({ nome_completo: cadastro.nome_completo }) : "",
  ].map(chaveDasIniciais).filter(Boolean);

  if (!carimbadas || aceitas.includes(chaveDasIniciais(carimbadas))) {
    return { ...base, estado: "confere", exibir: doCadastro, doCadastro, nome, aviso: null };
  }
  return {
    ...base, estado: "divergem", grave: true,
    // Quem é a pessoa vem do cadastro; o carimbo vai no aviso, não some.
    exibir: doCadastro, doCadastro, nome,
    aviso: `Agendada como ${carimbadas}, mas o prontuário ${prontuario} é de ${nome || doCadastro} (${doCadastro}). CONFIRME a identidade com o paciente antes de seguir.`,
  };
}

/**
 * O que o agendamento deve pôr no campo de iniciais, dado o cadastro lido.
 *
 * `{ valor, travado, nota }`. `travado` é o que faz a diferença: enquanto o
 * campo aceitava digitação, o agendamento era uma oportunidade por cirurgia
 * de inventar um rótulo para um paciente que o sistema já conhece pelo
 * número. Travar não perde caso nenhum — o cadastro sem nome continua
 * liberando o campo.
 */
export function iniciaisDoAgendamento(cadastro, { lido = false } = {}) {
  const doCadastro = cadastro ? (comoExibir(cadastro) || "") : "";
  // "Ainda não perguntei" e "perguntei e não deu" são a MESMA coisa para
  // quem decide — nos dois casos nada foi conferido, e é isso que a nota
  // tem de dizer. É a mesma regra do `naoConferi` do conflito de sala,
  // nesta mesma tela: o silêncio não pode passar por aprovação.
  if (!lido) {
    return { valor: null, travado: false,
             nota: "Não conferi o cadastro deste prontuário — as iniciais digitadas aqui NÃO serão conferidas." };
  }
  if (!cadastro) {
    return { valor: null, travado: false,
             nota: "Prontuário não encontrado no cadastro. As iniciais digitadas NÃO serão conferidas." };
  }
  if (!doCadastro) {
    return { valor: null, travado: false,
             nota: "O cadastro deste prontuário não tem nome nem iniciais — o que você digitar aqui é a única fonte. Complete o cadastro do paciente." };
  }
  const nome = comoExibir(cadastro, { completo: true }) || doCadastro;
  return { valor: doCadastro, travado: true, nota: `Do cadastro: ${nome}.` };
}
