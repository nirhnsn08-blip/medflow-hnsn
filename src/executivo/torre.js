// ═══════════════════════════════════════════════════════════
// TORRE DE COMANDO — o motor puro do painel executivo
//
// A pergunta desta tela não é a do posto de enfermagem ("o que eu faço
// agora?"), é a da direção: **o hospital inteiro está indo bem?** São duas
// leituras diferentes do mesmo banco, e é por isso que a Torre é um módulo
// separado do Centro de Monitoramento — que está concedido a 14 perfis e
// continua sendo a porta de entrada de todo mundo.
//
// ── A REGRA QUE MANDA EM TODO ESTE ARQUIVO ──────────────────
// 🔴 **NÚMERO SEM LEITURA NÃO É ZERO.**
//
// Num painel de diretoria isso deixa de ser detalhe técnico e vira risco de
// decisão. "0 materiais em falta" e "não consegui ler o estoque" levam a
// atos opostos: o primeiro manda tocar o dia, o segundo manda ir olhar. Um
// painel que confunde os dois entrega o pior dos dois mundos — a calma do
// primeiro com a realidade do segundo.
//
// Por isso toda medida carrega `lido`. Quando a leitura falhou, `valor` é
// null e a tela é obrigada a dizer que não sabe. É o mesmo princípio do
// `util/leitura.js` e do painel MEOWS da Maternidade, aplicado à camada em
// que um erro custa mais caro.
//
// ⚠️ APOIO À GESTÃO, NUNCA VERDADE ABSOLUTA. Os limiares (ocupação alta,
// espera longa) são ponto de partida e entram por parâmetro — variam por
// hospital, e o responsável ajusta sem mexer no motor.
// ═══════════════════════════════════════════════════════════

export const NIVEL = { BOM: "bom", ATENCAO: "atencao", CRITICO: "critico", NEUTRO: "neutro" };

/** Limiares de referência. Ponto de partida, não lei — entram por parâmetro. */
export const LIMIARES = {
  ocupacao: { atencao: 85, critico: 95 },
  ocupacaoUti: { atencao: 80, critico: 90 },
  esperaPaMin: { atencao: 60, critico: 120 },
  permanenciaDias: { atencao: 7, critico: 10 },
};

const num = v => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Uma medida lida do banco. */
export function medida(chave, rotulo, valor, extras = {}) {
  return { chave, rotulo, valor, unidade: null, nivel: NIVEL.NEUTRO, detalhe: null, lido: true, ...extras };
}

/**
 * Uma medida que NÃO pôde ser lida. `valor` é null de propósito: a tela não
 * tem como imprimir um número, e é isso que se quer.
 */
export function semLeitura(chave, rotulo, oQue) {
  return {
    chave, rotulo, valor: null, unidade: null, nivel: NIVEL.NEUTRO,
    detalhe: `Não consegui ler ${oQue}.`, lido: false,
  };
}

/** O nível conforme um valor cruza limiares crescentes (quanto maior, pior). */
export function nivelPorLimiar(valor, { atencao, critico }) {
  const v = num(valor);
  if (v == null) return NIVEL.NEUTRO;
  if (v >= critico) return NIVEL.CRITICO;
  if (v >= atencao) return NIVEL.ATENCAO;
  return NIVEL.BOM;
}

/**
 * "2026-09-14" a partir de uma data, ISO ou Date — sempre no fuso LOCAL.
 *
 * 🔴 A DATA PURA NÃO PASSA PELO `new Date()`. `new Date("2026-09-14")` é lido
 * como meia-noite UTC; no nosso fuso isso é 21 h do dia 13, e a data volta um
 * dia. Como `leitos_saidas.data_alta` e `cc_cirurgias.data` são colunas
 * `date`, o painel jogaria TODA alta e TODA cirurgia para a véspera — o dia
 * de hoje amanheceria vazio, todo santo dia, sem erro nenhum na tela.
 *
 * Então: string no formato de data volta como veio; só o que tem hora é que
 * precisa ser interpretado.
 */
