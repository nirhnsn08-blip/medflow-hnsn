// ═══════════════════════════════════════════════════════════
// PERFIS DE ACESSO — a tela
//
// O fluxo real do hospital: o gestor pede "cria um acesso para a enfermeira
// nova", a TI escolhe o perfil "Enfermeiro(a)" e pronto. O caso geral tem
// que ser um clique; o desvio é que dá trabalho, e está certo assim.
//
// A tela mostra o quadro inteiro — quais módulos cada perfil alcança, e
// quantas pessoas usam cada um — porque permissão que não se enxerga não se
// audita. É deliberado que a matriz caiba numa tela só.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo } from "react";
import { MODULOS, GRUPOS, NIVEIS, NIVEL_LABEL, MODULO_POR_CHAVE } from "./modulos.js";
import { conferirPerfil, podeSalvarPerfil, quantosUsam, permissoesEfetivas, resumoDeAcesso } from "./permissoes.js";
import { CATEGORIAS as CATEGORIAS_CLINICAS } from "../clinico/papeis.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.25rem", marginBottom: "1.25rem" };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 10 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };
const cel = { padding: "7px 10px", fontSize: 12.5, borderBottom: "1px solid var(--border)" };

const CICLO = ["nenhum", "leitura", "escrita"];

export default function PerfisAcesso({ sb, currentUser, usuarios = [], onMudou }) {
  const [perfis, setPerfis] = useState(null);
  const [grants, setGrants] = useState({});          // { perfil: { modulo: nivel } }
  const [edit, setEdit] = useState(null);            // chave do perfil em edição
  const [rascunho, setRascunho] = useState(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setErro("");
    const [ps, gs] = await Promise.all([
      sb("perfis_acesso?select=*&order=nome").catch(() => null),
      sb("perfis_permissoes?select=*").catch(() => null),
    ]);
    if (!Array.isArray(ps)) {
      setPerfis([]);
      setErro("Não foi possível ler os perfis. Confirme que a migração `migracao-perfis-acesso.sql` foi aplicada neste banco.");
      return;
    }
    const mapa = {};
    for (const g of (Array.isArray(gs) ? gs : [])) (mapa[g.perfil_chave] ||= {})[g.modulo] = g.nivel;
    setPerfis(ps); setGrants(mapa);
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, []);

  function abrir(p) {
    setRascunho({ ...p, grants: { ...(grants[p.chave] || {}) } });
    setEdit(p.chave);
  }

  function alternar(modulo) {
    setRascunho(r => {
      const atual = r.grants[modulo] || "nenhum";
      const prox = CICLO[(CICLO.indexOf(atual) + 1) % CICLO.length];
      const g = { ...r.grants };
      if (prox === "nenhum") delete g[modulo]; else g[modulo] = prox;
      return { ...r, grants: g };
    });
  }

  async function salvar() {
    const avisos = conferirPerfil(rascunho, { usuarios });
    if (!podeSalvarPerfil(avisos)) return;
    const afetados = quantosUsam(rascunho.chave, usuarios);
    if (afetados > 0 && !confirm(
      `Esta alteração vale imediatamente para ${afetados} usuário(s) que usam o perfil "${rascunho.nome}".\n\nConfirma?`)) return;

    setSalvando(true);
    // O cabeçalho primeiro; as permissões depois. Se a segunda parte falhar,
    // o perfil continua com as permissões antigas — e não sem nenhuma, que
    // trancaria as pessoas do lado de fora.
    await sb(`perfis_acesso?chave=eq.${encodeURIComponent(rascunho.chave)}`, {
      method: "PATCH", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        nome: rascunho.nome, descricao: rascunho.descricao || null,
        categoria_sugerida: rascunho.categoria_sugerida || null,
        role_sugerido: rascunho.role_sugerido || null,
        atualizado_em: new Date().toISOString(), usuario: currentUser?.name || null,
      }),
    });
    // Substitui o conjunto: apaga o que havia e regrava. As linhas de
    // permissão não são registro clínico — aqui apagar é o certo, senão
    // grant removido na tela sobreviveria no banco.
    await sb(`perfis_permissoes?perfil_chave=eq.${encodeURIComponent(rascunho.chave)}`, { method: "DELETE" });
    const linhas = Object.entries(rascunho.grants)
      .filter(([, n]) => n && n !== "nenhum")
      .map(([modulo, nivel]) => ({ perfil_chave: rascunho.chave, modulo, nivel }));
    if (linhas.length) await sb("perfis_permissoes", { method: "POST", body: JSON.stringify(linhas) });

    setSalvando(false); setEdit(null); setRascunho(null);
    await carregar(); onMudou?.();
  }

  if (perfis === null) return <div style={{ ...cartao, color: "var(--text-muted)", fontSize: 13 }}>Carregando perfis…</div>;

  return (
    <div>
      <AvisoEscopo />

      {erro && (
        <div style={{ ...cartao, borderLeft: "4px solid #f43f5e", fontSize: 12.5, color: "#f43f5e" }}>{erro}</div>
      )}

      {edit && rascunho
        ? <Editor rascunho={rascunho} setRascunho={setRascunho} alternar={alternar}
            usuarios={usuarios} salvando={salvando} onSalvar={salvar}
            onCancelar={() => { setEdit(null); setRascunho(null); }} />
        : <Matriz perfis={perfis} grants={grants} usuarios={usuarios} onAbrir={abrir} />}
    </div>
  );
}

