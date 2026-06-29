# Jarvis WhatsApp Bridge

Servico local para conectar o Painel Jarvis ao WhatsApp via QR Code.

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
