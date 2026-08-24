// ═══════════════════════════════════════════════════════════
// CADASTRO DO PACIENTE — identificação completa
//
// O formulário que faltava. O cadastro anterior tinha três campos e vivia
// escondido num botão do Paciente 360; este cobre o conteúdo mínimo da
// CFM 1.638/2002 e é o lugar onde a recepção trabalha.
//
// TRÊS DECISÕES QUE VALEM EXPLICAÇÃO
//
// 1. NÃO BLOQUEIA. Nenhum campo é obrigatório para salvar. A CFM 1.638,
//    art. 5º, I, "e", prevê o atendimento em que a anamnese não é possível;
//    travar o cadastro de um politraumatizado para exigir o nome da mãe
//    inverte a prioridade. O que a tela faz é deixar a pendência VISÍVEL —
//    a barra de conformidade mostra o que falta, para alguém completar
//    depois, em vez de o buraco sumir.
//
// 2. AVISA DE DUPLICATA ANTES DE GRAVAR. Prontuário duplicado é o defeito
//    mais caro deste tipo de sistema: metade do histórico num registro,
//    metade no outro, e o médico decide vendo metade. A checagem acontece
//    enquanto se digita, e diz POR QUE achou que é a mesma pessoa — quem
//    confirma é a recepção, não o sistema.
//
// 3. A IDADE APARECE ENQUANTO SE DIGITA. É o corretor de digitação mais
//    barato que existe: quem digita "1057" no lugar de "1957" vê "969
//    anos" na hora. Data de nascimento errada em pediatria vira faixa de
//    sinal vital errada.
//
// A lógica de validação está em identidade.js (pura, testada). Aqui só há
// tela e o que se grava.
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  validarCPF, formatarCPF, validarCNS, formatarCNS, tipoCNS, limparDoc,
  iniciaisDe, idadeDetalhada, conferirCadastro, possiveisDuplicatas,
  normalizarSexo, documentoEmUso, mensagemDocumentoEmUso,
  NACIONALIDADES, normalizarNacionalidade, nascidoNoBrasil, autodeclaradoIndigena,
} from "./identidade.js";

