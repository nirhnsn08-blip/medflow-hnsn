// ═══════════════════════════════════════════════════════════
// A LIGAÇÃO ENTRE O LEITO E O PRONTUÁRIO DA INTERNAÇÃO
//
// Puro: não sabe o que é React nem banco.
//
// 🔴 POR QUE ISTO EXISTE — a maior órfã do sistema
// `abrirEpisodio` existe em `prontuario/dados.js` desde sempre e NENHUMA
// tela a chamava. O episódio (`pep_episodios`) é a chave de tudo que se
// registra sobre quem está internado: sem ele, ficam vazios por
// construção, e sem erro nenhum na tela:
//
//   evolução · anamnese · prescrição do internado · sinais vitais · NEWS
//   escalas de Braden e Morse · lesão por pressão · SAE inteira
//   reconciliação medicamentosa · sumário de alta
//   Mapa de risco e Checagem SAE do Giro de Leitos
//   o indicador "LPP adquirida" que o NSP anuncia como diferencial
//
// A tela "Prontuário da internação" está montada no Paciente 360 e
// respondia, para todo paciente, "Sem internação aberta". É a mesma doença
// do `marcarContaFaturada`, uma ordem de grandeza maior.
//
// ⚠️ POR QUE O PRONTUÁRIO PASSA A SER OBRIGATÓRIO PARA INTERNAR
// O episódio é chaveado por prontuário. Leito ocupado sem prontuário é
// paciente invisível para o PEP, para o Paciente 360 e para a conta — o
// limbo que a trava da internação pela recepção existe para evitar, e que
// hoje já acontece pela porta do leito. Não é burocracia nova: quem chega
// sem identificação recebe prontuário na Recepção em segundos, inclusive
// como "não identificado".
//
// ⚠️ A ORDEM DAS ESCRITAS, E ELA TEM PRECEDENTE NA CASA
// `encerrarEpisodio` já documenta o princípio: faz-se primeiro aquilo cuja
// falha fica VISÍVEL. Aqui, ocupar o leito primeiro e abrir o episódio
// depois: se o episódio falhar, o paciente aparece no mapa de leitos e
// alguém vê. Na ordem inversa haveria episódio sem leito — invisível.
// ═══════════════════════════════════════════════════════════

const texto = v => String(v ?? "").trim();

/**
 * De/para entre o desfecho do LEITO e o do PRONTUÁRIO.
 *
 * São vocabulários diferentes de propósito: o leito registra o movimento
 * físico ("alta", "obito", "transferencia"), o prontuário registra o
 * desfecho clínico, que distingue alta por melhora de alta a pedido.
 *
 * ⚠️ O leito não sabe QUAL alta foi. Mapear "alta" para "alta_melhorado"
 * seria inventar um fato clínico que ninguém afirmou. Mapeia-se para o
 * genérico e o sumário de alta — que é onde o médico escolhe — corrige.
 */
export const DESFECHO_LEITO_PARA_PEP = {
  alta: "alta_inalterado",
  obito: "obito",
  transferencia: "transferencia",
};

export const desfechoDoLeito = d => DESFECHO_LEITO_PARA_PEP[texto(d)] || null;

/**
 * Pode abrir o episódio desta internação?
 *
 * `episodiosAbertos` são os episódios já em aberto deste prontuário — dois
 * abertos para a mesma pessoa é erro clínico, não só duplicidade de dado.
 */
export function podeAbrirEpisodio({ prontuario, episodiosAbertos = [] } = {}) {
  const p = texto(prontuario);
  const erros = [];

  if (!p) {
    erros.push(
      "Internação sem número de prontuário não cria o prontuário da internação — o paciente fica " +
      "invisível para a evolução, para a prescrição e para a conta. Emita o prontuário na Recepção " +
      "(há caminho próprio para quem chega sem identificação) e interne com ele."
    );
  }

  const abertos = (Array.isArray(episodiosAbertos) ? episodiosAbertos : [])
    .filter(e => texto(e?.prontuario) === p && texto(e?.status) === "aberto");
  if (p && abertos.length) {
    erros.push(
      `Este paciente já tem internação aberta (leito ${texto(abertos[0]?.leito) || "—"}). ` +
      "Encerre a anterior antes de abrir outra — duas internações abertas para a mesma pessoa " +
      "dividem o registro clínico entre as duas."
    );
  }

  return { ok: erros.length === 0, erros, jaAberto: abertos[0] || null };
}

/**
 * O que vai para `abrirEpisodio`, montado do leito e do formulário.
 *
 * O `setor` vem do leito, não do formulário: é o leito que sabe onde está.
 */
export function dadosDoEpisodio(leito = {}, dados = {}) {
  return {
    prontuario: texto(dados.prontuario) || texto(leito.prontuario),
    iniciais: texto(dados.iniciais) || texto(leito.iniciais),
    leito: texto(leito.identificacao),
    setor: texto(leito.setor) || null,
    cid: texto(dados.cid) || texto(leito.cid) || null,
    motivo: texto(dados.motivo) || texto(leito.motivo) || null,
  };
}

/**
 * O episódio aberto deste prontuário, se houver.
 *
 * Uma volta só: não segue cadeia. Dois abertos não deveriam existir (a
 * abertura recusa), e se existirem é melhor devolver o primeiro do que
 * escolher em silêncio.
 */
export const episodioAbertoDe = (prontuario, episodios = []) =>
  (Array.isArray(episodios) ? episodios : [])
    .find(e => texto(e?.prontuario) === texto(prontuario) && texto(e?.status) === "aberto") || null;

/**
 * O que dizer quando o leito foi ocupado e o episódio NÃO abriu.
 *
 * 🔴 Silêncio aqui recria o defeito: o paciente ficaria internado sem
 * prontuário da internação, que é exatamente o estado que este arquivo
 * existe para acabar — só que agora por falha, não por ausência de código.
 */
export function avisoEpisodioNaoAberto({ leito, motivo } = {}) {
  return (
    `O leito ${texto(leito) || "?"} foi ocupado, mas o prontuário da internação NÃO abriu` +
    (texto(motivo) ? `: ${texto(motivo)}` : ".") +
    " O paciente está no mapa de leitos e sem lugar para evoluir, prescrever ou registrar escalas. " +
    "Tente internar de novo pelo mesmo leito — a operação é repetível e não duplica o episódio."
  );
}
