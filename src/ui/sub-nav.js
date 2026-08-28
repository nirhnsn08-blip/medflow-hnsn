// ═══════════════════════════════════════════════════════════
// A BARRA DE DENTRO DE UM MÓDULO, AGRUPADA
//
// Puro: não sabe o que é React.
//
// 🔴 O PADRÃO QUE ISTO CORRIGE
// Todo módulo grande abre com LEITURA e esconde o ATO embaixo. O caso que
// obrigou a olhar: em Segurança do Paciente, "Registrar incidente" era o 4º
// item, atrás de "Visão geral", "Panorama" e "Notificações" — e registrar
// incidente é a coisa mais praticada do sistema inteiro: 13 dos 17 perfis
// têm escrita nesse módulo, o dobro do segundo colocado.
//
// Quem chega para notificar uma queda passa por três painéis do núcleo
// antes de achar o formulário. Subnotificação não precisa de mais motivo
// que esse — e subnotificação parece segurança, que é o pior jeito de
// errar num indicador de qualidade.
//
// A ORDEM DE UM MÓDULO É:
//   1. o que a maioria vem FAZER
//   2. o que sustenta esse ato (consultar o que registrei)
//   3. o que só o dono do módulo faz (triagem, investigação, governança)
//   4. leitura e referência (painel, indicadores, relatório, assistente)
//
// O módulo Faturamento já fazia isso (`FAT_NAV`, com "Gestão",
// "Inteligência" e "Referência"); os outros não. Aqui a peça fica em um
// lugar só, para os próximos não reinventarem cada um do seu jeito.
// ═══════════════════════════════════════════════════════════

/**
 * Intercala cabeçalhos de grupo numa barra cujos itens carregam `grupo`.
 *
 * Devolve a lista achatada, com `{ grupoTitulo }` antes de cada bloco — o
 * mesmo formato que a barra lateral principal usa, para o renderizador ser
 * um `if` e não um componente novo.
 *
 * ⚠️ A ORDEM SAI DA LISTA, não de uma ordenação aqui dentro. Ordenar por
 * nome de grupo faria a sequência do trabalho depender de alfabeto: em
 * Segurança do Paciente, "Acompanhar" viria antes de "Notificar", e o ato
 * voltaria para o fim — que é exatamente o defeito de origem.
 *
 * ⚠️ ITEM SEM `grupo` NÃO GANHA CABEÇALHO e fica onde está. É o que permite
 * a barra ter uma entrada solta no topo (a home do módulo) sem inventar um
 * grupo de um item só.
 */
export function comGrupos(itens = []) {
  const lista = Array.isArray(itens) ? itens : [];
  const saida = [];
  let atual = null;
  for (const it of lista) {
    if (!it) continue;
    const g = it.grupo || null;
    if (g && g !== atual) saida.push({ grupoTitulo: g });
    // Item sem grupo NÃO zera o grupo corrente: se ele aparecesse no meio
    // de um bloco, zerar faria o próximo item repetir o cabeçalho.
    if (g) atual = g;
    saida.push(it);
  }
  return saida;
}

/** Os grupos presentes, na ordem em que aparecem. Serve para conferência. */
export function gruposDe(itens = []) {
  const vistos = [];
  for (const it of Array.isArray(itens) ? itens : []) {
    if (it?.grupo && !vistos.includes(it.grupo)) vistos.push(it.grupo);
  }
  return vistos;
}
