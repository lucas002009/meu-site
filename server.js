/* ==========================================================
   Ouzadia — servidor de avaliacao
   Sem dependencias externas: apenas Node >= 18.

   Rotas
     GET  /                 pagina inicial
     GET  /admin            gerador de QR Code + NFC
     GET  /data/cards.json  registro de cartoes (public/data/cards.json)
     GET  /:id              pagina de avaliacao do cartao
     POST /api/feedback     recebe o feedback privado
     GET  /api/feedback     lista o feedback (exige ADMIN_TOKEN)
   ========================================================== */

import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizarFeedback, encaminharParaWebhook, resumo } from "./lib/feedback.js";

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(RAIZ, "public");
const REGISTRO = path.join(PUBLICO, "data", "cards.json");
const DADOS = path.join(RAIZ, "data");
const ARQUIVO_FEEDBACK = path.join(DADOS, "feedback.jsonl");

const PORTA = Number(process.env.PORT || 3000);
const TOKEN_ADMIN = process.env.ADMIN_TOKEN || "";
const LIMITE_CORPO = 32 * 1024; // 32 KB

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/* ---------- utilitarios ---------- */

function responderJson(res, status, corpo) {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(texto),
    "Cache-Control": "no-store",
  });
  res.end(texto);
}

function responderTexto(res, status, texto) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(texto);
}

/** Resolve um caminho dentro de uma base, barrando path traversal. */
function caminhoSeguro(base, relativo) {
  const alvo = path.resolve(base, "." + path.posix.normalize("/" + relativo));
  const raizNormalizada = path.resolve(base) + path.sep;
  if (alvo !== path.resolve(base) && !alvo.startsWith(raizNormalizada)) return null;
  return alvo;
}

async function servirArquivo(res, arquivo, { cache = "public, max-age=300" } = {}) {
  let info;
  try {
    info = await fsp.stat(arquivo);
  } catch {
    return false;
  }
  if (!info.isFile()) return false;

  res.writeHead(200, {
    "Content-Type": TIPOS[path.extname(arquivo).toLowerCase()] || "application/octet-stream",
    "Content-Length": info.size,
    "Cache-Control": cache,
    "X-Content-Type-Options": "nosniff",
  });
  fs.createReadStream(arquivo).pipe(res);
  return true;
}

function lerCorpo(req) {
  return new Promise((resolve, reject) => {
    let bruto = "";
    let tamanho = 0;
    req.on("data", (pedaco) => {
      tamanho += pedaco.length;
      if (tamanho > LIMITE_CORPO) {
        reject(new Error("corpo grande demais"));
        req.destroy();
        return;
      }
      bruto += pedaco;
    });
    req.on("end", () => resolve(bruto));
    req.on("error", reject);
  });
}

/** Descobre o webhook: variavel de ambiente tem prioridade sobre o registro. */
async function descobrirWebhook() {
  if (process.env.FEEDBACK_WEBHOOK) return process.env.FEEDBACK_WEBHOOK;
  try {
    const registro = JSON.parse(await fsp.readFile(REGISTRO, "utf8"));
    return registro.config?.webhookFeedback || "";
  } catch {
    return "";
  }
}

/* ---------- rotas ---------- */

async function rotaFeedback(req, res) {
  if (req.method === "POST") {
    let bruto;
    try {
      bruto = JSON.parse(await lerCorpo(req));
    } catch {
      return responderJson(res, 400, { ok: false, erro: "JSON invalido" });
    }

    const feedback = sanitizarFeedback(bruto);
    if (!feedback) return responderJson(res, 422, { ok: false, erro: "Dados incompletos" });

    await fsp.mkdir(DADOS, { recursive: true });
    await fsp.appendFile(ARQUIVO_FEEDBACK, JSON.stringify(feedback) + "\n", "utf8");
    console.log(`[ouzadia] feedback ${resumo(feedback)}`);

    // Nao bloqueia a resposta: o cliente nao espera o webhook.
    descobrirWebhook().then((url) => encaminharParaWebhook(feedback, url));
    return responderJson(res, 201, { ok: true });
  }

  if (req.method === "GET") {
    if (!TOKEN_ADMIN) return responderJson(res, 503, { ok: false, erro: "ADMIN_TOKEN nao configurado" });
    const enviado = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (enviado !== TOKEN_ADMIN) return responderJson(res, 401, { ok: false, erro: "Nao autorizado" });

    let conteudo = "";
    try {
      conteudo = await fsp.readFile(ARQUIVO_FEEDBACK, "utf8");
    } catch {
      /* nenhum feedback ainda */
    }
    const itens = conteudo.split("\n").filter(Boolean).map((linha) => {
      try { return JSON.parse(linha); } catch { return null; }
    }).filter(Boolean);
    return responderJson(res, 200, { ok: true, total: itens.length, itens: itens.reverse() });
  }

  res.writeHead(405, { Allow: "GET, POST" });
  res.end();
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const caminho = decodeURIComponent(url.pathname);

  try {
    if (caminho === "/api/feedback") return await rotaFeedback(req, res);

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      return res.end();
    }

    if (caminho === "/health") return responderJson(res, 200, { ok: true });

    // Registro de cartoes: sempre fresco, nunca em cache
    if (caminho === "/data/cards.json") {
      if (await servirArquivo(res, REGISTRO, { cache: "no-store" })) return;
      return responderJson(res, 404, { ok: false, erro: "registro nao encontrado" });
    }

    // Paginas nomeadas e arquivos estaticos
    const rotasFixas = {
      "/": "index.html",
      "/admin": "admin/index.html",
      "/admin/": "admin/index.html",
      "/admin/nfc": "admin/nfc.html",
      "/obrigado": "obrigado.html",
    };

    const relativo = rotasFixas[caminho] || caminho.replace(/^\//, "");
    const arquivo = caminhoSeguro(PUBLICO, relativo);
    if (arquivo && await servirArquivo(res, arquivo)) return;

    // /abc123 -> pagina de avaliacao
    if (/^\/[a-zA-Z0-9_-]{2,64}\/?$/.test(caminho)) {
      if (await servirArquivo(res, path.join(PUBLICO, "r.html"), { cache: "no-store" })) return;
    }

    responderTexto(res, 404, "404 — pagina nao encontrada");
  } catch (erro) {
    console.error("[ouzadia] erro:", erro);
    if (!res.headersSent) responderTexto(res, 500, "500 — erro interno");
    else res.end();
  }
});

servidor.listen(PORTA, () => {
  console.log(`\n  OUZADIA — servidor de avaliacao`);
  console.log(`  http://localhost:${PORTA}`);
  console.log(`  cartao de exemplo: http://localhost:${PORTA}/abc123`);
  console.log(`  gerador de cartoes: http://localhost:${PORTA}/admin\n`);
});
