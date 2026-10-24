// Protocolo HID do Attack Shark K86 (yc3121, VID 0x3151 / PID 0x4015).
// Documentação: ../k86-analise/PROTOCOLO-K86.md
import HID from "node-hid";

export const VID = 0x3151;
export const PID = 0x4015;
export const TELA = { largura: 240, altura: 135 };
// Mesma conta do app oficial: memória da tela do K86 = 7 MB (padrão do app para este modelo),
// 4 KB reservados, cada quadro ocupa múltiplos de 4 KB, menos 5 imagens estáticas.
const MEMORIA_TELA = 7 * 1024 * 1024 - 4 * 1024;
const BYTES_POR_QUADRO = (Math.floor((240 * 135 * 2) / 4096) + 1) * 4096;
export const MAX_QUADROS = Math.floor(MEMORIA_TELA / BYTES_POR_QUADRO) - 5; // 106
export const ATRASO_MAX_MS = 255; // o atraso entre quadros é 1 byte, em milissegundos

const BIT7 = 7;
const BIT8 = 8;
const VELOCIDADE_MAX = 5;
const MODO_ARCO_IRIS = 8;
const MODO_COR_FIXA = 7;

// Efeitos que o app oficial libera para o K86 (layout de luz "Be"), na ordem de exibição.
// direcoes = opções do byte 4 (bits altos), na mesma ordem do app oficial.
export const EFEITOS = [
  { id: 0, nome: "Desligado", cor: false, velocidade: false },
  { id: 1, nome: "Sempre aceso", velocidade: false },
  { id: 2, nome: "Respiração" },
  { id: 3, nome: "Neon", cor: false },
  { id: 4, nome: "Onda", direcoes: ["→ Para a direita", "← Para a esquerda", "↓ Para baixo", "↑ Para cima"] },
  { id: 12, nome: "Onda linear", direcoes: ["→ Para a direita", "← Para a esquerda"] },
  { id: 11, nome: "Caleidoscópio", direcoes: ["Do centro para fora", "De fora para o centro"] },
  { id: 15, nome: "Onda circular", direcoes: ["↺ Anti-horário", "↻ Horário"] },
  { id: 7, nome: "Cobra", direcoes: ["Zigue-zague", "Espiral"] },
  { id: 10, nome: "Onda senoidal" },
  { id: 5, nome: "Ondulação" },
  { id: 6, nome: "Gotas" },
  { id: 9, nome: "Convergência" },
  { id: 8, nome: "Ao pressionar" },
  { id: 19, nome: "Pressionar (apaga)" },
  { id: 14, nome: "Laser" },
  { id: 16, nome: "Ofuscante" },
  { id: 17, nome: "Chuva" },
  { id: 18, nome: "Meteoro" },
  { id: 22, nome: "Ritmo da música", direcoes: ["Vertical", "Separado", "Cruzado"] },
  { id: 13, nome: "Personalizado", cor: false, velocidade: false },
];
const EFEITO_PERSONALIZADO = 13;
const EFEITOS_MUSICA = [20, 22];

// Posições de LED do K86 (128 posições da matriz). Chave = código HID da tecla.
export const INDICE_POR_HID = {
  41: 0, 53: 1, 43: 2, 57: 3, 225: 4, 224: 5, 58: 6, 30: 7, 20: 8, 4: 9, 100: 10, 59: 12, 31: 13,
  26: 14, 22: 15, 29: 16, 227: 17, 60: 18, 32: 19, 8: 20, 7: 21, 27: 22, 226: 23, 61: 24, 33: 25,
  21: 26, 9: 27, 6: 28, 62: 30, 34: 31, 23: 32, 10: 33, 25: 34, 63: 36, 35: 37, 28: 38, 11: 39,
  5: 40, 44: 41, 64: 42, 36: 43, 24: 44, 13: 45, 17: 46, 65: 48, 37: 49, 12: 50, 14: 51, 16: 52,
  66: 54, 38: 55, 18: 56, 15: 57, 54: 58, 230: 59, 67: 60, 39: 61, 19: 62, 51: 63, 55: 64,
  fn: 65, 68: 66, 45: 67, 47: 68, 52: 69, 56: 70, 101: 71, 69: 72, 46: 73, 48: 74, 50: 75,
  229: 76, 228: 77, 42: 79, 49: 80, 40: 81, 80: 83, 70: 84, 73: 85, 76: 86, 72: 87, 82: 88,
  81: 89, 71: 90, 74: 91, 77: 92, 75: 93, 78: 94, 79: 95,
};
const TOTAL_LEDS = 128;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const checksum = (pacote, posicao) => {
  let soma = 0;
  for (let i = 0; i < posicao; i++) soma += pacote[i];
  return (0xff - (soma & 0xff)) & 0xff;
};

