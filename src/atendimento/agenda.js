// ═══════════════════════════════════════════════════════════
// AGENDA DO AMBULATÓRIO — as regras da vaga
//
// Puro: não sabe o que é React nem banco.
//
// A REGRA QUE JUSTIFICA O ARQUIVO INTEIRO: A VAGA TEM DONO.
// A grade publica capacidade dividida em três donos — regulação (GERCON),
// marcação interna (retorno, convênio, particular) e ordem de chegada.
// Marcar internamente numa vaga que pertence à regulação é o defeito que
// faz dois pacientes aparecerem para o mesmo horário, um deles marcado por
// uma central que não tinha como saber do outro. Aqui isso é RECUSADO, não
// avisado.
//
// SOBRE DATA, QUE JÁ CUSTOU BUG NESTE PROJETO
// Toda data aqui é dia civil ('2026-07-29'), sem hora. `new Date("2026-07-29")`
// é interpretado como meia-noite UTC e, no fuso do Brasil, volta para o dia
// 28 — o que trocaria o dia da semana da grade. Por isso a conversão passa
// sempre por `diaCivil()`, que força meia-noite LOCAL.
// ═══════════════════════════════════════════════════════════

// `contaComo` mora no catálogo porque é atributo do CADASTRO do tipo de
// atendimento, não da agenda. `catalogo.js` não conhece este arquivo: sem ciclo.
import { contaComo } from "./catalogo.js";

/** Os três donos de vaga, e o que cada um implica. */
export const ORIGENS_MARCACAO = {
  regulacao: {
    label: "Regulação",
    quem: "A central regula a partir do pedido da UBS. O hospital reserva e recebe.",
    marcavelAqui: false,
    campoCota: "vagas_regulacao",
  },
  interna: {
    label: "Marcação interna",
    quem: "Retorno pedido pelo especialista, convênio e particular. Quem marca é o hospital.",
    marcavelAqui: true,
    campoCota: "vagas_internas",
  },
  chegada: {
    label: "Ordem de chegada",
    quem: "Sem marcação: entra na fila do dia.",
    marcavelAqui: true,
    campoCota: "vagas_chegada",
  },
};

export const STATUS_AGENDAMENTO = {
  agendado:  { label: "Agendado",  vivo: true },
  presente:  { label: "Presente",  vivo: true },
  falta:     { label: "Falta",     vivo: false },
  cancelado: { label: "Cancelado", vivo: false },
};

/**
 * Agendamento que ainda ocupa a vaga.
 *
 * Status DESCONHECIDO conta como ocupando — a mesma regra do
 * `atendimentoAberto` em ciclo.js, e pelo mesmo motivo, com o sinal
 * invertido. Se um dia alguma tela gravar um estado que este arquivo não
 * conhece, a vaga fica RESERVADA em vez de voltar para a fila: oferecer de
 * novo um horário que talvez já tenha dono põe duas pessoas na mesma hora,
 * e quem vem de outra cidade descobre isso na porta. Reservar a mais é
 * recuperável (alguém remarca); marcar em dobro não é.
 *
 * `falta` e `cancelado` continuam liberando de propósito: ali o estado é
 * conhecido e a decisão é explícita.
 */
export const ocupaVaga = a => STATUS_AGENDAMENTO[a?.status]?.vivo ?? true;

// ── DATA ────────────────────────────────────────────────────

/**
 * '2026-07-29' → Date na meia-noite LOCAL.
 *
 * `new Date("2026-07-29")` daria meia-noite UTC, que no Brasil é dia 28 às
 * 21h — e `getDay()` devolveria o dia da semana errado. A grade da terça
 * passaria a valer na segunda.
 */
export function diaCivil(data) {
  if (!data) return null;
  const s = String(data).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
}

/** Dia da semana (0 = domingo) de um dia civil, ou `null`. */
export function diaSemanaDe(data) {
  const d = diaCivil(data);
  return d ? d.getDay() : null;
}

/** 'HH:MM' a partir de minutos desde a meia-noite. */
const paraHora = min =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** 'HH:MM[:SS]' → minutos desde a meia-noite, ou `null`. */
export function minutosDe(hora) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ""));
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// ── GRADE ───────────────────────────────────────────────────

