import { useState, useEffect, useCallback, Fragment, Component, lazy, Suspense } from "react";


// Motor de alertas da farmácia clínica — dose máxima, interação, alergia,
// Beers, sonda, ajuste renal/hepático. Vive fora do App.jsx por ser o código
// mais crítico do sistema: lá ele é testável (src/clinico/alertas.test.js).


// Alergia como atributo do paciente (fonte única pep_alergias, com o campo
// legado do atendimento fundido durante a transição).

// Prontuário do paciente internado — em arquivo próprio para o módulo
// evoluir sem disputar espaço neste arquivo, que já tem 14 mil linhas.
// 🔴 A LIGAÇÃO QUE FALTAVA: ocupar o leito não abria o prontuário da
// internação, e sem episódio TUDO que se registra sobre o internado ficava
// vazio por construção. Ver prontuario/internacao.js.


// 🔴 pep_alergias era lida em 4 lugares — inclusive na pulseira — e escrita
// em nenhum. A tela MANDAVA registrar e não oferecia caminho.


// Categorias profissionais — usadas na tela que classifica a equipe.

import { permissoesEfetivas, podeVer } from "./acesso/permissoes.js";
import { GRUPOS } from "./acesso/modulos.js";
import { VX, HOSPITAL_NOME, HOSPITAL_SIGLA, Icon, VxWordmark } from "./ui/base.jsx";
import { ehErroDeChunk, TEXTO_CHUNK } from "./ui/erro-de-chunk.js";
const UsersPage = lazy(() => import("./acesso/Usuarios.jsx"));
const BlocoPage = lazy(() => import("./bloco/BlocoPage.jsx"));
const ScihPage = lazy(() => import("./scih/ScihPage.jsx"));
const PacientePage = lazy(() => import("./pacientes/Paciente360.jsx"));
const ProtocolosPage = lazy(() => import("./protocolos/ProtocolosPage.jsx"));
import {  loadDB, saveDB, loadFromSupabase } from "./painel/dados.js";

import { AlertBanner, Overview, EspecialidadePage, PrintDashboard, ImportPage } from "./painel/Painel.jsx";
import { ROLES } from "./acesso/papeis-sistema.js";


const SuprimentosPage = lazy(() => import("./suprimentos/SuprimentosPage.jsx"));


// A prescrição só fica "pronta para retirada" se saiu do estoque — ver o
// cabeçalho de preparo.js para o caminho que era válido e não deixava rastro.


// Lote vencido não vai para paciente — mas SAI por descarte, senão fica
// preso na prateleira. Ver o cabeçalho de validade.js.


const TrilhaAuditoria = lazy(() => import("./auditoria/Trilha.jsx"));


// Renovação da sessão (crachá JWT) — decisão pura testável; a rede fica aqui.
import { precisaRenovar, deveTentarRenovar, exigeCracha } from "./acesso/sessao.js";
// Triagem pediátrica — sugestão de Manchester por faixa de idade (Fase 3).

// Triagem obstétrica — sugestão por discriminadores + PA (pré-eclâmpsia).

// Mapa de risco de enfermagem por leito (Tier 1 Fase 1a).


const FarmaciaPage = lazy(() => import("./farmacia/FarmaciaPage.jsx"));
const PSPage = lazy(() => import("./ps/PsPage.jsx"));


const LeitosPage = lazy(() => import("./leitos/GiroDeLeitos.jsx"));

// ✅ Agora É lazy. `NotificacaoRapida` saiu para arquivo próprio em
// 03/09/2026, e com isso o último dos doze módulos passou a carregar sob
// demanda. Antes, o botão de notificar em 30s — que existe em TODA tela —
// obrigava o módulo NSP inteiro a entrar no primeiro carregamento.
const NSPPage = lazy(() => import("./clinico/SegurancaPaciente.jsx"));
// ⚠️ Este SIM é import direto, e tem de ser: o botão é parte do casco,
// aparece antes de qualquer módulo e não pode esperar um `Suspense`.
import { NotificacaoRapida } from "./clinico/NotificacaoRapida.jsx";

// Protocolos clínicos gerenciados (Tier 1 Fase 3a) — gatilho/bundle/relógio/KPIs puros.


// Utilitários puros extraídos deste arquivo — data/hora e número/moeda.
// São as funções mais reutilizadas do sistema (nowISO, fmtDur, fmtReais,
// diffMin); ficam testadas em src/util/*.test.js. `todayStr` mora aqui
// porque é onde o projeto já teve o bug de fuso mais caro.
import {
   nowISO, diffMin, fmtDur,
} from "./util/datas.js";

// Previsão de alta e sinaleira de permanência do Giro de Leitos (puras).
import {  corEsperaFila } from "./clinico/leitos.js";


// Identificação do paciente: conteúdo mínimo da CFM 1.638/2002, validação
// de CPF/CNS e idade EXATA. A idade por subtração de anos errava até 11
// meses — o que trocava a faixa de referência na triagem pediátrica.

const Atendimento = lazy(() => import("./atendimento/Atendimento.jsx"));
const FaturamentoPage = lazy(() => import("./atendimento/FaturamentoSus.jsx"));
import { ESPECIALIDADES } from "./ambulatorio/especialidades.js";


// "Atendimento aberto" mora em ciclo.js. Antes o conceito estava repetido
// como `status !== "finalizado"` em três pontos daqui — e o status
// 'cancelado', criado depois, vazaria por todos eles: o Paciente 360
// passaria a dizer "está no PS agora (cancelado)".


// ═══════════════════════════════════════════════════════════
// SUPABASE CONFIG — substitua pelas suas credenciais
// ═══════════════════════════════════════════════════════════
const SUPABASE_URL = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_URL || window.SUPABASE_URL || "") : "";
const SUPABASE_KEY = typeof window !== "undefined" ? (import.meta.env?.VITE_SUPABASE_KEY || window.SUPABASE_KEY || "") : "";
const USE_SUPABASE = SUPABASE_URL.length > 10 && SUPABASE_KEY.length > 10;

// O que os módulos extraídos recebem no lugar da dupla `sbFetch` +
// `USE_SUPABASE`: a função de rede quando o Supabase está ligado, `null`
// quando não. Assim o módulo pergunta `if (!sb)` e não importa flag global
// nenhuma — o `sbFetch` fica aqui com a máquina de sessão que ele usa.
const SB = () => (USE_SUPABASE ? sbFetch : null);

/**
 * O poste CRU: grava e devolve `{ ok, erro }` em vez de engolir a falha.
 *
 * 🔴 Existe por causa das QUATRO escritas que precisam do motivo: o
 * movimento de estoque da Farmácia, o desfecho do Pronto-Socorro, e no
 * Almoxarifado o movimento de estoque e a exclusão de item.
 * O `sbFetch` devolve `null` em qualquer erro e manda o detalhe para o
 * aviso global — o que serve para as outras 130 chamadas, que não têm o que
 * fazer com a mensagem. Não serve para dispensar medicamento: a recusa vem
 * de um GATILHO do banco ("saldo insuficiente", "lote vencido") e quem está
 * na bancada precisa LER o motivo.
 *
 * Fica aqui, e não no módulo da Farmácia, porque é aqui que moram a URL, a
 * chave e o token. O módulo recebe esta função e não sabe o que é credencial.
 *
 * ⚠️ Não passa pela renovação de sessão do `sbFetch`: token vencido aqui
 * falha em vez de renovar. Era assim antes da extração — está anotado para
 * não parecer decisão nova.
 */
async function escreverCru(caminho, corpo, { method = "POST" } = {}) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
      method,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      // DELETE não leva corpo; mandar `undefined` faria o fetch enviar a
      // string "undefined" e o PostgREST recusar por JSON inválido.
      ...(corpo == null ? {} : { body: JSON.stringify(corpo) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return { ok: false, erro: body?.message || `Erro ${res.status}` };
    }
    // `row` para quem precisa da linha gravada (o PATCH direto do PS usa);
    // quem só quer saber se deu certo ignora e continua lendo `ok`.
    const rows = await res.json().catch(() => null);
    return { ok: true, row: Array.isArray(rows) ? rows[0] : null };
  } catch (e) {
    return { ok: false, erro: String(e?.message || e) };
  }
}
const SB_CRU = () => (USE_SUPABASE ? escreverCru : null);