// ── AVISO DE ESCOPO ─────────────────────────────────────────
// Fica no topo, permanente e sem enfeite. O risco desta fase não é técnico,
// é de interpretação: alguém olhar a matriz bonita e concluir que os dados
// estão segregados. Não estão — ainda.
function AvisoEscopo() {
  return (
    <div style={{ ...cartao, borderLeft: "4px solid #d97706", background: "#d9770610" }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#d97706", marginBottom: 5 }}>
        Esta tela organiza o menu — ainda não é barreira de dados
      </div>
      <div style={{ fontSize: 12.3, color: "var(--text-3)", lineHeight: 1.6 }}>
        O perfil define o que cada pessoa <strong>vê no sistema</strong>, o que reduz exposição acidental
        e deixa cada um com a tela do seu trabalho. Mas as políticas de leitura do banco ainda são
        abertas a qualquer usuário autenticado: quem souber usar a API alcança dado que o menu esconde.
        <br />
        Fechar isso de verdade é a próxima etapa, e ela exige medir antes quem realmente acessa o quê —
        apertar no escuro tira acesso de quem tem direito no meio do plantão.
        <strong> Até lá, não apresentar ao hospital como “acesso segregado”.</strong>
      </div>
    </div>
  );
}

// ── MATRIZ ──────────────────────────────────────────────────
function Matriz({ perfis, grants, usuarios, onAbrir }) {
  const ativos = perfis.filter(p => p.ativo !== false);
  return (
    <div style={cartao}>
      <div style={rotulo}>Perfis de acesso ({ativos.length})</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12, lineHeight: 1.55 }}>
        Cada coluna é um módulo. <strong style={{ color: "#2dd4bf" }}>Lança</strong> escreve,
        {" "}<strong style={{ color: "#38bdf8" }}>Consulta</strong> só lê, vazio é sem acesso.
        Clique num perfil para ajustar.
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ ...cel, textAlign: "left", position: "sticky", left: 0, background: "var(--surface)" }}>Perfil</th>
              <th style={{ ...cel, textAlign: "center" }}>Pessoas</th>
              {MODULOS.map(m => (
                <th key={m.chave} title={m.nota || m.label}
                  style={{ ...cel, fontSize: 9.5, textTransform: "uppercase", letterSpacing: ".04em",
                           color: m.clinico ? "#a78bfa" : "var(--text-muted)", writingMode: "vertical-rl",
                           transform: "rotate(180deg)", height: 116, whiteSpace: "nowrap", padding: "6px 2px" }}>
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ativos.map(p => {
              const g = grants[p.chave] || {};
              const n = quantosUsam(p.chave, usuarios);
              return (
                <tr key={p.chave} onClick={() => onAbrir(p)} style={{ cursor: "pointer" }}>
                  <td style={{ ...cel, position: "sticky", left: 0, background: "var(--surface)" }}>
                    <strong>{p.nome}</strong>
                    {p.sistema && <span style={{ fontSize: 9.5, color: "#d97706", marginLeft: 6, fontWeight: 800 }}>SISTEMA</span>}
                    <div style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{p.descricao}</div>
                  </td>
                  <td style={{ ...cel, textAlign: "center", color: n ? "var(--text)" : "var(--text-muted)", fontWeight: n ? 700 : 400 }}>{n}</td>
                  {MODULOS.map(m => {
                    const nivel = g[m.chave] || "nenhum";
                    const c = NIVEL_LABEL[nivel].cor;
                    return (
                      <td key={m.chave} title={`${m.label}: ${NIVEL_LABEL[nivel].label}`}
                        style={{ ...cel, textAlign: "center", padding: "6px 2px" }}>
                        {nivel === "nenhum"
                          ? <span style={{ color: "var(--border)" }}>·</span>
                          : <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 3,
                                           background: nivel === "escrita" ? c : "transparent",
                                           border: `2px solid ${c}` }} />}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── EDITOR ──────────────────────────────────────────────────
function Editor({ rascunho, setRascunho, alternar, usuarios, salvando, onSalvar, onCancelar }) {
  const avisos = useMemo(() => conferirPerfil(rascunho, { usuarios }), [rascunho, usuarios]);
  const pode = podeSalvarPerfil(avisos);
  const resumo = resumoDeAcesso(permissoesEfetivas({ role: rascunho.role_sugerido }, rascunho));

  return (
    <div style={cartao}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <strong style={{ fontSize: 15 }}>{rascunho.nome}</strong>
        <span style={{ fontSize: 12, color: "var(--text-3)" }}>
          {resumo.modulos} módulo(s) · {resumo.escrita} com lançamento
          {resumo.alcancaProntuario && <strong style={{ color: "#a78bfa" }}> · alcança prontuário</strong>}
        </span>
        <button onClick={onCancelar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12.5, cursor: "pointer" }}>Voltar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div><label style={lbl}>Nome do perfil</label>
          <input value={rascunho.nome || ""} onChange={e => setRascunho(r => ({ ...r, nome: e.target.value }))} style={inp} /></div>
        <div><label style={lbl}>Categoria profissional sugerida</label>
          <select value={rascunho.categoria_sugerida || "administrativo"}
            onChange={e => setRascunho(r => ({ ...r, categoria_sugerida: e.target.value }))} style={inp}>
            {Object.entries(CATEGORIAS_CLINICAS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select></div>
        <div><label style={lbl}>Papel de sistema sugerido</label>
          <select value={rascunho.role_sugerido || "adm_silver"}
            onChange={e => setRascunho(r => ({ ...r, role_sugerido: e.target.value }))} style={inp}>
            <option value="adm_master">ADM Master</option>
            <option value="adm_silver">ADM Silver</option>
            <option value="analista">Analista</option>
            <option value="visualizador">Visualizador</option>
          </select></div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={lbl}>Descrição — é o que a TI lê na hora de escolher</label>
        <input value={rascunho.descricao || ""} onChange={e => setRascunho(r => ({ ...r, descricao: e.target.value }))} style={inp} />
      </div>

      <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 10 }}>
        Clique em cada módulo para alternar: sem acesso → consulta → lança.
      </div>

      {GRUPOS.map(grupo => (
        <div key={grupo} style={{ marginBottom: 14 }}>
          <div style={{ ...rotulo, marginBottom: 7 }}>{grupo}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 8 }}>
            {MODULOS.filter(m => m.grupo === grupo).map(m => {
              const nivel = rascunho.grants[m.chave] || "nenhum";
              const c = NIVEL_LABEL[nivel].cor;
              const travado = m.exigeMaster;
              return (
                <button key={m.chave} onClick={() => !travado && alternar(m.chave)} disabled={travado}
                  title={m.nota || ""}
                  style={{ textAlign: "left", background: nivel === "nenhum" ? "transparent" : c + "12",
                           border: `1px solid ${nivel === "nenhum" ? "var(--border)" : c + "66"}`,
                           borderRadius: 8, padding: "9px 12px", cursor: travado ? "not-allowed" : "pointer",
                           opacity: travado ? .55 : 1, color: "var(--text)" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>
                    {m.label}
                    {m.clinico && <span style={{ fontSize: 9, color: "#a78bfa", marginLeft: 6, fontWeight: 800 }}>CLÍNICO</span>}
                  </div>
                  <div style={{ fontSize: 11, color: c, fontWeight: 700 }}>
                    {travado ? "Sempre ADM Master" : NIVEL_LABEL[nivel].label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {avisos.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 6 }}>
          {avisos.map((a, i) => (
            <div key={i} style={{ fontSize: 12.2, marginBottom: 6, color: a.nivel === "impede" ? "#f43f5e" : "#d97706" }}>
              <strong>{a.nivel === "impede" ? "Impede" : "Atenção"}:</strong> {a.texto}
            </div>
          ))}
        </div>
      )}

      <button onClick={onSalvar} disabled={!pode || salvando}
        style={{ marginTop: 12, background: pode ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                 color: pode ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                 padding: "11px 22px", fontWeight: 800, fontSize: 13.5, cursor: pode ? "pointer" : "not-allowed" }}>
        {salvando ? "Salvando…" : "Salvar perfil"}
      </button>
    </div>
  );
}