const rgbDeHex = (hex) => {
  const n = parseInt(String(hex).replace("#", ""), 16) || 0;
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

export class TecladoNaoEncontrado extends Error {}

export class K86 {
  #dispositivo = null;
  #fila = Promise.resolve();

  // Serializa o acesso: o teclado responde um comando por vez.
  #exclusivo(tarefa) {
    const resultado = this.#fila.then(tarefa, tarefa);
    this.#fila = resultado.catch(() => {});
    return resultado;
  }

  #abrir() {
    if (this.#dispositivo) return this.#dispositivo;
    const info = HID.devices(VID, PID).find((d) => d.usagePage === 0xffff && d.interface === 2);
    if (!info) throw new TecladoNaoEncontrado("Teclado K86 não encontrado. Ele está conectado pelo cabo USB?");
    this.#dispositivo = new HID.HID(info.path);
    return this.#dispositivo;
  }

  #fechar() {
    try { this.#dispositivo?.close(); } catch {}
    this.#dispositivo = null;
  }

  #montar(bytes, posicaoChecksum) {
    const pacote = new Array(64).fill(0);
    bytes.forEach((v, i) => { pacote[i] = v & 0xff; });
    if (posicaoChecksum !== null) pacote[posicaoChecksum] = checksum(pacote, posicaoChecksum);
    return pacote;
  }

  #enviarCru(bytes, posicaoChecksum = BIT7) {
    try {
      this.#abrir().sendFeatureReport([0x00, ...this.#montar(bytes, posicaoChecksum)]);
    } catch (e) {
      this.#fechar();
      throw e instanceof TecladoNaoEncontrado ? e : new Error(`Falha ao falar com o teclado: ${e.message}`);
    }
  }

  async #consultarCru(bytes, espera = 60) {
    this.#enviarCru(bytes, BIT7);
    await esperar(espera);
    try {
      return [...this.#abrir().getFeatureReport(0x00, 65)].slice(1);
    } catch (e) {
      this.#fechar();
      throw new Error(`Falha ao ler do teclado: ${e.message}`);
    }
  }

  conectado() {
    return HID.devices(VID, PID).some((d) => d.usagePage === 0xffff && d.interface === 2);
  }

  versao() {
    return this.#exclusivo(async () => {
      const r = await this.#consultarCru([0x80]);
      if (r[0] !== 0x80) return null;
      const v = (r[2] << 8) | r[1];
      return `${v >> 8}.${(v & 0xff).toString(16).padStart(2, "0")}`;
    });
  }

  lerLuz() {
    return this.#exclusivo(async () => {
      const r = await this.#consultarCru([0x87]);
      if (r[0] !== 0x87) return null;
      const modo = r[4] & 0x0f;
      return {
        efeito: r[1],
        opcao: r[4] >> 4,
        velocidade: VELOCIDADE_MAX - r[2],
        brilho: r[3],
        arcoIris: modo === MODO_ARCO_IRIS,
        cor: "#" + [r[5], r[6], r[7]].map((b) => b.toString(16).padStart(2, "0")).join(""),
      };
    });
  }

  #pacoteLuz({ efeito, velocidade = 3, brilho = 4, arcoIris = false, cor = "#ffffff", opcao = 0 }) {
    opcao = Math.max(0, Math.min((EFEITOS.find((e) => e.id === efeito)?.direcoes?.length ?? 1) - 1, opcao | 0));
    let modo = (opcao << 4) | (arcoIris ? MODO_ARCO_IRIS : MODO_COR_FIXA);
    if (EFEITOS_MUSICA.includes(efeito)) modo = (opcao << 4) | (arcoIris ? 0 : 4);
    if (efeito === EFEITO_PERSONALIZADO) modo = opcao << 4;
    let [r, g, b] = rgbDeHex(cor);
    if (r === 255 && g === 255 && b === 255) [r, g, b] = [0xfa, 0xff, 0xfa]; // o app oficial evita branco puro
    if (efeito === EFEITO_PERSONALIZADO) [r, g, b] = [0, 200, 200];
    return [0x07, efeito, VELOCIDADE_MAX - velocidade, brilho, modo, r, g, b];
  }

  definirLuz(config) {
    return this.#exclusivo(async () => {
      this.#enviarCru(this.#pacoteLuz(config), BIT8);
      await esperar(300);
      return true;
    });
  }

  // cores: { codigoHID: "#rrggbb" }
  definirCoresPorTecla(cores, { brilho = 4 } = {}) {
    return this.#exclusivo(async () => {
      const buffer = new Array(TOTAL_LEDS * 3).fill(0);
      for (const [hid, cor] of Object.entries(cores)) {
        const indice = INDICE_POR_HID[hid];
        if (indice === undefined) continue;
        buffer.splice(indice * 3, 3, ...rgbDeHex(cor));
      }
      const tamanho = 64 * Math.floor((TOTAL_LEDS * 3) / 64);
      for (let bloco = 0; bloco < 7; bloco++) {
        const dados = buffer.slice(bloco * 56, bloco * 56 + 56);
        while (dados.length < 56) dados.push(0);
        this.#enviarCru([0x0c, 0, tamanho & 0xff, tamanho >> 8, bloco, 0, 0, 0, ...dados], BIT7);
        await esperar(5);
      }
      await esperar(200);
      this.#enviarCru(this.#pacoteLuz({ efeito: EFEITO_PERSONALIZADO, brilho, velocidade: 3 }), BIT8);
      await esperar(300);
      return true;
    });
  }

  acertarRelogio(data = new Date()) {
    return this.#exclusivo(async () => {
      const ano = data.getFullYear();
      const p = new Array(15).fill(0);
      p[0] = 0x28;
      p[8] = ano >> 8; p[9] = ano & 0xff; p[10] = data.getMonth() + 1; p[11] = data.getDate();
      p[12] = data.getHours(); p[13] = data.getMinutes(); p[14] = data.getSeconds();
      this.#enviarCru(p, BIT7);
      return true;
    });
  }

  // info: { discoLivreGB, discoTotalGB, ramUsadaGB, ramTotalGB, cpuPorcento, cpuTemperatura, redeSubidaGB, redeDescidaGB }
  enviarInfoSistema(info) {
    return this.#exclusivo(async () => {
      const p = new Array(22).fill(0);
      const u16 = (pos, v) => { const n = Math.max(0, Math.min(0xffff, Math.round(v || 0))); p[pos] = n & 0xff; p[pos + 1] = n >> 8; };
      p[0] = 0x22;
      u16(8, info.discoLivreGB); u16(10, info.discoTotalGB); u16(12, info.ramUsadaGB); u16(14, info.ramTotalGB);
      p[16] = Math.max(0, Math.min(100, Math.round(info.cpuPorcento || 0)));
      p[17] = Math.max(0, Math.min(255, Math.round(info.cpuTemperatura || 0)));
      u16(18, info.redeSubidaGB); u16(20, info.redeDescidaGB);
      this.#enviarCru(p, BIT7);
      return true;
    });
  }

  // quadros: array de Uint8Array RGB (240*135*3 cada). atraso: milissegundos por quadro, 1–255.
  enviarAnimacao(quadros, atraso = 50, aoProgredir = () => {}) {
    return this.#exclusivo(async () => {
      if (quadros.length === 0) throw new Error("Nenhuma imagem para enviar.");
      if (quadros.length > MAX_QUADROS) throw new Error(`Máximo de ${MAX_QUADROS} quadros.`);
      const area = areaUtil(quadros);
      const dados = quadros.map((q) => paraRgb565PorColuna(q, area));
      const tamanho = dados[0].length;
      const total = quadros.length;
      const preparo = new Array(19).fill(0);
      preparo[0] = 0xa5; preparo[1] = 0; preparo[2] = total; preparo[3] = atraso;
      preparo[4] = tamanho & 0xff; preparo[5] = (tamanho >> 8) & 0xff;
      preparo[8] = area.esquerda & 0xff; preparo[9] = area.topo & 0xff;
      preparo[10] = area.direita & 0xff; preparo[11] = area.base & 0xff;
      preparo[12] = area.esquerda >> 8; preparo[13] = area.topo >> 8;
      preparo[14] = area.direita >> 8; preparo[15] = area.base >> 8;
      preparo[16] = (tamanho >> 16) & 0xff; preparo[17] = (tamanho >> 24) & 0xff;

      let pronto = false;
      for (let tentativa = 0; tentativa < 50 && !pronto; tentativa++) {
        const r = await this.#consultarCru(preparo, 100);
        pronto = r[0] === 0xa5 && r[1] === 1;
        if (!pronto) await esperar(200);
      }
      if (!pronto) throw new Error("O teclado não aceitou iniciar a transferência da tela.");
      await esperar(100);

      for (let q = 0; q < total; q++) {
        const blocos = Math.ceil(dados[q].length / 56);
        for (let b = 0; b < blocos; b++) {
          const pedaco = dados[q].subarray(b * 56, b * 56 + 56);
          const util = pedaco.length;
          const corpo = [...pedaco];
          while (corpo.length < 56) corpo.push(0);
          this.#enviarCru([0x25, q, total, atraso, b & 0xff, b >> 8, util, 0, ...corpo], BIT7);
          if (b % 40 === 0) {
            aoProgredir((q + b / blocos) / total);
            await esperar(1);
          }
        }
      }
      aoProgredir(1);
      return true;
    });
  }
}

