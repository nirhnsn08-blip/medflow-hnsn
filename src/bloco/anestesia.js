// ═══════════════════════════════════════════════════════════
// A FICHA ANESTÉSICA — o segundo documento que a lei nomeia
//
// 🔴 `cc_cirurgias.tipo_anestesia` EXISTE NO BANCO DESDE O PRIMEIRO DIA E
// TEM ZERO USOS NA TELA. Coluna sem input: ninguém nunca pôde preenchê-la,
// e ninguém nunca percebeu, porque coluna vazia não dá erro.
//
// A CFM 1.638/2002 nomeia três documentos para o paciente operado:
// descrição cirúrgica (entregue), FICHA ANESTÉSICA (esta) e ficha de
// recuperação pós-anestésica (o Aldrete, em `./aldrete.js`).
//
// 🔴 POR QUE ISTO NÃO É BUROCRACIA. Os dois campos que mais importam aqui
// são os que mudam a conduta do PRÓXIMO ato anestésico do mesmo paciente:
//
//   • o ASA, que é o risco com que ele entrou;
//   • a VIA AÉREA, e sobretudo se foi DIFÍCIL — intubação difícil não
//     avisada é a emergência que mata na indução, e a única forma de o
//     próximo anestesista saber é estar escrito.
//
// Por isso `via_aerea_dificil` é campo próprio e não uma frase perdida nas
// intercorrências: frase não vira alerta, e alerta é o que esse dado tem
// de virar no Paciente 360.
//
// ⚠️ MESMO DESENHO DA DESCRIÇÃO CIRÚRGICA: append-only, correção é versão
// nova com motivo, e a vigente é a que ninguém corrigiu. Prontuário não se
// rasura — e quem lê precisa saber o que foi retificado.
// ═══════════════════════════════════════════════════════════

import { MOTIVO_MIN } from "./cirurgia-segura.js";
import { naoDeuParaLer } from "../util/leitura.js";

/**
 * As técnicas anestésicas. Domínio FECHADO, pela razão de sempre neste
 * módulo: é por ele que se olha a distribuição de técnica do serviço, e
 * "raqui", "raquianestesia" e "RAQUI" na mesma coluna acabam com qualquer
 * indicador.
 *
 * Mais de uma técnica no mesmo ato é COMUM (geral + peridural para
 * analgesia pós-operatória), então a ficha guarda uma LISTA, não um campo.
 */
export const TIPOS_ANESTESIA = Object.freeze([
  { chave: "geral",        label: "Geral" },
  { chave: "raquidiana",   label: "Raquidiana" },
  { chave: "peridural",    label: "Peridural" },
  { chave: "bloqueio",     label: "Bloqueio de plexo/periférico" },
  { chave: "sedacao",      label: "Sedação" },
  { chave: "local",        label: "Local (pelo cirurgião)" },
]);

export const TIPO_ANESTESIA_LABEL = Object.freeze(
  Object.fromEntries(TIPOS_ANESTESIA.map(t => [t.chave, t.label])));

/**
 * Classificação ASA (American Society of Anesthesiologists) — o estado
 * físico com que o paciente entra. É o preditor de risco mais usado do
 * mundo e cabe em uma letra.
 *
 * O sufixo "E" (emergência) é FLAG SEPARADA, não um sexto valor: um ASA II
 * operado de emergência continua sendo ASA II, e misturar as duas coisas
 * impediria comparar eletiva com urgência.
 */
export const ASA = Object.freeze([
  { chave: "I",   label: "ASA I — paciente hígido" },
  { chave: "II",  label: "ASA II — doença sistêmica leve" },
  { chave: "III", label: "ASA III — doença sistêmica grave" },
  { chave: "IV",  label: "ASA IV — doença sistêmica grave, ameaça constante à vida" },
  { chave: "V",   label: "ASA V — moribundo, não se espera sobrevida sem a cirurgia" },
  { chave: "VI",  label: "ASA VI — morte encefálica, doação de órgãos" },
]);

export const ASA_LABEL = Object.freeze(Object.fromEntries(ASA.map(a => [a.chave, a.label])));

/** O manejo da via aérea. */
export const VIAS_AEREAS = Object.freeze([
  { chave: "nenhuma",          label: "Nenhum dispositivo (bloqueio/local)" },
  { chave: "cateter_o2",       label: "Cateter nasal / máscara de O₂" },
  { chave: "mascara_laringea", label: "Máscara laríngea" },
  { chave: "intubacao",        label: "Intubação orotraqueal" },
  { chave: "nasotraqueal",     label: "Intubação nasotraqueal" },
  { chave: "traqueostomia",    label: "Traqueostomia" },
]);

export const VIA_AEREA_LABEL = Object.freeze(
  Object.fromEntries(VIAS_AEREAS.map(v => [v.chave, v.label])));

/** As vias em que a palavra "difícil" significa alguma coisa. */
const COM_DISPOSITIVO = new Set(["mascara_laringea", "intubacao", "nasotraqueal", "traqueostomia"]);

const txt = v => String(v ?? "").trim();

/**
 * A VIGENTE: a que ninguém corrigiu depois. Irmã de `versaoVigente` da
 * descrição cirúrgica, e com a mesma distinção de `null`.
 *
 * ⚠️ `null` = não deu para ler; `undefined` = leu e não há.
 */
export function fichaVigente(linhas) {
  if (naoDeuParaLer(linhas)) return null;
  if (!Array.isArray(linhas) || !linhas.length) return undefined;
  const corrigidas = new Set(linhas.map(l => l.corrige_id).filter(x => x != null).map(String));
  const vivas = linhas.filter(l => !corrigidas.has(String(l.id)));
  return vivas.sort((a, b) => (b.versao || 0) - (a.versao || 0))[0] || undefined;
}