// Identidade do hospital — permite usar o MESMO app para vários hospitais,
// cada um com seu próprio banco (VITE_SUPABASE_*) e seu nome (VITE_HOSPITAL_*).
// Rótulo do ambiente. VAZIO = produção (nenhum aviso na tela, para não
// poluir o sistema de quem trabalha no hospital). Preenchido = mostra a
// faixa de alerta no topo.
//
// Existe porque a origem do erro mais caro daqui é sempre a mesma: duas
// telas idênticas, bancos diferentes, e nada avisando qual é qual. Já
// mandou dado de teste para a produção uma vez.
const AMBIENTE = import.meta.env?.VITE_AMBIENTE || "";
// Referência do projeto Supabase (o "ufxqdv..." da URL). Mostrada na faixa
// para não depender só do rótulo: se o .env estiver errado, o número exposto
// denuncia na hora em qual banco você realmente está.
const SUPABASE_REF = (SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase/) || [])[1] || "?";

// ═══════════════════════════════════════════════════════════
// FALHAS DE BANCO — nunca silenciosas
// ═══════════════════════════════════════════════════════════
// Antes, QUALQUER erro do Supabase virava `return null`: banco fora do ar,
// coluna faltando e RLS bloqueando ficavam indistinguíveis, e a tela só
// aparecia vazia. Numa GRAVAÇÃO isso é pior ainda — o usuário sai achando
// que salvou. Agora toda falha vai para o console com tabela e motivo, e as
// que enganam o usuário aparecem na tela.
//
// O retorno continua sendo `null` em caso de falha: as 122 chamadas
// existentes seguem funcionando sem alteração nenhuma.
const ouvintesFalhaSb = new Set();
const assinarFalhasSb = fn => { ouvintesFalhaSb.add(fn); return () => ouvintesFalhaSb.delete(fn); };

function registrarFalhaSb({ alvo, metodo, status, detalhe }) {
  console.error(`[Supabase] ${metodo} ${alvo} → ${status || "sem resposta"}${detalhe ? ` — ${detalhe}` : ""}`);
  // Escrita SEMPRE avisa: o dano é o usuário acreditar que gravou.
  // Leitura avisa só em 400/401/403/404 — erro de estrutura ou permissão,
  // que é defeito de verdade. Queda de rede em leitura fica só no console,
  // senão o modo offline (que é previsto no app) viraria uma metralhadora
  // de alertas.
  const escrita = metodo !== "GET";
  const estrutural = [400, 401, 403, 404, 409, 500].includes(status);
  if (!escrita && !estrutural) return;
  // Migração ainda não aplicada: previsto, não é defeito. Ver TABELAS_OPCIONAIS.
  if (status === 404 && TABELAS_OPCIONAIS.has(alvo)) return;
  // Mesma ideia, um nível abaixo: COLUNA que só passa a existir depois da
  // migração. Aqui a tabela existe, então o PostgREST devolve 400 e não 404.
  // Quem faz a leitura já sabe recuar sozinho (ver `buscarPacientes`), então
  // a tela NÃO fica sem dado — mas sem esta linha a recepcionista levaria um
  // alerta vermelho a CADA busca durante todo o intervalo entre o deploy e o
  // SQL rodado. Alerta que aparece quando não há nada de errado é o que
  // ensina a equipe a fechar alerta sem ler, e aí o próximo, que é de
  // verdade, passa junto.
  if (status === 400 && !escrita
      && [...COLUNAS_OPCIONAIS].some(c => String(detalhe).includes(`.${c} does not exist`))) return;
  const falha = { alvo, metodo, status, detalhe, escrita, em: Date.now() };
  ouvintesFalhaSb.forEach(fn => { try { fn(falha); } catch {} });
}

// Tabelas cuja AUSÊNCIA é esperada enquanto a migração correspondente não
// for aplicada. O código sempre roda na Vercel antes de alguém abrir o
// painel do Supabase — é a ordem inevitável, já que a migração é manual.
//
// Sem esta lista, o intervalo entre o merge e o SQL rodado enche a tela de
// TODO MUNDO com um alerta vermelho sobre uma tabela que ninguém ainda
// deveria ter. Alerta que aparece quando não há nada de errado é o que
// ensina a equipe a fechar alerta sem ler — e aí o próximo, que é de
// verdade, também passa batido.
//
// A falha continua indo para o console. É só o alarme na tela que se cala,
// e só para 404 (tabela inexistente) — 401/403 continuam gritando, porque
// aí é permissão, não migração pendente.
const TABELAS_OPCIONAIS = new Set(["perfis_acesso", "perfis_permissoes", "usuarios_permissoes", "ps_faixas_pediatricas", "ps_faixas_obstetricas",
  "nsp_meta_faixas", "nsp_meta_medicoes", "nsp_protocolos", "nsp_capacitacoes", "nsp_comunicados",
  "prot_catalogo", "prot_setor", "prot_ativacoes", "prot_bundle_itens",
  "sigtap_procedimentos"]);

// Colunas cuja ausência é esperada até a migração correspondente rodar. Só
// entra aqui coluna com RECUO PRONTO no código que a lê — senão o alarme
// estaria escondendo uma tela que de fato não funciona, que é o oposto do
// motivo desta lista existir.
//
//   • nome_busca (migracao-pacientes-busca.sql) — `buscarPacientes` cai
//     sozinha na busca antiga enquanto ela não existe.
//
// Ao rodar a migração nos DOIS bancos, a linha correspondente pode sair.
const COLUNAS_OPCIONAIS = new Set(["nome_busca"]);

