// ═══════════════════════════════════════════════════════════
// CATÁLOGO DE MÓDULOS E PERFIS-MODELO
//
// O QUE É UM PERFIL DE ACESSO AQUI
// Um pacote NOMEADO de permissões — "Técnico de Enfermagem", "Almoxarifado".
// O gestor pede, a TI escolhe o perfil, e a pessoa entra com tudo
// configurado. É como MV e Tasy organizam: perfil é template, não é a
// identidade da pessoa.
//
// O ERRO QUE ISTO EVITA
// Transformar cada cargo real num perfil fixo. Em dois anos vira "Téc. Enf.
// Noturno UTI", "Téc. Enf. Diurno Clínica", quarenta perfis, e ninguém sabe
// mais qual é qual. Aqui o perfil é o caso geral; o desvio daquela pessoa
// específica é uma EXCEÇÃO no usuário (ver permissoes.js), não um perfil novo.
//
// ONDE ISTO VALE — LEIA ANTES DE CONFIAR
// Este catálogo decide o que aparece na TELA. O acesso ao DADO passou a
// ser decidido pelo MESMO perfil desde `supabase/migracao-rls-leitura.sql`:
// as políticas de SELECT do banco chamam `public.pode_ver(<módulo>)`, e o
// mapa de qual módulo lê qual tabela está em `src/acesso/mapa-tabelas.js`.
// Tirar um módulo daqui passou a tirar também a leitura pela API REST.
//
// Duas coisas que ele ainda NÃO faz, e que não se deve prometer ao
// hospital como se fizesse:
//   • não filtra LINHA — quem alcança `pacientes` alcança todos os
//     pacientes, não só os do seu setor;
//   • não decide ESCRITA — insert/update/delete continuam olhando o
//     `role` (adm_master/adm_silver), não o módulo.
//
// Base normativa que orienta a matriz:
//   COFEN 754/2024, art. 6º — nível de segurança distinto entre informação
//     administrativa e informação clínica.
//   LGPD, art. 46 — medidas aptas a proteger contra acesso não autorizado.
//   Portaria 344/98 — livro de controlados é documento fiscalizável; por
//     isso ganha módulo próprio, separado do resto da farmácia.
// ═══════════════════════════════════════════════════════════

// ── NÍVEIS ──────────────────────────────────────────────────
// Ordenados de propósito: comparar nível vira comparar número, e "quem pode
// escrever pode ler" deixa de depender de alguém lembrar de escrever as
// duas regras.
export const NIVEIS = { nenhum: 0, leitura: 1, escrita: 2 };

export const NIVEL_LABEL = {
  nenhum:  { label: "Sem acesso", cor: "var(--text-muted)" },
  leitura: { label: "Consulta",   cor: "#38bdf8" },
  escrita: { label: "Lança",      cor: "#2dd4bf" },
};

/**
 * Os módulos do sistema, na ordem em que aparecem no menu.
 *
 * `clinico: true` marca o que contém dado assistencial identificável — é o
 * recorte que a COFEN 754/2024 art. 6º manda separar do administrativo.
 *
 * `exigeMaster: true` é trava ANTI-TRANCAMENTO: por mais restrito que seja
 * o perfil, um adm_master nunca perde a porta de volta para consertar o
 * próprio erro de configuração.
 */
