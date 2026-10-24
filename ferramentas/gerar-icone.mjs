// Gera icone.png (256x256): quadrado arredondado azul com um teclado estilizado.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const T = 256;
const px = new Uint8Array(T * T * 4);

const dentroArredondado = (x, y, x0, y0, x1, y1, r) => {
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
};
// Cobertura com 4x4 amostras para bordas suaves.
const cobertura = (x, y, ...forma) => {
  let n = 0;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (dentroArredondado(x + (i + 0.5) / 4, y + (j + 0.5) / 4, ...forma)) n++;
  return n / 16;
};
const misturar = (i, [r, g, b], a) => {
  const ai = px[i + 3] / 255;
  const ao = a + ai * (1 - a);
  if (ao === 0) return;
  px[i] = (r * a + px[i] * ai * (1 - a)) / ao;
  px[i + 1] = (g * a + px[i + 1] * ai * (1 - a)) / ao;
  px[i + 2] = (b * a + px[i + 2] * ai * (1 - a)) / ao;
  px[i + 3] = ao * 255;
};

const teclas = [];
const linhas = [[0, 12], [0.5, 11], [1, 10]];
linhas.forEach(([recuo, qtd], l) => {
  for (let k = 0; k < qtd; k++) teclas.push([44 + (recuo + k) * 14.4, 92 + l * 22, 11.5, 17]);
});
teclas.push([80, 158, 96, 17]); // espaço

const arcoIris = (t) => {
  const h = t * 300;
  const f = (n) => { const k = (n + h / 30) % 12; return 255 * (0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
  return [f(0), f(8), f(4)];
};

for (let y = 0; y < T; y++) {
  for (let x = 0; x < T; x++) {
    const i = (y * T + x) * 4;
    const fundo = cobertura(x, y, 8, 8, 248, 248, 52);
    if (fundo > 0) {
      const t = (x + y) / (2 * T);
      misturar(i, [40 + 30 * t, 70 + 40 * t, 200 + 40 * t], fundo);
    }
    const corpo = cobertura(x, y, 30, 78, 226, 190, 16);
    if (corpo > 0) misturar(i, [22, 26, 38], corpo);
    for (const [tx, ty, tw, th] of teclas) {
      const c = cobertura(x, y, tx, ty, tx + tw, ty + th, 3);
      if (c > 0) misturar(i, arcoIris((tx - 44) / 180), c);
    }
  }
}

const crc = (buf) => {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};
const bloco = (tipo, dados) => {
  const t = Buffer.from(tipo, "ascii");
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, c]);
};
const linhasPng = Buffer.alloc(T * (T * 4 + 1));
for (let y = 0; y < T; y++) {
  linhasPng[y * (T * 4 + 1)] = 0;
  Buffer.from(px.buffer, y * T * 4, T * 4).copy(linhasPng, y * (T * 4 + 1) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(T, 0); ihdr.writeUInt32BE(T, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloco("IHDR", ihdr), bloco("IDAT", deflateSync(linhasPng)), bloco("IEND", Buffer.alloc(0)),
]);
writeFileSync(new URL("../icone.png", import.meta.url), png);
console.log("icone.png gerado");
