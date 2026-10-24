# Protocolo HID do Attack Shark K86

Documentação do protocolo usado pelo K86 (versão com chip YiChip **yc3121**, VID `0x3151` / PID `0x4015`),
obtida por engenharia reversa do driver oficial "Attack Shark Driver v4" 3.1.12 para fins de interoperabilidade.
Veja [ENGENHARIA-REVERSA.md](ENGENHARIA-REVERSA.md) para o passo a passo.

Legenda de confiança:

- **[confirmado]** testado no teclado (firmware 1.13);
- **[observado]** lido no driver oficial, ainda sem teste direto no teclado.

## Arquitetura do driver oficial

```
Interface (Electron/React)  --gRPC-web 127.0.0.1:3814-->  iot_driver.exe (Rust: tonic + hidapi)  --HID feature report-->  teclado
```

- O `iot_driver.exe` só repassa bytes e calcula o checksum. **Todo o significado dos comandos está no JavaScript** da interface.
- Serviço gRPC `driver.DriverGrpc`: `sendMsg`, `readMsg`, `sendRawFeature`, `readRawFeature`, `watchDevList`, …
  `sendMsg` recebe `msg`, `devicePath` e `checkSumType` (`Bit7`, `Bit8`, `None`).
- O desinstalador oficial pode deixar o `iot_driver_vNNN.exe` rodando em `%APPDATA%\Attack Shark Driver v4`.

## Identificação

| Campo | Valor |
|---|---|
| VID / PID | `0x3151` / `0x4015` **[confirmado]** |
| Interface HID | `MI_02`, usage page `0xFFFF`, usage 2 **[confirmado]** |
| Firmware | `yc3121_sg8967_3m_soc` (ID interno 1168 no driver) |
| Tela | 240 × 135, RGB565 |
| Camadas de teclas | 3 |

O PID `0x4015` é compartilhado por vários modelos. Existe outro "K86" (chip yc3123, PID `0x5002`) com protocolo diferente.

## Formato do pacote

- Feature report de **64 bytes**, report ID `0`. Byte 0 = comando. Leitura = comando de escrita com o bit `0x80` ligado. **[confirmado]**
- Para ler: envia o comando e em seguida lê um feature report (`getFeatureReport`). **[confirmado]**
- Checksum **[confirmado]**: `0xFF - (soma dos bytes anteriores & 0xFF)`
  - `Bit7`: checksum no byte 7 (soma dos bytes 0–6) — a maioria dos comandos;
  - `Bit8`: checksum no byte 8 (soma dos bytes 0–7) — usado por `0x07`;
  - pacotes com checksum errado são **ignorados** pelo firmware.
- Transferências grandes: cabeçalho de 8 bytes + 56 bytes de dados por pacote.

## Comandos

| Cmd | Nome no driver | Checksum | Uso | Status |
|---|---|---|---|---|
| `0x80` | GET_REV | Bit7 | Versão do firmware: `[2]<<8 \| [1]` | confirmado |
| `0x07` / `0x87` | SET/GET_LEDPARAM | Bit8 / Bit7 | Efeito de luz | confirmado |
| `0x0C` / `0x8C` | SET/GET_USERPIC | Bit7 | Cor por tecla | observado |
| `0xA5` | GETTFTLCDDATA | Bit7 | Prepara envio para a tela | confirmado (uso) |
| `0x25` | SETTFTLCDDATA | Bit7 | Pixels da tela | confirmado (uso) |
| `0x28` | SET_OLEDCLOCK | Bit7 | Data e hora | confirmado |
| `0x22` | SET_OLEDOPTION | Bit7 | Dados do PC na tela | observado |
| `0x91` | GET_DEBOUNCE | Bit7 | Debounce (ms) em `[2]` | confirmado |
| `0x27` | SET_OLEDLUANGAGE | Bit7 | Idioma da tela | observado |
| `0x05` / `0x85` | SET/GET_PROFILE | Bit7 | Perfil ativo | observado |
| `0x09` / `0x89` | SET/GET_KEYMATRIX | Bit7 | Remapeamento de teclas | observado |
| `0xAC` | SET_FLASHCHIPERASSE | Bit7 | ⚠️ Apaga a memória da tela | não usar |
| `0x02` | SET_RESET | Bit7 | ⚠️ Reset de fábrica | não usar |
| `0x7F 55 AA 55 AA` | — | Bit7 | ⚠️ Entra no bootloader | não usar |