export const MODULOS = [
  { chave: "overview",     label: "Visão Geral",        grupo: "Geral" },
  // A porta de entrada. NÃO é marcado como `clinico`: o que se registra
  // aqui é identificação e abertura de atendimento, não ato assistencial —
  // é exatamente o recorte administrativo que a COFEN 754/2024 art. 6º
  // manda separar do prontuário, e é por isso que a Recepção pode ter este
  // módulo sem alcançar o Paciente 360.
  { chave: "atendimento",  label: "Atendimento / Recepção", grupo: "Assistencial",
    nota: "Não é prontuário, mas concentra o dado pessoal identificável (nome, CPF, filiação, endereço) de todo mundo que já passou pelo hospital." },
  { chave: "ambulatorio",  label: "Ambulatório",        grupo: "Assistencial", clinico: true },
  { chave: "ps",           label: "Pronto-Socorro",     grupo: "Assistencial", clinico: true },
  { chave: "bloco",        label: "Bloco Cirúrgico",    grupo: "Assistencial", clinico: true },
  { chave: "leitos",       label: "Giro de Leitos",     grupo: "Assistencial", clinico: true },
  { chave: "scih",         label: "SCIH",               grupo: "Assistencial", clinico: true },
  { chave: "nsp",          label: "Segurança do Paciente", grupo: "Assistencial", clinico: true,
    // Este é o único módulo que quase todo perfil recebe em ESCRITA, e é de
    // propósito: notificar incidente é dever de quem presta o cuidado (RDC
    // 36/2013, art. 8º), não atribuição do núcleo. Núcleo é quem INVESTIGA.
    // Sem isso, o incidente vira conversa de corredor e o indicador mente por
    // baixo — subnotificação parece segurança.
    nota: "Núcleo de Segurança do Paciente (RDC 36/2013). Notificação de incidentes e eventos adversos." },
  { chave: "protocolos",   label: "Protocolos Clínicos", grupo: "Assistencial", clinico: true,
    nota: "Protocolos gerenciados tempo-dependentes (sepse, IAM, AVC, TEV): gatilho por NEWS/triagem, bundle com relógio e indicadores porta→ação, por setor assistencial." },
  { chave: "paciente",     label: "Paciente 360 / PEP", grupo: "Assistencial", clinico: true,
    nota: "Prontuário completo. É o módulo de maior sensibilidade do sistema." },
  { chave: "farmacia",     label: "Farmácia",           grupo: "Apoio" },
  { chave: "controlados",  label: "Livro de Controlados", grupo: "Apoio",
    nota: "Documento fiscalizável (Portaria 344/98) — acesso restrito por norma." },
  { chave: "suprimentos",  label: "Estoque & Compras",  grupo: "Apoio" },
  { chave: "print",        label: "Imprimir Dashboard", grupo: "Gestão" },
  { chave: "auditoria",    label: "Auditoria",          grupo: "Gestão",
    nota: "Trilha de quem fez o quê. Quem é auditado não deveria administrar a própria trilha." },
  { chave: "import",       label: "Importar Dados",     grupo: "Sistema" },
  { chave: "supabase",     label: "Banco de Dados",     grupo: "Sistema" },
  { chave: "users",        label: "Usuários e Perfis",  grupo: "Sistema", exigeMaster: true,
    nota: "Exige ADM Master sempre — é a porta de volta se um perfil for configurado errado." },
];

export const MODULO_POR_CHAVE = Object.fromEntries(MODULOS.map(m => [m.chave, m]));
export const GRUPOS = [...new Set(MODULOS.map(m => m.grupo))];

// ── PERFIS-MODELO ───────────────────────────────────────────

// Atalho de leitura: só o que NÃO é "nenhum" precisa ser declarado.
// Declarar quinze `nenhum` por perfil esconderia o que importa no meio do
// que não importa — e matriz que ninguém consegue ler é matriz que ninguém
// confere.
const p = (grants) => grants;

/**
 * Os perfis que já vêm no sistema.
 *
 * `categoria` é a competência CLÍNICA (COFEN/CFM) e vive em `profiles`; o
 * perfil apenas SUGERE. Quem manda no ato clínico é `src/clinico/papeis.js`
 * — um perfil de acesso não concede competência assistencial, do mesmo jeito
 * que ser adm_master não faz ninguém poder assinar evolução médica.
 *
 * `role` é o papel de sistema que costuma acompanhar o cargo. Também é
 * sugestão: a TI confirma na criação.
 */
