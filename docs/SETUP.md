# ⚙️ Setup - Jarvis MCLL

## 🚀 Início Rápido (Docker - Recomendado)

### Pré-requisitos
- Docker Desktop instalado
- 4GB RAM mínimo

### Executar
```bash
cd "d:/Acompanhamento Jarvis"
docker-compose up -d
```

**Acesso:**
- Frontend: http://localhost:3000
- Backend Docs: http://localhost:8000/docs
- Database: localhost:5432 (jarvis/jarvis_password)

**Parar:**
```bash
docker-compose down
```

---

## 🖥️ Setup Local (Desenvolvimento)

### Pré-requisitos
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+

### 1️⃣ Backend (Terminal 1)

```bash
cd backend

# Windows
python -m venv venv
venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env

# Setup database (first time)
# (alembic migrations - em desenvolvimento)

# Run server
uvicorn main:app --reload
```

Server rodando em: http://localhost:8000

### 2️⃣ Frontend (Terminal 2)

```bash
cd frontend

# Install dependencies
npm install

# Create .env file
echo "REACT_APP_API_URL=http://localhost:8000" > .env.local

# Run development server
npm start
```

App rodando em: http://localhost:3000

---

## 🗄️ Database Setup

### Com PostgreSQL Local

```bash
# Windows (pgAdmin)
# 1. Abrir pgAdmin
# 2. Create Database: jarvis_db
# 3. Owner: jarvis user

# Mac/Linux (psql)
psql -U postgres
CREATE USER jarvis WITH PASSWORD 'jarvis_password';
CREATE DATABASE jarvis_db OWNER jarvis;

# Conectar
psql -U jarvis -d jarvis_db -h localhost
```

### Com Docker (Incluído)

```bash
docker-compose up -d db

# Acessar banco
docker exec -it jarvis-db psql -U jarvis -d jarvis_db

# Comandos úteis
\dt              -- List tables
\d table_name    -- Describe table
\q               -- Exit
```

---

## 📁 Estrutura de Diretórios

```
d:/Acompanhamento Jarvis/
├── backend/
│   ├── app/
│   │   ├── models/        # SQLAlchemy models
│   │   ├── schemas/       # Pydantic schemas (request/response)
│   │   ├── routes/        # API endpoints
│   │   ├── services/      # Business logic
│   │   └── utils/         # Helper functions
│   ├── main.py            # Entry point
│   ├── config.py          # Configurações
│   ├── requirements.txt    # Dependencies
│   └── Dockerfile
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API client
│   │   ├── types/         # TypeScript types
│   │   ├── utils/         # Utilities
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── data/
│   ├── bases/             # Excel files (source)
│   └── uploads/           # Uploaded files
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── API.md
│   └── SETUP.md (este arquivo)
│
└── docker-compose.yml
```

---

## 🧪 Testes

### Backend
```bash
cd backend
pytest tests/ -v
```

### Frontend
```bash
cd frontend
npm test
```

---

## 🔧 Troubleshooting

### Erro: "Port 3000 already in use"
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3000
kill -9 <PID>
```

### Erro: "Database connection refused"
```bash
# Verificar se PostgreSQL está rodando
docker ps | grep jarvis-db

# Reiniciar
docker-compose restart db
docker-compose logs db
```

### Erro: "Module not found"
```bash
# Backend
pip install -r requirements.txt

# Frontend
rm -rf node_modules package-lock.json
npm install
```

### Logs
```bash
# Ver logs de todos os containers
docker-compose logs -f

# Apenas backend
docker-compose logs -f backend

# Apenas frontend
docker-compose logs -f frontend
```

---

## 📝 Variáveis de Ambiente

### Backend (.env)
```
DATABASE_URL=postgresql://jarvis:password@localhost:5432/jarvis_db
DEBUG=True
LOG_LEVEL=INFO
API_TITLE=Jarvis MCLL API
UPLOAD_FOLDER=uploads/
MAX_UPLOAD_SIZE=52428800
```

### Frontend (.env.local)
```
REACT_APP_API_URL=http://localhost:8000
```

---

## 🚢 Deploy (Produção)

### Com Docker (Recomendado)
```bash
# Build images
docker-compose build

# Push para registry
docker tag jarvis-frontend:latest myregistry/jarvis-frontend:latest
docker push myregistry/jarvis-frontend:latest

# Rodar em servidor
docker-compose -f docker-compose.yml up -d
```

### Nginx (Reverse Proxy)
```nginx
upstream backend {
    server backend:8000;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name jarvis.com;

    location / {
        proxy_pass http://frontend;
    }

    location /api {
        proxy_pass http://backend;
    }
}
```

---

## 📞 Suporte

**Dúvidas?** Contate Orion (Orchestrator)

---

**Última atualização**: 2026-06-25  
**Versão**: 1.0.0
