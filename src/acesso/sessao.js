// Regras puras da sessão de acesso (sem rede, sem React) — testáveis.
//
// O app guarda o "crachá" do Supabase (access_token, validade ~1h) e um
// renovador (refresh_token, de vida longa). Estas funções decidem QUANDO
// renovar e se um erro do banco é "crachá vencido". A renovação em si (a
// chamada de rede) e a orquestração ficam no App.jsx; aqui mora só a decisão
// — que é onde está o risco de errar, e o que vale proteger com teste.
//
// Existe porque, antes disto, o access_token vencia em 1h e nunca era
// renovado: depois de uma tela aberta por mais de uma hora, TODA leitura do
// banco voltava 401 "JWT expired" e enchia a tela de alertas.

// Precisa renovar o crachá? Verdadeiro quando já passou — ou está a menos de
// `margemSeg` de passar — o instante de expiração. `expiresAtSeg` é unix em
// SEGUNDOS (formato do Supabase); `agoraMs` é Date.now() (milissegundos).
// Sem `expiresAtSeg` retorna false: sessão sem validade conhecida não dispara
// renovação proativa (a reativa, no 401, cobre esse caso).
export function precisaRenovar(expiresAtSeg, agoraMs = Date.now(), margemSeg = 120) {
  if (!expiresAtSeg || typeof expiresAtSeg !== "number") return false;
  return agoraMs / 1000 >= expiresAtSeg - margemSeg;
}

// Numa resposta 401, o corpo é problema de CRACHÁ (vale renovar) e não um
// defeito estrutural real?
//
// Um 401 do PostgREST é quase sempre crachá ausente/inválido/expirado —
// permissão vem como 403, e coluna/constraint como 400/409 com mensagem
// própria. Então o padrão aqui é SIM (inclui "JWT expired", token inválido,
// erro de assinatura e até 401 sem corpo). Só escapa quando o corpo nomeia
// claramente um defeito estrutural: aí renovar não adianta e o erro deve
// continuar gritando, em vez de virar um logout silencioso.
export function ehFalhaDeCracha(corpo) {
  if (corpo == null) return true;
  const t = String(corpo).trim();
  if (t === "") return true;
  const baixo = t.toLowerCase();
  if (/permission denied|does not exist|violates|duplicate key|foreign key/.test(baixo)) return false;
  return true;
}

// Deve tentar renovar o crachá para esta resposta? Só quando é 401, há um
// crachá de usuário (não a apikey anônima), ainda não tentamos nesta chamada
// (trava contra laço) e o corpo é falha de crachá. Isolar a decisão mantém o
// sbFetch enxuto e esta regra testável.
export function deveTentarRenovar(status, temTokenUsuario, jaTentou, corpo) {
  if (status !== 401) return false;
  if (!temTokenUsuario || jaTentou) return false;
  return ehFalhaDeCracha(corpo);
}
