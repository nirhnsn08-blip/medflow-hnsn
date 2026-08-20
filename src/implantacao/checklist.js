// ═══════════════════════════════════════════════════════════
// CHECKLIST DE IMPLANTAÇÃO — quais cadastros-base ainda travam um módulo
//
// O teste de estresse de 2026-08-19 achou o MESMO problema três vezes: uma
// tabela de configuração vazia deixa um módulo inteiro dormente, e nada na
// tela diz isso. O Bloco Cirúrgico aparecia vazio porque `cc_salas` tinha
// zero salas; a cotação de Compras não fechava porque não havia fornecedor;
// Protocolos e a Ocupação por setor só acordaram depois de cadastrar UM
// setor — pelo botão "Setores", que fica escondido dentro de outra tela.
//
// Cada módulo tem, na melhor das hipóteses, um empty-state local — que só é
// visto por quem já abriu o módulo. Quem implanta o hospital não tem como
// saber o que falta sem percorrer os quinze.
//
// Aqui mora só a REGRA: dado o que voltou do banco e o que a pessoa
// enxerga, o cadastro está feito, vazio ou incerto. Sem React e sem rede,
// para poder ser quebrada de propósito no teste.
// ═══════════════════════════════════════════════════════════

import { MODULO_POR_CHAVE } from "../acesso/modulos.js";
import { podeVer } from "../acesso/permissoes.js";

/**
 * Os cadastros sem os quais um módulo não funciona.
 *
 * `select`/`colunaAtivo` são COLUNAS REAIS — conferidas contra
 * `supabase/auditoria-banco.sql` em `contrato-banco.test.js`. As três
 * primeiras tabelas têm `nome` como chave primária; só `sup_fornecedores`
 * tem `id`.
 *
 * `onde` é o caminho literal até o botão. Não é preciosismo: o empty-state
 * antigo dizia "Giro de Leitos → Setores" como se Setores fosse uma aba, e
 * quem procurou por aba não achou.
 */
export const CADASTROS_BASE = [
  {
    chave: "setores",
    tabela: "setores",
    select: "nome",
    colunaAtivo: null,
    label: "Setores",
    modulo: "leitos",
    destrava: ["protocolos", "overview"],
    onde: "Giro de Leitos → aba Mapa de leitos → botão Setores, à direita da barra de cadastro",
    porque: "Sem setor cadastrado não dá para ligar protocolo por setor nem calcular ocupação por setor.",
  },
  {
    chave: "salas",
    tabela: "cc_salas",
    select: "nome",
    colunaAtivo: "ativa",
    label: "Salas cirúrgicas",
    modulo: "bloco",
    destrava: ["bloco"],
    onde: "Bloco Cirúrgico → botão Salas, no topo da tela",
    porque: "O mapa cirúrgico é montado por sala; sem sala ativa não há onde agendar.",
  },
  {
    chave: "fornecedores",
    tabela: "sup_fornecedores",
    select: "id",
    colunaAtivo: "ativo",
    label: "Fornecedores",
    modulo: "suprimentos",
    destrava: ["suprimentos"],
    onde: "Estoque & Compras → aba Fornecedores",
    porque: "Cotação, pedido de compra e entrada por NF-e pedem fornecedor.",
  },
  {
    chave: "germes",
    tabela: "scih_germes",
    select: "nome",
    colunaAtivo: null,
    label: "Base de germes",
    modulo: "scih",
    destrava: ["scih"],
    onde: "SCIH → botão Base de germes, no topo da tela",
    porque: "É de onde saem o germe e a precaução dos casos de vigilância.",
  },
];

export const CADASTRO_POR_CHAVE = Object.fromEntries(CADASTROS_BASE.map(c => [c.chave, c]));

/** Quantos registros VALEM — desativado não destrava nada. */
export function contarAtivos(linhas, colunaAtivo) {
  if (!Array.isArray(linhas)) return null;
  if (!colunaAtivo) return linhas.length;
  // `!== false` e não `=== true`: a coluna tem default `true` no banco, mas
  // uma linha antiga pode ter vindo com null — e a tela já conta assim
  // (`salas.filter(s => s.ativa !== false)` no App.jsx).
  return linhas.filter(l => l?.[colunaAtivo] !== false).length;
}

