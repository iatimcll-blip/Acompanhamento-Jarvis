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

## Railway

1. Crie um novo servico no Railway apontando para este repositorio.
2. Configure o **Root Directory** como `whatsapp-bridge`.
3. Use o deploy por Dockerfile. O arquivo `railway.json` ja define `Dockerfile` e healthcheck.
4. Adicione um volume persistente no Railway e monte em `/data`.
5. Configure as variaveis:

```env
WPP_AUTH_DIR=/data/.wwebjs_auth
WPP_CORS_ORIGIN=https://iatimcll-blip.github.io
WPP_CLIENT_ID=jarvis
```

6. Gere o dominio publico do servico no Railway.
7. No painel Jarvis, aba WhatsApp, clique em **Configurar servico** e informe a URL do Railway se ela for diferente do padrao.

Sem volume persistente, o WhatsApp pedira QR Code novamente a cada redeploy.