/**
 * Os horários que esta grade produz.
 *
 * O último horário começa antes de `hora_fim` — uma consulta de 20 minutos
 * às 11:50 numa grade que termina 12:00 não cabe, e oferecer significaria
 * marcar alguém para depois do fim do atendimento.
 */
export function horariosDaGrade(grade) {
  const ini = minutosDe(grade?.hora_inicio);
  const fim = minutosDe(grade?.hora_fim);
  const dur = Number(grade?.duracao_min) || 0;
  if (ini == null || fim == null || dur <= 0 || fim <= ini) return [];
  const out = [];
  for (let m = ini; m + dur <= fim; m += dur) out.push(paraHora(m));
  return out;
}

export const totalVagasDaGrade = g => horariosDaGrade(g).length;

const cota = (g, campo) => Math.max(0, Number(g?.[campo]) || 0);

/** A soma das três cotas. */
export const cotasSomadas = g =>
  cota(g, "vagas_regulacao") + cota(g, "vagas_internas") + cota(g, "vagas_chegada");

/**
 * A grade está coerente?
 *
 * O erro que importa é cota somando MAIS que o relógio: a grade prometeria
 * 15 vagas num período que só tem 12 horários, e três pacientes seriam
 * marcados para um horário que não existe.
 */
export function validarGrade(grade = {}) {
  const erros = [];
  const avisos = [];

  if (!String(grade.especialidade_cod ?? "").trim()) erros.push("Escolha a especialidade.");
  const ds = Number(grade.dia_semana);
  if (!Number.isInteger(ds) || ds < 0 || ds > 6) erros.push("Escolha o dia da semana.");

  const ini = minutosDe(grade.hora_inicio);
  const fim = minutosDe(grade.hora_fim);
  if (ini == null) erros.push("Informe a hora de início.");
  if (fim == null) erros.push("Informe a hora de término.");
  if (ini != null && fim != null && fim <= ini) erros.push("A hora de término tem que ser depois do início.");

  const dur = Number(grade.duracao_min);
  if (!dur || dur < 5 || dur > 240) erros.push("A duração da consulta deve ficar entre 5 e 240 minutos.");

  const total = totalVagasDaGrade(grade);
  const soma = cotasSomadas(grade);

  if (erros.length === 0) {
    if (total === 0) {
      erros.push("Este período não produz nenhum horário. Confira início, término e duração.");
    } else if (soma > total) {
      erros.push(`As cotas somam ${soma} vagas, mas o período só tem ${total} horários. Alguém seria marcado para um horário que não existe.`);
    } else if (soma === 0) {
      avisos.push(`A grade tem ${total} horários e nenhuma vaga distribuída — ninguém consegue marcar nem chegar. Divida as vagas entre regulação, marcação interna e ordem de chegada.`);
    } else if (soma < total) {
      avisos.push(`${total - soma} horário(s) do período ficam sem dono e não serão oferecidos.`);
    }
  }

  if (grade.vigencia_fim && grade.vigencia_inicio &&
      String(grade.vigencia_fim) < String(grade.vigencia_inicio)) {
    erros.push("O fim da vigência não pode ser antes do início.");
  }

  return { ok: erros.length === 0, erros, avisos, totalHorarios: total, cotasSomadas: soma };
}

/** Esta grade vale nesta data? (dia da semana + vigência + ativa) */
export function gradeValeEm(grade, data) {
  if (!grade || grade.ativo === false) return false;
  const ds = diaSemanaDe(data);
  if (ds == null || Number(grade.dia_semana) !== ds) return false;
  const dia = String(data).slice(0, 10);
  if (grade.vigencia_inicio && dia < String(grade.vigencia_inicio).slice(0, 10)) return false;
  if (grade.vigencia_fim && dia > String(grade.vigencia_fim).slice(0, 10)) return false;
  return true;
}

/** As grades aplicáveis a um dia. */
export const gradesDoDia = (grades, data) =>
  (grades || []).filter(g => gradeValeEm(g, data));

// ── BLOQUEIOS ───────────────────────────────────────────────

/**
 * O motivo pelo qual este dia está bloqueado, ou `null`.
 *
 * Bloqueio sem especialidade nem profissional vale para o ambulatório
 * inteiro — é o feriado. Com especialidade, vale só para ela.
 */
