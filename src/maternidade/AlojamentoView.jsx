// ═══════════════════════════════════════════════════════════
// ALOJAMENTO CONJUNTO — a tela (aba Alojamento conjunto)
//
// A última aba da jornada: mãe e bebê no mesmo quarto, avaliados JUNTOS a
// cada turno, até a alta conjunta. Escolhe a puérpera → escolhe o bebê (a
// gemelar tem mais de um) → lança a evolução do binômio.
//
// ── O QUE ESTA TELA SE RECUSA A FAZER ───────────────────────
// Dizer "pode ir para casa" sozinha. O checklist de alta mostra as pendências
// e deixa a decisão com quem examina — mas NÃO deixa a alta passar em silêncio:
// com pendência, a liberação exige um segundo clique que diz, por escrito, do
// que a equipe está ciente.
//
// Os sinais maternos lançados aqui alimentam o painel de Segurança materna —
// é o mesmo `vitais` do partograma. Sem eles, a puérpera envelheceria no
// painel justamente nas horas da hemorragia pós-parto.
// ═══════════════════════════════════════════════════════════

import { useState, useMemo, useEffect } from "react";
import {
  NIVEL, KRAMER, ALEITAMENTO, ROTULO_ALEITAMENTO,
  avaliarBinomio, checklistAlta,
} from "./alojamento.js";
import { calcularMeows, NIVEL as NIVEL_MEOWS } from "./meows.js";
import { vitaisDoRegistro } from "./vigilancia.js";
import {
  buscarPacientes, episodioAtivoDaGestante, carregarPartos,
  carregarRecemNascidos, carregarAlojamento, salvarEvolucaoAlojamento,
} from "./dados.js";

const TURQ = "#2dd4bf";
const COR = { [NIVEL.NORMAL]: "#22c55e", [NIVEL.ATENCAO]: "#f59e0b", [NIVEL.ALERTA]: "#ef4444" };
const COR_MEOWS = { [NIVEL_MEOWS.VERDE]: "#22c55e", [NIVEL_MEOWS.AMARELO]: "#f59e0b", [NIVEL_MEOWS.VERMELHO]: "#ef4444" };

const cx = {
  card: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 13, padding: "16px 18px", marginBottom: 14 },
  rotulo: { fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 5, display: "block" },
  input: { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px", color: "var(--text)", fontSize: 13.5, width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  chip: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontFamily: "JetBrains Mono, monospace", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 },
  h: { fontSize: 14, fontWeight: 700, marginBottom: 12 },
};

const n = v => (v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v));
const b = v => (v === "" || v == null ? null : v === "sim" || v === true);

function Campo({ label, dica, span, children }) {
  return (
    <label style={{ display: "block", gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <span style={cx.rotulo}>{label}</span>
      {children}
      {dica && <span style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 3, display: "block" }}>{dica}</span>}
    </label>
  );
}

function Sel({ valor, onChange, opcoes, vazio = "—" }) {
  return (
    <select value={valor} onChange={e => onChange(e.target.value)} style={cx.input}>
      <option value="">{vazio}</option>
      {opcoes.map(o => <option key={o.v} value={o.v}>{o.r}</option>)}
    </select>
  );
}

const SIM_NAO = [{ v: "sim", r: "Sim" }, { v: "nao", r: "Não" }];

const NOVO0 = () => ({
  turno: "",
  // sinais maternos — mesmo formato do partograma (alimentam o MEOWS)
  pa_sis: "", pa_dia: "", fc: "", fr: "", temp: "", sato2: "", consciencia: "",
  // puerpério
  utero: "", altura_uterina_cm: "", loquios_aspecto: "", loquios_quantidade: "", loquios_odor: "",
  ferida: "", ferida_aspecto: "", mamas: "", dor_eva: "",
  diurese: "", evacuacao: "", deambulando: "",
  // recém-nascido
  rn_peso_g: "", rn_temp: "", rn_ictericia_zona: "", rn_diurese: "", rn_evacuacao: "", rn_coto: "",
  // aleitamento
  aleitamento: "", pega: "", mamadas_24h: "",
  // alta
  vacina_bcg: "", vacina_hep_b: "", pezinho_agendado: "",
  consulta_puerperio: "", consulta_rn: "", orientacoes: "",
  observacao: "",
});

