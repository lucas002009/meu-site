# Cartão Ouzadia — avaliação por QR Code e NFC

Cartão de balcão que leva o cliente da loja para a avaliação em menos de
30 segundos. O cliente aproxima o celular (NFC) ou lê o QR Code, toca nas
estrelas, e cada nota segue o seu caminho.

```
                    CARTÃO OUZADIA
                   QR Code  +  NFC
                          │
                          ▼
             https://review.ouzadia.com/abc123
                          │
                          ▼
                      ★ ★ ★ ★ ★
                Como foi sua experiência?
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
        5 estrelas                1 a 4 estrelas
             │                         │
             ▼                         ▼
     Avaliação no Google        Feedback privado
                                WhatsApp / e-mail
```

Cada loja (ou cada balcão) tem o seu próprio cartão, com link, WhatsApp e
página do Google separados. Assim dá para saber de onde veio cada avaliação.

---

## Comece por aqui

```bash
npm start
```

Abre em `http://localhost:3000`. Não há dependências para instalar: o
projeto roda com Node 18 ou mais novo e nada mais.

| Endereço | O que é |
| --- | --- |
| `/` | Página que explica o fluxo |
| `/abc123` | Um cartão de verdade, como o cliente vê |
| `/admin` | Gerador de QR Codes, pronto para imprimir |
| `/admin/nfc` | Gravação das tags NFC |

---

## Configurar as lojas

Tudo vive em `public/data/cards.json`. Não há banco de dados.

```json
{
  "config": {
    "notaMinimaParaGoogle": 5,
    "modoConformidade": false,
    "redirecionarAutomaticamente": true,
    "segundosAteRedirecionar": 1,
    "webhookFeedback": ""
  },
  "cartoes": [
    {
      "id": "abc123",
      "ativo": true,
      "loja": "Ouzadia Shopping da Ilha",
      "cidade": "São Luís - MA",
      "vendedor": "",
      "googleReviewUrl": "https://search.google.com/local/writereview?placeid=SEU_PLACE_ID",
      "whatsapp": "5598900000000",
      "email": "contato@ouzadia.com"
    }
  ]
}
```

O que cada chave faz:

- **`id`** vira a URL do cartão. Use algo curto: quanto menor a URL, menor
  o QR Code e mais fácil a leitura.
- **`notaMinimaParaGoogle`** é a nota a partir da qual o cliente é levado
  ao Google. Em 5, só quem deu cinco estrelas segue para lá.
- **`redirecionarAutomaticamente`** manda o cliente direto para o Google
  sem esperar o clique. O redirecionamento é bloqueado enquanto o Place ID
  ainda for o de exemplo, então dá para testar sem sustos.
- **`ativo: false`** desliga um cartão perdido ou roubado sem apagar o
  histórico.
- **`whatsapp`** vai com DDI e DDD, só números: `5598991234567`.

### Pegar o Place ID da loja

