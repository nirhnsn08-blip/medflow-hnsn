// ═══════════════════════════════════════════════════════════
// ALERGIAS DO PACIENTE — resolução de fonte única
//
// PROBLEMA QUE RESOLVE
// A alergia morava dentro do atendimento do PS (`ps_atendimentos.alergias`,
// texto livre). Consequências no dia a dia:
//   • sumia quando o paciente recebia alta — redigitada a cada passagem;
//   • o paciente INTERNADO não tinha alergia nenhuma no sistema, e é
//     justamente ele que passa dias recebendo medicação.
//
// Alergia é atributo da PESSOA, não da passagem. A fonte única passa a ser
// `pep_alergias`, que é append-only e guarda quem registrou, quando e com
// que grau de certeza.
//
// COMPATIBILIDADE
// O campo antigo continua sendo lido durante a transição — prontuário
// preenchido antes desta mudança não pode simplesmente sumir da tela. As
// duas fontes são fundidas e a origem de cada termo fica marcada.
// ═══════════════════════════════════════════════════════════

import { normTxt, parseAlergias } from "./alertas.js";

// Situações que significam "esta alergia vale agora".
// `refutada` = investigou-se e não era alergia. `resolvida`/`inativa` =
// deixou de valer. Nenhuma das três deve gerar alerta, mas todas
// permanecem no histórico (o registro é imutável).
const SITUACOES_VIGENTES = ["ativa"];

// Registro de "nega alergias" é informação clínica valiosa — significa que
// alguém PERGUNTOU. Diferente de campo em branco, que só significa que
// ninguém preencheu.
export const TIPO_NENHUMA = "nenhuma_conhecida";

/**
 * Reduz o histórico append-only à lista que vale agora.
 * Um registro corrigido por outro (corrige_id) é substituído pela correção.
 */
export function alergiasVigentes(registros) {
  const lista = Array.isArray(registros) ? registros : [];
  const corrigidos = new Set(lista.map(r => r.corrige_id).filter(Boolean));
  return lista
    .filter(r => !corrigidos.has(r.id))
    .filter(r => SITUACOES_VIGENTES.includes(r.situacao || "ativa"));
}

/** O paciente declarou explicitamente não ter alergia conhecida? */
export function negaAlergias(registros) {
  return alergiasVigentes(registros).some(r => r.tipo === TIPO_NENHUMA);
}

/**
 * Monta o texto que o motor de alertas consome (`ctx.alergias`).
 * Funde a fonte nova com o campo legado do atendimento, sem duplicar.
 *
 * Prefere `substancia` (princípio ativo normalizado) quando existe: é o
 * que faz o motor casar "Novalgina" com "Dipirona". Cai para `agente`
 * (como o paciente chama) quando a substância não foi preenchida.
 */
export function textoAlergiasParaAlerta(registros, textoLegado = "") {
  const termos = [];
  const vistos = new Set();
  const juntar = t => {
    const n = normTxt(t);
    if (!n || n.length < 3 || vistos.has(n)) return;
    vistos.add(n); termos.push(t.trim());
  };

  for (const r of alergiasVigentes(registros)) {
    if (r.tipo === TIPO_NENHUMA) continue;      // "nega alergias" não é alergia
    juntar(r.substancia || r.agente);
  }
  // o campo antigo entra depois, para não sobrescrever o dado estruturado
  for (const t of parseAlergias(textoLegado)) juntar(t);

  return termos.join(", ");
}

/**
 * Visão para a tela: cada alergia com sua origem, para o profissional saber
 * o que é registro estruturado e o que ainda é texto solto do atendimento.
 */
export function alergiasParaExibir(registros, textoLegado = "") {
  const itens = alergiasVigentes(registros)
    .filter(r => r.tipo !== TIPO_NENHUMA)
    .map(r => ({
      chave: "pep-" + r.id,
      rotulo: r.agente,
      substancia: r.substancia || null,
      gravidade: r.gravidade || null,
      criticidade: r.criticidade || "alta",
      manifestacao: r.manifestacao || null,
      fonte: "registro",
      quem: r.profissional_nome || r.usuario || null,
      quando: r.criado_em || null,
    }));

  const jaTem = new Set(itens.map(i => normTxt(i.substancia || i.rotulo)));
  for (const t of parseAlergias(textoLegado)) {
    if (jaTem.has(normTxt(t))) continue;
    itens.push({
      chave: "legado-" + t, rotulo: t, substancia: null,
      gravidade: null, criticidade: "alta", manifestacao: null,
      fonte: "legado",                 // veio do texto livre do atendimento
      quem: null, quando: null,
    });
  }
  // criticidade alta primeiro — é a que mata se houver reexposição
  return itens.sort((a, b) => (a.criticidade === "alta" ? 0 : 1) - (b.criticidade === "alta" ? 0 : 1));
}

/**
 * Estado para a faixa de aviso da tela.
 *   "nenhuma"     — alguém perguntou e o paciente negou
 *   "com_alergia" — há alergia vigente
 *   "sem_registro"— NINGUÉM PERGUNTOU. Não é o mesmo que "não tem".
 */
export function situacaoAlergica(registros, textoLegado = "") {
  const itens = alergiasParaExibir(registros, textoLegado);
  if (itens.length) return { estado: "com_alergia", itens };
  if (negaAlergias(registros)) return { estado: "nenhuma", itens: [] };
  return { estado: "sem_registro", itens: [] };
}
