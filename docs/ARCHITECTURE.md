# 🏗️ Arquitetura - Jarvis MCLL

## Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Dashboard com 7 Painéis (abas)                      │   │
│  │  - Painel de Redes (Backbone + Acesso)              │   │
│  │  - Painel B2B (Abertos + Encerrados)                │   │
│  │  - Painel Repetidos                                 │   │
│  │  - Produtividade OFS                                │   │
│  │  - Frota & Combustível                              │   │
│  │  - Central de Bases                                 │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST
┌──────────────────────▼──────────────────────────────────────┐
│              BACKEND API (FastAPI)                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Endpoints:                                          │   │
│  │  - POST /upload (Excel processing)                  │   │
│  │  - GET /redes (análise Backbone + Acesso)          │   │
│  │  - GET /b2b (tickets)                              │   │
│  │  - GET /frota (veículos)                           │   │
│  │  - GET /filters (CLUSTER, MÊS, SEMANA, MOP/EPS)   │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────┘
                       │ SQL
┌──────────────────────▼──────────────────────────────────────┐
│         DATABASE (PostgreSQL + TimescaleDB)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Tabelas:                                            │   │
│  │  - redes_backbone (séries temporais)                │   │
│  │  - redes_acesso (séries temporais)                  │   │
│  │  - tickets_b2b                                       │   │
│  │  - produtividade_ofs                                │   │
│  │  - frota_veiculo                                    │   │
│  │  - frota_abastecimento                              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Stack Técnico

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Material-UI** - Component library
- **Recharts** - Data visualization
- **Axios** - HTTP client
- **React Router** - Navigation

### Backend
- **FastAPI** - Web framework
- **SQLAlchemy** - ORM
- **Pydantic** - Data validation
- **Pandas** - Data processing
- **OpenPyXL** - Excel parsing
- **PostgreSQL** - Database

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Orchestration
- **Nginx** - Reverse proxy (produção)

## 🔄 Fluxo de Dados

### 1. Upload de Excel

```
User → Frontend Form
  ↓
POST /api/upload (Excel file)
  ↓
Backend: Parse com Pandas
  ↓
Validação de esquema
  ↓
Inserção em PostgreSQL
  ↓
Response: {status: "success", rows: 1234}
```

### 2. Consulta de Dados com Filtros

```
User selects: CLUSTER=MA_CAP, MÊS=06, SEMANA=W2
  ↓
GET /api/redes/backbone?cluster=MA_CAP&mes=06&semana=W2
  ↓
Backend:
  - Query PostgreSQL com filtros
  - Calcula TME, PRAZO, OUTLIER
  - Agrupa por CIDADE
  ↓
Response: {metrics: {...}, dados: [...]}
  ↓
Frontend: Renderiza gráficos + tabela
```

### 3. Cálculo de Indicadores

**TME (Tempo Médio de Execução)**
```
TME = SUM(TMR) / COUNT(registros)
```

**PRAZO**
```
% Prazo = COUNT(PRAZO=1) / COUNT(total) × 100
Meta: 88,90%
```

**OUTLIER**
```
% Outlier = COUNT(OUTLIER=1) / COUNT(total) × 100
Meta: 4,90%
```

## 🗄️ Schema de Dados

### Tabela: redes_backbone
```sql
CREATE TABLE redes_backbone (
  id BIGSERIAL PRIMARY KEY,
  os VARCHAR(50) UNIQUE,
  titulo VARCHAR(255),
  falha TEXT,
  data_fechamento TIMESTAMP WITH TIME ZONE,
  cidade VARCHAR(100),
  uf VARCHAR(2),
  tme FLOAT,           -- Tempo Médio de Execução (horas)
  prazo BOOLEAN,       -- 1=dentro do prazo, 0=fora
  outlier BOOLEAN,     -- 1=outlier (>24h), 0=normal
  cluster VARCHAR(20), -- MA_CAP, MA_INT, etc
  mop_eps VARCHAR(20), -- SLN_MA, GIGA+_MA, etc
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_redes_backbone_cluster ON redes_backbone(cluster);
CREATE INDEX idx_redes_backbone_data ON redes_backbone(data_fechamento DESC);
```

### Tabela: frota_veiculo
```sql
CREATE TABLE frota_veiculo (
  id SERIAL PRIMARY KEY,
  placa VARCHAR(10) UNIQUE,
  marca VARCHAR(50),
  modelo VARCHAR(50),
  motorista VARCHAR(100),
  saldo_alelo DECIMAL(10, 2),
  data_cadastro TIMESTAMP DEFAULT NOW()
);
```

## 🔐 Autenticação (Futuro)

- JWT tokens
- Refresh tokens com validade
- Roles: admin, analyst, technician

## 📊 Painéis Planejados

### FASE 1 (Atual)
- [x] Estrutura base
- [ ] Painel de Redes
- [ ] Upload de Excel

### FASE 2
- [ ] Painel Frota & Combustível
- [ ] Persistência em DB

### FASE 3
- [ ] Painel B2B
- [ ] Painel OFS
- [ ] Autenticação

### FASE 4
- [ ] Real-time com WebSocket
- [ ] Alertas automáticos
- [ ] Export PDF/Excel

---

**Versão**: 1.0.0  
**Data**: 2026-06-25  
**Mantido por**: Orion (Orchestrator)
