// ═══════════════════════════════════════════════════════════
// ADMISSÃO OBSTÉTRICA — a 1ª tela do módulo (padrão FEBRASGO/MS)
//
// Reúne a gestante, os dados do episódio e a avaliação de admissão. O que o
// sistema calcula sozinho — IG, DPP, IMC, Bishop, MEOWS — vem do motor puro
// (obstetricia.js / meows.js), não de conta feita à mão no fim do plantão.
//
// ⚠️ APOIO, NÃO CONDUTA. O MEOWS e o Bishop sinalizam; quem decide é quem
// examina. Ao salvar, o registro é append-only (nova admissão = nova linha).
// ═══════════════════════════════════════════════════════════

import { useState, useMemo } from "react";
import { igEntre, dppDe, imc, bishop, formatarGtpal, gtpalIncoerencias } from "./obstetricia.js";
import { calcularMeows, NIVEL } from "./meows.js";
import { buscarPacientes, episodioAtivoDaGestante, salvarAdmissao } from "./dados.js";

const TURQ = "#2dd4bf";
const COR_NIVEL = { [NIVEL.VERDE]: "#22c55e", [NIVEL.AMARELO]: "#f59e0b", [NIVEL.VERMELHO]: "#ef4444" };

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5, display: "block" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13.5, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 },
  h: { fontSize: 14, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 9 },
  num: { width: 22, height: 22, borderRadius: 6, background: "var(--surface-3)", color: TURQ, fontFamily: "JetBrains Mono, monospace", fontSize: 12, display: "grid", placeItems: "center" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px" },
};

const n = v => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const isoDia = d => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

function Campo({ label, dica, obrig, span, children }) {
  return (
    <label style={{ display: "block", gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <span style={cx.rotulo}>{label}{obrig && <span style={{ color: "#ef4444" }}> *</span>}</span>
      {children}
      {dica && <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, display: "block" }}>{dica}</span>}
    </label>
  );
}
function Txt(p) { return <input {...p} style={{ ...cx.input, ...p.style }} />; }
function Sel({ opcoes, ...p }) {
  return <select {...p} style={cx.input}>{opcoes.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select>;
}
function Seg({ valor, onChange, opcoes }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {opcoes.map(o => {
        const on = valor === o.v;
        return <button type="button" key={o.v} onClick={() => onChange(o.v)} style={{
          fontSize: 12, padding: "7px 11px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
          border: `1px solid ${on ? TURQ : "var(--border)"}`, background: on ? "color-mix(in srgb,#2dd4bf 16%,transparent)" : "var(--input-bg)",
          color: on ? TURQ : "var(--text-2)", fontWeight: on ? 700 : 500,
        }}>{o.l}</button>;
      })}
    </div>
  );
}
function Secao({ num, titulo, children }) {
  return <section style={cx.card}><div style={cx.h}><span style={cx.num}>{num}</span>{titulo}</div>{children}</section>;
}

const EP0 = { gesta: "", termo: "", prematuro: "", abortos: "", vivos: "", partos_vaginais: "", cesareas: "", dum: "", ig_usg_sem: "", ig_usg_dias: "", tipo_sanguineo: "", rh: "", gestacao_multipla: false, n_fetos: "1", risco: "" };
const PN0 = { fez: "sim", consultas: "", local: "", risco_pn: "", gbs: "", sorologias: "", vacinas: "", obs: "" };
const AD0 = { origem: "espontanea", motivo: "trabalho_de_parto", queixa: "", inicio_sintomas: "", acompanhante: "", acompanhante_vinculo: "", plano: "internar_tp", via_prevista: "vaginal", classificacao_risco: "", sinais_alerta: "" };
const VIT0 = { pa_sis: "", pa_dia: "", fc: "", fr: "", temp: "", sato2: "", dor: "", peso: "", altura: "", consciencia: "alerta" };
const EX0 = { altura_uterina: "", dinamica: "", bcf: "", situacao: "longitudinal", apresentacao: "cefalica", dorso: "", mov_fetais: "presentes" };
const TQ0 = { dilatacao: "", apagamento: "", delee: "", colo_consistencia: "", colo_posicao: "", bolsa: "integra", liquido: "", sangramento: "" };
const ANT0 = { doencas: "", cirurgias: "", alergias: "", medicacoes: "", obstetricos: "", habitos: "", familiares: "" };

