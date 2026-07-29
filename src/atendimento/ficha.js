// ═══════════════════════════════════════════════════════════
// A FICHA DO ATENDIMENTO — regras de fonte pagadora e classificação
//
// Puro: não sabe o que é React nem banco. Complementa `recepcao.js`, que
// cuida da identificação; aqui é o resto do que o balcão registra.
//
// A REGRA QUE ORGANIZA O ARQUIVO
// Nada aqui bloqueia atendimento por falta de dado administrativo. A
// pessoa está no balcão; carteirinha esquecida em casa, convênio ainda não
// cadastrado no sistema e CBO incompatível são problemas de FATURAMENTO, e
// faturamento se resolve depois — cuidado, não.
//
// O que estas funções fazem é deixar a pendência VISÍVEL e explicar a
// consequência, para alguém resolver antes de fechar a conta. Um sistema
// que trava a recepção porque o analista comercial não terminou de
// cadastrar os convênios para o hospital inteiro.
//
// A distinção que percorre tudo:
//   erros   — o registro nasce quebrado (herdados da fase 1)
//   avisos  — vai faturar errado, ou não vai faturar. Aparece, não impede.
// ═══════════════════════════════════════════════════════════

/** Os domínios da tabela `at_dominios`, na ordem em que aparecem na ficha. */
export const DOMINIOS = [
  { chave: "unidade_origem",    label: "Origem do atendimento",  dica: "Por qual porta do hospital entrou — Pronto-Socorro ou Ambulatório." },
  { chave: "tipo_atendimento",  label: "Tipo de atendimento",    dica: "Primeira consulta, retorno, urgência ou exame." },
  { chave: "carater",           label: "Caráter",                dica: "Eletivo ou urgência. Exigido na AIH." },
  { chave: "especialidade",     label: "Especialidade",          dica: "A especialidade que vai atender." },
  { chave: "tipo_paciente",     label: "Tipo de paciente",       dica: "É o que aponta a tabela de preço no convênio." },
  { chave: "local_procedencia", label: "Local de procedência",   dica: "De onde o paciente veio — domicílio, outra unidade, via pública." },
  { chave: "destino",           label: "Destino",                dica: "Para qual clínica ou setor ele segue agora." },
];

export const DOMINIO_POR_CHAVE = Object.fromEntries(DOMINIOS.map(d => [d.chave, d]));

/**
 * Os três tipos de fonte pagadora e o que cada um implica.
 *
 * `cobraDoPaciente: false` no SUS não é configuração — é regra dura. O
 * atendimento SUS não pode ser cobrado do paciente, e nenhum cadastro
 * deveria conseguir afrouxar isso.
 */
export const TIPOS_CONVENIO = {
  sus: {
    label: "SUS",
    cobraDoPaciente: false,
    temGuiaTiss: false,
    exigeCns: true,
    faturamento: "BPA / APAC / AIH",
  },
  convenio: {
    label: "Convênio",
    cobraDoPaciente: true,       // coparticipação
    temGuiaTiss: true,
    exigeCns: false,
    faturamento: "Guia TISS",
  },
  particular: {
    label: "Particular",
    cobraDoPaciente: true,
    temGuiaTiss: false,
    exigeCns: false,
    faturamento: "Cobrança direta",
  },
};

export const tipoDoConvenio = c => TIPOS_CONVENIO[c?.tipo] || null;

/**
 * O que este convênio exige, já resolvido.
 *
 * Lê do CADASTRO (`exige_carteira`, `exige_autorizacao`) em vez de ter
 * regra por convênio escrita aqui: convênio novo com exigência diferente
 * tem que ser cadastro, não release. O tipo só dá o padrão quando o
 * cadastro não disse nada.
 */
