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

import { comoExibir, idadeDetalhada, rotuloSexo, formatarCPF, formatarCNS, formatarTelefone } from "../pacientes/identidade.js";
import { situacaoAlergica } from "../clinico/alergias.js";
import { aguardandoIdentificacao } from "./recepcao.js";
import { DOMINIOS } from "./ficha.js";
import { STATUS_ATENDIMENTO, atendimentoAberto } from "./ciclo.js";
import { PAPEIS, VINCULO_POR_CHAVE } from "./responsavel.js";

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

/**
 * Só a HORA, "14:35".
 *
 * Aceita as duas formas que a base tem: o timestamp completo do
 * `chegada_em` e o "14:35:00" da coluna `hora` da agenda. A segunda NÃO
 * passa por `new Date` — "14:35:00" sozinho não é data e vira `Invalid
 * Date`, o que apagaria o horário da consulta do comprovante.
 */
export function horaBR(valor) {
  const s = String(valor ?? "").trim();
  if (!s) return "";
  const soHora = /^([0-9]{2}):([0-9]{2})/.exec(s);
  if (soHora && !s.includes("T") && !s.includes("-")) return `${soHora[1]}:${soHora[2]}`;
  const d = new Date(s);
  if (isNaN(d)) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
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
  responsaveis = [], hospital, usuario, agora = new Date(),
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
    // Quem consente e a quem o paciente pode ser entregue. É a informação
    // que a folha carrega até a beira do leito — e a única forma de a
    // enfermagem do turno da noite saber a quem NÃO entregar a criança.
    // Acompanhante aparece com o rótulo dele: quem só acompanha não recebe
    // alta, e o papel impresso é o que impede a confusão no corredor.
    responsaveis: (Array.isArray(responsaveis) ? responsaveis : [])
      .filter(r => r?.ativo !== false && String(r?.nome ?? "").trim())
      .map(r => ({
        nome: String(r.nome).trim(),
        vinculo: VINCULO_POR_CHAVE[r.vinculo]?.label || r.vinculo || "",
        papel: PAPEIS[r.papel]?.label || r.papel || "",
        cpf: r.cpf ? formatarCPF(r.cpf) : "",
        telefone: r.telefone || "",
        recebeAlta: !!r.recebe_alta,
      })),
    identificadores: conf.identificadores,
    pulseira: { estado: conf.estado, selo: conf.selo, aviso: conf.aviso },
    rodape: {
      impressoPor: usuario?.name || usuario?.nome || usuario?.username || "—",
      impressoEm: dataHoraBR(agora),
    },
  };
}

// ── DECLARAÇÃO DE COMPARECIMENTO ────────────────────────────

/**
 * O papel que o paciente leva para o patrão.
 *
 * DECLARAÇÃO NÃO É ATESTADO, e a diferença é a razão de este documento
 * existir separado:
 *
 *   Declaração de comparecimento atesta um FATO ADMINISTRATIVO — esta
 *   pessoa esteve aqui, destas horas àquelas. Quem constata isso é a
 *   recepção, que viu a pessoa chegar.
 *
 *   Atestado atesta INCAPACIDADE — esta pessoa precisa se afastar por N
 *   dias. É ato médico (CFM 1.658/2002) e não sai deste balcão.
 *
 * O papel diz isso em cima, por escrito. Sem essa linha, a declaração é
 * devolvida pelo RH ("está sem CID") ou usada como se afastasse o
 * trabalhador — e nos dois casos quem paga é o paciente, que volta ao
 * hospital para resolver o que a folha deveria ter resolvido.
 *
 * 🔴 NUNCA CARREGA NADA CLÍNICO. Nem CID, nem queixa, nem diagnóstico, nem
 * o setor que atendeu. Este é o único impresso do sistema cujo destinatário
 * é o EMPREGADOR do paciente: um CID aqui entrega o diagnóstico do
 * trabalhador ao patrão. Há teste travando isso.
 *
 * O PERÍODO NÃO É INVENTADO. Episódio encerrado: entrada e saída reais.
 * Episódio ainda aberto: a folha diz que a hora final é a da EMISSÃO, e
 * não finge que o paciente já saiu. Errar para menos custa uma hora ao
 * paciente; errar para mais é declarar um fato que não aconteceu.
 *
 * `acompanhante` troca o TITULAR do documento: sem ele, a declaração é do
 * próprio paciente; com ele, é de quem trouxe — que também precisa
 * justificar as horas no trabalho dele (CLT art. 473, XI, entre outras).
 */