export function bloqueioDoDia(bloqueios, data, { especialidade, profissional } = {}) {
  const dia = String(data ?? "").slice(0, 10);
  if (!dia) return null;
  for (const b of bloqueios || []) {
    if (dia < String(b.data_inicio).slice(0, 10)) continue;
    if (dia > String(b.data_fim).slice(0, 10)) continue;
    if (b.especialidade_cod && especialidade && b.especialidade_cod !== especialidade) continue;
    if (b.profissional_username && profissional && b.profissional_username !== profissional) continue;
    // Bloqueio de um profissional específico não bloqueia a especialidade
    // toda quando se pergunta pela especialidade sem dizer de quem.
    if (b.profissional_username && !profissional) continue;
    return b;
  }
  return null;
}

/**
 * Quem JÁ ESTÁ MARCADO dentro do período que se quer bloquear.
 *
 * POR QUE ISTO EXISTE
 * O bloqueio impede MARCAR daqui para a frente — `podeMarcar` o consulta — e
 * não olhava para trás. Publicar "congresso do ortopedista, quinta" deixava
 * os doze pacientes já marcados naquela quinta com status `agendado`,
 * aparecendo no dia como se nada tivesse acontecido. Ninguém liga para eles,
 * e eles vêm de outra cidade encontrar a porta fechada.
 *
 * É o único item da fila cujo dano cai sobre o PACIENTE, e é o que o próprio
 * comentário da migração diz que o bloqueio existe para evitar — e evitava
 * só pela metade.
 *
 * Casa pela MESMA lógica de `bloqueioDoDia`, na direção inversa: bloqueio sem
 * especialidade nem profissional é o feriado e atinge todo mundo; com
 * especialidade, atinge só ela; com profissional, só ele.
 *
 * Só conta agendamento VIVO: falta e cancelado já não esperam ninguém.
 */
export function agendamentosAtingidos({ agendamentos = [], bloqueio } = {}) {
  const ini = String(bloqueio?.data_inicio ?? "").slice(0, 10);
  const fim = String(bloqueio?.data_fim ?? "").slice(0, 10);
  if (!ini || !fim) return [];
  const esp = String(bloqueio?.especialidade_cod ?? "").trim();
  const prof = String(bloqueio?.profissional_username ?? "").trim();

  return (agendamentos || []).filter(a => {
    const d = String(a?.data ?? "").slice(0, 10);
    if (!d || d < ini || d > fim) return false;
    if (!ocupaVaga(a)) return false;
    if (esp && a.especialidade_cod !== esp) return false;
    if (prof && a.profissional_username !== prof) return false;
    return true;
  }).sort((a, b) => (`${a.data}${a.hora ?? ""}` < `${b.data}${b.hora ?? ""}` ? -1 : 1));
}

// ── VAGAS DO DIA ────────────────────────────────────────────

/**
 * De quem é esta vaga.
 *
 * FONTE ÚNICA — e tem que ser IDÊNTICA à chave do índice único
 * `ag_agend_vaga_unica_prof` (migracao-agenda-vaga-por-profissional.sql).
 * Se a tela contar de um jeito e o banco travar de outro, a recepcionista vê
 * "livre", clica, e leva uma recusa que a tela não sabe explicar.
 *
 * A vaga pertence a QUEM ATENDE. Quando a grade não tem profissional
 * definido — o que `validarGrade` permite —, ela volta a pertencer à
 * especialidade, que era o comportamento antigo para todo mundo.
 *
 * O prefixo evita que um username coincidente com um código de
 * especialidade misture as duas chaves.
 */
export const donoDaVaga = x =>
  x?.profissional_username ? `p:${x.profissional_username}` : `e:${x?.especialidade_cod ?? ""}`;

/**
 * Quantas vagas de cada dono existem, estão ocupadas e sobram.
 *
 * Só conta agendamento VIVO (agendado ou presente). Falta e cancelado
 * liberam a vaga de propósito: o horário volta para quem remarca, e o
 * histórico do que foi desmarcado continua gravado.
 *
 * 🔴 Contava por ESPECIALIDADE, e por isso o card da Dra. B mostrava a cota
 * consumida pelo Dr. A: dois profissionais da mesma especialidade no mesmo
 * turno apareciam como um só, com as vagas de um comendo as do outro. Agora
 * cada agenda conta a sua.
 */
