/* ==========================================================
   Ouzadia — gerador de QR Code (sem dependencias)

   Modo byte (UTF-8), correcao de erro nivel M (~15%),
   versoes 1 a 10 — ate 213 caracteres, folga de sobra para
   uma URL como https://review.ouzadia.com/abc123

   Referencia: ISO/IEC 18004.
   ========================================================== */

/* ---------- Campo de Galois GF(256), polinomio 0x11D ---------- */

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function iniciarCampo() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function multiplicar(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** Polinomio gerador de grau `grau` para Reed-Solomon. */
function polinomioGerador(grau) {
  let poly = [1];
  for (let i = 0; i < grau; i++) {
    const novo = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      novo[j] ^= poly[j];                       // termo x
      novo[j + 1] ^= multiplicar(poly[j], EXP[i]); // termo alfa^i
    }
    poly = novo;
  }
  return poly;
}

/** Codewords de correcao de erro para um bloco de dados. */
function correcaoDeErro(dados, quantidade) {
  const gerador = polinomioGerador(quantidade);
  const resto = new Uint8Array(dados.length + quantidade);
  resto.set(dados);
  for (let i = 0; i < dados.length; i++) {
    const coeficiente = resto[i];
    if (coeficiente === 0) continue;
    for (let j = 0; j < gerador.length; j++) {
      resto[i + j] ^= multiplicar(gerador[j], coeficiente);
    }
  }
  return resto.slice(dados.length);
}

/* ---------- Tabelas por versao (nivel M) ---------- */

// [ecPorBloco, blocosGrupo1, dadosGrupo1, blocosGrupo2, dadosGrupo2]
const BLOCOS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44],
};

const ALINHAMENTO = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
};

const VERSAO_MAXIMA = 10;

function capacidadeDeDados(versao) {
  const [, b1, d1, b2, d2] = BLOCOS_M[versao];
  return b1 * d1 + b2 * d2;
}

/** Menor versao que comporta `bytes` em modo byte. */
function escolherVersao(bytes) {
  for (let versao = 1; versao <= VERSAO_MAXIMA; versao++) {
    const bitsCabecalho = 4 + (versao < 10 ? 8 : 16);
    if (capacidadeDeDados(versao) * 8 >= bitsCabecalho + bytes * 8) return versao;
  }
  throw new Error(
    `Texto longo demais para QR Code nivel M ate a versao ${VERSAO_MAXIMA} (${bytes} bytes).`,
  );
}

/* ---------- Montagem do fluxo de bits ---------- */

function montarCodewords(bytes, versao) {
  const bits = [];
  const empurrar = (valor, tamanho) => {
    for (let i = tamanho - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };

  empurrar(0b0100, 4);                              // modo byte
  empurrar(bytes.length, versao < 10 ? 8 : 16);     // contagem
  for (const b of bytes) empurrar(b, 8);

  const totalDados = capacidadeDeDados(versao);
  const limite = totalDados * 8;

  // Terminador de ate 4 bits
  for (let i = 0; i < 4 && bits.length < limite; i++) bits.push(0);
  // Completa o byte corrente
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let valor = 0;
    for (let j = 0; j < 8; j++) valor = (valor << 1) | bits[i + j];
    codewords.push(valor);
  }
  // Preenchimento alternado 0xEC / 0x11
  const enchimento = [0xec, 0x11];
  let indice = 0;
  while (codewords.length < totalDados) codewords.push(enchimento[indice++ % 2]);

  return codewords;
}

/** Divide em blocos, calcula a correcao e intercala tudo. */
function intercalar(codewords, versao) {
  const [ec, blocos1, dados1, blocos2, dados2] = BLOCOS_M[versao];

  const blocosDados = [];
  const blocosEc = [];
  let posicao = 0;

  const adicionar = (quantidade, tamanho) => {
    for (let i = 0; i < quantidade; i++) {
      const pedaco = codewords.slice(posicao, posicao + tamanho);
      posicao += tamanho;
      blocosDados.push(pedaco);
      blocosEc.push(correcaoDeErro(Uint8Array.from(pedaco), ec));
    }
  };

  adicionar(blocos1, dados1);
  adicionar(blocos2, dados2);

  const saida = [];
  const maiorDados = Math.max(dados1, dados2);
  for (let i = 0; i < maiorDados; i++) {
    for (const bloco of blocosDados) if (i < bloco.length) saida.push(bloco[i]);
  }
  for (let i = 0; i < ec; i++) {
    for (const bloco of blocosEc) saida.push(bloco[i]);
  }
  return saida;
}

/* ---------- Matriz ---------- */

function comprimentoEmBits(valor) {
  let n = 0;
  while (valor !== 0) { n++; valor >>>= 1; }
  return n;
}

