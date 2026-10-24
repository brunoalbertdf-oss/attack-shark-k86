const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const api = async (caminho, corpo) => {
  const r = await fetch(caminho, corpo === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.erro);
  return j.dados;
};

let timerAviso;
const avisar = (msg, erro = false) => {
  const el = $("#aviso-flutuante");
  el.textContent = msg;
  el.classList.toggle("erro", erro);
  el.hidden = false;
  clearTimeout(timerAviso);
  timerAviso = setTimeout(() => { el.hidden = true; }, erro ? 5000 : 2200);
};

const guardar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); } catch {} };
const recuperar = (chave, padrao) => {
  try { const v = localStorage.getItem(chave); return v === null ? padrao : JSON.parse(v); } catch { return padrao; }
};

const CORES = ["#ff2d55", "#ff9500", "#ffd60a", "#34c759", "#00c7be", "#0a84ff", "#5e5ce6", "#bf5af2", "#ffffff"];

// ---------- Abas ----------
$$(".aba").forEach((b) => b.addEventListener("click", () => {
  $$(".aba").forEach((x) => x.classList.toggle("ativa", x === b));
  $$(".painel").forEach((p) => p.classList.toggle("ativo", p.id === `aba-${b.dataset.aba}`));
  guardar("aba", b.dataset.aba);
}));
$(`.aba[data-aba="${recuperar("aba", "luzes")}"]`)?.click();

// ---------- Estado / conexão ----------
let estado = { conectado: false };
const atualizarEstado = async (primeiraVez = false) => {
  try {
    estado = await api(primeiraVez ? "/api/estado?completo" : "/api/estado");
  } catch {
    estado = { conectado: false };
  }
  const st = $("#status");
  st.className = "status " + (estado.conectado ? "ok" : "erro");
  st.textContent = estado.conectado
    ? `K86 conectado · firmware ${estado.versao ?? "?"}`
    : "Teclado não encontrado — conecte o K86 pelo cabo USB";
  const oficiais = estado.processosOficiais ?? [];
  $("#aviso-oficial").hidden = oficiais.length === 0;
  $("#nomes-oficiais").textContent = oficiais.join(", ");
  if (primeiraVez && estado.luz) carregarLuz(estado.luz);
  if (primeiraVez && estado.efeitos) desenharEfeitos(estado.efeitos);
  $("#info-sistema").checked = !!estado.infoSistemaAtivo;
};

$("#encerrar-oficial").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await api("/api/encerrar-oficial", {});
    avisar("Driver antigo encerrado.");
    await atualizarEstado(false);
  } catch (err) {
    avisar(err.message, true);
  } finally {
    e.target.disabled = false;
  }
});

// ---------- Luzes ----------
const NIVEIS = ["Mínimo", "Baixo", "Médio", "Alto", "Máximo"];
const luz = { efeito: 1, opcao: 0, brilho: 4, velocidade: 2, arcoIris: true, cor: "#00aaff" };
let efeitos = [];
const efeitoAtual = () => efeitos.find((e) => e.id === luz.efeito);
// Última direção escolhida em cada efeito, para não "esquecer" ao trocar de efeito.
const direcaoPorEfeito = recuperar("direcaoPorEfeito", {});

const desenharEfeitos = (lista) => {
  efeitos = lista;
  const grade = $("#lista-efeitos");
  grade.innerHTML = "";
  for (const ef of efeitos) {
    const b = document.createElement("button");
    b.className = "efeito";
    b.dataset.efeito = ef.id;
    const extra = ef.direcoes ? `<span class="seta">${ef.direcoes.length} direções</span>` : "";
    b.innerHTML = `<span>${ef.nome}</span>${extra}<span class="faixa ${ef.id === 0 ? "desligado" : ""}"></span>`;
    b.addEventListener("click", () => {
      if (ef.id === 13) { $('.aba[data-aba="teclas"]').click(); avisar("Pinte as teclas e clique em “Enviar para o teclado”."); return; }
      luz.efeito = ef.id;
      luz.opcao = direcaoPorEfeito[ef.id] ?? 0;
      atualizarControlesLuz();
      aplicarLuz();
    });
    grade.append(b);
  }
  atualizarControlesLuz();
};

