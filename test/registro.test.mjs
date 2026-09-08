/* Sanidade do registro de cartoes: erro aqui derruba o cartao impresso. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gerarQr } from "../public/assets/qr.js";

const registro = JSON.parse(
  readFileSync(new URL("../public/data/cards.json", import.meta.url), "utf8"),
);

test("o registro tem marca, config e cartoes", () => {
  assert.ok(registro.marca?.nome);
  assert.ok(registro.marca?.dominioAvaliacao?.startsWith("https://"));
  assert.ok(Array.isArray(registro.cartoes) && registro.cartoes.length > 0);
});

test("a nota minima para o Google fica entre 1 e 5", () => {
  const minima = registro.config.notaMinimaParaGoogle;
  assert.ok(Number.isInteger(minima) && minima >= 1 && minima <= 5);
});

test("os ids sao unicos e seguros para URL", () => {
  const vistos = new Set();
  for (const cartao of registro.cartoes) {
    assert.match(cartao.id, /^[a-z0-9_-]{2,64}$/, `id invalido: ${cartao.id}`);
    assert.ok(!vistos.has(cartao.id), `id repetido: ${cartao.id}`);
    vistos.add(cartao.id);
  }
});

test("todo cartao tem loja, WhatsApp e e-mail", () => {
  for (const cartao of registro.cartoes) {
    assert.ok(cartao.loja, `${cartao.id} sem loja`);
    assert.match(String(cartao.whatsapp), /^\d{12,15}$/, `${cartao.id}: WhatsApp com DDI e DDD`);
    assert.match(String(cartao.email), /^[^\s@]+@[^\s@]+\.[^\s@]+$/, `${cartao.id}: e-mail`);
  }
});

test("a URL de cada cartao cabe em um QR Code", () => {
  const base = registro.marca.dominioAvaliacao.replace(/\/+$/, "");
  for (const cartao of registro.cartoes) {
    const url = `${base}/${cartao.id}`;
    const qr = gerarQr(url);
    assert.ok(qr.versao <= 6, `${cartao.id}: QR grande demais para o cartao (v${qr.versao})`);
  }
});

test("o link do Google aponta para o formulario de avaliacao", () => {
  for (const cartao of registro.cartoes) {
    assert.match(
      cartao.googleReviewUrl,
      /^https:\/\/(search\.google\.com\/local\/writereview|g\.page\/r\/|www\.google\.com\/maps)/,
      `${cartao.id}: link do Google fora do formato esperado`,
    );
  }
});