export function diaDe(quando) {
  if (!quando) return null;
  if (typeof quando === "string") {
    const so = quando.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(so)) return so;
    // "2026-09-14T08:00:00" sem fuso: o JS já lê como local, mas cortar é
    // mais barato e não depende disso.
    if (/^\d{4}-\d{2}-\d{2}T/.test(so) && !/[Zz]|[+-]\d{2}:?\d{2}$/.test(so)) return so.slice(0, 10);
  }
  const d = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Minutos entre duas datas; null se alguma não der para ler. */
export function minutosEntre(de, ate) {
  if (!de || !ate) return null;
  const a = new Date(de).getTime(), b = new Date(ate).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
}

// ═══════════════════════════════════════════════════════════
// OCUPAÇÃO — o número do topo
// ═══════════════════════════════════════════════════════════

/**
 * O censo do hospital inteiro.
 *
 * O denominador é o leito OPERACIONAL (não interditado). Contar leito
 * interditado como disponível afunda a taxa e faz um hospital lotado parecer
 * folgado — é a conta que esconde exatamente a crise que o painel existe
 * para mostrar.
 */
export function censoGeral(leitos, { lido = true, limiares = LIMIARES.ocupacao } = {}) {
  if (!lido) return { ...semLeitura("ocupacao", "Ocupação geral", "os leitos"), operacionais: null, ocupados: null };
  const lista = Array.isArray(leitos) ? leitos : [];
  const interditados = lista.filter(l => l.status === "interditado").length;
  const operacionais = lista.length - interditados;
  const ocupados = lista.filter(l => l.status === "ocupado").length;
  const higienizacao = lista.filter(l => l.status === "higienizacao").length;
  const livres = operacionais - ocupados - higienizacao;
  const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;

  return {
    ...medida("ocupacao", "Ocupação geral", pct, { unidade: "%", nivel: nivelPorLimiar(pct, limiares) }),
    totalLeitos: lista.length, operacionais, ocupados, livres: Math.max(0, livres), higienizacao, interditados,
  };
}

/** O mesmo censo, restrito aos setores que casam com um padrão (a UTI). */
export function censoDeSetores(leitos, nomes, { lido = true, limiares = LIMIARES.ocupacaoUti, chave = "uti", rotulo = "Ocupação UTI" } = {}) {
  if (!lido) return { ...semLeitura(chave, rotulo, "os leitos"), operacionais: null, ocupados: null };
  const alvo = new Set((nomes || []).map(n => String(n).toLowerCase()));
  const dele = (Array.isArray(leitos) ? leitos : []).filter(l => alvo.has(String(l.setor || "").toLowerCase()));
  const operacionais = dele.filter(l => l.status !== "interditado").length;
  const ocupados = dele.filter(l => l.status === "ocupado").length;
  const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;
  return {
    ...medida(chave, rotulo, pct, { unidade: "%", nivel: nivelPorLimiar(pct, limiares) }),
    operacionais, ocupados, semSetor: alvo.size === 0,
  };
}

/** Os setores cujo nome indica terapia intensiva — achados pelo cadastro. */
export function setoresDeUti(setores) {
  return (Array.isArray(setores) ? setores : [])
    .map(s => s.nome)
    .filter(n => /\b(uti|utin|uci|terapia intensiva|intensiv)/i.test(String(n || "")));
}

/**
 * O mapa de ocupação: uma linha por setor, com a meta do próprio setor.
 *
 * Os limiares vêm do CADASTRO do setor (`alerta_amarelo`/`alerta_vermelho`),
 * não de uma constante: a UTI e a enfermaria não lotam no mesmo ponto, e quem
 * sabe disso é quem cadastrou o setor.
 */