const desenharDirecoes = () => {
  const ef = efeitoAtual();
  const caixa = $("#direcoes");
  $("#campo-direcao").hidden = !ef?.direcoes;
  caixa.innerHTML = "";
  ef?.direcoes?.forEach((nome, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "opcao" + (i === luz.opcao ? " ativa" : "");
    b.textContent = nome;
    b.addEventListener("click", () => {
      luz.opcao = i;
      direcaoPorEfeito[luz.efeito] = i;
      guardar("direcaoPorEfeito", direcaoPorEfeito);
      desenharDirecoes();
      aplicarLuz();
    });
    caixa.append(b);
  });
};

const carregarLuz = (l) => {
  Object.assign(luz, { efeito: l.efeito, opcao: l.opcao ?? 0, brilho: l.brilho, velocidade: Math.max(0, Math.min(4, l.velocidade)), arcoIris: l.arcoIris });
  if (!l.arcoIris && l.cor) luz.cor = l.cor;
  atualizarControlesLuz();
};

const atualizarControlesLuz = () => {
  const ef = efeitoAtual();
  $$(".efeito").forEach((b) => b.classList.toggle("ativo", Number(b.dataset.efeito) === luz.efeito));
  desenharDirecoes();
  $("#brilho").value = luz.brilho;
  $("#valor-brilho").textContent = NIVEIS[luz.brilho] ?? luz.brilho;
  $("#campo-velocidade").hidden = ef?.velocidade === false;
  $("#velocidade").value = luz.velocidade;
  $("#valor-velocidade").textContent = NIVEIS[luz.velocidade] ?? luz.velocidade;
  $("#campo-cor").hidden = ef?.cor === false;
  $$("[data-modo]").forEach((b) => b.classList.toggle("ativa", (b.dataset.modo === "arcoiris") === luz.arcoIris));
  $("#area-cor").classList.toggle("oculta", luz.arcoIris);
  $("#cor-luz").value = luz.cor;
  $$("#cores-rapidas .amostra").forEach((a) => a.classList.toggle("ativa", a.dataset.cor === luz.cor));
};

let timerLuz;
const aplicarLuz = () => {
  clearTimeout(timerLuz);
  timerLuz = setTimeout(async () => {
    try { await api("/api/luz", luz); } catch (e) { avisar(e.message, true); }
  }, 250);
};

const criarAmostras = (alvo, aoEscolher) => {
  for (const cor of CORES) {
    const a = document.createElement("button");
    a.className = "amostra";
    a.style.background = cor;
    a.dataset.cor = cor;
    a.title = cor;
    a.addEventListener("click", () => aoEscolher(cor));
    alvo.append(a);
  }
};

criarAmostras($("#cores-rapidas"), (cor) => { luz.cor = cor; luz.arcoIris = false; atualizarControlesLuz(); aplicarLuz(); });
$("#cor-luz").addEventListener("input", (e) => { luz.cor = e.target.value; luz.arcoIris = false; atualizarControlesLuz(); aplicarLuz(); });
$("#brilho").addEventListener("input", (e) => { luz.brilho = Number(e.target.value); atualizarControlesLuz(); aplicarLuz(); });
$("#velocidade").addEventListener("input", (e) => { luz.velocidade = Number(e.target.value); atualizarControlesLuz(); aplicarLuz(); });
$$("[data-modo]").forEach((b) => b.addEventListener("click", () => {
  luz.arcoIris = b.dataset.modo === "arcoiris";
  atualizarControlesLuz();
  aplicarLuz();
}));