// Retângulo que contém todos os pixels não pretos de todos os quadros (como o app oficial faz).
export const areaUtil = (quadros) => {
  const { largura, altura } = TELA;
  let esquerda = largura, topo = altura, direita = -1, base = -1;
  for (const q of quadros) {
    for (let y = 0; y < altura; y++) {
      for (let x = 0; x < largura; x++) {
        const i = (y * largura + x) * 3;
        if (q[i] | q[i + 1] | q[i + 2]) {
          if (x < esquerda) esquerda = x;
          if (x > direita) direita = x;
          if (y < topo) topo = y;
          if (y > base) base = y;
        }
      }
    }
  }
  if (direita < 0) return { esquerda: 0, topo: 0, direita: largura, base: altura };
  return { esquerda, topo, direita: direita + 1, base: base + 1 };
};

export const paraRgb565PorColuna = (q, area) => {
  const { largura } = TELA;
  const saida = new Uint8Array((area.direita - area.esquerda) * (area.base - area.topo) * 2);
  let o = 0;
  for (let x = area.esquerda; x < area.direita; x++) {
    for (let y = area.topo; y < area.base; y++) {
      const i = (y * largura + x) * 3;
      const v = ((q[i] & 0xf8) << 8) | ((q[i + 1] & 0xfc) << 3) | (q[i + 2] >> 3);
      saida[o++] = v >> 8;
      saida[o++] = v & 0xff;
    }
  }
  return saida;
};
