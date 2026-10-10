// ═══════════════════════════════════════════════════════════
// CHEGADA NO PS — o paciente que o número digitado aponta é o do balcão?
//
// A chegada rápida do PS pede iniciais e prontuário. O número era
// conferido só quanto a EXISTIR, e as iniciais digitadas eram gravadas como
// vieram: um dígito trocado pendurava triagem e prescrição em outro paciente
// real. Iniciais + prontuário são dois identificadores — mas só se forem
// COMPARADOS. Regra pura, sem tela, para ser testada sozinha.
// ═══════════════════════════════════════════════════════════

// A normalização para COMPARAR iniciais mora em identidade.js, junto com
// quem as deriva: ela era local aqui, e o mapa cirúrgico nasceu precisando
// da mesma. Dois normalizadores com uma diferença (um tira acento, o outro
// não) fazem o mesmo par bater numa tela e não bater na outra.
import { chaveDasIniciais as soLetras, comoExibir } from "../pacientes/identidade.js";
import { fmtDataBR } from "../util/datas.js";

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
  // DUAS FONTES, e basta UMA bater.
  //
  // A coluna `iniciais` e o `nome_completo` divergem em acervo importado —
  // no banco de teste, T9032 tem nome "Maria Silva Ferreira" e iniciais
  // "Q.A." gravadas. Comparando só com a coluna, TODA chegada viraria
  // pergunta, e pergunta que aparece sempre é clicada sem ler: a confirmação
  // deixaria de proteger justamente o caso do número trocado.
  const derivadas = comoExibir(cadastro) || "";
  const a = soLetras(digitadas);
  const bate = [doCadastro, derivadas].map(soLetras).filter(Boolean);
  const quem = [
    comoExibir(cadastro, { completo: true }) || doCadastro,
    cadastro?.data_nascimento ? `nascido(a) em ${fmtDataBR(cadastro.data_nascimento)}` : null,
    cadastro?.nome_mae ? `mãe ${cadastro.nome_mae}` : null,
  ].filter(Boolean).join(" · ");
  if (a && bate.includes(a)) return { ok: true, iniciais: doCadastro, pergunta: null };
  const motivo = a
    ? `As iniciais digitadas (${String(digitadas).trim()}) não batem com as do prontuário ${cadastro?.prontuario} (${doCadastro}).`
    : `Só o número foi digitado.`;
  return {
    ok: false,
    iniciais: doCadastro,
    pergunta: `${motivo}\n\nO prontuário ${cadastro?.prontuario} é de:\n${quem}\n\nÉ esta a pessoa que está chegando? (OK = registrar a chegada dela; Cancelar = corrigir o número)`,
  };
}
