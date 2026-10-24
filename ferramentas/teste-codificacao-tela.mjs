// Compara a codificação da tela do nosso app com a lógica do app oficial
// (ri.calculateDataPos + ri.cImageDataToScreenData, modo "16", direção "col").
import { areaUtil, paraRgb565PorColuna, TELA } from "../k86.mjs";

const { largura: L, altura: A } = TELA;
const quadro = new Uint8Array(L * A * 3);
// fundo preto com um retângulo colorido e pixels aleatórios
for (let y = 20; y < 100; y++) for (let x = 30; x < 200; x++) {
  const i = (y * L + x) * 3;
  quadro[i] = (x * 7) & 255; quadro[i + 1] = (y * 13) & 255; quadro[i + 2] = (x ^ y) & 255;
}

// --- referência: mesma lógica do driver oficial, reescrita de forma direta ---
const pixels = [];
for (let p = 0; p < L * A; p++) {
  const [r, g, b] = quadro.subarray(p * 3, p * 3 + 3);
  pixels.push({ x: p % L, y: Math.floor(p / L), rgb: (r << 16) | (g << 8) | b });
}
const xs = pixels.filter((p) => p.rgb !== 0).map((p) => p.x);
const ys = pixels.filter((p) => p.rgb !== 0).map((p) => p.y);
const esq = Math.min(...xs), topo = Math.min(...ys);
const areaOficial = { left: esq, top: topo, right: Math.max(...xs) - esq + 1 + esq, bottom: Math.max(...ys) - topo + 1 + topo };
const oficial = [];
pixels
  .filter((p) => p.x >= areaOficial.left && p.y >= areaOficial.top && p.x < areaOficial.right && p.y < areaOficial.bottom)
  .sort((a, b) => a.x - b.x || a.y - b.y)
  .forEach((p) => {
    const r = (p.rgb >> 16) & 255, g = (p.rgb >> 8) & 255, b = p.rgb & 255;
    const v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
    oficial.push(v >> 8, v & 255);
  });

// --- nossa implementação ---
const area = areaUtil([quadro]);
const nosso = paraRgb565PorColuna(quadro, area);

const mesmaArea = area.esquerda === areaOficial.left && area.topo === areaOficial.top
  && area.direita === areaOficial.right && area.base === areaOficial.bottom;
const mesmosBytes = nosso.length === oficial.length && nosso.every((b, i) => b === oficial[i]);
console.log("área:", area, "oficial:", areaOficial);
console.log("bytes:", nosso.length, "oficial:", oficial.length);
console.log(mesmaArea && mesmosBytes ? "OK — codificação idêntica à do app oficial" : "DIFERENTE");
process.exitCode = mesmaArea && mesmosBytes ? 0 : 1;