// ---------- Cores por tecla ----------
// [rótulo, código HID, largura, deslocamento antes] por linha; unidade = 1 tecla.
const LAYOUT = [
  [["Esc", 41], ["F1", 58, 1, 1], ["F2", 59], ["F3", 60], ["F4", 61], ["F5", 62, 1, 0.5], ["F6", 63], ["F7", 64], ["F8", 65],
    ["F9", 66, 1, 0.5], ["F10", 67], ["F11", 68], ["F12", 69], ["PrtSc", 70, 1, 0.25], ["ScrLk", 71], ["Pause", 72]],
  [["'", 53], ["1", 30], ["2", 31], ["3", 32], ["4", 33], ["5", 34], ["6", 35], ["7", 36], ["8", 37], ["9", 38], ["0", 39],
    ["-", 45], ["=", 46], ["⌫", 42, 2], ["Ins", 73, 1, 0.25], ["Home", 74], ["PgUp", 75]],
  [["Tab", 43, 1.5], ["Q", 20], ["W", 26], ["E", 8], ["R", 21], ["T", 23], ["Y", 28], ["U", 24], ["I", 12], ["O", 18], ["P", 19],
    ["[", 47], ["]", 48], ["\\", 49, 1.5], ["Del", 76, 1, 0.25], ["End", 77], ["PgDn", 78]],
  [["Caps", 57, 1.75], ["A", 4], ["S", 22], ["D", 7], ["F", 9], ["G", 10], ["H", 11], ["J", 13], ["K", 14], ["L", 15], [";", 51],
    ["~", 52], ["Enter", 40, 2.25]],
  [["Shift", 225, 2.25], ["Z", 29], ["X", 27], ["C", 6], ["V", 25], ["B", 5], ["N", 17], ["M", 16], [",", 54], [".", 55], ["/", 56],
    ["Shift", 229, 2.75], ["↑", 82, 1, 1.25]],
  [["Ctrl", 224, 1.25], ["Win", 227, 1.25], ["Alt", 226, 1.25], ["Espaço", 44, 6.25], ["Alt", 230, 1.25], ["Fn", "fn", 1.25],
    ["Menu", 101, 1.25], ["Ctrl", 228, 1.25], ["←", 80, 1, 0.25], ["↓", 81], ["→", 79]],
];

let coresTeclas = recuperar("coresTeclas", {});
let corPincel = recuperar("corPincel", "#ff2d55");
const elementosTecla = new Map();

const desenharTeclado = () => {
  const area = $("#teclado");
  const interno = document.createElement("div");
  interno.className = "teclado-interno";
  let larguraMax = 0;
  LAYOUT.forEach((linha, y) => {
    let x = 0;
    for (const [rotulo, hid, largura = 1, antes = 0] of linha) {
      x += antes;
      const el = document.createElement("div");
      el.className = "tecla";
      el.textContent = rotulo;
      el.dataset.hid = hid;
      Object.assign(el.style, {
        left: `calc(var(--u) * ${x})`, top: `calc(var(--u) * ${y + (y > 0 ? 0.35 : 0)})`,
        width: `calc(var(--u) * ${largura} - 4px)`, height: "calc(var(--u) - 4px)",
      });
      interno.append(el);
      elementosTecla.set(String(hid), el);
      x += largura;
    }
    larguraMax = Math.max(larguraMax, x);
  });
  Object.assign(interno.style, { width: `calc(var(--u) * ${larguraMax})`, height: `calc(var(--u) * ${LAYOUT.length + 0.35})` });
  area.append(interno);

  let pintando = 0; // 1 = pintar, 2 = apagar
  const pintar = (alvo) => {
    const tecla = alvo?.closest?.(".tecla");
    if (!tecla) return;
    if (pintando === 2) delete coresTeclas[tecla.dataset.hid];
    else coresTeclas[tecla.dataset.hid] = corPincel;
    atualizarTecla(tecla.dataset.hid);
  };
  area.addEventListener("contextmenu", (e) => e.preventDefault());
  area.addEventListener("pointerdown", (e) => { pintando = e.button === 2 ? 2 : 1; pintar(e.target); });
  area.addEventListener("pointermove", (e) => { if (pintando) pintar(document.elementFromPoint(e.clientX, e.clientY)); });
  window.addEventListener("pointerup", () => { if (pintando) guardar("coresTeclas", coresTeclas); pintando = 0; });
  elementosTecla.forEach((_, hid) => atualizarTecla(hid));
};

const atualizarTecla = (hid) => {
  const el = elementosTecla.get(String(hid));
  const cor = coresTeclas[hid];
  el.classList.toggle("acesa", !!cor);
  el.style.background = cor ?? "";
  el.style.setProperty("--brilho", cor ?? "transparent");
};
const redesenharTeclas = () => { elementosTecla.forEach((_, hid) => atualizarTecla(hid)); guardar("coresTeclas", coresTeclas); };

const definirPincel = (cor) => {
  corPincel = cor;
  $("#cor-pincel").value = cor;
  $$("#cores-pincel .amostra").forEach((a) => a.classList.toggle("ativa", a.dataset.cor === cor));
  guardar("corPincel", cor);
};
criarAmostras($("#cores-pincel"), definirPincel);
$("#cor-pincel").addEventListener("input", (e) => definirPincel(e.target.value));
definirPincel(corPincel);

