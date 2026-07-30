// ═══════════════════════════════════════════════════════════
// IMPRESSOS DA RECEPÇÃO — pulseira de identificação e ficha
//
// Puro: não sabe o que é React nem banco. Monta o CONTEÚDO do que vai ser
// impresso; o desenho fica em `Impressos.jsx`.
//
// A REGRA QUE ORGANIZA O ARQUIVO
// A pulseira é o único documento do hospital que o paciente usa no corpo,
// e é ela que responde "quem é esta pessoa?" quando ele está sedado, com
// dor ou confuso. Por isso o critério aqui é o do Protocolo de
// Identificação do Paciente (PNSP, Portaria MS 529/2013):
//
//   1. NO MÍNIMO DOIS IDENTIFICADORES, e nenhum deles pode ser a
//      localização. Leito, quarto, box e sala mudam durante a internação —
//      e o dia em que dois pacientes trocam de leito é exatamente o dia em
//      que alguém confere pela placa da cama.
//   2. Identificador é atributo da PESSOA, não da passagem. O prontuário
//      vale (é permanente); o número do atendimento, não (muda a cada
//      visita).
//   3. Nada de clínico. A pulseira fica visível para o corredor inteiro —
//      diagnóstico, CID e queixa não entram, e há teste travando isso.
//
// O QUE ESTE ARQUIVO SE RECUSA A FAZER: bloquear a impressão. Paciente sem
// pulseira é pior do que paciente com pulseira incompleta, então quando
// faltam identificadores o aviso é CARIMBADO NA PRÓPRIA PULSEIRA, e não
// só mostrado na tela de quem imprimiu. Quem estiver com a pessoa na frente
// precisa saber que aquela identificação não fecha o protocolo.
// ═══════════════════════════════════════════════════════════

import { comoExibir, idadeDetalhada, rotuloSexo, formatarCPF, formatarCNS } from "../pacientes/identidade.js";
import { situacaoAlergica } from "../clinico/alergias.js";
import { aguardandoIdentificacao } from "./recepcao.js";
import { DOMINIOS } from "./ficha.js";
import { STATUS_ATENDIMENTO } from "./ciclo.js";

/** O piso do PNSP. Menos que isso não é identificação, é palpite. */
export const MINIMO_IDENTIFICADORES = 2;

/**
 * O que NUNCA identifica um paciente, por mais prático que pareça.
 *
 * Está aqui como lista, e não como comentário, porque é a regra que alguém
 * vai querer flexibilizar ("mas seria tão útil o leito na pulseira") — e o
 * teste que a protege precisa de algo para apontar.
 */
export const NAO_IDENTIFICAM = ["leito", "quarto", "cama", "box", "sala", "poltrona", "maca"];

// ── FORMATO DE DATA ─────────────────────────────────────────

/**
 * Data civil "1957-03-04" → "04/03/1957", SEM passar por `new Date`.
 *
 * `new Date("1957-03-04")` é meia-noite UTC e no Brasil volta um dia — o
 * mesmo defeito que já trocou o dia da semana da grade da agenda. Numa
 * pulseira isso vira data de nascimento errada no documento que serve
 * justamente para conferir a data de nascimento.
 *
 * Não é `fmtDataBR` (util/datas.js) por duas diferenças que aqui importam:
 * lá o vazio vira "—" (no papel, o certo é a linha sumir) e o `+T00:00:00`
 * quebra quando o valor já vem com hora, como o `carteira_validade` de
 * alguns registros.
 */
