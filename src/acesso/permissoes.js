// ═══════════════════════════════════════════════════════════
// RESOLUÇÃO DE PERMISSÃO — o que ESTA pessoa alcança
//
// Três camadas, nesta ordem:
//
//   1. PERFIL      — o pacote do cargo ("Enfermeiro"). Por REFERÊNCIA, não
//                    por cópia: corrigir o perfil corrige todo mundo que o
//                    usa. Cópia envelhece — em seis meses ninguém sabe mais
//                    quem tem o quê, e a matriz vira ficção.
//   2. EXCEÇÕES    — o desvio daquela pessoa ("esta técnica também cobre o
//                    PS"). Com motivo e autor registrados: exceção sem
//                    justificativa é como o acesso vira colcha de retalhos.
//   3. TRAVAS      — regras que nenhum perfil e nenhuma exceção derrubam.
//
// A referência tem um custo, e é honesto declará-lo: mexer num perfil mexe
// em todo mundo de uma vez. Por isso `quantosUsam()` existe — a tela avisa
// "isto afeta 12 pessoas" ANTES de salvar.
//
// Funções puras: recebem dado, devolvem decisão. Sem React, sem rede.
// É o que permite testar regra de acesso, que é justamente a que ninguém
// percebe quando afrouxa.
// ═══════════════════════════════════════════════════════════

import { NIVEIS, MODULOS, MODULO_POR_CHAVE } from "./modulos.js";

const nivelNum = n => NIVEIS[n] ?? 0;

/**
 * As permissões que valem para uma pessoa: perfil + exceções + travas.
 *
 * `perfil`   — { grants: { modulo: nivel } } ou null (sem perfil = sem nada)
 * `excecoes` — [{ modulo, nivel }] — sobrepõem o perfil, para MAIS ou para MENOS
 * `usuario`  — precisa do `role` para as travas de sistema
 */
export function permissoesEfetivas(usuario, perfil, excecoes = []) {
  const efetivo = {};

  // 1) o pacote do cargo
  for (const [modulo, nivel] of Object.entries(perfil?.grants || {})) {
    if (MODULO_POR_CHAVE[modulo]) efetivo[modulo] = nivel;
  }

  // 2) as exceções — podem AMPLIAR ou REDUZIR.
  // Reduzir importa tanto quanto ampliar: é como se suspende o acesso de
  // alguém em férias ou sob apuração sem ter que inventar um perfil novo.
  for (const e of (Array.isArray(excecoes) ? excecoes : [])) {
    if (e?.modulo && MODULO_POR_CHAVE[e.modulo] && e.nivel in NIVEIS) efetivo[e.modulo] = e.nivel;
  }

  // 3) travas que nada derruba
  for (const m of MODULOS) {
    // ANTI-TRANCAMENTO: adm_master sempre alcança Usuários e Perfis. Sem
    // isto, configurar um perfil errado tranca o administrador do lado de
    // fora e só se resolve pelo painel do Supabase.
    if (m.exigeMaster) {
      efetivo[m.chave] = usuario?.role === "adm_master" ? "escrita" : "nenhum";
    }
  }

  // `visualizador` nunca escreve, tenha o perfil que tiver. O papel de
  // sistema é o teto; o perfil não fura teto.
  if (usuario?.role === "visualizador") {
    for (const k of Object.keys(efetivo)) if (efetivo[k] === "escrita") efetivo[k] = "leitura";
  }

  return efetivo;
}

/** Pode abrir o módulo? */
export function podeVer(perms, modulo) {
  return nivelNum(perms?.[modulo]) >= NIVEIS.leitura;
}

/** Pode lançar dado no módulo? */
export function podeEditar(perms, modulo) {
  return nivelNum(perms?.[modulo]) >= NIVEIS.escrita;
}

/** Os módulos que aparecem no menu desta pessoa, na ordem do catálogo. */
export function modulosVisiveis(perms) {
  return MODULOS.filter(m => podeVer(perms, m.chave));
}