/**
 * O estado de UM cadastro. São três, não dois — e essa é a regra inteira.
 *
 * Um `0` que volta do banco pode significar três coisas diferentes:
 *   • não tem nada cadastrado;
 *   • a pessoa não enxerga a tabela (o RLS de leitura devolve LISTA VAZIA,
 *     não erro — `sup_fornecedores` só é visível a quem tem suprimentos ou
 *     farmácia);
 *   • a consulta nem chegou a acontecer (o `sbFetch` devolve `null` em
 *     qualquer falha, e nunca lança).
 *
 * Dizer "cadastre fornecedores" para quem simplesmente não pode ver a
 * tabela é o aviso que dispara sempre — e aviso que dispara sempre ninguém
 * lê. Por isso o terceiro estado existe.
 *
 * `podeVer` aqui é ternário de propósito: `true` (confirmado), `false`
 * (confirmado que não) ou `null` ("ainda não sei" — as permissões não
 * carregaram).
 */
export function estadoCadastro({ linhas, podeVer: pode = null, colunaAtivo = null }) {
  if (!Array.isArray(linhas)) return "indeterminado";
  const n = contarAtivos(linhas, colunaAtivo);
  // Contagem positiva PROVA a leitura: se voltou linha, a pessoa enxerga a
  // tabela, e não importa o que as permissões ainda não disseram.
  if (n > 0) return "ok";
  return pode === true ? "vazio" : "indeterminado";
}

/**
 * O checklist inteiro, já pronto para desenhar.
 *
 * `contagens` — { [chave]: linhas | null }, como volta de `contarCadastros`.
 * `perms`     — o mapa de permissões efetivas, ou `null` enquanto carrega.
 *
 * Com `perms === null` o menu do sistema falha ABERTO (mostrar módulo a mais
 * por um instante incomoda menos do que sumir com o trabalho de alguém no
 * plantão). Aqui a mesma escolha vale para MOSTRAR o item — mas não para
 * afirmar que ele está vazio: sem permissão confirmada, um zero vira
 * "indeterminado", nunca "falta cadastrar".
 */
export function avaliarChecklist(contagens = {}, { perms = null } = {}) {
  const itens = CADASTROS_BASE.map(c => {
    const linhas = contagens[c.chave] ?? null;
    const pode = perms == null ? null : podeVer(perms, c.modulo);
    return {
      ...c,
      visivel: pode !== false,
      quantos: contarAtivos(linhas, c.colunaAtivo),
      estado: estadoCadastro({ linhas, podeVer: pode, colunaAtivo: c.colunaAtivo }),
    };
  });

  const visiveis = itens.filter(i => i.visivel);
  return {
    itens,
    visiveis,
    feitos: visiveis.filter(i => i.estado === "ok").length,
    pendentes: visiveis.filter(i => i.estado === "vazio").length,
    indeterminados: visiveis.filter(i => i.estado === "indeterminado").length,
    total: visiveis.length,
  };
}

/**
 * Os módulos que estão dormentes agora — pelo rótulo do catálogo, não por
 * nome digitado à mão, para não sobrar texto velho quando um módulo for
 * renomeado. Só conta o que está comprovadamente vazio: módulo que talvez
 * esteja configurado não entra na lista de travados.
 */
export function modulosDormentes(itens = []) {
  const chaves = [];
  for (const i of itens) {
    if (i.estado !== "vazio" || !i.visivel) continue;
    for (const m of (i.destrava || [])) if (!chaves.includes(m)) chaves.push(m);
  }
  return chaves.map(k => MODULO_POR_CHAVE[k]?.label).filter(Boolean);
}

/**
 * O card aparece? Só para quem pode cadastrar e só enquanto houver o que
 * fazer. As quatro tabelas só aceitam escrita de adm_master/adm_silver, então
 * mostrar a pendência aos outros seria cobrar de quem não pode resolver — e
 * o card some sozinho quando a implantação termina, em vez de virar mais um
 * aviso permanente que todo mundo aprende a ignorar.
 */
export function deveMostrarChecklist(resumo, canEdit) {
  if (!canEdit) return false;
  return (resumo?.pendentes || 0) + (resumo?.indeterminados || 0) > 0;
}
