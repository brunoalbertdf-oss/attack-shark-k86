// Testa a reamostragem de GIF (planejarAnimacao, copiada de public/app.js) com casos sintéticos.
import { readFileSync } from "node:fs";

const fonte = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const trecho = fonte.slice(fonte.indexOf("const DURACAO_MAX_MS"), fonte.indexOf("const desenharFonte"));
const { planejarAnimacao } = new Function(`${trecho.replace(/^let .*$/gm, "")}; return { planejarAnimacao };`)();

const MAX = 106, ATRASO_MAX = 255;
const casos = [
  ["GIF de 15 s, 150 quadros de 100 ms", Array(150).fill(100), 1],
  ["GIF de 5 s, 50 quadros de 100 ms", Array(50).fill(100), 1],
  ["GIF de 15 s, 375 quadros de 40 ms", Array(375).fill(40), 1],
  ["GIF de 25 s (deve cortar em 15 s)", Array(250).fill(100), 1],
  ["GIF de 3 s, 10 quadros de 300 ms", Array(10).fill(300), 1],
  ["GIF de 15 s em 2x", Array(150).fill(100), 2],
  ["GIF de 8 s em 0,5x", Array(80).fill(100), 0.5],
];
let falhas = 0;
for (const [nome, duracoes, fator] of casos) {
  const p = planejarAnimacao(duracoes.map((duracao) => ({ duracao })), MAX, ATRASO_MAX, fator);
  const tocado = p.indices.length * p.atraso;
  const esperado = Math.min(duracoes.reduce((a, b) => a + b, 0) / fator, 15000);
  const ok = p.indices.length <= MAX && p.atraso >= 1 && p.atraso <= ATRASO_MAX
    && Math.abs(tocado - esperado) / esperado < 0.05
    && p.indices.every((v, i, a) => i === 0 || v >= a[i - 1]);
  if (!ok) falhas++;
  console.log(`${ok ? "OK  " : "FALHA"} ${nome}: ${p.indices.length} quadros × ${p.atraso} ms = ${(tocado / 1000).toFixed(2)} s (esperado ${(esperado / 1000).toFixed(2)} s)${p.cortado ? ", cortado" : ""}`);
}
process.exitCode = falhas ? 1 : 0;
