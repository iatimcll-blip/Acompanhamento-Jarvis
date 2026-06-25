# 👑 Jarvis MCLL - Acompanhamento de Operações

**Dashboard de monitoramento operacional** com análise de redes, B2B, produtividade e frota.

## 🎯 Objetivo

Sistema web para acompanhamento em tempo real de:
- **Painel de Redes** (Backbone + Acesso): Análise de SLA, TME, Prazo
- **Painel B2B**: Tickets abertos e encerrados
- **Produtividade OFS**: Análise de técnicos
- **Frota & Combustível**: Gestão de veículos e abastecimento

## 🏗️ Stack Tecnológico

```
Frontend:  React 18 + TypeScript + Material-UI + Recharts
Backend:   Python 3.11 + FastAPI + SQLAlchemy
Database:  PostgreSQL + TimescaleDB
Deploy:    Docker + Docker Compose
```

## 📁 Estrutura do Projeto

```
├── frontend/           # App React (TypeScript)
├── backend/            # API Python/FastAPI
├── data/               # Bases Excel e schemas
├── docs/               # Documentação
└── docker-compose.yml  # Orquestração de containers
```

## 🚀 Quick Start

### Pré-requisitos
- Docker & Docker Compose
- Node.js 18+ (desenvolvimento local)
- Python 3.11+ (desenvolvimento local)
- PostgreSQL 14+ (ou usar Docker)

### Setup Local

#### 1. Backend (Python/FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
# API em http://localhost:8000
```

#### 2. Frontend (React)
```bash
cd frontend
npm install
npm start
# App em http://localhost:3000
```

#### 3. Com Docker (Recomendado)
```bash
docker-compose up -d
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
# Docs: http://localhost:8000/docs
```

## 📊 Painéis Implementados

- [x] Estrutura base
- [ ] Painel de Redes (Prioridade 1)
- [ ] Painel Frota & Combustível (Prioridade 2)
- [ ] B2B e Produtividade OFS (Futuro)

## 📖 Documentação

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Visão geral do sistema
- [API.md](docs/API.md) - Endpoints da API
- [SETUP.md](docs/SETUP.md) - Guia de instalação detalhado

## 🔄 Workflow de Desenvolvimento

1. Criar branch para feature
2. Implementar e testar localmente
3. Commit com mensagem descritiva
4. Push e criar PR
5. Code review
6. Merge em main

## 📞 Contato

**Orion** (Orchestrator) - orion@jarvis.local

---

**Status**: 🟡 Desenvolvimento  
**Versão**: 1.0.0 (Greenfield)  
**Data Atualização**: 2026-06-25