export function dataBR(iso) {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

/** Carimbo de data e hora local, para o rodapé do impresso. */
export function dataHoraBR(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── IDENTIFICADORES ─────────────────────────────────────────

/**
 * Os identificadores que ESTE paciente tem, na ordem em que a conferência
 * é feita no balcão: pergunta-se o nome, depois a data de nascimento,
 * depois o nome da mãe (que é o desempate de homônimo).
 *
 * O prontuário entra por último e conta como identificador porque é
 * permanente e único da pessoa. O número do ATENDIMENTO não entra: muda a
 * cada visita, e identificador que muda não serve para conferir nada.
 */
export function identificadoresDoPaciente(paciente) {
  if (!paciente) return [];
  const out = [];
  // O nome vem dos campos REAIS, e nunca de `iniciais`. `comoExibir` cai
  // para as iniciais quando não há nome — o que é certo na lista da tela e
  // errado aqui: "J.S.M." é abreviatura (o PNSP as proíbe na pulseira) e
  // "NÃO IDENTIFICADO" identifica ninguém. Contando esse texto como
  // identificador, dois pacientes sem nome fechariam o protocolo com dois
  // identificadores cada — e seriam idênticos entre si.
  const nome = String(paciente.nome_social ?? "").trim() || String(paciente.nome_completo ?? "").trim();
  if (nome) out.push({ chave: "nome", label: "Nome", valor: nome });

  const nasc = dataBR(paciente.data_nascimento);
  if (nasc) out.push({ chave: "data_nascimento", label: "Nascimento", valor: nasc });

  const mae = String(paciente.nome_mae ?? "").trim();
  if (mae) out.push({ chave: "nome_mae", label: "Mãe", valor: mae });

  const pront = String(paciente.prontuario ?? "").trim();
  if (pront) out.push({ chave: "prontuario", label: "Prontuário", valor: pront });

  return out;
}

/**
 * A pulseira deste paciente fecha o protocolo?
 *
 * Três estados, e não um booleano, porque a tela reage diferente a cada um:
 *   "ok"          — dois ou mais identificadores
 *   "provisoria"  — paciente admitido sem identificação. Não é falha de
 *                   preenchimento: é a situação prevista pela CFM 1.638
 *                   e pelo próprio PNSP, que manda identificar
 *                   provisoriamente em vez de deixar sem pulseira.
 *   "insuficiente"— o cadastro existe mas está tão vazio que a pulseira não
 *                   identifica ninguém. Aqui alguém pode resolver AGORA,
 *                   com a pessoa na frente, e é isso que o aviso pede.
 */
export function conferirPulseira(paciente) {
  const identificadores = identificadoresDoPaciente(paciente);
  const provisoria = aguardandoIdentificacao(paciente);

  if (provisoria) {
    return {
      estado: "provisoria",
      identificadores,
      selo: "IDENTIFICAÇÃO PROVISÓRIA",
      aviso: "Paciente admitido sem identificação. Confira os sinais registrados na chegada antes de qualquer procedimento e troque a pulseira assim que a identidade for conhecida.",
    };
  }
  if (identificadores.length < MINIMO_IDENTIFICADORES) {
    return {
      estado: "insuficiente",
      identificadores,
      selo: "IDENTIFICAÇÃO INCOMPLETA",
      aviso: `O PNSP pede ao menos ${MINIMO_IDENTIFICADORES} identificadores e este cadastro tem ${identificadores.length}. ` +
        "Complete data de nascimento e nome da mãe antes de o paciente sair do balcão — depois ninguém mais tem a pessoa na frente para perguntar.",
    };
  }
  return { estado: "ok", identificadores, selo: null, aviso: null };
}

// ── PULSEIRA ────────────────────────────────────────────────

/**
 * O conteúdo da pulseira.
 *
 * `contexto` (sexo, idade, nº do atendimento) fica SEPARADO de
 * `identificadores` de propósito. É informação útil para quem está com o
 * paciente, mas não é o que se confere na dupla checagem — misturar as duas
 * coisas é como se acaba conferindo o paciente pelo número do atendimento,
 * que muda toda visita.
 */
export function dadosDaPulseira({ paciente, atendimento, hospital, agora = new Date() } = {}) {
  const conf = conferirPulseira(paciente);
  const idade = idadeDetalhada(paciente?.data_nascimento, agora);
  const social = String(paciente?.nome_social ?? "").trim();
  const civil = String(paciente?.nome_completo ?? "").trim();

  const contexto = [];
  if (paciente?.sexo) contexto.push({ label: "Sexo", valor: rotuloSexo(paciente.sexo) });
  if (idade) contexto.push({ label: "Idade", valor: idade.rotulo });
  if (atendimento?.id) contexto.push({ label: "Atend.", valor: `#${atendimento.id}` });

  return {
    hospital: hospital?.sigla || hospital?.nome || "",
    // Nome social em destaque com o civil abaixo: é o que o Decreto
    // 8.727/2016 garante, e a pulseira é justamente onde chamar a pessoa
    // pelo nome errado acontece na frente de todo mundo. O civil não some
    // porque é ele que casa com o documento e com o pedido de exame.
    nome: comoExibir(paciente, { completo: true }) || String(paciente?.iniciais ?? "").trim(),
    nomeRegistro: social && civil && social !== civil ? civil : null,
    identificadores: conf.identificadores,
    contexto,
    estado: conf.estado,
    selo: conf.selo,
    aviso: conf.aviso,
    emitidoEm: dataHoraBR(agora),
  };
}

// ── FICHA DO ATENDIMENTO ────────────────────────────────────

/** O nome cadastrado para um código de domínio, ou o próprio código. */
export function rotuloDominio(catalogos, chave, codigo) {
  const cod = String(codigo ?? "").trim();
  if (!cod) return "";
  const achado = (catalogos?.[chave] || []).find(o => String(o.codigo) === cod);
  return achado?.nome || cod;
}

/**
 * A ficha que acompanha o paciente em papel.
 *
 * Traz a identificação inteira porque é a folha que fica no prontuário
 * físico e é ela que alguém confere ao anexar exame — mas o rodapé registra
 * quem imprimiu e quando. Papel com dado de paciente circulando sem dono é
 * o vazamento que ninguém investiga porque ninguém sabe que aconteceu.
 *
 * A situação alérgica entra aqui, e NÃO na pulseira: a pulseira de
 * identificação do PNSP carrega identificação e nada mais — alerta de risco
 * é pulseira de outra cor, que é processo da enfermagem.
 *
 * `alergias` tem TRÊS estados possíveis, e a diferença entre eles é a razão
 * de este campo existir:
 *   lista com itens — há alergia registrada
 *   lista vazia     — perguntaram e não há (ou ninguém perguntou ainda; quem
 *                     separa os dois é `situacaoAlergica`)
 *   null            — QUEM IMPRIMIU NÃO CONSULTOU. É o caso da recepção, que
 *                     não lê prontuário (COFEN 754/2024, art. 6º). Imprimir
 *                     "sem registro" nessa via seria uma negativa que
 *                     ninguém apurou, no papel que acompanha o paciente até
 *                     a beira do leito.
 */
export function dadosDaFicha({
  paciente, atendimento, convenio, plano, procedimento,
  catalogos = {}, alergias = null, alergiasTextoLegado = "",
  hospital, usuario, agora = new Date(),
} = {}) {
  const idade = idadeDetalhada(paciente?.data_nascimento, agora);
  const conf = conferirPulseira(paciente);
  const consultouAlergias = Array.isArray(alergias);
  const alerg = consultouAlergias
    ? situacaoAlergica(alergias, alergiasTextoLegado)
    : { estado: "nao_consultado", itens: [] };

  const identificacao = [
    { label: "Prontuário", valor: String(paciente?.prontuario ?? "") },
    { label: "Nome", valor: comoExibir(paciente, { completo: true }) || String(paciente?.iniciais ?? "") },
    { label: "Nome de registro", valor: String(paciente?.nome_social ?? "").trim() ? String(paciente?.nome_completo ?? "") : "" },
    { label: "Nascimento", valor: [dataBR(paciente?.data_nascimento), idade ? `(${idade.rotulo})` : ""].filter(Boolean).join(" ") },
    { label: "Sexo", valor: paciente?.sexo ? rotuloSexo(paciente.sexo) : "" },
    { label: "Nome da mãe", valor: String(paciente?.nome_mae ?? "") },
    { label: "CPF", valor: paciente?.cpf ? formatarCPF(paciente.cpf) : "" },
    { label: "Cartão SUS", valor: paciente?.cns ? formatarCNS(paciente.cns) : "" },
  ].filter(l => String(l.valor ?? "").trim());

  const episodio = [
    { label: "Atendimento", valor: atendimento?.id ? `#${atendimento.id}` : "" },
    { label: "Chegada", valor: dataHoraBR(atendimento?.chegada_em) },
    { label: "Situação", valor: STATUS_ATENDIMENTO[atendimento?.status]?.label || atendimento?.status || "" },
    // Sem atendimento não há tipo. O `||` que resolveria o registro antigo
    // sem coluna preenchida imprimiria "Emergência" numa ficha que não tem
    // episódio nenhum — dado inventado é pior do que campo faltando.
    { label: "Tipo", valor: !atendimento ? "" : atendimento.tipo_atendimento === "ambulatorial" ? "Ambulatorial" : "Emergência" },
    { label: "Como chegou", valor: [atendimento?.origem, atendimento?.origem_detalhe].filter(Boolean).join(" — ") },
    { label: "Profissional", valor: [atendimento?.medico, atendimento?.medico_cbo ? `CBO ${atendimento.medico_cbo}` : ""].filter(Boolean).join(" · ") },
  ].filter(l => String(l.valor ?? "").trim());

  const pagadora = [
    { label: "Convênio", valor: convenio?.nome || "" },
    { label: "Plano", valor: plano?.nome || "" },
    { label: "Carteira", valor: String(atendimento?.carteira ?? "") },
    { label: "Validade", valor: dataBR(atendimento?.carteira_validade) },
    { label: "Guia", valor: String(atendimento?.guia_numero ?? "") },
    { label: "Autorização", valor: String(atendimento?.autorizacao_senha ?? "") },
  ].filter(l => String(l.valor ?? "").trim());

  const classificacao = DOMINIOS
    .map(d => ({ label: d.label, valor: rotuloDominio(catalogos, d.chave, atendimento?.[`${d.chave}_cod`]) }))
    .filter(l => l.valor);
  if (procedimento?.nome) classificacao.push({ label: "Procedimento", valor: procedimento.nome });
  if (atendimento?.acidente_trabalho) classificacao.push({ label: "Acidente de trabalho", valor: "SIM — exige CAT" });

  return {
    hospital: { nome: hospital?.nome || "", sigla: hospital?.sigla || "" },
    identificacao,
    episodio,
    pagadora,
    classificacao,
    // A queixa é o que a pessoa disse no balcão, não classificação de risco.
    // Vai para a ficha porque é o que orienta quem recebe o paciente — e
    // fica rotulada como relato para ninguém confundir com diagnóstico.
    queixa: String(atendimento?.queixa ?? "").trim(),
    alergias: {
      estado: alerg.estado,
      itens: alerg.itens.map(i => i.rotulo).filter(Boolean),
      texto: alerg.estado === "com_alergia"
        ? alerg.itens.map(i => i.rotulo).join(", ")
        : alerg.estado === "nenhuma"
          ? "Paciente nega alergias conhecidas"
          : alerg.estado === "sem_registro"
            ? "SEM REGISTRO — ninguém perguntou ainda"
            : "NÃO CONSULTADO NESTA VIA — conferir com a enfermagem antes de administrar qualquer coisa",
    },
    identificadores: conf.identificadores,
    pulseira: { estado: conf.estado, selo: conf.selo, aviso: conf.aviso },
    rodape: {
      impressoPor: usuario?.name || usuario?.nome || usuario?.username || "—",
      impressoEm: dataHoraBR(agora),
    },
  };
}