/** Confere o formulário antes de mandar. */
export function conferirFicha({ cirurgia, form = {}, corrigindo = null } = {}) {
  const erros = [], avisos = [];
  const tecnicas = Array.isArray(form.tecnicas) ? form.tecnicas.filter(Boolean) : [];

  if (!cirurgia) erros.push("Sem cirurgia selecionada.");
  else if (cirurgia.status === "cancelada")
    erros.push("Esta cirurgia está CANCELADA. Não há ato anestésico a registrar.");

  if (!tecnicas.length)
    erros.push("Diga qual técnica anestésica foi usada — é o campo que o próximo anestesista procura primeiro.");
  const invalida = tecnicas.find(t => !TIPO_ANESTESIA_LABEL[t]);
  if (invalida) erros.push(`Técnica desconhecida: ${invalida}.`);

  if (!txt(form.asa))
    erros.push("Informe o ASA. É o risco com que o paciente entrou, e é uma letra.");
  else if (!ASA_LABEL[txt(form.asa)])
    erros.push(`ASA desconhecido: ${txt(form.asa)}.`);

  if (txt(form.via_aerea) && !VIA_AEREA_LABEL[txt(form.via_aerea)])
    erros.push(`Via aérea desconhecida: ${txt(form.via_aerea)}.`);

  // 🔴 "Via aérea difícil" sem descrever COMO foi resolvida é a pior
  // combinação possível: o próximo anestesista fica sabendo que vai ser
  // difícil e não sabe o que funcionou.
  if (form.via_aerea_dificil && txt(form.via_aerea_manejo).length < MOTIVO_MIN) {
    erros.push(`Via aérea DIFÍCIL exige descrever o manejo (mínimo ${MOTIVO_MIN} caracteres): `
      + "o que falhou, o que funcionou, quantas tentativas. É o que salva o próximo ato anestésico.");
  }

  if (corrigindo && txt(form.motivo_correcao).length < MOTIVO_MIN)
    erros.push(`Correção exige o motivo (mínimo ${MOTIVO_MIN} caracteres): o que estava errado na versão anterior.`);

  // ── avisos ──────────────────────────────────────────────
  if (form.via_aerea_dificil)
    avisos.push("Via aérea difícil fica marcada no Paciente 360 como alerta permanente — é dado que precede qualquer anestesia futura deste paciente.");

  if (tecnicas.includes("geral") && !COM_DISPOSITIVO.has(txt(form.via_aerea)))
    avisos.push("Anestesia geral sem dispositivo de via aérea registrado. Confira: é o campo que o próximo anestesista lê antes de induzir.");

  if (["IV", "V"].includes(txt(form.asa)))
    avisos.push(`${ASA_LABEL[txt(form.asa)]} — confira se o caso tem registro de discussão de risco e consentimento específico.`);

  if (txt(form.jejum_horas) && Number(form.jejum_horas) < 6 && !txt(form.intercorrencias))
    avisos.push("Jejum abaixo de 6h registrado. Se foi caso de urgência ou houve conduta específica (sequência rápida), vale descrever.");

  return { ok: !erros.length, erros, avisos };
}

/** A linha para gravar. `versao` é do gatilho, nunca da tela. */
export function linhaDaFicha({ cirurgia, form = {}, corrigindo = null, assinatura = null } = {}) {
  const num = v => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    cirurgia_id: cirurgia?.id ?? null,
    corrige_id: corrigindo?.id ?? null,
    motivo_correcao: corrigindo ? (txt(form.motivo_correcao) || null) : null,
    tecnicas: (Array.isArray(form.tecnicas) ? form.tecnicas.filter(t => TIPO_ANESTESIA_LABEL[t]) : []),
    asa: txt(form.asa) || null,
    asa_emergencia: !!form.asa_emergencia,
    via_aerea: txt(form.via_aerea) || null,
    via_aerea_dificil: !!form.via_aerea_dificil,
    // Só descreve manejo quem marcou difícil — texto solto sem a marca
    // viraria um campo que ninguém procura.
    via_aerea_manejo: form.via_aerea_dificil ? (txt(form.via_aerea_manejo) || null) : null,
    jejum_horas: num(form.jejum_horas),
    intercorrencias: txt(form.intercorrencias) || null,
    assinatura: txt(assinatura) || null,
  };
}

/** Uma frase da ficha, para o cartão e para o Paciente 360. */
export function resumoDaFicha(f) {
  if (!f) return null;
  const tec = (Array.isArray(f.tecnicas) ? f.tecnicas : [])
    .map(t => TIPO_ANESTESIA_LABEL[t] || t).join(" + ");
  return [
    tec || "técnica não informada",
    f.asa ? `ASA ${f.asa}${f.asa_emergencia ? "E" : ""}` : null,
    f.via_aerea ? VIA_AEREA_LABEL[f.via_aerea] || f.via_aerea : null,
    f.via_aerea_dificil ? "VIA AÉREA DIFÍCIL" : null,
  ].filter(Boolean).join(" · ");
}

/**
 * 🔴 O ALERTA QUE ATRAVESSA ATENDIMENTOS.
 *
 * Via aérea difícil registrada em QUALQUER anestesia anterior deste
 * paciente precede toda anestesia futura dele — não é informação do
 * episódio, é informação da pessoa. Devolve a ficha mais recente que a
 * registrou, ou `null`.
 */
export function viaAereaDificilPregressa(fichas = []) {
  if (!Array.isArray(fichas)) return null;
  const comDificuldade = fichas.filter(f => f?.via_aerea_dificil);
  if (!comDificuldade.length) return null;
  return comDificuldade.sort((a, b) =>
    new Date(b.criado_em || 0) - new Date(a.criado_em || 0))[0];
}
