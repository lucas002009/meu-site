/* Regressao do gerador de QR Code.
   As matrizes esperadas em qr.fixtures.json foram confirmadas por um
   decodificador independente (jsQR) quando o arquivo foi gerado.
   Rode com: npm test                                            */

import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gerarQr, svgDoQr } from "../public/assets/qr.js";

const fixtures = JSON.parse(
  readFileSync(new URL("./qr.fixtures.json", import.meta.url), "utf8"),
);

function impressao(modulos) {
  const bits = modulos.map((l) => l.map((m) => (m ? "1" : "0")).join("")).join("");
  return createHash("sha256").update(bits).digest("hex");
}

test("cada fixture gera exatamente a mesma matriz", () => {
  for (const caso of fixtures.casos) {
    const resultado = gerarQr(caso.texto);
    const rotulo = `${caso.texto.slice(0, 24)} (${caso.texto.length} bytes)`;
    assert.equal(resultado.versao, caso.versao, `versao — ${rotulo}`);
    assert.equal(resultado.tamanho, caso.tamanho, `tamanho — ${rotulo}`);
    assert.equal(resultado.mascara, caso.mascara, `mascara — ${rotulo}`);
    assert.equal(impressao(resultado.modulos), caso.sha256, `matriz — ${rotulo}`);
  }
});

test("as versoes 1 a 10 estao cobertas pelas fixtures", () => {
  const versoes = new Set(fixtures.casos.map((c) => c.versao));
  for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.ok(versoes.has(v), `falta fixture para a versao ${v}`);
  }
});

test("padroes de localizacao ficam nos tres cantos", () => {
  const { modulos, tamanho } = gerarQr("https://review.ouzadia.com/abc123");
  const cantos = [[0, 0], [0, tamanho - 7], [tamanho - 7, 0]];
  for (const [linha, coluna] of cantos) {
    assert.equal(modulos[linha][coluna], true, "canto externo escuro");
    assert.equal(modulos[linha + 1][coluna + 1], false, "anel claro");
    assert.equal(modulos[linha + 3][coluna + 3], true, "centro escuro");
  }
});

test("padroes de tempo alternam", () => {
  const { modulos, tamanho } = gerarQr("OUZADIA");
  for (let i = 8; i < tamanho - 8; i++) {
    assert.equal(modulos[6][i], i % 2 === 0, `tempo horizontal em ${i}`);
    assert.equal(modulos[i][6], i % 2 === 0, `tempo vertical em ${i}`);
  }
});

test("modulo obrigatoriamente escuro esta presente", () => {
  const { modulos, tamanho } = gerarQr("OUZADIA");
  assert.equal(modulos[tamanho - 8][8], true);
});

test("acentos e simbolos sobrevivem em UTF-8", () => {
  const resultado = gerarQr("São Luís — MA ✦");
  assert.ok(resultado.tamanho >= 21);
});

test("texto acima da capacidade e recusado com mensagem clara", () => {
  assert.throws(() => gerarQr("q".repeat(400)), /longo demais/i);
});

test("svgDoQr devolve um SVG bem formado", () => {
  const svg = svgDoQr("https://review.ouzadia.com/abc123", { modulo: 6, margem: 2 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /<path d="M/);
  assert.match(svg, /<\/svg>$/);
  assert.equal((svg.match(/<svg/g) || []).length, 1);
});