### `0x07` — efeito de luz [confirmado]

```
[0]=0x07 [1]=efeito [2]=5-velocidade [3]=brilho [4]=(opção<<4)|modoCor [5..7]=R,G,B   checksum Bit8
```

- `velocidade` e `brilho`: 0–4.
- `modoCor`: `8` = arco-íris, `7` = cor única. Efeito 13 (Personalizado): `[4]=opção<<4`, `[5..7]=0,200,200`.
- Branco puro `#FFFFFF` é enviado como `#FAFFFA`.
- `0x87` devolve o mesmo layout (`[2]` = 5-velocidade, `[4]>>4` = opção).

Efeitos liberados pelo driver para o K86 e suas **opções/direções** (`opção` = índice da lista):

| ID | Efeito | Opções |
|---|---|---|
| 0 | Desligado | |
| 1 | Sempre aceso | |
| 2 | Respiração | |
| 3 | Neon | (sem cor) |
| 4 | Onda | 0 direita · 1 esquerda · 2 baixo · 3 cima |
| 5 | Ondulação | |
| 6 | Gotas | |
| 7 | Cobra | 0 zigue-zague · 1 espiral |
| 8 | Ao pressionar | |
| 9 | Convergência | |
| 10 | Onda senoidal | |
| 11 | Caleidoscópio | 0 do centro para fora · 1 de fora para o centro |
| 12 | Onda linear | 0 direita · 1 esquerda |
| 13 | Personalizado | padrão 1–3 |
| 14 | Laser | |
| 15 | Onda circular | 0 anti-horário · 1 horário |
| 16 | Ofuscante | |
| 17 | Chuva | |
| 18 | Meteoro | |
| 19 | Pressionar (apaga) | |
| 22 | Ritmo da música | 0 vertical · 1 separado · 2 cruzado |

### `0x0C` — cor por tecla [observado]

- Buffer RGB de 128 × 3 = 384 bytes; posição de cada tecla = índice na matriz de teclas do K86
  (ver `INDICE_POR_HID` em [`k86.mjs`](../k86.mjs)).
- 7 pacotes: `[0]=0x0C [1]=0 [2..3]=384 [4]=bloco` + 56 bytes. Depois, ativar o efeito 13.

### Tela 240 × 135 [confirmado pelo uso]

1. A imagem é desenhada em 240 × 135. Calcula-se o retângulo que contém todos os pixels **diferentes de preto**
   (em GIFs, a união de todos os quadros).
2. Pixels percorridos **por coluna** (x, depois y), cada um em **RGB565 big-endian** (2 bytes).
3. `0xA5` prepara: `[1]=0 [2]=nº de quadros [3]=atraso [4..5]=tamanho de um quadro (lo)`,
   `[8..11]=esquerda,topo,direita,base (lo) [12..15]=(hi) [16..17]=tamanho (hi)`.
   Repetir até a resposta trazer `[1] == 1`.
4. `0x25` envia cada quadro: `[1]=quadro [2]=nº de quadros [3]=atraso [4..5]=nº do bloco [6]=bytes úteis` + 56 bytes.

- **Atraso**: milissegundos por quadro, 1–255 (o driver usa a média das durações do GIF).
- **Limite de quadros**: o driver calcula `floor((7 MB − 4 KB) / 64 KB) − 5 = 106` quadros para o K86
  (cada quadro de 240×135×2 bytes ocupa 16 páginas de 4 KB).

### `0x28` — relógio [confirmado]

`[8]=ano>>8 [9]=ano&0xFF [10]=mês [11]=dia [12]=hora [13]=minuto [14]=segundo`

### `0x22` — dados do PC [observado]

Valores little-endian: `[8..9]` disco livre (GB) · `[10..11]` disco total · `[12..13]` RAM usada · `[14..15]` RAM total ·
`[16]` CPU % · `[17]` CPU °C · `[18..19]` rede enviada (GB) · `[20..21]` rede recebida (GB).
