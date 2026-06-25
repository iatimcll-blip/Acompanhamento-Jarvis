# 🤖 Claude Code Configuration - Jarvis MCLL

**Project**: Jarvis MCLL - Dashboard de Acompanhamento de Operações  
**Stack**: React 18 + Python/FastAPI + PostgreSQL  
**Orchestrator**: Orion (Master Agent)

---

## 📋 Workflow de Desenvolvimento

### 1. Antes de Começar uma Task

```bash
cd "d:/Acompanhamento Jarvis"
git status
git pull  # Se trabalho em equipe
```

### 2. Criar Branch

```bash
# Feature branch
git checkout -b feature/painel-redes

# Bugfix branch
git checkout -b fix/upload-validation

# Hotfix branch
git checkout -b hotfix/database-connection
```

### 3. Implementar

- Seguir arquitetura em docs/ARCHITECTURE.md
- Usar TypeScript no frontend
- Usar Python type hints no backend
- Testes unitários para novas funções

### 4. Commit

```bash
git add <files>
git commit -m "type: description

- Detail 1
- Detail 2

Co-Authored-By: Claude <claude@anthropic.com>"
```

### 5. Antes de Push

```bash
# Backend tests
cd backend && pytest tests/ -v

# Frontend type check
cd frontend && npm run type-check

# Build check
npm run build
```

### 6. Push e PR

```bash
git push origin feature/painel-redes
# Criar PR no GitHub
```

---

## 🏗️ Convenções de Código

### Backend (Python)

**Imports**:
```python
# Standard library
import os
from typing import List, Optional
from datetime import datetime

# Third-party
from fastapi import APIRouter, HTTPException
from sqlalchemy import Column, String, Float
from pydantic import BaseModel, Field

# Local
from app.models import RedeBackbone
from app.schemas import RedeBackboneSchema
```

**Type Hints** (obrigatório):
```python
async def get_redes(
    cluster: Optional[str] = None,
    mes: Optional[int] = None
) -> Dict[str, Any]:
    pass
```

**Naming**:
- Classes: `PascalCase` (RedeBackbone, TicketB2B)
- Functions: `snake_case` (get_redes, calculate_tme)
- Constants: `UPPER_CASE` (MAX_UPLOAD_SIZE)

**Error Handling**:
```python
try:
    # Operation
except ValueError as e:
    raise HTTPException(
        status_code=400,
        detail=f"Invalid data: {str(e)}"
    )
```

### Frontend (TypeScript/React)

**Type Definitions**:
```typescript
interface RedeBackbone {
  os: string;
  titulo: string;
  tme: number;
  prazo: boolean;
  outlier: boolean;
  cidade: string;
  uf: string;
}

type ClusterType = "MA_CAP" | "MA_INT" | "PI_CAP" | "PI_INT";
```

**Component Structure**:
```typescript
// File: components/RedePanel.tsx
import { FC, useState, useEffect } from "react";
import { Box, Card, Typography } from "@mui/material";

interface RedePanelProps {
  cluster?: string;
}

export const RedePanel: FC<RedePanelProps> = ({ cluster }) => {
  const [data, setData] = useState<RedeBackbone[]>([]);
  
  useEffect(() => {
    // Load data
  }, [cluster]);

  return (
    <Box>
      {/* JSX */}
    </Box>
  );
};
```

**Naming**:
- Components: `PascalCase` (RedePanel, UploadZone)
- Hooks: `usePrefixSuffix` (useRedeData, useFilters)
- Functions: `camelCase` (calculateTME, formatDate)

---

## 📂 Estrutura de Arquivos

### Backend

```
backend/
├── app/
│   ├── models/           # SQLAlchemy models
│   │   ├── __init__.py
│   │   ├── rede.py       # RedeBackbone, RedeAcesso
│   │   ├── ticket.py     # TicketB2B
│   │   └── frota.py      # Veiculo, Abastecimento
│   │
│   ├── schemas/          # Pydantic schemas
│   │   ├── __init__.py
│   │   └── rede.py       # RedeBackboneSchema, etc
│   │
│   ├── routes/           # API endpoints
│   │   ├── __init__.py
│   │   ├── redes.py      # /api/redes/*
│   │   ├── b2b.py        # /api/b2b/*
│   │   ├── frota.py      # /api/frota/*
│   │   └── upload.py     # /api/upload
│   │
│   ├── services/         # Business logic
│   │   ├── __init__.py
│   │   ├── excel_parser.py
│   │   ├── rede_processor.py
│   │   └── calculations.py
│   │
│   ├── utils/            # Helpers
│   │   ├── __init__.py
│   │   ├── validators.py
│   │   └── constants.py
│   │
│   └── __init__.py
│
├── tests/
│   ├── __init__.py
│   ├── test_redes.py
│   ├── test_upload.py
│   └── conftest.py       # Fixtures
│
├── main.py               # Entry point
├── config.py             # Settings
├── requirements.txt
└── Dockerfile
```