$("#pintar-tudo").addEventListener("click", () => {
  coresTeclas = Object.fromEntries([...elementosTecla.keys()].map((h) => [h, corPincel]));
  redesenharTeclas();
});
$("#limpar-teclas").addEventListener("click", () => { coresTeclas = {}; redesenharTeclas(); });
$("#modelo-arcoiris").addEventListener("click", () => {
  coresTeclas = {};
  elementosTecla.forEach((el, hid) => {
    const x = el.offsetLeft / el.parentElement.offsetWidth;
    coresTeclas[hid] = `hsl(${Math.round(x * 300)} 100% 50%)`;
  });
  coresTeclas = Object.fromEntries(Object.entries(coresTeclas).map(([h, c]) => [h, hslParaHex(c)]));
  redesenharTeclas();
});
$("#modelo-gamer").addEventListener("click", () => {
  coresTeclas = Object.fromEntries([...elementosTecla.keys()].map((h) => [h, "#1a1a40"]));
  for (const h of [26, 4, 22, 7, 82, 80, 81, 79]) coresTeclas[h] = "#ff2d55";
  for (const h of [44, 225, 224, 41]) coresTeclas[h] = "#0a84ff";
  redesenharTeclas();
});

const hslParaHex = (hsl) => {
  const c = document.createElement("canvas").getContext("2d");
  c.fillStyle = hsl;
  return c.fillStyle;
};

const desenharSalvos = () => {
  const salvos = recuperar("layoutsSalvos", {});
  const ul = $("#layouts-salvos");
  ul.innerHTML = "";
  const nomes = Object.keys(salvos);
  if (nomes.length === 0) { ul.innerHTML = '<li class="dica">Nenhum layout salvo ainda.</li>'; return; }
  for (const nome of nomes) {
    const li = document.createElement("li");
    const abrir = document.createElement("button");
    abrir.className = "botao secundario";
    abrir.textContent = nome;
    abrir.addEventListener("click", () => { coresTeclas = { ...salvos[nome] }; redesenharTeclas(); avisar(`Layout “${nome}” carregado.`); });
    const remover = document.createElement("button");
    remover.className = "botao secundario remover";
    remover.textContent = "✕";
    remover.title = "Remover";
    remover.addEventListener("click", () => { delete salvos[nome]; guardar("layoutsSalvos", salvos); desenharSalvos(); });
    li.append(abrir, remover);
    ul.append(li);
  }
};
$("#salvar-layout").addEventListener("click", () => {
  const nome = $("#nome-layout").value.trim();
  if (!nome) { avisar("Dê um nome ao layout.", true); return; }
  const salvos = recuperar("layoutsSalvos", {});
  salvos[nome] = { ...coresTeclas };
  guardar("layoutsSalvos", salvos);
  $("#nome-layout").value = "";
  desenharSalvos();
  avisar(`Layout “${nome}” salvo.`);
});

$("#enviar-teclas").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try {
    await api("/api/teclas", { cores: coresTeclas, brilho: luz.brilho });
    luz.efeito = 13;
    atualizarControlesLuz();
    avisar("Cores enviadas para o teclado!");
  } catch (err) {
    avisar(err.message, true);
  } finally {
    e.target.disabled = false;
  }
});

// ---------- Tela ----------
const L = 240, A = 135;
const previa = $("#previa");
const ctxPrevia = previa.getContext("2d");
const DURACAO_MAX_MS = 15000;
const ATRASO_MIN_MS = 10;
let quadros = []; // ImageData 240x135, já reamostrados para o teclado
let atrasoQuadro = 50; // ms por quadro enviados ao teclado
let ajuste = recuperar("ajusteTela", "preencher");
let origem = null; // { tipo: "imagem"|"gif"|"texto", fontes: [{ img, w, h, duracao (ms) }] }
let animacao;

const segundos = (ms) => (ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });

