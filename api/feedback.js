/* ==========================================================
   Ouzadia — funcao serverless de feedback (Vercel)

   O disco das funcoes serverless e efemero, entao o feedback
   e encaminhado para um webhook. Configure a variavel de
   ambiente FEEDBACK_WEBHOOK com a URL do seu Zapier, Make,
   n8n ou Google Apps Script.
   ========================================================== */

import { sanitizarFeedback, encaminharParaWebhook, resumo } from "../lib/feedback.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, erro: "Metodo nao permitido" });
  }

  let bruto = req.body;
  if (typeof bruto === "string") {
    try { bruto = JSON.parse(bruto); } catch { bruto = null; }
  }

  const feedback = sanitizarFeedback(bruto);
  if (!feedback) return res.status(422).json({ ok: false, erro: "Dados incompletos" });

  console.log(`[ouzadia] feedback ${resumo(feedback)}`);

  const webhook = process.env.FEEDBACK_WEBHOOK || "";
  if (!webhook) {
    // Sem webhook o registro fica apenas no log da funcao.
    return res.status(202).json({ ok: true, encaminhado: false });
  }

  const encaminhado = await encaminharParaWebhook(feedback, webhook);
  return encaminhado
    ? res.status(201).json({ ok: true, encaminhado: true })
    : res.status(502).json({ ok: false, erro: "Nao foi possivel encaminhar" });
}