export function vagasDoDia(grade, data, agendamentos = []) {
  const dono = donoDaVaga(grade);
  const doDia = (agendamentos || []).filter(a =>
    String(a.data).slice(0, 10) === String(data).slice(0, 10) &&
    donoDaVaga(a) === dono &&
    ocupaVaga(a));

  const out = {};
  for (const [chave, cfg] of Object.entries(ORIGENS_MARCACAO)) {
    const total = cota(grade, cfg.campoCota);
    const ocupadas = doDia.filter(a => a.origem_marcacao === chave).length;
    out[chave] = { total, ocupadas, livres: Math.max(0, total - ocupadas) };
  }
  return out;
}

/**
 * Os horários da grade que ainda não estão tomados neste dia.
 *
 * Pelo mesmo dono da vaga: o horário das 08:00 do Dr. A não é o das 08:00 da
 * Dra. B, e tratar os dois como o mesmo era o que impedia o hospital de pôr
 * dois médicos da mesma especialidade no mesmo turno.
 */
export function horariosLivres(grade, data, agendamentos = []) {
  const dono = donoDaVaga(grade);
  const tomados = new Set((agendamentos || [])
    .filter(a => String(a.data).slice(0, 10) === String(data).slice(0, 10)
              && donoDaVaga(a) === dono
              && ocupaVaga(a) && a.hora)
    .map(a => String(a.hora).slice(0, 5)));
  return horariosDaGrade(grade).filter(h => !tomados.has(h));
}

/**
 * A grade que recebe quem chegou SEM ter marcado, nesta data e especialidade.
 *
 * POR QUE ISTO EXISTE
 * O paciente que chega ao balcão sem hora marcada abre um atendimento
 * normalmente — e até aqui não entrava na PRODUÇÃO do ambulatório, porque o
 * relatório do mês conta agendamentos e esse episódio não tinha um. O número
 * saía menor que a realidade, em silêncio, que é o defeito que este módulo
 * mais repetiu.
 *
 * Devolve sempre um veredito explicável, nunca só `null`, porque a tela
 * precisa dizer à recepcionista O QUE aconteceu:
 *
 *   { grade, ok: true }                    → dá para amarrar
 *   { grade: null, motivo: "sem_grade" }   → não há grade publicada hoje
 *   { grade, ok: false, motivo: "sem_cota" } → a grade existe e a cota de
 *                                              chegada acabou
 *
 * `sem_cota` NÃO impede abrir o atendimento: a pessoa já está na frente e o
 * episódio já é real. Impede apenas contá-lo numa vaga que não existe — o
 * que faria a grade prometer capacidade que ela não tem.
 */
export function gradeParaChegada({ grades = [], data, especialidade, agendamentos = [], bloqueios = [] } = {}) {
  const candidatas = gradesDoDia(grades, data)
    .filter(g => g.especialidade_cod === especialidade)
    .filter(g => !bloqueioDoDia(bloqueios, data, {
      especialidade: g.especialidade_cod, profissional: g.profissional_username }));

  if (!candidatas.length) return { grade: null, ok: false, motivo: "sem_grade" };

  // A primeira com cota livre. Com dois profissionais no mesmo turno, quem
  // ainda tem vaga de chegada recebe — e `vagasDoDia` já conta por dono.
  for (const g of candidatas) {
    const v = vagasDoDia(g, data, agendamentos);
    if (v.chegada.livres > 0) return { grade: g, ok: true };
  }
  return { grade: candidatas[0], ok: false, motivo: "sem_cota" };
}

// ── A REGRA CENTRAL ─────────────────────────────────────────

/**
 * Pode marcar?
 *
 * Devolve erros que IMPEDEM, porque aqui bloquear é o certo — diferente da
 * ficha, onde pendência administrativa não pode segurar paciente. Marcar
 * numa vaga que não é sua não é pendência: é agendar duas pessoas para o
 * mesmo lugar, e o paciente que vem de outra cidade descobre isso na porta.
 */
