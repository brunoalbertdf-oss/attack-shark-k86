// App de Windows (Electron): sobe o servidor local dentro do próprio app e abre a janela.
import { app, BrowserWindow, Menu, shell, dialog, session, desktopCapturer } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pasta = path.dirname(fileURLToPath(import.meta.url));
let janela = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!janela) return;
    if (janela.isMinimized()) janela.restore();
    janela.focus();
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    let endereco;
    try {
      const { iniciarServidor } = await import("./servidor.mjs");
      endereco = await iniciarServidor(0);
    } catch (e) {
      dialog.showErrorBox("Attack Shark K86",`Não foi possível iniciar o app.\n\n${e.message}`);
      app.quit();
      return;
    }

    // "Ritmo da música": a página pede o som do PC (loopback do Windows), como o driver oficial faz.
    // Só a nossa página local recebe a permissão; o vídeo da tela é descartado na hora pela página.
    session.defaultSession.setDisplayMediaRequestHandler(async (pedido, responder) => {
      if (!pedido.securityOrigin || !endereco.startsWith(pedido.securityOrigin)) { responder({}); return; }
      try {
        const [tela] = await desktopCapturer.getSources({ types: ["screen"] });
        responder(tela ? { video: tela, audio: "loopback" } : {});
      } catch {
        responder({});
      }
    });

    janela = new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 760,
      minHeight: 560,
      title: "Attack Shark K86",
      icon: path.join(pasta, "icone.png"),
      backgroundColor: "#0f1117",
      autoHideMenuBar: true,
      show: false,
      // backgroundThrottling: o ritmo da música continua com a janela minimizada.
      webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
    });
    janela.once("ready-to-show", () => janela.show());
    // Links externos abrem no navegador, não dentro do app.
    janela.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: "deny" };
    });
    janela.on("closed", () => { janela = null; });
    janela.loadURL(endereco);
  });

  app.on("window-all-closed", () => app.quit());
}
