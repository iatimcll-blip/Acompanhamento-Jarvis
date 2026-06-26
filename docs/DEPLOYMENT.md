# 🚀 Deployment Guide - Jarvis MCLL

**Versão**: 1.0.0  
**Data**: 2026-06-25  
**Status**: ✅ Pronto para Produção

---

## 📋 Pré-requisitos

- Docker & Docker Compose
- Domínio registrado (opcional)
- Certificado SSL (opcional)
- Credenciais de hosting (Railway, Render, AWS, etc)

---

## 🏗️ Build para Produção

### Frontend

```bash
cd frontend

# Build otimizado
npm run build

# Resultado: pasta 'build/' com ~150-200KB (gzipped)
ls -lh build/
```

### Backend

```bash
# Já pronto via Docker
docker build -t jarvis-backend:latest -f backend/Dockerfile backend/
```

### Ambos via Docker Compose

```bash
docker-compose -f docker-compose.prod.yml build
```

---

## 🌐 Opções de Deployment

### Opção 1: Docker Compose (Recomendado para iniciante)

#### Local/VPS

```bash
# 1. Clone o repositório
git clone <seu-repo> jarvis-mcll
cd jarvis-mcll

# 2. Criar arquivo .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local

# 3. Editar variáveis
nano backend/.env
# DATABASE_URL=postgresql://jarvis:senha_segura@db:5432/jarvis_db
# DEBUG=False
# LOG_LEVEL=INFO

# 4. Build
docker-compose -f docker-compose.prod.yml build

# 5. Run
docker-compose -f docker-compose.prod.yml up -d

# 6. Verificar
docker ps
curl http://localhost:8000/health
curl http://localhost:3000
```

---

### Opção 2: Railway (Recomendado - Fácil)

Railway é uma plataforma que automatiza deploy de Docker.

#### Setup

```bash
# 1. Criar conta em railway.app

# 2. Instalar CLI
npm install -g @railway/cli

# 3. Fazer login
railway login

# 4. Criar projeto
railway init

# 5. Configurar variáveis de ambiente
railway variables set DATABASE_URL postgresql://...
railway variables set DEBUG False

# 6. Deploy
railway up
```

**Resultado**: App rodando em `https://<seu-app>.up.railway.app`

---

### Opção 3: Render (Recomendado - Escalável)

Render oferece suporte nativo a PostgreSQL + Web services.

#### Setup

1. **Frontend (React)**
   - Conectar GitHub
   - Build Command: `npm install --legacy-peer-deps && npm run build`
   - Start Command: `npm install -g serve && serve -s build -l 3000`
   - Variáveis: `REACT_APP_API_URL=https://<backend-url>`

2. **Backend (FastAPI)**
   - Conectar GitHub
   - Environment: `Docker`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port 8000`
   - Variáveis: `DATABASE_URL`, `DEBUG=False`

3. **Database (PostgreSQL)**
   - Render oferece PostgreSQL grátis (com limite)
   - Cria automaticamente URL de conexão

---

### Opção 4: AWS (Recomendado - Production)

#### com ECS + RDS

```bash
# 1. Instalar AWS CLI
aws configure

# 2. Criar ECR repositories
aws ecr create-repository --repository-name jarvis-frontend --region us-east-1
aws ecr create-repository --repository-name jarvis-backend --region us-east-1

# 3. Login no ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# 4. Build e push
docker tag jarvis-frontend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/jarvis-frontend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/jarvis-frontend:latest

docker tag jarvis-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/jarvis-backend:latest
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/jarvis-backend:latest

# 5. Criar RDS PostgreSQL
aws rds create-db-instance \
  --db-instance-identifier jarvis-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username jarvis \
  --master-user-password <senha_segura> \
  --allocated-storage 20

# 6. Criar ECS cluster
aws ecs create-cluster --cluster-name jarvis

# 7. Deploy via CloudFormation/Terraform (recomendado)
```

---

### Opção 5: DigitalOcean App Platform

```bash
# 1. Criar conta em digitalocean.com

# 2. Conectar GitHub

# 3. Novo App
- Frontend: detecta automaticamente React
- Backend: detecta Python/FastAPI
- Database: PostgreSQL managed

# 4. Deploy automático
  - Cada push em main = deploy automático
  - URL gerada automaticamente
  - SSL incluído
```

---

## 🔐 Variáveis de Ambiente - Produção

### Backend

```env
# Banco de dados
DATABASE_URL=postgresql://jarvis:senha_segura@db-prod.region.rds.amazonaws.com:5432/jarvis_db

# API
DEBUG=False
LOG_LEVEL=INFO
ENVIRONMENT=production

