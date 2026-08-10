# Jarvis WhatsApp Bridge

Servico para conectar o Painel Jarvis ao WhatsApp via QR Code.

## Rodar local

```bash
cd whatsapp-bridge
npm install
npm start
```

Padrao:

- API: `http://127.0.0.1:8788`
- WebSocket: `ws://127.0.0.1:8788/ws`
- Sessao: `.wwebjs_auth`

## Endpoints

- `GET /`
- `GET /health`
- `GET /api/status`
- `GET /api/chats`
- `GET /api/chats/:id/messages?limit=50`
- `POST /api/send-message` com `{ "to": "559999999999@c.us", "body": "texto" }`
- `POST /api/restart`
- `POST /api/logout`

## Variaveis

- `WPP_PORT`: porta HTTP, padrao `8788`
- `WPP_CORS_ORIGIN`: origem permitida, padrao `*`
- `WPP_CLIENT_ID`: nome da sessao local, padrao `jarvis`
- `WPP_AUTH_DIR`: pasta da sessao WhatsApp, padrao `.wwebjs_auth`

## Render

1. No Render, crie um **Blueprint** apontando para este repositorio.
2. O arquivo `render.yaml` na raiz configura Docker, healthcheck e o servico web.
3. Confirme o plano Starter e o disco persistente de 1 GB montado em `/data`.
4. As variaveis abaixo ja fazem parte do Blueprint:

```env
WPP_AUTH_DIR=/data/.wwebjs_auth
WPP_CORS_ORIGIN=https://iatimcll-blip.github.io
WPP_CLIENT_ID=jarvis
```

5. O dominio padrao esperado e `https://jarvis-whatsapp-bridge-mcll.onrender.com`.
6. No painel Jarvis, clique em **Configurar URL** caso o Render gere outro dominio.

O disco persistente e necessario para evitar um novo QR Code a cada reinicio ou deploy.