// O teclado toca todos os quadros com o mesmo intervalo (1–255 ms) e guarda no máximo
// `max` quadros. Reamostra a linha do tempo do GIF para caber nisso mantendo a duração real.
const planejarAnimacao = (fontes, max, atrasoMax, fator) => {
  const tempos = fontes.map((f) => Math.max(ATRASO_MIN_MS, f.duracao || 100) / fator);
  const duracaoGif = tempos.reduce((a, b) => a + b, 0);
  const total = Math.min(duracaoGif, DURACAO_MAX_MS);
  const usados = tempos.reduce((n, _, i) => (tempos.slice(0, i).reduce((a, b) => a + b, 0) < total ? i + 1 : n), 0);
  const mediaOriginal = total / usados;
  const atraso = Math.round(Math.min(atrasoMax, Math.max(ATRASO_MIN_MS, mediaOriginal, total / max)));
  const n = Math.max(1, Math.min(max, Math.round(total / atraso)));
  const indices = [];
  let acumulado = 0, f = 0;
  for (let k = 0; k < n; k++) {
    const t = k * atraso;
    while (f < tempos.length - 1 && acumulado + tempos[f] <= t) acumulado += tempos[f++];
    indices.push(f);
  }
  return { indices, atraso, total, cortado: duracaoGif > DURACAO_MAX_MS + 1 };
};

const desenharFonte = (fonte, w, h) => {
  const c = document.createElement("canvas");
  c.width = L; c.height = A;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, L, A);
  const escala = ajuste === "preencher" ? Math.max(L / w, A / h) : Math.min(L / w, A / h);
  const dw = w * escala, dh = h * escala;
  g.imageSmoothingQuality = "high";
  g.drawImage(fonte, (L - dw) / 2, (A - dh) / 2, dw, dh);
  return g.getImageData(0, 0, L, A);
};

const reprocessar = () => {
  if (!origem) return;
  const info = $("#info-animacao");
  if (origem.fontes.length === 1) {
    quadros = [desenharFonte(origem.fontes[0].img, origem.fontes[0].w, origem.fontes[0].h)];
    atrasoQuadro = 50;
    info.textContent = "";
  } else {
    const plano = planejarAnimacao(origem.fontes, estado.maxQuadros ?? 106, estado.atrasoMaxMs ?? 255, Number($("#velocidade-gif").value));
    const cache = new Map();
    quadros = plano.indices.map((i) => {
      if (!cache.has(i)) cache.set(i, desenharFonte(origem.fontes[i].img, origem.fontes[i].w, origem.fontes[i].h));
      return cache.get(i);
    });
    atrasoQuadro = plano.atraso;
    info.textContent = `Duração no teclado: ${segundos(quadros.length * atrasoQuadro)} s (${quadros.length} quadros de ${atrasoQuadro} ms).`
      + (plano.cortado ? ` O GIF passa de 15 s; foram usados só os primeiros 15 s.` : "");
  }
  iniciarPrevia();
};

const iniciarPrevia = () => {
  clearTimeout(animacao);
  $("#enviar-tela").disabled = quadros.length === 0;
  $("#info-quadros").textContent = quadros.length > 1 ? `Prévia na velocidade real · ${quadros.length} quadros` : quadros.length === 1 ? "Imagem estática" : "";
  let i = 0;
  const passo = () => {
    if (quadros.length === 0) return;
    ctxPrevia.putImageData(quadros[i % quadros.length], 0, 0);
    i++;
    if (quadros.length > 1) animacao = setTimeout(passo, atrasoQuadro);
  };
  passo();
};

const carregarArquivo = async (arquivo) => {
  if (!arquivo) return;
  try {
    if (arquivo.type === "image/gif" && "ImageDecoder" in window) {
      $("#info-animacao").textContent = "Lendo o GIF…";
      const dec = new ImageDecoder({ data: await arquivo.arrayBuffer(), type: "image/gif" });
      await dec.tracks.ready;
      const total = dec.tracks.selectedTrack.frameCount;
      const fontes = [];
      // Lê até 30 s de GIF (cabe 15 s mesmo na velocidade 2×).
      let lidoMs = 0;
      for (let i = 0; i < total && lidoMs < DURACAO_MAX_MS * 2; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const duracao = image.duration ? image.duration / 1000 : 100;
        const bmp = await createImageBitmap(image);
        fontes.push({ img: bmp, w: bmp.width, h: bmp.height, duracao });
        lidoMs += Math.max(ATRASO_MIN_MS, duracao);
        image.close();
      }
      dec.close();
      origem = { tipo: "gif", fontes };
    } else {
      const bmp = await createImageBitmap(arquivo);
      origem = { tipo: "imagem", fontes: [{ img: bmp, w: bmp.width, h: bmp.height }] };
    }
    reprocessar();
  } catch {
    avisar("Não consegui abrir esse arquivo de imagem.", true);
  }
};