function bchFormato(dados) {
  let d = dados << 10;
  while (comprimentoEmBits(d) - comprimentoEmBits(0x537) >= 0) {
    d ^= 0x537 << (comprimentoEmBits(d) - comprimentoEmBits(0x537));
  }
  return ((dados << 10) | d) ^ 0x5412;
}

function bchVersao(versao) {
  let d = versao << 12;
  while (comprimentoEmBits(d) - comprimentoEmBits(0x1f25) >= 0) {
    d ^= 0x1f25 << (comprimentoEmBits(d) - comprimentoEmBits(0x1f25));
  }
  return (versao << 12) | d;
}

function novaMatriz(tamanho, valor) {
  return Array.from({ length: tamanho }, () => new Array(tamanho).fill(valor));
}

function desenharFinder(matriz, reservado, linha, coluna) {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const y = linha + r;
      const x = coluna + c;
      if (y < 0 || y >= matriz.length || x < 0 || x >= matriz.length) continue;
      const borda = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                    (c >= 0 && c <= 6 && (r === 0 || r === 6));
      const centro = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      matriz[y][x] = borda || centro;
      reservado[y][x] = true;
    }
  }
}

function desenharAlinhamento(matriz, reservado, versao) {
  const centros = ALINHAMENTO[versao];
  const ultimo = centros[centros.length - 1];
  for (const linha of centros) {
    for (const coluna of centros) {
      const sobreFinder =
        (linha === 6 && coluna === 6) ||
        (linha === 6 && coluna === ultimo) ||
        (linha === ultimo && coluna === 6);
      if (sobreFinder) continue;
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          matriz[linha + r][coluna + c] =
            Math.max(Math.abs(r), Math.abs(c)) !== 1;
          reservado[linha + r][coluna + c] = true;
        }
      }
    }
  }
}

function desenharEstrutura(versao) {
  const tamanho = versao * 4 + 17;
  const matriz = novaMatriz(tamanho, false);
  const reservado = novaMatriz(tamanho, false);

  desenharFinder(matriz, reservado, 0, 0);
  desenharFinder(matriz, reservado, 0, tamanho - 7);
  desenharFinder(matriz, reservado, tamanho - 7, 0);
  desenharAlinhamento(matriz, reservado, versao);

  // Padroes de tempo
  for (let i = 8; i < tamanho - 8; i++) {
    const escuro = i % 2 === 0;
    matriz[6][i] = escuro; reservado[6][i] = true;
    matriz[i][6] = escuro; reservado[i][6] = true;
  }

  // Modulo sempre escuro
  matriz[tamanho - 8][8] = true;
  reservado[tamanho - 8][8] = true;

  // Area reservada para o formato
  for (let i = 0; i < 9; i++) {
    if (!reservado[i][8]) reservado[i][8] = true;
    if (!reservado[8][i]) reservado[8][i] = true;
  }
  for (let i = 0; i < 8; i++) {
    reservado[8][tamanho - 1 - i] = true;
    reservado[tamanho - 1 - i][8] = true;
  }

  // Area reservada para a versao (7 em diante)
  if (versao >= 7) {
    for (let i = 0; i < 18; i++) {
      const r = Math.floor(i / 3);
      const c = (i % 3) + tamanho - 11;
      reservado[r][c] = true;
      reservado[c][r] = true;
    }
  }

  return { matriz, reservado, tamanho };
}

function colocarDados(matriz, reservado, codewords) {
  const tamanho = matriz.length;
  const totalBits = codewords.length * 8;
  let indice = 0;
  let direcao = -1;
  let linha = tamanho - 1;

  for (let coluna = tamanho - 1; coluna > 0; coluna -= 2) {
    if (coluna === 6) coluna--; // pula a coluna do padrao de tempo
    for (;;) {
      for (let deslocamento = 0; deslocamento < 2; deslocamento++) {
        const x = coluna - deslocamento;
        if (reservado[linha][x]) continue;
        let escuro = false;
        if (indice < totalBits) {
          const byte = codewords[indice >> 3];
          escuro = ((byte >> (7 - (indice & 7))) & 1) === 1;
          indice++;
        }
        matriz[linha][x] = escuro;
      }
      linha += direcao;
      if (linha < 0 || linha >= tamanho) {
        linha -= direcao;
        direcao = -direcao;
        break;
      }
    }
  }
}

const MASCARAS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function escreverFormato(matriz, mascara) {
  const tamanho = matriz.length;
  const bits = bchFormato((0 << 3) | mascara); // nivel M = 0
  for (let i = 0; i < 15; i++) {
    const escuro = ((bits >> i) & 1) === 1;
    if (i < 6) matriz[i][8] = escuro;
    else if (i < 8) matriz[i + 1][8] = escuro;
    else matriz[tamanho - 15 + i][8] = escuro;

    if (i < 8) matriz[8][tamanho - 1 - i] = escuro;
    else if (i < 9) matriz[8][15 - i] = escuro;
    else matriz[8][14 - i] = escuro;
  }
  matriz[tamanho - 8][8] = true;
}

