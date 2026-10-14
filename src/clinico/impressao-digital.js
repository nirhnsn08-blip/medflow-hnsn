// ═══════════════════════════════════════════════════════════
// A IMPRESSÃO DIGITAL DO DOCUMENTO — o lado que VERIFICA
//
// ⚠️⚠️ ISTO NÃO É ASSINATURA DIGITAL. O campo `assinatura` deste sistema
// guarda um texto ("Dra. Ana · CRM 1234"), que é ATRIBUIÇÃO. Assinatura no
// sentido da CFM 1.821/2007 e do manual SBIS/CFM exige certificado
// ICP-Brasil — e sem ele o hospital NÃO pode parar de imprimir.
//
// O que existe aqui é o chão que toda assinatura precisa: a decisão de
// QUAIS campos são o documento, em QUE ordem, e o hash disso. Os três
// caminhos possíveis (A1, A3, nuvem) assinam exatamente este hash.
//
// 🔴 QUEM CALCULA É O BANCO, no gatilho. Este módulo RECALCULA para
// conferir — nunca para gravar. Se a tela pudesse gravar o hash, bastaria
// mandar o hash de outro conteúdo e a digital provaria nada.
//
// 🔴 A FORMA CANÔNICA AQUI TEM DE SER IDÊNTICA À DO SQL, byte a byte.
// São duas implementações da mesma regra, e isso é um risco conhecido e
// aceito de propósito: a alternativa (pedir o canônico ao banco para
// verificar) faria a verificação depender de quem está sendo verificado.
//
// ⚠️ O QUE SEGURA AS DUAS JUNTAS é `impressao-digital.pglite.test.js`, que
// roda o SQL de verdade e compara com a saída daqui. Mudar qualquer regra
// de formatação de um lado sem o outro deixa aquele teste vermelho.
//
// ⚠️ O QUE A DIGITAL NÃO PROVA: quem tem escrita no banco pode recalcular o
// hash junto. Ela pega alteração feita por FORA do caminho do aplicativo —
// restore parcial, cópia entre bancos, edição em massa — e dá os bytes
// exatos que a assinatura de verdade vai assinar depois.
// ═══════════════════════════════════════════════════════════

/** A versão da forma canônica. Muda junto com o SQL, ou nada bate. */
export const FORMATO = "1";

/**
 * Texto: nulo e vazio são a MESMA coisa, e espaço nas bordas não conta.
 * Espelha `public.doc_txt`.
 */
export function docTxt(v) {
  return String(v ?? "").trim();
}

/**
 * Número com escala normalizada. Espelha `public.doc_num` (que usa
 * `trim_scale`).
 *
 * 🔴 `7.20` e `7.2` são o mesmo número e dois textos. O Postgres preserva a
 * escala do `numeric`; o JavaScript não a conhece. Sem normalizar, um laudo
 * gravado com `7.20` nunca mais bateria.
 *
 * ⚠️ Vazio para o que não é número finito — e NÃO zero. Zero é um valor de
 * laudo legítimo, e confundi-lo com ausência faria dois documentos
 * diferentes terem a mesma digital.
 */
export function docNum(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return String(n);
}

/**
 * Instante em UTC, precisão de SEGUNDO. Espelha `public.doc_ts`.
 *
 * ⚠️ Segundo, e não milissegundo: o Postgres guarda microssegundos e o
 * JavaScript só conhece milissegundos, então a precisão cheia divergiria
 * em algum registro, um dia, sem ninguém entender por quê.
 */
export function docTs(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 19) + "Z";
}

/** Booleano como o Postgres escreve: `true` / `false`; nulo é vazio. */
export function docBool(v) {
  if (v === null || v === undefined) return "";
  return v ? "true" : "false";
}

/** Inteiro/id como texto; nulo é vazio. */
function docId(v) {
  return v === null || v === undefined || v === "" ? "" : String(v);
}

const linha = (k, v) => `${k}=${v}`;

/**
 * A forma canônica da DESCRIÇÃO CIRÚRGICA.
 *
 * ⚠️ A ORDEM É CONTRATO. Trocar duas linhas muda o hash sem mudar o
 * documento, e invalidaria tudo que já existe.
 */
export function canonicoDescricao(d = {}) {
  return [
    linha("documento", "cc_descricao"),
    linha("formato", FORMATO),
    linha("cirurgia_id", docId(d.cirurgia_id)),
    linha("procedimento_cod", docTxt(d.procedimento_cod)),
    linha("procedimento_realizado", docTxt(d.procedimento_realizado)),
    linha("via_acesso", docTxt(d.via_acesso)),
    linha("descricao", docTxt(d.descricao)),
    linha("achados", docTxt(d.achados)),
    linha("intercorrencias", docTxt(d.intercorrencias)),
    linha("sangramento_ml", docNum(d.sangramento_ml)),
    linha("hemotransfusao", docBool(d.hemotransfusao)),
    linha("drenos", docTxt(d.drenos)),
    linha("amostra_enviada", docBool(d.amostra_enviada)),
    linha("amostras", docTxt(d.amostras)),
    linha("conversao", docBool(d.conversao)),
    linha("conversao_motivo", docTxt(d.conversao_motivo)),
    linha("cid_pos", docTxt(d.cid_pos)),
    linha("corrige_id", docId(d.corrige_id)),
    linha("motivo_correcao", docTxt(d.motivo_correcao)),
    linha("assinatura", docTxt(d.assinatura)),
  ].join("\n");
}

