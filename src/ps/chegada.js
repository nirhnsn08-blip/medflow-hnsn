// ═══════════════════════════════════════════════════════════
// CHEGADA NO PS — o paciente que o número digitado aponta é o do balcão?
//
// A chegada rápida do PS pede iniciais e prontuário. O número era
// conferido só quanto a EXISTIR, e as iniciais digitadas eram gravadas como
// vieram: um dígito trocado pendurava triagem e prescrição em outro paciente
// real. Iniciais + prontuário são dois identificadores — mas só se forem
// COMPARADOS. Regra pura, sem tela, para ser testada sozinha.
// ═══════════════════════════════════════════════════════════

import { comoExibir } from "../pacientes/identidade.js";
import { fmtDataBR } from "../util/datas.js";

/** "M.S.F." / "msf" / "M S F" → "MSF". */
const soLetras = t => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

/**
 * Confere as iniciais digitadas contra o cadastro.
 *
 * Devolve `{ ok, iniciais, pergunta }`: `iniciais` é SEMPRE a do cadastro
 * (é a que vai para a fila); `pergunta` é o que a tela mostra quando não
 * batem — com nome, nascimento e mãe, para a recepção confirmar com a pessoa.
 *
 * Iniciais em branco não são divergência: quem digitou só o número quer o
 * cadastro inteiro, e é o cadastro que vai — mas a pessoa vê de quem é.
 */
export function conferirIniciaisDaChegada(digitadas, cadastro) {
  const doCadastro = String(cadastro?.iniciais ?? "").trim() || comoExibir(cadastro) || "";
  const a = soLetras(digitadas), b = soLetras(doCadastro);
  const quem = [
    comoExibir(cadastro, { completo: true }) || doCadastro,
    cadastro?.data_nascimento ? `nascido(a) em ${fmtDataBR(cadastro.data_nascimento)}` : null,
    cadastro?.nome_mae ? `mãe ${cadastro.nome_mae}` : null,
  ].filter(Boolean).join(" · ");
  if (a && b && a === b) return { ok: true, iniciais: doCadastro, pergunta: null };
  const motivo = a
    ? `As iniciais digitadas (${String(digitadas).trim()}) não batem com as do prontuário ${cadastro?.prontuario} (${doCadastro}).`
    : `Só o número foi digitado.`;
  return {
    ok: false,
    iniciais: doCadastro,
    pergunta: `${motivo}\n\nO prontuário ${cadastro?.prontuario} é de:\n${quem}\n\nÉ esta a pessoa que está chegando? (OK = registrar a chegada dela; Cancelar = corrigir o número)`,
  };
}
