// ═══════════════════════════════════════════════════════════
// USUÁRIOS E ACESSO — A TELA
//
// Saiu do App.jsx. As regras puras continuam em ./permissoes.js,
// ./modulos.js e ./cbo.js; a leitura e escrita em ./dados.js.
//
// ⚠️ TRÊS CAPACIDADES CHEGAM POR PROP, e as duas últimas não são `sb`:
//   `sb`             a rede do PostgREST, como em todo módulo.
//   `adminUsuarios`  chama a Edge Function `admin-usuarios`, que roda no
//                    servidor com a service_role. O navegador NUNCA vê a
//                    chave admin — é o que impede esta tela de virar um
//                    caminho para criar usuário sem passar pelo servidor.
//   `trocarSenha`    chama `/auth/v1/user` com o token da própria pessoa.
//
// As duas moram no App.jsx de propósito: usam o AUTH_TOKEN e os endpoints
// de autenticação, não a API de dados. Território de sessão fica com a
// sessão.
// ═══════════════════════════════════════════════════════════

import { Fragment, useEffect, useState } from "react";
import PerfisAcesso from "./PerfisAcesso.jsx";
import { ROLES } from "./papeis-sistema.js";
import { carregarExcecoesUsuario, carregarGrantsDoPerfil, loadProfiles,
         removerExcecaoRemota, salvarCategoriaProfissional, salvarExcecaoRemota } from "./dados.js";
import { NIVEIS_EXCECAO, excecoesAplicadas, modulosExcecionaveis, permissoesEfetivas,
         resumoDeAcesso, rotuloNivel, validarExcecao } from "./permissoes.js";
import { cbosDoCatalogo, formatarCbo, validarCbo } from "./cbo.js";
import { CATEGORIAS as CATEGORIAS_CLINICAS } from "../clinico/papeis.js";
import { registrarAuditoria } from "../auditoria/dados.js";

