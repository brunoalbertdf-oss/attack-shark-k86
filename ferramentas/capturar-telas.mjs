// Gera as imagens do README (docs/img/*.png) abrindo o app de verdade, sem mostrar a janela.
// Uso: npx electron ferramentas/capturar-telas.mjs
import { app, BrowserWindow, nativeTheme } from "electron";
import { mkdirSync, writeFileSync } from "node:fs";

const pasta = new URL("../docs/img/", import.meta.url);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  const { iniciarServidor, pararServidor } = await import("../servidor.mjs");
  const endereco = await iniciarServidor(0);
  const janela = new BrowserWindow({ width: 1180, height: 780, show: false, webPreferences: { offscreen: false } });
  await janela.loadURL(endereco);
  await esperar(2500);
  mkdirSync(pasta, { recursive: true });

  const capturar = async (nome, script) => {
    await janela.webContents.executeJavaScript(`(async () => { ${script} })()`);
    await esperar(1200);
    const imagem = await janela.webContents.capturePage();
    writeFileSync(new URL(`${nome}.png`, pasta), imagem.toPNG());
    console.log(`docs/img/${nome}.png`);
  };

  const esconderAviso = `document.querySelector("#aviso-oficial").hidden = true;`;
  await capturar("luzes", `${esconderAviso} document.querySelector('.aba[data-aba="luzes"]').click(); window.scrollTo(0, 0);`);
  await capturar("teclas", `${esconderAviso} document.querySelector('.aba[data-aba="teclas"]').click();
    document.querySelector("#modelo-arcoiris").click(); window.scrollTo(0, 0);`);
  await capturar("tela", `${esconderAviso} document.querySelector('.aba[data-aba="tela"]').click();
    document.querySelector("#texto-tela").value = "Bom jogo!";
    document.querySelector("#fundo-texto").value = "#1d1b4b";
    document.querySelector("#cor-texto").value = "#7cf3ff";
    document.querySelector("#usar-texto").click(); window.scrollTo(0, 0);`);

  pararServidor();
  app.quit();
});