export function exigenciasDoConvenio(convenio) {
  if (!convenio) return { carteira: false, autorizacao: false, cns: false, cobra: false };
  const t = tipoDoConvenio(convenio);
  const ehSus = convenio.tipo === "sus";
  return {
    // SUS não tem carteirinha de convênio, por mais que alguém marque o
    // campo no cadastro por engano.
    carteira: !ehSus && convenio.exige_carteira !== false,
    autorizacao: !ehSus && convenio.exige_autorizacao === true,
    cns: !!t?.exigeCns,
    cobra: !!t?.cobraDoPaciente,
  };
}

/** A carteirinha ainda vale na data do atendimento? `null` se não há data. */
export function carteiraVencida(validade, hoje = new Date()) {
  if (!validade) return null;
  const v = new Date(String(validade).slice(0, 10) + "T23:59:59");
  if (isNaN(v)) return null;
  return v < new Date(hoje);
}

// ── CBO × PROCEDIMENTO ──────────────────────────────────────

/**
 * O CBO deste profissional pode executar este procedimento?
 *
 * Devolve um veredito em vez de booleano porque os três estados são
 * diferentes e a tela reage diferente a cada um:
 *   "ok"          — está na lista
 *   "incompativel"— NÃO está: o BPA será REJEITADO no processamento, não
 *                   glosado depois. A produção some e alguém procura no
 *                   fim do mês.
 *   "sem_lista"   — o procedimento não tem CBOs cadastrados ainda. Não há
 *                   o que conferir; não é erro do atendimento.
 *   "sem_cbo"     — o profissional não tem CBO no cadastro.
 */
export function conferirCbo(procedimento, cbo) {
  const lista = Array.isArray(procedimento?.cbos_compativeis) ? procedimento.cbos_compativeis : [];
  const meu = String(cbo ?? "").replace(/\D/g, "");
  if (!procedimento) return { estado: "sem_lista" };
  if (!lista.length) return { estado: "sem_lista" };
  if (!meu) return { estado: "sem_cbo" };
  const bate = lista.some(c => String(c).replace(/\D/g, "") === meu);
  return { estado: bate ? "ok" : "incompativel", exigidos: lista };
}

// ── VALIDAÇÃO DA FICHA ──────────────────────────────────────

const aviso = (chave, texto, gravidade = "media") => ({ chave, texto, gravidade });

/**
 * Confere a parte administrativa da ficha.
 *
 * NÃO devolve erros — só avisos. Os erros que impedem a abertura continuam
 * em `validarAbertura` (recepcao.js): paciente, tipo e origem. Aqui tudo é
 * consequência de faturamento, e faturamento não pode segurar paciente na
 * porta.
 *
 * `catalogos` traz o que existe cadastrado, para a função distinguir "o
 * usuário não preencheu" de "não há o que preencher".
 */