/** O que o formulário digitado vira, para os motores lerem antes de gravar. */
function comoEvolucao(f) {
  return {
    vitais: vitaisDoRegistro(f),
    utero: f.utero || null,
    altura_uterina_cm: n(f.altura_uterina_cm),
    loquios_aspecto: f.loquios_aspecto || null,
    loquios_quantidade: f.loquios_quantidade || null,
    loquios_odor: f.loquios_odor || null,
    ferida: f.ferida || null,
    ferida_aspecto: f.ferida_aspecto || null,
    mamas: f.mamas || null,
    dor_eva: n(f.dor_eva),
    diurese: b(f.diurese), evacuacao: b(f.evacuacao), deambulando: b(f.deambulando),
    rn_peso_g: n(f.rn_peso_g), rn_temp: n(f.rn_temp),
    rn_ictericia_zona: n(f.rn_ictericia_zona),
    rn_diurese: b(f.rn_diurese), rn_evacuacao: b(f.rn_evacuacao), rn_coto: f.rn_coto || null,
    aleitamento: f.aleitamento || null, pega: f.pega || null, mamadas_24h: n(f.mamadas_24h),
    vacina_bcg: b(f.vacina_bcg), vacina_hep_b: b(f.vacina_hep_b), pezinho_agendado: b(f.pezinho_agendado),
    consulta_puerperio: b(f.consulta_puerperio), consulta_rn: b(f.consulta_rn), orientacoes: b(f.orientacoes),
  };
}

function Aviso({ nivel, texto }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5,
      border: `1px solid ${COR[nivel]}55`, background: `${COR[nivel]}14`, borderRadius: 9, padding: "8px 11px", marginBottom: 6 }}>
      <span style={{ color: COR[nivel], fontWeight: 800 }}>{nivel === NIVEL.ALERTA ? "▲" : "•"}</span>
      <span>{texto}</span>
    </div>
  );
}

