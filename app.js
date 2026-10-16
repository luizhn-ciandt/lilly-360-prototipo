(function () {
  "use strict";

  var STORAGE_KEY = "lilly360-v2";

  var FLOWS = {
    1: { nome: "Da busca ao paciente", meta: 5, inicio: "#/inicio" },
    3: { nome: "Da live perdida ao replay", meta: 0, inicio: "#/congressos" },
    4: { nome: "Do congresso à consulta", meta: 2, inicio: "#/qr", oculto: true },
    5: { nome: "Do estudo ao reconhecimento", meta: 3, inicio: "#/trilha/cardio-fundamentos" }
  };

  var ROUTES = {
    inicio: { titulo: "Início", release: "R1", dado: "Itens abertos e ignorados na seleção da semana", nav: "inicio" },
    busca: { titulo: "Busca", release: "R1", dado: "Termos buscados, sem dado pessoal", nav: "busca" },
    tema: { titulo: "Página educacional e triagem", release: "R1", dado: "Situação escolhida na triagem (momento do paciente) e material enviado", nav: "busca" },
    licao: { titulo: "Micro-lição e quiz", release: "R1", dado: "Tempo assistido e respostas por tema", nav: "aprendizado" },
    caso: { titulo: "Caso clínico ramificado", release: "R2", dado: "Cada decisão do médico", nav: "aprendizado" },
    congressos: { titulo: "Congressos e ao vivo", release: "R1", dado: "Inscrição, lembrete e presença", nav: "congressos" },
    live: { titulo: "Página da live", release: "R1", dado: "Inscrição e horário do lembrete", nav: "congressos" },
    replay: { titulo: "Replay em 3 lições", release: "R1", dado: "Lições do replay assistidas", nav: "congressos" },
    qr: { titulo: "QR autenticado no evento", release: "R2", dado: "Leitura do QR e login", nav: "" },
    evento: { titulo: "Conteúdo do evento", release: "R2", dado: "Itens do evento abertos", nav: "congressos" },
    radar: { titulo: "Radar da semana", release: "R1 (segmentado no R2)", dado: "Temas do Radar abertos", nav: "radar" },
    trilha: { titulo: "Trilha", release: "R1", dado: "Progresso e quiz final", nav: "aprendizado" },
    conclusao: { titulo: "Conclusão, certificado e selo", release: "R2", dado: "Certificado baixado e selo exportado", nav: "aprendizado" },
    social: { titulo: "Social Content Lab", release: "R2", dado: "Peça publicada e canal", nav: "voce" },
    voce: { titulo: "Você: progresso e selos", release: "R1 (certificados no R2)", dado: "Selos exportados e preferências", nav: "voce" },
    aprendizado: { titulo: "Aprendizado", release: "R1", dado: "Trilha aberta", nav: "aprendizado" },
    pacientes: { titulo: "Kit: ferramentas e materiais", release: "R1", dado: "Ferramenta usada e material enviado", nav: "pacientes" },
    protocolos: { titulo: "Acervo", release: "R1", dado: "Página e profundidade de leitura", nav: "protocolos" },
    parceiros: { titulo: "Parceiros", release: "Evolução na F4", dado: "Cliques em conteúdo patrocinado", nav: "" },
    equipe: { titulo: "Falar com a equipe", release: "R3", dado: "Pedidos de contato", nav: "" },
    chatgpt: { titulo: "ChatGPT", release: "Fora da plataforma", dado: "Nenhum: a pesquisa acontece fora do Lilly 360", nav: "", publico: true },
    artigo: { titulo: "Artigo aberto", release: "A definir", dado: "Visita anônima: origem do link e leitura, sem dado pessoal", nav: "", publico: true }
  };

  function initialState() {
    return {
      flow: 0,
      day: "seg",
      touches: 0,
      counting: false,
      goal: null,
      goalSecs: null,
      t0: Date.now(),
      signals: [],
      query: "",
      chat: [],
      triage: null,
      sent: false,
      lessonPlayed: false,
      quiz: { licao: { i: 0, answers: [] }, final: { i: 0, answers: [] } },
      lessonDone: false,
      quizWrong: false,
      caseStep: 0,
      caseChoice: null,
      caseAnswers: [],
      caseDone: false,
      liveSignup: false,
      liveReminder: null,
      liveMissed: false,
      nextLiveSignup: false,
      replaySeen: [],
      qrStep: 0,
      eventAttended: false,
      radarSeen: false,
      trailDone: false,
      postFormat: "post",
      postText: null,
      posted: false,
      sheet: null,
      backstage: false,
      primeiroAcesso: false,
      externo: false,
      deslogado: false,
      gpt: 0,
      why: null,
      audio: false,
      savedKit: false,
      contacts: []
    };
  }

  var state = load();
  var lastRoute = null;
  var lastTouches = null;
  var sheetTimer = null;
  /* Telefone do paciente: só em memória, para um envio. Nunca entra no state salvo. */
  var waFone = "";
  var backstageTimer = null;
  var revealObserver = null;

  function load() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        var saved = Object.assign(initialState(), JSON.parse(raw));
        if (!FLOWS[saved.flow] || FLOWS[saved.flow].oculto) saved.flow = 0;
        saved.chat = saved.chat.map(function (t) { return { q: t.q }; });
        if (saved.gpt === 1) saved.gpt = 2;
        return saved;
      }
    } catch (e) {}
    return initialState();
  }

  function save() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  /* ---------- Utilidades ---------- */

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function icon(name, size, extra) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + (extra || 1.75) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#i-' + name + '" /></svg>';
  }

  function num(n) {
    return String(n).replace(".", ",");
  }

  function normalize(s) {
    return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function sig(nome, props, efeito) {
    state.signals.unshift({ nome: nome, props: props || null, efeito: efeito || null, dia: state.day });
    if (state.signals.length > 40) state.signals.length = 40;
  }

  function toast(msg) {
    var root = $("#toast-root");
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () {
      el.classList.add("is-leaving");
      setTimeout(function () {
        el.remove();
      }, 160);
    }, 2640);
  }

  function parseRoute() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var name = parts[0] || "inicio";
    if (!ROUTES[name]) name = "inicio";
    return { name: name, param: parts[1] || "" };
  }

  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function reachGoal() {
    if (state.goal === null && state.counting) {
      state.goal = state.touches;
      state.goalSecs = Math.max(1, Math.round((Date.now() - state.t0) / 1000));
    }
  }

  /* ---------- Conteúdo ---------- */

  var DIAS = { seg: "Segunda-feira, 5 de outubro", ter: "Terça-feira, 6 de outubro" };

  var TRIAGE = {
    tratamento: {
      label: "Em tratamento",
      detail: "Já usa IECA e a creatinina subiu depois do ajuste",
      momento: "em_tratamento",
      material: "Seu remédio do coração e os exames de rim",
      n: 312
    },
    novo: {
      label: "Novo diagnóstico",
      detail: "Insuficiência cardíaca recém-diagnosticada, com doença renal",
      momento: "novo_diagnostico",
      material: "Insuficiência cardíaca: o que muda a partir de agora",
      n: 188
    },
    efeito: {
      label: "Efeito colateral",
      detail: "Tosse, tontura ou potássio alto depois de iniciar o remédio",
      momento: "efeito_colateral",
      material: "Tosse, tontura e potássio: quando avisar o médico",
      n: 146
    }
  };

  var ACERVO = [
    { t: "Ajuste de dose de IECA quando a creatinina sobe", tipo: "Página educacional, ferramenta e material para o paciente", kw: "ajuste dose creatinina ieca enalapril rim renal titulacao", href: "#/tema/ajuste-de-dose" },
    { t: "TFG CKD-EPI 2021", tipo: "Calculadora", kw: "tfg rim renal creatinina ckd filtracao", href: "#/tema/ajuste-de-dose" },
    { t: "Rim e coração no mesmo paciente", tipo: "Caso clínico", kw: "rim coracao caso dose drc", href: "#/caso/rim-coracao" },
    { t: "Tremor e betabloqueador: o que investigar", tipo: "Estudo no acervo", kw: "tremor betabloqueador", href: "#/protocolos" },
    { t: "Potássio alto com antagonista mineralocorticoide", tipo: "Material para o paciente", kw: "potassio espironolactona hipercalemia", href: "#/pacientes" },
    { t: "iSGLT2 na doença renal crônica", tipo: "Estudo no acervo", kw: "isglt2 sglt2 drc rim dapagliflozina empagliflozina", href: "#/protocolos" }
  ];

  var SUGESTOES = ["Ajuste de dose com creatinina alta", "Tremor com betabloqueador", "Potássio alto com espironolactona", "iSGLT2 na DRC"];

  var RESPOSTAS = [
    {
      titulo: "Ajuste de dose de IECA quando a creatinina sobe",
      kw: "ajuste dose creatinina ieca bra enalapril titulacao titular",
      pontos: [
        "Uma alta da creatinina de até 30% nas primeiras semanas depois de iniciar ou aumentar IECA ou BRA é esperada e, em geral, não exige suspender o remédio.",
        "Reavalie creatinina e potássio em 1 a 2 semanas depois de cada ajuste.",
        "Acima de 30%, ou com potássio acima de 5,5 mmol/L, reduza a dose e procure outras causas: desidratação, anti-inflamatório, estenose de artéria renal."
      ],
      ref: "KDIGO 2024 Clinical Practice Guideline for CKD; Diretriz Brasileira de Insuficiência Cardíaca. Revisado em setembro de 2026.",
      acao: ["Abrir página e triagem", "#/tema/ajuste-de-dose"]
    },
    {
      titulo: "Insuficiência cardíaca com fração de ejeção reduzida",
      kw: "icfer insuficiencia cardiaca fracao ejecao reduzida classes",
      pontos: [
        "As quatro classes reduzem mortalidade e hospitalização na ICFEr e devem ser iniciadas e tituladas em etapas: IECA, BRA ou sacubitril-valsartana; betabloqueador; antagonista mineralocorticoide; iSGLT2.",
        "Altas de creatinina abaixo de 30% não justificam suspender IECA ou BRA."
      ],
      ref: "ESC 2021 Guidelines for heart failure e atualização de 2023.",
      acao: ["Continuar a lição", "#/licao/ic-fer"]
    },
    {
      titulo: "iSGLT2 na doença renal crônica",
      kw: "isglt2 sglt2 dapagliflozina empagliflozina drc",
      pontos: [
        "iSGLT2 com TFG a partir de 20 a 25 protege rim e coração.",
        "Os iSGLT2 reduzem hospitalização e morte cardiovascular na ICFEr, independentemente de diabetes.",
        "Anti-inflamatório piora a função renal e a retenção de sódio."
      ],
      ref: "KDIGO 2024; ESC 2023 focused update.",
      acao: ["Abrir o caso clínico", "#/caso/rim-coracao"]
    }
  ];

  var QUIZ = {
    licao: [
      {
        tema: "ajuste_de_dose",
        q: "Após aumentar a dose do IECA num paciente com ICFEr e DRC, a creatinina sobe 20% em relação ao basal, com potássio normal. Qual a conduta?",
        o: ["Suspender o IECA imediatamente", "Manter a dose e repetir creatinina e potássio em 1 a 2 semanas", "Dobrar a dose para compensar"],
        a: 1,
        f: "Uma alta de até 30% da creatinina nas primeiras semanas é esperada com IECA ou BRA e, em geral, não exige suspender. O controle de creatinina e potássio em 1 a 2 semanas orienta o próximo passo.",
        r: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD."
      },
      {
        tema: "pilares_icfer",
        q: "Quais são os quatro pilares do tratamento farmacológico da ICFEr?",
        o: ["IECA, BRA ou sacubitril-valsartana; betabloqueador; antagonista mineralocorticoide; iSGLT2", "Diurético de alça, digoxina, amiodarona e nitrato", "BRA, bloqueador de canal de cálcio, estatina e AAS"],
        a: 0,
        f: "As quatro classes reduzem mortalidade e hospitalização na ICFEr e devem ser iniciadas e tituladas em etapas.",
        r: "ESC 2021 Guidelines for heart failure e atualização de 2023."
      }
    ],
    final: [
      {
        tema: "albuminuria",
        q: "Qual exame identifica dano renal mesmo com TFG preservada?",
        o: ["Albuminúria (relação albumina/creatinina)", "Ureia isolada", "Ácido úrico"],
        a: 0,
        f: "Albuminúria de 30 mg/g ou mais indica dano renal e aumenta o risco cardiovascular, mesmo com TFG normal.",
        r: "KDIGO 2024 Clinical Practice Guideline for CKD."
      },
      {
        tema: "isglt2_ic",
        q: "Na ICFEr, qual classe reduz hospitalização por insuficiência cardíaca com ou sem diabetes?",
        o: ["Sulfonilureia", "iSGLT2", "Bloqueador de canal de cálcio não di-hidropiridínico"],
        a: 1,
        f: "Os iSGLT2 reduzem hospitalização e morte cardiovascular na ICFEr, independentemente de diabetes.",
        r: "ESC 2021 Guidelines for heart failure."
      }
    ]
  };

  var CASO = [
    {
      etapa: "Apresentação",
      h: "Sr. Paulo, 54 anos, diabetes tipo 2, ICFEr (FE 30%) e DRC estágio 3b (TFG 37). Em uso de enalapril, que você aumentou há 10 dias. A creatinina foi de 1,8 para 2,1 mg/dL (+17%); potássio 5,0 mmol/L.",
      q: "O que você decide?",
      o: ["Manter a dose e reavaliar creatinina e potássio em 1 a 2 semanas", "Suspender o enalapril", "Trocar por hidralazina e nitrato agora"],
      a: 0,
      f: "Uma alta abaixo de 30% é esperada. Suspender tira um pilar que reduz mortalidade; a troca fica para intolerância real.",
      r: "KDIGO 2024; ESC 2021."
    },
    {
      etapa: "Duas semanas depois",
      h: "Creatinina 2,0 mg/dL, potássio 5,1 mmol/L. Classe funcional NYHA II. Ainda sem iSGLT2.",
      q: "Qual o próximo passo?",
      o: ["Adiar o iSGLT2 até a TFG melhorar", "Iniciar iSGLT2, indicado com TFG a partir de 20 a 25", "Associar anti-inflamatório para a dor nas costas"],
      a: 1,
      f: "O iSGLT2 protege o rim e o coração e pode ser iniciado com TFG baixa. Anti-inflamatório piora a função renal e a retenção de sódio.",
      r: "KDIGO 2024; ESC 2023 focused update."
    },
    {
      etapa: "Conversa com o paciente",
      h: "Sr. Paulo pergunta se o rim está piorando por causa dos remédios.",
      q: "Como você responde?",
      o: ["Diz que o rim está piorando e que vai suspender os remédios", "Não comenta o exame para não preocupar", "Explica que a pequena alta é esperada, que os remédios protegem o rim e combina os exames de controle"],
      a: 2,
      f: "Explicar o motivo da alta e o plano de controle melhora a adesão, que é o que protege o rim a longo prazo.",
      r: "Diretriz Brasileira de Insuficiência Cardíaca."
    }
  ];

  var REPLAY = [
    { t: "Visão geral", d: 8 },
    { t: "Casos práticos", d: 10 },
    { t: "Diretrizes", d: 6 }
  ];

  var SELOS = [
    { id: "aprendiz", n: "Aprendiz Ativo", d: "20 atividades concluídas", earned: function () { return state.trailDone; } },
    { id: "especialista", n: "Especialista em Cardiologia", d: "Trilha Cardiologia - Fundamentos", earned: function () { return state.trailDone; } },
    { id: "olhar", n: "Olhar clínico", d: "10 casos clínicos resolvidos", earned: function () { return true; } },
    { id: "sequencia", n: "Semana completa", d: "Uma ação em sete dias", earned: function () { return true; } },
    { id: "aovivo", n: "Presença ao vivo", d: "Participou de uma live", earned: function () { return state.replaySeen.length === 3; } },
    { id: "evento", n: "No congresso", d: "Conteúdo do evento pelo QR", earned: function () { return state.eventAttended; } }
  ];

  function progress() {
    var horas = 18.4 + (state.lessonDone ? 0.3 : 0) + state.replaySeen.length * 0.4 + (state.caseDone ? 0.4 : 0) + (state.trailDone ? 0.9 : 0);
    horas = Math.min(20, Math.round(horas * 10) / 10);
    return {
      licoes: 47 + (state.lessonDone ? 1 : 0) + state.replaySeen.length + (state.trailDone ? 1 : 0),
      horas: horas,
      casos: 12 + (state.caseDone ? 1 : 0),
      dias: 12 + (state.day === "ter" ? 1 : 0),
      ranking: 284 - (state.trailDone ? 2 : 0),
      recert: Math.round((horas / 20) * 100),
      faltam: Math.round((20 - horas) * 10) / 10
    };
  }

  /* ---------- Seleção da semana (regras do R1) ---------- */

  function selection() {
    var ter = state.day === "ter";
    var items = [];
    var casoSobe = state.quizWrong && ter;
    items.push({ id: "caso", score: casoSobe ? 0.86 : 0.57 });
    if (state.liveMissed && ter) items.push({ id: "replay", score: 0.9 });
    if (state.eventAttended && ter) items.push({ id: "evento", score: 0.88 });
    else items.push({ id: "audio", score: 0.64 });
    items.push({ id: "calc", score: state.sent ? 0.78 : 0.6 });
    return items.sort(function (a, b) {
      return b.score - a.score;
    });
  }

  var WHY = {
    caso: function () {
      var sobe = state.quizWrong && state.day === "ter";
      return {
        titulo: "Caso clínico: Rim e coração no mesmo paciente",
        motivo: sobe ? "Porque você teve dúvida sobre ajuste de dose no quiz de segunda" : "Porque você está na trilha Cardiologia Avançada",
        regra: sobe ? "Se o médico erra uma pergunta do tema, o caso do tema entra no topo da seleção da semana seguinte" : "Casos da trilha em andamento entram na seleção",
        sinais: sobe ? ["quiz_respondido {tema: ajuste_de_dose, acerto: false}"] : ["trilha_em_andamento {trilha: cardiologia_avancada}"],
        fonte: sobe ? "Comportamento no Lilly360 (quiz)" : "Comportamento no Lilly360 (trilha)",
        consentimento: "Uso do comportamento para personalizar (aviso de privacidade)"
      };
    },
    replay: function () {
      return {
        titulo: "Replay decomposto: Atualização em Cardiologia 2026",
        motivo: "Porque você se inscreveu na live de segunda e não conseguiu assistir",
        regra: "Inscrição sem presença gera o replay em 3 lições no dia seguinte",
        sinais: ["live_inscricao {evento: cardio_2026}", "live_presenca {presente: false}"],
        fonte: "Plataforma de lives",
        consentimento: "Inscrição no evento"
      };
    },
    evento: function () {
      return {
        titulo: "Conteúdo do congresso: o que muda para o seu paciente",
        motivo: "Porque você participou do congresso ontem",
        regra: "Leitura do QR no estande põe o conteúdo do evento na seleção e no Radar do dia seguinte",
        sinais: ["qr_lido {evento: congresso_cardio_2026}", "login {metodo: crm}"],
        fonte: "QR do evento e login",
        consentimento: "Login autenticado e uso do comportamento para personalizar"
      };
    },
    audio: function () {
      return {
        titulo: "Atualização em áudio: congresso em 14 dias",
        motivo: "Está no Radar desta semana: o congresso de cardiologia é em 14 dias",
        regra: "Itens do Radar da especialidade entram na seleção; formato áudio porque você ouviu 3 áudios no mês",
        sinais: ["radar_semana {especialidade: cardiologia}", "audio_play {mes: 3}"],
        fonte: "Contexto editorial (Radar) e comportamento",
        consentimento: "Uso do comportamento para personalizar"
      };
    },
    calc: function () {
      return {
        titulo: "Calculadoras rápidas",
        motivo: state.sent ? "Porque você enviou material de ajuste de dose a um paciente" : "Porque você usou a TFG CKD-EPI 3 vezes este mês",
        regra: "Ferramentas sobem conforme o uso e o momento do paciente escolhido na triagem",
        sinais: state.sent ? ["triagem_respondida {momento: " + TRIAGE[state.triage].momento + "}", "material_enviado {canal: whatsapp}"] : ["ferramenta_usada {tfg_ckd_epi: 3}"],
        fonte: "Comportamento no Lilly360 e triagem",
        consentimento: "Uso do comportamento para personalizar"
      };
    }
  };

  /* ---------- Componentes ---------- */

  var MEDIA = {
    ecg: '<svg width="200" height="110" viewBox="0 0 200 110" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M0 62h52l10-22 14 46 16-70 14 58 9-12h85" /><circle cx="92" cy="16" r="5" fill="#d31710" stroke="none" /></svg>',
    wave: '<svg width="200" height="80" viewBox="0 0 200 80" fill="currentColor"><rect x="4" y="34" width="6" height="12" rx="3" /><rect x="18" y="24" width="6" height="32" rx="3" /><rect x="32" y="12" width="6" height="56" rx="3" /><rect x="46" y="28" width="6" height="24" rx="3" /><rect x="60" y="18" width="6" height="44" rx="3" /><rect x="74" y="4" width="6" height="72" rx="3" fill="#d31710" /><rect x="88" y="22" width="6" height="36" rx="3" /><rect x="102" y="30" width="6" height="20" rx="3" /><rect x="116" y="14" width="6" height="52" rx="3" /><rect x="130" y="26" width="6" height="28" rx="3" /><rect x="144" y="20" width="6" height="40" rx="3" /><rect x="158" y="32" width="6" height="16" rx="3" /><rect x="172" y="24" width="6" height="32" rx="3" /><rect x="186" y="36" width="6" height="8" rx="3" /></svg>',
    tools: '<svg width="200" height="100" viewBox="0 0 200 100" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 20h40M40 0v40" transform="translate(10 30)" /><path d="M80 50h40" /><path d="M150 35l30 30M180 35l-30 30" /><circle cx="100" cy="35" r="3" fill="#d31710" stroke="none" /><circle cx="100" cy="65" r="3" fill="#d31710" stroke="none" /></svg>',
    replay: '<svg width="200" height="90" viewBox="0 0 200 90" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"><rect x="6" y="20" width="56" height="50" rx="10" /><rect x="72" y="20" width="56" height="50" rx="10" /><rect x="138" y="20" width="56" height="50" rx="10" /><path d="M28 36v18l14-9z" fill="#d31710" stroke="none" /><path d="M94 36v18l14-9z" fill="currentColor" stroke="none" /><path d="M160 36v18l14-9z" fill="currentColor" stroke="none" /></svg>',
    slides: '<svg width="200" height="110" viewBox="0 0 200 110" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="30" y="14" width="140" height="80" rx="10" /><path d="M50 74l26-26 18 16 22-30 34 40" /><circle cx="64" cy="36" r="6" fill="#d31710" stroke="none" /></svg>',
    perfil: '<svg width="200" height="100" viewBox="0 0 200 100" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M30 25h140M30 50h140M30 75h140" /><circle cx="70" cy="25" r="8" fill="currentColor" stroke="none" /><circle cx="130" cy="50" r="8" fill="#d31710" stroke="none" /><circle cx="95" cy="75" r="8" fill="currentColor" stroke="none" /></svg>',
    qr: '<svg width="200" height="110" viewBox="0 0 200 110" fill="currentColor"><rect x="60" y="10" width="26" height="26" rx="4" /><rect x="114" y="10" width="26" height="26" rx="4" /><rect x="60" y="64" width="26" height="26" rx="4" /><rect x="96" y="46" width="8" height="8" /><rect x="114" y="64" width="8" height="8" /><rect x="132" y="82" width="8" height="8" fill="#d31710" /><rect x="96" y="82" width="8" height="8" /><rect x="132" y="64" width="8" height="8" /></svg>'
  };

  function cardHtml(item) {
    var seen = state.replaySeen.length;
    var c = {
      caso: {
        media: "ecg", tone: "rose", tag: "3 ECGs",
       
        title: "Rim e coração no mesmo paciente",
        body: "ICFEr e DRC estágio 3b: como titular o IECA com creatinina elevada?",
        cta: '<a class="cta-link" href="#/caso/rim-coracao">' + (state.caseDone ? "Rever caso" : "Abrir caso") + "</a>"
      },
      replay: {
        media: "replay", tone: "ink", tag: "Você perdeu", flag: true,
       
        title: "Atualização em Cardiologia 2026",
        body: seen === 0 ? "A live de segunda em lições de 8, 10 e 6 minutos." : seen + " de 3 lições assistidas.",
        cta: '<a class="cta-link" href="#/replay/cardio-2026">' + (seen === 0 ? "Iniciar replay" : seen < 3 ? "Continuar replay" : "Rever replay") + "</a>"
      },
      evento: {
        media: "slides", tone: "rose", tag: "Congresso", flag: true,
       
        title: "O que muda para o seu paciente",
        body: "Slides do estande, o material da Dra. Helena Prado e 3 perguntas para o consultório.",
        cta: '<a class="cta-link" href="#/evento/cardio-2026">Ver conteúdo</a>'
      },
      audio: {
        media: "wave", tone: "ink", tag: "2 min",
       
        title: "Congresso em 14 dias: o que observar",
        body: "Os estudos mais esperados e as novas diretrizes de fibrilação atrial.",
        cta: '<button class="cta-link" type="button" data-action="ouvir-atualizacao">' + (state.audio ? "Ouvindo agora" : "Ouvir atualização") + "</button>"
      },
      calc: {
        media: "tools", tone: "cream", tag: "3 ferramentas",
       
        title: "Calculadoras rápidas",
        body: "TFG CKD-EPI 2021, titulação de dose e risco cardiovascular.",
        cta: '<a class="cta-link" href="#/tema/ajuste-de-dose">Calcular a TFG</a>'
      }
    }[item.id];
    return '<article class="card' + (c.flag ? " card-flag" : "") + '">' +
      '<div class="card-media media-' + c.tone + '" aria-hidden="true">' + MEDIA[c.media] + '<span class="card-media-tag">' + c.tag + "</span></div>" +
      '<h3 class="card-title">' + c.title + "</h3>" +
      '<p class="card-body">' + c.body + "</p>" +
      '<p class="card-why">' + esc(WHY[item.id]().motivo) + "</p>" +
      '<div class="card-foot">' + c.cta + "</div></article>";
  }

  function page(opts, body) {
    return '<section class="page' + (opts.narrow ? " page-narrow" : "") + (opts.className ? " " + opts.className : "") + '"><div class="container">' +
      (opts.back !== false ? '<a class="back-link" href="' + (opts.back || "#/inicio") + '"' + (opts.backTo ? ' data-action="ir-secao" data-v="' + opts.backTo + '"' : "") + ">" + icon("back", 18, 2) + (opts.backLabel || "Início") + "</a>" : "") +
      (opts.eyebrow ? '<p class="eyebrow page-eyebrow">' + opts.eyebrow + "</p>" : "") +
      '<div class="page-head' + (opts.intro ? " has-intro" : "") + '">' +
      '<h1 class="display page-title" tabindex="-1" data-focus>' + opts.title + "</h1>" +
      (opts.intro ? '<p class="page-intro">' + opts.intro + "</p>" : "") + "</div>" +
      body + "</div></section>";
  }

  function quizHtml(key) {
    var qs = QUIZ[key];
    var st = state.quiz[key];
    if (st.i >= qs.length) return "";
    var it = qs[st.i];
    var ans = st.answers[st.i];
    var html = '<div class="quiz"><div class="steps" aria-hidden="true">' + qs.map(function (_, i) {
      return '<span class="' + (i <= st.i ? "is-on" : "") + '"></span>';
    }).join("") + "</div>" +
      '<p class="eyebrow">Pergunta ' + (st.i + 1) + " de " + qs.length + "</p>" +
      '<h3 class="quiz-q">' + it.q + "</h3>" +
      '<div class="options">' + it.o.map(function (o, i) {
        var cls = "";
        if (ans) {
          if (i === it.a) cls = " is-right";
          else if (i === ans.choice) cls = " is-wrong";
        }
        return '<button class="option' + cls + '" type="button" data-action="quiz-answer" data-quiz="' + key + '" data-i="' + i + '"' + (ans ? " disabled" : "") + ">" + o + "</button>";
      }).join("") + "</div>";
    if (ans) {
      html += '<div class="feedback' + (ans.ok ? "" : " is-bad") + '"><b>' + (ans.ok ? "Isso." : "Quase.") + "</b> " + it.f + "<cite>Referência: " + it.r + "</cite></div>" +
        '<button class="button button-primary" type="button" data-action="quiz-next" data-quiz="' + key + '">' + (st.i < qs.length - 1 ? "Próxima pergunta" : "Concluir") + "</button>";
    }
    return html + "</div>";
  }

  /* ---------- Telas ---------- */

  var VIEWS = {};

  var HERO_IMG = "https://images.ctfassets.net/tkom1vk0n4w2/5gNDdYkL3DudBVnsVF4UWp/bb1291489c3f8f631cf22b2b734cc4d5/GettyImages-1765296819_1.webp?fm=webp&w=2400&q=80";
  var HERO_LAB = "https://images.ctfassets.net/tkom1vk0n4w2/6fA2K84SlNaoYkmUn8Bavh/b3d50ff0bd4e6c947279e5b66b881aec/LLYPBRDK0026_CA_Eli_Lilly_Kim_TB_0257_sRGB.webp?fm=webp&w=2400&q=80";
  var HERO_EQUIPE = "https://images.ctfassets.net/tkom1vk0n4w2/6kaVMiu1AyTVYX9DM5pMwa/3e607b6be6e99b499bf1ee43e2a11567/GettyImages-1832099991_1.webp?fm=webp&w=2400&q=80";
  function currentLesson() {
    return state.lessonDone
      ? { ctx: "Lição 7 de 8", titulo: "Cardiologia Avançada", falta: "faltam 18 minutos.", nome: "Manejo de arritmias", valor: 0, meta: "0 de 18 min", pct: "0%", href: "#/licao/arritmias", prox: "Prevenção de morte <em>súbita</em>", proxMeta: "Lição 8 de 8, cerca de 15 min" }
      : { ctx: "Lição 6 de 8", titulo: "Cardiologia Avançada", falta: "faltam 4 minutos.", nome: "Insuficiência cardíaca com fração de ejeção reduzida", valor: 0.75, meta: "12 de 16 min", pct: "75%", href: "#/licao/ic-fer", prox: "Manejo de <em>arritmias</em>", proxMeta: "Lição 7 de 8, cerca de 18 min" };
  }

  VIEWS.inicio = function () {
    if (state.primeiroAcesso) return homePrimeiroAcesso();
    var p = progress();
    var ring = 2 * Math.PI * 28;
    var lesson = currentLesson();
    var radarCustom = state.eventAttended && state.day === "ter";

    return '<section class="hero on-dark" aria-labelledby="saudacao">' + heroSlides() +
      '<div class="container hero-inner"><div class="hero-head">' +
      '<p class="eyebrow">' + DIAS[state.day] + "</p>" +
      '<h1 class="display greeting-title" id="saudacao" tabindex="-1" data-focus>Bom dia, <em>Dr. Paulo</em>.</h1></div>' +
      '<div class="hero-foot"><div class="resume-main" role="group" aria-labelledby="retomada"><div>' +
      '<p class="resume-context">' + lesson.ctx + "</p>" +
      '<h2 class="resume-title" id="retomada">' + lesson.titulo + "</h2></div>" +
      '<p class="resume-lesson">' + lesson.nome + "</p>" +
      '<div class="progress"><div class="progress-track" role="progressbar" aria-label="Progresso da lição" aria-valuenow="' + Math.round(lesson.valor * 100) + '" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="--valor: ' + lesson.valor + '"></div></div>' +
      '<div class="progress-meta"><span>' + lesson.meta + "</span><span>" + lesson.pct + "</span></div></div>" +
      '<div class="resume-actions"><a class="button button-primary" href="' + lesson.href + '">' + icon("play", 16) + "Continuar lição</a>" +
      '<button class="button button-outline" type="button" data-action="ouvir-licao">' + icon("headphones", 18) + (state.audio ? "Ouvindo agora" : "Ouvir áudio") + "</button></div></div>" +
      '<div class="hero-side">' +
      '<a class="recert" href="#/voce" aria-label="Recertificação ' + p.recert + "% concluída. Faltam " + num(p.faltam) + ' horas até 31 de março de 2027">' +
      '<span class="ring" aria-hidden="true"><svg width="64" height="64" viewBox="0 0 64 64"><circle class="ring-track" cx="32" cy="32" r="28" fill="none" stroke-width="5" /><circle class="ring-value" cx="32" cy="32" r="28" fill="none" stroke-width="5" stroke-dasharray="' + ((ring * p.recert) / 100).toFixed(1) + " " + ring.toFixed(1) + '" /></svg><span class="ring-label">' + p.recert + "%</span></span>" +
      '<span><span class="recert-title">Recertificação</span><br /><span class="recert-detail">Faltam ' + num(p.faltam) + " h até 31 mar 2027</span></span></a>" +
      '<div class="resume-next"><p class="eyebrow">A seguir</p><p class="display resume-next-title">' + lesson.prox + "</p>" +
      '<p class="resume-next-meta">' + lesson.proxMeta + '</p><a class="cta-link" href="#/aprendizado">Ver lição</a></div></div></div></div></section>' +

      askSection() +

      '<section class="band band-cream" aria-labelledby="para-voce"><div class="container"><div class="opening">' +
      '<p class="eyebrow">Para você</p><h2 class="display opening-title" id="para-voce">Selecionado para <em>a sua prática</em>.</h2>' +
      '<p class="opening-intro">Com base no seu perfil em Cardiologia e no que você fez nesta semana. Cada item diz por que está aqui.</p></div>' +
      '<div class="cards">' + selection().map(cardHtml).join("") + "</div>" +
      '<div class="see-all"><a class="button button-primary" href="#/aprendizado">Ver todas as recomendações</a></div></div></section>' +

      radarSection(radarCustom) +

      '<section class="band band-rose" aria-labelledby="progresso" id="secao-progresso"><div class="container"><div class="opening">' +
      '<p class="eyebrow">Seu progresso</p><h2 class="display opening-title" id="progresso">Cada lição <em>conta</em>.</h2></div>' +
      '<dl class="numbers">' +
      '<div class="number"><dt>Lições concluídas este ano</dt><dd>' + p.licoes + "</dd></div>" +
      '<div class="number"><dt>De 20 h de EMC exigidas</dt><dd>' + num(p.horas) + '<span class="number-unit"> h</span></dd></div>' +
      '<div class="number"><dt>Casos resolvidos</dt><dd>' + p.casos + "</dd></div>" +
      '<div class="number"><dt>Dias de estudo seguidos</dt><dd>' + p.dias + "</dd></div>" +
      '<div class="number"><dt>No ranking de cardiologistas' + (state.trailDone ? '<span class="number-delta">subiu 2 posições</span>' : "") + "</dt><dd>" + p.ranking + "º</dd></div></dl>" +
      (state.trailDone
        ? '<div class="unlocked on-dark"><div><p class="eyebrow">Novos selos desbloqueados</p><ul class="unlocked-list"><li>' + icon("medal", 22) + "Especialista em Cardiologia</li><li>" + icon("medal", 22) + 'Aprendiz Ativo, 20 atividades</li></ul></div><div class="unlocked-actions"><a class="button button-dark" href="#/voce">Ver certificados</a><a class="button button-line" href="#/voce">Ver selos</a></div></div>' +
          '<div class="next-trail"><div><p class="eyebrow">Continuamos por aqui</p><p class="next-trail-title">Cardio-renal na prática</p><p class="next-trail-meta">Próxima trilha recomendada · 6 lições</p></div><a class="button button-line" href="#/aprendizado">Ver trilha</a></div>'
        : "") +
      homeFoot() +
      "</div></section>";
  };

  function heroSlides() {
    return '<div class="hero-slides" aria-hidden="true">' +
      '<img class="hero-media" src="' + HERO_IMG + '" alt="" fetchpriority="high" /></div>';
  }

  function homeFoot() {
    return '<div class="page-foot"><p class="legal">Conteúdo ilustrativo, sujeito a MLR. Material educacional destinado a profissionais de saúde.</p>' +
      '<p class="footer-links"><a href="#/voce" data-action="ir-secao" data-v="preferencias">Preferências</a><a href="#/voce" data-action="ir-secao" data-v="preferencias">Privacidade</a><button type="button" data-action="why" data-item="inicio">Por que vejo isto</button></p></div>';
  }

  function radarSection(custom) {
    return '<section class="band band-white" aria-labelledby="radar-home"><div class="container"><div class="radar-home">' +
      '<div><p class="eyebrow">Radar da semana</p><h2 class="display section-title" id="radar-home">O que seu paciente vai <em>perguntar</em>.</h2>' +
      (custom ? '<p class="tag-note">Personalizado com o congresso de ontem</p>' : "") +
      '<a class="cta-link" href="#/radar">Abrir o Radar</a></div>' +
      '<ul class="radar-list">' + radarItems().map(function (r) {
        return '<li><span class="radar-kicker">' + r.k + "</span><span>" + r.t + "</span></li>";
      }).join("") + "</ul></div></div></section>";
  }

  function askComposer(id) {
    return '<form class="ask-form" role="search" data-form="pesquisa">' +
      '<label class="visually-hidden" for="' + id + '">Descreva o cenário do seu paciente</label>' +
      '<textarea id="' + id + '" rows="1" autocomplete="off" placeholder="Descreva o cenário"></textarea>' +
      '<button class="ask-send" type="submit" aria-label="Pesquisar" disabled>' + icon("arrow-up", 20, 2.25) + "</button></form>";
  }

  function askChips() {
    return '<p class="eyebrow search-label">Perguntas frequentes de cardiologistas</p>' +
      '<div class="chips">' + SUGESTOES.map(function (s) {
        return '<button class="chip" type="button" data-action="pesquisa-sugestao" data-q="' + s + '">' + s + "</button>";
      }).join("") + "</div>";
  }

  function askFoot() {
    return '<div class="ask-foot"' + (state.chat.length ? "" : " hidden") + '><button class="text-button ask-clear" type="button" data-action="pesquisa-limpar">Nova pesquisa</button></div>';
  }

  function askSection() {
    return '<section class="band ask" aria-labelledby="pesquisa-titulo" id="pesquisa"><div class="container"><div class="ask-inner">' +
      '<div class="ask-head"><p class="eyebrow">Pesquisa</p><h2 class="display section-title" id="pesquisa-titulo">O que você precisa <em>agora</em>?</h2></div>' +
      '<div class="ask-thread" id="pesquisa-thread" aria-live="polite">' + pesquisaThread() + "</div>" +
      askComposer("pesquisa-input") + askFoot() + askChips() +
      "</div></div></section>";
  }

  var AREAS = [
    { href: "#/protocolos", media: "slides", tone: "ink", tag: "Acervo aprovado", t: "Protocolos", d: "Estudos e diretrizes do acervo aprovado, para ler aqui ou baixar.", cta: "Abrir o acervo" },
    { href: "#/pacientes", media: "tools", tone: "cream", tag: "Kit", t: "Meus pacientes", d: "Calculadoras e material para enviar ao paciente.", cta: "Ver ferramentas" },
    { href: "#/congressos", media: "replay", tone: "rose", tag: "Ao vivo e replay", t: "Congressos", d: "Agenda de lives e congressos, com replays em lições curtas.", cta: "Ver agenda" },
    { href: "#/radar", media: "wave", tone: "rose", tag: "Nesta semana", t: "Radar de sinais", d: "O que seus pacientes vão perguntar nesta semana.", cta: "Abrir o Radar" },
    { href: "#/aprendizado", media: "ecg", tone: "ink", tag: "Trilhas e casos", t: "Aprendizado", d: "Trilhas e casos clínicos que contam para a recertificação.", cta: "Ver trilhas" },
    { href: "#/voce", media: "perfil", tone: "cream", tag: "Perfil", t: "Você", d: "Seu perfil, certificados e o que a plataforma usa para personalizar.", cta: "Ver perfil" }
  ];

  function homePrimeiroAcesso() {
    return '<section class="hero on-dark hero--busca' + (state.chat.length ? " is-conversa" : "") + '" aria-labelledby="saudacao">' + heroSlides() +
      '<div class="container hero-inner"><div class="hero-head">' +
      '<p class="eyebrow">' + DIAS[state.day] + "</p>" +
      '<h1 class="display greeting-title" id="saudacao" tabindex="-1" data-focus>Boas-vindas, <em>Dr. Paulo</em>.</h1></div>' +
      '<div class="hero-ask"><h2 class="display hero-ask-title">O que você precisa <em>agora</em>?</h2>' +
      '<div class="ask-thread hero-thread" id="pesquisa-thread" role="region" aria-label="Respostas da pesquisa" tabindex="' + (state.chat.length ? 0 : -1) + '" aria-live="polite">' + pesquisaThread() + "</div>" +
      askComposer("pesquisa-hero-input") + askFoot() + askChips() + "</div></div></section>" +

      '<section class="band band-cream" aria-labelledby="areas"><div class="container"><div class="opening">' +
      '<p class="eyebrow">Lilly 360</p><h2 class="display opening-title" id="areas">Tudo da sua prática em <em>um lugar</em>.</h2>' +
      '<p class="opening-intro">Conteúdo aprovado pela área médica da Lilly, com referência, para consultar antes, durante e depois da consulta.</p></div>' +
      '<div class="cards cards-3">' + AREAS.map(function (a) {
        return '<article class="card">' +
          '<div class="card-media media-' + a.tone + '" aria-hidden="true">' + MEDIA[a.media] + '<span class="card-media-tag">' + a.tag + "</span></div>" +
          '<h3 class="card-title">' + a.t + "</h3>" +
          '<p class="card-body">' + a.d + "</p>" +
          '<div class="card-foot"><a class="cta-link" href="' + a.href + '">' + a.cta + "</a></div></article>";
      }).join("") + "</div></div></section>" +

      radarSection(false) +

      '<section class="band band-rose" aria-labelledby="personalizacao"><div class="container"><div class="opening">' +
      '<p class="eyebrow">Personalização</p><h2 class="display opening-title" id="personalizacao">A plataforma aprende <em>com você</em>.</h2>' +
      '<p class="opening-intro">A cada acesso, a home mostra o que faz sentido para a sua prática, e cada item diz por que está ali. Você decide o que pode ser usado.</p></div>' +
      '<div class="see-all"><a class="button button-dark" href="#/voce" data-action="ir-secao" data-v="preferencias">Ver preferências</a></div>' +
      homeFoot() +
      "</div></section>";
  }

  function radarItems() {
    if (state.eventAttended && state.day === "ter") {
      return [
        { k: "Do congresso", t: "Insulina de longa ação: o que muda no risco cardiovascular" },
        { k: "Do congresso", t: "Cirurgias e medicamentos: quando suspender anticoagulante e iSGLT2" },
        { k: "Do congresso", t: "Triagem de complicações: rim e coração no diabetes" }
      ];
    }
    return [
      { k: "Está circulando", t: "Jejum intermitente faz bem ao coração? A evidência em 90 segundos" },
      { k: "Em 14 dias", t: "Congresso de cardiologia: os estudos que devem mudar a prática" },
      { k: "Regulatório", t: "Nova diretriz de hipertensão: o que muda na meta de pressão" }
    ];
  }

  VIEWS.busca = function () {
    return page({ eyebrow: "Busca", title: "O que você precisa <em>agora</em>?", narrow: true },
      '<form class="search-form" role="search" data-form="busca">' +
      '<label class="visually-hidden" for="busca-input">Buscar no acervo aprovado</label>' + icon("search", 22) +
      '<input id="busca-input" type="search" autocomplete="off" value="' + esc(state.query) + '" placeholder="Pergunte como você fala: ajuste de dose com creatinina alta" />' +
      "</form>" +
      '<p class="search-note">A busca só encontra conteúdo aprovado, com referência. Nenhuma resposta é gerada por IA.</p>' +
      '<p class="eyebrow search-label">Perguntas frequentes de cardiologistas</p>' +
      '<div class="chips">' + SUGESTOES.map(function (s, i) {
        return i === 0
          ? '<a class="chip" href="#/tema/ajuste-de-dose" data-action="busca-sugestao" data-q="' + s + '">' + s + "</a>"
          : '<button class="chip" type="button" data-action="busca-sugestao" data-q="' + s + '">' + s + "</button>";
      }).join("") + "</div>" +
      '<div id="busca-resultados" aria-live="polite">' + searchResults() + "</div>");
  };

  var STOPWORDS = ["com", "sem", "que", "para", "por", "uma", "uns", "dos", "das", "nos", "nas", "mas", "como", "qual", "quais", "quando", "depois", "apos", "antes", "esta", "isso", "meu", "minha", "paciente", "anos"];

  function queryWords(text) {
    return normalize(text.trim()).split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 2 && STOPWORDS.indexOf(w) === -1;
    });
  }

  function acervoMatch(text) {
    var words = queryWords(text);
    return ACERVO.filter(function (it) {
      return words.some(function (w) {
        return it.kw.indexOf(w) > -1 || normalize(it.t).indexOf(w) > -1;
      });
    });
  }

  function respostasMatch(text) {
    var words = queryWords(text);
    return RESPOSTAS.filter(function (r) {
      return words.some(function (w) {
        return r.kw.indexOf(w) > -1;
      });
    });
  }

  function pesquisaTurn(turn) {
    var q = '<p class="ask-q">' + esc(turn.q) + "</p>";
    var head = '<div class="ask-who"><span class="ask-mark" aria-hidden="true">' + icon("book", 16, 1.75) + '</span><span class="ask-label">Do acervo aprovado</span></div>';
    if (turn.pending) {
      return '<div class="ask-turn">' + q + '<div class="ask-a is-pending">' + head + '<p class="ask-wait">Procurando no acervo aprovado<span class="ask-dots" aria-hidden="true"><span></span><span></span><span></span></span></p></div></div>';
    }
    var respostas = respostasMatch(turn.q);
    var fontes = acervoMatch(turn.q);
    var body;
    if (!respostas.length && !fontes.length) {
      body = '<p class="ask-text">Nenhum item aprovado para "' + esc(turn.q) + '". Tente outras palavras ou abra o <a class="inline-link" href="#/protocolos">acervo</a>.</p>';
    } else {
      body = (respostas.length
        ? respostas.map(function (r) {
            var resto = r.pontos.slice(1);
            return '<div class="ask-section"><h3 class="ask-h">' + r.titulo + '</h3><p class="ask-lead">' + r.pontos[0] + "</p>" +
              (resto.length ? '<ul class="ask-points">' + resto.map(function (p) {
                return "<li>" + p + "</li>";
              }).join("") + "</ul>" : "") +
              '<div class="ask-cite"><p class="ask-ref"><span class="ask-ref-label">Referência</span>' + r.ref + '</p><a class="button button-dark ask-cta" href="' + r.acao[1] + '">' + r.acao[0] + "</a></div></div>";
          }).join("")
        : '<p class="ask-text">Ainda não há um resumo aprovado para esta pergunta. Estes são os itens do acervo sobre o tema:</p>') +
        (fontes.length
          ? '<p class="ask-sources">Fontes no acervo</p><ul class="ask-fontes">' + fontes.map(function (it) {
              return '<li><a class="ask-fonte" href="' + it.href + '"><span class="ask-fonte-tipo">' + it.tipo + '</span><span class="ask-fonte-titulo">' + it.t + "</span></a></li>";
            }).join("") + "</ul>"
          : "");
    }
    return '<div class="ask-turn">' + q + '<div class="ask-a">' + head + '<div class="ask-body">' + body +
      '<p class="ask-note">Resposta montada só com trechos aprovados pela área médica, com referência. Nenhum texto é gerado por IA.</p></div></div></div>';
  }

  function pesquisaThread() {
    return state.chat.map(pesquisaTurn).join("");
  }

  function searchResults() {
    var q = normalize(state.query.trim());
    if (!q) return "";
    var found = acervoMatch(state.query);
    if (!found.length) return '<p class="search-empty">Nenhum item aprovado para "' + esc(state.query) + '". Tente outras palavras ou abra o <a class="inline-link" href="#/protocolos">acervo</a>.</p>';
    return '<p class="search-count">' + found.length + (found.length === 1 ? " item aprovado" : " itens aprovados") + "</p><ul class=\"result-list\">" + found.map(function (it) {
      return '<li><a class="result" href="' + it.href + '"><span class="result-type">' + it.tipo + '</span><span class="result-title">' + it.t + "</span>" + icon("chevron", 20, 2) + "</a></li>";
    }).join("") + "</ul>";
  }

  /* ---------- Cenário externo: ChatGPT e artigo aberto ---------- */

  var GPT_Q = "Paciente de 54 anos com ICFEr e DRC 3b. A creatinina subiu 17% depois que aumentei o enalapril. Preciso suspender?";
  var ARTIGO_TITULO = "Creatinina subiu depois do IECA: quando manter a dose";

  var GPT_ICONS = {
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" />',
    edit: '<path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />',
    search: '<circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />',
    library: '<rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="2" /><path d="m21 15-5-5L5 21" />',
    chevdown: '<path d="m6 9 6 6 6-6" />',
    share: '<path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />',
    dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />',
    plus: '<path d="M12 5v14M5 12h14" />',
    globe: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />',
    up: '<path d="M12 19V5M5 12l7-7 7 7" />',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />',
    like: '<path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" />',
    dislike: '<g transform="rotate(180 12 12)"><path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 21H7" /></g>',
    speaker: '<path d="M11 5 6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />',
    regen: '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" />'
  };

  function gi(name, size) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + GPT_ICONS[name] + "</svg>";
  }

  function gptFav(tipo) {
    var letra = { lilly: "L", kdigo: "K", sbc: "S" }[tipo];
    return '<span class="gpt-fav gpt-fav--' + tipo + '" aria-hidden="true">' + letra + "</span>";
  }

  function gptCiteLilly() {
    return '<a class="gpt-cite gpt-cite--lilly" href="#/artigo" data-action="gpt-abrir" aria-label="Fonte: Lilly 360, ' + ARTIGO_TITULO + '">Lilly 360' +
      '<span class="gpt-pop" aria-hidden="true"><span class="gpt-pop-site">' + gptFav("lilly") + "lilly360.com.br</span>" +
      '<span class="gpt-pop-title">' + ARTIGO_TITULO + "</span>" +
      '<span class="gpt-pop-text">Uma alta de até 30% nas primeiras semanas depois de iniciar ou aumentar IECA ou BRA é esperada.</span></span></a>';
  }

  function gptCite(nome) {
    return '<button class="gpt-cite" type="button" data-action="gpt-fora">' + nome + "</button>";
  }

  function gptComposer(cheio) {
    return '<form class="gpt-composer" data-form="gpt">' +
      '<label class="visually-hidden" for="gpt-input">Mensagem para o ChatGPT</label>' +
      '<textarea id="gpt-input" rows="1" placeholder="Pergunte alguma coisa">' + (cheio ? GPT_Q : "") + "</textarea>" +
      '<div class="gpt-composer-row">' +
      '<span class="gpt-ico gpt-ico--sm" aria-hidden="true">' + gi("plus", 20) + "</span>" +
      '<span class="gpt-tool" aria-hidden="true">' + gi("globe", 18) + "Buscar</span>" +
      '<span class="gpt-spacer"></span>' +
      '<span class="gpt-ico gpt-ico--sm" aria-hidden="true">' + gi("mic", 20) + "</span>" +
      '<button class="gpt-send" type="submit" aria-label="Enviar mensagem"' + (cheio ? "" : " disabled") + ">" + gi("up", 20) + "</button></div></form>";
  }

  function gptAnswer() {
    return '<div class="gpt-answer">' +
      '<p class="gpt-searched">' + gi("globe", 16) + "Pesquisou 4 sites</p>" +
      "<p>Na maioria dos casos, <strong>não é preciso suspender o enalapril</strong>. Uma alta de até 30% na creatinina nas primeiras semanas depois de iniciar ou aumentar um IECA é esperada e, em geral, não indica lesão renal. " + gptCiteLilly() + "</p>" +
      "<h3>O que fazer agora</h3>" +
      "<ul><li>A alta de 17% está abaixo do limite de 30%: a dose pode ser mantida.</li>" +
      "<li>Repita creatinina e potássio em 1 a 2 semanas. " + gptCite("KDIGO") + "</li></ul>" +
      "<h3>Quando reduzir a dose</h3>" +
      "<ul><li>Se a alta passar de 30%, ou o potássio passar de 5,5 mmol/L.</li>" +
      "<li>Nesse caso, procure outras causas: desidratação, anti-inflamatório ou estenose de artéria renal. " + gptCite("SBC") + "</li></ul>" +
      "<p>O Lilly 360 tem uma página sobre esse cenário, revisada pela área médica, com orientação por situação do paciente. " + gptCiteLilly() + "</p>" +
      '<div class="gpt-actions" aria-hidden="true">' +
      ["copy", "like", "dislike", "speaker", "share", "regen"].map(function (n) {
        return '<span class="gpt-ico gpt-ico--xs">' + gi(n, 18) + "</span>";
      }).join("") +
      '<span class="gpt-sources">' + gptFav("lilly") + gptFav("kdigo") + gptFav("sbc") + "Fontes</span></div></div>";
  }

  VIEWS.chatgpt = function () {
    var enviado = state.gpt > 0;
    var chats = ["Resumo do ESC 2021 para residentes", "Dose de espironolactona na DRC", "Plano de aula: insuficiência cardíaca", "Interação entre amiodarona e varfarina"];
    var side = '<aside class="gpt-side" aria-hidden="true" inert>' +
      '<div class="gpt-side-top"><span class="gpt-ico">' + gi("sidebar") + '</span><span class="gpt-ico">' + gi("edit") + "</span></div>" +
      '<div class="gpt-side-nav"><span class="gpt-side-item">' + gi("edit", 18) + 'Novo chat</span><span class="gpt-side-item">' + gi("search", 18) + 'Buscar em chats</span><span class="gpt-side-item">' + gi("library", 18) + "Biblioteca</span></div>" +
      '<p class="gpt-side-label">Chats</p><div class="gpt-chats">' +
      (enviado ? '<span class="gpt-side-item is-active">Creatinina após aumentar enalapril</span>' : "") +
      chats.map(function (c) { return '<span class="gpt-side-item">' + c + "</span>"; }).join("") + "</div>" +
      '<div class="gpt-user"><span class="gpt-avatar">PF</span><span class="gpt-user-name">Paulo Ferreira<small>Plus</small></span></div></aside>';

    var top = '<header class="gpt-top"><span class="gpt-model" aria-hidden="true">ChatGPT' + gi("chevdown", 16) + "</span>" +
      (enviado ? '<span class="gpt-top-right" aria-hidden="true"><span class="gpt-share">' + gi("share", 18) + 'Compartilhar</span><span class="gpt-ico">' + gi("dots") + "</span></span>" : "") + "</header>";

    var main;
    if (!enviado) {
      main = '<div class="gpt-home"><h1 class="gpt-hello" tabindex="-1" data-focus>Por onde começamos?</h1>' + gptComposer(true) + "</div>";
    } else {
      main = '<div class="gpt-scroll"><div class="gpt-col gpt-thread"><h1 class="visually-hidden" tabindex="-1" data-focus>Conversa no ChatGPT</h1>' +
        '<div class="gpt-user-msg"><p>' + GPT_Q + "</p></div>" +
        (state.gpt === 1 ? '<p class="gpt-thinking" role="status">Pesquisando na web</p>' : gptAnswer()) +
        '</div></div><div class="gpt-dock"><div class="gpt-col">' + gptComposer(false) +
        '<p class="gpt-disclaimer">O ChatGPT pode cometer erros. Considere verificar informações importantes.</p></div></div>';
    }
    return '<div class="gpt' + (enviado ? " is-chat" : "") + '">' + side + '<section class="gpt-main" aria-label="ChatGPT">' + top + main + "</section></div>";
  };

  VIEWS.artigo = function () {
    var travados = [
      ["Triagem por situação", "Em tratamento, com dose recém-ajustada ou com piora: a orientação muda com o paciente."],
      ["TFG CKD-EPI 2021", "A calculadora abre na própria página, com o resultado pronto para a decisão."],
      ["Material para o paciente", "Uma página em linguagem simples, para enviar pelo WhatsApp, imprimir ou mostrar o QR."]
    ];
    var body = '<p class="artigo-meta">Revisado pela área médica da Lilly · setembro de 2026 · 4 min de leitura</p>' +
      '<p class="artigo-lead">A creatinina costuma subir logo depois de iniciar ou aumentar um IECA ou BRA. Na maior parte dos casos, a alta é esperada e o remédio deve continuar. Veja quando manter, quando reduzir e o que investigar.</p>' +
      '<div class="edu"><div class="edu-main"><ul class="key-points">' +
      "<li>Uma alta da creatinina de até 30% nas primeiras semanas depois de iniciar ou aumentar IECA ou BRA é esperada e, em geral, não exige suspender o remédio.</li>" +
      "<li>Reavalie creatinina e potássio em 1 a 2 semanas depois de cada ajuste.</li>" +
      "<li>Acima de 30%, ou com potássio acima de 5,5 mmol/L, reduza a dose e procure outras causas: desidratação, anti-inflamatório, estenose de artéria renal.</li>" +
      '</ul><p class="edu-ref">Referências: KDIGO 2024 Clinical Practice Guideline for CKD; Diretriz Brasileira de Insuficiência Cardíaca. Revisado em setembro de 2026.</p></div></div>' +

      '<section class="artigo-gate" aria-labelledby="artigo-gate-titulo">' +
      '<div class="artigo-gate-head"><p class="eyebrow">Com login no Lilly 360</p>' +
      '<h2 class="display section-title" id="artigo-gate-titulo">Leve este caso para o <em>seu consultório</em>.</h2></div>' +
      '<ul class="artigo-locked">' + travados.map(function (t) {
        return '<li class="artigo-locked-item"><span class="artigo-lock" aria-hidden="true">' + icon("lock", 18, 1.75) + '</span><span class="artigo-locked-title">' + t[0] + '</span><span class="artigo-locked-text">' + t[1] + "</span></li>";
      }).join("") + "</ul>" +
      '<div class="artigo-gate-cta"><button class="button button-primary" type="button" data-action="login-abrir">Entrar com CRM</button>' +
      '<p class="fine">Acesso exclusivo para profissionais de saúde.</p></div></section>' +

      '<p class="legal">Conteúdo ilustrativo, sujeito a MLR. Material educacional destinado a profissionais de saúde. Nesta versão aberta, nada sobre você é usado para personalizar a página.</p>';
    return page({ narrow: true, back: false, className: "artigo", eyebrow: "Cardiologia · Nefrologia", title: "Creatinina subiu depois do IECA: quando <em>manter a dose</em>" }, body);
  };

  VIEWS.tema = function () {
    var t = state.triage ? TRIAGE[state.triage] : null;
    var body = '<div class="edu"><div class="edu-main">' +
      '<ul class="key-points">' +
      "<li>Uma alta da creatinina de até 30% nas primeiras semanas depois de iniciar ou aumentar IECA ou BRA é esperada e, em geral, não exige suspender o remédio.</li>" +
      "<li>Reavalie creatinina e potássio em 1 a 2 semanas depois de cada ajuste.</li>" +
      "<li>Acima de 30%, ou com potássio acima de 5,5 mmol/L, reduza a dose e procure outras causas: desidratação, anti-inflamatório, estenose de artéria renal.</li>" +
      "</ul>" +
      '<p class="edu-ref">Referências: KDIGO 2024 Clinical Practice Guideline for CKD; Diretriz Brasileira de Insuficiência Cardíaca. Revisado em setembro de 2026.</p></div></div>' +

      '<div class="triage"><p class="eyebrow">Triagem</p><h2 class="display section-title">Qual situação apareceu no seu <em>consultório</em>?</h2>' +
      '<div class="triage-options">' + Object.keys(TRIAGE).map(function (k) {
        var it = TRIAGE[k];
        return '<button class="triage-option" type="button" data-action="triagem" data-k="' + k + '" aria-pressed="' + (state.triage === k) + '"><span class="triage-label">' + it.label + '</span><span class="triage-detail">' + it.detail + "</span></button>";
      }).join("") + "</div></div>";

    if (t) {
      body += '<div class="kit-result" id="kit-result">' +
        '<div class="panel"><p class="eyebrow">Para usar agora</p><h3 class="panel-title">TFG CKD-EPI 2021</h3>' +
        '<div class="calc"><div class="field"><label for="tfg-cr">Creatinina (mg/dL)</label><input id="tfg-cr" type="number" inputmode="decimal" step="0.1" min="0.2" max="15" value="2.1" /></div>' +
        '<div class="field"><label for="tfg-idade">Idade</label><input id="tfg-idade" type="number" inputmode="numeric" min="18" max="110" value="54" /></div>' +
        '<div class="field"><label for="tfg-sexo">Sexo</label><select id="tfg-sexo"><option value="m">Masculino</option><option value="f">Feminino</option></select></div></div>' +
        '<button class="button button-line" type="button" data-action="calc-tfg">Calcular</button>' +
        '<div class="calc-out" id="tfg-out" aria-live="polite"></div>' +
        '<p class="fine">Ferramenta de apoio. Não substitui o julgamento clínico. Os valores digitados não são guardados.</p></div>' +

        '<div class="panel panel-material"><p class="eyebrow">Para o paciente</p><h3 class="panel-title">' + t.material + "</h3>" +
        '<p class="panel-body">Uma página em linguagem simples, com referência e data. Versões para WhatsApp, impressão e QR.</p>' +
        '<button class="button button-primary" type="button" data-action="sheet" data-sheet="whatsapp" data-material="' + esc(t.material) + '">' + icon("send", 18, 2) + "Enviar ao paciente</button>" +
        '<p class="social-proof"><b>' + t.n + " cardiologistas</b> enviaram este material nesta semana. Número ilustrativo; só aparece acima de um mínimo de médicos.</p></div></div>";
    }
    return page({ eyebrow: "Página educacional · conteúdo aprovado", title: "Ajuste de dose de IECA quando a <em>creatinina sobe</em>", back: "#/inicio", backTo: "pesquisa", backLabel: "Pesquisa" }, body);
  };

  VIEWS.licao = function (param) {
    if (param === "arritmias") {
      return page({ eyebrow: "Cardiologia Avançada · lição 7 de 8", title: "Manejo de <em>arritmias</em>", back: "#/inicio" },
        '<div class="lesson"><div class="lesson-main">' + videoHtml("Vídeo da lição, 18 minutos", false) +
        '<div class="panel"><h2 class="panel-title">O conceito em uma frase</h2><p class="panel-body">Na fibrilação atrial, a decisão começa pelo risco de AVC (CHA₂DS₂-VASc) e pelo controle de frequência; o ritmo vem depois.</p></div></div>' +
        '<aside class="panel"><p class="eyebrow">Próximo passo</p><p class="panel-body">Depois desta lição, o caso "Fibrilação atrial no idoso frágil" entra na sua seleção.</p><a class="cta-link" href="#/inicio">Voltar ao início</a></aside></div>');
    }
    var st = state.quiz.licao;
    var done = state.lessonDone;
    var right = st.answers.filter(function (a) { return a && a.ok; }).length;
    var aside;
    if (done) {
      aside = '<p class="eyebrow">Lição concluída</p><h2 class="panel-title">' + right + " de 2 acertos</h2>" +
        (state.quizWrong
          ? '<p class="panel-body">O tema <b>ajuste de dose</b> ficou em aberto. Ele volta na sua seleção da semana, com um caso clínico.</p>'
          : '<p class="panel-body">Quiz perfeito. A próxima lição já está liberada.</p>') +
        '<div class="feedback"><b>Aplique hoje:</b> antes de ajustar a dose, calcule a TFG do paciente. <a class="inline-link" href="#/tema/ajuste-de-dose">Abrir a calculadora</a></div>' +
        '<div class="stack-actions"><a class="button button-primary" href="#/licao/arritmias">Próxima lição: Manejo de arritmias</a><a class="cta-link" href="#/inicio">Voltar ao início</a></div>';
    } else if (!state.lessonPlayed) {
      aside = '<p class="eyebrow">Quiz da lição</p><h2 class="panel-title">Duas perguntas no fim</h2><p class="panel-body">Assista aos últimos 4 minutos. O quiz confirma o que ficou e mostra o que vale rever.</p>' +
        '<button class="button button-primary" type="button" data-action="licao-concluir">Concluir e fazer o quiz</button>';
    } else {
      aside = quizHtml("licao");
    }
    return page({ eyebrow: "Cardiologia Avançada · lição 6 de 8", title: "Insuficiência cardíaca com fração de ejeção <em>reduzida</em>", back: "#/inicio" },
      '<div class="lesson"><div class="lesson-main">' + videoHtml("Vídeo da lição, faltam 4 minutos", state.lessonPlayed) +
      '<div class="panel"><h2 class="panel-title">O conceito em uma frase</h2><p class="panel-body">Na ICFEr, quatro classes reduzem mortalidade e são iniciadas em etapas; cada ajuste de dose olha o rim e o potássio, sem suspender por altas esperadas da creatinina.</p></div></div>' +
      '<aside class="panel lesson-aside" aria-live="polite">' + aside + "</aside></div>");
  };

  function videoHtml(label, played) {
    return '<div class="video' + (played ? " is-played" : "") + '"><button class="video-play" type="button" data-action="licao-play" aria-label="' + (played ? "Assistido" : "Assistir: " + label) + '">' + (played ? icon("check", 30, 2.5) : icon("play", 30)) + "</button>" +
      '<div class="video-bar"><span style="transform: scaleX(' + (played ? 1 : 0.75) + ')"></span></div>' +
      '<p class="video-meta">' + (played ? "16 de 16 min · assistido" : "12 de 16 min") + "</p></div>";
  }

  VIEWS.caso = function () {
    var body;
    if (state.caseDone) {
      var wrong = state.caseAnswers.filter(function (a) { return !a.ok; }).length;
      body = '<div class="lesson"><div class="panel"><p class="eyebrow">Caso concluído</p><h2 class="panel-title">' + (3 - wrong) + " de 3 decisões alinhadas às diretrizes</h2>" +
        '<div class="feedback"><b>Aplique hoje:</b> envie ao seu paciente o material "Seus rins e seu coração".</div>' +
        '<div class="stack-actions"><button class="button button-primary" type="button" data-action="sheet" data-sheet="whatsapp" data-material="Seus rins e seu coração">' + icon("send", 18, 2) + "Enviar material</button>" +
        '<a class="cta-link" href="#/licao/ic-fer">' + (wrong ? "Lição de reforço: o ponto em que você errou" : "Rever a lição de ajuste de dose") + "</a></div></div>" + caseRules() + "</div>";
    } else {
      var it = CASO[state.caseStep];
      var ans = state.caseAnswers[state.caseStep];
      body = '<div class="lesson"><div class="panel case">' +
        '<div class="steps" aria-hidden="true">' + CASO.map(function (_, i) { return '<span class="' + (i <= state.caseStep ? "is-on" : "") + '"></span>'; }).join("") + "</div>" +
        '<p class="eyebrow">Etapa ' + (state.caseStep + 1) + " de 3 · " + it.etapa + "</p>" +
        '<p class="case-history">' + it.h + "</p>" +
        '<h2 class="quiz-q">' + it.q + "</h2>" +
        '<div class="options" role="radiogroup" aria-label="Opções">' + it.o.map(function (o, i) {
          var cls = "";
          if (ans) {
            if (i === it.a) cls = " is-right";
            else if (i === ans.choice) cls = " is-wrong";
          } else if (state.caseChoice === i) cls = " is-selected";
          return '<button class="option' + cls + '" type="button" role="radio" aria-checked="' + (state.caseChoice === i) + '" data-action="caso-escolha" data-i="' + i + '"' + (ans ? " disabled" : "") + ">" + o + "</button>";
        }).join("") + "</div>" +
        (ans
          ? '<div class="feedback' + (ans.ok ? "" : " is-bad") + '">' + it.f + "<cite>Referência: " + it.r + "</cite></div>" +
            '<button class="button button-primary" type="button" data-action="caso-proxima">' + (state.caseStep < 2 ? "Próxima etapa" : "Concluir caso") + "</button>"
          : '<button class="button button-primary" type="button" data-action="caso-decidir"' + (state.caseChoice === null ? " disabled" : "") + ">Decidir</button>") +
        "</div>" + caseRules() + "</div>";
    }
    var w = WHY.caso();
    return page({ eyebrow: "Caso clínico · paciente fictício · cerca de 25 min", title: "Rim e coração no mesmo <em>paciente</em>", back: "#/inicio" },
      '<p class="card-why page-why">' + esc(w.motivo) + "</p>" + body);
  };

  function caseRules() {
    return '<aside class="panel"><h2 class="panel-title">Como funciona</h2><ul class="rules"><li>Paciente fictício.</li><li>Só evidência e referências aprovadas.</li><li>Errar não tira ponto: o ponto em que você errou vira uma lição de reforço.</li><li>Revisado pelo MLR antes de publicar.</li></ul></aside>';
  }

  function eventCard(o) {
    return '<article class="event' + (o.ink ? " event-ink on-dark" : "") + (o.day ? "" : " event-plain") + '">' +
      (o.day ? '<p class="event-date"><span class="event-weekday">' + o.weekday + '</span><b class="event-day">' + o.day + '</b><span class="event-month">' + o.month + "</span></p>" : "") +
      '<div class="event-main">' + (o.kind ? '<p class="event-kind">' + o.kind + "</p>" : "") + '<h2 class="event-title">' + o.title + "</h2>" +
      (o.body ? '<p class="event-body">' + o.body + "</p>" : "") +
      '<ul class="event-facts">' + o.facts.map(function (f) {
        return "<li>" + (f[0] ? icon(f[0], 16, 2) : "") + f[1] + "</li>";
      }).join("") + "</ul>" + (o.extra || "") + "</div>" +
      '<div class="event-action">' + o.action + "</div></article>";
  }

  VIEWS.congressos = function () {
    var ter = state.day === "ter";
    var replay = state.liveMissed && ter;
    var tags = (state.liveSignup ? '<span class="tag">' + icon("check", 14, 2.5) + "Inscrito</span>" : "") + (state.liveReminder ? '<span class="tag">Lembrete: ' + state.liveReminder + "</span>" : "");
    var live = eventCard({
      ink: true,
      weekday: "seg.",
      day: "5",
      month: "out",
      kind: replay ? '<span class="tag tag-accent">Você não assistiu: replay pronto</span>' : ter ? "Live de ontem" : '<span class="live-dot" aria-hidden="true"></span>Ao vivo hoje, às 19h',
      title: "Atualização em Cardiologia 2026",
      body: replay ? "Com o Dr. Ricardo Alves (KOL fictício). A live virou 3 lições curtas, que contam para a sua trilha." : "Com o Dr. Ricardo Alves (KOL fictício). Se não puder assistir, o replay chega em 3 lições no dia seguinte.",
      facts: [["clock", "45 min"], ["medal", "Certificado de participação"]],
      extra: tags ? '<p class="event-tags">' + tags + "</p>" : "",
      action: '<a class="button button-primary" href="' + (replay ? "#/replay/cardio-2026" : "#/live/cardio-2026") + '">' + icon("play", 16) + (replay ? "Iniciar replay" : "Ver live") + "</a>"
    });
    var next = eventCard({
      weekday: "qua.",
      day: "14",
      month: "out",
      kind: "Live",
      title: "Caso a caso: insuficiência cardíaca na prática",
      facts: [["clock", "19h, 40 min"], ["medal", "Certificado de participação"]],
      action: '<button class="button button-line" type="button" data-action="inscrever-proxima" aria-pressed="' + !!state.nextLiveSignup + '">' + (state.nextLiveSignup ? icon("check", 16, 2.5) + "Inscrito" : "Inscrever") + "</button>"
    });
    var congresso = eventCard({
      weekday: "seg.",
      day: "19",
      month: "out",
      kind: "Congresso",
      title: "Congresso de Cardiologia 2026",
      body: "No estande da Lilly, o QR abre o conteúdo do evento em 2 toques.",
      facts: [["calendar", "19 a 21 de outubro"], ["layers", "Estande Lilly"]],
      action: '<a class="button button-dark" href="#/qr">Ver o QR do estande</a>'
    });
    return page({ eyebrow: "Congressos e ao vivo", title: "Agenda da <em>semana</em>.", intro: "Lives, congressos e replays de cardiologia. Inscreva-se e escolha quando quer ser lembrado." },
      '<div class="events">' + live + next + congresso + "</div>");
  };

  VIEWS.live = function () {
    var ter = state.day === "ter";
    var ready = state.liveSignup && state.liveReminder;
    return page({ eyebrow: "Live · segunda, 5 de outubro, 19h · 45 min", title: "Atualização em Cardiologia <em>2026</em>", back: "#/congressos", backLabel: "Congressos" },
      (state.liveMissed && ter ? '<div class="banner">' + icon("info", 20, 2) + '<p>Você não conseguiu assistir. O replay já está pronto, em 3 lições curtas.</p><a class="cta-link" href="#/replay/cardio-2026">Iniciar replay</a></div>' : "") +
      '<div class="lesson"><div class="lesson-main"><div class="card-media media-ink live-media" aria-hidden="true">' + MEDIA.wave + '<span class="card-media-tag">Ao vivo</span></div>' +
      '<div class="panel"><h2 class="panel-title">O que você vai ver</h2><ul class="rules"><li>O que mudou nas diretrizes de insuficiência cardíaca em 2026.</li><li>Três casos práticos, com votação ao vivo.</li><li>Perguntas ao especialista no fim.</li></ul></div></div>' +
      '<aside class="panel lesson-aside"><p class="eyebrow">Com o Dr. Ricardo Alves</p><p class="panel-body">KOL fictício. Certificado de participação para quem assistir ao vivo ou ao replay.</p>' +
      '<div class="stack-actions">' +
      '<button class="button ' + (state.liveSignup ? "button-line" : "button-primary") + '" type="button" data-action="live-inscrever" aria-pressed="' + state.liveSignup + '">' + (state.liveSignup ? icon("check", 18, 2.5) + "Inscrito" : "Inscrever") + "</button>" +
      '<button class="button button-line" type="button" data-action="live-lembrar" aria-expanded="' + !!state.liveReminderOpen + '">' + icon("clock", 18, 2) + (state.liveReminder ? "Lembrete: " + state.liveReminder : "Lembrar no meu horário") + "</button></div>" +
      (state.liveReminderOpen ? '<div class="chips reminder-chips" role="group" aria-label="Quando lembrar">' + ["Na manhã do dia", "1 hora antes", "15 minutos antes"].map(function (o) {
        return '<button class="chip" type="button" data-action="live-lembrete" data-v="' + o + '" aria-pressed="' + (state.liveReminder === o) + '">' + o + "</button>";
      }).join("") + "</div>" : "") +
      (ready ? '<p class="fine">Pronto. Se você não puder assistir, o replay chega em 3 lições no dia seguinte, sem outro convite.</p>' : "") +
      "</aside></div>");
  };

  VIEWS.replay = function () {
    var seen = state.replaySeen.length;
    return page({ eyebrow: "Replay decomposto · live de segunda", title: "Atualização em Cardiologia 2026, em 3 <em>lições</em>", back: "#/inicio", intro: "Você se inscreveu e não conseguiu assistir. A live virou três lições curtas, que contam para a sua trilha e para as horas de EMC." },
      '<ol class="replay-list">' + REPLAY.map(function (l, i) {
        var done = state.replaySeen.indexOf(i) > -1;
        return '<li class="replay-item' + (done ? " is-done" : "") + '"><span class="replay-num">' + (done ? icon("check", 20, 2.5) : i + 1) + '</span><span class="replay-text"><span class="replay-title">Lição ' + (i + 1) + ": " + l.t + '</span><span class="replay-meta">' + l.d + " min</span></span>" +
          '<button class="button ' + (done ? "button-line" : "button-primary") + '" type="button" data-action="replay-ver" data-i="' + i + '">' + (done ? "Assistida" : icon("play", 14) + "Assistir") + "</button></li>";
      }).join("") + "</ol>" +
      '<div class="replay-foot"><button class="cta-link" type="button" data-action="sheet" data-sheet="resumo">Ver resumo</button>' +
      (seen === 3 ? '<p class="done-note">' + icon("check", 18, 2.5) + "Replay concluído: 3 lições e 0,4 h de EMC cada.</p>" : '<p class="fine">' + seen + " de 3 lições assistidas.</p>") + "</div>");
  };

  VIEWS.qr = function () {
    var phone;
    if (state.qrStep === 0) {
      phone = '<p class="phone-kicker">Estande Lilly · Congresso de Cardiologia 2026</p>' +
        '<div class="qr" aria-hidden="true">' + qrSvg() + "</div>" +
        '<p class="phone-title">Acesse agora: conteúdo do evento</p>' +
        '<button class="button button-primary" type="button" data-action="qr-escanear">Escanear com a câmera</button>';
    } else {
      phone = '<img class="phone-logo" src="assets/lilly-logo-vermelho.svg" alt="Lilly" width="54" height="30" />' +
        '<p class="phone-kicker">Lilly360</p><p class="phone-title">Reconhecemos você pelo CRM</p>' +
        '<div class="phone-id"><span class="avatar">PF</span><span><b>Dr. Paulo Ferreira</b><br />Cardiologia · CRM-SP 000000 (ilustrativo)</span></div>' +
        '<button class="button button-primary" type="button" data-action="qr-entrar">Entrar</button>' +
        '<p class="fine">Não é você? Entrar com e-mail e código.</p>';
    }
    return page({ eyebrow: "No congresso", title: "Do QR ao conteúdo em <em>2 toques</em>", intro: "O médico vê o QR na parede do estande e aponta o celular.", back: "#/congressos", backLabel: "Congressos" },
      '<div class="phone-stage"><div class="phone">' + phone + "</div></div>");
  };

  function qrSvg() {
    var cells = "";
    var seed = 7;
    for (var y = 0; y < 21; y++) {
      for (var x = 0; x < 21; x++) {
        var finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        if (finder) continue;
        seed = (seed * 9301 + 49297) % 233280;
        if (seed / 233280 > 0.52) cells += '<rect x="' + x * 8 + '" y="' + y * 8 + '" width="8" height="8" />';
      }
    }
    function finderAt(x, y) {
      return '<rect x="' + x + '" y="' + y + '" width="56" height="56" rx="6" fill="none" stroke="currentColor" stroke-width="8" /><rect x="' + (x + 16) + '" y="' + (y + 16) + '" width="24" height="24" rx="3" />';
    }
    return '<svg viewBox="-4 -4 176 176" width="176" height="176" fill="currentColor">' + cells + finderAt(0, 0) + finderAt(112, 0) + finderAt(0, 112) + "</svg>";
  }

  VIEWS.evento = function () {
    return page({ eyebrow: "Congresso de Cardiologia 2026 · estande Lilly", title: "O conteúdo do <em>estande</em>", back: "#/congressos", backLabel: "Congressos" },
      '<h2 class="sub-title">Slides apresentados</h2><div class="slides">' +
      ["Cardio-renal-metabólico: o que muda em 2026", "ICFEr: titulação em quatro etapas", "Diabetes e coração: novas metas"].map(function (s, i) {
        return '<button class="slide" type="button" data-action="evento-abrir" data-v="' + s + '"><span class="card-media ' + (i === 1 ? "media-ink" : "media-rose") + '" aria-hidden="true">' + MEDIA.slides + '</span><span class="slide-title">' + s + "</span></button>";
      }).join("") + "</div>" +
      '<div class="two-col"><div class="panel"><p class="eyebrow">Material do KOL</p><h3 class="panel-title">Dra. Helena Prado (fictícia): rim e coração no consultório</h3><p class="panel-body">PDF de 12 páginas, com as referências da palestra.</p>' +
      '<div class="stack-actions row"><button class="button button-primary" type="button" data-action="evento-abrir" data-v="Material do KOL">Ler aqui</button><button class="button button-line" type="button" data-action="evento-abrir" data-v="Download do material">' + icon("download", 18, 2) + "Baixar</button></div></div>" +
      '<div class="panel"><p class="eyebrow">Links e referências</p><ul class="link-list">' +
      ["KDIGO 2024: doença renal crônica", "ESC 2023: atualização em insuficiência cardíaca", "Diretriz Brasileira de Insuficiência Cardíaca"].map(function (l) {
        return '<li><button type="button" data-action="evento-abrir" data-v="' + l + '">' + icon("link", 18, 2) + l + "</button></li>";
      }).join("") + "</ul></div></div>" +
      '<div class="next-box"><p class="eyebrow">Próximo passo</p><p>Amanhã, o Radar de sinais mostra o que muda para o seu paciente depois deste congresso.</p>' +
      '<button class="cta-link" type="button" data-action="salvar-kit">' + (state.savedKit ? "Salvo no seu kit" : "Salvar no meu kit") + "</button></div>");
  };

  function radarCustom() {
    return state.eventAttended && state.day === "ter";
  }

  function radarItems() {
    return radarCustom()
      ? [
          { k: "Insulina de longa ação", t: "Pacientes com diabetes vão perguntar se a insulina de longa ação pesa no coração.", r: "Explique que o controle glicêmico estável reduz complicações e que o plano é revisado com os exames." },
          { k: "Cirurgias e medicamentos", t: "Quem vai operar quer saber se para o anticoagulante e o iSGLT2.", r: "A suspensão depende do tipo de cirurgia; o iSGLT2 costuma ser suspenso alguns dias antes." },
          { k: "Triagem de complicações", t: "Rim e coração no diabetes: quais exames pedir por ano.", r: "TFG e albuminúria anuais, pressão e perfil lipídico; o rim também é órgão-alvo." }
        ]
      : [
          { k: "Está circulando", t: "Jejum intermitente faz bem ao coração?", r: "A evidência é limitada; o que pesa é o padrão alimentar e a perda de peso sustentada." },
          { k: "Em 14 dias", t: "Congresso de cardiologia: os estudos que devem mudar a prática.", r: "Um resumo em 90 segundos chega no dia do congresso." },
          { k: "Regulatório", t: "Nova diretriz de hipertensão: o que muda na meta de pressão.", r: "Notícia factual, com link para a fonte oficial." }
        ];
  }

  VIEWS.radar = function () {
    var custom = radarCustom();
    var items = radarItems();
    return page({ eyebrow: "Radar de sinais · semana de 5 de outubro", title: "O que seu paciente vai te perguntar nesta <em>semana</em>.", intro: custom ? "Personalizado com o seu aprendizado do congresso de ontem." : "Curado pela área médica da Lilly para cardiologistas." },
      (custom ? '<p class="tag-note">' + icon("check", 16, 2.5) + "Atualizado com o congresso de ontem</p>" : "") +
      '<div class="radar-cards">' + items.map(function (it) {
        return '<article class="panel radar-card"><p class="eyebrow">' + it.k + '</p><h2 class="panel-title">' + it.t + '</h2><p class="panel-body"><b>O que responder:</b> ' + it.r + '</p><a class="cta-link" href="#/pacientes">Material para o paciente</a></article>';
      }).join("") + "</div>");
  };

  VIEWS.trilha = function () {
    var lessons = ["O coração como bomba", "Pressão arterial e risco", "Lipídios e aterosclerose", "Diabetes e coração", "O rim como órgão-alvo", "Insuficiência cardíaca: o básico", "Arritmias: o básico", "Prevenção no consultório"];
    var aside = state.trailDone
      ? '<p class="eyebrow">Trilha concluída</p><a class="button button-primary" href="#/conclusao">Ver certificado</a>'
      : state.quiz.final.i === 0 && !state.quiz.final.answers.length && !state.finalStarted
        ? '<p class="eyebrow">Quiz final</p><h2 class="panel-title">Falta só o quiz final</h2><p class="panel-body">Duas perguntas. Ao concluir, você recebe o certificado e o selo.</p><button class="button button-primary" type="button" data-action="final-iniciar">Fazer quiz final</button>'
        : quizHtml("final");
    return page({ eyebrow: "Trilha", title: "Cardiologia - <em>Fundamentos</em>", back: "#/aprendizado", backLabel: "Aprendizado", intro: "8 lições e um quiz final. 6 horas de EMC." },
      '<div class="lesson"><ol class="trail-list">' + lessons.map(function (l, i) {
        return '<li class="is-done"><span class="replay-num">' + icon("check", 18, 2.5) + '</span><span>Lição ' + (i + 1) + ": " + l + "</span></li>";
      }).join("") + "</ol>" +
      '<aside class="panel lesson-aside" aria-live="polite">' + aside + "</aside></div>");
  };

  VIEWS.conclusao = function () {
    if (!state.trailDone) return VIEWS.trilha();
    return page({ eyebrow: "Parabéns", title: "Você concluiu a trilha Cardiologia - <em>Fundamentos</em>.", back: "#/aprendizado", backLabel: "Aprendizado" },
      '<div class="lesson"><div class="certificate"><img class="certificate-logo" src="assets/lilly-logo-vermelho.svg" alt="Lilly" width="54" height="30" /><p class="eyebrow">Certificado de conclusão</p>' +
      '<p class="certificate-name">Dr. Paulo Ferreira</p><p class="certificate-text">concluiu a trilha <b>Cardiologia - Fundamentos</b>, com 8 lições e quiz final, somando 6 horas de educação médica continuada.</p>' +
      '<p class="certificate-foot">Emitido em 5 de outubro de 2026 · código de verificação L360-7Q2K (ilustrativo)</p></div>' +
      '<aside class="panel lesson-aside"><div class="badge-earned">' + icon("medal", 36) + '<span><b>Selo ganho:</b> Especialista em Cardiologia</span></div>' +
      '<div class="stack-actions"><a class="button button-primary" href="#/social" data-action="compartilhar">' + icon("share", 18, 2) + "Compartilhar no LinkedIn</a>" +
      '<button class="button button-line" type="button" data-action="baixar-certificado">' + icon("download", 18, 2) + "Baixar certificado</button></div>" +
      '<p class="fine">Selos reconhecem aprendizado. Não são trocáveis por produtos, serviços ou benefícios.</p></aside></div>');
  };

  function defaultPost() {
    return "Concluí a trilha Cardiologia - Fundamentos no Lilly360: 8 lições sobre insuficiência cardíaca, rim e risco cardiovascular. Atualização contínua também é cuidado com o paciente.\n\n#Cardiologia #EducaçãoMédica #Lilly360";
  }

  VIEWS.social = function () {
    var text = state.postText === null ? defaultPost() : state.postText;
    return page({ eyebrow: "Social Content Lab", title: "Seu post, pronto para <em>publicar</em>", back: "#/conclusao", backLabel: "Conclusão", intro: "Certificado, texto e hashtags aprovados pelo MLR. Você pode editar o texto; a arte e o ID de aprovação não mudam." },
      '<div class="lab"><div class="lab-form">' +
      '<p class="eyebrow">Formato</p><div class="chips" role="group" aria-label="Formato">' +
      [["post", "Post do LinkedIn"], ["carrossel", "Carrossel"]].map(function (f) {
        return '<button class="chip" type="button" data-action="post-formato" data-v="' + f[0] + '" aria-pressed="' + (state.postFormat === f[0]) + '">' + f[1] + "</button>";
      }).join("") + "</div>" +
      '<label class="eyebrow" for="post-text">Texto</label><textarea id="post-text" rows="7">' + esc(text) + "</textarea>" +
      '<button class="button button-primary" type="button" data-action="sheet" data-sheet="linkedin"' + (state.posted ? " disabled" : "") + ">" + icon("share", 18, 2) + (state.posted ? "Publicado" : "Publicar no LinkedIn") + "</button></div>" +
      '<div class="artboard"><div class="art' + (state.postFormat === "carrossel" ? " art-square" : "") + '"><img src="assets/lilly-logo-vermelho.svg" alt="" width="40" height="22" class="art-logo" /><p class="eyebrow">Trilha concluída</p><p class="art-title">Cardiologia - <em>Fundamentos</em></p><p class="art-name">Dr. Paulo Ferreira · Cardiologista</p><p class="art-foot">Material educacional · ID de aprovação PP-BR-0000 (ilustrativo)</p></div></div></div>');
  };

  var PREFS = [
    ["mail", "E-mail semanal", "Segunda às 7h30"],
    ["phone", "Lembrete por WhatsApp", ""],
    ["sliders", "Uso do meu comportamento para personalizar", ""],
    ["layers", "Comparação anônima com colegas", ""]
  ];

  VIEWS.voce = function () {
    var p = progress();
    var ganhos = SELOS.filter(function (s) { return s.earned(); });
    var bloqueados = SELOS.filter(function (s) { return !s.earned(); });
    var certificados = (state.trailDone ? [["Cardiologia - Fundamentos", "6 h de EMC"]] : []).concat([["Cardiologia Clínica", "8 h de EMC"]]);
    return page({ eyebrow: "Você", title: "Dr. Paulo <em>Ferreira</em>", intro: "Cardiologista · profissional de saúde verificado pelo CRM e RQE." },
      '<dl class="numbers numbers-compact">' +
      '<div class="number"><dt>Lições no ano</dt><dd>' + p.licoes + '</dd></div><div class="number"><dt>Horas de EMC</dt><dd>' + num(p.horas) + '</dd></div><div class="number"><dt>Casos</dt><dd>' + p.casos + '</dd></div><div class="number"><dt>Ranking</dt><dd>' + p.ranking + "º</dd></div></dl>" +
      '<section class="panel kit voce-selos"><header class="kit-head"><h2 class="display kit-title">Selos</h2><p class="kit-sub">' + ganhos.length + " de " + SELOS.length + ' conquistados</p></header><div class="badges">' + ganhos.concat(bloqueados).map(function (s) {
        var on = ganhos.indexOf(s) !== -1;
        return '<div class="badge' + (on ? "" : " is-locked") + '"><span class="badge-icon">' + icon(on ? "medal" : "lock", 28) + "</span><b>" + s.n + "</b><span>" + s.d + "</span>" + (on ? '<button class="text-button" type="button" data-action="selo-linkedin" data-v="' + s.n + '">Adicionar ao LinkedIn</button>' : "") + "</div>";
      }).join("") + "</div></section>" +
      '<div class="two-col voce-cols">' +
      '<section class="panel kit"><header class="kit-head"><h2 class="display kit-title">Certificados</h2></header><ul class="kit-list">' +
      certificados.map(function (c) {
        return '<li><button class="kit-row" type="button" data-action="baixar-certificado">' + kitRow("file", c[0], c[1], '<span class="kit-go">' + icon("download", 16, 2) + '<span class="kit-go-label">Baixar</span></span>') + "</button></li>";
      }).join("") + "</ul></section>" +
      '<section class="panel kit"><header class="kit-head"><h2 class="display kit-title" id="preferencias">Preferências e <em>consentimentos</em></h2></header><ul class="kit-list">' +
      PREFS.map(function (pr) {
        return '<li class="kit-row is-static">' + kitRow(pr[0], pr[1], pr[2], '<span class="pref-on">Sim</span>') + "</li>";
      }).join("") + "</ul></section></div>");
  };

  VIEWS.aprendizado = function () {
    return page({ eyebrow: "Aprendizado", title: "Suas <em>trilhas</em>", intro: "Micro-lições com quiz, casos clínicos e replays." },
      '<div class="radar-cards">' +
      '<article class="panel"><p class="eyebrow">Em andamento</p><h2 class="panel-title">Cardiologia Avançada</h2><p class="panel-body">Lição ' + (state.lessonDone ? "7" : "6") + ' de 8.</p><a class="cta-link" href="' + (state.lessonDone ? "#/licao/arritmias" : "#/licao/ic-fer") + '">Continuar</a></article>' +
      '<article class="panel"><p class="eyebrow">' + (state.trailDone ? "Concluída" : "Falta o quiz final") + '</p><h2 class="panel-title">Cardiologia - Fundamentos</h2><p class="panel-body">8 de 8 lições.</p><a class="cta-link" href="' + (state.trailDone ? "#/conclusao" : "#/trilha/cardio-fundamentos") + '">' + (state.trailDone ? "Ver certificado" : "Fazer quiz final") + "</a></article>" +
      '<article class="panel"><p class="eyebrow">Caso clínico</p><h2 class="panel-title">Rim e coração no mesmo paciente</h2><p class="panel-body">Cerca de 25 min.</p><a class="cta-link" href="#/caso/rim-coracao">Abrir caso</a></article></div>');
  };

  var KIT_FERRAMENTAS = [
    ["calc", "TFG CKD-EPI 2021", "Usada 3 vezes este mês"],
    ["sliders", "Simulador de titulação", "Ajuste em etapas, conforme bula"],
    ["heart", "Risco cardiovascular", "Framingham, em 10 anos"]
  ];

  var KIT_MATERIAIS = [
    ["Seu remédio do coração e os exames de rim", "Folheto de 2 páginas", "file"],
    ["Seus rins e seu coração", "Vídeo de 3 minutos", "play"],
    ["Potássio alto: o que comer e o que evitar", "Lista de alimentos, 1 página", "file"],
    ["Insuficiência cardíaca: o que muda a partir de agora", "Guia de 4 páginas", "file"]
  ];

  function kitRow(ico, name, detail, end) {
    return '<span class="kit-icon">' + icon(ico, 20, 1.75) + '</span><span class="kit-text"><span class="kit-name">' + name + '</span><span class="kit-detail">' + detail + "</span></span>" + end;
  }

  VIEWS.pacientes = function () {
    var enviados = state.signals.filter(function (s) { return s.nome === "material_enviado"; }).map(function (s) { return s.props.material; });
    return page({ eyebrow: "Meus pacientes · kit de consulta", title: "Para usar com o paciente na sua <em>frente</em>", intro: "Ferramentas e materiais reordenados pelo seu uso." },
      '<div class="two-col kits">' +
      '<section class="panel kit"><header class="kit-head"><h2 class="display kit-title">Ferramentas</h2><p class="kit-sub">Calculadoras para usar durante a consulta.</p></header><ul class="kit-list">' +
      KIT_FERRAMENTAS.map(function (t) {
        return '<li><a class="kit-row" href="#/tema/ajuste-de-dose">' + kitRow(t[0], t[1], t[2], '<span class="kit-go">' + icon("chevron", 20, 2) + "</span>") + "</a></li>";
      }).join("") +
      '</ul><p class="fine kit-foot">Ferramentas de apoio. Não substituem o julgamento clínico.</p></section><section class="panel kit"><header class="kit-head"><h2 class="display kit-title">Material para o <em>paciente</em></h2><p class="kit-sub">Envie por WhatsApp, imprima ou mostre o QR.</p></header><ul class="kit-list">' +
      KIT_MATERIAIS.map(function (m) {
        var foi = enviados.indexOf(m[0]) !== -1;
        var end = foi ? '<span class="kit-go is-sent">' + icon("check", 16, 2.25) + "<span class=\"kit-go-label\">Enviado</span></span>" : '<span class="kit-go">' + icon("send", 16, 2) + "<span class=\"kit-go-label\">Enviar</span></span>";
        return '<li><button class="kit-row" type="button" data-action="sheet" data-sheet="whatsapp" data-material="' + m[0] + '">' + kitRow(m[2], m[0], m[1], end) + "</button></li>";
      }).join("") + '</ul><p class="fine kit-foot">Linguagem simples, revisada pela equipe médica.</p></section></div>');
  };

  var DOCS = [
    ["KDIGO 2024: avaliação e manejo da DRC", "Diretriz internacional, 2024"],
    ["ESC 2021: insuficiência cardíaca", "Diretriz europeia, 2021"],
    ["Diretriz Brasileira de Insuficiência Cardíaca", "Diretriz nacional, 2021"],
    ["iSGLT2 na doença renal crônica: revisão", "Revisão sistemática, 2025"],
    ["Tremor e betabloqueador: o que investigar", "Artigo de revisão, 2023"]
  ];

  VIEWS.protocolos = function () {
    return page({ eyebrow: "Protocolos · acervo", title: "Estudos e <em>diretrizes</em>", intro: "Leia aqui, com o leitor do acervo, ou baixe o PDF." },
      '<section class="panel kit kit-single"><ul class="kit-list">' +
      DOCS.map(function (d) {
        return '<li class="kit-row doc-row">' + kitRow("file", d[0], d[1], '<span class="doc-actions">' +
          '<button class="text-button" type="button" data-action="ler-doc" data-v="' + d[0] + '">' + icon("book", 16, 2) + "Ler aqui</button>" +
          '<button class="text-button" type="button" data-action="ler-doc" data-v="' + d[0] + '" data-download="1">' + icon("download", 16, 2) + "Baixar</button></span>") + "</li>";
      }).join("") + '</ul><p class="fine kit-foot">Documentos de terceiros, reproduzidos com autorização para fins educacionais.</p></section>');
  };

  VIEWS.parceiros = function () {
    return page({ eyebrow: "Parceiros · patrocinado", title: "Conteúdo de <em>parceiros</em>", intro: "Conteúdo patrocinado, sempre identificado e separado do conteúdo educacional." }, '<div class="empty-state">' + icon("layers", 32, 1.75) +
      '<h2 class="empty-title">Nenhum conteúdo de parceiros nesta semana</h2>' +
      '<p class="empty-body">Quando houver, ele aparece aqui, com o selo de patrocinado e separado das suas trilhas e do acervo.</p>' +
      '<a class="button button-line" href="#/aprendizado">Voltar às suas trilhas</a></div>');
  };

  var CANAIS = [
    {
      nome: "Informação médica",
      texto: "Dúvidas científicas sobre medicamentos Lilly: posologia, interações e uso em populações especiais. Quem responde é um médico ou farmacêutico da equipe.",
      fatos: [["clock", "Resposta em até 2 dias úteis"], ["phone", "0800 000 0001"], ["mail", "informacaomedica@lilly360.com.br"], ["calendar", "Seg. a sex., das 8h às 18h"]],
      acao: "Enviar pergunta"
    },
    {
      nome: "Farmacovigilância",
      texto: "Relate um evento adverso ou uma queixa técnica de produto Lilly assim que souber. Não é preciso identificar o paciente.",
      fatos: [["clock", "Atendimento imediato"], ["phone", "0800 000 0002"], ["calendar", "Todos os dias, 24 horas"]],
      acao: "Relatar evento adverso"
    },
    {
      nome: "Suporte da plataforma",
      texto: "Acesso e login, certificados, horas de educação médica continuada e preferências de contato.",
      fatos: [["clock", "Resposta em até 1 dia útil"], ["mail", "suporte@lilly360.com.br"], ["calendar", "Seg. a sex., das 8h às 20h"]],
      acao: "Abrir chamado"
    }
  ];

  VIEWS.equipe = function () {
    var canais = CANAIS.map(function (c) {
      return eventCard({
        title: c.nome,
        body: c.texto,
        facts: c.fatos,
        action: '<button class="button button-line" type="button" data-action="contato" data-v="' + c.nome + '">' + c.acao + "</button>"
      });
    }).join("");
    var pedidos = state.contacts.length
      ? '<section class="requests" aria-labelledby="pedidos"><h2 class="sub-title" id="pedidos">Seus pedidos</h2><ul class="request-list">' + state.contacts.map(function (p) {
          return '<li><span class="request-name">' + p.canal + '</span><span class="request-code">Protocolo ' + p.codigo + '</span><span class="tag">' + icon("check", 14, 2.5) + "Recebido hoje</span></li>";
        }).join("") + "</ul></section>"
      : "";
    return page({ eyebrow: "Falar com a equipe", title: "Fale com a <em>Lilly</em>", intro: "Escolha o canal pelo assunto. Cada um tem a sua equipe e o seu prazo de resposta." },
      '<div class="events channels">' + canais + "</div>" + pedidos +
      '<p class="fine channels-note">Telefones e e-mails ilustrativos. Em uma urgência com o paciente, siga o protocolo do seu serviço: estes canais não atendem emergências.</p>');
  };

  /* ---------- Folhas (diálogos) ---------- */

  /* ---------- Navegação ---------- */

  function navMenu() {
    var lesson = currentLesson();
    var replay = state.liveMissed && state.day === "ter";
    var custom = radarCustom();
    return [
      {
        id: "inicio", nome: "Início", href: "#/inicio",
        resumo: "Sua lição desta semana: " + lesson.falta,
        card: { href: lesson.href, titulo: "Continuar lição", sub: lesson.titulo + ", " + lesson.ctx.toLowerCase() }
      },
      {
        id: "aprendizado", nome: "Aprendizado", href: "#/aprendizado",
        resumo: "Micro-lições com quiz, casos clínicos e replays.",
        grupos: [{ links: [
          ["Cardiologia Avançada", lesson.href],
          ["Cardiologia - Fundamentos", state.trailDone ? "#/conclusao" : "#/trilha/cardio-fundamentos"],
          ["Rim e coração no mesmo paciente", "#/caso/rim-coracao"]
        ] }]
      },
      {
        id: "pacientes", nome: "Meus pacientes", href: "#/pacientes",
        resumo: "Ferramentas e materiais reordenados pelo seu uso.",
        grupos: [
          { titulo: "Ferramentas", links: KIT_FERRAMENTAS.map(function (t) { return [t[1], "#/tema/ajuste-de-dose"]; }) },
          { titulo: "Material para o paciente", links: KIT_MATERIAIS.map(function (m) { return [m[0], "#/pacientes"]; }) }
        ]
      },
      {
        id: "protocolos", nome: "Protocolos", href: "#/protocolos",
        resumo: "Leia aqui, com o leitor do acervo, ou baixe o PDF.",
        grupos: [{ links: DOCS.map(function (d) { return [d[0], "#/protocolos"]; }) }]
      },
      {
        id: "congressos", nome: "Congressos", href: "#/congressos",
        resumo: "Lives, congressos e replays de cardiologia. Inscreva-se e escolha quando quer ser lembrado.",
        grupos: [{ links: [
          ["Atualização em Cardiologia 2026", replay ? "#/replay/cardio-2026" : "#/live/cardio-2026"],
          ["Caso a caso: insuficiência cardíaca na prática", "#/congressos"],
          ["Congresso de Cardiologia 2026", "#/congressos"]
        ] }]
      },
      {
        id: "radar", nome: "Radar de sinais", href: "#/radar",
        resumo: custom ? "Personalizado com o seu aprendizado do congresso de ontem." : "Curado pela área médica da Lilly para cardiologistas.",
        grupos: [{ links: radarItems().map(function (it) { return [it.t, "#/radar"]; }) }]
      },
      {
        id: "mais", nome: "Mais",
        resumo: "Também para você",
        grupos: [{ links: [
          ["Parceiros", "#/parceiros", "Patrocinado"],
          ["Falar com a equipe", "#/equipe"]
        ] }]
      }
    ];
  }

  function navHtml() {
    var menu = navMenu();
    var tabs = menu.map(function (m) {
      var tab = m.href
        ? '<a class="nav-tab" href="' + m.href + '" data-nav="' + m.id + '" data-tab="' + m.id + '">' + m.nome + "</a>" +
          '<button class="icon-button nav-more" type="button" data-sub="' + m.id + '" aria-controls="nav-sub-' + m.id + '" aria-label="Abrir ' + m.nome + '">' + icon("chevron", 20, 1.75) + "</button>"
        : '<button class="nav-tab" type="button" data-tab="' + m.id + '" data-sub="' + m.id + '" aria-controls="nav-sub-' + m.id + '">' + m.nome + '<span class="nav-more-icon">' + icon("chevron", 20, 1.75) + "</span></button>";
      return '<li data-tab="' + m.id + '">' + tab + "</li>";
    }).join("");
    var subs = menu.map(function (m) {
      var grupos = (m.grupos || []).map(function (g) {
        return '<div class="nav-sub-group">' + (g.titulo ? '<p class="eyebrow nav-sub-heading">' + g.titulo + "</p>" : "") +
          '<ul class="nav-sub-list">' + g.links.map(function (l) {
            return '<li><a class="nav-sub-link" href="' + l[1] + '">' + l[0] + "</a>" + (l[2] ? ' <span class="nav-tag">' + l[2] + "</span>" : "") + "</li>";
          }).join("") + "</ul></div>";
      }).join("");
      var card = m.card
        ? '<a class="nav-card on-dark" href="' + m.card.href + '"><img class="nav-card-media" src="' + HERO_IMG + '" alt="" loading="lazy" />' +
          '<span class="nav-card-text"><span class="display nav-card-title">' + m.card.titulo + '</span><span class="nav-card-sub">' + m.card.sub + "</span></span>" +
          '<span class="nav-card-go">' + icon("chevron", 20, 2) + "</span></a>"
        : "";
      return '<div class="nav-sub" id="nav-sub-' + m.id + '" data-sub-panel="' + m.id + '">' +
        '<button class="nav-back" type="button">' + icon("back", 18, 2) + "Voltar</button>" +
        '<div class="nav-sub-body"><div class="nav-sub-summary">' +
        (m.href ? '<a class="display nav-sub-title" href="' + m.href + '">' + m.nome + "</a>" : '<p class="display nav-sub-title">' + m.nome + "</p>") +
        '<p class="nav-sub-text">' + m.resumo + "</p></div>" +
        (grupos ? '<div class="nav-sub-groups">' + grupos + "</div>" : "") + card + "</div></div>";
    }).join("");
    return '<nav class="nav-main" aria-label="Principal"><ul class="nav-tabs">' + tabs + '</ul></nav><div class="nav-subs">' + subs + "</div>";
  }

  var navHtmlLast = "";

  function renderNav() {
    var html = navHtml();
    if (html === navHtmlLast) return;
    navHtmlLast = html;
    var panel = $("#nav-panel");
    var active = panel.querySelector(".nav-sub.is-active");
    panel.innerHTML = html;
    if (active) setNavTab(active.dataset.subPanel);
  }

  function foneFormatado(d) {
    if (d.length <= 2) return d.length ? "(" + d : "";
    var resto = d.slice(2);
    var corte = d.length === 11 ? 5 : 4;
    return "(" + d.slice(0, 2) + ") " + (resto.length > corte ? resto.slice(0, corte) + "-" + resto.slice(corte) : resto);
  }

  function foneValido(d) {
    return d.length === 10 || d.length === 11;
  }

  function renderSheet() {
    var root = $("#sheet-root");
    var s = state.sheet;
    clearTimeout(sheetTimer);
    if (!s) {
      if (!root.firstChild || root.classList.contains("is-leaving")) return;
      if (reducedMotion()) {
        root.innerHTML = "";
        return;
      }
      root.classList.add("is-leaving");
      sheetTimer = setTimeout(function () {
        root.innerHTML = "";
        root.classList.remove("is-leaving");
      }, 180);
      return;
    }
    var wasOpen = !!root.firstChild && !root.classList.contains("is-leaving");
    root.classList.remove("is-leaving");
    root.classList.toggle("is-static", wasOpen);
    var title = "";
    var body = "";
    if (s.type === "whatsapp") {
      title = s.done ? "Material enviado" : "Enviar ao paciente";
      body = s.done
        ? '<p class="done-note">' + icon("check", 20, 2.5) + "Enviado pelo WhatsApp para +55 " + foneFormatado(waFone) + ".</p>" +
          (state.flow === 1 && state.goal !== null ? '<p class="sheet-big">' + state.goal + " toques · " + state.goalSecs + " segundos</p>" : "") +
          '<p class="panel-body">Próximo passo: material relacionado ao mesmo caso, "Potássio alto: o que comer e o que evitar".</p>' +
          '<div class="stack-actions"><button class="button button-primary" type="button" data-action="sheet-close">Concluir</button></div>'
        : '<div class="field wa-field"><label for="wa-fone">WhatsApp do paciente</label>' +
          '<div class="wa-input"><span class="wa-ddi" aria-hidden="true">+55</span><input id="wa-fone" type="tel" inputmode="tel" autocomplete="off" placeholder="(11) 91234-5678" aria-describedby="wa-fone-ajuda" data-autofocus value="' + foneFormatado(waFone) + '" /></div>' +
          '<p class="wa-ajuda" id="wa-fone-ajuda">Com DDD. Usado só neste envio, o número não fica salvo.</p></div>' +
          '<div class="wa"><p class="wa-head" id="wa-head">WhatsApp · ' + (foneValido(waFone) ? "+55 " + foneFormatado(waFone) : "contato do paciente") + '</p><div class="wa-bubble"><p>Olá! Aqui está o material que conversamos na consulta: <b>' + esc(s.material) + "</b>. Leia com calma e traga suas dúvidas no retorno.</p><p class=\"wa-link\">lilly360.com.br/m/7KQ2</p><p class=\"wa-foot\">Material educacional. Não substitui a consulta.</p></div></div>" +
          '<div class="stack-actions"><button class="button button-primary" type="button" data-action="whatsapp-enviar"' + (foneValido(waFone) ? "" : " disabled") + ">" + icon("send", 18, 2) + "Enviar pelo WhatsApp</button>" +
          '<div class="row-actions"><button class="text-button" type="button" data-action="material-alt" data-v="Impressão">Imprimir</button><button class="text-button" type="button" data-action="material-alt" data-v="QR">Mostrar QR</button></div></div>';
    } else if (s.type === "login") {
      title = "Entrar no Lilly 360";
      body = '<form class="login" data-form="login">' +
        '<p class="panel-body">Use seu CRM. Depois de entrar, você volta a este tema com triagem, ferramentas e material para o paciente.</p>' +
        '<div class="login-row"><div class="field"><label for="login-crm">CRM</label><input id="login-crm" type="text" inputmode="numeric" autocomplete="off" value="123456" data-autofocus /></div>' +
        '<div class="field"><label for="login-uf">UF</label><select id="login-uf">' + ["SP", "RJ", "MG", "RS", "PR", "BA"].map(function (uf) { return "<option>" + uf + "</option>"; }).join("") + "</select></div></div>" +
        '<div class="field"><label for="login-senha">Senha</label><input id="login-senha" type="password" autocomplete="off" value="lilly360demo" /></div>' +
        '<button class="button button-primary login-submit" type="submit">Entrar</button>' +
        '<p class="fine">Protótipo: os campos já vêm preenchidos e nada é enviado.</p></form>';
    } else if (s.type === "linkedin") {
      var text = state.postText === null ? defaultPost() : state.postText;
      title = s.done ? "Publicado" : "Prévia do LinkedIn";
      body = s.done
        ? '<p class="done-note">' + icon("check", 20, 2.5) + "Seu post está no LinkedIn.</p>" +
          (state.flow === 5 && state.goal !== null ? '<p class="sheet-big">' + state.goal + " toques da conclusão até o post</p>" : "") +
          '<div class="stack-actions"><a class="button button-primary" href="#/inicio" data-action="ver-progresso">Voltar ao início e ver seu progresso</a></div>'
        : '<div class="li"><div class="li-head"><span class="avatar">PF</span><span><b>Dr. Paulo Ferreira</b><br />Cardiologista</span></div><p class="li-text">' + esc(text).replace(/\n/g, "<br />") + '</p><div class="li-art"><p class="eyebrow">Trilha concluída</p><p class="art-title">Cardiologia - <em>Fundamentos</em></p><p class="art-foot">ID de aprovação PP-BR-0000 (ilustrativo)</p></div></div>' +
          '<div class="stack-actions"><button class="button button-primary" type="button" data-action="linkedin-confirmar">Confirmar publicação</button></div>';
    } else if (s.type === "resumo") {
      title = "Resumo da live";
      body = '<ul class="rules"><li>As quatro classes da ICFEr devem ser iniciadas cedo, mesmo com doses baixas.</li><li>Altas de creatinina abaixo de 30% não justificam suspender IECA ou BRA.</li><li>iSGLT2 com TFG a partir de 20 a 25 protege rim e coração.</li></ul><div class="stack-actions"><a class="button button-primary" href="#/replay/cardio-2026" data-action="sheet-close">Iniciar replay</a></div>';
    } else if (s.type === "notificacoes") {
      title = "Notificações";
      var items = ['<li><a href="#/licao/ic-fer" data-action="sheet-close">Sua lição desta semana: faltam 4 minutos</a></li>'];
      if (state.day === "ter" && state.liveMissed) items.unshift('<li><a href="#/replay/cardio-2026" data-action="sheet-close">Replay pronto: Atualização em Cardiologia 2026</a></li>');
      if (state.day === "ter" && state.eventAttended) items.unshift('<li><a href="#/radar" data-action="sheet-close">Radar atualizado com o congresso de ontem</a></li>');
      body = '<ul class="link-list notif-list">' + items.join("") + '</ul><p class="fine">No máximo uma mensagem por semana, no seu horário.</p>';
    }
    root.innerHTML = '<div class="sheet-backdrop" data-action="sheet-close"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="sheet-head"><h2 class="sheet-title" id="sheet-title">' + title + '</h2><button class="sheet-close" type="button" data-action="sheet-close" aria-label="Fechar">' + icon("close", 20, 2) + "</button></div>" + body + "</div>";
    var first = root.querySelector(".sheet [data-autofocus]") || root.querySelector(".sheet .button, .sheet a, .sheet .text-button");
    if (first) first.focus();
  }

  /* ---------- Bastidores ---------- */

  function profile() {
    return [
      ["Identidade", "HCP_ID do login", "Login e CRM"],
      ["Especialidade", "Cardiologia", "CRM e RQE"],
      ["Engajamento", "High (framework IBU)", "Comportamento"],
      ["Momento do paciente", state.triage ? TRIAGE[state.triage].label : "Não informado", "Triagem"],
      ["Temas em aberto", state.quizWrong ? "Ajuste de dose (quiz)" : "Nenhum", "Quiz"],
      ["Formato preferido", state.audio ? "Áudio e lições curtas" : "Lições curtas", "Consumo"],
      ["Eventos", state.eventAttended ? "Congresso de Cardiologia 2026 (QR)" : state.liveSignup ? "Inscrito na live de segunda" : "Nenhum", "Lives e QR"],
      ["Melhor horário", "Segunda, 7h30", "Aberturas de e-mail"],
      ["Consentimentos", "E-mail sim · WhatsApp sim", "Central de preferências"]
    ];
  }

  function renderBackstage() {
    var el = $("#backstage");
    clearTimeout(backstageTimer);
    el.classList.remove("is-leaving");
    if (!state.backstage && !el.hidden && !reducedMotion()) {
      el.classList.add("is-leaving");
      backstageTimer = setTimeout(function () {
        el.hidden = true;
        el.classList.remove("is-leaving");
      }, 180);
    } else {
      el.hidden = !state.backstage;
    }
    document.body.classList.toggle("has-backstage", state.backstage);
    if (!state.backstage) return;
    var r = ROUTES[parseRoute().name];
    var html = '<div class="bs-block"><p class="bs-label">Esta tela</p><p class="bs-title">' + r.titulo + '</p><p class="bs-line"><span>Release</span><b>' + r.release + '</b></p><p class="bs-line"><span>Dado capturado</span><b>' + r.dado + "</b></p></div>";
    if (state.why && WHY[state.why]) {
      var w = WHY[state.why]();
      var it = selection().filter(function (x) { return x.id === state.why; })[0];
      html += '<div class="bs-block bs-why"><p class="bs-label">Por que vejo isto?</p><p class="bs-title">' + w.titulo + "</p>" +
        '<p class="bs-reason">"' + w.motivo + '"</p>' +
        '<p class="bs-line"><span>Regra (R1)</span><b>' + w.regra + "</b></p>" +
        (it ? '<p class="bs-line"><span>Nota de relevância (R2)</span><b>' + num(it.score.toFixed(2)) + "</b></p>" : "") +
        '<p class="bs-line"><span>Sinais</span><b>' + w.sinais.map(function (s) { return "<code>" + esc(s) + "</code>"; }).join(" ") + "</b></p>" +
        '<p class="bs-line"><span>Fonte do dado</span><b>' + w.fonte + '</b></p><p class="bs-line"><span>Consentimento</span><b>' + w.consentimento + "</b></p></div>";
    }
    html += '<div class="bs-block"><p class="bs-label">Ficha do Dr. Paulo agora</p><dl class="bs-profile">' + profile().map(function (row) {
      return "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "<small>" + row[2] + "</small></dd></div>";
    }).join("") + "</dl></div>";
    html += '<div class="bs-block"><p class="bs-label">Sinais registrados</p>' + (state.signals.length
      ? '<ol class="bs-signals">' + state.signals.slice(0, 14).map(function (s) {
          return "<li><code>" + esc(s.nome) + (s.props ? " " + esc(JSON.stringify(s.props)) : "") + "</code>" + (s.efeito ? "<span>" + esc(s.efeito) + "</span>" : "") + "</li>";
        }).join("") + "</ol>"
      : '<p class="bs-empty">Interaja com a tela. Cada ação vira um evento com a identidade do médico, enviado ao Data Lake da Lilly.</p>') + "</div>";
    $("#backstage-body").innerHTML = html;
  }

  /* ---------- Barra do protótipo ---------- */

  function hint() {
    var r = parseRoute().name;
    var f = state.flow;
    var ter = state.day === "ter";
    var toTer = { label: "Avançar para terça", proto: "dia", dia: "ter" };
    if (state.externo) {
      if (r === "chatgpt" && state.gpt === 0) return { text: "Via ChatGPT: o médico tira a dúvida fora da plataforma. Envie a pergunta." };
      if (r === "chatgpt" && state.gpt === 1) return { text: "O ChatGPT pesquisa na web." };
      if (r === "chatgpt") return { text: 'A resposta cita o Lilly 360. Toque em "Lilly 360" para abrir o artigo.' };
      if (state.deslogado) return { text: "Área deslogada: o artigo é aberto e não usa dado do médico. Triagem, ferramentas e material pedem login com CRM." };
      if (r === "tema") return { text: "Logado: o médico continua no mesmo tema, agora com triagem, ferramentas e envio ao paciente." };
      return { text: "Logado pelo artigo: a home é a de primeiro acesso, porque a plataforma ainda não conhece o uso dele." };
    }
    if (!f && state.primeiroAcesso) return { text: "Primeiro acesso: o que o médico vê no primeiro login, antes de a plataforma conhecer o uso dele." };
    if (!f) return { text: "Navegação livre. Escolha um fluxo para ser guiado passo a passo." };
    if (f === 1) {
      if (state.sent) return { text: "Concluído: material enviado ao paciente em " + state.goal + " toques e " + state.goalSecs + " segundos. Meta: 5 toques, 1 minuto." };
      if (r === "inicio" && state.chat.some(function (t) { return !t.pending && respostasMatch(t.q)[0] === RESPOSTAS[0]; })) return { text: 'Passo 2: a resposta veio do acervo aprovado. Toque em "Abrir página e triagem".' };
      if (r === "inicio") return { text: 'Passo 1: o médico tem uma dúvida na consulta. Na pesquisa logo abaixo do banner, descreva o cenário ou toque em "Ajuste de dose com creatinina alta".' };
      if (r === "busca") return { text: 'Passo 2: digite a dúvida ou toque em "Ajuste de dose com creatinina alta".' };
      if (r === "tema" && !state.triage) return { text: "Passo 3: leia o resumo e escolha a situação que apareceu no consultório." };
      if (r === "tema") return { text: 'Passo 4: ferramenta e material mudaram com a situação. Toque em "Enviar ao paciente".' };
      return { text: "Volte à pesquisa para seguir o fluxo.", href: "#/inicio", label: "Abrir a pesquisa" };
    }
    if (f === 3) {
      if (state.replaySeen.length === 3) return { text: "Concluído: replay recuperado sem ação extra." };
      if (state.liveSignup && state.liveReminder && !ter) return { text: "Passo 3: a live foi segunda às 19h e o Dr. Paulo não conseguiu assistir.", action: toTer };
      if (ter && state.liveMissed && r === "replay") return { text: "Passo 5: assista às 3 lições curtas." };
      if (ter && state.liveMissed) return { text: 'Passo 4: o replay apareceu sozinho em "Selecionado para a sua prática", sem ação do médico. Toque em "Iniciar replay".' };
      if (r === "live") return { text: 'Passo 2: toque em "Inscrever" e em "Lembrar no meu horário".' };
      if (r === "congressos") return { text: 'Passo 1: abra a live "Atualização em Cardiologia 2026".' };
      return { text: "Abra Congressos no menu.", href: "#/congressos", label: "Abrir Congressos" };
    }
    if (f === 4) {
      if (r === "qr" && state.qrStep === 0) return { text: "Passo 1: no estande, o médico aponta o celular para o QR." };
      if (r === "qr") return { text: 'Passo 2: o login reconhece o médico pelo CRM. Toque em "Entrar".' };
      if (state.eventAttended && !ter) return { text: "Conteúdo do evento em " + state.goal + " toques. Passo 3: no dia seguinte, o médico volta ao consultório.", action: toTer };
      if (ter && !state.radarSeen) return { text: 'Passo 4: abra "Radar de sinais" no menu. Ele mudou com o congresso.' };
      if (ter && r === "radar") return { text: "Passo 5: volte ao início. A seleção tem o conteúdo do congresso, com o motivo.", href: "#/inicio", label: "Voltar ao início" };
      if (ter) return { text: "Concluído: do QR ao conteúdo em " + state.goal + " toques, e o congresso virou Radar e recomendação." };
      return { text: "Abra o QR do estande para começar.", href: "#/qr", label: "Abrir o QR" };
    }
    if (f === 5) {
      if (!state.trailDone) return r === "trilha" ? { text: "Passo 1: as 8 lições estão feitas. Faça o quiz final." } : { text: "Abra a trilha para começar.", href: "#/trilha/cardio-fundamentos", label: "Abrir a trilha" };
      if (state.posted && r === "inicio") return { text: 'Concluído: post publicado em ' + state.goal + ' toques, ranking subiu 2 posições e os novos selos estão em "Seu progresso".' };
      if (state.posted) return { text: "Post publicado em " + state.goal + ' toques. Passo 4: volte ao início e veja "Seu progresso".', action: { label: "Ver Seu progresso", proto: "progresso" } };
      if (r === "conclusao") return { text: 'Passo 2: a contagem de toques começa aqui. Toque em "Compartilhar no LinkedIn".' };
      if (r === "social") return { text: "Passo 3: o post já vem pronto, com ID de aprovação. Publique." };
      return { text: "Abra a tela de conclusão.", href: "#/conclusao", label: "Abrir conclusão" };
    }
    return { text: "" };
  }

  function updateProto() {
    var r = parseRoute().name;
    $("#proto-flow").value = String(state.flow);
    document.querySelectorAll('[data-proto="dia"][data-dia]').forEach(function (b) {
      if (b.closest("#proto-hint")) return;
      b.setAttribute("aria-pressed", String(b.dataset.dia === state.day));
    });
    var cenario = state.externo ? "externo" : state.primeiroAcesso ? "primeiro" : "recorrente";
    document.querySelectorAll('[data-proto="home"]').forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.home === cenario));
    });
    var h = hint();
    var actionHtml = "";
    if (h.action) actionHtml = '<button class="proto-cta" type="button" data-proto="' + h.action.proto + '"' + (h.action.dia ? ' data-dia="' + h.action.dia + '"' : "") + ">" + h.action.label + "</button>";
    else if (h.href) actionHtml = '<a class="proto-cta" href="' + h.href + '">' + h.label + "</a>";
    $("#proto-hint").innerHTML = "<span>" + esc(h.text) + "</span>" + actionHtml;

    var t = $("#proto-touches");
    var f = state.flow;
    if (!f) {
      t.hidden = true;
    } else {
      t.hidden = false;
      var meta = FLOWS[f].meta;
      if (f === 3) t.textContent = state.liveMissed ? "Ações extras: 0 · meta 0" : "Meta: nenhuma ação extra";
      else if (state.goal !== null) t.textContent = state.goal + " toques · meta " + meta + (state.goal <= meta ? " · dentro" : " · acima");
      else if (state.counting) t.textContent = state.touches + " toques · meta " + meta;
      else t.textContent = "Meta: " + meta + " toques";
      if (state.counting && lastTouches !== null && state.touches > lastTouches && !reducedMotion()) {
        t.classList.remove("is-bump");
        void t.offsetWidth;
        t.classList.add("is-bump");
      }
      lastTouches = state.touches;
      t.classList.toggle("is-ok", state.goal !== null && state.goal <= meta);
      t.classList.toggle("is-over", (state.goal !== null && state.goal > meta) || (state.counting && state.goal === null && state.touches > meta));
    }
  }

  /* ---------- Movimento ---------- */

  var STAGGER = ".cards, .radar-cards, .events, .trail-list, .slides, .badges, .kit-list, .options, .unlocked-list";
  var APPEAR = ".feedback, .unlocked, .badge-earned, .done-note, .tag, .option.is-right, .option.is-wrong, .request-list li";

  function reducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function appearKey(el) {
    return el.className.replace(/\bis-new\b/g, "").trim() + "|" + el.textContent;
  }

  function appearKeys(root) {
    var keys = {};
    root.querySelectorAll(APPEAR).forEach(function (el) {
      keys[appearKey(el)] = true;
    });
    return keys;
  }

  function markNew(root, seen) {
    if (reducedMotion()) return;
    root.querySelectorAll(APPEAR).forEach(function (el) {
      if (!seen[appearKey(el)]) el.classList.add("is-new");
    });
  }

  function animateEntrance(app) {
    if (revealObserver) revealObserver.disconnect();
    if (reducedMotion()) return;
    app.querySelectorAll(STAGGER).forEach(function (list) {
      Array.prototype.forEach.call(list.children, function (el, i) {
        el.setAttribute("data-stagger", "");
        el.style.setProperty("--i", Math.min(i, 6));
      });
    });
    if (!("IntersectionObserver" in window)) return;
    requestAnimationFrame(function () {
      var below = Array.prototype.filter.call(app.children, function (el) {
        return el.getBoundingClientRect().top > window.innerHeight * 0.9;
      });
      if (!below.length) return;
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      }, { rootMargin: "0px 0px -12% 0px" });
      below.forEach(function (el) {
        el.classList.add("reveal");
        revealObserver.observe(el);
      });
    });
  }

  /* ---------- Render ---------- */

  function render() {
    var route = parseRoute();
    if (state.deslogado && !ROUTES[route.name].publico) {
      state.sheet = { type: "login" };
      location.replace("#/artigo");
      return;
    }
    document.body.classList.toggle("is-externo", route.name === "chatgpt");
    document.body.classList.toggle("is-deslogado", state.deslogado);
    var changed = lastRoute !== location.hash;
    lastRoute = location.hash;
    var app = $("#app");
    var seen = changed ? null : appearKeys(app);
    var slides = app.querySelector(".hero-slides");
    app.innerHTML = (VIEWS[route.name] || VIEWS.inicio)(route.param);
    var slidesSlot = app.querySelector(".hero-slides");
    if (slides && slidesSlot) slidesSlot.replaceWith(slides);
    app.classList.toggle("is-entering", changed);
    document.body.classList.toggle("has-hero", !!app.querySelector(".hero"));
    if (changed) animateEntrance(app);
    else markNew(app, seen);
    document.title = route.name === "chatgpt" ? "ChatGPT" : ROUTES[route.name].titulo + " — Lilly 360";
    var gptInput = $("#gpt-input");
    if (gptInput) ajustarComposer(gptInput);

    renderNav();
    var navKey = ROUTES[route.name].nav;
    document.querySelectorAll("[data-nav]").forEach(function (a) {
      if (a.dataset.nav === navKey) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });

    renderSheet();
    renderBackstage();
    updateProto();
    save();

    if (changed) {
      if (state.scrollTo) {
        var target = document.getElementById(state.scrollTo);
        state.scrollTo = null;
        if (target) {
          target.scrollIntoView();
          return;
        }
      }
      window.scrollTo(0, 0);
      if (!state.sheet) {
        var h = app.querySelector("[data-focus]");
        if (h) h.focus({ preventScroll: true });
      }
      if (route.name === "busca") {
        var input = $("#busca-input");
        if (input) input.focus();
      }
    }
  }

  function updatePesquisa() {
    var thread = $("#pesquisa-thread");
    if (!thread) return;
    thread.innerHTML = pesquisaThread();
    var foot = $(".ask-foot");
    if (foot) foot.hidden = !state.chat.length;
    var hero = thread.closest(".hero--busca");
    if (hero) {
      hero.classList.toggle("is-conversa", state.chat.length > 0);
      thread.tabIndex = state.chat.length ? 0 : -1;
    }
  }

  /* No banner as respostas rolam dentro da própria área; fora dele, a página rola até a pergunta. */
  function mostrarUltimaPergunta() {
    var last = $("#pesquisa-thread .ask-turn:last-child");
    if (!last) return;
    var behavior = reducedMotion() ? "auto" : "smooth";
    var thread = last.parentNode;
    if (thread.classList.contains("hero-thread")) thread.scrollTo({ top: last.offsetTop - 8, behavior: behavior });
    else last.scrollIntoView({ block: "nearest", behavior: behavior });
  }

  function pesquisar(q) {
    q = q.trim();
    if (!q) return;
    var turn = { q: q, pending: true };
    state.chat.push(turn);
    sig("busca_realizada", { termos: q }, "Pesquisa só no acervo aprovado. Nenhuma resposta gerada por IA.");
    updatePesquisa();
    mostrarUltimaPergunta();
    save();
    updateProto();
    setTimeout(function () {
      turn.pending = false;
      updatePesquisa();
      if ($(".hero-thread")) mostrarUltimaPergunta();
      save();
      updateProto();
    }, 700);
  }

  /* ---------- Ações ---------- */

  var ACTIONS = {
    notificacoes: function () {
      state.sheet = { type: "notificacoes" };
    },
    sheet: function (el) {
      state.sheet = { type: el.dataset.sheet, material: el.dataset.material || "" };
      if (el.dataset.sheet === "whatsapp") waFone = "";
      if (el.dataset.sheet === "linkedin") {
        var ta = $("#post-text");
        if (ta) state.postText = ta.value;
      }
    },
    "sheet-close": function () {
      state.sheet = null;
    },
    why: function (el) {
      state.why = el.dataset.item;
      state.backstage = true;
      sig("por_que_vejo_isto", { item: el.dataset.item }, "Transparência: o médico vê o motivo e pode ajustar as preferências.");
    },
    "pesquisa-sugestao": function (el) {
      pesquisar(el.dataset.q);
      return false;
    },
    "pesquisa-limpar": function () {
      state.chat = [];
      updatePesquisa();
      save();
      var input = $("#pesquisa-hero-input") || $("#pesquisa-input");
      if (input) input.focus();
      return false;
    },
    "busca-sugestao": function (el) {
      state.query = el.dataset.q;
      sig("busca_realizada", { termos: el.dataset.q }, "Termos sem dado pessoal: temas de interesse e lacunas do acervo.");
      if (el.tagName === "BUTTON") {
        $("#busca-resultados").innerHTML = searchResults();
        var input = $("#busca-input");
        if (input) input.value = state.query;
        save();
        updateProto();
        return false;
      }
    },
    triagem: function (el) {
      state.triage = el.dataset.k;
      sig("triagem_respondida", { especialidade: "cardiologia", situacao: TRIAGE[state.triage].label, momento: TRIAGE[state.triage].momento }, "Momento do paciente no perfil: ferramenta, material e seleção mudam.");
      state.scrollAfter = "kit-result";
    },
    "calc-tfg": function () {
      var cr = parseFloat($("#tfg-cr").value);
      var age = parseFloat($("#tfg-idade").value);
      var fem = $("#tfg-sexo").value === "f";
      var out = $("#tfg-out");
      if (!(cr > 0 && age >= 18)) {
        out.innerHTML = "<p>Informe creatinina e idade válidas.</p>";
        return false;
      }
      var k = fem ? 0.7 : 0.9;
      var a = fem ? -0.241 : -0.302;
      var tfg = 142 * Math.pow(Math.min(cr / k, 1), a) * Math.pow(Math.max(cr / k, 1), -1.2) * Math.pow(0.9938, age) * (fem ? 1.012 : 1);
      tfg = Math.round(tfg);
      var est = tfg >= 90 ? "G1" : tfg >= 60 ? "G2" : tfg >= 45 ? "G3a" : tfg >= 30 ? "G3b" : tfg >= 15 ? "G4" : "G5";
      out.innerHTML = '<p class="calc-big">' + tfg + ' <span>mL/min/1,73 m²</span></p><p>Categoria ' + est + ". " + (tfg < 45 ? "Reavalie creatinina e potássio em 1 a 2 semanas depois de cada ajuste." : "Mantenha o controle habitual.") + "</p>";
      sig("ferramenta_usada", { ferramenta: "tfg_ckd_epi" }, "Uso do kit reordena as ferramentas. Os valores digitados não são guardados.");
      renderBackstage();
      save();
      return false;
    },
    "gpt-abrir": function () {
      sig("visita_externa", { origem: "chatgpt", pagina: "artigo_aberto" }, "Visita anônima: sem login, nada vai para o perfil.");
    },
    "gpt-fora": function () {
      toast("No protótipo, só o link do Lilly 360 abre");
      return false;
    },
    "login-abrir": function () {
      state.sheet = { type: "login" };
    },
    "whatsapp-enviar": function () {
      var flowSend = state.flow === 1 && parseRoute().name === "tema";
      if (flowSend) reachGoal();
      state.sent = state.sent || parseRoute().name === "tema";
      sig("material_enviado", { material: state.sheet.material, canal: "whatsapp" }, "Uso clínico e afinidade de tema. Material relacionado sobe no kit.");
      state.sheet = { type: "whatsapp", material: state.sheet.material, done: true };
    },
    "material-alt": function (el) {
      sig("material_enviado", { material: state.sheet.material, canal: el.dataset.v.toLowerCase() });
      toast(el.dataset.v === "QR" ? "QR pronto para o paciente escanear" : "Material pronto para imprimir");
      state.sheet = null;
    },
    "licao-play": function () {
      state.lessonPlayed = true;
      sig("video_progresso", { peca: "licao_6", segundo: 960, abandono: false }, "Cada segundo vira dado: mapa de calor por trecho.");
    },
    "licao-concluir": function () {
      state.lessonPlayed = true;
      sig("video_progresso", { peca: "licao_6", segundo: 960, abandono: false });
    },
    "quiz-answer": function (el) {
      var key = el.dataset.quiz;
      var st = state.quiz[key];
      var it = QUIZ[key][st.i];
      var i = +el.dataset.i;
      var ok = i === it.a;
      st.answers[st.i] = { choice: i, ok: ok };
      sig("quiz_respondido", { tema: it.tema, acerto: ok }, ok ? null : "Tema em aberto: o caso clínico e a lição de reforço do tema entram na próxima seleção.");
    },
    "quiz-next": function (el) {
      var key = el.dataset.quiz;
      var st = state.quiz[key];
      st.i++;
      if (st.i >= QUIZ[key].length) {
        if (key === "licao") {
          state.lessonDone = true;
          state.quizWrong = !st.answers[0].ok;
          sig("licao_concluida", { trilha: "cardiologia_avancada", licao: 6 }, state.quizWrong ? "Regra: erro em ajuste de dose põe o caso do tema no topo da seleção de amanhã." : "Próxima lição liberada.");
        } else {
          state.trailDone = true;
          sig("trilha_concluida", { trilha: "cardiologia_fundamentos" }, "Certificado e selo liberados. Ranking recalculado.");
          if (state.flow === 5) {
            state.touches = 0;
            state.counting = true;
            state.t0 = Date.now();
          }
          go("#/conclusao");
          return false;
        }
      }
    },
    "final-iniciar": function () {
      state.finalStarted = true;
    },
    "caso-escolha": function (el) {
      state.caseChoice = +el.dataset.i;
    },
    "caso-decidir": function () {
      if (state.caseChoice === null) return false;
      var it = CASO[state.caseStep];
      var ok = state.caseChoice === it.a;
      state.caseAnswers[state.caseStep] = { choice: state.caseChoice, ok: ok };
      sig("caso_decisao", { caso: "rim_coracao", etapa: state.caseStep + 1, correta: ok }, ok ? "Mostra como o médico decide: insumo para a pauta médica." : "Ponto de erro vira lição de reforço.");
    },
    "caso-proxima": function () {
      state.caseChoice = null;
      if (state.caseStep < CASO.length - 1) state.caseStep++;
      else {
        state.caseDone = true;
        sig("caso_concluido", { caso: "rim_coracao" }, "Casos resolvidos sobem no progresso.");
      }
    },
    "ouvir-licao": function () {
      state.audio = !state.audio;
      if (state.audio) {
        sig("audio_play", { peca: "licao_6" }, "Afinidade de formato: áudio ganha peso no perfil. Modo áudio entra no R3.");
        toast("Tocando a lição em áudio");
      }
    },
    "ouvir-atualizacao": function () {
      state.audio = true;
      sig("audio_play", { peca: "atualizacao_congresso" }, "Afinidade de formato: áudio.");
      toast("Tocando a atualização, 2 min");
    },
    "live-inscrever": function () {
      state.liveSignup = !state.liveSignup;
      if (state.liveSignup) sig("live_inscricao", { evento: "cardio_2026" }, "Se não assistir, recebe o replay em 3 lições, não um novo convite.");
    },
    "live-lembrar": function () {
      state.liveReminderOpen = !state.liveReminderOpen;
    },
    "live-lembrete": function (el) {
      state.liveReminder = el.dataset.v;
      state.liveReminderOpen = false;
      sig("lembrete_agendado", { evento: "cardio_2026", quando: el.dataset.v }, "Melhor horário aprendido para o próximo lembrete.");
    },
    "inscrever-proxima": function () {
      state.nextLiveSignup = !state.nextLiveSignup;
      if (state.nextLiveSignup) sig("live_inscricao", { evento: "caso_a_caso_ic" });
    },
    "replay-ver": function (el) {
      var i = +el.dataset.i;
      if (state.replaySeen.indexOf(i) === -1) {
        state.replaySeen.push(i);
        sig("replay_licao", { evento: "cardio_2026", licao: i + 1 }, "Lição do replay conta para a trilha e para as horas de EMC.");
        toast("Lição " + (i + 1) + " assistida");
      }
    },
    "qr-escanear": function () {
      state.qrStep = 1;
      sig("qr_lido", { evento: "congresso_cardio_2026", local: "estande" }, "Porta de entrada: QR do evento.");
    },
    "qr-entrar": function () {
      state.eventAttended = true;
      if (state.flow === 4) reachGoal();
      sig("login", { metodo: "crm", origem: "qr" }, "Médico identificado: o conteúdo do evento entra na ficha e muda o Radar de amanhã.");
      go("#/evento/cardio-2026");
      return false;
    },
    "evento-abrir": function (el) {
      sig("evento_item_aberto", { item: el.dataset.v });
      toast("Abrindo: " + el.dataset.v);
    },
    "salvar-kit": function () {
      state.savedKit = true;
      sig("item_salvo", { item: "material_kol" }, "Item salvo aparece no topo do kit.");
    },
    compartilhar: function () {
      sig("certificado_compartilhar", { canal: "linkedin" });
    },
    "baixar-certificado": function () {
      sig("certificado_baixado", { trilha: "cardiologia_fundamentos" });
      toast("Certificado baixado");
      return false;
    },
    "post-formato": function (el) {
      var ta = $("#post-text");
      if (ta) state.postText = ta.value;
      state.postFormat = el.dataset.v;
    },
    "linkedin-confirmar": function () {
      state.posted = true;
      if (state.flow === 5) reachGoal();
      sig("social_export", { peca: "certificado_fundamentos", formato: state.postFormat, canal: "linkedin", id_aprovacao: "PP-BR-0000" }, "Peça com ID de aprovação. Sinal de pares por especialidade.");
      state.sheet = { type: "linkedin", done: true };
    },
    "ir-secao": function (el) {
      state.scrollTo = el.dataset.v;
    },
    "ver-progresso": function () {
      state.sheet = null;
      state.scrollTo = "secao-progresso";
    },
    "selo-linkedin": function (el) {
      sig("selo_exportado", { selo: el.dataset.v, canal: "linkedin" });
      toast("Selo verificável pronto para o LinkedIn");
      return false;
    },
    "ler-doc": function (el) {
      sig("leitura_pagina", { estudo: el.dataset.v, acao: el.dataset.download ? "baixar" : "ler" }, "Profundidade de leitura por tema.");
      toast(el.dataset.download ? "Download iniciado" : "Abrindo no leitor do acervo");
      renderBackstage();
      save();
      return false;
    },
    contato: function (el) {
      var codigo = "L360-" + (4810 + state.contacts.length * 7);
      state.contacts.unshift({ canal: el.dataset.v, codigo: codigo });
      sig("contato_solicitado", { canal: el.dataset.v, protocolo: codigo });
      toast("Pedido enviado: " + el.dataset.v + ", protocolo " + codigo);
    }
  };

  function setDay(d) {
    if (state.day === d) return;
    state.day = d;
    if (d === "ter") {
      if (state.liveSignup && !state.liveMissed) {
        state.liveMissed = true;
        sig("live_presenca", { evento: "cardio_2026", presente: false }, "Replay em 3 lições na home.");
      }
      if (state.quizWrong) sig("selecao_recalculada", { motivo: "tema_em_aberto", tema: "ajuste_de_dose" }, "O caso do tema sobe para o topo da seleção.");
      if (state.eventAttended) sig("radar_atualizado", { origem: "congresso_cardio_2026" }, "Radar e seleção personalizados com o evento.");
    }
    state.sheet = null;
    go("#/inicio");
  }

  function startFlow(n) {
    var keepBackstage = state.backstage;
    var keepHome = state.primeiroAcesso;
    state = initialState();
    state.backstage = keepBackstage;
    state.primeiroAcesso = n ? false : keepHome;
    state.flow = n;
    state.counting = n === 1 || n === 2 || n === 4;
    state.t0 = Date.now();
    if (n) sig("fluxo_iniciado", { fluxo: n, nome: FLOWS[n].nome });
    go(n ? FLOWS[n].inicio : "#/inicio");
  }

  function startExterno() {
    var keepBackstage = state.backstage;
    state = initialState();
    state.backstage = keepBackstage;
    state.externo = true;
    state.deslogado = true;
    window.scrollTo(0, 0);
    go("#/chatgpt");
  }

  function gptEnviar() {
    state.gpt = 1;
    render();
    setTimeout(function () {
      if (state.gpt !== 1) return;
      state.gpt = 2;
      render();
    }, reducedMotion() ? 400 : 1800);
  }

  function entrar() {
    state.deslogado = false;
    state.primeiroAcesso = true;
    state.sheet = null;
    sig("login", { origem: "artigo_aberto", canal: "chatgpt" }, "A partir do login, o uso passa a entrar no perfil.");
    go("#/tema/ajuste-de-dose");
  }

  var PROTO = {
    dia: function (el) {
      setDay(el.dataset.dia);
    },
    bastidores: function () {
      state.backstage = !state.backstage;
      if (!state.backstage) state.why = null;
      renderBackstage();
      save();
    },
    home: function (el) {
      if (el.dataset.home === "externo") {
        startExterno();
        return;
      }
      state.externo = false;
      state.deslogado = false;
      state.primeiroAcesso = el.dataset.home === "primeiro";
      window.scrollTo(0, 0);
      if (state.primeiroAcesso && state.flow) startFlow(0);
      else go("#/inicio");
    },
    reiniciar: function () {
      if (state.externo) startExterno();
      else startFlow(state.flow);
    },
    progresso: function () {
      state.scrollTo = "secao-progresso";
      if (parseRoute().name === "inicio") {
        var t = document.getElementById("secao-progresso");
        if (t) t.scrollIntoView();
        state.scrollTo = null;
        updateProto();
      } else {
        go("#/inicio");
      }
    }
  };

  document.addEventListener("click", function (e) {
    var proto = e.target.closest("[data-proto]");
    if (proto) {
      PROTO[proto.dataset.proto](proto);
      return;
    }

    var inProduct = e.target.closest("#app, .site-header, #sheet-root");
    var interactive = e.target.closest("a, button, summary, select");
    if (inProduct && interactive && !interactive.disabled && state.counting && state.goal === null && !e.target.closest(".sheet-backdrop")) {
      state.touches++;
    }

    var el = e.target.closest("[data-action]");
    if (!el) {
      if (interactive && inProduct) updateProto();
      return;
    }
    var fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    var result = fn(el);
    if (result === false) {
      updateProto();
      return;
    }
    if (el.tagName === "A" && el.getAttribute("href") && el.getAttribute("href") !== location.hash) {
      save();
      return;
    }
    render();
    if (state.scrollAfter) {
      var t = document.getElementById(state.scrollAfter);
      state.scrollAfter = null;
      if (t) t.scrollIntoView({ block: "nearest" });
    }
  });

  function ajustarComposer(input) {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 200) + "px";
    input.style.overflowY = input.scrollHeight > 200 ? "auto" : "hidden";
    var send = input.form && input.form.querySelector(".ask-send, .gpt-send");
    if (send) send.disabled = !input.value.trim();
  }

  document.addEventListener("keydown", function (e) {
    if (e.target.matches(".ask-form textarea, #gpt-input") && e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      e.target.form.requestSubmit();
    } else if (e.target.id === "wa-fone" && e.key === "Enter") {
      e.preventDefault();
      var enviar = $('[data-action="whatsapp-enviar"]');
      if (enviar && !enviar.disabled) enviar.click();
    }
  });

  document.addEventListener("input", function (e) {
    if (e.target.matches(".ask-form textarea, #gpt-input")) {
      ajustarComposer(e.target);
    } else if (e.target.id === "busca-input") {
      state.query = e.target.value;
      $("#busca-resultados").innerHTML = searchResults();
      save();
    } else if (e.target.id === "wa-fone") {
      waFone = e.target.value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "").slice(0, 11);
      e.target.value = foneFormatado(waFone);
      var ok = foneValido(waFone);
      var botao = $('[data-action="whatsapp-enviar"]');
      if (botao) botao.disabled = !ok;
      var head = $("#wa-head");
      if (head) head.textContent = "WhatsApp · " + (ok ? "+55 " + foneFormatado(waFone) : "contato do paciente");
    } else if (e.target.id === "post-text") {
      state.postText = e.target.value;
      save();
    }
  });

  document.addEventListener("submit", function (e) {
    if (e.target.dataset.form === "gpt") {
      e.preventDefault();
      if (state.gpt === 0) gptEnviar();
      else toast("No protótipo, a conversa tem uma pergunta só");
      return;
    }
    if (e.target.dataset.form === "login") {
      e.preventDefault();
      entrar();
      return;
    }
    if (e.target.dataset.form === "pesquisa") {
      e.preventDefault();
      var input = e.target.querySelector("textarea");
      if (!input.value.trim()) return;
      if (!e.submitter && state.counting && state.goal === null) state.touches++;
      pesquisar(input.value);
      input.value = "";
      ajustarComposer(input);
      return;
    }
    if (e.target.dataset.form === "busca") {
      e.preventDefault();
      var q = state.query.trim();
      if (!q) return;
      if (state.counting && state.goal === null) state.touches++;
      sig("busca_realizada", { termos: q }, "Busca só no acervo aprovado. Nenhuma resposta gerada por IA.");
      var first = document.querySelector("#busca-resultados .result");
      if (first) go(first.getAttribute("href"));
      else render();
    }
  });

  $("#proto-flow").addEventListener("change", function (e) {
    startFlow(+e.target.value);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (state.sheet) {
      state.sheet = null;
      render();
      return;
    }
    if (navOpen) closeNav(true);
  });

  window.addEventListener("hashchange", function () {
    closeNav(false);
    var r = parseRoute().name;
    if (r === "radar" && state.day === "ter" && state.eventAttended && !state.radarSeen) {
      state.radarSeen = true;
      sig("radar_aberto", { personalizado: true });
    }
    if (r === "conclusao" && state.flow === 5 && state.trailDone && !state.counting) {
      state.touches = 0;
      state.counting = true;
      state.t0 = Date.now();
    }
    render();
  });

  var navPill = $("#nav-pill");
  var navToggle = $(".nav-toggle");
  var navOpen = false;
  var navLeaveTimer = null;
  var navEndTimer = null;
  var navDesktop = window.matchMedia("(min-width: 1025px)");
  var navHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  function setNavTab(id) {
    navPill.querySelectorAll(".nav-tabs li").forEach(function (li) {
      li.classList.toggle("is-active", li.dataset.tab === id);
    });
    navPill.querySelectorAll(".nav-sub").forEach(function (s) {
      s.classList.toggle("is-active", s.dataset.subPanel === id);
    });
  }

  function navDefaultTab() {
    var name = parseRoute().name;
    if (name === "parceiros" || name === "equipe") return "mais";
    var key = ROUTES[name].nav;
    return $("#nav-sub-" + key) ? key : "inicio";
  }

  function setNavSub(open) {
    navPill.classList.toggle("is-sub", open);
    var main = navPill.querySelector(".nav-main");
    if (main) main.inert = open;
  }

  function openNav(focusFirst) {
    clearTimeout(navLeaveTimer);
    clearTimeout(navEndTimer);
    if (navOpen) return;
    navOpen = true;
    if (!navPill.classList.contains("is-open")) {
      var r = navPill.getBoundingClientRect();
      navPill.style.setProperty("--pill-x", r.left + "px");
      navPill.style.setProperty("--pill-y", r.top + "px");
      navPill.style.setProperty("--pill-w", r.width + "px");
      navPill.style.setProperty("--pill-h", r.height + "px");
      setNavTab(navDefaultTab());
      setNavSub(false);
      navPill.classList.add("is-open", "is-clipped");
      void navPill.offsetWidth;
    }
    navPill.classList.remove("is-clipped");
    document.documentElement.classList.toggle("nav-locked", !navDesktop.matches);
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "Fechar navegação");
    if (focusFirst) {
      var first = navPill.querySelector(".nav-tab");
      if (first) first.focus();
    }
  }

  function closeNav(focusToggle) {
    clearTimeout(navLeaveTimer);
    if (!navOpen) return;
    navOpen = false;
    navPill.classList.add("is-clipped");
    document.documentElement.classList.remove("nav-locked");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir navegação");
    navEndTimer = setTimeout(function () {
      navPill.classList.remove("is-open", "is-clipped");
      setNavSub(false);
    }, reducedMotion() ? 0 : 280);
    if (focusToggle) navToggle.focus();
  }

  function hoverNav() {
    return navDesktop.matches && navHover.matches;
  }

  navToggle.addEventListener("click", function (e) {
    if (navOpen) closeNav(false);
    else openNav(e.detail === 0);
  });
  navPill.addEventListener("mouseenter", function () {
    if (hoverNav()) openNav(false);
  });
  navPill.addEventListener("mouseleave", function () {
    if (!hoverNav()) return;
    navLeaveTimer = setTimeout(function () {
      if (!navPill.contains(document.activeElement) || document.activeElement === navToggle) closeNav(false);
    }, 120);
  });
  navPill.addEventListener("mouseover", function (e) {
    var tab = e.target.closest(".nav-tabs li");
    if (tab && navDesktop.matches) setNavTab(tab.dataset.tab);
  });
  navPill.addEventListener("focusin", function (e) {
    var tab = e.target.closest(".nav-tabs li");
    if (tab && navDesktop.matches) setNavTab(tab.dataset.tab);
  });
  navPill.addEventListener("focusout", function (e) {
    if (navOpen && e.relatedTarget && !navPill.contains(e.relatedTarget)) closeNav(false);
  });
  navPill.addEventListener("click", function (e) {
    var sub = e.target.closest("[data-sub]");
    if (sub && !navDesktop.matches) {
      e.preventDefault();
      setNavTab(sub.dataset.sub);
      setNavSub(true);
      var back = $("#nav-sub-" + sub.dataset.sub + " .nav-back");
      if (back) back.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest(".nav-back")) {
      var id = navPill.querySelector(".nav-sub.is-active").dataset.subPanel;
      setNavSub(false);
      var opener = navPill.querySelector('.nav-tabs [data-sub="' + id + '"]');
      if (opener) opener.focus({ preventScroll: true });
      return;
    }
    if (e.target.closest("#nav-panel a")) closeNav(false);
  });
  document.addEventListener("click", function (e) {
    if (navOpen && !navPill.contains(e.target)) closeNav(false);
  });
  navDesktop.addEventListener("change", function () {
    if (!navOpen) return;
    navOpen = false;
    clearTimeout(navEndTimer);
    navPill.classList.remove("is-open", "is-clipped");
    setNavSub(false);
    document.documentElement.classList.remove("nav-locked");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Abrir navegação");
  });

  if (!location.hash) history.replaceState(null, "", "#/inicio");
  render();
})();