const soltar = $("#soltar");
$("#arquivo").addEventListener("change", (e) => carregarArquivo(e.target.files[0]));
["dragenter", "dragover"].forEach((ev) => soltar.addEventListener(ev, (e) => { e.preventDefault(); soltar.classList.add("arrastando"); }));
["dragleave", "drop"].forEach((ev) => soltar.addEventListener(ev, () => soltar.classList.remove("arrastando")));
soltar.addEventListener("drop", (e) => { e.preventDefault(); carregarArquivo(e.dataTransfer.files[0]); });

$$("[data-ajuste]").forEach((b) => {
  b.classList.toggle("ativa", b.dataset.ajuste === ajuste);
  b.addEventListener("click", () => {
    ajuste = b.dataset.ajuste;
    guardar("ajusteTela", ajuste);
    $$("[data-ajuste]").forEach((x) => x.classList.toggle("ativa", x === b));
    reprocessar();
  });
});

$("#usar-texto").addEventListener("click", () => {
  const texto = $("#texto-tela").value.trim() || "K86";
  const c = document.createElement("canvas");
  c.width = L; c.height = A;
  const g = c.getContext("2d");
  g.fillStyle = $("#fundo-texto").value;
  g.fillRect(0, 0, L, A);
  let tamanho = Number($("#tamanho-texto").value);
  g.font = `700 ${tamanho}px "Segoe UI", system-ui, sans-serif`;
  while (g.measureText(texto).width > L - 16 && tamanho > 10) {
    tamanho -= 2;
    g.font = `700 ${tamanho}px "Segoe UI", system-ui, sans-serif`;
  }
  g.fillStyle = $("#cor-texto").value;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(texto, L / 2, A / 2);
  origem = { tipo: "texto", fontes: [{ img: c, w: L, h: A }] };
  reprocessar();
});

const paraBase64 = (bytes) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

$("#velocidade-gif").value = String(recuperar("velocidadeGif", 1));
$("#velocidade-gif").addEventListener("change", (e) => { guardar("velocidadeGif", Number(e.target.value)); reprocessar(); });

$("#enviar-tela").addEventListener("click", async () => {
  const botao = $("#enviar-tela");
  const barra = $("#progresso-tela");
  const msg = $("#msg-tela");
  const rgb = quadros.map((q) => {
    const saida = new Uint8Array(L * A * 3);
    for (let i = 0, o = 0; i < q.data.length; i += 4) { saida[o++] = q.data[i]; saida[o++] = q.data[i + 1]; saida[o++] = q.data[i + 2]; }
    return paraBase64(saida);
  });
  botao.disabled = true;
  barra.hidden = false;
  barra.firstElementChild.style.width = "0%";
  msg.textContent = "Preparando a tela do teclado…";
  try {
    await api("/api/tela", { quadros: rgb, atraso: atrasoQuadro });
    for (;;) {
      await new Promise((r) => setTimeout(r, 400));
      const p = await api("/api/tela/progresso");
      barra.firstElementChild.style.width = `${Math.round(p.progresso * 100)}%`;
      msg.textContent = p.ativo ? `Enviando… ${Math.round(p.progresso * 100)}%` : "";
      if (p.erro) throw new Error(p.erro);
      if (!p.ativo && p.concluido) break;
    }
    msg.textContent = "Pronto! A imagem já está no teclado.";
    avisar("Tela atualizada!");
  } catch (e) {
    msg.textContent = e.message;
    avisar(e.message, true);
  } finally {
    botao.disabled = quadros.length === 0;
    setTimeout(() => { barra.hidden = true; }, 1500);
  }
});

$("#sincronizar-relogio").addEventListener("click", async () => {
  try { await api("/api/relogio", {}); avisar("Relógio do teclado acertado."); } catch (e) { avisar(e.message, true); }
});
$("#info-sistema").addEventListener("change", async (e) => {
  try {
    await api("/api/info-sistema", { ativo: e.target.checked });
    avisar(e.target.checked ? "Enviando dados do PC a cada 2 segundos." : "Envio de dados do PC desligado.");
  } catch (err) { avisar(err.message, true); }
});

// ---------- Início ----------
desenharTeclado();
desenharSalvos();
atualizarEstado(true);
setInterval(() => atualizarEstado(false), 5000);
