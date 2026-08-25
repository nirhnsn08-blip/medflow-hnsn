// ═══════════════════════════════════════════════════════════
// IDENTIFICAÇÃO DO PACIENTE — regras puras
//
// POR QUE ESTE MÓDULO EXISTE
// O cadastro do paciente tinha quatro campos: prontuário, iniciais, ano de
// nascimento e sexo. Isso foi uma decisão consciente de minimizar dado —
// mas deixa o sistema em duas dívidas, uma legal e uma CLÍNICA:
//
//   1. LEGAL — a CFM 1.638/2002, art. 5º, I, "a", lista o conteúdo mínimo
//      de identificação de um prontuário: nome completo, data de nascimento
//      com dia/mês/ano, sexo, NOME DA MÃE, NATURALIDADE (município e
//      estado) e endereço completo. Sem isso não é prontuário; é anotação.
//      A CFM 2.299/2021, art. 2º, acrescenta o documento legal do paciente
//      nos documentos emitidos (receita, atestado, laudo).
//
//   2. CLÍNICA — e esta é a que machuca antes. Guardar só o ANO de
//      nascimento obriga a calcular idade por subtração de anos, e o erro
//      chega a 11 meses. Em pediatria isso troca a faixa de referência: um
//      bebê de 1 mês nascido em dezembro vira "1 ano" em janeiro, e os
//      sinais vitais dele passam a ser avaliados contra a faixa de 12
//      meses, que é outra fisiologia. `src/clinico/pediatria.js` pede
//      `idadeMeses` justamente porque essa precisão importa.
//
// SOBRE A LGPD — o que muda e o que não muda
// Passar a guardar nome, CPF e filiação NÃO viola a LGPD: a base legal do
// dado assistencial é a TUTELA DA SAÚDE (art. 11, II, "f"), e a
// minimização (art. 6º, III) é "o mínimo necessário para a finalidade" —
// aqui a finalidade é identificação exigida por norma. Deixar de coletar é
// que descumpre a CFM 1.638.
//
// O que muda de verdade é a EXPOSIÇÃO: enquanto a política de SELECT do
// banco for aberta a qualquer autenticado, o que vazava era "J.S.M., 1957"
// e passa a ser nome completo, CPF, nome da mãe e endereço. A decisão de
// apertar o RLS deixa de ser arquitetura e vira urgência. Por isso as
// funções daqui preferem devolver INICIAIS para a tela (`comoExibir`) —
// nome completo só onde a tarefa exige.
//
// Tudo aqui é puro: sem React, sem rede, sem relógio próprio (as que
// dependem de "hoje" recebem a data por parâmetro). Testado em
// identidade.test.js.
// ═══════════════════════════════════════════════════════════

// ── DOCUMENTOS ──────────────────────────────────────────────

/** Só os dígitos — o usuário digita com ponto, traço ou espaço. */
export const limparDoc = v => String(v ?? "").replace(/\D/g, "");

/**
 * CPF válido? Confere os dois dígitos verificadores.
 *
 * Não é preciosismo: CPF errado é a origem nº 1 de prontuário duplicado
 * (o mesmo paciente entra duas vezes) e de glosa no faturamento. Barrar na
 * digitação custa um alerta; corrigir depois custa fundir dois prontuários
 * clínicos, que é operação de risco.
 */