export function declaracaoDeComparecimento({
  paciente, atendimento, acompanhante = null, hospital, usuario, agora = new Date(),
} = {}) {
  const entrada = atendimento?.chegada_em || null;
  const encerrado = !!atendimento?.desfecho_em;
  const saida = encerrado ? atendimento.desfecho_em : agora;

  const nomePaciente = comoExibir(paciente, { completo: true }) || String(paciente?.iniciais ?? "");
  const acomp = String(acompanhante?.nome ?? "").trim();

  return {
    hospital: { nome: hospital?.nome || "", sigla: hospital?.sigla || "" },
    // Quem a declaração beneficia. É o dado que decide a frase inteira do
    // corpo do documento — por isso sai resolvido daqui, e não montado na
    // tela com um ternário que a próxima pessoa lê errado.
    titular: acomp
      ? { tipo: "acompanhante", nome: acomp, vinculo: VINCULO_POR_CHAVE[acompanhante?.vinculo]?.label || acompanhante?.vinculo || "",
          documento: acompanhante?.cpf ? formatarCPF(acompanhante.cpf) : "" }
      : { tipo: "paciente", nome: nomePaciente, vinculo: "",
          documento: paciente?.cpf ? formatarCPF(paciente.cpf) : "" },
    paciente: {
      nome: nomePaciente,
      prontuario: String(paciente?.prontuario ?? ""),
      nascimento: dataBR(paciente?.data_nascimento),
    },
    periodo: {
      data: dataBR(String(entrada ?? "").slice(0, 10)),
      entrada: horaBR(entrada),
      saida: horaBR(saida),
      // A tela imprime esta ressalva junto da hora final. Sem ela, a folha
      // afirmaria uma saída que ainda não houve.
      saidaEstimada: !encerrado,
    },
    // Serve de protocolo: é por ele que o RH confere com o hospital, e é o
    // único número desta folha. Não há nada de clínico para conferir.
    atendimento: atendimento?.id ? `#${atendimento.id}` : "",
    rodape: {
      impressoPor: usuario?.name || usuario?.nome || usuario?.username || "—",
      impressoEm: dataHoraBR(agora),
    },
  };
}

// ── COMPROVANTE DE AGENDAMENTO ──────────────────────────────

/**
 * Quantos minutos antes o paciente deve chegar.
 *
 * Constante nomeada e não número solto no texto porque é o tipo de coisa
 * que o hospital vai querer mudar, e mudar em um lugar é diferente de
 * caçar "30 minutos" no meio de uma frase impressa.
 */
export const ANTECEDENCIA_MINUTOS = 30;

/** O que o paciente precisa trazer. Genérico de propósito: o convênio só é */
/** definido na chegada, então a folha pede a carteira "se tiver" em vez de */
/** afirmar que ele tem um.                                                 */
export const O_QUE_TRAZER = [
  "Documento com foto",
  "Cartão SUS",
  "Carteira do convênio, se tiver",
  "Exames e receitas anteriores",
  "Lista dos remédios que usa",
];

/**
 * O papel que o paciente leva do balcão sabendo quando voltar.
 *
 * POR QUE ELE VALE MAIS QUE UM BILHETE
 * O sistema exibe absenteísmo como indicador e ganhou a confirmação da
 * véspera para derrubá-lo. Mas a confirmação liga para o TELEFONE DO
 * CADASTRO — e ninguém nunca confere esse número com o paciente. Este
 * comprovante imprime o número que o hospital tem e pede a correção ali
 * mesmo, com a pessoa ainda na frente. É o único momento em que corrigir é
 * de graça; depois vira telefonema para um número errado.
 *
 * Sem telefone no cadastro a folha DIZ ISSO, em vez de a linha sumir: a
 * ausência é justamente o que precisa ser resolvido no balcão.
 */