export default function AdmissaoObstetrica({ sb, currentUser, canEdit }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [gestante, setGestante] = useState(null);
  const [episodioId, setEpisodioId] = useState(null);
  const [avisoEpisodio, setAvisoEpisodio] = useState(null);

  const [ep, setEp] = useState(EP0);
  const [pn, setPn] = useState(PN0);
  const [ad, setAd] = useState(AD0);
  const [vit, setVit] = useState(VIT0);
  const [ex, setEx] = useState(EX0);
  const [tq, setTq] = useState(TQ0);
  const [ant, setAnt] = useState(ANT0);

  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);

  const setF = set => (k, v) => set(x => ({ ...x, [k]: v }));
  const ce = setF(setEp), cpn = setF(setPn), cad = setF(setAd), cv = setF(setVit), cex = setF(setEx), ct = setF(setTq), cant = setF(setAnt);

  const ig = useMemo(() => igEntre(ep.dum), [ep.dum]);
  const dpp = useMemo(() => dppDe(ep.dum), [ep.dum]);
  const imcV = useMemo(() => imc(vit.peso, vit.altura), [vit.peso, vit.altura]);
  const meows = useMemo(() => calcularMeows(vit), [vit]);
  const bishopR = useMemo(() => bishop({ dilatacao: tq.dilatacao, apagamento: tq.apagamento, altura: tq.delee, consistencia: tq.colo_consistencia, posicao: tq.colo_posicao }), [tq]);
  const gtpalErros = useMemo(() => gtpalIncoerencias({ gesta: ep.gesta, termo: ep.termo, prematuro: ep.prematuro, abortos: ep.abortos, vivos: ep.vivos }), [ep]);

  async function buscar(e) {
    e?.preventDefault?.();
    if (busca.trim().length < 2) { setResultados({ curto: true }); return; }
    setBuscando(true);
    const r = await buscarPacientes(sb, busca);
    setBuscando(false);
    setResultados(r);
  }

  async function escolher(p) {
    setGestante(p); setResultados(null); setBusca("");
    setEpisodioId(null); setAvisoEpisodio(null);
    const aberto = await episodioAtivoDaGestante(sb, p.prontuario).catch(() => null);
    if (aberto) {
      setEpisodioId(aberto.id);
      setAvisoEpisodio(`Já existe um episódio aberto desta gestante (nº ${aberto.id}). A admissão vai pendurar nele — sem duplicar o dossiê.`);
      setEp(x => ({
        ...x,
        gesta: aberto.gesta ?? "", termo: aberto.para_termo ?? "", prematuro: aberto.para_prematuro ?? "",
        abortos: aberto.abortos ?? "", vivos: aberto.filhos_vivos ?? "", dum: aberto.dum ?? "",
        tipo_sanguineo: aberto.tipo_sanguineo ?? "", rh: aberto.rh ?? "", risco: aberto.risco ?? "",
      }));
    }
  }

  function trocar() { setGestante(null); setEpisodioId(null); setAvisoEpisodio(null); setResultado(null); }

  const podeSalvar = gestante && !gtpalErros.length && canEdit && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true); setResultado(null);
    const episodio = {
      prontuario: gestante.prontuario,
      gesta: n(ep.gesta), para_termo: n(ep.termo), para_prematuro: n(ep.prematuro), abortos: n(ep.abortos), filhos_vivos: n(ep.vivos),
      partos_vaginais: n(ep.partos_vaginais), cesareas: n(ep.cesareas),
      dum: ep.dum || null, dpp: dpp ? isoDia(dpp) : null,
      ig_dum_semanas: ig?.semanas ?? null, ig_dum_dias: ig?.dias ?? null,
      ig_usg_semanas: n(ep.ig_usg_sem), ig_usg_dias: n(ep.ig_usg_dias),
      tipo_sanguineo: ep.tipo_sanguineo || null, rh: ep.rh || null,
      gestacao_multipla: !!ep.gestacao_multipla, n_fetos: n(ep.n_fetos) || 1,
      pre_natal: pn, risco: ad.classificacao_risco || ep.risco || null, status: "em_andamento",
    };
    const admissao = {
      data_hora: new Date().toISOString(), profissional: currentUser?.name || null,
      origem: ad.origem, motivo: ad.motivo, queixa: ad.queixa || null, inicio_sintomas: ad.inicio_sintomas || null,
      acompanhante: ad.acompanhante || null, acompanhante_vinculo: ad.acompanhante_vinculo || null,
      antecedentes: ant, vitais: { ...vit, imc: imcV },
      meows: meows.avaliado ? meows.total : null,
      exame_obstetrico: ex, toque: { ...tq, bishop: bishopR.completo ? bishopR.score : null },
      classificacao_risco: ad.classificacao_risco || null, sinais_alerta: ad.sinais_alerta || null,
      plano: ad.plano, via_prevista: ad.via_prevista, consentimentos: null,
    };
    const r = await salvarAdmissao(sb, { episodio, admissao, episodioId }, currentUser);
    setSalvando(false);
    setResultado(r);
    if (r.ok) {
      setEpisodioId(r.episodioId);
      setAvisoEpisodio(null);
    }
  }

  // ── sem gestante escolhida: só o seletor ────────────────────
  if (!gestante) {
    return (
      <div>
        <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 12px" }}>
          Comece pela gestante. Ela precisa estar cadastrada (o cadastro é no Atendimento).
        </p>
        <form onSubmit={buscar} style={{ display: "flex", gap: 8, marginBottom: 12, maxWidth: 520 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, CPF, CNS ou prontuário…" style={cx.input} autoFocus />
          <button type="submit" disabled={buscando} style={{ background: TURQ, color: "#062a26", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}>
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {resultados?.curto && <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>Digite ao menos 2 caracteres.</p>}
        {resultados?.ok === false && <p style={{ color: "#fca5a5", fontSize: 12.5 }}>{resultados.motivo}</p>}
        {resultados?.ok && resultados.lista?.length === 0 && !resultados.curto && <p style={{ color: "var(--text-muted)", fontSize: 12.5 }}>Nenhuma paciente encontrada. Confira o cadastro no Atendimento.</p>}
        {resultados?.lista?.length > 0 && (
          <div style={{ ...cx.card, padding: 6, maxWidth: 620 }}>
            {resultados.lista.map(p => (
              <button key={p.prontuario} onClick={() => escolher(p)} style={{
                display: "flex", justifyContent: "space-between", gap: 12, width: "100%", textAlign: "left",
                background: "transparent", border: "none", borderRadius: 8, padding: "9px 12px", cursor: "pointer", color: "var(--text)", fontFamily: "inherit",
              }} onMouseEnter={e => e.currentTarget.style.background = "var(--surface-3)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.nome_completo || p.iniciais || "—"}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{p.prontuario}{p.data_nascimento ? ` · ${p.data_nascimento.split("-").reverse().join("/")}` : ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── gestante escolhida: o formulário ────────────────────────
  return (
    <div>
      {/* Banner da gestante + resumo calculado */}
      <div style={{ ...cx.card, borderLeft: `2px solid ${TURQ}`, display: "flex", flexWrap: "wrap", gap: "10px 22px", alignItems: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 800 }}>{gestante.nome_completo || gestante.iniciais}
          <span style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)", marginTop: 2, fontFamily: "JetBrains Mono, monospace" }}>{gestante.prontuario}{gestante.data_nascimento ? ` · ${gestante.data_nascimento.split("-").reverse().join("/")}` : ""}</span>
        </div>
        {formatarGtpal({ gesta: ep.gesta, termo: ep.termo, prematuro: ep.prematuro, abortos: ep.abortos, vivos: ep.vivos }) && <span style={cx.chip}>{formatarGtpal({ gesta: ep.gesta, termo: ep.termo, prematuro: ep.prematuro, abortos: ep.abortos, vivos: ep.vivos })}</span>}
        {ig && <span style={cx.chip}>IG (DUM) {ig.semanas}s{ig.dias}d</span>}
        {dpp && <span style={cx.chip}>DPP {isoDia(dpp).split("-").reverse().join("/")}</span>}
        {imcV != null && <span style={cx.chip}>IMC {imcV}</span>}
        {meows.avaliado && <span style={{ ...cx.chip, color: COR_NIVEL[meows.nivel], borderColor: COR_NIVEL[meows.nivel] }}>MEOWS {meows.total} · {meows.nivel}</span>}
        <button onClick={trocar} style={{ marginLeft: "auto", background: "transparent", color: "var(--text-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 13px", cursor: "pointer", fontSize: 12 }}>Trocar gestante</button>
      </div>

      {avisoEpisodio && <div style={{ background: "#0e364433", border: "1px solid #38bdf855", borderRadius: 8, padding: "9px 13px", marginBottom: 14, fontSize: 12.5, color: "#7dd3fc" }}>{avisoEpisodio}</div>}

      <Secao num="1" titulo="Admissão">
        <div style={cx.grid}>
          <Campo label="Origem" obrig><Seg valor={ad.origem} onChange={v => cad("origem", v)} opcoes={[{ v: "espontanea", l: "Espontânea" }, { v: "pre_natal", l: "Do pré-natal" }, { v: "transferencia", l: "Transferência" }]} /></Campo>
          <Campo label="Motivo" obrig span={2}><Seg valor={ad.motivo} onChange={v => cad("motivo", v)} opcoes={[{ v: "trabalho_de_parto", l: "Trabalho de parto" }, { v: "cesarea_eletiva", l: "Cesárea eletiva" }, { v: "inducao", l: "Indução" }, { v: "intercorrencia", l: "Intercorrência" }, { v: "avaliacao", l: "Avaliação" }]} /></Campo>
          <Campo label="Início dos sintomas"><Txt type="datetime-local" value={ad.inicio_sintomas} onChange={e => cad("inicio_sintomas", e.target.value)} /></Campo>
          <Campo label="Queixa principal" obrig span={4}><textarea rows={2} value={ad.queixa} onChange={e => cad("queixa", e.target.value)} style={{ ...cx.input, resize: "vertical" }} placeholder="Contrações, perda de líquido, sangramento, movimentos fetais…" /></Campo>
        </div>
      </Secao>

      <Secao num="2" titulo="Identificação & acompanhante">
        <div style={cx.grid}>
          <Campo label="Acompanhante" span={2}><Txt value={ad.acompanhante} onChange={e => cad("acompanhante", e.target.value)} /></Campo>
          <Campo label="Vínculo" dica="Direito garantido — Lei 11.108/2005."><Txt value={ad.acompanhante_vinculo} onChange={e => cad("acompanhante_vinculo", e.target.value)} placeholder="cônjuge, mãe…" /></Campo>
        </div>
      </Secao>

      <Secao num="3" titulo="Dados gestacionais">
        <div style={cx.grid}>
          <Campo label="Gestações (G)" obrig><Txt type="number" min="0" value={ep.gesta} onChange={e => ce("gesta", e.target.value)} /></Campo>
          <Campo label="Termo (T)"><Txt type="number" min="0" value={ep.termo} onChange={e => ce("termo", e.target.value)} /></Campo>
          <Campo label="Prematuros (P)"><Txt type="number" min="0" value={ep.prematuro} onChange={e => ce("prematuro", e.target.value)} /></Campo>
          <Campo label="Abortos (A)"><Txt type="number" min="0" value={ep.abortos} onChange={e => ce("abortos", e.target.value)} /></Campo>
          <Campo label="Vivos (V)"><Txt type="number" min="0" value={ep.vivos} onChange={e => ce("vivos", e.target.value)} /></Campo>
          <Campo label="Partos vaginais"><Txt type="number" min="0" value={ep.partos_vaginais} onChange={e => ce("partos_vaginais", e.target.value)} /></Campo>
          <Campo label="Cesáreas anteriores"><Txt type="number" min="0" value={ep.cesareas} onChange={e => ce("cesareas", e.target.value)} /></Campo>
          <Campo label="DUM" dica={ig ? `IG pela DUM: ${ig.semanas}s ${ig.dias}d` : "define IG e DPP"}><Txt type="date" value={ep.dum} onChange={e => ce("dum", e.target.value)} /></Campo>
          <Campo label="IG USG — semanas" dica="A USG do 1º tri prevalece."><Txt type="number" min="0" max="45" value={ep.ig_usg_sem} onChange={e => ce("ig_usg_sem", e.target.value)} /></Campo>
          <Campo label="IG USG — dias"><Txt type="number" min="0" max="6" value={ep.ig_usg_dias} onChange={e => ce("ig_usg_dias", e.target.value)} /></Campo>
          <Campo label="Tipo sanguíneo" obrig><Sel value={ep.tipo_sanguineo} onChange={e => ce("tipo_sanguineo", e.target.value)} opcoes={[{ v: "", l: "—" }, { v: "A", l: "A" }, { v: "B", l: "B" }, { v: "AB", l: "AB" }, { v: "O", l: "O" }]} /></Campo>
          <Campo label="Fator Rh" obrig><Seg valor={ep.rh} onChange={v => ce("rh", v)} opcoes={[{ v: "+", l: "Rh +" }, { v: "-", l: "Rh −" }]} /></Campo>
          <Campo label="Gestação"><Seg valor={ep.gestacao_multipla ? "m" : "u"} onChange={v => ce("gestacao_multipla", v === "m")} opcoes={[{ v: "u", l: "Única" }, { v: "m", l: "Múltipla" }]} /></Campo>
          <Campo label="Nº de fetos"><Txt type="number" min="1" value={ep.n_fetos} onChange={e => ce("n_fetos", e.target.value)} /></Campo>
        </div>
        {gtpalErros.length > 0 && <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: "#fca5a5", fontSize: 12.5 }}>{gtpalErros.map((x, i) => <li key={i}>{x}</li>)}</ul>}
      </Secao>

      <Secao num="4" titulo="Pré-natal">
        <div style={cx.grid}>
          <Campo label="Fez pré-natal?"><Seg valor={pn.fez} onChange={v => cpn("fez", v)} opcoes={[{ v: "sim", l: "Sim" }, { v: "nao", l: "Não" }]} /></Campo>
          <Campo label="Nº de consultas"><Txt type="number" min="0" value={pn.consultas} onChange={e => cpn("consultas", e.target.value)} /></Campo>
          <Campo label="Local"><Txt value={pn.local} onChange={e => cpn("local", e.target.value)} /></Campo>
          <Campo label="Risco no pré-natal"><Seg valor={pn.risco_pn} onChange={v => cpn("risco_pn", v)} opcoes={[{ v: "habitual", l: "Habitual" }, { v: "alto", l: "Alto risco" }]} /></Campo>
          <Campo label="GBS (estreptococo B)" dica="Positivo → lembra profilaxia intraparto."><Seg valor={pn.gbs} onChange={v => cpn("gbs", v)} opcoes={[{ v: "negativo", l: "Negativo" }, { v: "positivo", l: "Positivo" }, { v: "desconhecido", l: "Desconhecido" }]} /></Campo>
          <Campo label="Sorologias / exames" span={2}><Txt value={pn.sorologias} onChange={e => cpn("sorologias", e.target.value)} placeholder="HIV, VDRL, HBsAg, Hb, glicemia…" /></Campo>
          <Campo label="Vacinas"><Txt value={pn.vacinas} onChange={e => cpn("vacinas", e.target.value)} placeholder="dTpa, influenza" /></Campo>
        </div>
        {pn.gbs === "positivo" && <div style={{ marginTop: 12, background: "#7f5b0022", border: "1px solid #f59e0b55", borderRadius: 8, padding: "9px 13px", fontSize: 12.5, color: "#fcd34d" }}><strong>GBS positivo.</strong> Lembrete de profilaxia intraparto (penicilina) — a conduta é da equipe.</div>}
      </Secao>

      <Secao num="5" titulo="Antecedentes">
        <div style={cx.grid}>
          <Campo label="Doenças prévias" span={2}><Txt value={ant.doencas} onChange={e => cant("doencas", e.target.value)} placeholder="HAS, DM…" /></Campo>
          <Campo label="Cirurgias / cesáreas" span={2}><Txt value={ant.cirurgias} onChange={e => cant("cirurgias", e.target.value)} /></Campo>
          <Campo label="Alergias"><Txt value={ant.alergias} onChange={e => cant("alergias", e.target.value)} /></Campo>
          <Campo label="Medicamentos em uso"><Txt value={ant.medicacoes} onChange={e => cant("medicacoes", e.target.value)} /></Campo>
          <Campo label="Antecedentes obstétricos" span={2}><Txt value={ant.obstetricos} onChange={e => cant("obstetricos", e.target.value)} /></Campo>
          <Campo label="Hábitos"><Txt value={ant.habitos} onChange={e => cant("habitos", e.target.value)} placeholder="tabagismo, álcool…" /></Campo>
          <Campo label="Familiares"><Txt value={ant.familiares} onChange={e => cant("familiares", e.target.value)} /></Campo>
        </div>
      </Secao>

      <Secao num="6" titulo="Sinais vitais & exame físico">
        <div style={cx.grid}>
          <Campo label="PA sistólica" obrig><Txt type="number" value={vit.pa_sis} onChange={e => cv("pa_sis", e.target.value)} placeholder="mmHg" /></Campo>
          <Campo label="PA diastólica" obrig><Txt type="number" value={vit.pa_dia} onChange={e => cv("pa_dia", e.target.value)} placeholder="mmHg" /></Campo>
          <Campo label="FC" obrig><Txt type="number" value={vit.fc} onChange={e => cv("fc", e.target.value)} placeholder="bpm" /></Campo>
          <Campo label="FR"><Txt type="number" value={vit.fr} onChange={e => cv("fr", e.target.value)} placeholder="irpm" /></Campo>
          <Campo label="Temperatura" obrig><Txt type="number" step="0.1" value={vit.temp} onChange={e => cv("temp", e.target.value)} placeholder="°C" /></Campo>
          <Campo label="SatO₂"><Txt type="number" value={vit.sato2} onChange={e => cv("sato2", e.target.value)} placeholder="%" /></Campo>
          <Campo label="Dor (0–10)"><Txt type="number" min="0" max="10" value={vit.dor} onChange={e => cv("dor", e.target.value)} /></Campo>
          <Campo label="Consciência"><Sel value={vit.consciencia} onChange={e => cv("consciencia", e.target.value)} opcoes={[{ v: "alerta", l: "Alerta" }, { v: "resposta_voz", l: "Resp. à voz" }, { v: "resposta_dor", l: "Resp. à dor" }, { v: "irresponsivo", l: "Irresponsivo" }]} /></Campo>
          <Campo label="Peso (kg)"><Txt type="number" step="0.1" value={vit.peso} onChange={e => cv("peso", e.target.value)} /></Campo>
          <Campo label="Altura (m)" dica={imcV != null ? `IMC ${imcV}` : ""}><Txt type="number" step="0.01" value={vit.altura} onChange={e => cv("altura", e.target.value)} /></Campo>
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ ...cx.chip, fontSize: 13, color: meows.avaliado ? COR_NIVEL[meows.nivel] : "var(--text-muted)", borderColor: meows.avaliado ? COR_NIVEL[meows.nivel] : "var(--border)" }}>
            MEOWS {meows.avaliado ? `${meows.total} · ${meows.nivel.toUpperCase()}` : "—"}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{meows.avaliado ? "1 vermelho ou 2 amarelos = chamar. Apoio, não conduta." : "Preencha os vitais para o MEOWS."}</span>
        </div>
      </Secao>

      <Secao num="7" titulo="Exame obstétrico">
        <div style={cx.grid}>
          <Campo label="Altura uterina (cm)"><Txt type="number" value={ex.altura_uterina} onChange={e => cex("altura_uterina", e.target.value)} /></Campo>
          <Campo label="Dinâmica uterina" obrig span={2}><Txt value={ex.dinamica} onChange={e => cex("dinamica", e.target.value)} placeholder="3 contr./10min · 40s · moderadas" /></Campo>
          <Campo label="BCF (bpm)" obrig dica="Sonar/Pinard ou CTG."><Txt type="number" value={ex.bcf} onChange={e => cex("bcf", e.target.value)} /></Campo>
          <Campo label="Situação"><Seg valor={ex.situacao} onChange={v => cex("situacao", v)} opcoes={[{ v: "longitudinal", l: "Longitudinal" }, { v: "transversa", l: "Transversa" }]} /></Campo>
          <Campo label="Apresentação" obrig><Seg valor={ex.apresentacao} onChange={v => cex("apresentacao", v)} opcoes={[{ v: "cefalica", l: "Cefálica" }, { v: "pelvica", l: "Pélvica" }, { v: "cormica", l: "Córmica" }]} /></Campo>
          <Campo label="Dorso / posição"><Txt value={ex.dorso} onChange={e => cex("dorso", e.target.value)} /></Campo>
          <Campo label="Movimentos fetais"><Seg valor={ex.mov_fetais} onChange={v => cex("mov_fetais", v)} opcoes={[{ v: "presentes", l: "Presentes" }, { v: "reduzidos", l: "Reduzidos" }, { v: "ausentes", l: "Ausentes" }]} /></Campo>
        </div>
      </Secao>

      <Secao num="8" titulo="Toque vaginal — exame de admissão">
        <div style={cx.grid}>
          <Campo label="Dilatação (cm)" obrig><Txt type="number" min="0" max="10" value={tq.dilatacao} onChange={e => ct("dilatacao", e.target.value)} /></Campo>
          <Campo label="Apagamento (%)"><Txt type="number" min="0" max="100" value={tq.apagamento} onChange={e => ct("apagamento", e.target.value)} /></Campo>
          <Campo label="Altura (De Lee)" dica="−3 a +3"><Txt type="number" min="-3" max="3" value={tq.delee} onChange={e => ct("delee", e.target.value)} /></Campo>
          <Campo label="Colo — consistência"><Sel value={tq.colo_consistencia} onChange={e => ct("colo_consistencia", e.target.value)} opcoes={[{ v: "", l: "—" }, { v: "firme", l: "Firme" }, { v: "media", l: "Média" }, { v: "amolecida", l: "Amolecida" }]} /></Campo>
          <Campo label="Colo — posição"><Sel value={tq.colo_posicao} onChange={e => ct("colo_posicao", e.target.value)} opcoes={[{ v: "", l: "—" }, { v: "posterior", l: "Posterior" }, { v: "central", l: "Central" }, { v: "anterior", l: "Anterior" }]} /></Campo>
          <Campo label="Bolsa"><Seg valor={tq.bolsa} onChange={v => ct("bolsa", v)} opcoes={[{ v: "integra", l: "Íntegra" }, { v: "rota", l: "Rota" }]} /></Campo>
          <Campo label="Líquido (se rota)"><Sel value={tq.liquido} onChange={e => ct("liquido", e.target.value)} opcoes={[{ v: "", l: "—" }, { v: "claro", l: "Claro" }, { v: "meconial", l: "Meconial" }, { v: "sanguinolento", l: "Sanguinolento" }]} /></Campo>
          <Campo label="Sangramento vaginal"><Txt value={tq.sangramento} onChange={e => ct("sangramento", e.target.value)} placeholder="ausente / presente" /></Campo>
        </div>
        <div style={{ marginTop: 12 }}>
          <span style={cx.chip}>Índice de Bishop {bishopR.completo ? bishopR.score : `${bishopR.score} (incompleto)`}</span>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 10 }}>Só relevante para indução.</span>
        </div>
      </Secao>

      <Secao num="9" titulo="Avaliação de risco & plano">
        <div style={cx.grid}>
          <Campo label="Classificação de risco" obrig span={2}><Seg valor={ad.classificacao_risco} onChange={v => cad("classificacao_risco", v)} opcoes={[{ v: "habitual", l: "Habitual" }, { v: "intermediario", l: "Intermediário" }, { v: "alto", l: "Alto risco" }]} /></Campo>
          <Campo label="Sinais de alerta ativos" span={2}><Txt value={ad.sinais_alerta} onChange={e => cad("sinais_alerta", e.target.value)} placeholder="DMG, GBS+, cesárea anterior…" /></Campo>
          <Campo label="Hipótese / conduta" obrig span={3}><Seg valor={ad.plano} onChange={v => cad("plano", v)} opcoes={[{ v: "internar_tp", l: "Internar em trabalho de parto" }, { v: "induzir", l: "Induzir" }, { v: "cesarea", l: "Cesárea" }, { v: "observacao", l: "Observação" }, { v: "alta", l: "Alta" }]} /></Campo>
          <Campo label="Via de parto prevista"><Seg valor={ad.via_prevista} onChange={v => cad("via_prevista", v)} opcoes={[{ v: "vaginal", l: "Vaginal" }, { v: "cesarea", l: "Cesárea" }]} /></Campo>
        </div>
      </Secao>

      {/* Salvar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
        {canEdit
          ? <button onClick={salvar} disabled={!podeSalvar} style={{
              background: podeSalvar ? "#22c55e" : "var(--surface-3)", color: podeSalvar ? "#052e16" : "var(--text-muted)",
              border: "none", borderRadius: 9, padding: "11px 26px", fontWeight: 700, cursor: podeSalvar ? "pointer" : "not-allowed", fontSize: 14,
            }}>{salvando ? "Gravando…" : "Salvar admissão"}</button>
          : <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Seu perfil consulta, mas não lança nesta tela.</span>}
        <span style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Ao salvar, o registro vira append-only — correção é nova anotação.</span>
      </div>

      {resultado && (
        <div role="status" style={{
          marginTop: 12, borderRadius: 8, padding: "11px 15px", fontSize: 13,
          background: resultado.ok ? "#052e1633" : "#7f1d1d22", border: `1px solid ${resultado.ok ? "#22c55e55" : "#ef444455"}`, color: resultado.ok ? "#86efac" : "#fca5a5",
        }}>
          {resultado.ok
            ? <><strong>Admissão gravada.</strong> Episódio nº {resultado.episodioId}. A gestante está internada e o dossiê está aberto.</>
            : <><strong>Não gravei.</strong> {resultado.motivo}</>}
        </div>
      )}
    </div>
  );
}