function AdminUsuarios({ sb, adminUsuarios, currentUser }) {
  const [rows, setRows] = useState(null);       // null = carregando
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  // formulário de criação
  const [nNome, setNNome] = useState("");
  const [nUser, setNUser] = useState("");
  const [nRole, setNRole] = useState("visualizador");
  const [nSenha, setNSenha] = useState("");
  const [cMsg, setCMsg] = useState("");
  // Perfil do cargo. É por aqui que o fluxo real começa: o gestor pede
  // "acesso para a enfermeira nova", a TI escolhe "Enfermeiro(a)" e o resto
  // (papel de sistema, categoria clínica, módulos) vem junto.
  const [nPerfil, setNPerfil] = useState("");
  const [nConselho, setNConselho] = useState("");
  const [nRegistro, setNRegistro] = useState("");
  const [nUf, setNUf] = useState("RS");
  const [perfisDisp, setPerfisDisp] = useState([]);
  // Classificação clínica (categoria + conselho) de uma linha. Era uma tabela
  // à parte; virou linha expansível aqui, porque as duas listavam a mesma
  // gente e o cargo já sugere a categoria — ver duas tabelas iguais confundia.
  const [classificando, setClassificando] = useState(null);   // id em edição
  const [catForm, setCatForm] = useState({});
  const [catMsg, setCatMsg] = useState("");                   // recusa do CBO, na linha
  // Sugestões de CBO: só os que JÁ estão no catálogo de procedimentos deste
  // hospital. Nenhuma tabela de CBO inventada — ver o cabeçalho de cbo.js.
  const [cbosSugeridos, setCbosSugeridos] = useState([]);
  useEffect(() => {
    sb("at_procedimentos?select=cbos_compativeis&ativo=eq.true")
      .then(r => setCbosSugeridos(cbosDoCatalogo(Array.isArray(r) ? r : [])))
      .catch(() => setCbosSugeridos([]));
  }, []);
  // Exceções de acesso de uma pessoa — a linha expansível espelha a de
  // Categoria. O desvio individual sobre o cargo, com motivo e autor.
  const [editandoExc, setEditandoExc] = useState(null);       // id em edição
  const [excList, setExcList] = useState([]);                 // exceções da pessoa
  const [grantsPerfil, setGrantsPerfil] = useState({});       // o que o cargo dela dá
  const [excForm, setExcForm] = useState({ modulo: "", nivel: "leitura", motivo: "" });
  const [excMsg, setExcMsg] = useState("");

  async function abrirExcecoes(u) {
    if (editandoExc === u.id) { setEditandoExc(null); return; }
    setClassificando(null);
    setEditandoExc(u.id); setExcMsg(""); setExcForm({ modulo: "", nivel: "leitura", motivo: "" });
    setExcList([]); setGrantsPerfil({});
    const [exc, grants] = await Promise.all([carregarExcecoesUsuario(u.id), carregarGrantsDoPerfil(u.perfil)]);
    setExcList(exc); setGrantsPerfil(grants);
  }
  async function liberarExcecao(u) {
    const erro = validarExcecao(excForm);
    if (erro) { setExcMsg("⚠️ " + erro); return; }
    setBusy(true);
    const r = await salvarExcecaoRemota(u.id, excForm, currentUser?.name);
    setBusy(false);
    if (!r || (Array.isArray(r) && !r.length)) {
      setExcMsg("⚠️ Nada foi gravado — só o ADM Master libera exceção (e a migração de perfis precisa estar aplicada neste banco)."); return;
    }
    registrarAuditoria(sb, currentUser, "liberar exceção", `${u.username}: ${excForm.modulo} → ${excForm.nivel}`, { motivo: (excForm.motivo || "").trim() });
    setExcList(await carregarExcecoesUsuario(u.id));
    setExcForm({ modulo: "", nivel: "leitura", motivo: "" });
    setExcMsg(`✓ Exceção aplicada. Vale no próximo login de ${u.nome}.`);
  }
  async function tirarExcecao(u, ex) {
    if (!confirm(`Remover a exceção de "${ex.modulo}" de ${u.nome}?\n\nEle volta ao que o cargo "${u.perfil || "sem cargo"}" define.`)) return;
    setBusy(true);
    const r = await removerExcecaoRemota(ex.id);
    setBusy(false);
    if (!r || (Array.isArray(r) && !r.length)) { setExcMsg("⚠️ Nada foi removido."); return; }
    registrarAuditoria(sb, currentUser, "remover exceção", `${u.username}: ${ex.modulo}`, {});
    setExcList(await carregarExcecoesUsuario(u.id));
    setExcMsg("");
  }

  function abrirClassificar(u) {
    setEditandoExc(null);
    setClassificando(u.id);
    setCatForm({
      categoria: u.categoria || "administrativo", conselho: u.conselho || "",
      registro_conselho: u.registro_conselho || "", uf_conselho: u.uf_conselho || "RS",
      cbo: u.cbo || "",
    });
    setCatMsg("");
  }
  async function salvarCategoria(u) {
    // CBO errado é PIOR que CBO vazio: vazio a tela avisa, errado atravessa
    // tudo e só falha no processamento do mês seguinte, quando a produção
    // já sumiu. Aqui é tela de cadastro da TI, sem paciente na frente —
    // recusar é o certo.
    const vCbo = validarCbo(catForm.cbo);
    if (!vCbo.ok) { setCatMsg("⚠️ " + vCbo.erro); return; }
    setCatMsg("");
    setBusy(true);
    const r = await salvarCategoriaProfissional(u.username, { ...catForm, cbo: vCbo.valor });
    setBusy(false);
    // PostgREST devolve 204 mesmo quando o RLS bloqueia e nada muda; por isso
    // conferimos o RETORNO, não o status.
    if (!r || (Array.isArray(r) && !r.length)) { alert("⚠️ Nada foi alterado. A migração de perfis foi aplicada neste banco?"); return; }
    registrarAuditoria(sb, currentUser, "classificar profissional", u.username, { categoria: catForm.categoria });
    setClassificando(null); recarregar();
  }

  useEffect(() => {
    sb("perfis_acesso?select=*&ativo=eq.true&order=nome")
      .then(r => setPerfisDisp(Array.isArray(r) ? r : []))
      .catch(() => setPerfisDisp([]));
  }, []);

  // Escolher o perfil pré-preenche papel e categoria — sugestão, não trava:
  // a TI ainda confirma, porque o hospital tem exceções que o catálogo não
  // conhece.
  function escolherPerfil(chave) {
    setNPerfil(chave);
    const p = perfisDisp.find(x => x.chave === chave);
    if (!p) return;
    if (p.role_sugerido) setNRole(p.role_sugerido);
    const cat = CATEGORIAS_CLINICAS[p.categoria_sugerida];
    setNConselho(cat?.conselho || "");
  }

  async function recarregar() {
    setErro("");
    // A Edge Function devolve o que vem do Auth (situação de ativo, e-mail);
    // `profiles` guarda perfil, categoria e conselho. Nenhuma das duas tem o
    // quadro inteiro, então juntamos aqui.
    // ⚠️ `adminUsuarios` é prop, e sem ela não há como listar: a Edge
    // Function é a única fonte de quem está ativo e do e-mail. Recusar com
    // recado é melhor que uma promessa quebrada que ninguém vê.
    if (typeof adminUsuarios !== "function") { setErro("A administração de usuários não está disponível nesta sessão."); setRows([]); return; }
    const [r, profs] = await Promise.all([
      adminUsuarios("list"),
      sb("profiles?select=id,perfil,categoria,conselho,registro_conselho,uf_conselho,setor,cbo").catch(() => []),
    ]);
    if (r.error) { setErro(r.error); setRows([]); return; }
    const porId = Object.fromEntries((Array.isArray(profs) ? profs : []).map(p => [p.id, p]));
    setRows((r.usuarios || []).map(u => ({ ...u, ...(porId[u.id] || {}) })));
  }

  // Troca o cargo de alguém. Vai direto em `profiles` (RLS
  // `profiles_update_admin`), porque a Edge Function ainda não conhece
  // perfil nem categoria.
  async function mudarPerfil(user, chave) {
    if (chave === (user.perfil || "") || busy) return;
    const p = perfisDisp.find(x => x.chave === chave);
    if (!confirm(`Mudar "${user.username}" para o cargo "${p?.nome || chave}"?\n\nIsso muda os módulos que ele enxerga na próxima vez que abrir o sistema.`)) { recarregar(); return; }
    setBusy(true);
    const r = await sb(`profiles?id=eq.${user.id}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ perfil: chave, categoria: p?.categoria_sugerida || "administrativo" }),
    }).catch(() => null);
    setBusy(false);
    // O PostgREST devolve 204 mesmo quando o RLS bloqueia e nada muda — por
    // isso conferimos o retorno, não o status.
    if (!r || (Array.isArray(r) && !r.length)) { alert("⚠️ Nada foi alterado. A migração de perfis foi aplicada neste banco?"); recarregar(); return; }
    registrarAuditoria(sb, currentUser, "mudar cargo", `${user.username} → ${chave}`, {});
    recarregar();
  }
  useEffect(() => { recarregar(); }, []);

  async function criar() {
    if (busy) return;
    const u = nUser.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(u)) { setCMsg("⚠️ Usuário: 3–32 caracteres (letras, números, . _ -)."); return; }
    if (nSenha.length < 6) { setCMsg("⚠️ A senha precisa de ao menos 6 caracteres."); return; }
    if (!nPerfil) { setCMsg("⚠️ Escolha o perfil do cargo — é ele que define o que a pessoa enxerga."); return; }
    setBusy(true); setCMsg("");
    const r = await adminUsuarios("create", { username: u, nome: nNome.trim(), role: nRole, senha: nSenha });
    if (r.error) { setBusy(false); setCMsg("⚠️ " + r.error); return; }

    // Segundo passo: perfil, categoria clínica e conselho. A Edge Function
    // ainda não conhece esses campos, então gravamos direto em `profiles`
    // (o RLS `profiles_update_admin` só deixa adm_master fazer isso).
    //
    // Não é atômico com a criação — e por isso o erro é REPORTADO em vez de
    // engolido: um usuário criado sem perfil não enxerga nada e a TI
    // precisa saber disso na hora, não pelo chamado do funcionário no dia
    // seguinte. Unificar os dois passos na Edge Function é melhoria futura.
    const perfilEscolhido = perfisDisp.find(x => x.chave === nPerfil);
    const classificado = await sb(`profiles?username=eq.${encodeURIComponent(u)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        perfil: nPerfil,
        categoria: perfilEscolhido?.categoria_sugerida || "administrativo",
        conselho: nConselho || null,
        registro_conselho: nRegistro || null,
        uf_conselho: nRegistro ? (nUf || null) : null,
      }),
    }).catch(() => null);
    setBusy(false);

    registrarAuditoria(sb, currentUser, "criar usuário", `${u} (${nRole} · perfil ${nPerfil})`, {});
    if (!classificado || (Array.isArray(classificado) && !classificado.length)) {
      setCMsg("⚠️ Usuário criado, mas o PERFIL não foi aplicado — ele entrará sem enxergar nada. Ajuste na lista abaixo. (A migração de perfis foi aplicada neste banco?)");
      recarregar(); return;
    }
    setCMsg(`✓ Usuário criado como ${perfilEscolhido?.nome || nPerfil}.`);
    setNNome(""); setNUser(""); setNSenha(""); setNRole("visualizador");
    setNPerfil(""); setNConselho(""); setNRegistro("");
    recarregar(); setTimeout(() => setCMsg(""), 6000);
  }

  async function mudarPapel(user, role) {
    if (role === user.role || busy) return;
    setBusy(true);
    const r = await adminUsuarios("update", { id: user.id, role });
    setBusy(false);
    if (r.error) { alert("⚠️ " + r.error); recarregar(); return; }
    registrarAuditoria(sb, currentUser, "mudar papel", `${user.username} → ${role}`, {});
    recarregar();
  }

  async function redefinirSenha(user) {
    const s = prompt(`Nova senha para "${user.username}" (mín. 6 caracteres):`);
    if (s == null) return;
    if (s.length < 6) { alert("⚠️ A senha precisa de ao menos 6 caracteres."); return; }
    setBusy(true);
    const r = await adminUsuarios("reset_senha", { id: user.id, senha: s });
    setBusy(false);
    if (r.error) { alert("⚠️ " + r.error); return; }
    registrarAuditoria(sb, currentUser, "redefinir senha", user.username, {});
    alert(`✓ Senha redefinida para ${user.username}.`);
  }

  async function alternarAtivo(user) {
    const acao = user.ativo ? "desativar" : "reativar";
    if (!confirm(`Deseja ${acao} o acesso de "${user.username}"?`)) return;
    setBusy(true);
    const r = await adminUsuarios("set_ativo", { id: user.id, ativo: !user.ativo });
    setBusy(false);
    if (r.error) { alert("⚠️ " + r.error); return; }
    registrarAuditoria(sb, currentUser, `${acao} usuário`, user.username, {});
    recarregar();
  }

  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const th = { padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" };
  const td = { padding: "10px 14px", borderBottom: "1px solid var(--border)" };
  const miniBtn = (cor) => ({ background: "transparent", color: cor, border: `1px solid ${cor}55`, borderRadius: 6, padding: "5px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11.5 });

  return (
    <>
      {/* Criar usuário */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem", maxWidth: 760 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Criar usuário</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Nome completo</label><input value={nNome} onChange={e => { setNNome(e.target.value); setCMsg(""); }} placeholder="Ex.: Maria Silva" style={{ ...inp, width: "100%", marginTop: 4 }} /></div>
          <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Usuário (login)</label><input value={nUser} onChange={e => { setNUser(e.target.value); setCMsg(""); }} placeholder="ex.: maria" autoComplete="off" style={{ ...inp, width: "100%", marginTop: 4, fontFamily: "JetBrains Mono, monospace" }} /></div>
          <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Cargo / perfil de acesso *</label>
            <select value={nPerfil} onChange={e => { escolherPerfil(e.target.value); setCMsg(""); }} style={{ ...inp, width: "100%", marginTop: 4 }}>
              <option value="">Escolha o cargo…</option>
              {perfisDisp.map(p => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
            </select>
          </div>
          <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Senha inicial (mín. 6)</label><input type="text" value={nSenha} onChange={e => { setNSenha(e.target.value); setCMsg(""); }} placeholder="senha temporária" autoComplete="off" style={{ ...inp, width: "100%", marginTop: 4 }} /></div>
        </div>

        {/* O registro de conselho só aparece para quem tem conselho. Pedir
            CRM da recepcionista é o tipo de campo obrigatório que ensina a
            equipe a preencher qualquer coisa para o formulário parar de
            reclamar — e aí o dado inteiro perde o valor. */}
        {nConselho && (
          <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 80px", gap: 10, marginTop: 10 }}>
            <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Conselho</label>
              <input value={nConselho} onChange={e => setNConselho(e.target.value)} style={{ ...inp, width: "100%", marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Número de inscrição</label>
              <input value={nRegistro} onChange={e => setNRegistro(e.target.value)} placeholder="sem o registro, os documentos saem incompletos para a norma" style={{ ...inp, width: "100%", marginTop: 4 }} /></div>
            <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>UF</label>
              <input value={nUf} onChange={e => setNUf(e.target.value)} style={{ ...inp, width: "100%", marginTop: 4 }} /></div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end", marginTop: 10 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.55 }}>
            {nPerfil
              ? <>{perfisDisp.find(p => p.chave === nPerfil)?.descricao}<br />
                  <strong>Sistema:</strong> {ROLES[nRole]?.label} — {ROLES[nRole]?.desc}</>
              : "O cargo define quais módulos a pessoa enxerga, e sugere o papel de sistema e a categoria clínica."}
          </div>
          <div><label style={{ fontSize: 11, color: "var(--text-muted)" }}>Papel de sistema</label>
            <select value={nRole} onChange={e => setNRole(e.target.value)} style={{ ...inp, marginTop: 4, minWidth: 170 }}>
              {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
          <button onClick={criar} disabled={busy} style={{ background: busy ? "#334155" : "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontSize: 13 }}>{busy ? "Salvando…" : "Criar usuário"}</button>
          {cMsg && <span style={{ fontSize: 13, color: cMsg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{cMsg}</span>}
        </div>
      </div>

      {/* Tabela de usuários */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Usuários com acesso {rows ? `(${rows.length})` : ""}</span>
          <button onClick={recarregar} disabled={busy} style={{ ...miniBtn("var(--text-muted)"), border: "1px solid var(--border)" }}>Atualizar</button>
        </div>
        {erro && <div style={{ padding: "12px 16px", color: "#fbbf24", fontSize: 13 }}>⚠️ {erro}</div>}
        {rows === null ? (
          <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: 13 }}>Carregando…</div>
        ) : rows.length === 0 && !erro ? (
          <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: 13 }}>Nenhum usuário.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead><tr>{["Nome", "Usuário", "Cargo (o que enxerga)", "Categoria (o que registra)", "Sistema", "Situação", "Ações"].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(u => {
                const isMe = u.id === currentUser.id;
                const rc = ROLES[u.role] || ROLES.visualizador;
                const cat = CATEGORIAS_CLINICAS[u.categoria];
                const ehAssistencial = u.categoria && u.categoria !== "administrativo";
                return (
                  <Fragment key={u.id}>
                  <tr style={{ background: isMe ? "var(--bg-2)" : "transparent", opacity: u.ativo ? 1 : 0.55 }}>
                    <td style={{ ...td, color: "var(--text)", fontWeight: 600 }}>{u.nome} {isMe && <span style={{ fontSize: 10, background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "1px 6px", marginLeft: 6 }}>você</span>}</td>
                    <td style={{ ...td, fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>{u.username}</td>
                    <td style={td}>
                      <select value={u.perfil || ""} disabled={busy} onChange={e => mudarPerfil(u, e.target.value)}
                        title="O cargo define quais módulos aparecem para esta pessoa"
                        style={{ background: "var(--input-bg)", color: u.perfil ? "var(--text)" : "#d97706",
                                 border: `1px solid ${u.perfil ? "var(--border)" : "#d9770688"}`, borderRadius: 6,
                                 padding: "4px 8px", fontSize: 12, fontWeight: 600, cursor: "pointer", maxWidth: 190 }}>
                        <option value="">— sem cargo —</option>
                        {perfisDisp.map(p => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
                      </select>
                    </td>
                    {/* Categoria clínica: o que a pessoa pode fazer no prontuário
                        (COFEN/CFM), distinto do que ela ENXERGA (cargo). Fica
                        junto porque é a mesma pessoa — antes era outra tabela. */}
                    <td style={td}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: ehAssistencial ? "#2dd4bf" : "var(--text-3)" }}>
                        {cat?.label || "Administrativo"}
                      </span>
                      {ehAssistencial && (
                        u.registro_conselho
                          ? <div style={{ fontSize: 10.5, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{u.conselho || cat?.conselho} {u.registro_conselho}{u.uf_conselho ? "/" + u.uf_conselho : ""}</div>
                          : <div style={{ fontSize: 10, color: "#d97706", marginTop: 2 }}>sem registro de conselho</div>
                      )}
                    </td>
                    <td style={td}>
                      <select value={u.role} disabled={busy} onChange={e => mudarPapel(u, e.target.value)}
                        title={isMe ? "Você não pode rebaixar o seu próprio papel" : rc.desc}
                        style={{ background: rc.color + "18", color: rc.color, border: `1px solid ${rc.color}55`, borderRadius: 6, padding: "4px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        {Object.entries(ROLES).map(([k, r]) => <option key={k} value={k} style={{ background: "var(--surface)", color: "var(--text)" }}>{r.label}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      {u.ativo
                        ? <span style={{ color: "#34d399", fontWeight: 600, fontSize: 12 }}>● Ativo</span>
                        : <span style={{ color: "#fb7185", fontWeight: 600, fontSize: 12 }}>● Inativo</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <button onClick={() => classificando === u.id ? setClassificando(null) : abrirClassificar(u)} disabled={busy} style={miniBtn("#2dd4bf")}>Categoria</button>
                        <button onClick={() => abrirExcecoes(u)} disabled={busy} style={miniBtn("#a78bfa")} title="Liberar ou suspender um módulo só para esta pessoa, fora do padrão do cargo">Exceções</button>
                        <button onClick={() => redefinirSenha(u)} disabled={busy} style={miniBtn("#22d3ee")}>Redefinir senha</button>
                        {!isMe && (u.ativo
                          ? <button onClick={() => alternarAtivo(u)} disabled={busy} style={miniBtn("#fb7185")}>Desativar</button>
                          : <button onClick={() => alternarAtivo(u)} disabled={busy} style={miniBtn("#34d399")}>Reativar</button>)}
                      </div>
                    </td>
                  </tr>
                  {classificando === u.id && (
                    <tr style={{ background: "var(--bg-2)" }}>
                      <td colSpan={7} style={{ ...td, borderBottom: "2px solid var(--border)" }}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 8, lineHeight: 1.5 }}>
                          <strong>Categoria profissional de {u.nome}</strong> — o que ela pode registrar clinicamente.
                          Diagnóstico e prescrição de enfermagem são privativos do enfermeiro (COFEN 736/2024);
                          quem fica <strong>administrativo</strong> não registra ato clínico, mesmo sendo ADM Master.
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Categoria</label>
                            <select value={catForm.categoria} onChange={e => setCatForm(x => ({ ...x, categoria: e.target.value, conselho: CATEGORIAS_CLINICAS[e.target.value]?.conselho || "" }))}
                              style={{ ...inp, minWidth: 180 }}>
                              {Object.entries(CATEGORIAS_CLINICAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Conselho</label>
                            <input value={catForm.conselho} onChange={e => setCatForm(x => ({ ...x, conselho: e.target.value }))} placeholder="CRM" style={{ ...inp, width: 70 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Nº de inscrição</label>
                            <input value={catForm.registro_conselho} onChange={e => setCatForm(x => ({ ...x, registro_conselho: e.target.value }))} placeholder="000000" style={{ ...inp, width: 110 }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>UF</label>
                            <input value={catForm.uf_conselho} onChange={e => setCatForm(x => ({ ...x, uf_conselho: e.target.value }))} placeholder="RS" style={{ ...inp, width: 54 }} />
                          </div>
                          {/* CBO — a coluna existia desde a fase 2 e não tinha
                              onde ser preenchida. É ela que `conferirCbo`
                              compara com os CBOs do procedimento: sem ela, a
                              produção SUS não é glosada, é REJEITADA.
                              A lista de sugestões vem dos CBOs que já estão no
                              catálogo de procedimentos deste hospital — dado
                              real. Não há tabela de CBO chutada aqui: código
                              inventado causa a rejeição que o campo evita. */}
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>CBO</label>
                            <input list="cbos-do-catalogo" value={catForm.cbo || ""}
                              onChange={e => setCatForm(x => ({ ...x, cbo: e.target.value }))}
                              placeholder="0000-00" style={{ ...inp, width: 110 }} />
                            <datalist id="cbos-do-catalogo">
                              {cbosSugeridos.map(c => <option key={c} value={formatarCbo(c)} />)}
                            </datalist>
                          </div>
                          <button onClick={() => salvarCategoria(u)} disabled={busy} style={{ background: "#2dd4bf22", color: "#2dd4bf", border: "1px solid #2dd4bf66", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>{busy ? "…" : "Salvar categoria"}</button>
                          <button onClick={() => { setClassificando(null); setCatMsg(""); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12.5 }}>Cancelar</button>
                          {catMsg && (
                            <div style={{ width: "100%", fontSize: 12, color: "#fb7185", marginTop: 4 }}>{catMsg}</div>
                          )}
                          <div style={{ width: "100%", fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                            O CBO é o código de ocupação (6 dígitos) que vai na produção SUS. Sem ele, o BPA
                            do procedimento deste profissional é <strong>rejeitado</strong> no processamento — não glosado depois.
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {editandoExc === u.id && (() => {
                    const efetivo = permissoesEfetivas(u, { grants: grantsPerfil }, excList);
                    const resumo = resumoDeAcesso(efetivo);
                    const desvios = excecoesAplicadas({ grants: grantsPerfil }, excList);
                    const opcoes = modulosExcecionaveis();
                    const grupos = [...new Set(opcoes.map(o => o.grupo))];
                    const corNivel = { escrita: "#2dd4bf", leitura: "#38bdf8", nenhum: "var(--text-muted)" };
                    return (
                    <tr style={{ background: "var(--bg-2)" }}>
                      <td colSpan={7} style={{ ...td, borderBottom: "2px solid var(--border)" }}>
                        <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5 }}>
                          <strong style={{ color: "#a78bfa" }}>Exceções de acesso de {u.nome}</strong> — libera (ou suspende) um módulo <strong>só para esta pessoa</strong>, sem inventar um cargo novo.
                          O cargo é <strong>{u.perfil ? (perfisDisp.find(p => p.chave === u.perfil)?.nome || u.perfil) : "— sem cargo —"}</strong>; a exceção fica registrada com o motivo e quem concedeu, e vale no próximo login dela.
                        </div>

                        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 12 }}>
                          Hoje enxerga <strong style={{ color: "var(--text)" }}>{resumo.modulos}</strong> módulo(s) · <strong style={{ color: "#2dd4bf" }}>{resumo.escrita}</strong> em Lança ·
                          Prontuário: <strong style={{ color: resumo.alcancaProntuario ? "#2dd4bf" : "var(--text-muted)" }}>{resumo.alcancaProntuario ? "sim" : "não"}</strong>
                        </div>

                        {/* Exceções já aplicadas — o desvio em relação ao cargo */}
                        <div style={{ marginBottom: 12 }}>
                          {desvios.length === 0
                            ? <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem exceções — segue o que o cargo define.</div>
                            : <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {desvios.map(d => {
                                  const ex = excList.find(e => e.modulo === d.modulo);
                                  return (
                                  <div key={d.modulo} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 7, padding: "6px 10px" }}>
                                    <span style={{ fontWeight: 700, color: "var(--text)", minWidth: 150 }}>{d.label}</span>
                                    <span style={{ color: "var(--text-muted)" }}>{rotuloNivel(d.de)} <span style={{ color: d.ampliou ? "#2dd4bf" : "#fb7185", fontWeight: 700 }}>→ {rotuloNivel(d.para)}</span> {d.ampliou ? "↑" : "↓"}</span>
                                    {d.motivo && <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>“{d.motivo}”</span>}
                                    {d.concedido_por && <span style={{ color: "var(--text-muted)", fontSize: 11 }}>por {d.concedido_por}</span>}
                                    {ex && <button onClick={() => tirarExcecao(u, ex)} disabled={busy} style={{ ...miniBtn("#fb7185"), marginLeft: "auto" }}>Remover</button>}
                                  </div>
                                  );
                                })}
                              </div>}
                        </div>

                        {/* Nova exceção */}
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", borderTop: "1px dashed var(--border)", paddingTop: 12 }}>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Módulo</label>
                            <select value={excForm.modulo} onChange={e => { setExcForm(x => ({ ...x, modulo: e.target.value })); setExcMsg(""); }} style={{ ...inp, minWidth: 200 }}>
                              <option value="">Escolha o módulo…</option>
                              {grupos.map(g => (
                                <optgroup key={g} label={g}>
                                  {opcoes.filter(o => o.grupo === g).map(o => <option key={o.chave} value={o.chave}>{o.label}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Nível</label>
                            <select value={excForm.nivel} onChange={e => setExcForm(x => ({ ...x, nivel: e.target.value }))} style={{ ...inp, minWidth: 140, color: corNivel[excForm.nivel] }}>
                              {NIVEIS_EXCECAO.map(n => <option key={n} value={n} style={{ color: "var(--text)" }}>{rotuloNivel(n)}{n === "nenhum" ? " (suspende)" : ""}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <label style={{ fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 }}>Motivo (obrigatório — fica na trilha)</label>
                            <input value={excForm.motivo} onChange={e => { setExcForm(x => ({ ...x, motivo: e.target.value })); setExcMsg(""); }} placeholder="Ex.: cobre a escala do Bloco às quartas" style={{ ...inp, width: "100%" }} />
                          </div>
                          <button onClick={() => liberarExcecao(u)} disabled={busy} style={{ background: "#a78bfa22", color: "#a78bfa", border: "1px solid #a78bfa66", borderRadius: 6, padding: "8px 16px", fontWeight: 700, fontSize: 12.5, cursor: "pointer", whiteSpace: "nowrap" }}>{busy ? "…" : "Liberar"}</button>
                          <button onClick={() => setEditandoExc(null)} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12.5 }}>Fechar</button>
                        </div>
                        {excMsg && <div style={{ marginTop: 10, fontSize: 12.5, color: excMsg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{excMsg}</div>}
                      </td>
                    </tr>
                    );
                  })()}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", maxWidth: 760, lineHeight: 1.6 }}>
        O login é <code style={{ background: "var(--bg-2)", padding: "1px 5px", borderRadius: 4 }}>usuário</code> + senha (o e-mail interno <code style={{ background: "var(--bg-2)", padding: "1px 5px", borderRadius: 4 }}>usuário@hnsn.local</code> é montado automaticamente). Desativar bloqueia o acesso sem apagar o histórico — dá para reativar depois. Toda ação fica na Auditoria.
      </div>
    </>
  );
}

export default function UsersPage({ sb, adminUsuarios, trocarSenha, currentUser }) {
  const [profiles, setProfiles] = useState([]);
  const [np1, setNp1] = useState("");
  const [np2, setNp2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const isMaster = currentUser?.role === "adm_master";
  // A lista carrega para TODO mundo: o adm_master precisa dela para
  // classificar a equipe (antes só carregava para quem NÃO era master, o
  // que deixava justamente o administrador sem a tela).
  // 🔴 CHAMAVA `loadProfiles()` SEM ARGUMENTO NENHUM. A carga ganhou `sb`
  // como primeiro parâmetro na extração e estes dois lugares ficaram para
  // trás: `await sb(...)` com `sb` indefinido estoura, a promessa morre
  // sozinha e a lista simplesmente nunca chega. Nada na tela dizia isso.
  useEffect(() => { loadProfiles(sb).then(setProfiles); }, [isMaster]);
  const recarregarProfiles = () => loadProfiles(sb).then(setProfiles);
  async function handleChangePw() {
    if (busy) return;
    if (np1.length < 6) { setMsg("⚠️ A nova senha precisa de ao menos 6 caracteres."); return; }
    if (np1 !== np2) { setMsg("⚠️ As duas senhas não coincidem."); return; }
    setBusy(true); setMsg("");
    const r = await trocarSenha(np1);
    setBusy(false);
    if (r.ok) { setMsg("✓ Senha alterada com sucesso!"); setNp1(""); setNp2(""); registrarAuditoria(sb, currentUser, "trocar senha", currentUser.username, {}); setTimeout(() => setMsg(""), 3000); }
    else setMsg("⚠️ " + r.error);
  }
  const inp = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
  return (
    <div style={{ padding: "1.5rem", overflowY: "auto", height: "100%" }}>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Usuários e Acesso</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: "1.5rem" }}>Login protegido pelo Supabase Auth</div>

      {isMaster && <PerfisAcesso sb={sb} currentUser={currentUser} usuarios={profiles} onMudou={recarregarProfiles} />}

      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem", maxWidth: 460 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 14 }}>Trocar minha senha</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="password" value={np1} placeholder="Nova senha (mín. 6 caracteres)" onChange={e => { setNp1(e.target.value); setMsg(""); }} style={inp} autoComplete="new-password" />
          <input type="password" value={np2} placeholder="Repita a nova senha" onChange={e => { setNp2(e.target.value); setMsg(""); }} onKeyDown={e => e.key === "Enter" && handleChangePw()} style={inp} autoComplete="new-password" />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handleChangePw} disabled={busy} style={{ background: busy ? "#334155" : "#22d3ee", color: "#000", border: "none", borderRadius: 6, padding: "8px 18px", fontWeight: 700, cursor: busy ? "default" : "pointer", fontSize: 13 }}>{busy ? "Salvando…" : "Trocar senha"}</button>
            {msg && <span style={{ fontSize: 13, color: msg.startsWith("✓") ? "#34d399" : "#fbbf24", fontWeight: 600 }}>{msg}</span>}
          </div>
        </div>
      </div>

      {isMaster ? <AdminUsuarios sb={sb} adminUsuarios={adminUsuarios} currentUser={currentUser} /> : (<>
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, marginBottom: "1.25rem", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 12, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em" }}>Usuários com acesso ({profiles.length})</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead><tr>{["Nome","Usuário","Perfil","Permissões"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>{h}</th>)}</tr></thead>
          <tbody>
            {profiles.map(u => {
              const role = ROLES[u.role] || ROLES.visualizador; const isMe = u.username === currentUser.username;
              return (
                <tr key={u.username} style={{ background: isMe ? "#1a1a28" : "transparent" }}>
                  <td style={{ padding: "10px 14px", color: "var(--text)", fontWeight: 600 }}>{u.nome} {isMe && <span style={{ fontSize: 10, background: "#0e4f5f", color: "#22d3ee", borderRadius: 99, padding: "1px 6px", marginLeft: 6 }}>você</span>}</td>
                  <td style={{ padding: "10px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--text-3)" }}>{u.username}</td>
                  <td style={{ padding: "10px 14px" }}><span style={{ background: role.color + "22", color: role.color, borderRadius: 99, padding: "3px 10px", fontSize: 12, fontWeight: 700 }}>{role.label}</span></td>
                  <td style={{ padding: "10px 14px", fontSize: 11, color: "var(--text-muted)" }}>{role.desc}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#0e2a3d", border: "1px solid #1e4d6b", borderRadius: 10, padding: "1rem 1.25rem", fontSize: 13, color: "#9cc7dd", lineHeight: 1.6, maxWidth: 680 }}>
        <strong style={{ color: "#22d3ee" }}>A gestão de usuários</strong> (criar, editar e redefinir senha) é feita pelo ADM Master, na conta dele. Se precisar de acesso, fale com o administrador do sistema.
      </div>
      </>)}
    </div>
  );
}