export function comprovanteDeAgendamento({
  paciente, agendamento, profissional, especialidade, tipoAtendimento,
  hospital, usuario, agora = new Date(),
} = {}) {
  const semTelefone = !String(paciente?.telefone ?? "").trim();

  return {
    hospital: { nome: hospital?.nome || "", sigla: hospital?.sigla || "" },
    paciente: {
      nome: comoExibir(paciente, { completo: true }) || String(paciente?.iniciais ?? ""),
      prontuario: String(paciente?.prontuario ?? ""),
      nascimento: dataBR(paciente?.data_nascimento),
    },
    consulta: [
      { label: "Data", valor: dataBR(agendamento?.data) },
      // Chegada sem hora marcada é caso real (quem entra pela fila do dia).
      // "—" seria lido como erro de sistema; a frase diz o que é.
      { label: "Horário", valor: horaBR(agendamento?.hora) || "por ordem de chegada" },
      { label: "Especialidade", valor: String(especialidade ?? "") },
      { label: "Profissional", valor: String(profissional?.nome || profissional || "") },
      { label: "Tipo", valor: String(tipoAtendimento ?? "") },
      { label: "Local", valor: hospital?.nome || "" },
    ].filter(l => String(l.valor ?? "").trim()),
    antecedenciaMinutos: ANTECEDENCIA_MINUTOS,
    trazer: O_QUE_TRAZER,
    // O telefone é do CADASTRO, e é para ele que a confirmação da véspera
    // vai ligar. Impresso para ser conferido, não como enfeite.
    contato: {
      telefone: semTelefone ? "" : formatarTelefone(paciente.telefone),
      aviso: semTelefone
        ? "NÃO TEMOS TELEFONE SEU. Sem ele não conseguimos confirmar nem avisar mudança de horário — informe agora na recepção."
        : "Vamos ligar neste número na véspera para confirmar. Se estiver errado, corrija agora na recepção.",
    },
    protocolo: agendamento?.id ? `#${agendamento.id}` : "",
    rodape: {
      impressoPor: usuario?.name || usuario?.nome || usuario?.username || "—",
      impressoEm: dataHoraBR(agora),
    },
  };
}

// ── O QUE ESTE EPISÓDIO PODE IMPRIMIR ───────────────────────

/**
 * 🔴 NEM TODO EPISÓDIO PODE GERAR TODO PAPEL.
 *
 * Enquanto a reimpressão só existia na Recepção — que lista apenas
 * atendimentos EM ABERTO — a pergunta não aparecia. A pesquisa por
 * histórico mudou isso: ela mostra episódios de meses atrás, e cada botão
 * de imprimir ali é uma folha nova no mundo afirmando alguma coisa.
 *
 * PULSEIRA: só com o episódio ABERTO. A tira carrega o número do
 * atendimento e é feita para ser fechada num pulso. Reimprimir a de um
 * episódio encerrado produz uma pulseira com número velho pronta para ser
 * posta em alguém HOJE — que é exatamente o erro de identificação que o
 * PNSP existe para impedir. Quem precisa de pulseira nova precisa dela para
 * o episódio de agora, e esse tem o próprio botão.
 *
 * DECLARAÇÃO E FICHA: qualquer episódio, MENOS o cancelado. Cancelado é o
 * registro de que aquilo NÃO aconteceu — atendimento aberto por engano,
 * duplicado, desfeito. Declarar comparecimento a partir dele é afirmar uma
 * presença que não houve, no papel que vai para o empregador.
 *
 * Devolve os três SEMPRE, com `disponivel` e o motivo, em vez de omitir o
 * que não pode. Botão que some sem explicação vira chamado para a TI; botão
 * que diz por que está desligado ensina a regra a quem está no balcão.
 */
export function documentosDoEpisodio(atendimento) {
  const existe = !!atendimento;
  const aberto = existe && atendimentoAberto(atendimento);
  const cancelado = existe && atendimento.status === "cancelado";

  return [
    {
      chave: "pulseira", label: "Pulseira",
      disponivel: existe && aberto && !cancelado,
      porque: !existe ? "Não há episódio."
        : cancelado ? "Episódio cancelado — não houve atendimento."
          : aberto ? "" : "O episódio já foi encerrado. Pulseira com número de atendimento antigo não pode ir para o pulso de ninguém.",
    },
    {
      chave: "ficha", label: "Ficha do atendimento",
      disponivel: existe && !cancelado,
      porque: !existe ? "Não há episódio."
        : cancelado ? "Episódio cancelado — não houve atendimento." : "",
    },
    {
      chave: "declaracao", label: "Declaração de comparecimento",
      disponivel: existe && !cancelado,
      porque: !existe ? "Não há episódio."
        : cancelado ? "Episódio cancelado — declarar comparecimento seria afirmar uma presença que não houve." : "",
    },
  ];
}