/** A forma canônica do RESULTADO DE EXAME. */
export function canonicoResultado(r = {}) {
  return [
    linha("documento", "sadt_resultados"),
    linha("formato", FORMATO),
    linha("item_id", docId(r.item_id)),
    linha("analito_id", docId(r.analito_id)),
    linha("nome", docTxt(r.nome)),
    linha("valor_num", docNum(r.valor_num)),
    linha("valor_texto", docTxt(r.valor_texto)),
    linha("unidade", docTxt(r.unidade)),
    linha("referencia", docTxt(r.referencia)),
    linha("laudo", docTxt(r.laudo)),
    // 🔴 `anormal` e `critico` entram: quem lê o laudo AGE sobre eles, e um
    // crítico que virasse normal sem quebrar a digital seria a alteração
    // mais perigosa que este banco permite.
    linha("anormal", docBool(r.anormal)),
    linha("critico", docBool(r.critico)),
    linha("corrige_id", docId(r.corrige_id)),
    linha("motivo_correcao", docTxt(r.motivo_correcao)),
    linha("liberado_por", docTxt(r.liberado_por)),
    linha("assinatura", docTxt(r.assinatura)),
  ].join("\n");
}

/** Os documentos que hoje têm digital, e como montar a forma canônica. */
export const DOCUMENTOS = {
  cc_descricao: { label: "Descrição cirúrgica", canonico: canonicoDescricao },
  sadt_resultados: { label: "Resultado de exame", canonico: canonicoResultado },
};

/**
 * SHA-256 em hexadecimal, pelo Web Crypto.
 *
 * ⚠️ `crypto.subtle` só existe em contexto seguro (https ou localhost).
 * Num navegador servido por http simples ele é `undefined`, e aí a
 * verificação devolve "não deu para conferir" — que é diferente de
 * "não bate", e a tela precisa distinguir os dois.
 */
export async function sha256Hex(texto) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(texto);
  const buf = await subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Este documento ainda é o que foi gravado?
 *
 * 🔴 TRÊS RESPOSTAS, NÃO DUAS. "Não deu para conferir" NÃO é "não bate":
 *
 *   `confere`      → a digital bate; o conteúdo é o que foi gravado
 *   `alterado`     → 🔴 bate não; alguém mexeu na linha por fora
 *   `sem_digital`  → documento anterior a esta migração; nada a afirmar
 *   `outro_formato`→ gravado com outra versão da forma canônica
 *   `indisponivel` → sem Web Crypto (contexto inseguro); não dá para dizer
 *
 * ⚠️ Colapsar `sem_digital` ou `indisponivel` em "alterado" encheria a tela
 * de alarme falso sobre documento íntegro — e alarme falso em prova de
 * integridade é pior que alarme nenhum, porque se aprende a ignorá-lo.
 * Colapsar em "confere" seria pior ainda: afirmaria o que não se apurou.
 */
export async function conferirDocumento(tipo, linhaDoc) {
  const d = DOCUMENTOS[tipo];
  if (!d || !linhaDoc) return { estado: "indisponivel", motivo: "Documento desconhecido." };
  if (!linhaDoc.conteudo_hash) {
    return {
      estado: "sem_digital",
      motivo: "Este documento é anterior à impressão digital. Não dá para afirmar que ele é o que foi gravado — nem que não é.",
    };
  }
  if (linhaDoc.hash_formato && linhaDoc.hash_formato !== FORMATO) {
    return {
      estado: "outro_formato",
      motivo: `Gravado com a forma canônica ${linhaDoc.hash_formato}, e este sistema confere a ${FORMATO}. Precisa do verificador daquela versão.`,
    };
  }
  const calculado = await sha256Hex(d.canonico(linhaDoc));
  if (calculado === null) {
    return {
      estado: "indisponivel",
      motivo: "O navegador não expôs o Web Crypto (acontece fora de https). Não foi possível conferir — o que é diferente de não bater.",
    };
  }
  if (calculado !== linhaDoc.conteudo_hash) {
    return {
      estado: "alterado", calculado, gravado: linhaDoc.conteudo_hash,
      motivo: "🔴 O conteúdo deste documento NÃO corresponde à impressão digital gravada com ele. Alguém alterou a linha por fora do sistema.",
    };
  }
  return { estado: "confere", motivo: "O conteúdo é o que foi gravado." };
}

/** Como mostrar o resultado. `rotulo` vazio quando não há o que anunciar. */
export function selo(resultado) {
  switch (resultado?.estado) {
    case "confere":       return { rotulo: "Íntegro", cor: "#34d399", grave: false };
    case "alterado":      return { rotulo: "ALTERADO", cor: "#f43f5e", grave: true };
    case "outro_formato": return { rotulo: "Formato antigo", cor: "#d97706", grave: false };
    case "sem_digital":   return { rotulo: "Sem impressão digital", cor: "var(--text-muted)", grave: false };
    default:              return { rotulo: "Não conferido", cor: "var(--text-muted)", grave: false };
  }
}