export function validarCPF(valor) {
  const cpf = limparDoc(valor);
  if (cpf.length !== 11) return false;
  // 111.111.111-11 e afins passam na conta dos dígitos, mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base, pesoInicial) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(cpf.slice(0, 9), 10) === Number(cpf[9])
      && dv(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

/** CPF como se lê: 000.000.000-00. Devolve o que veio se não der 11 dígitos. */
export function formatarCPF(valor) {
  const c = limparDoc(valor);
  if (c.length !== 11) return String(valor ?? "");
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/**
 * CNS (Cartão Nacional de Saúde) válido?
 *
 * 15 dígitos, soma ponderada (peso 15 → 1) divisível por 11. O primeiro
 * dígito diz a natureza: 1 e 2 são definitivos (vinculados ao CPF); 7, 8 e
 * 9 são provisórios. Importa porque é o que identifica o paciente no SUS —
 * sem CNS válido, a AIH não fecha.
 */
export function validarCNS(valor) {
  const cns = limparDoc(valor);
  if (cns.length !== 15) return false;
  if (!"12789".includes(cns[0])) return false;
  if (/^(\d)\1{14}$/.test(cns)) return false;
  let soma = 0;
  for (let i = 0; i < 15; i++) soma += Number(cns[i]) * (15 - i);
  return soma % 11 === 0;
}

/** CNS como se lê: 000 0000 0000 0000. */
export function formatarCNS(valor) {
  const c = limparDoc(valor);
  if (c.length !== 15) return String(valor ?? "");
  return `${c.slice(0, 3)} ${c.slice(3, 7)} ${c.slice(7, 11)} ${c.slice(11)}`;
}

/**
 * Telefone como se lê: "(51) 99999-0000" ou "(51) 3664-1234".
 *
 * Guardado só com dígitos, pelo mesmo motivo do CPF: a busca normaliza, e
 * "(51) 3664-1234" gravado com pontuação não é achado por quem digita o
 * mesmo número. Formatar é trabalho da EXIBIÇÃO.
 *
 * O que não tem 10 ou 11 dígitos volta como veio — não se inventa formato
 * para número que não se reconhece.
 */
export function formatarTelefone(valor) {
  const d = limparDoc(valor);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(valor ?? "");
}

/** Provisório (7/8/9) ou definitivo (1/2)? `null` quando inválido. */
export function tipoCNS(valor) {
  if (!validarCNS(valor)) return null;
  return "12".includes(limparDoc(valor)[0]) ? "definitivo" : "provisorio";
}

// ── NOME ────────────────────────────────────────────────────

/** Sem acento, minúsculo, espaços colapsados — só para COMPARAR. */
export const normalizarNome = n =>
  String(n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

// Partículas não identificam ninguém — "de", "da", "dos" não entram na
// comparação nem viram inicial.
const PARTICULAS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Os pedaços do nome que de fato identificam. */
export function partesDoNome(nome) {
  return normalizarNome(nome).split(" ").filter(p => p && !PARTICULAS.has(p));
}

/**
 * Iniciais a partir do nome completo: "José da Silva Matos" → "J.S.M."
 *
 * Existe para a tela continuar mostrando iniciais por padrão mesmo agora
 * que o nome completo está no banco — exibir o mínimo é a prática que
 * protege o paciente quando alguém passa atrás da recepcionista.
 */
export function iniciaisDe(nome) {
  const partes = partesDoNome(nome);
  if (!partes.length) return "";
  return partes.map(p => p[0].toUpperCase()).join(".") + ".";
}

/**
 * Como o paciente deve aparecer na tela.
 *
 * Prefere o NOME SOCIAL quando existe — é direito garantido no SUS
 * (Decreto 8.727/2016; Portaria MS 2.836/2011), e chamar a pessoa pelo
 * nome de registro contra a vontade dela é constrangimento, não detalhe.
 * `completo: false` (padrão) devolve iniciais.
 */
export function comoExibir(paciente, { completo = false } = {}) {
  if (!paciente) return "";
  const social = String(paciente.nome_social ?? "").trim();
  const nome = String(paciente.nome_completo ?? "").trim();
  const preferido = social || nome;
  if (completo && preferido) return preferido;
  if (preferido) return iniciaisDe(preferido);
  return String(paciente.iniciais ?? "").trim();
}

// ── SEXO ────────────────────────────────────────────────────

/**
 * Normaliza o sexo para "M" | "F" | "" .
 *
 * O sistema acumulou DUAS convenções: o formulário antigo gravava
 * "masculino"/"feminino" e os dados carregados usam "M"/"F". Comparar sem
 * normalizar faz `sexo === "F"` falhar silenciosamente em metade da base —
 * e é esse tipo de comparação que decide se um alerta obstétrico aparece.
 * Aqui as duas entram e sai uma só.
 */
export function normalizarSexo(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (s.startsWith("m")) return "M";
  if (s.startsWith("f")) return "F";
  return "";
}

/** Rótulo por extenso, aceitando qualquer das convenções. */
export const rotuloSexo = v =>
  ({ M: "Masculino", F: "Feminino" }[normalizarSexo(v)] || "—");

// ── IDADE ───────────────────────────────────────────────────

/**
 * Idade exata a partir da data de nascimento.
 *
 * Devolve { anos, meses, dias, totalMeses, rotulo } — `totalMeses` é o que
 * a triagem pediátrica consome. `null` se a data faltar, for inválida ou
 * estiver no futuro (digitação trocada não pode virar idade negativa).
 *
 * `hoje` é injetável para teste.
 */
export function idadeDetalhada(nascimento, hoje = new Date()) {
  if (!nascimento) return null;
  const n = typeof nascimento === "string"
    ? new Date(nascimento.slice(0, 10) + "T00:00:00")
    : new Date(nascimento);
  if (isNaN(n)) return null;
  const h = new Date(hoje); h.setHours(0, 0, 0, 0);
  n.setHours(0, 0, 0, 0);
  if (n > h) return null;

  let anos = h.getFullYear() - n.getFullYear();
  let meses = h.getMonth() - n.getMonth();
  let dias = h.getDate() - n.getDate();
  if (dias < 0) {
    meses -= 1;
    // dias do mês anterior ao de referência
    dias += new Date(h.getFullYear(), h.getMonth(), 0).getDate();
  }
  if (meses < 0) { anos -= 1; meses += 12; }

  const totalMeses = anos * 12 + meses;
  // Como o profissional fala a idade: recém-nascido em dias, lactente em
  // meses, o resto em anos. "0 anos" não é resposta útil na pediatria.
  const rotulo = totalMeses < 1 ? `${dias} dia${dias === 1 ? "" : "s"}`
    : totalMeses < 24 ? `${totalMeses} ${totalMeses === 1 ? "mês" : "meses"}`
    : `${anos} anos`;

  return { anos, meses, dias, totalMeses, rotulo };
}

/**
 * Idade em meses para a triagem pediátrica — a partir da data exata quando
 * existe; senão, do ano de nascimento (cadastro antigo), e AÍ o valor é
 * aproximado. `exata: false` é o sinal para a tela pedir confirmação em vez
 * de sugerir faixa com base em chute.
 */
export function idadeMesesParaTriagem(paciente, hoje = new Date()) {
  const det = idadeDetalhada(paciente?.data_nascimento, hoje);
  if (det) return { meses: det.totalMeses, exata: true, rotulo: det.rotulo };
  const ano = Number(paciente?.ano_nascimento);
  if (!ano || Number.isNaN(ano)) return { meses: null, exata: false, rotulo: null };
  const anos = new Date(hoje).getFullYear() - ano;
  if (anos < 0) return { meses: null, exata: false, rotulo: null };
  return { meses: anos * 12, exata: false, rotulo: `~${anos} anos` };
}

// ── NACIONALIDADE E ETNIA ───────────────────────────────────

/** Campo sem valor: nulo, ausente ou só espaço. */
const semValor = v => v == null || String(v).trim() === "";


/**
 * As três nacionalidades que o cadastro distingue — e por que são três.
 *
 * Não é purismo de tabela: cada uma muda o que o cadastro pode exigir.
 *
 *   brasileira   — nasceu no Brasil. Tem município e UF de nascimento.
 *   naturalizada — nasceu fora, é brasileira hoje. TEM CPF, não tem
 *                  município/UF brasileiros de nascimento.
 *   estrangeira  — nasceu fora e não é brasileira. Pode não ter CPF
 *                  nenhum; o documento legal dela é o passaporte.
 *
 * Um booleano "é estrangeiro" juntaria as duas últimas e voltaria a cobrar
 * CPF de quem não tem, ou a deixar de cobrar de quem tem.
 *
 * Os códigos são os do CADSUS (1 brasileiro, 2 naturalizado, 3 estrangeiro)
 * e ficam aqui para quando a exportação for escrita — a tela nunca os mostra.
 */
export const NACIONALIDADES = [
  { chave: "brasileira",   label: "Brasileira",   codigoCadsus: "1" },
  { chave: "naturalizada", label: "Naturalizada", codigoCadsus: "2" },
  { chave: "estrangeira",  label: "Estrangeira",  codigoCadsus: "3" },
];

/**
 * Nacionalidade em uma das três chaves, saindo do que houver na coluna.
 *
 * O campo nasceu como TEXTO LIVRE com "Brasileira" de padrão, então a base
 * tem o valor escrito por extenso, tem vazio, e tem quem digitou o país
 * ("Uruguaia"). Comparar com `=== "estrangeira"` acharia zero linhas.
 *
 * Vazio é BRASILEIRA de propósito: era o valor que o formulário gravava
 * sozinho, e tratar cadastro antigo como estrangeiro faria a tela cobrar
 * país de nascimento de um acervo inteiro que nasceu aqui.
 *
 * O que não é reconhecido e não está vazio é ESTRANGEIRA — nacionalidade
 * que não é a brasileira é, por definição, de fora. O texto original não se
 * perde: a migração copia esse valor para `pais_nascimento`.
 */
export function normalizarNacionalidade(valor) {
  const v = normalizarNome(valor);
  if (!v) return "brasileira";
  if (v.startsWith("brasil")) return "brasileira";
  if (v.startsWith("naturaliz")) return "naturalizada";
  if (v.startsWith("estrangeir")) return "estrangeira";
  return "estrangeira";
}

export function rotuloNacionalidade(valor) {
  const c = normalizarNacionalidade(valor);
  return NACIONALIDADES.find(n => n.chave === c)?.label ?? "—";
}

/** Nasceu em município brasileiro? Só a nacionalidade brasileira nasce. */
export function nascidoNoBrasil(paciente) {
  return normalizarNacionalidade(paciente?.nacionalidade) === "brasileira";
}

/** Raça/cor autodeclarada como indígena — com ou sem acento na coluna. */
export function autodeclaradoIndigena(paciente) {
  return normalizarNome(paciente?.raca_cor) === "indigena";
}

/**
 * 🔴 CAMPO QUE DEIXOU DE VALER NÃO FICA GRAVADO COM O VALOR ANTIGO.
 *
 * A ficha esconde o que não se aplica — país de nascimento some quando a
 * nacionalidade volta a ser brasileira, etnia some quando a raça/cor deixa
 * de ser indígena. O ESTADO DO FORMULÁRIO não some junto, e o salvamento
 * manda tudo: o cadastro ficava com um brasileiro nascido no Uruguai, ou
 * com uma pessoa parda carregando etnia Charrua.
 *
 * Achei percorrendo a tela: marquei estrangeira, corrigi para brasileira, e
 * o país continuou no banco — invisível, porque o campo que o mostrava não
 * é mais desenhado. Dado que ninguém vê e ninguém consegue apagar é o pior
 * tipo: some da tela e continua indo para o arquivo de produção. A etnia é
 * a que machuca — o BPA leria etnia de quem não se declarou indígena.
 *
 * Devolve um objeto NOVO. Não altera o que recebe: o formulário continua
 * mostrando o que a pessoa digitou até ela salvar.
 */
export function limparCamposInaplicaveis(cadastro) {
  const c = { ...(cadastro || {}) };
  // Nasceu no Brasil: não há país de nascimento, e o passaporte não tem
  // campo na tela — guardar um que ninguém consegue enxergar nem corrigir
  // é guardar lixo com aparência de dado.
  if (nascidoNoBrasil(c)) {
    c.pais_nascimento = null;
    c.passaporte = null;
  }
  if (!autodeclaradoIndigena(c)) c.etnia_indigena = null;
  return c;
}

// ── CONFERÊNCIA DO CADASTRO ─────────────────────────────────

/**
 * O que falta para este cadastro atender à norma.
 *
 * NUNCA bloqueia. Emergência entra com o que dá (CFM 1.638, art. 5º, I,
 * "e", prevê o atendimento sem anamnese possível) — travar o cadastro de um
 * politraumatizado para exigir o nome da mãe seria inverter a prioridade.
 * O papel desta função é deixar a pendência VISÍVEL para alguém completar
 * depois, não impedir o cuidado agora.
 *
 * Níveis:
 *   essencial  — CFM 1.638/2002, art. 5º, I, "a" (conteúdo mínimo)
 *   documento  — CFM 2.299/2021, art. 2º (documentos emitidos)
 *   sus        — faturamento SUS / RNDS
 *   contato    — operacional (não é exigência normativa)
 */
const REGRAS_CADASTRO = [
  { campo: "nome_completo",  nivel: "essencial", label: "Nome completo",
    norma: "CFM 1.638/2002, art. 5º" },
  { campo: "data_nascimento", nivel: "essencial", label: "Data de nascimento (dia, mês e ano)",
    norma: "CFM 1.638/2002, art. 5º",
    porque: "Sem o dia e o mês, a idade sai por subtração de anos e erra até 11 meses — o que troca a faixa de referência na pediatria." },
  { campo: "sexo",           nivel: "essencial", label: "Sexo", norma: "CFM 1.638/2002, art. 5º",
    valida: v => normalizarSexo(v) !== "" },
  { campo: "nome_mae",       nivel: "essencial", label: "Nome da mãe",
    norma: "CFM 1.638/2002, art. 5º",
    porque: "É o campo que mais desempata homônimo — e o mais esquecido." },
  // 🔴 NATURALIDADE SÓ EXISTE PARA QUEM NASCEU AQUI.
  //
  // Município e UF de nascimento eram essenciais para todo mundo. Quem
  // nasceu no Uruguai não tem nem um nem outro, e o cadastro NUNCA chegava
  // a "completo": ficava para sempre com duas pendências impossíveis de
  // resolver. Pendência que não tem como ser resolvida é pior que nenhuma
  // — ensina a recepção a ignorar o aviso, e aí o aviso que importa some
  // junto.
  //
  // A norma pede a naturalidade; para quem nasceu fora, a naturalidade É o
  // país. Um substitui o outro, e a conta de "quanto falta" acompanha.
  { campo: "naturalidade_municipio", nivel: "essencial", label: "Naturalidade (município)",
    norma: "CFM 1.638/2002, art. 5º", soSe: nascidoNoBrasil },
  { campo: "naturalidade_uf", nivel: "essencial", label: "Naturalidade (estado)",
    norma: "CFM 1.638/2002, art. 5º", soSe: nascidoNoBrasil },
  { campo: "pais_nascimento", nivel: "essencial", label: "País de nascimento",
    norma: "CFM 1.638/2002, art. 5º", soSe: p => !nascidoNoBrasil(p),
    porque: "Para quem nasceu fora, é o país que ocupa o lugar da naturalidade." },
  { campo: "end_logradouro", nivel: "essencial", label: "Endereço", norma: "CFM 1.638/2002, art. 5º" },
  { campo: "end_municipio",  nivel: "essencial", label: "Município de residência", norma: "CFM 1.638/2002, art. 5º" },
  // CPF continua sendo cobrado de brasileiro e de naturalizado — os dois
  // têm. Do estrangeiro, não: turista e recém-chegado podem não ter CPF
  // nenhum, e é o PASSAPORTE que faz o papel de documento legal. Quem já
  // tirou CPF no Brasil também resolve a pendência com ele; a exigência é
  // ter UM documento, não ter aquele documento.
  { campo: "cpf",            nivel: "documento", label: "CPF",
    norma: "CFM 2.299/2021, art. 2º",
    soSe: p => normalizarNacionalidade(p?.nacionalidade) !== "estrangeira",
    porque: "Documento legal do paciente é exigido nos documentos emitidos (receita, atestado, laudo)." },
  { campo: "passaporte",     nivel: "documento", label: "Passaporte (ou CPF)",
    norma: "CFM 2.299/2021, art. 2º",
    soSe: p => normalizarNacionalidade(p?.nacionalidade) === "estrangeira",
    faltaSe: p => semValor(p?.passaporte) && semValor(p?.cpf),
    porque: "O documento legal do paciente estrangeiro. Sem ele, receita e atestado saem sem identificação válida." },
  { campo: "cns",            nivel: "sus",       label: "Cartão SUS (CNS)",
    porque: "Sem CNS o atendimento não fecha no faturamento SUS." },
  // 🔴 RAÇA/COR INDÍGENA SEM ETNIA DERRUBA O ARQUIVO DE PRODUÇÃO.
  //
  // "Indígena" já era uma opção do campo raça/cor, e parava aí. Nos
  // sistemas de informação do SUS a etnia é obrigatória JUNTO — a raça/cor
  // indígena sozinha não é aceita, e o BPA volta rejeitado. O cadastro
  // ficava plausível na tela e quebrava no fechamento do mês, longe de
  // quem digitou.
  //
  // Nível "sus" e não "essencial": é exigência de faturamento, não da CFM
  // 1.638. Não trava atendimento nenhum — aparece para ser completado.
  { campo: "etnia_indigena", nivel: "sus",       label: "Etnia indígena",
    soSe: autodeclaradoIndigena,
    porque: "Raça/cor indígena sem etnia é rejeitada nos sistemas de informação do SUS — o BPA volta." },
  { campo: "telefone",       nivel: "contato",   label: "Telefone",
    porque: "Sem contato não há como avisar resultado nem confirmar retorno." },
];

export function conferirCadastro(paciente) {
  const p = paciente || {};
  const vazio = c => semValor(p[c]);
  // `soSe` é o que torna a regra CONDICIONAL: naturalidade só vale para
  // quem nasceu no Brasil, etnia só para quem se declarou indígena. Regra
  // que não se aplica não é pendência — não some da lista por estar
  // resolvida, some por nunca ter sido cobrada desta pessoa.
  const vale = r => !r.soSe || r.soSe(p);
  // `valida` cobre o campo que existe mas está com valor que o sistema não
  // reconhece — preenchido com lixo é tão inútil quanto vazio, e engana mais.
  // `faltaSe` é para a exigência que olha MAIS DE UM campo (passaporte ou
  // CPF), que a checagem de um campo só não consegue exprimir.
  const falta = r => vale(r) && (r.faltaSe
    ? r.faltaSe(p)
    : (vazio(r.campo) || (r.valida && !r.valida(p[r.campo]))));
  const pendencias = REGRAS_CADASTRO.filter(falta).map(r => ({ ...r }));

  // Documento inválido é pior que documento ausente: ausente todo mundo vê,
  // inválido passa por preenchido e só aparece na hora da glosa.
  if (!vazio("cpf") && !validarCPF(p.cpf))
    pendencias.push({ campo: "cpf", nivel: "documento", label: "CPF inválido",
      porque: "Os dígitos verificadores não conferem. CPF errado gera prontuário duplicado e glosa." });
  if (!vazio("cns") && !validarCNS(p.cns))
    pendencias.push({ campo: "cns", nivel: "sus", label: "Cartão SUS inválido",
      porque: "Os dígitos verificadores não conferem." });

  // O denominador conta só as regras QUE VALEM para esta pessoa. Somar as
  // que nunca serão cobradas faria o cadastro de um estrangeiro completo
  // parar em 78% para sempre — número errado que ninguém consegue subir.
  const essenciais = REGRAS_CADASTRO.filter(r => r.nivel === "essencial" && vale(r));
  const faltamEssenciais = pendencias.filter(x => x.nivel === "essencial").length;
  return {
    pendencias,
    faltamEssenciais,
    // "Completo" é sobre a norma de identificação, não sobre a ficha inteira.
    completo: faltamEssenciais === 0,
    percentual: Math.round(((essenciais.length - faltamEssenciais) / essenciais.length) * 100),
  };
}

// ── DUPLICIDADE ─────────────────────────────────────────────

/**
 * Este paciente já está cadastrado com outro prontuário?
 *
 * Prontuário duplicado é o defeito mais caro de sistema hospitalar: parte
 * do histórico fica num registro e parte no outro, e o médico decide vendo
 * metade. Fundir depois é operação de risco. Por isso a checagem acontece
 * ANTES de gravar.
 *
 * A comparação é explicável de propósito — nada de distância de edição que
 * ninguém sabe justificar. Cada achado diz POR QUE casou, para a pessoa
 * decidir. O sistema sugere; quem confirma é quem está cadastrando.
 */
export function possiveisDuplicatas(novo, existentes = [], { limite = 5 } = {}) {
  if (!novo) return [];
  const lista = Array.isArray(existentes) ? existentes : [];
  const cpfNovo = limparDoc(novo.cpf);
  const cnsNovo = limparDoc(novo.cns);
  const nomeNovo = partesDoNome(novo.nome_completo);
  const maeNova = normalizarNome(novo.nome_mae);
  const nascNovo = String(novo.data_nascimento ?? "").slice(0, 10);

  const achados = [];
  for (const e of lista) {
    // O próprio registro não é duplicata de si mesmo.
    if (e?.prontuario && novo.prontuario && String(e.prontuario) === String(novo.prontuario)) continue;

    const motivos = [];
    let confianca = 0;

    if (cpfNovo && cpfNovo.length === 11 && limparDoc(e.cpf) === cpfNovo) {
      motivos.push("mesmo CPF"); confianca = 100;
    }
    if (cnsNovo && cnsNovo.length === 15 && limparDoc(e.cns) === cnsNovo) {
      motivos.push("mesmo Cartão SUS"); confianca = Math.max(confianca, 100);
    }

    const nomeExist = partesDoNome(e.nome_completo);
    const nomeIgual = nomeNovo.length > 0 && nomeNovo.join(" ") === nomeExist.join(" ");
    const nascIgual = nascNovo && String(e.data_nascimento ?? "").slice(0, 10) === nascNovo;
    const maeIgual = maeNova && normalizarNome(e.nome_mae) === maeNova;

    if (nomeIgual && nascIgual) { motivos.push("mesmo nome e mesma data de nascimento"); confianca = Math.max(confianca, 90); }
    else if (nomeIgual && maeIgual) { motivos.push("mesmo nome e mesma mãe"); confianca = Math.max(confianca, 90); }
    else if (nomeIgual) { motivos.push("mesmo nome completo"); confianca = Math.max(confianca, 60); }
    else if (nomeNovo.length >= 2 && nomeExist.length >= 2) {
      // Homônimo parcial: primeiro e último nome batem (grafia do meio varia
      // muito — "Maria de Souza" e "Maria Souza" são a mesma pessoa).
      const mesmaPonta = nomeNovo[0] === nomeExist[0]
        && nomeNovo[nomeNovo.length - 1] === nomeExist[nomeExist.length - 1];
      if (mesmaPonta && nascIgual) { motivos.push("primeiro e último nome iguais, mesma data de nascimento"); confianca = Math.max(confianca, 70); }
      else if (mesmaPonta && maeIgual) { motivos.push("primeiro e último nome iguais, mesma mãe"); confianca = Math.max(confianca, 70); }
    }

    if (motivos.length) achados.push({ paciente: e, prontuario: e.prontuario, motivos, confianca });
  }

  return achados.sort((a, b) => b.confianca - a.confianca).slice(0, limite);
}

/**
 * Este CPF/CNS já é de OUTRO prontuário?
 *
 * POR QUE ISTO EXISTE, E POR QUE A MENSAGEM IMPORTA TANTO
 * `pacientes` tem índice único parcial em CPF e em CNS. Quando a
 * recepcionista insiste e cadastra a segunda ficha da mesma pessoa, o
 * PostgREST devolve **409** — e a tela dizia:
 *
 *   "⚠️ Nada foi gravado. Confirme que a migração ... foi aplicada neste
 *    banco e que seu perfil permite cadastrar."
 *
 * Ou seja: culpava a migração e a permissão por um erro que era de DADO. E o
 * que uma pessoa com fila na frente faz diante disso não é abrir um chamado
 * — é **apagar o CPF e salvar de novo**. Aí o cadastro passa, sem documento,
 * invisível ao índice único. A trava que existia para impedir a duplicata
 * produzia exatamente a duplicata, e ainda por cima uma sem CPF, que nenhuma
 * conferência futura consegue casar.
 *
 * Detectar ANTES de gravar transforma um erro sem saída numa instrução: o
 * prontuário que já tem esse documento tem nome e número, e o caminho certo
 * é abrir aquele, não criar outro.
 *
 * Compara com `limparDoc` dos dois lados porque "529.982.247-25" e
 * "52998224725" são o mesmo CPF, e só um dos dois formatos casaria com `===`.
 */
export function documentoEmUso(novo, candidatos = []) {
  // Desestruturar no parâmetro quebraria com `null`: o default `= {}` só
  // vale para `undefined`. `possiveisDuplicatas` logo acima aceita nulo sem
  // reclamar, e duas funções vizinhas discordando sobre isso é o tipo de
  // diferença que só aparece na tela, em produção.
  const { cpf, cns, prontuario } = novo || {};
  const meuCpf = limparDoc(cpf);
  const meuCns = limparDoc(cns);
  const meu = String(prontuario ?? "").trim();
  if (!meuCpf && !meuCns) return null;

  for (const c of Array.isArray(candidatos) ? candidatos : []) {
    // O próprio cadastro, em edição, não conflita consigo mesmo.
    if (String(c?.prontuario ?? "").trim() === meu) continue;
    if (meuCpf && limparDoc(c?.cpf) === meuCpf)
      return { prontuario: c.prontuario, campo: "CPF", paciente: c };
    if (meuCns && limparDoc(c?.cns) === meuCns)
      return { prontuario: c.prontuario, campo: "Cartão SUS", paciente: c };
  }
  return null;
}

/**
 * O que a tela diz quando o documento já é de outro prontuário.
 *
 * Diz o NÚMERO do prontuário e o nome, porque a ação certa depende de saber
 * qual é. E fecha a porta que a mensagem antiga abria, em voz alta: apagar o
 * documento faz salvar, e é a pior saída possível.
 */
export function mensagemDocumentoEmUso(conflito) {
  if (!conflito) return "";
  const nome = comoExibir(conflito.paciente, { completo: true })
    || String(conflito.paciente?.iniciais ?? "").trim();
  return `Este ${conflito.campo} já está no prontuário ${conflito.prontuario}` +
    (nome ? ` (${nome})` : "") + ". " +
    "É a mesma pessoa — abra o cadastro dele em vez de criar outro. " +
    "Não apague o documento para conseguir salvar: isso cria um segundo prontuário " +
    "sem documento, que ninguém mais consegue casar com o primeiro.";
}

// ── ÓBITO ───────────────────────────────────────────────────

/**
 * 🔴 O CARIMBO DE ÓBITO É DERIVADO, E ISSO MUDA O QUE A TELA PODE DIZER.
 *
 * `pacientes.obito` não é digitado por ninguém: dois triggers o carimbam a
 * partir de um fato já gravado — o desfecho do Pronto-Socorro e a saída de
 * leito. Antes disso a coluna era lida em cinco lugares e escrita em
 * nenhum, então a Agenda "recusava" marcar consulta para falecido sem nunca
 * recusar nada, e a confirmação da véspera ligava para a família.
 *
 * A CONSEQUÊNCIA PARA A TELA: mandar "corrija o cadastro" é mandar fazer
 * uma coisa que não resolve — quem apagar o carimbo sem corrigir a FONTE vê
 * o carimbo voltar no próximo toque no episódio. Por isso a mensagem carrega
 * `obito_origem`: sem dizer de onde veio, o aviso vira um beco.
 */
export function origemDoObito(paciente) {
  if (!paciente?.obito) return null;
  const origem = String(paciente.obito_origem ?? "").trim();
  const quando = dataBRCurta(paciente.obito_em);
  return {
    origem: origem || "origem não registrada",
    quando: quando || "",
    // Cadastro carimbado antes desta migração, ou por caminho que não
    // gravou origem. Dizer "não registrada" é melhor que inventar de onde
    // veio — e é o que faz alguém ir conferir.
    rastreavel: !!origem,
  };
}

/** '2026-08-25' → '25/08/2026'. Sem `new Date` na string crua (fuso). */
function dataBRCurta(iso) {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const [a, m, d] = s.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * O texto do óbito, um só para as três telas.
 *
 * Havia dois textos diferentes escritos à mão — a Recepção dizia uma coisa,
 * a Agenda outra — e nenhum dos dois dizia de onde o óbito veio. Texto de
 * regra clínica repetido em tela diverge no primeiro ajuste.
 *
 * `null` quando não há óbito, para a tela não desenhar faixa vazia.
 */
export function avisoDeObito(paciente) {
  const o = origemDoObito(paciente);
  if (!o) return null;
  const onde = o.rastreavel ? ` Registrado em: ${o.origem}.` : " A origem do registro não ficou gravada — confira antes de agir.";
  const quando = o.quando ? ` em ${o.quando}` : "";
  return {
    curto: `Óbito registrado${quando}`,
    // O que a Recepção mostra: avisa e deixa seguir. Emergência entra, e
    // homônimo existe.
    recepcao: `Este cadastro tem ÓBITO registrado${quando}.${onde} Confirme que é a pessoa certa antes de seguir.`,
    // O que a Agenda mostra ao RECUSAR. Diz onde corrigir, porque o carimbo
    // é derivado: mexer só no cadastro não resolve.
    agenda: `Este paciente tem ÓBITO registrado${quando}.${onde} Não se marca consulta para quem faleceu — e a confirmação da véspera ligaria para a família. Se for engano, corrija o DESFECHO na origem; o cadastro segue a origem, não o contrário.`,
  };
}

/**
 * Este desfecho é óbito?
 *
 * Aceita as variações que as três fontes escrevem — o PS grava `obito`, a
 * saída de leito grava `obito`, e há registro antigo com acento. Comparar
 * com `=== "obito"` deixaria o acentuado passar por vivo, que é o erro que
 * não se percebe até alguém ligar para a família.
 */
export function desfechoEhObito(desfecho) {
  return normalizarNome(desfecho) === "obito";
}