async function sbFetch(path, opts = {}, _jaRenovou = false) {
  if (!USE_SUPABASE) return null;
  const metodo = opts.method || "GET";
  const alvo = String(path).split("?")[0];      // nome da tabela, sem os filtros
  const tinhaToken = !!AUTH_TOKEN;              // chamada feita como usuário logado?

  // GRAVAÇÃO SEM CRACHÁ NÃO SAI. Ver `exigeCracha` (acesso/sessao.js): toda
  // política de escrita exige `my_role()`, nulo para o anônimo — então a
  // chamada só pode falhar, e falha MENTINDO ("violates row-level security
  // policy" quando o problema é sessão).
  //
  // Antes de desistir, tenta renovar: o `refresh_token` pode estar vivo no
  // localStorage mesmo com o `AUTH_TOKEN` ainda nulo em memória (é a corrida
  // que acontece no carregamento da página). Aí a gravação segue normal, com
  // o crachá novo.
  if (exigeCracha(metodo) && !tinhaToken) {
    if (!_jaRenovou && await renovarSessao()) return sbFetch(path, opts, true);
    registrarFalhaSb({
      alvo, metodo, status: 401,
      detalhe: "Sessão não está ativa — a gravação NÃO foi enviada. Entre de novo antes de refazer o registro.",
    });
    avisarSessaoExpirada();
    return null;
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...opts,
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${AUTH_TOKEN || SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Prefer": opts.method === "POST" ? "return=representation" : undefined,
        ...opts.headers,
      },
    });
    if (!res.ok) {
      // O PostgREST devolve o motivo em JSON (message/hint/details). É essa
      // mensagem que diz "column X does not exist", "permission denied" ou
      // "JWT expired".
      let corpo = "";
      try { corpo = await res.text(); } catch {}
      // Crachá vencido: renova uma vez e repete a chamada, transparente. Se o
      // refresh também morreu, um aviso limpo e de volta ao login — nunca mais
      // a enxurrada de um erro por tabela.
      if (deveTentarRenovar(res.status, tinhaToken, _jaRenovou, corpo)) {
        if (await renovarSessao()) return sbFetch(path, opts, true);
        avisarSessaoExpirada();
        return null;
      }
      let detalhe = "";
      try {
        const j = JSON.parse(corpo);
        detalhe = [j.message, j.details, j.hint].filter(Boolean).join(" — ");
      } catch { detalhe = corpo.slice(0, 200); }
      registrarFalhaSb({ alvo, metodo, status: res.status, detalhe });
      return null;
    }
    return res.json().catch(() => null);
  } catch (e) {
    // Sem isto, queda de rede rejeitava a promise e estourava no chamador —
    // a maioria das 122 não tem try/catch.
    registrarFalhaSb({ alvo, metodo, status: 0, detalhe: e?.message || "sem conexão" });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
// DADOS MESTRES
// ═══════════════════════════════════════════════════════════
// A lista saiu daqui para `src/ambulatorio/especialidades.js` quando ganhou
// um segundo leitor: a conciliação da agenda, que precisa saber para qual
// chave gravar a produção apurada. Duas cópias fariam uma ganhar
// especialidade nova e a outra não — e o número gravado sumiria numa chave
// que nenhuma tela lê.
const SPECS = ESPECIALIDADES;
// ═══════════════════════════════════════════════════════════
// MARCA VALENTRAX — Healthcare Operations
// Símbolo: hub radial de correntes curvas convergindo no núcleo
// (setores do hospital conectados ao centro analítico).
// ═══════════════════════════════════════════════════════════
function VxLogo({ size = 30 }) {
  const ray = (rot, cor, w, r, op = 1) => (
    <g key={rot} transform={`rotate(${rot} 36 36)`} opacity={op}>
      <path d="M45 35.4 C 51 34.6, 55.5 32.6, 59 29.6" stroke={cor} strokeWidth={w} fill="none" strokeLinecap="round" />
      <circle cx="60.6" cy="28.2" r={r} fill={cor} />
    </g>
  );
  return (
    <svg viewBox="0 0 72 72" width={size} height={size} aria-hidden="true" style={{ flexShrink: 0 }}>
      {[0, 90, 180, 270].map(a => ray(a, VX.turquesa, 3.2, 2.8))}
      {[45, 225].map(a => ray(a, VX.azul, 2.5, 2.2))}
      {[135, 315].map(a => ray(a, VX.prata, 2.5, 2.2, 0.85))}
      <circle cx="36" cy="36" r="12.5" fill="none" stroke={VX.turquesa} strokeWidth="1" opacity=".25" />
      <circle cx="36" cy="36" r="8.2" fill={VX.turquesa} />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// STORAGE — localStorage + Supabase fallback
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// AUDITORIA
// ═══════════════════════════════════════════════════════════
// A trilha mudou-se para src/auditoria/dados.js, junto da leitura. Fica
// ⚠️ O adaptador `addAuditLog` foi REMOVIDO em 01/09/2026: os 107 pontos de
// chamada que o comentário antigo citava saíram todos na extração, e cada
// módulo agora importa `registrarAuditoria` direto, com o `sb` que recebe.

// ═══════════════════════════════════════════════════════════
// AGGREGATE
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════
const SESSION_KEY = "hnsn_auth_v2";   // { access_token, refresh_token, user }
const AUTH_DOMAIN = "@hnsn.local";    // "laura" -> laura@hnsn.local (o Supabase Auth exige formato de e-mail)

// Token JWT do usuário logado — enviado nas chamadas ao banco (ver sbFetch).
let AUTH_TOKEN = null;

const loadSession = () => {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    AUTH_TOKEN = s?.access_token || null;
    return s?.user || null;
  } catch { return null; }
};
const saveSession = s => { AUTH_TOKEN = s?.access_token || null; localStorage.setItem(SESSION_KEY, JSON.stringify(s)); };
const clearSession = () => { AUTH_TOKEN = null; localStorage.removeItem(SESSION_KEY); };

// ── Renovação automática do crachá (JWT) ────────────────────────────────
// O access_token do Supabase vive ~1h. Sem renovar, depois de 1h de tela
// aberta TODA chamada volta 401 "JWT expired". Aqui o crachá é renovado
// sozinho, usando o refresh_token (de vida longa) que já fica na sessão.

// Quem quer saber que a sessão morreu DE VEZ (refresh também expirado) se
// inscreve aqui — o App usa isto para voltar ao login com UM aviso, no lugar
// da enxurrada de erros por tabela. Mesmo padrão de `ouvintesFalhaSb`.
const ouvintesSessao = new Set();
const assinarSessaoExpirada = fn => { ouvintesSessao.add(fn); return () => ouvintesSessao.delete(fn); };
let sessaoJaAvisada = false;
function avisarSessaoExpirada() {
  clearSession();
  if (sessaoJaAvisada) return;            // um aviso só, não um por tabela
  sessaoJaAvisada = true;
  ouvintesSessao.forEach(fn => { try { fn(); } catch {} });
}

const lerSessao = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; } };

// Single-flight: várias tabelas carregando juntas disparam só UMA renovação;
// todas aguardam a mesma promessa e depois repetem com o crachá novo.
let promessaRenovacao = null;
async function renovarSessao() {
  if (!USE_SUPABASE) return false;
  if (promessaRenovacao) return promessaRenovacao;
  promessaRenovacao = (async () => {
    const atual = lerSessao();
    const refresh = atual?.refresh_token;
    if (!refresh) return false;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) return false;                       // refresh também expirou/invalidado
      const auth = await res.json().catch(() => null);
      if (!auth?.access_token) return false;
      saveSession({
        access_token: auth.access_token,
        refresh_token: auth.refresh_token || refresh,  // pode vir rotacionado
        expires_at: auth.expires_at || Math.floor(Date.now() / 1000) + (auth.expires_in || 3600),
        user: atual?.user || null,
      });
      sessaoJaAvisada = false;                         // sessão viva de novo
      return true;
    } catch { return false; }
  })();
  try { return await promessaRenovacao; }
  finally { promessaRenovacao = null; }
}

// Login REAL via Supabase Auth. Retorna { ok, user } ou { ok:false, error }.
async function signIn(username, password) {
  if (!USE_SUPABASE) return { ok: false, error: "Login indisponível (banco não configurado)." };
  const email = username.trim().toLowerCase() + AUTH_DOMAIN;
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch { return { ok: false, error: "Sem conexão com o servidor." }; }
  if (!res.ok) return { ok: false, error: "Usuário ou senha incorretos." };
  const auth = await res.json();
  AUTH_TOKEN = auth.access_token;
  let profile = null;
  try {
    // `categoria` e o registro do conselho vêm junto: sem eles, todo
    // usuário seria tratado como administrativo e nenhum ato clínico
    // passaria. `select=*` para não repetir este esquecimento a cada
    // coluna nova no perfil.
    const p = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${auth.user.id}&select=*`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${auth.access_token}` },
    });
    if (p.ok) profile = (await p.json())[0];
  } catch {}
  const user = {
    id: auth.user.id,
    name: profile?.nome || username,
    username: profile?.username || username.trim().toLowerCase(),
    role: profile?.role || "visualizador",
    // Eixo clínico, separado do papel de acesso. Ausente = administrativo,
    // que não pratica ato clínico (nega por omissão).
    categoria: profile?.categoria || "administrativo",
    conselho: profile?.conselho || null,
    registro_conselho: profile?.registro_conselho || null,
    uf_conselho: profile?.uf_conselho || null,
  };
  saveSession({
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expires_at: auth.expires_at || Math.floor(Date.now() / 1000) + (auth.expires_in || 3600),
    user,
  });
  sessaoJaAvisada = false;                    // login novo zera o aviso de expiração
  return { ok: true, user };
}

// Troca a senha do próprio usuário logado (Supabase Auth).
async function changeMyPassword(newPassword) {
  if (!AUTH_TOKEN) return { ok: false, error: "Sessão expirada. Entre novamente." };
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: "PUT",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); return { ok: false, error: e.msg || e.error_description || "Não foi possível trocar a senha." }; }
    return { ok: true };
  } catch { return { ok: false, error: "Sem conexão." }; }
}