const cartao = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "1.1rem 1.25rem", marginBottom: 14 };
const rotulo = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 12 };
const inp = { background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", color: "var(--text)", fontFamily: "Inter, sans-serif", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
const lbl = { fontSize: 10.5, color: "var(--text-muted)", display: "block", marginBottom: 3 };

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const RACA_COR = [
  ["", "Não informado"], ["branca", "Branca"], ["preta", "Preta"], ["parda", "Parda"],
  ["amarela", "Amarela"], ["indigena", "Indígena"],
];
const PARENTESCO = ["", "Mãe", "Pai", "Filho(a)", "Cônjuge", "Irmão(ã)", "Responsável legal", "Outro"];

// SUGESTÕES, NÃO LISTAS FECHADAS — e nenhuma das duas está completa de
// propósito. São os casos que aparecem no balcão de um hospital do Rio
// Grande do Sul, para poupar digitação; qualquer outro valor continua
// podendo ser escrito à mão, porque a próxima pessoa a chegar pode ser de
// qualquer lugar e de qualquer povo.
//
// A lista oficial de etnias indígenas do SUS tem centenas de entradas com
// código de quatro dígitos. Ela NÃO está aqui, e o código NÃO é gravado:
// código inventado não é recusado no ato — vai para o arquivo de produção
// e volta como glosa, com o nome de um povo trocado pelo de outro.
const PAISES_FREQUENTES = [
  "Uruguai", "Argentina", "Paraguai", "Bolívia", "Venezuela", "Haiti",
  "Chile", "Colômbia", "Peru", "Cuba", "Portugal", "Itália", "Alemanha",
  "Senegal", "Angola", "Ucrânia",
];
const ETNIAS_FREQUENTES = ["Kaingang", "Guarani Mbyá", "Guarani Nhandeva", "Charrua", "Xokleng"];

// Um campo. `erro` pinta a borda; `dica` explica embaixo.
//
// `sugestoes` NÃO é `opcoes`, e a diferença importa: `opcoes` fecha a lista
// (é um select — o que não está lá não pode ser digitado), `sugestoes` só
// adianta o que se digita mais. País de nascimento e etnia indígena têm
// listas grandes demais para caber num select e específicas demais para
// serem inventadas aqui — as sugestões cobrem o que aparece no balcão e o
// resto continua podendo ser escrito à mão.
function Campo({ label, valor, onChange, erro, dica, tipo = "text", largura, opcoes, sugestoes, placeholder, maxLength }) {
  const estilo = { ...inp, ...(erro ? { borderColor: "#f43f5e88" } : {}) };
  const listaId = sugestoes ? `sug-${String(label).toLowerCase().replace(/[^a-z]+/g, "-")}` : undefined;
  return (
    <div style={largura ? { width: largura } : undefined}>
      <label style={lbl}>{label}</label>
      {opcoes
        ? <select value={valor ?? ""} onChange={e => onChange(e.target.value)} style={estilo}>
            {opcoes.map(o => Array.isArray(o)
              ? <option key={o[0]} value={o[0]}>{o[1]}</option>
              : <option key={o} value={o}>{o || "—"}</option>)}
          </select>
        : <input type={tipo} value={valor ?? ""} onChange={e => onChange(e.target.value)}
            list={listaId}
            placeholder={placeholder} maxLength={maxLength} style={estilo} />}
      {sugestoes && (
        <datalist id={listaId}>
          {sugestoes.map(o => <option key={o} value={o} />)}
        </datalist>
      )}
      {dica && <div style={{ fontSize: 10.5, color: erro ? "#f43f5e" : "var(--text-muted)", marginTop: 3 }}>{dica}</div>}
    </div>
  );
}

const VAZIO = {
  nome_completo: "", nome_social: "", data_nascimento: "", sexo: "", identidade_genero: "",
  nome_mae: "", nome_pai: "", naturalidade_municipio: "", naturalidade_uf: "", nacionalidade: "Brasileira",
  pais_nascimento: "", etnia_indigena: "",
  raca_cor: "", cpf: "", rg: "", rg_orgao_emissor: "", cns: "", passaporte: "",
  end_logradouro: "", end_numero: "", end_complemento: "", end_bairro: "",
  end_municipio: "", end_uf: "", end_cep: "", end_referencia: "",
  telefone: "", telefone_alt: "", email: "",
  responsavel_nome: "", responsavel_documento: "", responsavel_parentesco: "", responsavel_telefone: "",
  observacao: "",
};

export default function CadastroPaciente({ sb, prontuario, paciente, canEdit, currentUser, onSalvo, onCancelar }) {
  // O sexo entra normalizado: cadastro antigo gravava "masculino"/"feminino"
  // e o resto do sistema compara com "M"/"F". Sem isto, abrir um cadastro
  // legado mostraria o campo vazio e apagaria o valor ao salvar.
  const [f, setF] = useState(() => {
    const base = { ...VAZIO, ...(paciente || {}) };
    // A nacionalidade nasceu como texto livre com "Brasileira" de padrão, e
    // quem preencheu à mão escreveu o PAÍS ("Uruguaia"). Normalizar sem mais
    // nada jogaria esse texto fora no primeiro salvamento — e ele é a única
    // informação de origem que existe sobre essa pessoa. A migração faz o
    // mesmo resgate na base; isto cobre a linha que estiver aberta na tela.
    const nacionalidade = normalizarNacionalidade(base.nacionalidade);
    const livre = String(base.nacionalidade ?? "").trim();
    const reconhecido = /^(brasileir|naturaliz|estrangeir)/i.test(livre);
    const pais_nascimento = (!base.pais_nascimento && !reconhecido && livre)
      ? livre : base.pais_nascimento;
    return { ...base, sexo: normalizarSexo(base.sexo), nacionalidade, pais_nascimento };
  });
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");
  const [candidatos, setCandidatos] = useState([]);
  const set = (k, v) => { setF(p => ({ ...p, [k]: v })); setMsg(""); };

  const edicao = !!paciente?.prontuario;

  // ── conferência da norma, ao vivo ──
  const conferencia = useMemo(() => conferirCadastro(f), [f]);
  const idade = useMemo(() => idadeDetalhada(f.data_nascimento), [f.data_nascimento]);
  // Duas perguntas que mudam QUAIS campos a ficha mostra. Ficam aqui, uma
  // vez, em vez de repetidas em cada bloco — dois lugares perguntando a
  // mesma coisa divergem, e aí um campo aparece sem o outro sumir.
  const pendenciasSus = conferencia.pendencias.filter(x => x.nivel === "sus");
  const noBrasil = nascidoNoBrasil(f);
  const indigena = autodeclaradoIndigena(f);
  const cpfPreenchido = limparDoc(f.cpf).length > 0;
  const cpfInvalido = cpfPreenchido && !validarCPF(f.cpf);
  const cnsPreenchido = limparDoc(f.cns).length > 0;
  const cnsInvalido = cnsPreenchido && !validarCNS(f.cns);

  // ── duplicidade: busca candidatos por nome/CPF/CNS enquanto digita ──
  // Só puxa o que pode casar, não a tabela inteira: a busca é por prefixo do
  // nome ou documento exato.
  const buscarCandidatos = useCallback(async () => {
    const nome = String(f.nome_completo || "").trim();
    const cpf = limparDoc(f.cpf), cns = limparDoc(f.cns);
    if (nome.length < 4 && cpf.length !== 11 && cns.length !== 15) { setCandidatos([]); return; }
    const filtros = [];
    if (nome.length >= 4) filtros.push(`nome_completo.ilike.*${encodeURIComponent(nome.split(" ")[0])}*`);
    if (cpf.length === 11) filtros.push(`cpf.eq.${cpf}`);
    if (cns.length === 15) filtros.push(`cns.eq.${cns}`);
    if (!filtros.length) { setCandidatos([]); return; }
    const r = await sb(`pacientes?or=(${filtros.join(",")})&select=prontuario,nome_completo,nome_social,data_nascimento,nome_mae,cpf,cns,iniciais&limit=25`).catch(() => null);
    setCandidatos(Array.isArray(r) ? r : []);
  }, [sb, f.nome_completo, f.cpf, f.cns]);

  useEffect(() => {
    // espera a digitação parar, para não consultar a cada tecla
    const t = setTimeout(buscarCandidatos, 500);
    return () => clearTimeout(t);
  }, [buscarCandidatos]);

  const duplicatas = useMemo(
    () => possiveisDuplicatas({ ...f, prontuario: prontuario || paciente?.prontuario }, candidatos),
    [f, candidatos, prontuario, paciente]);

  async function salvar() {
    if (!canEdit || salvando) return;
    const alvo = prontuario || paciente?.prontuario;
    if (!alvo) { setMsg("⚠️ Sem número de prontuário."); return; }

    // O documento já é de outro prontuário? Isto vem ANTES do aviso de
    // duplicidade porque não é um palpite: o índice único do banco vai
    // recusar de qualquer jeito, e descobrir só depois deixa a pessoa com um
    // erro sem saída. Ver `documentoEmUso` em identidade.js.
    const conflito = documentoEmUso({ ...f, prontuario: alvo }, candidatos);
    if (conflito) { setMsg("⚠️ " + mensagemDocumentoEmUso(conflito)); return; }

    // 🔴 O AVISO DE DUPLICIDADE SÓ VALE NA CRIAÇÃO.
    //
    // Editando um cadastro que JÁ EXISTE, salvar atualiza aquele prontuário
    // e não cria nada — então o texto "cadastrar assim mesmo cria um SEGUNDO
    // prontuário" é falso, e um aviso falso é pior que aviso nenhum.
    //
    // Na prática isto trancava a tarefa mais rotineira do balcão: mudar um
    // telefone de alguém que tem homônimo no acervo exigia confirmar um
    // modal dizendo que se estava duplicando o paciente. O cartão de
    // possíveis duplicatas continua visível na tela — informação é útil; é a
    // interrupção que não se justifica aqui.
    const graves = edicao ? [] : duplicatas.filter(d => d.confianca >= 90);
    if (graves.length && !confirm(
      `Atenção: este paciente parece já estar cadastrado.\n\n` +
      graves.map(d => `• Prontuário ${d.prontuario} — ${d.motivos.join(", ")}`).join("\n") +
      `\n\nCadastrar assim mesmo cria um SEGUNDO prontuário para a mesma pessoa, e o histórico fica dividido entre os dois.\n\nContinuar?`)) return;

    setSalvando(true);
    // Só o que tem valor: mandar string vazia grava "" no lugar de NULL, e aí
    // "não preenchido" deixa de ser distinguível de "preenchido em branco".
    const corpo = { prontuario: alvo };
    for (const [k, v] of Object.entries(f)) {
      if (!(k in VAZIO)) continue;
      const val = typeof v === "string" ? v.trim() : v;
      corpo[k] = val === "" ? null : val;
    }
    // Documentos vão só com dígitos: com pontuação, o índice único não pega
    // "529.982.247-25" e "52998224725" como o mesmo CPF.
    if (corpo.cpf) corpo.cpf = limparDoc(corpo.cpf);
    if (corpo.cns) corpo.cns = limparDoc(corpo.cns);
    // 🔴 TELEFONE PELO MESMO MOTIVO, e ele estava de fora.
    // A busca por telefone normaliza para dígitos; o cadastro gravava o que
    // fosse digitado. "(51) 3664-1234" e "5136641234" viravam duas coisas
    // diferentes, e procurar pelo número que está na tela não achava o
    // paciente que está na tela. Achei percorrendo: a consulta saía certa e
    // voltava vazia.
    if (corpo.telefone) corpo.telefone = limparDoc(corpo.telefone);
    if (corpo.telefone_alt) corpo.telefone_alt = limparDoc(corpo.telefone_alt);
    // As iniciais continuam sendo a forma padrão de exibir — derivadas do
    // nome para não dependerem de alguém digitar duas vezes.
    corpo.iniciais = iniciaisDe(f.nome_completo) || paciente?.iniciais || "?";
    // `ano_nascimento` segue preenchido: o resto do sistema ainda lê dele.
    if (f.data_nascimento) corpo.ano_nascimento = Number(String(f.data_nascimento).slice(0, 4)) || null;
    if (conferencia.completo && !paciente?.cadastro_completo_em) corpo.cadastro_completo_em = new Date().toISOString();

    const r = await sb("pacientes?on_conflict=prontuario", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ ...corpo, usuario: currentUser?.name || null, updated_at: new Date().toISOString() }),
    }).catch(() => null);
    setSalvando(false);

    // O PostgREST devolve 204 mesmo quando o RLS bloqueia e nada muda — por
    // isso conferimos o RETORNO, não o status.
    if (!r || (Array.isArray(r) && !r.length)) {
      // Antes de culpar migração ou permissão, conferir a causa mais comum e
      // a única que tem conserto na tela: o documento já ser de outro
      // prontuário. A checagem de cima usa `candidatos`, que é debounced em
      // 500ms — quem digita o CPF e salva em seguida passa por ela. Aqui a
      // consulta é exata e sem espera, então a corrida também fica coberta.
      const doc = { cpf: limparDoc(f.cpf), cns: limparDoc(f.cns) };
      const filtros = [];
      if (doc.cpf.length === 11) filtros.push(`cpf.eq.${doc.cpf}`);
      if (doc.cns.length === 15) filtros.push(`cns.eq.${doc.cns}`);
      if (filtros.length) {
        const donos = await sb(`pacientes?or=(${filtros.join(",")})&select=prontuario,nome_completo,nome_social,iniciais,cpf,cns&limit=5`).catch(() => null);
        const c2 = documentoEmUso({ ...f, prontuario: alvo }, Array.isArray(donos) ? donos : []);
        if (c2) { setMsg("⚠️ " + mensagemDocumentoEmUso(c2)); return; }
      }
      setMsg("⚠️ Nada foi gravado — e o motivo não está na tela. Pode ser permissão do seu perfil ou uma migração pendente neste banco. Chame a TI com o número deste prontuário; NÃO apague campos para tentar de novo.");
      return;
    }
    onSalvo?.(Array.isArray(r) ? r[0] : r);
  }

  const cor = conferencia.completo ? "#34d399" : conferencia.percentual >= 60 ? "#d97706" : "#f43f5e";

  return (
    <div>
      {/* CONFORMIDADE — o que falta para ser um prontuário na norma */}
      <div style={{ ...cartao, borderLeft: `4px solid ${cor}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>{edicao ? "Editar cadastro" : "Cadastro do paciente"}</strong>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>prontuário {prontuario || paciente?.prontuario}</span>
          <span style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 700, color: cor }}>
            {conferencia.completo ? "✓ Identificação completa" : `${conferencia.percentual}% da identificação exigida`}
          </span>
        </div>
        <div style={{ height: 5, background: "var(--bg-2)", borderRadius: 99, marginTop: 9, overflow: "hidden" }}>
          <div style={{ width: `${conferencia.percentual}%`, height: "100%", background: cor, transition: "width .2s" }} />
        </div>
        {!conferencia.completo && (
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 9, lineHeight: 1.55 }}>
            Falta para a CFM 1.638/2002:{" "}
            <strong>{conferencia.pendencias.filter(p => p.nivel === "essencial").map(p => p.label).join(" · ") || "—"}</strong>
            <br />
            <span style={{ color: "var(--text-muted)" }}>
              Pode salvar assim mesmo — emergência entra com o que dá e alguém completa depois.
              O que não pode é a pendência sumir da vista.
            </span>
          </div>
        )}
        {/* 🔴 A PENDÊNCIA DE FATURAMENTO NÃO APARECIA EM LUGAR NENHUM.
            A barra listava só o nível "essencial" (CFM 1.638). O nível
            "sus" — CNS ausente, e agora a etnia de quem se declarou
            indígena — era calculado, devolvido e descartado pela tela: a
            regra existia, rodava, e não fazia nada. O preço vinha um mês
            depois, no arquivo de produção rejeitado, longe de quem digitou.

            Linha SEPARADA da de cima de propósito: a consequência é outra.
            A CFM 1.638 é a norma da identificação; isto aqui é o que
            derruba a conta. Misturar as duas faria a recepção tratar o
            conjunto como uma lista só de burocracia. */}
        {pendenciasSus.length > 0 && (
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 9, lineHeight: 1.55 }}>
            Falta para o faturamento SUS:{" "}
            <strong>{pendenciasSus.map(p => p.label).join(" · ")}</strong>
            <br />
            <span style={{ color: "var(--text-muted)" }}>
              Não impede o atendimento — impede a conta de fechar.
            </span>
          </div>
        )}
      </div>

      {/* DUPLICIDADE */}
      {duplicatas.length > 0 && (
        <div style={{ ...cartao, borderLeft: "4px solid #f43f5e", background: "#f43f5e10" }}>
          <div style={{ ...rotulo, color: "#f43f5e", marginBottom: 8 }}>
            ⚠ Esta pessoa já pode estar cadastrada
          </div>
          {duplicatas.map(d => (
            <div key={d.prontuario} style={{ fontSize: 12.5, padding: "5px 0", borderBottom: "1px solid var(--border)" }}>
              <strong>Prontuário {d.prontuario}</strong>
              <span style={{ color: "var(--text-3)" }}> — {d.paciente.nome_completo || d.paciente.iniciais || "sem nome"}</span>
              <div style={{ fontSize: 11, color: d.confianca >= 90 ? "#f43f5e" : "#d97706" }}>
                {d.motivos.join(" · ")}
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 8, lineHeight: 1.5 }}>
            Se for a mesma pessoa, <strong>use o prontuário que já existe</strong> em vez de criar outro —
            dois registros dividem o histórico, e quem atende passa a decidir vendo metade.
          </div>
        </div>
      )}

      {/* IDENTIFICAÇÃO */}
      <div style={cartao}>
        <div style={rotulo}>Identificação</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
          <Campo label="Nome completo" valor={f.nome_completo} onChange={v => set("nome_completo", v)}
            placeholder="Como está no documento"
            dica={f.nome_completo ? `Aparecerá nas telas como ${iniciaisDe(f.nome_completo)}` : null} />
          <Campo label="Nome social (se houver)" valor={f.nome_social} onChange={v => set("nome_social", v)}
            placeholder="Como a pessoa quer ser chamada"
            dica="Tem precedência na exibição (Decreto 8.727/2016)." />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: indigena ? "160px 110px 1fr 1fr 1fr" : "170px 120px 1fr 1fr", gap: 10, marginTop: 10 }}>
          <Campo label="Data de nascimento" tipo="date" valor={f.data_nascimento} onChange={v => set("data_nascimento", v)}
            erro={!!f.data_nascimento && !idade}
            dica={f.data_nascimento
              ? (idade ? `${idade.rotulo}` : "Data inválida ou no futuro")
              : "Dia e mês importam: sem eles a idade erra até 11 meses."} />
          <Campo label="Sexo" valor={f.sexo} onChange={v => set("sexo", v)}
            opcoes={[["", "—"], ["M", "Masculino"], ["F", "Feminino"]]} />
          <Campo label="Identidade de gênero (opcional)" valor={f.identidade_genero} onChange={v => set("identidade_genero", v)} />
          <Campo label="Raça/cor" valor={f.raca_cor} onChange={v => set("raca_cor", v)} opcoes={RACA_COR} />
          {/* 🔴 A ETNIA APARECE JUNTO COM A ESCOLHA, não depois dela.
              "Indígena" era opção de raça/cor e parava aí. Nos sistemas de
              informação do SUS a etnia é obrigatória junto — a raça/cor
              indígena sozinha não é aceita e o BPA volta rejeitado. O
              cadastro ficava plausível na tela e quebrava no fechamento do
              mês, longe de quem digitou. Aqui o campo nasce no mesmo
              instante em que a pendência nasce. */}
          {indigena && (
            <Campo label="Etnia indígena" valor={f.etnia_indigena} onChange={v => set("etnia_indigena", v)}
              sugestoes={ETNIAS_FREQUENTES}
              dica="Raça/cor indígena sem etnia é rejeitada no BPA." />
          )}
        </div>
      </div>

      {/* FILIAÇÃO E NATURALIDADE */}
      <div style={cartao}>
        <div style={rotulo}>Filiação e naturalidade</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Campo label="Nome da mãe" valor={f.nome_mae} onChange={v => set("nome_mae", v)}
            dica="É o campo que mais desempata homônimo — e o mais esquecido." />
          <Campo label="Nome do pai" valor={f.nome_pai} onChange={v => set("nome_pai", v)} />
        </div>
        {/* 🔴 NATURALIDADE SÓ EXISTE PARA QUEM NASCEU AQUI.
            Município e UF eram pedidos de todo mundo, e quem nasceu no
            Uruguai não tem nem um nem outro: o cadastro nunca chegava a
            "completo" e a tela cobrava para sempre dois campos que não
            existem. Pendência que não tem como ser resolvida ensina a
            recepção a ignorar o aviso — e o aviso que importa some junto.
            A nacionalidade vem PRIMEIRO porque é ela que decide o resto. */}
        <div style={{ display: "grid", gridTemplateColumns: noBrasil ? "170px 1fr 90px" : "170px 1fr", gap: 10, marginTop: 10 }}>
          <Campo label="Nacionalidade" valor={f.nacionalidade} onChange={v => set("nacionalidade", v)}
            opcoes={NACIONALIDADES.map(n => [n.chave, n.label])} />
          {noBrasil ? (
            <>
              <Campo label="Naturalidade (município)" valor={f.naturalidade_municipio} onChange={v => set("naturalidade_municipio", v)} />
              <Campo label="UF" valor={f.naturalidade_uf} onChange={v => set("naturalidade_uf", v)} opcoes={["", ...UFS]} />
            </>
          ) : (
            <Campo label="País de nascimento" valor={f.pais_nascimento} onChange={v => set("pais_nascimento", v)}
              sugestoes={PAISES_FREQUENTES}
              dica="Para quem nasceu fora, é o país que ocupa o lugar da naturalidade." />
          )}
        </div>
      </div>

      {/* DOCUMENTOS */}
      <div style={cartao}>
        <div style={rotulo}>Documentos</div>
        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr 130px 1fr", gap: 10 }}>
          <Campo label="CPF" valor={f.cpf} onChange={v => set("cpf", v)} placeholder="000.000.000-00" maxLength={14}
            erro={cpfInvalido}
            dica={cpfInvalido ? "Dígitos verificadores não conferem"
              : (cpfPreenchido ? formatarCPF(f.cpf)
                : (noBrasil || f.nacionalidade === "naturalizada"
                    ? "Exigido nos documentos emitidos (CFM 2.299/2021)"
                    : "Pode não existir — o passaporte faz o papel de documento legal."))} />
          <Campo label="Cartão SUS (CNS)" valor={f.cns} onChange={v => set("cns", v)} placeholder="000 0000 0000 0000" maxLength={18}
            erro={cnsInvalido}
            dica={cnsInvalido ? "Dígitos verificadores não conferem"
              : (cnsPreenchido ? `${formatarCNS(f.cns)} · ${tipoCNS(f.cns) === "provisorio" ? "provisório" : "definitivo"}` : "Sem CNS o atendimento não fecha no SUS")} />
          <Campo label="RG" valor={f.rg} onChange={v => set("rg", v)} />
          <Campo label="Órgão emissor" valor={f.rg_orgao_emissor} onChange={v => set("rg_orgao_emissor", v)} placeholder="SSP/RS" />
        </div>
        {/* O documento de quem pode não ter CPF nenhum. Turista e
            recém-chegado não têm; quem já tirou resolve a exigência com o
            CPF mesmo — o que se pede é UM documento legal, não aquele. */}
        {!noBrasil && (
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 10, marginTop: 10 }}>
            <Campo label="Passaporte" valor={f.passaporte} onChange={v => set("passaporte", v)}
              placeholder="Como está no documento"
              dica="Vale como documento legal no lugar do CPF." />
          </div>
        )}
      </div>

      {/* ENDEREÇO */}
      <div style={cartao}>
        <div style={rotulo}>Endereço</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 1fr", gap: 10 }}>
          <Campo label="Logradouro" valor={f.end_logradouro} onChange={v => set("end_logradouro", v)} placeholder="Rua, avenida…" />
          <Campo label="Número" valor={f.end_numero} onChange={v => set("end_numero", v)} />
          <Campo label="Complemento" valor={f.end_complemento} onChange={v => set("end_complemento", v)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px 130px", gap: 10, marginTop: 10 }}>
          <Campo label="Bairro" valor={f.end_bairro} onChange={v => set("end_bairro", v)} />
          <Campo label="Município" valor={f.end_municipio} onChange={v => set("end_municipio", v)} />
          <Campo label="UF" valor={f.end_uf} onChange={v => set("end_uf", v)} opcoes={["", ...UFS]} />
          <Campo label="CEP" valor={f.end_cep} onChange={v => set("end_cep", v)} placeholder="00000-000" maxLength={9} />
        </div>
        <div style={{ marginTop: 10 }}>
          <Campo label="Ponto de referência (opcional)" valor={f.end_referencia} onChange={v => set("end_referencia", v)}
            dica="Ajuda a equipe de visita domiciliar e o transporte." />
        </div>
      </div>

      {/* CONTATO E RESPONSÁVEL */}
      <div style={cartao}>
        <div style={rotulo}>Contato</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10 }}>
          <Campo label="Telefone" valor={f.telefone} onChange={v => set("telefone", v)} placeholder="(00) 00000-0000" />
          <Campo label="Telefone alternativo" valor={f.telefone_alt} onChange={v => set("telefone_alt", v)} />
          <Campo label="E-mail" tipo="email" valor={f.email} onChange={v => set("email", v)} />
        </div>

        <div style={{ ...rotulo, marginTop: 16 }}>
          Responsável {idade && idade.anos < 18 ? <span style={{ color: "#d97706" }}>— paciente menor de idade</span> : <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(menor de idade ou paciente incapaz)</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10 }}>
          <Campo label="Nome do responsável" valor={f.responsavel_nome} onChange={v => set("responsavel_nome", v)} />
          <Campo label="Documento" valor={f.responsavel_documento} onChange={v => set("responsavel_documento", v)} />
          <Campo label="Parentesco" valor={f.responsavel_parentesco} onChange={v => set("responsavel_parentesco", v)} opcoes={PARENTESCO} />
          <Campo label="Telefone" valor={f.responsavel_telefone} onChange={v => set("responsavel_telefone", v)} />
        </div>
      </div>

      {/* AÇÕES */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 }}>
        <button onClick={salvar} disabled={!canEdit || salvando}
          style={{ background: canEdit ? "linear-gradient(90deg, #2dd4bf, #38bdf8)" : "var(--bg-2)",
                   color: canEdit ? "#062a35" : "var(--text-muted)", border: "none", borderRadius: 7,
                   padding: "11px 26px", fontWeight: 800, fontSize: 13.5, cursor: canEdit ? "pointer" : "not-allowed" }}>
          {salvando ? "Salvando…" : edicao ? "Salvar alterações" : "Cadastrar paciente"}
        </button>
        {onCancelar && (
          <button onClick={onCancelar} style={{ background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "10px 18px", fontSize: 13, cursor: "pointer" }}>
            Cancelar
          </button>
        )}
        {msg && <span style={{ fontSize: 12.5, color: "#fbbf24", fontWeight: 600 }}>{msg}</span>}
        {!canEdit && <span style={{ fontSize: 12, color: "#d97706" }}>Seu perfil não permite cadastrar pacientes.</span>}
      </div>
    </div>
  );
}
