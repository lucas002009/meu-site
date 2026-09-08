/* Regras de validacao do feedback privado. */

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizarFeedback, resumo } from "../lib/feedback.js";

const base = {
  cartao: "abc123",
  loja: "Ouzadia Shopping da Ilha",
  nota: 3,
  mensagem: "A peca que eu queria estava sem estoque.",
};

test("aceita um feedback completo", () => {
  const saida = sanitizarFeedback({ ...base, nome: "Maria", contato: "98991234567" });
  assert.equal(saida.nota, 3);
  assert.equal(saida.nome, "Maria");
  assert.ok(saida.recebidoEm);
});

test("recusa nota fora de 1 a 5", () => {
  for (const nota of [0, 6, -1, 2.5, "tres", null, undefined, NaN]) {
    assert.equal(sanitizarFeedback({ ...base, nota }), null, `nota ${nota}`);
  }
});

test("recusa mensagem curta demais ou vazia", () => {
  for (const mensagem of ["", "  ", "oi", null, undefined]) {
    assert.equal(sanitizarFeedback({ ...base, mensagem }), null);
  }
});

test("recusa corpo que nao e objeto", () => {
  for (const bruto of [null, undefined, "texto", 42]) {
    assert.equal(sanitizarFeedback(bruto), null);
  }
});

test("normaliza o id do cartao", () => {
  const saida = sanitizarFeedback({ ...base, cartao: "  ABC-123!! " });
  assert.equal(saida.cartao, "abc-123");
});

test("corta campos muito longos", () => {
  const saida = sanitizarFeedback({
    ...base,
    mensagem: "m".repeat(9000),
    nome: "n".repeat(500),
    contato: "c".repeat(500),
  });
  assert.equal(saida.mensagem.length, 4000);
  assert.equal(saida.nome.length, 120);
  assert.equal(saida.contato.length, 160);
});

test("limita a quantidade de motivos e descarta vazios", () => {
  const saida = sanitizarFeedback({
    ...base,
    motivos: [...Array(30).keys()].map(String).concat(["", "   "]),
  });
  assert.ok(saida.motivos.length <= 10);
  assert.ok(saida.motivos.every((m) => m.length > 0));
});

test("motivos em formato invalido viram lista vazia", () => {
  assert.deepEqual(sanitizarFeedback({ ...base, motivos: "atendimento" }).motivos, []);
  assert.deepEqual(sanitizarFeedback({ ...base, motivos: null }).motivos, []);
});

test("resumo descreve nota e loja", () => {
  const saida = sanitizarFeedback(base);
  assert.equal(resumo(saida), "3 estrelas — Ouzadia Shopping da Ilha");
});
