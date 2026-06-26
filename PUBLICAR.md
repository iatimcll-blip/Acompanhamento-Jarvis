# 🚀 COMO PUBLICAR JARVIS MCLL EM PRODUÇÃO

**Tempo**: 30 minutos  
**Complexidade**: Fácil → Médio

---

## ✅ Opção 1: Railway (MAIS FÁCIL - Recomendado)

### Passo 1: Criar conta
```
1. Acesse railway.app
2. Sign up com GitHub
3. Autorize Railway no GitHub
```

### Passo 2: Deploy
```bash
# Terminal
cd "d:/Acompanhamento Jarvis"

# Instalar CLI
npm install -g @railway/cli

# Login
railway login

# Deploy
railway up

# Resultado: App rodando em https://jarvis-xxx.up.railway.app
```

**Custo**: Grátis (até $5/mês)  
**Tempo**: 5 minutos

---

## ✅ Opção 2: Vercel (FRONTEND) + Render (BACKEND)

### Frontend no Vercel

```bash
# 1. Acesse vercel.com
# 2. Import GitHub project
# 3. Configurar build:
#    Build Command: npm run build
#    Output Directory: build
# 4. Deploy automático
```

**Resultado**: Frontend em `https://seu-projeto.vercel.app`  
**Custo**: Grátis  
**Tempo**: 3 minutos

### Backend no Render

```bash
# 1. Acesse render.com
# 2. New Web Service
# 3. Conectar GitHub
# 4. Configurar:
#    Build Command: pip install -r requirements.txt
#    Start Command: uvicorn main:app --host 0.0.0.0 --port 8000
# 5. Variáveis de ambiente:
#    DATABASE_URL: cria automaticamente PostgreSQL
# 6. Deploy
```

**Resultado**: Backend em `https://seu-projeto.onrender.com`  
**Custo**: Grátis (com limitações)  
**Tempo**: 5 minutos

---

## ✅ Opção 3: Docker em VPS (AWS/DigitalOcean)

### Pré-requisitos
- VPS com Docker instalado
- Domínio apontado para IP da VPS
- SSH acesso

### Deploy

```bash
# 1. SSH na VPS
ssh root@seu-vps-ip

# 2. Clonar repositório
git clone <seu-repo> jarvis-mcll
cd jarvis-mcll

# 3. Configurar ambiente
cp backend/.env.example backend/.env
nano backend/.env
# Editar DATABASE_URL, SECRET_KEY, etc

# 4. Build
docker-compose -f docker-compose.prod.yml build

# 5. Run
docker-compose -f docker-compose.prod.yml up -d

# 6. Verificar
docker ps
curl http://localhost:8000/health

# 7. Configurar Nginx (opcional)
# Ver nginx.conf na raiz do projeto
```

**Custo**: ~$5/mês (VPS básico)  
**Tempo**: 15 minutos

---

## 🔗 APÓS PUBLICAR - SETUP DO DOMÍNIO

### Conectar Domínio Personalizado

#### Railway
```bash
# 1. Dashboard → Project Settings
# 2. Domains
# 3. Adicionar seu domínio
# 4. Apontar DNS (instruções na tela)
# 5. SSL automático
```

#### Vercel + Render
```bash
# Vercel Frontend:
# 1. Settings → Domains
# 2. Adicionar seu domínio
# 3. Instruções DNS aparecem

# Render Backend:
# 1. Environment → Custom Domains
# 2. Adicionar domínio
# 3. Instruções DNS aparecem
```

#### VPS/DigitalOcean
```bash
# Usar Nginx como reverse proxy
# Exemplo: /etc/nginx/sites-available/default

server {
    listen 80;
    server_name seu-dominio.com www.seu-dominio.com;

    # Frontend
    location / {
        proxy_pass http://localhost:3000;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/api/;
    }

    # SSL com Certbot
    # certbot --nginx -d seu-dominio.com
}
```

---

## 📊 COMPARAÇÃO DAS OPÇÕES

| Opção | Custo | Setup | Escalabilidade | Recomendado |
|-------|-------|-------|-----------------|------------|
| **Railway** | Grátis-$10 | 5 min | Boa | ✅ Iniciante |
| **Vercel + Render** | Grátis-$15 | 8 min | Ótima | ✅ Escalável |
| **DigitalOcean** | $5-20/mês | 20 min | Excelente | ✅ Produção |
| **AWS** | $50+/mês | 30 min | Máxima | ✅ Enterprise |

---

## ✅ APÓS PUBLICAR - TESTES

### Testar Aplicação

```bash
# 1. Verificar Frontend
curl https://seu-dominio.com
# Deve retornar HTML da aplicação

# 2. Verificar Backend
curl https://api.seu-dominio.com/health
# Response: {"status":"ok",...}

# 3. Upload Excel (via UI)
# Abrir dashboard → Painel de Redes
# Arrasta BASE_REDE.xlsx
# Deve fazer upload com sucesso

# 4. Verificar dados
# GET /api/redes/backbone?cluster=MA_CAP
# Deve retornar dados do Excel
```

### Monitorar Performance

```bash
# Ferramentas úteis:
# - Vercel Analytics (Frontend)
# - Render Metrics (Backend)
# - Google Analytics
# - Uptime Robot (health checks)
```

---

## 🔐 SEGURANÇA APÓS PUBLICAR

```bash
# Checklist:

# 1. Certificado SSL
# ✅ Vercel/Render: automático
# ✅ Railway: automático
# ⚠️ VPS: usar Certbot

# 2. Banco de Dados
# ✅ Usar managed database (não localhost)
# ✅ Backup automático habilitado
# ✅ Senha segura (>20 caracteres)

# 3. Secrets
# ✅ Todos em variáveis de ambiente
# ✅ Nunca no Git
# ✅ Rotacionar chaves regularmente

# 4. Firewall
# ✅ Apenas portas necessárias abertas
# ✅ Rate limiting ativo
# ✅ CORS configurado para seu domínio
```

---

## 🐛 TROUBLESHOOTING COMUM

### Erro 502 após publicar?

```bash
# 1. Verificar logs backend
docker logs jarvis-backend-prod
# ou Railway/Render dashboard

# 2. Verificar conectividade com DB
# DATABASE_URL está correto?
# Banco está acessível?

# 3. Verificar variáveis de ambiente
railway variables
# ou no dashboard da plataforma

# 4. Reiniciar container
docker restart jarvis-backend-prod
```

### API retorna erro CORS?

```bash
# Backend: backend/.env
ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com

# Reiniciar backend
docker restart jarvis-backend-prod
```

### Database vazio após publicar?

```bash
# Fazer upload do Excel novamente
# via UI do dashboard

# Ou via API:
curl -F "file=@BASE_REDE.xlsx" \
     -F "panel=redes" \
     https://api.seu-dominio.com/api/upload
```

---

## 📈 PRÓXIMOS PASSOS PÓS-DEPLOY

1. **Monitorar 24h** - Verificar logs, performance
2. **Setup alertas** - Uptime, errors, performance
3. **Configurar backups** - Database backup automático
4. **Documentar runbook** - Procedimentos de operação
5. **Planejar updates** - CI/CD para atualizações automáticas

---

## 💬 SUPORTE

- **Documentação**: Ver `docs/DEPLOYMENT.md`
- **Issues**: GitHub Issues
- **Comunidade**: Discord/Slack do projeto

---

## 🎉 PARABÉNS!

Seu **Jarvis MCLL** está **rodando em produção**! 🚀

**Próximo**: Adicionar mais painéis (B2B, Frota, etc)

👑 **— Orion, orquestrando o sistema 🎯**
