# 📡 API Reference - Jarvis MCLL

Base URL: `http://localhost:8000/api`

## Health & Status

### GET /health
Check API health status

**Response (200)**
```json
{
  "status": "ok",
  "message": "Jarvis MCLL API is running",
  "version": "1.0.0"
}
```

---

## Upload

### POST /upload

Upload Excel file and process data

**Request**
```
Content-Type: multipart/form-data

File: BASE_REDE.xlsx (binary)
panel: "redes" | "b2b" | "frota" | "produtividade"
```

**Response (200)**
```json
{
  "status": "success",
  "file": "BASE_REDE.xlsx",
  "panel": "redes",
  "rows_processed": 2119,
  "rows_backbone": 468,
  "rows_acesso": 1651,
  "timestamp": "2026-06-25T10:30:00Z"
}
```

**Error (400)**
```json
{
  "status": "error",
  "message": "Invalid file format",
  "details": "Expected .xlsx file"
}
```

---

## Redes (Backbone + Acesso)

### GET /redes/backbone

Retorna dados de Backbone com filtros aplicados

**Query Parameters**
```
cluster?   string  (MA_CAP, MA_INT, PI_CAP, etc)
mes?       string  (01-12)
semana?    string  (W1-W4)
mop_eps?   string  (SLN_MA, GIGA+_MA, etc)
limit?     number  (default: 10)
offset?    number  (default: 0)
```

**Example**
```
GET /redes/backbone?cluster=MA_CAP&mes=06&semana=W2&limit=10
```

**Response (200)**
```json
{
  "status": "success",
  "panel": "backbone",
  "metrics": {
    "total_os": 126,
    "tme_medio": 5.2,
    "percentual_prazo": 87.3,
    "percentual_outlier": 2.1
  },
  "dados": [
    {
      "os": "OS-2026-001",
      "titulo": "Falha em Fibra",
      "cidade": "Sao Luis",
      "uf": "MA",
      "tme": 4.5,
      "prazo": 1,
      "outlier": 0,
      "data_fechamento": "2026-06-20T14:30:00Z"
    },
    ...
  ],
  "total_records": 126,
  "page": 1,
  "filters_applied": {
    "cluster": "MA_CAP",
    "mes": "06",
    "semana": "W2"
  }
}
```

### GET /redes/acesso

Retorna dados de Acesso com filtros

**Query Parameters** (mesmos que backbone)

**Response**
```json
{
  "status": "success",
  "panel": "acesso",
  "metrics": {
    "total_os": 412,
    "tme_medio": 5.8,
    "percentual_prazo": 85.2,
    "percentual_outlier": 3.4
  },
  "dados": [...]
}
```

### GET /redes/combined

Retorna Backbone + Acesso combinados

---

## B2B

### GET /b2b/abertos

Retorna tickets abertos

**Query Parameters**
```
cluster?   string
mes?       string
status?    string
```

**Response (200)**
```json
{
  "status": "success",
  "panel": "b2b_abertos",
  "metrics": {
    "total_abertos": 21,
    "tempo_medio_dias": 15.3
  },
  "dados": [
    {
      "ticket": "TKT-2026-001",
      "cliente": "Empresa X",
      "status": "Aguardando Liberação de Acesso",
      "abertura": "2026-06-10",
      "tempo_dias": 15,
      "uf": "MA",
      "cidade": "Sao Luis"
    }
  ]
}
```

### GET /b2b/encerrados

Retorna tickets encerrados

**Query Parameters**
```
cluster?   string
mes?       string
segmento?  string
```

### GET /b2b/repetidos

Retorna análise de chamados repetidos

**Response**
```json
{
  "status": "success",
  "panel": "repetidos",
  "metrics": {
    "total_chamados": 1984,
    "chamados_repetidos": 152,
    "taxa_repeticao_pct": 7.7
  },
  "top_repetidos": [
    {
      "numplan": "NP-001",
      "cliente": "Cliente X",
      "quantidade_repeticoes": 4
    }
  ]
}
```

---

## Frota & Combustível

### GET /frota/veiculos

Retorna lista de veículos

**Response**
```json
{
  "status": "success",
  "panel": "frota",
  "dados": [
    {
      "id": 1,
      "placa": "ABC1234",
      "marca": "Fiat",
      "modelo": "Uno",
      "motorista": "João Silva",
      "saldo_alelo": 250.50,
      "data_cadastro": "2026-01-15"
    }
  ]
}
```

### POST /frota/abastecimento

Registra abastecimento

**Request**
```json
{
  "veiculo_id": 1,
  "data": "2026-06-25",
  "valor": 150.00,
  "observacoes": "Combustível"
}
```

**Response (201)**
```json
{
  "status": "success",
  "message": "Abastecimento registrado",
  "id": 123
}
```

---

## Filtros

### GET /filters

Retorna opções disponíveis para filtros

**Response**
```json
{
  "clusters": [
    {
      "id": "MA_CAP",
      "label": "MA - Capital",
      "cidades": ["Sao Luis", "Sao Jose de Ribamar", "Paco do Lumiar"]
    },
    {
      "id": "MA_INT",
      "label": "MA - Interior",
      "cidades": [...]
    }
  ],
  "meses": [
    { "id": "01", "label": "Janeiro" },
    ...
  ],
  "semanas": [
    { "id": "W1", "label": "Semana 1" },
    ...
  ],
  "mop_eps": [
    { "id": "SLN_MA", "label": "SLN MA" },
    { "id": "GIGA+_MA", "label": "GIGA+ MA" }
  ]
}
```

---

## Erros

### 400 Bad Request
```json
{
  "status": "error",
  "message": "Invalid query parameters",
  "details": "cluster must be one of: MA_CAP, MA_INT, ..."
}
```

### 404 Not Found
```json
{
  "status": "error",
  "message": "Resource not found",
  "details": "No data for the given filters"
}
```

### 500 Internal Server Error
```json
{
  "status": "error",
  "message": "Internal server error",
  "details": "Database connection failed"
}
```

---

## Autenticação (Futuro)

Usar Bearer token em header:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Rate Limiting (Futuro)

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

**Versão**: 1.0.0  
**Data**: 2026-06-25  
**Base URL**: http://localhost:8000/api  
**Docs interativos**: http://localhost:8000/docs