/**
 * Resumo para a tela de usuários: quantos módulos, e se alcança o clínico.
 * "Alcança prontuário" é o dado que o gestor pergunta primeiro — e é o que
 * a COFEN 754/2024 art. 6º manda separar do administrativo.
 */
export function resumoDeAcesso(perms) {
  const visiveis = modulosVisiveis(perms);
  const clinicos = visiveis.filter(m => m.clinico);
  return {
    modulos: visiveis.length,
    clinicos: clinicos.length,
    escrita: MODULOS.filter(m => podeEditar(perms, m.chave)).length,
    alcancaProntuario: podeVer(perms, "paciente"),
    lista: visiveis.map(m => m.chave),
  };
}

/**
 * Diferença entre o perfil e o que a pessoa realmente tem.
 * A tela mostra isso porque exceção esquecida é o começo do descontrole:
 * ninguém audita o que não vê.
 */
export function excecoesAplicadas(perfil, excecoes = []) {
  const base = perfil?.grants || {};
  return (Array.isArray(excecoes) ? excecoes : [])
    .filter(e => e?.modulo && MODULO_POR_CHAVE[e.modulo])
    .map(e => ({
      modulo: e.modulo,
      label: MODULO_POR_CHAVE[e.modulo].label,
      de: base[e.modulo] || "nenhum",
      para: e.nivel,
      ampliou: nivelNum(e.nivel) > nivelNum(base[e.modulo] || "nenhum"),
      motivo: e.motivo || null,
      concedido_por: e.concedido_por || null,
    }))
    .filter(e => e.de !== e.para);
}

/** Quantas pessoas um perfil afeta — a tela avisa antes de salvar. */
export function quantosUsam(perfilChave, usuarios = []) {
  return (Array.isArray(usuarios) ? usuarios : []).filter(u => u.perfil === perfilChave).length;
}

/**
 * Confere um perfil antes de salvar. Devolve os avisos — não bloqueia,
 * salvo o que trancaria alguém do lado de fora.
 *
 * A separação entre "impede" e "avisa" é a mesma do sumário de alta: o que
 * quebra o sistema trava; o que é escolha de gestão apenas aparece.
 */
export function conferirPerfil(perfil, { usuarios = [] } = {}) {
  const avisos = [];
  const add = (nivel, texto) => avisos.push({ nivel, texto });

  if (!perfil?.nome?.trim()) add("impede", "Dê um nome ao perfil — é como o gestor vai pedir.");

  const grants = perfil?.grants || {};
  const concedidos = Object.entries(grants).filter(([, n]) => nivelNum(n) > 0);
  if (!concedidos.length) add("impede", "O perfil não dá acesso a nada. Marque ao menos um módulo.");

  // Acesso a prontuário sem categoria clínica: possível e às vezes correto
  // (o diretor técnico administrativo, por exemplo), mas é a combinação que
  // mais merece um segundo olhar antes de virar rotina.
  const veProntuario = nivelNum(grants.paciente) > 0;
  if (veProntuario && (!perfil.categoria || perfil.categoria === "administrativo"))
    add("avisa", "Este perfil abre o prontuário para uma categoria administrativa. Confirme se é mesmo necessário — a COFEN 754/2024, art. 6º, manda separar informação clínica de administrativa.");

  if (nivelNum(grants.controlados) >= NIVEIS.escrita && perfil.categoria !== "farmaceutico")
    add("avisa", "Escrituração do livro de controlados fora do farmacêutico. A Portaria 344/98 atribui isso ao responsável técnico.");

  if (nivelNum(grants.auditoria) >= NIVEIS.escrita)
    add("avisa", "Este perfil administra a própria trilha de auditoria. Quem é auditado administrando a trilha enfraquece o valor probatório dela.");

  const emUso = quantosUsam(perfil?.chave, usuarios);
  if (emUso > 0)
    add("avisa", `${emUso} usuário(s) usam este perfil. A mudança vale para todos assim que for salva.`);

  return avisos;
}

/** Pode salvar? Só quando nada de nível "impede" restar. */
export function podeSalvarPerfil(avisos = []) {
  return !avisos.some(a => a.nivel === "impede");
}