export function mapaDeSetores(leitos, setores, { lido = true } = {}) {
  if (!lido) return { lido: false, linhas: [] };
  const lista = Array.isArray(leitos) ? leitos : [];
  const linhas = (Array.isArray(setores) ? setores : [])
    .map(setor => {
      const dele = lista.filter(l => (l.setor || "") === setor.nome);
      const operacionais = dele.filter(l => l.status !== "interditado").length;
      const ocupados = dele.filter(l => l.status === "ocupado").length;
      const pct = operacionais > 0 ? Math.round((ocupados / operacionais) * 100) : null;
      const amarelo = setor.alerta_amarelo ?? LIMIARES.ocupacao.atencao;
      const vermelho = setor.alerta_vermelho ?? LIMIARES.ocupacao.critico;
      return {
        nome: setor.nome, ordem: setor.ordem ?? 0,
        operacionais, ocupados, livres: operacionais - ocupados, pct,
        nivel: pct == null ? NIVEL.NEUTRO : pct >= vermelho ? NIVEL.CRITICO : pct >= amarelo ? NIVEL.ATENCAO : NIVEL.BOM,
        metaOcupacao: setor.meta_ocupacao ?? null,
      };
    })
    // O setor mais apertado primeiro: a direção lê o topo da lista, não o fim.
    .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || a.ordem - b.ordem || String(a.nome).localeCompare(String(b.nome)));

  const semSetor = lista.filter(l => !l.setor).length;
  return { lido: true, linhas, semSetor };
}

// ═══════════════════════════════════════════════════════════
// MOVIMENTO DO DIA — quem entrou, quem saiu, quanto tempo ficou
// ═══════════════════════════════════════════════════════════

/** Altas de hoje (pela data de alta registrada na saída do leito). */
export function altasDoDia(saidas, hoje, { lido = true } = {}) {
  if (!lido) return semLeitura("altas_hoje", "Altas hoje", "as saídas de leito");
  const dia = diaDe(hoje);
  const n = (Array.isArray(saidas) ? saidas : []).filter(s => String(s.data_alta || "").slice(0, 10) === dia).length;
  return medida("altas_hoje", "Altas hoje", n, { nivel: NIVEL.NEUTRO });
}

/**
 * Permanência média das altas de um período.
 *
 * Só entra alta COM permanência registrada. Tratar o nulo como zero puxaria a
 * média para baixo e faria o hospital parecer mais eficiente do que é — o
 * `contadas` viaja junto para a tela poder dizer sobre quantas altas falou.
 */
export function permanenciaMedia(saidas, { desde = null, ate = null, lido = true, limiares = LIMIARES.permanenciaDias } = {}) {
  if (!lido) return semLeitura("permanencia", "Permanência média", "as saídas de leito");
  const dentro = (Array.isArray(saidas) ? saidas : []).filter(s => {
    const d = String(s.data_alta || "").slice(0, 10);
    if (!d) return false;
    if (desde && d < desde) return false;
    if (ate && d > ate) return false;
    return true;
  });
  const vals = dentro.map(s => num(s.dias_permanencia)).filter(v => v != null);
  if (!vals.length) {
    return { ...medida("permanencia", "Permanência média", null, { unidade: "d" }), contadas: 0, semDado: true };
  }
  const media = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  return {
    ...medida("permanencia", "Permanência média", media, { unidade: "d", nivel: nivelPorLimiar(media, limiares) }),
    contadas: vals.length, totalAltas: dentro.length,
  };
}

/**
 * Giro de leito do período: altas ÷ leitos operacionais.
 *
 * Sem leito operacional o giro não é 0, é indefinido — dividir por zero aqui
 * viraria "o hospital não girou", quando o certo é "não há leito cadastrado".
 */
export function giroDeLeito(saidas, operacionais, { desde = null, ate = null, lido = true } = {}) {
  if (!lido) return semLeitura("giro", "Giro de leito", "as saídas de leito");
  const altas = (Array.isArray(saidas) ? saidas : []).filter(s => {
    const d = String(s.data_alta || "").slice(0, 10);
    if (!d) return false;
    if (desde && d < desde) return false;
    if (ate && d > ate) return false;
    return true;
  }).length;
  const op = num(operacionais);
  if (!op) return { ...medida("giro", "Giro de leito", null), altas, semLeitos: true };
  return { ...medida("giro", "Giro de leito", Math.round((altas / op) * 100) / 100), altas };
}

