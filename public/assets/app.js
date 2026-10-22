/* ==========================================================
   Ouzadia — nucleo compartilhado
   Carrega o registro de cartoes e expoe utilitarios.
   ========================================================== */

// Relativo a este arquivo: funciona na raiz do dominio e em subpasta (GitHub Pages).
export const CAMINHO_REGISTRO = new URL("../data/cards.json", import.meta.url).href;

let registroCache = null;

/** Carrega e memoiza o registro de cartoes. */
export async function carregarRegistro() {
  if (registroCache) return registroCache;
  const resposta = await fetch(CAMINHO_REGISTRO, { cache: "no-store" });
  if (!resposta.ok) {
    throw new Error(`Nao foi possivel carregar o registro de cartoes (HTTP ${resposta.status}).`);
  }
  registroCache = await resposta.json();
  return registroCache;
}

/**
 * Descobre o id do cartao a partir da URL.
 * Aceita /abc123, /r/abc123 e ?c=abc123.
 */
export function idDoCartaoNaUrl() {
  const parametro = new URLSearchParams(location.search).get("c");
  if (parametro) return normalizarId(parametro);

  const partes = location.pathname.split("/").filter(Boolean);
  if (!partes.length) return null;

  let ultimo = partes[partes.length - 1];
  ultimo = ultimo.replace(/\.html?$/i, "");
  if (!ultimo || ultimo === "r" || ultimo === "index") return null;
  return normalizarId(ultimo);
}

export function normalizarId(valor) {
  return String(valor).trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

/** Busca um cartao ativo pelo id. Retorna null se nao existir ou estiver inativo. */
export function acharCartao(registro, id) {
  if (!id) return null;
  const cartao = (registro.cartoes || []).find((c) => normalizarId(c.id) === id);
  if (!cartao || cartao.ativo === false) return null;
  return cartao;
}

/** Monta a URL publica de um cartao. */
export function urlDoCartao(registro, cartao) {
  const base = (registro.marca?.dominioAvaliacao || location.origin).replace(/\/+$/, "");
  return `${base}/${cartao.id}`;
}

/** Link do WhatsApp com mensagem pre-preenchida. */
export function linkWhatsapp(numero, mensagem) {
  const limpo = String(numero || "").replace(/\D/g, "");
  return `https://wa.me/${limpo}?text=${encodeURIComponent(mensagem)}`;
}

/** Link mailto com assunto e corpo. */
export function linkEmail(endereco, assunto, corpo) {
  return `mailto:${endereco}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(corpo)}`;
}

/**
 * Envia o feedback para a API. Nunca lanca excecao:
 * a experiencia do cliente nao pode quebrar por causa de rede.
 */
export async function enviarFeedback(dados) {
  try {
    const resposta = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    return resposta.ok;
  } catch (_erro) {
    return false;
  }
}

/** Registra um evento simples para medir conversao do cartao. */
export function registrarEvento(nome, dados) {
  try {
    const chave = "ouzadia:eventos";
    const lista = JSON.parse(localStorage.getItem(chave) || "[]");
    lista.push({ nome, ...dados, em: new Date().toISOString() });
    localStorage.setItem(chave, JSON.stringify(lista.slice(-100)));
  } catch (_erro) {
    /* modo privado do navegador: ignorar */
  }
  if (typeof window.gtag === "function") {
    window.gtag("event", nome, dados || {});
  }
}

export function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}
