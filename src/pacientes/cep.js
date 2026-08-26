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