// ═══════════════════════════════════════════════════════════
// PORTA DE ENTRADA — pronto atendimento
// ═══════════════════════════════════════════════════════════

/**
 * A espera no PA, agora. Duas esperas diferentes, de propósito:
 *
 * • quem chegou e AINDA NÃO FOI TRIADO — é o risco clínico puro: ninguém
 *   olhou essa pessoa ainda, e é aqui que a fila mata.
 * • quem foi triado e AGUARDA ATENDIMENTO — é fila conhecida e classificada.
 *
 * Somar as duas numa "espera média" esconderia a primeira dentro da segunda.
 */
export function esperaNoPa(atendimentos, agora, { lido = true, limiares = LIMIARES.esperaPaMin } = {}) {
  if (!lido) return { ...semLeitura("pa", "Espera no PA", "os atendimentos do PS"), aguardandoTriagem: null, aguardandoAtendimento: null };
  const lista = (Array.isArray(atendimentos) ? atendimentos : [])
    .filter(a => a.status !== "finalizado" && !a.cancelado_em);

  const semTriagem = lista.filter(a => !a.triagem_em);
  const triadosSemAtendimento = lista.filter(a => a.triagem_em && !a.atendimento_em);

  const esperas = semTriagem.map(a => minutosEntre(a.chegada_em, agora)).filter(v => v != null);
  const maior = esperas.length ? Math.max(...esperas) : null;
  const media = esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : null;

  return {
    ...medida("pa", "Aguardando triagem", semTriagem.length, {
      nivel: nivelPorLimiar(maior, limiares),
      detalhe: maior == null ? null : `maior espera ${maior} min`,
    }),
    naFila: lista.length,
    aguardandoTriagem: semTriagem.length,
    aguardandoAtendimento: triadosSemAtendimento.length,
    maiorEsperaMin: maior, mediaEsperaMin: media,
  };
}

/** O rótulo de origem que marca o aceite pela regulação estadual. */
export const ORIGEM_GERINT = "GERINT (aceite)";

/**
 * Pacientes aceitos via GERINT — a regulação que manda paciente para cá.
 * Quebrado por unidade de origem, que é o que a direção cobra: quem está
 * mandando, e quanto.
 */
export function aceitesGerint(atendimentos, { hoje = null, desde = null, lido = true } = {}) {
  if (!lido) return { ...semLeitura("gerint", "Aceites GERINT", "os atendimentos do PS"), porUnidade: [] };
  const lista = (Array.isArray(atendimentos) ? atendimentos : [])
    .filter(a => String(a.origem || "").toUpperCase().startsWith("GERINT"));

  const diaHoje = diaDe(hoje);
  const doDia = lista.filter(a => diaDe(a.chegada_em) === diaHoje);
  const noPeriodo = desde ? lista.filter(a => diaDe(a.chegada_em) >= desde) : lista;

  const porUnidade = [...noPeriodo.reduce((m, a) => {
    const u = a.origem_detalhe || "Sem unidade informada";
    m.set(u, (m.get(u) || 0) + 1);
    return m;
  }, new Map())].map(([unidade, quantos]) => ({ unidade, quantos }))
    .sort((a, b) => b.quantos - a.quantos || a.unidade.localeCompare(b.unidade));

  return {
    ...medida("gerint", "Aceites GERINT hoje", doDia.length, { detalhe: `${noPeriodo.length} no período` }),
    noPeriodo: noPeriodo.length, porUnidade,
  };
}

// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — o fluxo do dia
// ═══════════════════════════════════════════════════════════

export const CIRURGIA = {
  AGENDADA: "agendada", CHECKIN: "checkin", EM_CIRURGIA: "em_cirurgia",
  RECUPERACAO: "recuperacao", CONCLUIDA: "concluida", CANCELADA: "cancelada",
};