export const PERFIS_MODELO = [
  // ── Assistenciais ────────────────────────────────────────
  {
    chave: "medico", nome: "Médico(a)", categoria: "medico", role: "adm_silver",
    descricao: "Assistência médica: prescreve, evolui, dá alta.",
    grants: p({ overview: "leitura", atendimento: "leitura", ambulatorio: "escrita", ps: "escrita", bloco: "escrita",
                leitos: "escrita", scih: "leitura", nsp: "escrita", protocolos: "escrita", paciente: "escrita", farmacia: "leitura",
                print: "leitura" }),
  },
  {
    chave: "enfermeiro", nome: "Enfermeiro(a)", categoria: "enfermeiro", role: "adm_silver",
    descricao: "Processo de Enfermagem completo, gestão de leitos e do cuidado.",
    grants: p({ overview: "leitura", atendimento: "escrita", ambulatorio: "escrita", ps: "escrita", bloco: "leitura",
                leitos: "escrita", scih: "escrita", nsp: "escrita", protocolos: "escrita", paciente: "escrita", farmacia: "leitura",
                suprimentos: "leitura", print: "leitura" }),
  },
  {
    chave: "enfermeiro_scih", nome: "Enfermeiro(a) — SCIH", categoria: "enfermeiro", role: "adm_silver",
    descricao: "Controle de infecção: vigilância, culturas, indicadores.",
    grants: p({ overview: "leitura", ps: "leitura", bloco: "leitura", leitos: "leitura",
                scih: "escrita", nsp: "escrita", paciente: "escrita", farmacia: "leitura", print: "leitura" }),
  },
  {
    chave: "tecnico_enfermagem", nome: "Técnico(a) de Enfermagem", categoria: "tecnico_enfermagem", role: "adm_silver",
    descricao: "Anotação de enfermagem, checagem de medicação e sinais vitais. O que pode registrar é limitado pela categoria (COFEN 736/2024).",
    grants: p({ overview: "leitura", atendimento: "leitura", ambulatorio: "leitura", ps: "escrita", leitos: "escrita",
                scih: "leitura", nsp: "escrita", protocolos: "escrita", paciente: "escrita" }),
  },
  {
    chave: "fisioterapeuta", nome: "Fisioterapeuta", categoria: "fisioterapeuta", role: "adm_silver",
    descricao: "Evolução de fisioterapia no prontuário.",
    grants: p({ overview: "leitura", ps: "leitura", leitos: "leitura", nsp: "escrita", paciente: "escrita" }),
  },
  {
    chave: "nutricionista", nome: "Nutricionista", categoria: "nutricionista", role: "adm_silver",
    descricao: "Avaliação e evolução nutricional.",
    grants: p({ overview: "leitura", leitos: "leitura", nsp: "escrita", paciente: "escrita" }),
  },
  {
    chave: "assistente_social", nome: "Assistente Social", categoria: "assistente_social", role: "adm_silver",
    descricao: "Avaliação social, apoio à alta.",
    grants: p({ overview: "leitura", ambulatorio: "leitura", leitos: "leitura", nsp: "escrita", paciente: "escrita" }),
  },
  {
    // Regulação interna: trabalha a fila de leito e aloca. Vê o PS e o Bloco só
    // para consulta (de onde vêm os pedidos e a classificação), lança no Giro de
    // Leitos, e NÃO abre prontuário — regular leito não é ato assistencial.
    chave: "nir", nome: "NIR / Regulação de Leitos", categoria: "enfermeiro", role: "adm_silver",
    descricao: "Regulação interna: fila de internação, vagas e alocação de leitos. Não acessa prontuário.",
    grants: p({ overview: "leitura", ps: "leitura", bloco: "leitura", leitos: "escrita", nsp: "escrita", print: "leitura" }),
  },

  // ── Farmácia ─────────────────────────────────────────────
  {
    chave: "farmaceutico", nome: "Farmacêutico(a)", categoria: "farmaceutico", role: "adm_silver",
    descricao: "Farmácia clínica, dispensação, controlados e intervenção farmacêutica.",
    grants: p({ overview: "leitura", ps: "leitura", leitos: "leitura", scih: "leitura", nsp: "escrita",
                farmacia: "escrita", controlados: "escrita", suprimentos: "leitura",
                paciente: "leitura", print: "leitura" }),
  },
  {
    chave: "aux_farmacia", nome: "Auxiliar de Farmácia", categoria: "administrativo", role: "adm_silver",
    descricao: "Dispensação e estoque da farmácia. Não acessa prontuário.",
    // Controlados só em leitura: a escrituração do livro é responsabilidade
    // do farmacêutico responsável técnico (Portaria 344/98).
    // NSP em escrita: erro de dispensação e quase-falha de medicamento são o
    // tipo de incidente que só quem manuseia enxerga (RDC 36/2013, art. 8º).
    grants: p({ nsp: "escrita", farmacia: "escrita", controlados: "leitura", suprimentos: "leitura" }),
  },

  // ── Administrativos e apoio ──────────────────────────────
  {
    chave: "recepcao", nome: "Recepção / Admissão", categoria: "administrativo", role: "adm_silver",
    descricao: "Cadastro, chegada e agendamento. NÃO acessa prontuário (COFEN 754/2024, art. 6º).",
    grants: p({ overview: "leitura", atendimento: "escrita", ambulatorio: "escrita", ps: "escrita", leitos: "leitura",
                nsp: "escrita" }),
  },
  {
    chave: "faturamento", nome: "Faturamento", categoria: "administrativo", role: "analista",
    descricao: "Produção e movimento para faturamento. NÃO acessa prontuário.",
    grants: p({ overview: "leitura", atendimento: "leitura", ambulatorio: "leitura", leitos: "leitura", print: "leitura" }),
  },
  {
    chave: "almoxarifado", nome: "Almoxarifado / Suprimentos", categoria: "administrativo", role: "adm_silver",
    descricao: "Materiais, estoque, compras e inventário. Sem acesso assistencial.",
    grants: p({ suprimentos: "escrita" }),
  },
  {
    // Autorização da matriz sobre os pedidos de compra: aprova ou nega. Vê o
    // Estoque em consulta (para abrir a aba Aprovações); a ação de aprovar/negar
    // é liberada pelo perfil, não pelo nível do módulo. Não compra nem mexe em
    // estoque, não acessa prontuário.
    chave: "matriz", nome: "Matriz — Aprovação de Compras", categoria: "administrativo", role: "adm_silver",
    descricao: "Aprova ou nega os pedidos de compra do estoque (autorização da matriz). Não acessa prontuário.",
    grants: p({ overview: "leitura", suprimentos: "leitura" }),
  },
  {
    chave: "gestao", nome: "Gestão / Diretoria", categoria: "administrativo", role: "analista",
    descricao: "Indicadores e BI de todos os módulos. Gestão trabalha com número agregado — não precisa de prontuário individual.",
    grants: p({ overview: "leitura", atendimento: "leitura", ambulatorio: "leitura", ps: "leitura", bloco: "leitura",
                leitos: "leitura", scih: "leitura", nsp: "leitura", protocolos: "leitura", farmacia: "leitura", suprimentos: "leitura",
                print: "leitura", auditoria: "leitura" }),
  },
  {
    chave: "diretor_tecnico", nome: "Diretor(a) Técnico(a)", categoria: "medico", role: "adm_silver",
    descricao: "Responsável pelo prontuário da instituição (CFM 1.638/2002, art. 2º): acessa tudo do assistencial e a trilha de auditoria.",
    grants: p({ overview: "leitura", atendimento: "leitura", ambulatorio: "leitura", ps: "escrita", bloco: "leitura",
                leitos: "leitura", scih: "leitura", nsp: "escrita", protocolos: "escrita", paciente: "escrita", farmacia: "leitura",
                controlados: "leitura", suprimentos: "leitura", print: "leitura", auditoria: "escrita" }),
  },
  {
    chave: "ti", nome: "TI / Analista de Sistemas", categoria: "administrativo", role: "adm_master",
    descricao: "Administra o sistema: cria usuários, configura perfis, importa e acessa o banco. Não tem competência clínica.",
    sistema: true,   // não pode ser apagado — é a porta de volta
    grants: p({ overview: "escrita", atendimento: "escrita", ambulatorio: "escrita", ps: "escrita", bloco: "escrita",
                leitos: "escrita", scih: "escrita", nsp: "escrita", protocolos: "escrita", paciente: "escrita", farmacia: "escrita",
                controlados: "escrita", suprimentos: "escrita", print: "escrita",
                auditoria: "escrita", import: "escrita", supabase: "escrita", users: "escrita" }),
  },
];

export const PERFIL_POR_CHAVE = Object.fromEntries(PERFIS_MODELO.map(x => [x.chave, x]));
