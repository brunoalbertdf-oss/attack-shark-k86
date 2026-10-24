// Servidor local do "Controle K86": serve a interface e fala com o teclado via HID.
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { K86, EFEITOS, TELA, MAX_QUADROS, ATRASO_MAX_MS } from "./k86.mjs";

const PORTA = Number(process.env.PORTA) || 5186;
const PASTA_PUBLICA = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

const teclado = new K86();
const envioTela = { ativo: false, progresso: 0, erro: "", concluido: false };
let infoSistema = { ativo: false, timer: null, cpuAnterior: null };
let versaoConhecida = null;

// Processos do driver oficial (o desinstalador oficial pode deixar o iot_driver rodando).
const PROCESSO_OFICIAL = /^(iot_driver[\w.-]*\.exe|Attack Shark Driver v\d+\.exe)$/i;

const processosOficiais = () => new Promise((resolve) => {
  execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true }, (erro, saida) => {
    if (erro) { resolve([]); return; }
    const nomes = saida.split(/\r?\n/).map((l) => l.split('","')[0]?.replace(/^"/, "")).filter((n) => n && PROCESSO_OFICIAL.test(n));
    resolve([...new Set(nomes)]);
  });
});

const encerrarProcessosOficiais = async () => {
  const nomes = await processosOficiais();
  await Promise.all(nomes.map((n) => new Promise((resolve) => {
    execFile("taskkill", ["/IM", n, "/F"], { windowsHide: true }, () => resolve());
  })));
  return processosOficiais();
};

const usoCpu = () => {
  const agora = os.cpus().reduce((a, c) => {
    const t = c.times;
    a.ocioso += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq;
    return a;
  }, { ocioso: 0, total: 0 });
  const antes = infoSistema.cpuAnterior ?? agora;
  infoSistema.cpuAnterior = agora;
  const total = agora.total - antes.total;
  return total > 0 ? 100 * (1 - (agora.ocioso - antes.ocioso) / total) : 0;
};

const GB = 1024 ** 3;
const coletarInfoSistema = () => {
  let disco = { livre: 0, total: 0 };
  try {
    const s = fs.statfsSync(process.env.SystemDrive ? `${process.env.SystemDrive}\\` : "/");
    disco = { livre: (s.bavail * s.bsize) / GB, total: (s.blocks * s.bsize) / GB };
  } catch {}
  return {
    discoLivreGB: disco.livre, discoTotalGB: disco.total,
    ramUsadaGB: (os.totalmem() - os.freemem()) / GB, ramTotalGB: os.totalmem() / GB,
    cpuPorcento: usoCpu(), cpuTemperatura: 0, redeSubidaGB: 0, redeDescidaGB: 0,
  };
};

const ligarInfoSistema = (ativo) => {
  clearInterval(infoSistema.timer);
  infoSistema.ativo = ativo;
  if (!ativo) return;
  usoCpu();
  infoSistema.timer = setInterval(() => {
    if (envioTela.ativo) return;
    teclado.enviarInfoSistema(coletarInfoSistema()).catch(() => {});
  }, 2000);
};

const lerCorpo = (req, limite = 64 * 1024 * 1024) => new Promise((resolve, reject) => {
  const partes = [];
  let tamanho = 0;
  req.on("data", (p) => {
    tamanho += p.length;
    if (tamanho > limite) { reject(new Error("Arquivo grande demais.")); req.destroy(); return; }
    partes.push(p);
  });
  req.on("end", () => {
    try { resolve(partes.length ? JSON.parse(Buffer.concat(partes).toString("utf8")) : {}); }
    catch { reject(new Error("Pedido inválido.")); }
  });
  req.on("error", reject);
});

const responder = (res, status, corpo) => {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corpo));
};

const rotas = {
  "GET /api/estado": async (_corpo, url) => {
    const conectado = teclado.conectado();
    const ler = conectado && !envioTela.ativo;
    if (ler && (url.searchParams.has("completo") || !versaoConhecida)) versaoConhecida = await teclado.versao().catch(() => null);
    if (!conectado) versaoConhecida = null;
    return {
      conectado,
      versao: versaoConhecida,
      luz: ler && url.searchParams.has("completo") ? await teclado.lerLuz().catch(() => null) : null,
      processosOficiais: await processosOficiais(),
      infoSistemaAtivo: infoSistema.ativo,
      efeitos: EFEITOS, tela: TELA, maxQuadros: MAX_QUADROS, atrasoMaxMs: ATRASO_MAX_MS,
    };
  },
  "POST /api/luz": async (corpo) => teclado.definirLuz(corpo),
  "POST /api/teclas": async (corpo) => teclado.definirCoresPorTecla(corpo.cores ?? {}, { brilho: corpo.brilho }),
  "POST /api/relogio": async () => teclado.acertarRelogio(new Date()),
  "POST /api/encerrar-oficial": async () => {
    const restantes = await encerrarProcessosOficiais();
    if (restantes.length) throw new Error(`Não consegui encerrar: ${restantes.join(", ")}`);
    return true;
  },
  "POST /api/info-sistema": async (corpo) => { ligarInfoSistema(!!corpo.ativo); return infoSistema.ativo; },
  "GET /api/tela/progresso": async () => envioTela,
  "POST /api/tela": async (corpo) => {
    if (envioTela.ativo) throw new Error("Já existe um envio para a tela em andamento.");
    const tamanhoQuadro = TELA.largura * TELA.altura * 3;
    const quadros = (corpo.quadros ?? []).map((b64) => new Uint8Array(Buffer.from(b64, "base64")));
    if (quadros.some((q) => q.length !== tamanhoQuadro)) throw new Error("Imagem com tamanho inesperado.");
    Object.assign(envioTela, { ativo: true, progresso: 0, erro: "", concluido: false });
    teclado.enviarAnimacao(quadros, Math.max(1, Math.min(ATRASO_MAX_MS, Math.round(corpo.atraso ?? 50))), (p) => { envioTela.progresso = p; })
      .then(() => Object.assign(envioTela, { ativo: false, progresso: 1, concluido: true }))
      .catch((e) => Object.assign(envioTela, { ativo: false, erro: e.message }));
    return true;
  },
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rota = rotas[`${req.method} ${url.pathname}`];
  if (rota) {
    try {
      const corpo = req.method === "POST" ? await lerCorpo(req) : {};
      responder(res, 200, { ok: true, dados: await rota(corpo, url) });
    } catch (e) {
      responder(res, 200, { ok: false, erro: e.message });
    }
    return;
  }
  const arquivo = path.normalize(path.join(PASTA_PUBLICA, url.pathname === "/" ? "index.html" : url.pathname));
  if (!arquivo.startsWith(PASTA_PUBLICA) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    res.writeHead(404).end("Não encontrado");
    return;
  }
  res.writeHead(200, { "Content-Type": TIPOS[path.extname(arquivo)] ?? "application/octet-stream" });
  fs.createReadStream(arquivo).pipe(res);
});

// Porta 0 = o sistema escolhe uma livre (usado pelo app Electron).
export const iniciarServidor = (porta = PORTA) => new Promise((resolve, reject) => {
  servidor.once("error", reject);
  servidor.listen(porta, "127.0.0.1", () => resolve(`http://127.0.0.1:${servidor.address().port}`));
});

export const pararServidor = () => {
  ligarInfoSistema(false);
  servidor.close();
};

// Execução direta (desenvolvimento): node servidor.mjs
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  iniciarServidor().then((endereco) => console.log(`Controle K86 rodando em ${endereco}  (Ctrl+C para sair)`));
}