// Administração de usuários (só adm_master). Chama a Edge Function protegida
// que roda no servidor com a service_role — o navegador nunca vê a chave admin.
// Ações: "list" | "create" | "update" | "reset_senha" | "set_ativo".
async function adminUsuarios(action, payload = {}) {
  if (!USE_SUPABASE) return { error: "banco não configurado" };
  if (!AUTH_TOKEN) return { error: "sessão expirada — entre novamente" };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-usuarios`, {
      method: "POST",
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${AUTH_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data.error || `erro ${res.status} (a Edge Function foi publicada?)` };
    return data;
  } catch { return { error: "sem conexão com o servidor" }; }
}


// ═══════════════════════════════════════════════════════════
// ALERTAS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// HELPERS VISUAIS
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// BANNER DE ALERTAS (topo do app)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ESPECIALIDADE PAGE
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// VISÃO GERAL
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// SETORES + SOLICITAÇÕES (monitoramento de leitos)
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// PRINT DASHBOARD
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// AUDITORIA PAGE
// ═══════════════════════════════════════════════════════════
// A tela antiga lia o `localStorage` (200 registros, do navegador de quem
// olhava) enquanto anunciava "histórico de todas as alterações da
// plataforma". Substituída por `src/auditoria/Trilha.jsx`, que lê a trilha
// institucional do banco. `addAuditLog` segue gravando nos dois lugares: o
// registro local ainda guarda o detalhe da ação, que por decisão de LGPD
// não é enviado ao servidor.

// ═══════════════════════════════════════════════════════════
// IMPORTAR
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// SCIH — Serviço de Controle de Infecção Hospitalar (Fase A)
// ═══════════════════════════════════════════════════════════

// `sugerirGerme` mora em `src/clinico/germes.js` — lá é testável, e a
// comparação passou a tirar acento (aqui usava só `toLowerCase`, e
// "Virus sincicial respiratorio" não achava "Vírus sincicial
// respiratório", que é como o seed grava).

// ═══════════════════════════════════════════════════════════
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex FEFO)
// ═══════════════════════════════════════════════════════════
// Classes terapêuticas (ordem de exibição no agrupamento)

// Situação de validade de um lote em relação a hoje


// A farmácia clínica (normTxt, alergias, analisarPrescricaoClinica, scores)
// foi extraída para ./clinico/alertas.js — funções puras, com testes.

// ═══════════════════════════════════════════════════════════
// SUPRIMENTOS (Estoque & Compras) — Fase A: catálogo de materiais + estoque
// por lote/validade (kardex imutável) + fornecedores. Mesmo modelo da Farmácia.
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — triagem Manchester + jornada do paciente
// ═══════════════════════════════════════════════════════════
// Conteúdo didático do protocolo adaptado — discriminadores e sinais por nível.
// Base: Manchester Triage Group + faixas usadas pelo apoio à decisão do sistema.
// Material de referência/treinamento — a classificação final é sempre da triadora.
// Discriminadores gerais do Manchester — atravessam todos os fluxogramas de queixa


// Saídas (dispensações) já registradas para calcular o quanto de cada item foi entregue
// Prioridade de ordenação da fila (menor = mais urgente)

// Linha compacta dos sinais vitais registrados (fila e Paciente 360)


// ═══════════════════════════════════════════════════════════
// PACIENTE 360 — registro clínico integrado (timeline + evoluções)
// ═══════════════════════════════════════════════════════════
/**
 * Busca de paciente por nome, iniciais, CPF ou Cartão SUS.
 *
 * Antes procurava só nas iniciais — que era tudo o que existia. Com o nome
 * no cadastro, procurar por "J.S.M." deixou de ser o jeito natural: quem
 * está no balcão tem o nome ou o documento na mão, não as iniciais.
 * O número puro continua sendo tratado como prontuário por quem chama.
 */


// ═══════════════════════════════════════════════════════════
// BLOCO CIRÚRGICO — agenda, mapa, workflow do dia e indicadores
// ═══════════════════════════════════════════════════════════


// ── Página Pronto-Socorro: chegada → triagem → atendimento → desfecho ──
// ═══════════════════════════════════════════════════════════
// PRONTO-SOCORRO — Relatório mensal (SOMENTE LEITURA)
// Mesmo padrão do SCIH: visão imprimível + window.print() nativo.
// Sem biblioteca de PDF e sem envio de dado clínico para fora do navegador.
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// FARMÁCIA — Fase A: catálogo + estoque (lote/validade, kardex)
// ═══════════════════════════════════════════════════════════

/**
 * ⚠️ `podeControlados` NÃO É SELO NO DADO — é controle de quem lê o LIVRO.
 *
 * O Livro de Controlados é uma VISTA de `farm_movimentos` filtrada pelos
 * medicamentos com `controlado = true`. E `farm_movimentos` é legitimamente
 * da farmácia: é o kardex, a dispensação, o estorno. Tirar `farmacia` da
 * política de leitura dessa tabela quebraria o módulo inteiro.
 *
 * Então o que esta permissão restringe é quem PRODUZ E LÊ o documento
 * fiscalizável — que é o controle interno que a Portaria 344/98 pede. Quem
 * tem `farmacia` continua alcançando os movimentos pela API; o que ele não
 * alcança mais é o livro montado, com saldo e balanço por mês.
 *
 * Dizer que a tabela ficou selada seria mentira, e mentira sobre acesso é
 * pior que acesso aberto: o hospital para de olhar.
 */


// Blindagem: um erro de render em QUALQUER módulo mostra a mensagem na tela (e
// deixa o resto do app funcionando), em vez de derrubar tudo numa tela branca.
// `key={active}` reseta o limite ao trocar de módulo.
class LimiteErro extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(erro) { return { erro }; }
  componentDidCatch(erro, info) { console.error("[Valentrax] erro de render no módulo:", erro, info); }
  render() {
    if (this.state.erro) {
      const e = this.state.erro;
      // 🔴 FALHA AO BAIXAR O MÓDULO É OUTRO PROBLEMA, E OUTRO CONSELHO.
      // Com as telas carregando sob demanda, um deploy novo troca o nome dos
      // arquivos. Quem está com a aba aberta desde de manhã clica na
      // Farmácia e o navegador pede um arquivo que não existe mais.
      //
      // Nesse caso "troque de módulo na barra lateral" é o conselho ERRADO:
      // TODOS vão falhar igual. O certo é recarregar — e por isso a mensagem
      // muda e aparece um botão.
      if (ehErroDeChunk(e)) {
        return (
          <div style={{ padding: 24, fontFamily: "Inter, sans-serif", color: "var(--text)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f59e0b", marginBottom: 8 }}>{TEXTO_CHUNK.titulo}</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 14, lineHeight: 1.5, maxWidth: 560 }}>{TEXTO_CHUNK.corpo}</div>
            <button onClick={() => window.location.reload()} style={{ background: "#2dd4bf", color: "#062a26", border: "none", borderRadius: 8, padding: "10px 22px", fontWeight: 700, cursor: "pointer", fontSize: 13.5 }}>
              {TEXTO_CHUNK.botao}
            </button>
          </div>
        );
      }
      return (
        <div style={{ padding: 24, fontFamily: "Inter, sans-serif", color: "var(--text)", overflow: "auto", height: "100%", boxSizing: "border-box" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#f43f5e", marginBottom: 8 }}>Este módulo teve um erro ao abrir</div>
          <div style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 12 }}>O resto do sistema continua funcionando — é só trocar de módulo na barra lateral. Se puder, copie o texto abaixo e mande para o suporte.</div>
          <pre style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, fontSize: 12, whiteSpace: "pre-wrap", overflowX: "auto", maxHeight: "55vh", color: "#fca5a5", margin: 0 }}>{String(e && e.message ? e.message : e)}{"\n\n"}{String((e && e.stack) || "").split("\n").slice(0, 14).join("\n")}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}


// ═══════════════════════════════════════════════════════════
// PROTOCOLOS CLÍNICOS GERENCIADOS — Tier 1 · Fase 3a (Sepse)
//
// Linhas de cuidado tempo-dependentes, POR SETOR assistencial (cada setor tem a
// sua instância). Gatilho acende do NEWS; bundle com relógio; KPIs porta→ação.
// Toda a lógica é pura e testável em src/clinico/protocolos.js — aqui só a tela
// e a persistência. Tabelas blindadas (TABELAS_OPCIONAIS) + LimiteErro do router.
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// SUPRIMENTOS (Estoque & Compras) — página com barra lateral própria (padrão Farmácia)
// ═══════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════
// ADMIN DE USUÁRIOS — só adm_master (via Edge Function admin-usuarios)
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// USUÁRIOS
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════
function LoginScreen({ onLogin, avisoSessao }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState("");
  const [shake, setShake]       = useState(false);
  const [loading, setLoading]   = useState(false);
  async function handleLogin() {
    if (loading) return;
    if (!username.trim() || !password) { setError("Preencha usuário e senha."); return; }
    setLoading(true); setError("");
    const r = await signIn(username, password);
    setLoading(false);
    if (r.ok) onLogin(r.user);
    else { setError(r.error); setShake(true); setTimeout(() => setShake(false), 500); }
  }
  const inp = { width: "100%", padding: "11px 14px", borderRadius: 8, border: `1.5px solid #2a4166`, fontSize: 14, outline: "none", fontFamily: "Inter, sans-serif", background: "#0f1b2e", color: "#e9eef5", transition: "border .15s", boxSizing: "border-box" };
  return (
    <div style={{ minHeight: "100vh", background: `radial-gradient(90% 130% at 75% -25%, #1c3356 0%, ${VX.marinho} 60%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: VX.marinho2, border: `1px solid #2a4166`, borderRadius: 16, padding: "2.5rem 2rem", width: 380, boxShadow: "0 20px 60px rgba(2,8,20,.55)", animation: shake ? "shake .4s ease" : "fadeIn .4s ease" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{ margin: "0 auto 12px", width: 58 }}><VxLogo size={58} /></div>
          <VxWordmark size={22} color="#f2f6fb" spacing=".12em" />
          <div style={{ fontSize: 10, color: VX.turquesa, marginTop: 4, letterSpacing: ".2em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          <div style={{ fontSize: 12, color: "#c6d2e2", marginTop: 8 }}>Inteligência para o fluxo hospitalar.</div>
        </div>
        {avisoSessao && (
          <div style={{ background: "#0e2a33", border: `1px solid ${VX.turquesa}`, borderRadius: 8, padding: "9px 12px", fontSize: 12.5, color: "#bdeee6", marginBottom: 16, lineHeight: 1.45 }}>
            Sua sessão expirou por inatividade. Entre novamente para continuar — nenhum dado foi perdido.
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>USUÁRIO</label>
          <input type="text" value={username} placeholder="Digite seu usuário" onChange={e => { setUsername(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={inp} autoComplete="username" />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: "#9db1cd", display: "block", marginBottom: 6 }}>SENHA</label>
          <div style={{ position: "relative" }}>
            <input type={showPass ? "text" : "password"} value={password} placeholder="••••••••" onChange={e => { setPassword(e.target.value); setError(""); }} onKeyDown={e => e.key === "Enter" && handleLogin()} onFocus={e => e.target.style.borderColor = VX.turquesa} onBlur={e => e.target.style.borderColor = "#2a4166"} style={{ ...inp, paddingRight: 44 }} autoComplete="current-password" />
            <button onClick={() => setShowPass(p => !p)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "#5b76a0" }}>{showPass ? "🙈" : "👁"}</button>
          </div>
        </div>
        {error && <div style={{ background: "#3d0f18", border: "1px solid #7f1d2e", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#fda4af", marginBottom: 14 }}>⚠️ {error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: loading ? "#5b76a0" : `linear-gradient(90deg, ${VX.turquesa}, ${VX.azul})`, color: "#062a35", fontSize: 15, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "Inter, sans-serif", boxShadow: "0 4px 18px rgba(45,212,191,.3)" }}>{loading ? "Entrando…" : "Entrar"}</button>
        <div style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "#5b76a0", letterSpacing: ".06em" }}>VALENTRAX HEALTHCARE OPERATIONS</div>
        <div style={{ textAlign: "center", marginTop: 6, fontSize: 12, color: "#7f97b8" }}>Acesso restrito · {HOSPITAL_NOME}</div>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}`}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// APP PRINCIPAL
// ═══════════════════════════════════════════════════════════
// Faixa fixa no topo identificando o ambiente quando NÃO é produção.
// Não é dispensável de propósito: se der para fechar, alguém fecha e volta
// a ficar no escuro — que é exatamente o problema que ela resolve.
// Mostra também a referência do projeto Supabase, para o aviso não depender
// do rótulo estar certo.
function FaixaAmbiente() {
  if (!AMBIENTE) return null;               // produção: nada na tela
  return (
    <div
      role="status"
      style={{
        flexShrink: 0, background: "#b45309", color: "#fff",
        fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em",
        padding: "5px 12px", display: "flex", alignItems: "center",
        justifyContent: "center", gap: 10, textAlign: "center",
      }}
    >
      <span>⚠ {AMBIENTE.toUpperCase()}</span>
      <span style={{ fontWeight: 500, opacity: 0.9 }}>
        banco <code style={{ fontFamily: "JetBrains Mono, monospace" }}>{SUPABASE_REF}</code>
        {" "}— o que você salvar aqui não vai para o hospital
      </span>
    </div>
  );
}

// Faixa de aviso quando o banco recusa uma operação. Fica no topo, não
// bloqueia a tela (diferente de `alert`, que trava tudo e viraria um
// pesadelo se várias gravações falhassem em sequência) e some quando o
// usuário fecha. Mostra a tabela e o motivo devolvido pelo PostgREST,
// para o suporte saber o que aconteceu sem precisar abrir o console.
function AvisoFalhaBanco() {
  const [falhas, setFalhas] = useState([]);
  useEffect(() => assinarFalhasSb(f => {
    setFalhas(prev => {
      // agrupa por tabela+operação para não empilhar 50 avisos iguais
      const chave = `${f.metodo}:${f.alvo}`;
      const achou = prev.find(x => x.chave === chave);
      if (achou) return prev.map(x => x.chave === chave ? { ...x, ...f, chave, vezes: x.vezes + 1 } : x);
      return [...prev, { ...f, chave, vezes: 1 }].slice(-4);
    });
  }), []);

  if (!falhas.length) return null;
  return (
    <div style={{ position: "fixed", top: 8, left: "50%", transform: "translateX(-50%)", zIndex: 9999, display: "flex", flexDirection: "column", gap: 6, maxWidth: 620, width: "calc(100% - 24px)" }}>
      {falhas.map(f => (
        <div key={f.chave} role="alert" style={{ background: "var(--bg-2)", border: `1px solid ${f.escrita ? "#e11d48" : "#d97706"}`, borderLeft: `4px solid ${f.escrita ? "#e11d48" : "#d97706"}`, borderRadius: 8, padding: "10px 12px", boxShadow: "0 6px 24px rgba(0,0,0,.35)", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: f.escrita ? "#f43f5e" : "#f59e0b" }}>
              {f.escrita
                ? `Não foi salvo em "${f.alvo}"`
                : `Não foi possível carregar "${f.alvo}"`}
              {f.vezes > 1 && <span style={{ fontWeight: 500, opacity: .7 }}> ({f.vezes}×)</span>}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2, wordBreak: "break-word" }}>
              {f.detalhe || (f.status ? `erro ${f.status}` : "sem conexão com o servidor")}
            </div>
            {f.escrita && (
              <div style={{ fontSize: 11.5, color: "var(--text-2)", marginTop: 4, fontWeight: 600 }}>
                Confira antes de seguir — este registro pode não ter sido gravado.
              </div>
            )}
          </div>
          <button
            onClick={() => setFalhas(prev => prev.filter(x => x.chave !== f.chave))}
            aria-label="Fechar aviso"
            style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}
          >×</button>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => loadSession());
  // Sessão expirada de vez (refresh também venceu): mostra UM aviso no login,
  // em vez da enxurrada de "JWT expired" por tabela.
  const [sessaoExpirou, setSessaoExpirou] = useState(false);
  const [db, setDb] = useState(() => loadDB());
  const [active, setActive] = useState("overview");
  // 🔴 ATALHO ENTRE MÓDULOS, para a tela que SENTE a falta poder levar até
  // onde se cadastra. Isto existe porque o produto é vendido a vários
  // hospitais: todo cliente novo abre o sistema com tudo vazio, e "cadastre
  // em Atendimento → Tabelas" escrito num aviso obriga a pessoa a achar o
  // caminho sozinha, no primeiro minuto de uso.
  //
  // ⚠️ A aba é DE UM USO SÓ. Se ficasse guardada, VOLTAR ao Atendimento
  // depois cairia em Tabelas em vez de Recepção — por isso `navegar` zera a
  // aba, e é ela que a barra lateral chama.
  //
  // ⚠️ E ELA SÓ VALE NA MONTAGEM. Clicar "Atendimento" na lateral estando JÁ
  // no Atendimento não troca `active`, então o módulo não remonta e a aba
  // fica onde está. Isso é o comportamento normal de item de menu do módulo
  // atual, NÃO é o atalho grudando: o teste que importa é sair do módulo e
  // voltar, e aí cai em Recepção. Caminhado na tela em 03/09/2026 — a
  // primeira versão desta caminhada testou a coisa errada e acusou um bug
  // que não existia.
  const [abaAtendimento, setAbaAtendimento] = useState(null);
  const navegar = (id, aba = null) => { setAbaAtendimento(aba); setActive(id); };
  const [ambOpen, setAmbOpen] = useState(true);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem("hnsn_theme") || "dark"; } catch { return "dark"; } });
  useEffect(() => { document.title = `Valentrax · ${HOSPITAL_SIGLA}`; }, []);
  useEffect(() => { document.documentElement.setAttribute("data-theme", theme); try { localStorage.setItem("hnsn_theme", theme); } catch {} }, [theme]);

  // Sessão morreu de vez (refresh expirado): volta ao login com um aviso só.
  useEffect(() => assinarSessaoExpirada(() => {
    setSessaoExpirou(true);
    setCurrentUser(null);
    setActive("overview");
  }), []);

  // Renovação proativa: ao voltar para a aba (ou focar a janela), se o crachá
  // está perto de vencer, renova ANTES de a próxima ação bater no banco. Cobre
  // o caso clássico de deixar a tela aberta o plantão (ou a noite) inteiro.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    const aoVoltar = () => {
      if (document.visibilityState === "hidden") return;
      const s = lerSessao();
      if (s?.expires_at && precisaRenovar(s.expires_at, Date.now())) renovarSessao();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [currentUser]);
  
  const handleSave = useCallback(newDb => {
    setDb(() => ({ ...newDb }));
  }, []);

  // O perfil é relido a cada carga do app, não apenas quando falta algum
  // campo. São duas razões:
  //   1. Quem já estava logado quando a categoria profissional passou a
  //      existir tem um usuário salvo sem ela;
  //   2. Quando o administrador reclassifica alguém, a mudança precisa
  //      valer no próximo carregamento — e não só depois de a pessoa sair
  //      e entrar de novo. Papel e categoria decidem o que ela pode
  //      registrar clinicamente; guardar isso indefinidamente no
  //      localStorage é guardar uma permissão vencida.
  // Roda uma vez por carga (depende só do id), então não fica em laço.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    sbFetch(`profiles?id=eq.${currentUser.id}&select=*`).then(rows => {
      const p = Array.isArray(rows) ? rows[0] : null;
      if (!vivo || !p) return;
      setCurrentUser(atual => {
        const novo = {
          ...atual,
          role: p.role || atual.role,
          categoria: p.categoria || "administrativo",
          conselho: p.conselho || null,
          registro_conselho: p.registro_conselho || null,
          uf_conselho: p.uf_conselho || null,
          perfil: p.perfil || null,
          setor: p.setor || null,
        };
        // nada mudou: devolve o mesmo objeto para não re-renderizar à toa
        const igual = ["role", "categoria", "conselho", "registro_conselho", "uf_conselho", "perfil", "setor"]
          .every(k => atual[k] === novo[k]);
        if (igual) return atual;
        try {
          const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}");
          saveSession({ ...s, user: novo });
        } catch {}
        return novo;
      });
    }).catch(() => {});
    return () => { vivo = false; };
  }, [currentUser?.id]);

  // ── PERMISSÕES DE MÓDULO ──────────────────────────────────
  // Carrega o perfil da pessoa e as exceções dela. Enquanto não carregar,
  // `permsCarregadas` fica false e o menu mostra tudo — é a escolha certa
  // aqui: perder acesso por meio segundo no meio de um plantão é pior do que
  // ver por meio segundo um módulo que não é seu. A barreira real é o RLS
  // (fase 3), não o menu.
  const [perms, setPerms] = useState(null);
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    (async () => {
      const chave = currentUser.perfil;
      // SEM CARGO CONHECIDO, NÃO SE DECIDE NADA.
      //
      // `currentUser` vem da sessão salva, que pode ser anterior ao campo
      // `perfil` existir — e o perfil só chega depois que a consulta a
      // `profiles` responde. Nesse intervalo, calcular permissão com uma
      // lista vazia de grants escondia o sistema INTEIRO: o usuário via só
      // "Usuários" e achava que tinha perdido o acesso.
      //
      // Aconteceu comigo testando, com o cargo correto no banco. Num
      // plantão seria alguém ligando para a TI achando que foi bloqueado.
      // O menu não é a barreira de segurança (a barreira é o RLS), então
      // aqui se falha ABERTO — mostrar um módulo a mais por um instante é
      // menos grave que tirar o sistema de quem está trabalhando.
      if (!chave) { setPerms(null); return; }

      const [gs, exc] = await Promise.all([
        sbFetch(`perfis_permissoes?perfil_chave=eq.${encodeURIComponent(chave)}&select=modulo,nivel`).catch(() => null),
        sbFetch(`usuarios_permissoes?user_id=eq.${currentUser.id}&select=modulo,nivel`).catch(() => null),
      ]);
      if (!vivo) return;
      // Sem tabela de perfis no banco (migração ainda não aplicada), `gs` é
      // null e não `[]` — e as duas coisas significam o oposto uma da outra:
      // null = "não sei", [] = "sei que não tem nada". Tratar null como
      // vazio esconderia o sistema inteiro de todo mundo.
      if (gs == null) { setPerms(null); return; }
      const grants = {};
      for (const g of gs) grants[g.modulo] = g.nivel;
      setPerms(permissoesEfetivas(currentUser, { grants }, exc || []));
    })();
    return () => { vivo = false; };
  }, [currentUser?.id, currentUser?.perfil, currentUser?.role]);

  // ── AVISO DA FILA DE LEITO (NIR) ──────────────────────────
  // Selo de contagem no menu Giro de Leitos, para o NIR não depender de lembrar
  // de abrir o módulo. Busca leve (só id/hora/visto), a cada 60s e ao focar a
  // aba; a cor segue o mesmo corEsperaFila da fila (mais antigo manda).
  const [filaAviso, setFilaAviso] = useState({ n: 0, cor: null, maiorMin: 0 });
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser?.id) return;
    let vivo = true;
    const puxar = async () => {
      const rows = await sbFetch("solicitacoes?status=eq.aguardando&select=id,hora_pedido,visto_em").catch(() => null);
      if (!vivo || !Array.isArray(rows)) return;
      const agora = nowISO();
      const maiorMin = rows.reduce((m, s) => { const d = diffMin(s.hora_pedido, agora); return d != null && d > m ? d : m; }, 0);
      setFilaAviso({ n: rows.length, cor: rows.length ? corEsperaFila(maiorMin).cor : null, maiorMin });
    };
    puxar();
    const iv = setInterval(puxar, 60000);
    const onF = () => puxar();
    window.addEventListener("focus", onF);
    return () => { vivo = false; clearInterval(iv); window.removeEventListener("focus", onF); };
  }, [currentUser?.id]);

  // Se a pessoa estava num módulo que o perfil dela não alcança, a tela
  // ficaria em branco sem explicar nada. Traz de volta para a Visão Geral —
  // ou, se nem essa ela tiver, para Usuários (adm_master) / a primeira que
  // sobrar. Tela em branco faz o usuário achar que o sistema quebrou.
  useEffect(() => {
    if (!perms || active === "users") return;
    const especialidade = SPECS.some(s => s.id === active);
    const alvo = especialidade ? "ambulatorio" : active;
    if (podeVer(perms, alvo)) return;
    const primeiro = ["overview", "ps", "leitos", "paciente", "farmacia", "suprimentos", "ambulatorio", "bloco", "scih"]
      .find(k => podeVer(perms, k));
    setActive(primeiro || (currentUser?.role === "adm_master" ? "users" : "overview"));
  }, [perms, active, currentUser?.role]);

  // Busca os dados no Supabase (fonte compartilhada entre os computadores) e
  // FUNDE com o que já existe localmente — sem apagar nada. O Supabase tem
  // prioridade por (data, especialidade); dados locais que ainda não estão na
  // nuvem são preservados. Se falhar/offline, mantém o localStorage.
  // Roda ao abrir E sempre que a janela volta ao foco (troca de aba/computador),
  // pra ver os números novos sem precisar apertar F5.
  useEffect(() => {
    if (!USE_SUPABASE || !currentUser) return;
    let cancelled = false;
    const syncFromCloud = () => {
      loadFromSupabase(SB()).then(cloud => {
        if (cancelled || !cloud) return;
        const prev = loadDB();
        const merged = { ...prev };
        for (const d in cloud) merged[d] = { ...(merged[d] || {}), ...cloud[d] };
        saveDB(merged);
        setDb(merged);
        // MIGRAÇÃO AUTOMÁTICA: registros que só existem neste aparelho
        // (digitados antes da nuvem, ou salvos offline) sobem para o Supabase.
        const pendentes = [];
        for (const d in merged) {
          for (const s in merged[d]) {
            if (!cloud[d] || !cloud[d][s]) {
              pendentes.push({ data: d, especialidade: s, ...merged[d][s], usuario: "migracao-auto" });
            }
          }
        }
        if (pendentes.length > 0) {
          sbFetch("atendimentos?on_conflict=data,especialidade", {
            method: "POST",
            headers: { "Prefer": "resolution=merge-duplicates" },
            body: JSON.stringify(pendentes),
          });
        }
      });
    };
    syncFromCloud();
    const onFocus = () => syncFromCloud();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentUser]);

  // Permissões por nível
  const isMaster    = currentUser?.role === "adm_master";
  const isSilver    = currentUser?.role === "adm_silver";
  const isAnalista  = currentUser?.role === "analista";
  const isReadOnly  = currentUser?.role === "visualizador";

  // 🔴 `canEdit` REMOVIDO em 01/09/2026. Estava morto — TODA tela recebe
  // `canEdit={canLaunch}` —, mas a regra dele era:
  //
  //     isMaster || isSilver || isAnalista === false && !isReadOnly
  //
  // que o JS agrupa como `a || b || ((c === false) && !d)`. Para um usuário
  // comum (nem master, nem silver, nem analista, não somente-leitura) isso
  // dava **true**, enquanto o comentário ao lado prometia "silver e acima".
  // Bastava alguém ligar essa variável numa tela para abrir edição a quem
  // não deveria. Nunca esteve ligada — foi achado ao ligar `no-unused-vars`.
  const canLaunch   = isMaster || isSilver;   // master e silver lançam dados
  const canPrint    = isMaster || isSilver || isAnalista; // master, silver e analista geram dashboard
  const canImport   = isMaster || isSilver;   // master e silver importam
  const canAudit    = isMaster || isSilver;   // master e silver veem auditoria
  const canUsers    = isMaster;               // só master gerencia usuários

  function handleLogout() { clearSession(); setCurrentUser(null); setActive("overview"); }

  // Os dois avisos valem já na tela de login: o de falha, porque se o banco
  // recusar a autenticação o usuário precisa ver o motivo em vez de um
  // formulário que "não faz nada"; e o de ambiente, para saber em qual banco
  // está ANTES de digitar qualquer coisa.
  if (!currentUser) return (
    <>
      <FaixaAmbiente />
      <AvisoFalhaBanco />
      <LoginScreen avisoSessao={sessaoExpirou} onLogin={u => { setSessaoExpirou(false); setCurrentUser(u); }} />
    </>
  );

  const now = new Date();
  const role = ROLES[currentUser.role];

  // O menu passa a respeitar o perfil de acesso. `perms === null` significa
  // que o banco ainda não tem os perfis (migração não aplicada) ou que a
  // consulta ainda não voltou — nos dois casos mostramos tudo, como antes.
  // Falhar ABERTO aqui é deliberado: o menu não é a barreira de segurança, e
  // esconder módulo por engano trava o trabalho de alguém no plantão.
  const verModulo = (chave, padrao = true) => (perms ? podeVer(perms, chave) : padrao);

  // 🔴 A ORDEM E O AGRUPAMENTO SAEM DE `modulos.js`, não daqui.
  // Antes esta lista era plana, com dois separadores anônimos (`d1`/`d2`) —
  // 17 itens em fila, sem dizer o que se agrupa com o quê. E o campo `grupo`
  // já existia no catálogo desde sempre: quem o consumia era só a matriz de
  // perfis. Quem configura acesso via o sistema organizado; quem trabalha
  // nele, não.
  //
  // Os grupos estão na ordem do TRABALHO: onde o paciente entra, quem vigia
  // o cuidado, o que sustenta a assistência, o que vira dinheiro, e o que só
  // a administração toca. Quem aprende o menu aprende o fluxo do hospital.
  //
  // ⚠️ O grupo "Geral" NÃO ganha cabeçalho: é a home, e um título acima de
  // um item só é ruído. `verModulo` continua decidindo item a item, e um
  // grupo cujos itens todos sumiram não desenha cabeçalho órfão.
  const itensDoMenu = [
    { grupo: "Geral", id: "overview", icon: "dashboard", label: "Centro de Monitoramento", ver: verModulo("overview") },

    { grupo: "Jornada do paciente", id: "atendimento", icon: "door", label: "Atendimento", ver: verModulo("atendimento") },
    { grupo: "Jornada do paciente", id: "ps", icon: "activity", label: "Pronto-Socorro", ver: verModulo("ps") },
    { grupo: "Jornada do paciente", id: "bloco", icon: "scissors", label: "Bloco Cirúrgico", ver: verModulo("bloco") },
    { grupo: "Jornada do paciente", id: "leitos", icon: "bed", label: "Giro de Leitos", ver: verModulo("leitos"), aviso: filaAviso.n ? filaAviso : null },
    { grupo: "Jornada do paciente", id: "paciente", icon: "record", label: "Paciente 360", ver: verModulo("paciente") },

    // Ordenados por TEMPO ATÉ AGIR, não por hierarquia: protocolo tem
    // relógio contando, notificação é do dia, vigilância é de meses.
    { grupo: "Qualidade e vigilância", id: "protocolos", icon: "activity", label: "Protocolos Clínicos", ver: verModulo("protocolos") },
    { grupo: "Qualidade e vigilância", id: "nsp", icon: "clipboard", label: "Segurança do Paciente", ver: verModulo("nsp") },
    { grupo: "Qualidade e vigilância", id: "scih", icon: "shield", label: "SCIH", ver: verModulo("scih") },

    // Farmácia antes: ela consome o catálogo do almoxarifado e toca
    // paciente; o estoque não toca ninguém.
    { grupo: "Farmácia e suprimentos", id: "farmacia", icon: "pill", label: "Farmácia", ver: verModulo("farmacia") },
    { grupo: "Farmácia e suprimentos", id: "suprimentos", icon: "cart", label: "Estoque & Compras", ver: verModulo("suprimentos") },

    { grupo: "Receita e produção", id: "faturamento", icon: "briefcase", label: "Faturamento SUS", ver: verModulo("faturamento") },
    { grupo: "Receita e produção", id: "ambulatorio", icon: "clinic", label: "Ambulatório", ver: verModulo("ambulatorio"), children: SPECS.map(s => ({ id: s.id, label: s.label, color: s.color })) },
    { grupo: "Receita e produção", id: "print", icon: "printer", label: "Imprimir Dashboard", ver: canPrint && verModulo("print") },

    { grupo: "Administração do sistema", id: "auditoria", icon: "clipboard", label: "Auditoria", ver: canAudit && verModulo("auditoria") },
    { grupo: "Administração do sistema", id: "import", icon: "upload", label: "Importar Dados", ver: canImport && verModulo("import") },
    // `users` ignora `verModulo` de propósito — é a porta de volta quando um
    // perfil é configurado errado (ver `modulos.js`, `exigeMaster`).
    { grupo: "Administração do sistema", id: "users", icon: "users", label: "Usuários e Perfis", ver: canUsers },
  ].filter(it => it.ver);

  // Intercala os cabeçalhos, pulando grupo que ficou sem nenhum item.
  const sidebarItems = GRUPOS.flatMap(g => {
    const doGrupo = itensDoMenu.filter(it => it.grupo === g);
    if (!doGrupo.length) return [];
    return g === "Geral" ? doGrupo : [{ grupoTitulo: g }, ...doGrupo];
  });
  const currentSpec = SPECS.find(s => s.id === active);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 14 }}>
      <FaixaAmbiente />
      <AvisoFalhaBanco />
      {/* HEADER */}
      <div style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <VxLogo size={30} />
          <div>
            <VxWordmark size={14} />
            <div style={{ fontSize: 8.5, color: VX.turquesa, letterSpacing: ".18em", fontWeight: 600 }}>HEALTHCARE OPERATIONS</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 11, color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" }}>{HOSPITAL_NOME}</span>
          <div style={{ fontSize: 11, color: "var(--text-3)", fontFamily: "JetBrains Mono, monospace" }}>{now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}</div>
          <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Alternar tema claro/escuro" style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 9px", color: "var(--text-3)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}>{theme === "dark" ? "☀️" : "🌙"}</button>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{currentUser.name}</div>
              <div style={{ fontSize: 10, color: role.color, fontWeight: 700 }}>{role.label}</div>
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: role.color, background: role.color + "22", border: `1px solid ${role.color}44` }}>
              {(currentUser.name || "?").charAt(0).toUpperCase()}
            </div>
            <button onClick={handleLogout} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", color: "var(--text-muted)", cursor: "pointer", fontSize: 12, fontFamily: "Inter, sans-serif" }}
              onMouseOver={e => { e.currentTarget.style.borderColor = "#fb7185"; e.currentTarget.style.color = "#fb7185"; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {/* ALERTAS */}
      <AlertBanner sb={SB()} db={db} />
      <NotificacaoRapida sb={SB()} currentUser={currentUser} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* SIDEBAR */}
        <nav style={{ width: 215, minWidth: 215, background: "var(--bg-2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", padding: ".75rem 0", overflowY: "auto", flexShrink: 0 }}>
          {isReadOnly && <div style={{ margin: "0 10px 8px", background: "var(--surface-3)", border: "1px solid var(--border-2)", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Somente visualização</div>}
          {sidebarItems.map((item) => {
            // Cabeçalho de grupo. Substituiu os separadores anônimos: a linha
            // dizia "aqui muda alguma coisa" e não dizia o quê.
            if (item.grupoTitulo) return (
              <div key={item.grupoTitulo} style={{ padding: "16px 1rem 5px", fontSize: 10, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                {item.grupoTitulo}
              </div>
            );

            // Grupo expansível (ex.: Ambulatório → especialidades)
            if (item.children) {
              const childActive = item.children.some(c => c.id === active);
              return (
                <div key={item.id}>
                  <button onClick={() => setAmbOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${childActive ? "#22d3ee" : "transparent"}`, color: childActive ? "#22d3ee" : "var(--text-2)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 600, fontFamily: "Inter, sans-serif", background: childActive ? "var(--surface)" : "transparent" }}>
                    <Icon name={item.icon} />{item.label}
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{ambOpen ? "▾" : "▸"}</span>
                  </button>
                  {ambOpen && item.children.map(c => {
                    const isActive = active === c.id;
                    return (
                      <button key={c.id} onClick={() => navegar(c.id)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: ".4rem 1rem .4rem 2.4rem", border: "none", borderLeft: `3px solid ${isActive ? (c.color || "#22d3ee") : "transparent"}`, color: isActive ? (c.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 12.5, fontWeight: 500, fontFamily: "Inter, sans-serif", background: isActive ? "var(--surface)" : "transparent" }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: c.color || "var(--text-muted)", flexShrink: 0 }} />{c.label}
                      </button>
                    );
                  })}
                </div>
              );
            }

            const isActive = active === item.id;
            return (
              <button key={item.id} onClick={() => navegar(item.id)} style={{ display: "flex", alignItems: "center", gap: 9, padding: ".5rem 1rem", border: "none", borderLeft: `3px solid ${isActive ? (item.color || "#22d3ee") : "transparent"}`, color: isActive ? (item.color || "#22d3ee") : "var(--text-3)", cursor: "pointer", textAlign: "left", fontSize: 13, fontWeight: 500, fontFamily: "Inter, sans-serif", transition: "all .12s", background: isActive ? "var(--surface)" : "transparent" }}>
                <Icon name={item.icon} />{item.label}
                {item.aviso && <span title={`${item.aviso.n} aguardando leito${item.aviso.maiorMin ? ` · mais antigo há ${fmtDur(item.aviso.maiorMin)}` : ""}`} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, fontFamily: "JetBrains Mono, monospace", color: "#fff", background: item.aviso.cor || "var(--text-muted)", borderRadius: 99, minWidth: 18, textAlign: "center", padding: "0 6px", lineHeight: "17px" }}>{item.aviso.n}</span>}
              </button>
            );
          })}
        </nav>

        {/* CONTENT */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <LimiteErro key={active}>
          {/* ⚠️ O fallback NÃO é uma tela em branco. Módulo grande em rede
              de hospital demora, e tela vazia parece sistema quebrado — a
              pessoa clica de novo, ou desiste e liga para o suporte. */}
          <Suspense fallback={
            <div style={{ padding: 28, color: "var(--text-muted)", fontSize: 13 }}>
              Carregando o módulo…
            </div>
          }>
          {active === "overview"  && <Overview sb={SB()} db={db} currentUser={currentUser} canEdit={canLaunch} perms={perms} onNav={setActive} />}
          {currentSpec            && <EspecialidadePage sb={SB()} spec={currentSpec} db={db} onSave={handleSave} readOnly={!canLaunch} currentUser={currentUser} />}
          {active === "atendimento" && <Atendimento sb={sbFetch} currentUser={currentUser} canEdit={canLaunch} abaInicial={abaAtendimento} />}
          {active === "ps"        && <PSPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "bloco"     && <BlocoPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "leitos"    && <LeitosPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "scih"      && <ScihPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "nsp"       && <NSPPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "protocolos" && <ProtocolosPage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {/* 🔴 `false` COMO PADRÃO — e é o único lugar do menu onde isso vale.
              `verModulo` falha ABERTO de propósito (ver o comentário na
              montagem da barra): esconder módulo por engano trava alguém no
              plantão, e a barreira de verdade é o RLS. O Livro de Controlados
              é a exceção: é documento fiscalizável (Portaria 344/98), não é
              trabalho de beira de leito, e ninguém para de atender porque o
              livro demorou a aparecer. Aqui o custo de abrir por engano é
              maior que o de fechar por engano — então falha FECHADO. */}
          {active === "farmacia"  && <FarmaciaPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} podeControlados={verModulo("controlados", false)} />}
          {active === "suprimentos" && <SuprimentosPage sb={SB()} sbCru={SB_CRU()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "faturamento" && <FaturamentoPage sb={sbFetch} currentUser={currentUser} canEdit={canLaunch} onIrPara={navegar} />}
          {active === "paciente"  && <PacientePage sb={SB()} currentUser={currentUser} canEdit={canLaunch} />}
          {active === "print"     && canPrint    && <PrintDashboard sb={SB()} db={db} />}
          {active === "auditoria" && canAudit    && <TrilhaAuditoria sb={sbFetch} />}
          {active === "import"    && canImport   && <ImportPage sb={SB()} onImport={newDb => setDb({ ...newDb })} currentUser={currentUser} />}
          {active === "users"     && canUsers    && <UsersPage sb={SB()} adminUsuarios={adminUsuarios} trocarSenha={changeMyPassword} currentUser={currentUser} />}
          </Suspense>
          </LimiteErro>
        </div>
      </div>
    </div>
  );
}