function escreverVersao(matriz, versao) {
  if (versao < 7) return;
  const tamanho = matriz.length;
  const bits = bchVersao(versao);
  for (let i = 0; i < 18; i++) {
    const escuro = ((bits >> i) & 1) === 1;
    const r = Math.floor(i / 3);
    const c = (i % 3) + tamanho - 11;
    matriz[r][c] = escuro;
    matriz[c][r] = escuro;
  }
}

/* ---------- Avaliacao das mascaras ---------- */

function penalidade(matriz) {
  const n = matriz.length;
  let total = 0;

  // Regra 1: sequencias de 5 ou mais modulos iguais
  for (let i = 0; i < n; i++) {
    let corLinha = matriz[i][0], seqLinha = 1;
    let corColuna = matriz[0][i], seqColuna = 1;
    for (let j = 1; j < n; j++) {
      if (matriz[i][j] === corLinha) seqLinha++;
      else { if (seqLinha >= 5) total += seqLinha - 2; corLinha = matriz[i][j]; seqLinha = 1; }
      if (matriz[j][i] === corColuna) seqColuna++;
      else { if (seqColuna >= 5) total += seqColuna - 2; corColuna = matriz[j][i]; seqColuna = 1; }
    }
    if (seqLinha >= 5) total += seqLinha - 2;
    if (seqColuna >= 5) total += seqColuna - 2;
  }

  // Regra 2: blocos 2x2 da mesma cor
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1; j++) {
      const v = matriz[i][j];
      if (v === matriz[i][j + 1] && v === matriz[i + 1][j] && v === matriz[i + 1][j + 1]) {
        total += 3;
      }
    }
  }

  // Regra 3: padrao 1:1:3:1:1 com area clara
  const alvoA = [true, false, true, true, true, false, true, false, false, false, false];
  const alvoB = [false, false, false, false, true, false, true, true, true, false, true];
  const casa = (pegar, k) => {
    let a = true, b = true;
    for (let d = 0; d < 11; d++) {
      const v = pegar(k + d);
      if (v !== alvoA[d]) a = false;
      if (v !== alvoB[d]) b = false;
      if (!a && !b) return false;
    }
    return a || b;
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j + 11 <= n; j++) {
      if (casa((k) => matriz[i][k], j)) total += 40;
      if (casa((k) => matriz[k][i], j)) total += 40;
    }
  }

  // Regra 4: desequilibrio entre claro e escuro
  let escuros = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (matriz[i][j]) escuros++;
  const porcentagem = (escuros * 100) / (n * n);
  total += Math.floor(Math.abs(porcentagem - 50) / 5) * 10;

  return total;
}

/* ---------- API publica ---------- */

/**
 * Gera a matriz de modulos de um QR Code.
 * @param {string} texto conteudo a codificar
 * @returns {{versao:number, tamanho:number, mascara:number, modulos:boolean[][]}}
 */
export function gerarQr(texto) {
  const bytes = new TextEncoder().encode(String(texto));
  const versao = escolherVersao(bytes.length);
  const codewords = intercalar(montarCodewords(bytes, versao), versao);

  const { matriz: base, reservado } = desenharEstrutura(versao);
  colocarDados(base, reservado, codewords);

  let melhor = null;
  for (let mascara = 0; mascara < 8; mascara++) {
    const teste = base.map((linha) => linha.slice());
    for (let r = 0; r < teste.length; r++) {
      for (let c = 0; c < teste.length; c++) {
        if (!reservado[r][c] && MASCARAS[mascara](r, c)) teste[r][c] = !teste[r][c];
      }
    }
    escreverFormato(teste, mascara);
    escreverVersao(teste, versao);

    const nota = penalidade(teste);
    if (!melhor || nota < melhor.nota) melhor = { nota, mascara, modulos: teste };
  }

  return { versao, tamanho: base.length, mascara: melhor.mascara, modulos: melhor.modulos };
}

/**
 * Converte a matriz em uma string SVG pronta para inserir na pagina.
 */
export function svgDoQr(texto, { modulo = 6, margem = 4, cor = "#06251c", fundo = "#ffffff" } = {}) {
  const { modulos } = gerarQr(texto);
  const n = modulos.length;
  const lado = (n + margem * 2) * modulo;

  let caminho = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modulos[r][c]) continue;
      caminho += `M${(c + margem) * modulo} ${(r + margem) * modulo}h${modulo}v${modulo}h-${modulo}z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" ` +
    `width="${lado}" height="${lado}" shape-rendering="crispEdges" role="img" ` +
    `aria-label="QR Code">` +
    `<rect width="${lado}" height="${lado}" fill="${fundo}"/>` +
    `<path d="${caminho}" fill="${cor}"/></svg>`;
}
