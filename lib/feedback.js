/* ==========================================================
   Ouzadia — regras de feedback compartilhadas
   Usado pelo server.js local e pelas funcoes serverless.
   ========================================================== */

export function texto(valor, limite) {
  return String(valor ?? "").trim().slice(0, limite);
}

/**
 * Valida e normaliza o feedback vindo do navegador.
 * Retorna null quando os dados nao servem.
 */
export function sanitizarFeedback(bruto) {
  if (!bruto || typeof bruto !== "object") return null;

  const nota = Number(bruto.nota);
  if (!Number.isInteger(nota) || nota < 1 || nota > 5) return null;

  const mensagem = texto(bruto.mensagem, 4000);
  if (mensagem.length < 5) return null;

  return {
    cartao: texto(bruto.cartao, 64).toLowerCase().replace(/[^a-z0-9_-]/g, ""),
    loja: texto(bruto.loja, 120),
    cidade: texto(bruto.cidade, 120),
    vendedor: texto(bruto.vendedor, 120),
    nota,
    motivos: Array.isArray(bruto.motivos)
      ? bruto.motivos.slice(0, 10).map((m) => texto(m, 60)).filter(Boolean)
      : [],
    mensagem,
    nome: texto(bruto.nome, 120),
    contato: texto(bruto.contato, 160),
    recebidoEm: new Date().toISOString(),
  };
}

/**
 * Encaminha o feedback para o webhook configurado.
 * Retorna true quando o webhook aceitou, false quando nao ha webhook ou falhou.
 */
export async function encaminharParaWebhook(feedback, urlWebhook) {
  if (!urlWebhook) return false;
  try {
    const resposta = await fetch(urlWebhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(feedback),
      signal: AbortSignal.timeout(8000),
    });
    if (!resposta.ok) throw new Error(`webhook respondeu ${resposta.status}`);
    return true;
  } catch (erro) {
    console.error("[ouzadia] webhook falhou:", erro.message);
    return false;
  }
}

export function resumo(feedback) {
  return `${feedback.nota} estrelas — ${feedback.loja || feedback.cartao || "cartao desconhecido"}`;
}