export function podeMarcar({
  grade, data, hora, origem = "interna", agendamentos = [], bloqueios = [], hoje = null,
  paciente = null,
} = {}) {
  const erros = [];
  const avisos = [];
  const cfg = ORIGENS_MARCACAO[origem];

  if (!cfg) return { ok: false, erros: ["Origem de marcação desconhecida."], avisos };
  if (!grade) return { ok: false, erros: ["Escolha a grade (especialidade e dia)."], avisos };
  if (!diaCivil(data)) return { ok: false, erros: ["Informe a data."], avisos };

  // ÓBITO REGISTRADO — recusa, e vem antes de qualquer conferência de vaga.
  //
  // A Recepção já tratava isto como bloqueante (`recepcao.js`, chave
  // "obito"), e a Agenda não olhava: dava para marcar consulta para quem
  // morreu, com um clique, e a família descobria pelo telefonema de
  // confirmação da véspera. Duas telas do mesmo módulo discordando sobre o
  // mesmo fato é como o dano chega ao paciente — e aqui o dano é a família.
  //
  // `paciente` é opcional na assinatura de propósito: quem não tem o
  // cadastro em mãos continua conferindo a vaga normalmente, e a checagem
  // não vira um erro falso de "sem paciente" numa chamada que só quer saber
  // se o horário está livre.
  if (paciente?.obito) {
    erros.push("Este paciente tem óbito registrado no cadastro. Se for engano, corrija o cadastro antes de marcar.");
  }

  if (!cfg.marcavelAqui) {
    erros.push(`Vaga de ${cfg.label.toLowerCase()} não é marcada aqui. ${cfg.quem} O sistema reserva a vaga; quem a ocupa é definido lá.`);
  }

  if (!gradeValeEm(grade, data)) {
    erros.push("Não há grade desta especialidade nesta data — confira o dia da semana e a vigência.");
  }

  const bloq = bloqueioDoDia(bloqueios, data, {
    especialidade: grade.especialidade_cod, profissional: grade.profissional_username,
  });
  if (bloq) erros.push(`Dia bloqueado: ${bloq.motivo}.`);

  // Cota do dono. É aqui que a regulação fica protegida: esgotada a cota
  // interna, o que sobra na grade pertence a ela.
  // Cota do dono. NÃO condicionada a `marcavelAqui`: cota é CAPACIDADE e
  // propriedade é AUTORIZAÇÃO — checagens independentes. Amarrar as duas
  // fazia a cota da regulação nunca ser conferida, e `podeRegistrarDaRegulacao`
  // (que pula a checagem de propriedade, de propósito) aceitaria transcrever
  // a sétima vaga de uma cota de seis.
  const vagas = vagasDoDia(grade, data, agendamentos);
  const minha = vagas[origem];
  if (minha && minha.livres <= 0) {
    const sobra = vagas.regulacao?.livres || 0;
    erros.push(
      `As ${minha.total} vaga(s) de ${cfg.label.toLowerCase()} deste dia já estão ocupadas.` +
      (sobra > 0
        ? ` Ainda há ${sobra} horário(s) livre(s), mas eles pertencem à regulação — usar aqui faria dois pacientes chegarem para a mesma vaga.`
        : ""));
  }

  // Horário: obrigatório fora da fila de chegada, e não pode estar tomado.
  if (origem !== "chegada") {
    if (minutosDe(hora) == null) {
      erros.push("Informe o horário.");
    } else {
      const h = String(hora).slice(0, 5);
      if (!horariosDaGrade(grade).includes(h)) {
        erros.push(`${h} não é um horário desta grade.`);
      } else if (!horariosLivres(grade, data, agendamentos).includes(h)) {
        erros.push(`${h} já está ocupado.`);
      }
    }
  }

  // Data no passado avisa, não impede: lançar consulta de ontem que ficou
  // sem registro é trabalho legítimo de recepção.
  const ref = hoje ? diaCivil(hoje) : diaCivil(new Date().toISOString().slice(0, 10));
  const alvo = diaCivil(data);
  if (ref && alvo && alvo < ref) {
    avisos.push("Data no passado. Se for lançamento retroativo, siga — só confirme que é a data certa.");
  }

  return { ok: erros.length === 0, erros, avisos };
}

/**
 * A recepção pode TRANSCREVER o que a regulação marcou?
 *
 * POR QUE ISTO É OUTRA FUNÇÃO, E NÃO UM PARÂMETRO DE `podeMarcar`
 * São dois verbos diferentes, e confundi-los foi o furo do primeiro
 * desenho. `podeMarcar` recusa a vaga da regulação porque o hospital não
 * DECIDE quem a ocupa. Mas a recepção precisa REGISTRAR quem a central
 * decidiu — senão a lista do GERCON não entra no sistema e o painel do dia
 * nasce vazio.
 *
 * O que separa transcrever de burlar é a EXIGÊNCIA DO PROTOCOLO: o número
 * que o paciente traz no papel. Sem ele, isto seria uma porta para o
 * hospital enfiar paciente próprio na cota da regulação — que é exatamente
 * o que a regra original existe para impedir.
 */