export function conferirFicha({
  paciente, convenio, plano, ficha = {}, procedimento, medico, catalogos = {}, hoje = new Date(),
} = {}) {
  const avisos = [];

  // ── fonte pagadora ──
  if (!convenio) {
    const temConvenioCadastrado = (catalogos.convenios || []).length > 0;
    avisos.push(aviso("sem_convenio",
      temConvenioCadastrado
        ? "Sem convênio informado. O atendimento não vai gerar conta — ninguém sabe quem paga."
        : "Nenhum convênio cadastrado no sistema ainda. Enquanto o analista comercial não cadastrar, os atendimentos ficam sem fonte pagadora e não faturam.",
      "alta"));
  } else {
    const ex = exigenciasDoConvenio(convenio);

    if (ex.carteira && !String(ficha.carteira ?? "").trim()) {
      avisos.push(aviso("sem_carteira",
        `${convenio.nome} exige o número da carteira. Sem ele a guia não é aceita pela operadora.`, "alta"));
    }
    const vencida = carteiraVencida(ficha.carteira_validade, hoje);
    if (vencida) {
      avisos.push(aviso("carteira_vencida",
        "A carteira está vencida na data de hoje. Carteirinha fora da validade é glosa certa — confirme com o paciente.", "alta"));
    }
    if (ex.autorizacao && !String(ficha.autorizacao_senha ?? "").trim()) {
      avisos.push(aviso("sem_autorizacao",
        `${convenio.nome} exige autorização prévia. Sem a senha, o procedimento não é pago.`, "alta"));
    }
    if (ex.cns && !String(paciente?.cns ?? "").trim()) {
      avisos.push(aviso("sem_cns",
        "Atendimento pelo SUS sem Cartão Nacional de Saúde no cadastro. Sem CNS o atendimento não fecha no faturamento SUS.", "alta"));
    }
    // Convênio exigindo plano: plano é o que define acomodação e tabela de
    // preço; o convênio sozinho não fecha o valor.
    if (convenio.tipo === "convenio" && !plano) {
      const temPlano = (catalogos.planos || []).some(p => p.convenio_id === convenio.id);
      if (temPlano) avisos.push(aviso("sem_plano",
        "Convênio informado sem plano. É o plano que define acomodação e tabela de preço.", "media"));
    }
  }

  // ── classificação ──
  for (const d of DOMINIOS) {
    const preenchido = String(ficha[`${d.chave}_cod`] ?? "").trim();
    if (preenchido) continue;
    const disponivel = (catalogos[d.chave] || []).length > 0;
    // Catálogo vazio não é pendência do atendimento — é pendência de
    // cadastro, e cobrar da recepcionista o que ela não pode resolver só
    // ensina a ignorar aviso.
    if (disponivel) {
      avisos.push(aviso(`sem_${d.chave}`, `${d.label} não informado.`, "baixa"));
    }
  }

  // ── CBO × procedimento ──
  if (procedimento) {
    const v = conferirCbo(procedimento, medico?.cbo);
    if (v.estado === "incompativel") {
      avisos.push(aviso("cbo_incompativel",
        `O CBO de ${medico?.nome || "quem vai atender"} não está entre os aceitos por "${procedimento.nome}". ` +
        "Isso não vira glosa — vira REJEIÇÃO no processamento, e a produção não entra. " +
        `Aceitos: ${v.exigidos.join(", ")}.`, "alta"));
    } else if (v.estado === "sem_cbo" && medico) {
      avisos.push(aviso("medico_sem_cbo",
        `${medico.nome || "O profissional"} não tem CBO no cadastro. Sem CBO a produção SUS não é processada.`, "media"));
    }
  }

  const alta = avisos.filter(a => a.gravidade === "alta");
  return {
    avisos,
    // "Pronta para faturar" é diferente de "pode atender". A ficha pode
    // seguir com pendência; a conta é que não fecha.
    faturavel: alta.length === 0 && !!convenio,
    pendenciasGraves: alta.length,
  };
}

/**
 * O corpo a gravar, só com o que foi preenchido.
 *
 * Campo em branco vira `null` e não string vazia: com "" no banco, "não
 * informado" deixa de ser distinguível de "informado em branco", e o
 * relatório de pendências passa a mentir.
 */
export function camposDaFicha(ficha = {}) {
  const texto = v => {
    const s = typeof v === "string" ? v.trim() : v;
    return s === "" || s === undefined ? null : s;
  };
  return {
    convenio_id: ficha.convenio_id || null,
    plano_id: ficha.plano_id || null,
    carteira: texto(ficha.carteira),
    carteira_validade: texto(ficha.carteira_validade),
    guia_numero: texto(ficha.guia_numero),
    autorizacao_senha: texto(ficha.autorizacao_senha),
    tipo_atendimento_cod: texto(ficha.tipo_atendimento_cod),
    tipo_paciente_cod: texto(ficha.tipo_paciente_cod),
    especialidade_cod: texto(ficha.especialidade_cod),
    carater_cod: texto(ficha.carater_cod),
    unidade_origem_cod: texto(ficha.unidade_origem_cod),
    local_procedencia_cod: texto(ficha.local_procedencia_cod),
    destino_cod: texto(ficha.destino_cod),
    procedimento_cod: texto(ficha.procedimento_cod),
    cid: texto(ficha.cid),
    acidente_trabalho: ficha.acidente_trabalho === true,
  };
}
