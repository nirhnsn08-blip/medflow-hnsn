// ═══════════════════════════════════════════════════════════
// CEP — o que ele preenche, e o que ele NÃO toca
//
// Puro: não faz rede. Quem busca é a tela; aqui só se decide o que fazer
// com a resposta.
//
// 🔴 POR QUE ISTO EXISTE
// O campo CEP não fazia nada: nem validava, nem preenchia. A recepção
// digitava logradouro, bairro, município e UF à mão — quatro campos que o
// CEP responde, cada um uma chance de erro de digitação que depois vira
// indicador territorial errado (é por município e bairro que o hospital
// enxerga de onde vem a demanda).
//
// ⚠️ A REGRA QUE MOLDA O ARQUIVO: NÃO SOBRESCREVE O QUE A PESSOA DIGITOU.
// Quem já escreveu o logradouro e depois preenche o CEP não pode ver o que
// escreveu sumir. A busca preenche o que está VAZIO e mais nada — e o que
// ela não completa continua editável, como sempre foi.
//
// E o CEP NÃO responde tudo: em cidade pequena o CEP é único para o
// município inteiro e vem sem logradouro nem bairro. Isso não é falha, é o
// dado real — a tela preenche município e UF e deixa o resto para quem está
// com a pessoa na frente.
// ═══════════════════════════════════════════════════════════

import { limparDoc } from "./identidade.js";

/** CEP tem 8 dígitos. Nem 7, nem 9. */
export const DIGITOS_DO_CEP = 8;

/** Só os dígitos, para consultar e para comparar. */
export const cepLimpo = valor => limparDoc(valor).slice(0, DIGITOS_DO_CEP);

/** '88370000' → '88370-000'. O que não tem 8 dígitos volta como veio. */
export function formatarCep(valor) {
  const d = cepLimpo(valor);
  if (d.length !== DIGITOS_DO_CEP) return String(valor ?? "");
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

/** Está completo o bastante para consultar? */
export const cepCompleto = valor => cepLimpo(valor).length === DIGITOS_DO_CEP;

/**
 * O que a resposta da consulta preenche no formulário.
 *
 * Devolve SÓ os campos a mudar — objeto vazio quando não há nada a fazer.
 * A tela aplica com um spread, então campo ausente é campo intocado.
 *
 * `resposta` é o formato do ViaCEP (`logradouro`, `bairro`, `localidade`,
 * `uf`), que é o serviço público que a recepção brasileira usa. O formato
 * está isolado aqui: trocar de provedor é mexer neste arquivo e mais nada.
 */
export function camposDoCep(resposta, atual = {}) {
  if (!resposta || resposta.erro || resposta.erro === "true") return {};

  const vazio = campo => !String(atual?.[campo] ?? "").trim();
  const out = {};
  const por = (campo, valor) => {
    const v = String(valor ?? "").trim();
    // Só preenche o que está VAZIO: quem já digitou não vê o que escreveu
    // sumir por ter preenchido o CEP depois.
    if (v && vazio(campo)) out[campo] = v;
  };

  por("end_logradouro", resposta.logradouro);
  por("end_bairro", resposta.bairro);
  por("end_municipio", resposta.localidade);
  por("end_uf", resposta.uf);

  // O código IBGE do município, que a AIH e o BPA exigem e ninguém digita.
  // Só entra se o município que VAI FICAR no formulário for o que o CEP
  // respondeu: quem já tinha digitado outra cidade manda, e carimbar o
  // código do CEP ao lado dela criaria um endereço que se contradiz.
  const municipioFinal = out.end_municipio ?? atual?.end_municipio;
  if (ibgeValido(resposta.ibge) && mesmoMunicipio(municipioFinal, resposta.localidade)) {
    out.end_municipio_ibge = String(resposta.ibge).trim();
  }

  return out;
}

/**
 * O que dizer a quem está no balcão depois da consulta.
 *
 * `estado` é o que aconteceu, não o que se conseguiu preencher — são coisas
 * diferentes: um CEP de cidade pequena é ENCONTRADO e não preenche
 * logradouro nenhum, e dizer "não achei" nesse caso mandaria a
 * recepcionista conferir um CEP que está certo.
 */
export function mensagemDoCep({ estado, preenchidos = 0 } = {}) {
  if (estado === "incompleto") return "";
  if (estado === "invalido") return "Este CEP não existe na base dos Correios. Confira o número — ou preencha o endereço à mão.";
  if (estado === "falhou") return "Não consegui consultar o CEP agora (a busca depende de internet). Preencha o endereço à mão — nada do que você digitou foi perdido.";
  if (estado === "achou" && preenchidos === 0)
    return "CEP encontrado, e não havia campo em branco para preencher — o que estava escrito foi mantido.";
  if (estado === "achou")
    return `CEP encontrado: ${preenchidos} campo(s) preenchido(s). Confira com a pessoa e complete o número.`;
  return "";
}

// ═══════════════════════════════════════════════════════════
// CÓDIGO IBGE DO MUNICÍPIO
//
// A AIH e o BPA não aceitam o município por extenso: exigem o código de 7
// dígitos do IBGE. Quem digita "Navegantes" na recepção não sabe que o
// faturamento precisa de "4211900", e o faturista descobre isso na glosa.
//
// A resposta do CEP já traz o código — vinha e era jogada fora.
//
// ⚠️ O CÓDIGO SÓ VALE SE FOR DAQUELE MUNICÍPIO. É por isso que este
// pedaço é maior do que "copiar mais um campo": um código guardado ao
// lado do nome de OUTRA cidade é pior que código nenhum — nome errado
// alguém lê e corrige, código errado passa direto e volta como glosa.
// Daí as duas metades:
//   1. só se grava quando o município que ficou no formulário é o mesmo
//      que o CEP respondeu (o que a recepção já tinha digitado manda);
//   2. mexeu no município ou na UF à mão depois, o código é apagado —
//      quem edita a cidade está dizendo que a de antes estava errada.
// ═══════════════════════════════════════════════════════════

/** Municípios brasileiros têm código de 7 dígitos (UF + 5). */
export const DIGITOS_DO_IBGE = 7;

const semAcento = v =>
  String(v ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Mesma cidade escrita de dois jeitos ainda é a mesma cidade. */
export const mesmoMunicipio = (a, b) => {
  const x = semAcento(a);
  return !!x && x === semAcento(b);
};

/** Só aceita o que tem cara de código de município. */
export const ibgeValido = v => /^[0-9]{7}$/.test(String(v ?? "").trim());

/**
 * Campos que, editados à mão, tornam o código guardado uma mentira.
 *
 * Não é zelo excessivo: é a diferença entre um dado que só sabe chegar e
 * um que também sabe ir embora quando deixa de ser verdade.
 */
export const CAMPOS_QUE_INVALIDAM_O_IBGE = ["end_municipio", "end_uf"];
export const invalidaOIbge = campo => CAMPOS_QUE_INVALIDAM_O_IBGE.includes(campo);

/**
 * Quantos campos a pessoa VÊ preenchidos.
 *
 * O código IBGE entra no formulário sem aparecer nele. Contá-lo faria a
 * mensagem prometer um campo a mais do que a recepcionista consegue achar
 * na tela — e ela ia procurar.
 */
export const CAMPOS_INVISIVEIS = ["end_municipio_ibge"];
export const contarPreenchidosVisiveis = novos =>
  Object.keys(novos || {}).filter(c => !CAMPOS_INVISIVEIS.includes(c)).length;