1. Abra o [Place ID Finder do Google](https://developers.google.com/maps/documentation/places/web-service/place-id).
2. Busque a loja pelo nome.
3. Copie o `ChIJ...` e monte a URL:
   `https://search.google.com/local/writereview?placeid=ChIJ...`

A página de administração avisa quais cartões ainda estão com o Place ID
de exemplo.

---

## Imprimir os QR Codes

Abra `/admin` e clique em **Imprimir folha de QR Codes**. A folha sai
limpa, só com os códigos e a identificação de cada loja.

Os QR Codes são gerados dentro do próprio navegador, sem biblioteca
externa e sem chamar nenhum servidor. Nível de correção de erro M, que
tolera cerca de 15% da área danificada — o suficiente para um cartão que
vai passar o dia sendo manuseado no balcão.

**Ao imprimir:** deixe o QR Code com pelo menos 2 cm de lado e mantenha a
margem branca em volta. Sem essa margem, muitos leitores falham.

---

## Gravar as tags NFC

Use tags **NTAG213**, **NTAG215** ou **NTAG216**. As NTAG213 já bastam:
uma URL curta ocupa pouquíssimo espaço.

**Pelo navegador** (Chrome no Android, em HTTPS): abra `/admin/nfc`,
escolha o cartão e encoste a tag.

**Pelo aplicativo** (qualquer celular): instale o **NFC Tools**, copie a
URL da página de administração e grave um registro do tipo **URL**.

Depois de gravar, trave a tag no aplicativo se ela for ficar exposta ao
público. Uma tag destravada pode ser reescrita por qualquer pessoa que
encoste um celular nela.

---

## Onde cai o feedback privado

Quem dá de 1 a 4 estrelas escreve para a gerência. A mensagem tem três
caminhos, e eles se complementam:

1. **`POST /api/feedback`** grava em `data/feedback.jsonl` quando você
   roda o servidor Node próprio.
2. **Webhook**, se você preencher `webhookFeedback` no registro ou a
   variável `FEEDBACK_WEBHOOK`. Serve para Zapier, Make, n8n ou um Google
   Apps Script que escreve numa planilha.
3. **WhatsApp e e-mail** com a mensagem já montada, na tela de
   agradecimento. É a rede de segurança: mesmo se a API cair, o cliente
   consegue falar com a loja.

Para ler o que chegou, defina `ADMIN_TOKEN` e chame:

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" http://localhost:3000/api/feedback
```

Sem o token essa rota não responde nada.

---

## Publicar

**Servidor próprio.** `npm start` atrás de um proxy com HTTPS. É a única
opção que grava o feedback em disco.

**Vercel.** O `vercel.json` já traz as regras de reescrita e a função em
`api/feedback.js`. Configure `FEEDBACK_WEBHOOK` nas variáveis de
ambiente.

**Netlify.** Mesma ideia, com `netlify.toml` e
`netlify/functions/feedback.js`.

**Hospedagem estática pura** (GitHub Pages e afins). Funciona, mas sem a
API: use `/r.html?c=abc123` como URL do cartão e deixe o feedback chegar
por WhatsApp e e-mail.

Aponte `review.ouzadia.com` para a hospedagem e confirme que
`marca.dominioAvaliacao` no registro bate com o domínio de verdade — é
esse valor que entra no QR Code e na tag NFC.

---

## Sobre as regras do Google

O Google proíbe o *review gating*: filtrar quem pode avaliar com base na
nota que a pessoa provavelmente daria. Do jeito que o fluxo vem
configurado, só quem dá cinco estrelas recebe o convite para o Google, e
isso é exatamente a prática que a política veda. O risco recai sobre a
ficha da loja no Google, não sobre este código.

Para operar dentro da política, mude uma linha:

```json
"modoConformidade": true
```

Com isso, quem dá nota baixa também recebe o link do Google, junto com o
canal privado para a loja resolver o problema. Você continua sabendo
primeiro o que deu errado, continua tendo a chance de consertar, e não
impede ninguém de publicar.

A decisão é sua. O código atende às duas configurações.

---

## Testes

```bash
npm test
```

São 23 testes, sem dependências externas:

- **QR Code** conferido contra matrizes de referência das versões 1 a 10,
  incluindo acentuação em UTF-8 e os padrões de localização, tempo e
  formato. As matrizes de `test/qr.fixtures.json` foram confirmadas por um
  decodificador independente antes de virarem referência.
- **Feedback** com as regras de validação: nota fora da faixa, mensagem
  curta, campos longos demais e motivos em formato inválido.
- **Registro** com a checagem que evita cartão impresso errado: id
  duplicado, WhatsApp sem DDI, link do Google fora do formato e URL
  comprida demais para caber num QR Code legível.

---

## Como o projeto está organizado

```
public/
  index.html          explicação do fluxo
  r.html              a página que o cliente vê
  obrigado.html       agradecimento avulso
  admin/index.html    gerador de QR Codes
  admin/nfc.html      gravação das tags NFC
  assets/app.js       registro, roteamento e envio
  assets/qr.js        gerador de QR Code próprio
  assets/styles.css   identidade visual
  data/cards.json     as lojas e os cartões
lib/feedback.js       validação compartilhada
server.js             servidor local, sem dependências
api/feedback.js       função serverless (Vercel)
netlify/functions/    função serverless (Netlify)
test/                 testes
```
