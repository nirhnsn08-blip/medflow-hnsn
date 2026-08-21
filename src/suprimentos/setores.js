// ═══════════════════════════════════════════════════════════
// SETOR DE DESTINO DA SAÍDA — regra pura
//
// Assimetria que corrói o BI em silêncio: a REQUISIÇÃO escolhe o setor num
// catálogo (`setores`), mas a SAÍDA MANUAL digita texto livre
// (`placeholder="Ex.: Posto 2, Centro Cirúrgico"`). Como o consumo por setor
// agrupa por essa string, "Posto 2", "posto 2" e "POSTO 2 " viram três
// setores diferentes no relatório.
//
// O sintoma é traiçoeiro porque nada quebra: o número aparece, parece certo,
// e só está errado. Quem olha o consumo do Posto 2 vê um terço dele.
//
// A correção tem duas metades:
//   • a tela oferece o catálogo (resolve o caminho comum);
//   • e o que for digitado à mão é NORMALIZADO e, quando reconhecível,
//     encaixado de volta no nome canônico do catálogo — porque a opção
//     "Outro…" continua existindo, e é justamente por ela que a divergência
//     entraria.
// ═══════════════════════════════════════════════════════════

/**
 * Forma canônica para comparação: sem acento, sem caixa, sem espaço
 * repetido. Não é o que se grava — é a chave para reconhecer que
 * "Centro Cirúrgico" e "centro cirurgico" são a mesma coisa.
 *
 * `\p{Diacritic}` com a flag `u` em vez da faixa de caracteres combinantes
 * escrita à mão: a faixa literal depende da codificação do arquivo
 * sobreviver intacta a todo editor e ferramenta que tocar nele, e já se
 * perdeu uma vez neste projeto.
 */
export function chaveDeSetor(texto) {
  return String(texto ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** O que se grava quando não há correspondência no catálogo: só aparado. */
export function normalizarSetor(texto) {
  return String(texto ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Encaixa o que foi digitado no nome do catálogo, quando reconhecível.
 *
 * Devolve `{ nome, doCatalogo }`. Digitar "posto 2" com "POSTO 2" cadastrado
 * grava **POSTO 2** — o relatório passa a somar as duas origens na mesma
 * linha, que é o ponto.
 *
 * Sem correspondência, devolve o texto normalizado e `doCatalogo: false`:
 * o setor novo é gravado como a pessoa escreveu, porque recusar aqui
 * impediria registrar uma saída real por causa de um cadastro que ninguém
 * fez ainda.
 */
export function casarComCatalogo(texto, setores = []) {
  const limpo = normalizarSetor(texto);
  if (!limpo) return { nome: "", doCatalogo: false };
  const chave = chaveDeSetor(limpo);
  const achado = (setores || []).find(s => chaveDeSetor(s?.nome) === chave);
  return achado ? { nome: achado.nome, doCatalogo: true } : { nome: limpo, doCatalogo: false };
}

/**
 * O setor digitado é novo em relação ao catálogo?
 *
 * A tela usa isto para avisar — não para bloquear. Um setor legítimo pode
 * não estar cadastrado ainda, e travar a saída de material por causa disso
 * seria parar o almoxarifado por um problema de cadastro.
 */
export function ehSetorNovo(texto, setores = []) {
  const { nome, doCatalogo } = casarComCatalogo(texto, setores);
  return !!nome && !doCatalogo;
}

/**
 * Agrupa consumo por setor usando a chave canônica, e devolve o nome do
 * catálogo quando existe.
 *
 * Existe para o relatório: mesmo com dado histórico já divergente, o
 * agrupamento passa a somar "Posto 2" e "posto 2" na mesma linha, sem
 * precisar reescrever o passado. `variantes` mostra as grafias encontradas
 * — é o que permite decidir se vale corrigir o histórico ou só seguir.
 */
export function agruparPorSetor(movimentos = [], setores = []) {
  const mapa = new Map();
  for (const mv of movimentos) {
    const bruto = normalizarSetor(mv?.setor);
    if (!bruto) continue;
    const chave = chaveDeSetor(bruto);
    const { nome } = casarComCatalogo(bruto, setores);
    const atual = mapa.get(chave) || { setor: nome, quantidade: 0, movimentos: 0, variantes: new Set() };
    atual.quantidade += Number(mv?.quantidade || 0);
    atual.movimentos += 1;
    atual.variantes.add(bruto);
    mapa.set(chave, atual);
  }
  return [...mapa.values()]
    .map(x => ({ ...x, variantes: [...x.variantes].sort() }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