### Frontend

```
frontend/
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Layout.tsx
│   │   │
│   │   ├── panels/
│   │   │   ├── RedePanel.tsx
│   │   │   ├── B2BPanel.tsx
│   │   │   └── FrotaPanel.tsx
│   │   │
│   │   ├── common/
│   │   │   ├── MetricCard.tsx
│   │   │   ├── UploadZone.tsx
│   │   │   └── FilterBar.tsx
│   │   │
│   │   └── charts/
│   │       ├── BarChart.tsx
│   │       ├── LineChart.tsx
│   │       └── PieChart.tsx
│   │
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Settings.tsx
│   │   └── NotFound.tsx
│   │
│   ├── services/
│   │   ├── api.ts        # Axios instance
│   │   ├── redes.ts      # API calls
│   │   └── frota.ts
│   │
│   ├── types/
│   │   ├── rede.ts
│   │   ├── ticket.ts
│   │   └── common.ts
│   │
│   ├── utils/
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   └── constants.ts
│   │
│   ├── hooks/
│   │   ├── useRedeData.ts
│   │   └── useFilters.ts
│   │
│   ├── App.tsx
│   ├── index.tsx
│   └── theme.ts          # MUI theme
│
├── public/
│   └── index.html
│
├── tests/
│   ├── components.test.tsx
│   └── services.test.ts
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## 🧪 Testes

### Backend Tests

```bash
# Run all tests
pytest tests/ -v

# Run specific test file
pytest tests/test_redes.py -v

# Run with coverage
pytest tests/ --cov=app

# Run only unit tests
pytest tests/ -m "unit"
```

**Exemplo de teste**:
```python
def test_calculate_tme():
    dados = [1.0, 2.0, 3.0]
    result = calculate_tme(dados)
    assert result == 2.0
```

### Frontend Tests

```bash
# Run tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test RedePanel
```

---

## 🔍 Code Review Checklist

- [ ] Type safety (TypeScript/Python type hints)
- [ ] Tests (>80% coverage)
- [ ] Error handling (try/catch, HTTPException)
- [ ] Documentation (docstrings, comments para lógica complexa)
- [ ] No console.log / print statements (production)
- [ ] Environment variables (não hardcoded secrets)
- [ ] Performance (queries otimizadas, memoization)
- [ ] Accessibility (alt text, ARIA labels)

---

## 🚨 Regras de Segurança

1. **Nunca** commit `.env` com secrets reais
2. **Sempre** usar `.env.example` como template
3. **Validar** inputs no backend (SQL injection prevention)
4. **Sanitizar** dados Excel antes de inserir em BD
5. **HTTPS** em produção (certificado SSL)
6. **CORS** configurado apenas para origens permitidas
7. **Rate limiting** em endpoints de upload

---

## 📊 Métricas de Qualidade

**Alvos**:
- Test Coverage: > 80%
- Type Coverage: 100% (TS/Python)
- Build Time: < 2 minutos
- Bundle Size: < 500KB (React)
- API Response Time: < 500ms (p95)

---

## 🔗 Recursos Úteis

- [Docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) - Design do sistema
- [Docs/API.md](docs/API.md) - Especificação da API
- [Docs/SETUP.md](docs/SETUP.md) - Setup local
- [PLANO_DESENVOLVIMENTO.md](PLANO_DESENVOLVIMENTO.md) - Roadmap

---

## 🐛 Debugging

### Backend
```python
# Use logging
import logging
logger = logging.getLogger(__name__)
logger.info(f"Processing cluster: {cluster}")

# FastAPI debugger
from fastapi import FastAPI
app = FastAPI(debug=True)
```

### Frontend
```bash
# Browser DevTools (F12)
# Check Network tab for API calls
# Check Console for errors

# React DevTools
# Check component tree and state

# Redux DevTools (if using Redux)
```

---

## 📞 Contato & Escalação

- **Issues técnicas**: Contate o Dev Lead
- **Design questions**: Contate UX Designer
- **Deploy issues**: Contate DevOps
- **General questions**: Contate Orion (Orchestrator)

---

**Última Atualização**: 2026-06-25  
**Versão**: 1.0.0  
**Mantido por**: Orion 👑
