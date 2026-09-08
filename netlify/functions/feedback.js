/* ==========================================================
   Ouzadia — funcao serverless de feedback (Netlify)
   Configure FEEDBACK_WEBHOOK nas variaveis de ambiente do site.
   ========================================================== */

import { sanitizarFeedback, encaminharParaWebhook, resumo } from "../../lib/feedback.js";

const cabecalhos = { "Content-Type": "application/json; charset=utf-8" };

export async function handler(evento) {
  if (evento.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { ...cabecalhos, Allow: "POST" },
      body: JSON.stringify({ ok: false, erro: "Metodo nao permitido" }),
    };
  }

  let bruto = null;
  try { bruto = JSON.parse(evento.body || "null"); } catch { bruto = null; }

  const feedback = sanitizarFeedback(bruto);
  if (!feedback) {
    return {
      statusCode: 422,
      headers: cabecalhos,
      body: JSON.stringify({ ok: false, erro: "Dados incompletos" }),
    };
  }

  console.log(`[ouzadia] feedback ${resumo(feedback)}`);

  const webhook = process.env.FEEDBACK_WEBHOOK || "";
  if (!webhook) {
    return {
      statusCode: 202,
      headers: cabecalhos,
      body: JSON.stringify({ ok: true, encaminhado: false }),
    };
  }

  const encaminhado = await encaminharParaWebhook(feedback, webhook);
  return {
    statusCode: encaminhado ? 201 : 502,
    headers: cabecalhos,
    body: JSON.stringify(encaminhado
      ? { ok: true, encaminhado: true }
      : { ok: false, erro: "Nao foi possivel encaminhar" }),
  };
}