export default function AlojamentoView({ sb, currentUser, canEdit, pacienteInicial }) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [mae, setMae] = useState(null);
  const [episodio, setEpisodio] = useState(undefined);   // undefined=não buscado, null=nenhum
  const [carregando, setCarregando] = useState(false);
  const [partos, setPartos] = useState([]);
  const [rns, setRns] = useState([]);
  const [rnId, setRnId] = useState(null);
  const [evolucoes, setEvolucoes] = useState([]);
  const [novo, setNovo] = useState(NOVO0());
  const [darAlta, setDarAlta] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [ok, setOk] = useState("");

  const cn = (k, v) => setNovo(x => ({ ...x, [k]: v }));

  const rn = useMemo(() => rns.find(r => r.id === rnId) || rns[0] || null, [rns, rnId]);
  const via = partos[partos.length - 1]?.via || null;
  const evolucao = useMemo(() => comoEvolucao(novo), [novo]);

  // A leitura ao vivo do binômio: perda de peso, icterícia, puerpério e
  // amamentação, calculados enquanto a enfermeira digita.
  const leitura = useMemo(() => avaliarBinomio(evolucao, {
    pesoNascimentoG: rn?.peso_g, nascidoEm: rn?.data_hora,
  }), [evolucao, rn]);

  const meows = useMemo(() => calcularMeows(evolucao.vitais || {}), [evolucao.vitais]);

  const alta = useMemo(() => checklistAlta({
    evolucao, rn, via, horas: leitura.horas,
    perda: leitura.perda, ictericia: leitura.ictericia, puerperio: leitura.puerperio,
  }), [evolucao, rn, via, leitura]);

  async function buscar(e) {
    e?.preventDefault?.();
    if (busca.trim().length < 2) { setResultados({ curto: true }); return; }
    setBuscando(true);
    setResultados(await buscarPacientes(sb, busca));
    setBuscando(false);
  }

  async function escolher(p) {
    setResultados(null); setBusca(""); setCarregando(true);
    setEpisodio(undefined); setPartos([]); setRns([]); setEvolucoes([]); setRnId(null);
    setErro(""); setAviso(""); setOk("");
    setMae(p);
    const ep = await episodioAtivoDaGestante(sb, p.prontuario).catch(() => null);
    setEpisodio(ep || null);
    if (ep) {
      const [ps, bebes, evs] = await Promise.all([
        carregarPartos(sb, ep.id).catch(() => []),
        carregarRecemNascidos(sb, ep.id).catch(() => []),
        carregarAlojamento(sb, ep.id).catch(() => []),
      ]);
      setPartos(ps); setRns(bebes); setEvolucoes(evs);
      setRnId(bebes[0]?.id ?? null);
    }
    setCarregando(false);
  }

  useEffect(() => {
    if (pacienteInicial && (pacienteInicial.prontuario || pacienteInicial.iniciais)) escolher(pacienteInicial);
  }, [pacienteInicial]);

  function trocar() {
    setMae(null); setEpisodio(undefined); setPartos([]); setRns([]); setEvolucoes([]); setRnId(null);
    setNovo(NOVO0()); setDarAlta(false); setCiente(false); setErro(""); setAviso(""); setOk("");
  }

  // Marcar alta com pendência exige o segundo clique — e trocar de ideia
  // (desmarcar a alta) tem de apagar a ciência, senão ela ficaria valendo
  // para a próxima vez que alguém marcasse.
  function alternarAlta(v) { setDarAlta(v); if (!v) setCiente(false); }

  const travadoPorPendencia = darAlta && !alta.pronto && !ciente;

  async function lancar() {
    if (!episodio || !canEdit || salvando || travadoPorPendencia) return;
    setSalvando(true); setErro(""); setAviso(""); setOk("");
    const registro = {
      ...evolucao,
      episodio_id: episodio.id,
      rn_id: rn?.id || null,
      prontuario_rn: rn?.prontuario_rn || null,
      data_hora: new Date().toISOString(),
      turno: novo.turno || null,
      alta_binomio: !!darAlta,
      observacao: novo.observacao || null,
      profissional: currentUser?.name || null,
    };
    const r = await salvarEvolucaoAlojamento(sb, registro, currentUser);
    setSalvando(false);
    if (!r.ok) { setErro(r.motivo); return; }
    if (r.aviso) setAviso(r.aviso);
    setOk(darAlta
      ? (r.encerrado ? "Alta do binômio registrada — episódio encerrado." : "Alta registrada.")
      : "Evolução registrada.");
    setEvolucoes(await carregarAlojamento(sb, episodio.id).catch(() => evolucoes));
    setNovo(NOVO0()); setDarAlta(false); setCiente(false);
    if (darAlta && r.encerrado) setEpisodio({ ...episodio, status: "encerrado" });
  }

  // ── seletor da puérpera ─────────────────────────────────────
  if (!mae) {
    return (
      <section style={cx.card}>
        <div style={cx.h}>Alojamento conjunto — escolha a puérpera</div>
        <form onSubmit={buscar} style={{ display: "flex", gap: 8 }}>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Nome, prontuário, CPF ou CNS"
            style={{ ...cx.input, flex: 1 }} />
          <button type="submit" disabled={buscando} style={{ ...cx.input, width: "auto", cursor: "pointer", fontWeight: 700, color: TURQ }}>
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </form>
        {resultados?.curto && <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Digite ao menos 2 caracteres.</p>}
        {Array.isArray(resultados) && !resultados.length &&
          <p style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nenhuma paciente encontrada.</p>}
        {Array.isArray(resultados) && resultados.map(p => (
          <button key={p.prontuario} onClick={() => escolher(p)} style={{
            display: "block", width: "100%", textAlign: "left", marginTop: 8, cursor: "pointer",
            background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: 9,
            padding: "10px 12px", color: "var(--text)", fontFamily: "inherit", fontSize: 13.5 }}>
            <b>{p.nome_completo || p.iniciais}</b>
            <span style={{ color: "var(--text-muted)", marginLeft: 8, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
              {p.prontuario}
            </span>
          </button>
        ))}
      </section>
    );
  }

  const nomeMae = mae.nome_completo || mae.iniciais || mae.prontuario;

  return (
    <>
      {/* ── cabeçalho do binômio ── */}
      <section style={cx.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={cx.rotulo}>Binômio</div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{nomeMae}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <span style={cx.chip}>Prontuário {mae.prontuario}</span>
              {via && <span style={cx.chip}>Parto {via}</span>}
              {leitura.horas != null && <span style={cx.chip}>{Math.floor(leitura.horas)} h de vida</span>}
            </div>
          </div>
          <button onClick={trocar} style={{ ...cx.input, width: "auto", cursor: "pointer", fontSize: 12.5 }}>Trocar paciente</button>
        </div>

        {carregando && <p style={{ fontSize: 12.5, color: "var(--text-muted)", marginBottom: 0 }}>Carregando o dossiê…</p>}

        {!carregando && episodio === null && (
          <p style={{ fontSize: 12.5, color: "#f59e0b", marginBottom: 0 }}>
            Esta paciente não tem episódio de maternidade em andamento. O alojamento conjunto evolui um episódio
            aberto — comece pela <b>Admissão obstétrica</b>.
          </p>
        )}

        {!carregando && episodio && !rns.length && (
          <p style={{ fontSize: 12.5, color: "#f59e0b", marginBottom: 0 }}>
            Nenhum recém-nascido registrado neste episódio. O alojamento conjunto é a evolução do <b>binômio</b> —
            registre o bebê na aba <b>Recém-nascidos</b> primeiro (é de lá que vem o peso de nascimento, sem o qual
            a perda de peso não pode ser calculada).
          </p>
        )}

        {rns.length > 1 && (
          <div style={{ marginTop: 12 }}>
            <span style={cx.rotulo}>Qual bebê</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {rns.map((r, i) => (
                <button key={r.id} onClick={() => setRnId(r.id)} style={{
                  ...cx.chip, cursor: "pointer", fontFamily: "inherit",
                  borderColor: r.id === (rn?.id) ? TURQ : "var(--border)",
                  color: r.id === (rn?.id) ? TURQ : "var(--text-2)" }}>
                  {i + 1}º RN · {r.peso_g ? `${r.peso_g} g` : "sem peso"}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {episodio && !!rns.length && (
        <>
          {/* ── a leitura ao vivo ── */}
          <section style={{ ...cx.card, borderColor: leitura.nivel === NIVEL.NORMAL ? "var(--border)" : `${COR[leitura.nivel]}66` }}>
            <div style={cx.h}>Leitura do turno</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: leitura.nivel === NIVEL.NORMAL ? 0 : 10 }}>
              <span style={{ ...cx.chip, color: COR[leitura.perda.nivel] }}>
                Peso: {leitura.perda.avaliado ? leitura.perda.rotulo : "sem peso de nascimento ou do dia"}
              </span>
              <span style={{ ...cx.chip, color: COR[leitura.ictericia.nivel] }}>
                Icterícia: {leitura.ictericia.presente ? `zona ${leitura.ictericia.zona} (${leitura.ictericia.bilirrubina})` : "ausente"}
              </span>
              {meows.avaliado && (
                <span style={{ ...cx.chip, color: COR_MEOWS[meows.nivel] }}>
                  MEOWS {meows.total} · {meows.nivel}
                </span>
              )}
              <span style={{ ...cx.chip, color: COR[leitura.aleitamento.nivel] }}>
                {leitura.aleitamento.tipo ? ROTULO_ALEITAMENTO[leitura.aleitamento.tipo] : "Aleitamento não registrado"}
              </span>
            </div>
            {leitura.ictericia.motivo && <Aviso nivel={leitura.ictericia.nivel} texto={leitura.ictericia.motivo} />}
            {leitura.perda.nivel !== NIVEL.NORMAL && <Aviso nivel={leitura.perda.nivel} texto={leitura.perda.rotulo} />}
            {leitura.puerperio.alertas.map(a => <Aviso key={a.chave} nivel={a.nivel} texto={a.texto} />)}
            {leitura.aleitamento.apoio.map(a => <Aviso key={a.chave} nivel={a.nivel} texto={a.texto} />)}
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "8px 0 0" }}>
              Apoio à decisão, nunca conduta — quem examina decide.
            </p>
          </section>

          {/* ── o formulário da evolução ── */}
          <section style={cx.card}>
            <div style={cx.h}>Evolução do binômio</div>

            <div style={{ ...cx.grid, marginBottom: 16 }}>
              <Campo label="Turno">
                <Sel valor={novo.turno} onChange={v => cn("turno", v)}
                  opcoes={[{ v: "manha", r: "Manhã" }, { v: "tarde", r: "Tarde" }, { v: "noite", r: "Noite" }]} />
              </Campo>
            </div>

            {/* sinais maternos — os mesmos do partograma, alimentam o MEOWS */}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Sinais maternos</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  vão para o painel de Segurança materna — em branco, NÃO contam como medida
                </span>
              </div>
              <div style={cx.grid}>
                <Campo label="PA sistólica"><input type="number" value={novo.pa_sis} onChange={e => cn("pa_sis", e.target.value)} style={cx.input} /></Campo>
                <Campo label="PA diastólica"><input type="number" value={novo.pa_dia} onChange={e => cn("pa_dia", e.target.value)} style={cx.input} /></Campo>
                <Campo label="FC (bpm)"><input type="number" value={novo.fc} onChange={e => cn("fc", e.target.value)} style={cx.input} /></Campo>
                <Campo label="FR (irpm)"><input type="number" value={novo.fr} onChange={e => cn("fr", e.target.value)} style={cx.input} /></Campo>
                <Campo label="Temperatura (°C)"><input type="number" step="0.1" value={novo.temp} onChange={e => cn("temp", e.target.value)} style={cx.input} /></Campo>
                <Campo label="SatO₂ (%)"><input type="number" value={novo.sato2} onChange={e => cn("sato2", e.target.value)} style={cx.input} /></Campo>
                <Campo label="Consciência">
                  <Sel valor={novo.consciencia} onChange={v => cn("consciencia", v)} opcoes={[
                    { v: "alerta", r: "Alerta" }, { v: "resposta_voz", r: "Responde à voz" },
                    { v: "resposta_dor", r: "Responde à dor" }, { v: "irresponsivo", r: "Irresponsiva" }]} />
                </Campo>
              </div>
            </div>

            {/* puerpério */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Puerpério</div>
              <div style={cx.grid}>
                <Campo label="Útero">
                  <Sel valor={novo.utero} onChange={v => cn("utero", v)} opcoes={[
                    { v: "contraido", r: "Contraído" }, { v: "globoso", r: "Globoso" }, { v: "amolecido", r: "Amolecido" }]} />
                </Campo>
                <Campo label="Altura uterina (cm)" dica="em relação à cicatriz umbilical">
                  <input type="number" step="0.5" value={novo.altura_uterina_cm} onChange={e => cn("altura_uterina_cm", e.target.value)} style={cx.input} />
                </Campo>
                <Campo label="Lóquios — aspecto">
                  <Sel valor={novo.loquios_aspecto} onChange={v => cn("loquios_aspecto", v)} opcoes={[
                    { v: "rubro", r: "Rubro" }, { v: "seroso", r: "Seroso" }, { v: "alba", r: "Alba" }]} />
                </Campo>
                <Campo label="Lóquios — quantidade">
                  <Sel valor={novo.loquios_quantidade} onChange={v => cn("loquios_quantidade", v)} opcoes={[
                    { v: "ausente", r: "Ausente" }, { v: "pouco", r: "Pouco" },
                    { v: "moderado", r: "Moderado" }, { v: "aumentado", r: "Aumentado" }]} />
                </Campo>
                <Campo label="Lóquios — odor">
                  <Sel valor={novo.loquios_odor} onChange={v => cn("loquios_odor", v)} opcoes={[
                    { v: "inodoro", r: "Inodoro" }, { v: "fetido", r: "Fétido" }]} />
                </Campo>
                <Campo label="Ferida">
                  <Sel valor={novo.ferida} onChange={v => cn("ferida", v)} opcoes={[
                    { v: "integro", r: "Períneo íntegro" }, { v: "episiorrafia", r: "Episiorrafia" },
                    { v: "laceracao", r: "Laceração" }, { v: "cesarea", r: "Incisão de cesárea" }]} />
                </Campo>
                <Campo label="Aspecto da ferida">
                  <Sel valor={novo.ferida_aspecto} onChange={v => cn("ferida_aspecto", v)} opcoes={[
                    { v: "limpa", r: "Limpa e seca" }, { v: "hiperemia", r: "Hiperemiada" },
                    { v: "secrecao", r: "Com secreção" }, { v: "deiscencia", r: "Deiscência" }]} />
                </Campo>
                <Campo label="Mamas">
                  <Sel valor={novo.mamas} onChange={v => cn("mamas", v)} opcoes={[
                    { v: "normais", r: "Normais" }, { v: "ingurgitadas", r: "Ingurgitadas" },
                    { v: "fissura", r: "Fissura mamilar" }, { v: "mastite", r: "Mastite" }]} />
                </Campo>
                <Campo label="Dor (EVA 0–10)"><input type="number" min="0" max="10" value={novo.dor_eva} onChange={e => cn("dor_eva", e.target.value)} style={cx.input} /></Campo>
                <Campo label="Diurese"><Sel valor={novo.diurese} onChange={v => cn("diurese", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Evacuação"><Sel valor={novo.evacuacao} onChange={v => cn("evacuacao", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Deambulando"><Sel valor={novo.deambulando} onChange={v => cn("deambulando", v)} opcoes={SIM_NAO} /></Campo>
              </div>
            </div>

            {/* recém-nascido */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Recém-nascido</span>
                {rn?.peso_g && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>nasceu com {rn.peso_g} g</span>}
              </div>
              <div style={cx.grid}>
                <Campo label="Peso de hoje (g)"><input type="number" value={novo.rn_peso_g} onChange={e => cn("rn_peso_g", e.target.value)} style={cx.input} /></Campo>
                <Campo label="Temperatura (°C)"><input type="number" step="0.1" value={novo.rn_temp} onChange={e => cn("rn_temp", e.target.value)} style={cx.input} /></Campo>
                <Campo label="Icterícia (Kramer)" span={2} dica="a zona mais baixa que a icterícia alcançou">
                  <Sel valor={novo.rn_ictericia_zona} onChange={v => cn("rn_ictericia_zona", v)} vazio="Ausente"
                    opcoes={KRAMER.map(k => ({ v: String(k.zona), r: `Zona ${k.zona} — ${k.regiao} (${k.bilirrubina})` }))} />
                </Campo>
                <Campo label="Diurese"><Sel valor={novo.rn_diurese} onChange={v => cn("rn_diurese", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Evacuação"><Sel valor={novo.rn_evacuacao} onChange={v => cn("rn_evacuacao", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Coto umbilical">
                  <Sel valor={novo.rn_coto} onChange={v => cn("rn_coto", v)} opcoes={[
                    { v: "seco", r: "Seco" }, { v: "umido", r: "Úmido" },
                    { v: "secrecao", r: "Com secreção" }, { v: "hiperemia", r: "Hiperemiado" }]} />
                </Campo>
              </div>
            </div>

            {/* aleitamento */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Aleitamento</div>
              <div style={cx.grid}>
                <Campo label="Tipo" span={2}>
                  <Sel valor={novo.aleitamento} onChange={v => cn("aleitamento", v)}
                    opcoes={Object.values(ALEITAMENTO).map(v => ({ v, r: ROTULO_ALEITAMENTO[v] }))} />
                </Campo>
                <Campo label="Pega e posição">
                  <Sel valor={novo.pega} onChange={v => cn("pega", v)} opcoes={[
                    { v: "adequada", r: "Adequada" }, { v: "inadequada", r: "Inadequada" }]} />
                </Campo>
                <Campo label="Mamadas em 24 h"><input type="number" value={novo.mamadas_24h} onChange={e => cn("mamadas_24h", e.target.value)} style={cx.input} /></Campo>
              </div>
            </div>

            {/* preparo da alta */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Preparo da alta</div>
              <div style={cx.grid}>
                <Campo label="BCG"><Sel valor={novo.vacina_bcg} onChange={v => cn("vacina_bcg", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Hepatite B"><Sel valor={novo.vacina_hep_b} onChange={v => cn("vacina_hep_b", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Pezinho agendado" dica="quando a alta é antes de 48 h">
                  <Sel valor={novo.pezinho_agendado} onChange={v => cn("pezinho_agendado", v)} opcoes={SIM_NAO} />
                </Campo>
                <Campo label="Consulta de puerpério"><Sel valor={novo.consulta_puerperio} onChange={v => cn("consulta_puerperio", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Consulta do RN"><Sel valor={novo.consulta_rn} onChange={v => cn("consulta_rn", v)} opcoes={SIM_NAO} /></Campo>
                <Campo label="Orientações dadas"><Sel valor={novo.orientacoes} onChange={v => cn("orientacoes", v)} opcoes={SIM_NAO} /></Campo>
              </div>
            </div>

            <Campo label="Observação" span={4}>
              <textarea rows={2} value={novo.observacao} onChange={e => cn("observacao", e.target.value)} style={{ ...cx.input, marginTop: 14, resize: "vertical" }} />
            </Campo>
          </section>

          {/* ── checklist da alta ── */}
          <section style={cx.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Alta do binômio</div>
              <span style={{ ...cx.chip, color: alta.pronto ? COR[NIVEL.NORMAL] : COR[NIVEL.ATENCAO] }}>
                {alta.pronto ? "Sem pendências" : `${alta.pendencias.length} pendência${alta.pendencias.length > 1 ? "s" : ""}`}
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 8 }}>
              {alta.itens.map(i => (
                <div key={i.chave} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.45 }}>
                  <span style={{ color: i.ok ? COR[NIVEL.NORMAL] : COR[NIVEL.ATENCAO], fontWeight: 800 }}>{i.ok ? "✓" : "○"}</span>
                  <span>
                    <span style={{ fontWeight: i.ok ? 500 : 700 }}>{i.rotulo}</span>
                    {i.motivo && <span style={{ display: "block", color: "var(--text-muted)", fontSize: 11.5 }}>{i.motivo}</span>}
                  </span>
                </div>
              ))}
            </div>

            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 14, fontSize: 13, cursor: "pointer" }}>
              <input type="checkbox" checked={darAlta} onChange={e => alternarAlta(e.target.checked)} />
              <span>Esta evolução é a <b>alta do binômio</b> — encerra o episódio de maternidade.</span>
            </label>

            {darAlta && !alta.pronto && (
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, fontSize: 12.5, cursor: "pointer",
                border: `1px solid ${COR[NIVEL.ATENCAO]}66`, background: `${COR[NIVEL.ATENCAO]}14`, borderRadius: 9, padding: "10px 12px" }}>
                <input type="checkbox" checked={ciente} onChange={e => setCiente(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  Estou ciente de que a alta está sendo dada com <b>{alta.pendencias.length} pendência{alta.pendencias.length > 1 ? "s" : ""}</b>
                  {" "}({alta.pendencias.map(p => p.rotulo).join(", ")}) e assumo a decisão.
                </span>
              </label>
            )}
          </section>

          {/* ── gravar ── */}
          <section style={cx.card}>
            {erro && <p style={{ color: "#f87171", fontSize: 12.5, marginTop: 0 }}>{erro}</p>}
            {aviso && <p style={{ color: "#fbbf24", fontSize: 12.5, marginTop: 0 }}>{aviso}</p>}
            {ok && <p style={{ color: TURQ, fontSize: 12.5, marginTop: 0 }}>{ok}</p>}
            <button onClick={lancar} disabled={!canEdit || salvando || travadoPorPendencia}
              style={{ ...cx.input, width: "auto", cursor: canEdit && !travadoPorPendencia ? "pointer" : "not-allowed",
                fontWeight: 700, color: canEdit && !travadoPorPendencia ? TURQ : "var(--text-muted)" }}>
              {salvando ? "Gravando…" : darAlta ? "Registrar a alta do binômio" : "Lançar evolução"}
            </button>
            {!canEdit && <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 0 }}>Seu perfil não tem permissão para lançar.</p>}
            {travadoPorPendencia && <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginBottom: 0 }}>Marque a ciência das pendências para liberar a alta.</p>}
          </section>

          {/* ── o que já foi lançado ── */}
          <section style={cx.card}>
            <div style={cx.h}>Evoluções deste episódio ({evolucoes.length})</div>
            {!evolucoes.length && <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: 0 }}>Nenhuma evolução lançada ainda.</p>}
            {evolucoes.slice().reverse().map(ev => {
              const l = avaliarBinomio(ev, { pesoNascimentoG: rn?.peso_g, nascidoEm: rn?.data_hora, agora: ev.data_hora });
              return (
                <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 12.5 }}>
                  <span style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                    {new Date(ev.data_hora).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span style={{ color: COR[l.nivel], fontWeight: 800 }}>{l.nivel === NIVEL.NORMAL ? "•" : "▲"}</span>
                  <span style={{ minWidth: 0 }}>
                    {ev.alta_binomio && <b style={{ color: TURQ }}>ALTA · </b>}
                    {ev.turno ? `${ev.turno} · ` : ""}
                    {ev.rn_peso_g ? `${ev.rn_peso_g} g${l.perda.avaliado ? ` (${l.perda.perdaPct > 0 ? "−" : "+"}${Math.abs(l.perda.perdaPct)}%)` : ""} · ` : ""}
                    {ev.aleitamento ? `${ROTULO_ALEITAMENTO[ev.aleitamento]} · ` : ""}
                    {ev.utero ? `útero ${ev.utero}` : ""}
                    {ev.profissional && <span style={{ color: "var(--text-muted)" }}> — {ev.profissional}</span>}
                  </span>
                </div>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
