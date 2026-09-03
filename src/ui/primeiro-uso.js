// ═══════════════════════════════════════════════════════════
// PRIMEIRO USO — o painel que abre zerado num hospital novo
//
// 🔴 O DEFEITO QUE ISTO CONSERTA, achado na varredura do estado vazio em
// 03/09/2026. Sete painéis abrem assim num hospital que acabou de comprar
// o sistema:
//
//     Solicitações a preparar   0
//     Requisições aguardando    0
//     Cirurgias no dia          0
//
// Nada disso é falso. Mas lê-se como **um dia tranquilo**, e o que está
// acontecendo é outra coisa: o sistema ainda não foi configurado. As duas
// situações produzem exatamente os mesmos zeros, e mandam a pessoa a
// lugares opostos — uma pede café, a outra pede cadastro.
//
// É o mesmo defeito que este projeto persegue desde sempre (ausência lida
// como notícia), só que sem frase para acusar: aqui ele é SILÊNCIO, e por
// isso a varredura por expressão regular não o pega.
//
// ⚠️ TRÊS ESTADOS, NÃO DOIS — e o terceiro é o que mais importa:
//
//     quantos > 0     há cadastro, o zero do painel é notícia de verdade
//     quantos === 0   não há cadastro, o zero não diz nada sobre o hospital
//     quantos == null NÃO DEU PARA LER — e isto NÃO é "não cadastrado"
//
// Colapsar o terceiro no segundo mandaria o hospital cadastrar o que já
// existe, por causa de uma falha de rede.
// ═══════════════════════════════════════════════════════════

/**
 * Uma checagem é `{ o, quantos, onde }`:
 *   o       o que falta, no plural e em minúsculas ("setores", "convênios")
 *   quantos quantas linhas existem — `null` quando a leitura falhou
 *   onde     onde se cadastra, em texto ("Giro de Leitos → Mapa de leitos")
 */

/** As checagens que não deram para ler. */
export function naoConferidas(checagens) {
  return (Array.isArray(checagens) ? checagens : []).filter(c => c && c.quantos == null);
}

/** As checagens que estão em zero de verdade — leitura feita, nada lá. */
export function faltando(checagens) {
  return (Array.isArray(checagens) ? checagens : []).filter(c => c && c.quantos === 0);
}

/** Há algo a dizer? (falta cadastro, ou não deu para conferir) */
export function precisaAvisar(checagens) {
  return faltando(checagens).length > 0 || naoConferidas(checagens).length > 0;
}

/** "setores", "setores e leitos", "setores, leitos e convênios" */
export function lista(itens) {
  const n = itens.map(c => c.o);
  if (n.length <= 1) return n[0] || "";
  return `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}

/**
 * O texto do aviso.
 *
 * ⚠️ Ele diz o que os números SIGNIFICAM, não só que falta cadastro. Sem
 * essa frase a pessoa lê o aviso, fecha, e continua olhando os zeros como
 * se fossem medida do hospital dela.
 */
export function textoDoPrimeiroUso(checagens) {
  const faltam = faltando(checagens);
  const cegas = naoConferidas(checagens);
  if (!faltam.length && !cegas.length) return null;

  if (!faltam.length) {
    // Só falha de leitura: NÃO afirmar que falta cadastro.
    return {
      tom: "duvida",
      titulo: "Não deu para conferir o cadastro",
      corpo: `Não consegui ler ${lista(cegas)}. Os números abaixo podem estar incompletos — recarregue antes de decidir por esta tela.`,
      onde: [],
    };
  }

  const alerta = cegas.length
    ? ` (e não consegui ler ${lista(cegas)}, que pode faltar também)`
    : "";
  return {
    tom: "cadastro",
    titulo: `Falta cadastrar ${lista(faltam)}`,
    // ⚠️ SEM PARTICÍPIO. "não há setores cadastrado" e "salas cadastrado"
    // foram as duas primeiras saídas desta frase: concordar gênero e número
    // com um nome que vem de fora exigiria saber o gênero de cada um. A
    // frase abaixo não precisa concordar com nada.
    corpo: `Os números desta tela estão zerados porque ainda não há ${lista(faltam)} no cadastro${alerta} — não porque o movimento do hospital foi zero.`,
    onde: faltam.filter(c => c.onde).map(c => ({ o: c.o, onde: c.onde, ir: c.ir })),
  };
}