/**
 * O fluxo cirúrgico de um dia: o que já saiu, o que está dentro da sala, o
 * que ainda vai entrar e o que caiu.
 *
 * "Em andamento" reúne check-in, cirurgia e recuperação — do ponto de vista
 * da direção, o paciente que fez check-in já é compromisso do bloco, e
 * separar os três estados aqui seria detalhe de quem escala a sala, não de
 * quem responde pelo hospital.
 *
 * Cada cancelamento sai NOMEADO (iniciais + prontuário + motivo). Um número
 * agregado de cancelamentos não permite agir; um nome, sim.
 */
export function fluxoCirurgico(cirurgias, hoje, { lido = true } = {}) {
  if (!lido) return { ...semLeitura("cirurgias", "Cirurgias hoje", "a agenda do bloco"), cancelamentos: [] };
  const dia = diaDe(hoje);
  const doDia = (Array.isArray(cirurgias) ? cirurgias : [])
    .filter(c => String(c.data || "").slice(0, 10) === dia);

  const por = s => doDia.filter(c => c.status === s).length;
  const emAndamento = por(CIRURGIA.CHECKIN) + por(CIRURGIA.EM_CIRURGIA) + por(CIRURGIA.RECUPERACAO);
  const realizadas = por(CIRURGIA.CONCLUIDA);
  const agendadas = por(CIRURGIA.AGENDADA);
  const canceladas = por(CIRURGIA.CANCELADA);

  const cancelamentos = doDia.filter(c => c.status === CIRURGIA.CANCELADA).map(c => ({
    id: c.id, iniciais: c.iniciais || null, prontuario: c.prontuario || null,
    procedimento: c.procedimento || null, sala: c.sala || null,
    motivo: c.cancelamento_motivo || "Motivo não registrado",
    semMotivo: !c.cancelamento_motivo,
  }));

  const previstas = doDia.length;
  return {
    ...medida("cirurgias", "Cirurgias realizadas hoje", realizadas, {
      detalhe: previstas ? `de ${previstas} no mapa do dia` : null,
      nivel: canceladas > 0 ? NIVEL.ATENCAO : NIVEL.NEUTRO,
    }),
    previstas, agendadas, emAndamento, realizadas, canceladas, cancelamentos,
    taxaCancelamento: previstas > 0 ? Math.round((canceladas / previstas) * 1000) / 10 : null,
  };
}

// ═══════════════════════════════════════════════════════════
// AMBULATÓRIO — ofertado × realizado, hoje
// ═══════════════════════════════════════════════════════════

export const AGENDAMENTO = {
  AGENDADO: "agendado", CONFIRMADO: "confirmado", PRESENTE: "presente",
  FALTA: "falta", CANCELADO: "cancelado",
};

/** As vagas que uma grade oferta por dia (chegada + internas + regulação). */
export function vagasDaGrade(g) {
  return (num(g?.vagas_chegada) || 0) + (num(g?.vagas_internas) || 0) + (num(g?.vagas_regulacao) || 0);
}

/**
 * O ambulatório de hoje: quantas vagas foram OFERTADAS pelas grades vigentes
 * e quantas viraram atendimento.
 *
 * A oferta vem da grade do dia da semana, respeitando a vigência — uma grade
 * encerrada em junho não oferta vaga em setembro. Sem isso, a taxa de
 * ocupação da agenda ficaria permanentemente baixa por causa de grades
 * antigas, e o indicador viraria ruído.
 */
