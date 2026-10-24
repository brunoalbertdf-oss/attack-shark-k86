# Como o protocolo foi descoberto

Este app foi feito sem documentação do fabricante. O protocolo foi levantado analisando o driver oficial
("Attack Shark Driver v4" 3.1.12) com o [REA — Reverse Engineer Anything](https://github.com/morluto/rea),
para fins de **interoperabilidade** com um teclado próprio. Nenhum código do driver oficial faz parte deste repositório.

## 1. Identificar o que é o instalador

O instalador oficial (`.exe` de ~100 MB) foi inspecionado com `rea inspect-artifact`, **sem executá-lo**.
Marcadores no binário (`Nullsoft`, `NSIS`) mostraram que é um instalador NSIS. Extraído com 7-Zip, ele contém
`app-32.7z` — o formato do **electron-builder**, ou seja, o driver é um app Electron.

## 2. Arquitetura do driver

O app instalado não usa `app.asar`: o JavaScript fica legível em `resources/app/dist/js`. Ali estão:

- a interface React, que conversa por **gRPC-web** com `127.0.0.1:3814`;
- o `iot_driver.exe`, um binário **Rust** (tonic + hidapi) que só repassa bytes ao teclado.

A definição do serviço `driver.DriverGrpc` mostrou `sendRawFeature` / `readRawFeature` e um `checkSumType`
(`Bit7`, `Bit8`, `None`). Conclusão: o significado de cada byte está no JavaScript.

## 3. Encontrar o K86 no código

- A tabela de dispositivos lista o K86 como `vid: 12625` (`0x3151`), `pid: 16405` (`0x4015`),
  `name: "yc3121_sg8967_3m_soc"`, tela 240×135.
- Um carregador dinâmico mapeia esse nome para a classe `Yc3121_sg8967_3m_soc`, que herda de `CommonKbYc500`.
- Formatando os módulos minificados (esbuild) foi possível ler cada comando: `FEA_CMD_SET_LEDPARAM = 7`,
  `FEA_CMD_SETTFTLCDDATA = 37`, etc.
- A matriz de teclas do K86 (128 posições × 4 bytes, o 3º byte é o código HID) define onde fica cada LED.

## 4. Confirmar no teclado, com segurança

O checksum é calculado dentro do `iot_driver.exe` (Rust), então foi testado direto no hardware usando
**apenas comandos de leitura**:

1. `0x80` (versão) com o checksum `0xFF − soma` → o teclado respondeu `80 13 01` (firmware 1.13).
2. `0x87` com checksum **errado** → ignorado; com o checksum certo → respondeu o efeito atual.
3. `0x07` (escrita reversível): mudou a luz, leu de volta com `0x87` e restaurou o estado original.

Comandos destrutivos (reset de fábrica, apagar a memória da tela, bootloader) foram identificados e **nunca são usados**.

## 5. Detalhes descobertos depois

- **Direções dos efeitos**: o layout de luz do K86 no driver (`types: [{type: "LightWave", options: [...]}, …]`)
  lista as opções de cada efeito; o índice vai em `[4] >> 4`.
- **GIF na tela**: o atraso é a média das durações dos quadros em **milissegundos** (limite 255);
  o limite de quadros vem da memória da tela (7 MB → 106 quadros).

## Ferramentas usadas

- [REA](https://github.com/morluto/rea) — inspeção estática de artefatos
- 7-Zip — extração do instalador NSIS
- esbuild — formatação do JavaScript minificado
- [node-hid](https://github.com/node-hid/node-hid) — testes de HID

Resultado completo: [PROTOCOLO.md](PROTOCOLO.md).