export function podeRegistrarDaRegulacao({
  grade, data, hora, protocolo, agendamentos = [], bloqueios = [], hoje = null,
  paciente = null,
} = {}) {
  const erros = [];
  const avisos = [];

  if (!String(protocolo ?? "").trim()) {
    erros.push("Informe o protocolo da regulação. É ele que comprova que a vaga foi marcada pela central — sem o número, registrar aqui seria ocupar cota da regulação com paciente do hospital.");
  }

  // Todo o resto vale igual: grade, bloqueio, cota, horário livre — e o
  // óbito. A recusa por óbito atravessa a transcrição de propósito: o que a
  // central decidiu é DE QUEM É A VAGA, não se a pessoa está viva. Registrar
  // a consulta de quem morreu não honra a decisão da regulação, só produz a
  // ligação de confirmação para a família.
  const base = podeMarcar({ grade, data, hora, origem: "regulacao", agendamentos, bloqueios, hoje, paciente });
  for (const e of base.erros) {
    // O único erro que NÃO se aplica é o da propriedade da vaga — é
    // justamente o que esta função autoriza.
    if (/não é marcada aqui/i.test(e)) continue;
    erros.push(e);
  }
  avisos.push(...base.avisos);

  return { ok: erros.length === 0, erros, avisos };
}

// ── PRODUÇÃO ────────────────────────────────────────────────

/**
 * Os números que hoje são DIGITADOS À MÃO na tabela `atendimentos`.
 *
 * Com a agenda eles deixam de ser digitação e passam a ser consequência:
 * ofertadas é o que a grade abriu, realizadas é quem teve presença
 * confirmada, faltas é quem foi marcado e não veio.
 *
 * `absenteismo` é a taxa que o gestor pergunta primeiro — e é sobre quem
 * foi MARCADO, não sobre quem chegou por ordem de chegada, que não podia
 * faltar a nada.
 */
export function producaoDoDia({ grades = [], data, agendamentos = [], bloqueios = [], tiposDeAtendimento = [] } = {}) {
  const doDia = (agendamentos || []).filter(a => String(a.data).slice(0, 10) === String(data).slice(0, 10));
  const aplicaveis = gradesDoDia(grades, data)
    .filter(g => !bloqueioDoDia(bloqueios, data, {
      especialidade: g.especialidade_cod, profissional: g.profissional_username }));

  const ofertadas = aplicaveis.reduce((s, g) => s + cotasSomadas(g), 0);
  const realizadas = doDia.filter(a => a.status === "presente").length;
  const faltas = doDia.filter(a => a.status === "falta").length;
  const cancelados = doDia.filter(a => a.status === "cancelado").length;
  const marcados = doDia.filter(a => a.origem_marcacao !== "chegada"
                                  && ["agendado", "presente", "falta"].includes(a.status)).length;

  const presentes = doDia.filter(a => a.status === "presente");
  // Pelo `conta_como` do CADASTRO, não pelo código cravado aqui. Um tipo
  // novo criado em Tabelas ("retorno pós-operatório") passa a somar na
  // coluna certa em vez de sumir do relatório sem erro nenhum.
  const primeiras = presentes.filter(a => contaComo(a.tipo_atendimento_cod, tiposDeAtendimento) === "primeira").length;
  const retornos = presentes.filter(a => contaComo(a.tipo_atendimento_cod, tiposDeAtendimento) === "retorno").length;

  return {
    ofertadas,
    realizadas,
    faltas,
    cancelados,
    primeiras,
    retornos,
    porChegada: presentes.filter(a => a.origem_marcacao === "chegada").length,
    livres: Math.max(0, ofertadas - doDia.filter(ocupaVaga).length),
    // Divisão por zero viraria NaN, e NaN em indicador aparece como campo
    // vazio na tela — o gestor lê como "zero falta", que é o oposto.
    absenteismo: marcados > 0 ? Math.round((faltas / marcados) * 100) : null,
  };
}