# Security
SECRET_KEY=seu-secret-key-muito-longo-e-seguro
ALGORITHM=HS256

# Uploads
UPLOAD_FOLDER=/app/uploads
MAX_UPLOAD_SIZE=52428800

# CORS
ALLOWED_ORIGINS=https://seu-dominio.com,https://www.seu-dominio.com

# Email (opcional)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASSWORD=sua-senha-app

# Monitoring
SENTRY_DSN=https://seu-sentry-url
```

### Frontend

```env
REACT_APP_API_URL=https://api.seu-dominio.com
REACT_APP_ENVIRONMENT=production
```

---

## 📊 Checklist de Produção

- [ ] Banco de dados em servidor (não local)
- [ ] SSL/TLS certificado instalado
- [ ] Secrets armazenados em variáveis de ambiente
- [ ] CORS configurado para domínios específicos
- [ ] Database backups configurados (diário)
- [ ] Monitoramento ativo (Sentry, NewRelic, etc)
- [ ] Logs centralizados
- [ ] Rate limiting em endpoints
- [ ] Cache configurado (Redis, CDN)
- [ ] Testes de carga realizados
- [ ] Plano de disaster recovery
- [ ] Documentação de runbook
- [ ] Health checks configurados
- [ ] Auto-scaling ativo (se multi-container)
- [ ] Alertas de downtime configurados

---

## 🔄 CI/CD Pipeline

### GitHub Actions (Automático)

Arquivo `.github/workflows/build.yml` já configurado:

```yaml
on:
  push:
    branches: [main]

jobs:
  build:
    - npm install
    - npm run build
    - docker build
  
  deploy:
    - push ECR
    - trigger ECS deploy
    - run tests
```

**Para ativar**:
1. Criar secrets no GitHub (Settings → Secrets)
   - DOCKER_USERNAME
   - DOCKER_PASSWORD
   - AWS_ACCESS_KEY_ID
   - AWS_SECRET_ACCESS_KEY

2. Push em `main` = Deploy automático

---

## 📈 Monitoramento em Produção

### Health Checks

```bash
# Frontend
curl https://seu-dominio.com

# Backend
curl https://api.seu-dominio.com/health
# Response: {"status": "ok", "message": "..."}

# Database
curl https://api.seu-dominio.com/health
```

### Logs

```bash
# Docker
docker logs -f jarvis-backend-prod

# Sentry (error tracking)
# Dashboard: sentry.io → seu-projeto

# CloudWatch (AWS)
aws logs tail /ecs/jarvis-backend
```

### Métricas

```bash
# CPU, Memory
docker stats

# Response time
curl -w "@curl-format.txt" https://api.seu-dominio.com/health

# Bandwidth
vmstat 1 5
```

---

## 🐛 Troubleshooting

### Erro: 502 Bad Gateway

```bash
# 1. Verificar backend
curl http://localhost:8000/health

# 2. Verificar logs
docker logs jarvis-backend-prod

# 3. Verificar database
psql -h db -U jarvis -d jarvis_db -c "SELECT 1"

# 4. Reiniciar
docker-compose restart backend
```

### Erro: Database Connection Refused

```bash
# 1. Verificar conexão
docker exec jarvis-db-prod psql -U jarvis -d jarvis_db -c "SELECT 1"

# 2. Verificar variável DATABASE_URL
echo $DATABASE_URL

# 3. Testar conexão direta
psql "$DATABASE_URL" -c "SELECT 1"
```

### Erro: Out of Memory

```bash
# 1. Verificar uso
docker stats

# 2. Aumentar limite
docker-compose.prod.yml:
  services:
    backend:
      mem_limit: 512m

# 3. Reiniciar
docker-compose restart
```

---

## 📚 Referências

- [Docker Docs](https://docs.docker.com)
- [Railway Docs](https://railway.app/docs)
- [Render Docs](https://render.com/docs)
- [AWS ECS Docs](https://docs.aws.amazon.com/ecs)
- [PostgreSQL Docs](https://www.postgresql.org/docs)

---

## ✅ Após Deploy

1. **Testar endpoints**
   ```bash
   curl https://api.seu-dominio.com/health
   curl https://api.seu-dominio.com/filters
   ```

2. **Verificar SSL**
   ```bash
   curl -I https://seu-dominio.com
   # Deve retornar 200 OK com HTTPS
   ```

3. **Monitorar logs**
   ```bash
   docker logs -f jarvis-backend-prod
   ```

4. **Configurar alertas**
   - Sentry para erros
   - Uptime monitor (UptimeRobot, Pingdom)
   - Slack notifications

---

**Status**: ✅ Pronto para Deploy em Produção

Próximo: Escolha sua plataforma e siga as instruções acima.

👑 Orion