export function ambulatorioDoDia(grades, agendamentos, hoje, { lido = true } = {}) {
  if (!lido) return { ...semLeitura("ambulatorio", "Ambulatório hoje", "a agenda ambulatorial"), porEspecialidade: [], profissionais: [] };
  const dia = diaDe(hoje);
  const diaSemana = new Date(`${dia}T12:00:00`).getDay();

  const vigentes = (Array.isArray(grades) ? grades : []).filter(g => {
    if (g.ativo === false) return false;
    if (Number(g.dia_semana) !== diaSemana) return false;
    if (g.vigencia_inicio && dia < String(g.vigencia_inicio).slice(0, 10)) return false;
    if (g.vigencia_fim && dia > String(g.vigencia_fim).slice(0, 10)) return false;
    return true;
  });
  const ofertadas = vigentes.reduce((t, g) => t + vagasDaGrade(g), 0);

  const doDia = (Array.isArray(agendamentos) ? agendamentos : [])
    .filter(a => String(a.data || "").slice(0, 10) === dia);
  const por = s => doDia.filter(a => a.status === s).length;
  const realizadas = por(AGENDAMENTO.PRESENTE);
  const faltas = por(AGENDAMENTO.FALTA);
  const cancelados = por(AGENDAMENTO.CANCELADO);
  const aguardando = por(AGENDAMENTO.AGENDADO) + por(AGENDAMENTO.CONFIRMADO);

  // Por especialidade: oferta da grade × agenda do dia, lado a lado.
  const chaves = new Set([...vigentes.map(g => g.especialidade_cod), ...doDia.map(a => a.especialidade_cod)].filter(Boolean));
  const porEspecialidade = [...chaves].map(cod => {
    const ofer = vigentes.filter(g => g.especialidade_cod === cod).reduce((t, g) => t + vagasDaGrade(g), 0);
    const meus = doDia.filter(a => a.especialidade_cod === cod);
    return {
      especialidade: cod,
      ofertadas: ofer,
      agendadas: meus.filter(a => a.status !== AGENDAMENTO.CANCELADO).length,
      realizadas: meus.filter(a => a.status === AGENDAMENTO.PRESENTE).length,
      faltas: meus.filter(a => a.status === AGENDAMENTO.FALTA).length,
    };
  }).sort((a, b) => b.agendadas - a.agendadas || String(a.especialidade).localeCompare(String(b.especialidade)));

  // Quem está atendendo hoje — da grade vigente, que é quem se comprometeu.
  const profissionais = [...vigentes.reduce((m, g) => {
    const p = g.profissional_username;
    if (!p) return m;
    const at = m.get(p) || { profissional: p, especialidades: new Set(), vagas: 0, realizadas: 0 };
    if (g.especialidade_cod) at.especialidades.add(g.especialidade_cod);
    at.vagas += vagasDaGrade(g);
    m.set(p, at);
    return m;
  }, new Map()).values()].map(p => ({
    ...p,
    especialidades: [...p.especialidades],
    realizadas: doDia.filter(a => a.profissional_username === p.profissional && a.status === AGENDAMENTO.PRESENTE).length,
  })).sort((a, b) => b.vagas - a.vagas || String(a.profissional).localeCompare(String(b.profissional)));

  return {
    ...medida("ambulatorio", "Consultas realizadas hoje", realizadas, {
      detalhe: ofertadas ? `de ${ofertadas} vagas ofertadas` : "nenhuma grade vigente hoje",
    }),
    ofertadas, agendadas: doDia.length - cancelados, realizadas, faltas, cancelados, aguardando,
    ocupacaoDaAgenda: ofertadas > 0 ? Math.round(((doDia.length - cancelados) / ofertadas) * 1000) / 10 : null,
    porEspecialidade, profissionais,
  };
}

// ═══════════════════════════════════════════════════════════
// ABASTECIMENTO — o que está faltando, agora
// ═══════════════════════════════════════════════════════════

/**
 * Itens abaixo do estoque mínimo, somando o saldo dos lotes.
 *
 * Serve tanto para suprimentos quanto para a farmácia: as duas têm a mesma
 * forma (um cadastro com `estoque_minimo` e lotes com `quantidade`), e por
 * isso é uma função só — duas cópias divergiriam na primeira mudança de
 * regra, e o almoxarifado e a farmácia passariam a contar falta de jeitos
 * diferentes.
 *
 * **Item sem lote nenhum conta como zero**, e é o certo: é justamente o item
 * que acabou. Ignorá-lo faria a ruptura mais grave sumir da lista.
 */
