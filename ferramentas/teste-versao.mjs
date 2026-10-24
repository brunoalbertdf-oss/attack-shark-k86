// Teste SOMENTE LEITURA: envia GET_REV (0x80) e lê a resposta.
// Não altera nada no teclado.
import HID from "node-hid";

const VID = 0x3151, PID = 0x4015;
const checksumBit7 = (buf) => {
  let s = 0;
  for (let i = 0; i < 7; i++) s += buf[i];
  return (0xff - (s & 0xff)) & 0xff;
};

const alvos = HID.devices(VID, PID).filter((d) => d.usagePage === 0xffff);
for (const d of alvos) {
  const rotulo = `MI_0${d.interface} usage=${d.usage}`;
  let dev;
  try {
    dev = new HID.HID(d.path);
    const msg = new Array(64).fill(0);
    msg[0] = 0x80;
    msg[7] = checksumBit7(msg);
    dev.sendFeatureReport([0x00, ...msg]); // report ID 0
    await new Promise((r) => setTimeout(r, 50));
    const resp = dev.getFeatureReport(0x00, 65);
    const hex = [...resp.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    console.log(`${rotulo}: resposta ${hex}`);
  } catch (e) {
    console.log(`${rotulo}: erro ${e.message}`);
  } finally {
    dev?.close();
  }
}