export function itensEmFalta(itens, lotes, { chaveItem = "item_id", lido = true, origem = "estoque" } = {}) {
  if (!lido) return { lido: false, origem, total: null, itens: [], zerados: null };
  const saldo = new Map();
  for (const l of Array.isArray(lotes) ? lotes : []) {
    const id = l[chaveItem];
    if (id == null) continue;
    saldo.set(id, (saldo.get(id) || 0) + (num(l.quantidade) || 0));
  }

  const faltando = (Array.isArray(itens) ? itens : [])
    .filter(i => i.ativo !== false)
    .map(i => {
      const minimo = num(i.estoque_minimo);
      const atual = saldo.get(i.id) || 0;
      return { id: i.id, nome: i.nome, unidade: i.unidade || null, minimo, atual, origem,
               faltam: minimo == null ? null : Math.max(0, minimo - atual),
               zerado: atual <= 0 };
    })
    // Sem mínimo cadastrado não dá para dizer que falta — e dizer que falta
    // sem régua seria inventar a régua.
    .filter(i => i.minimo != null && i.minimo > 0 && i.atual < i.minimo)
    .sort((a, b) => (a.atual - b.atual) || String(a.nome || "").localeCompare(String(b.nome || "")));

  return { lido: true, origem, total: faltando.length, zerados: faltando.filter(i => i.zerado).length, itens: faltando };
}

/**
 * Almoxarifado + farmácia numa medida só — que é como a direção pergunta
 * ("está faltando alguma coisa?"). Se UMA das duas não pôde ser lida, a
 * medida inteira vira não-lida: "3 em falta" quando metade do estoque não
 * foi consultado é um número que convida a não agir.
 */
export function faltasConsolidadas(suprimentos, farmacia) {
  if (!suprimentos?.lido || !farmacia?.lido) {
    return { ...semLeitura("falta", "Materiais em falta", suprimentos?.lido ? "a farmácia" : "o almoxarifado"), itens: [], zerados: null };
  }
  const itens = [...suprimentos.itens, ...farmacia.itens].sort((a, b) => a.atual - b.atual);
  const zerados = suprimentos.zerados + farmacia.zerados;
  const total = itens.length;
  return {
    ...medida("falta", "Materiais em falta", total, {
      nivel: zerados > 0 ? NIVEL.CRITICO : total > 0 ? NIVEL.ATENCAO : NIVEL.BOM,
      detalhe: zerados > 0 ? `${zerados} zerado${zerados > 1 ? "s" : ""}` : null,
    }),
    itens, zerados,
    porOrigem: { estoque: suprimentos.total, farmacia: farmacia.total },
  };
}

// ═══════════════════════════════════════════════════════════
// O RESUMO DO TOPO — o que a direção lê em três segundos
// ═══════════════════════════════════════════════════════════

/**
 * A faixa de situação. Conta o que está crítico, o que pede atenção e —
 * separadamente — **o que não pôde ser lido**.
 *
 * 🔴 `podeDizerTudoBem` é falso enquanto houver UMA medida não lida, mesmo
 * que nenhuma esteja crítica. É o mesmo contrato do painel MEOWS: silêncio
 * não é boa notícia, é ausência de notícia.
 */
export function resumoDaTorre(medidas = []) {
  const lista = (Array.isArray(medidas) ? medidas : []).filter(Boolean);
  const conta = p => lista.filter(p).length;
  const naoLidas = lista.filter(m => !m.lido);
  return {
    total: lista.length,
    criticos: conta(m => m.lido && m.nivel === NIVEL.CRITICO),
    atencao: conta(m => m.lido && m.nivel === NIVEL.ATENCAO),
    naoLidas: naoLidas.length,
    oQueFaltouLer: naoLidas.map(m => m.rotulo),
    podeDizerTudoBem:
      lista.length > 0 &&
      naoLidas.length === 0 &&
      !lista.some(m => m.nivel === NIVEL.CRITICO || m.nivel === NIVEL.ATENCAO),
  };
}
