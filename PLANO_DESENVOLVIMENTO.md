# 🎯 Plano de Desenvolvimento - Jarvis MCLL

**Status**: 🟢 FASE 1 INICIADA  
**Data Início**: 2026-06-25  
**Orchestrador**: Orion (Master)  
**Stack**: React 18 + Python/FastAPI + PostgreSQL

---

## 📋 FASE 1: Setup & Painel de Redes (PRIORIDADE)

### 🔧 1.1 - Configuração do Ambiente
- [x] Inicializar git repository
- [x] Criar estrutura de diretórios
- [x] Configurar Docker Compose
- [x] Criar documentação base (Architecture, Setup, API)
- [ ] **Próximo**: Testar stack local (Docker + npm install)

**Estimativa**: 2 horas

---

### 📡 1.2 - Painel de Redes (Backbone + Acesso)

#### Backend Tasks:

**1.2.1 - Modelos de Dados** (Database Layer)
```
[ ] Criar models SQLAlchemy:
  - RedeBackbone (os, titulo, falha, data_fechamento, cidade, uf, tme, prazo, outlier, cluster, mop_eps)
  - RedeAcesso (os, cidade, uf, data_abertura, data_fechamento, tme, causa, prazo, outlier, cluster, mop_eps)
  - Cluster (id, label, regiao)
  - MopEps (id, cluster, label)
[ ] Criar migrations Alembic
[ ] Testes unitários
```
**Estimativa**: 6 horas

**1.2.2 - API de Upload** (Endpoints)
```
[ ] POST /api/upload
  - Receber arquivo Excel (BASE_REDE.xlsx)
  - Validar colunas esperadas
  - Parse com Pandas
  - Inserir em PostgreSQL
  - Retornar status + quantidade de registros
[ ] Error handling (arquivo inválido, colunas faltando)
[ ] Testes unitários
```
**Estimativa**: 4 horas

**1.2.3 - Endpoints de Consulta** (Query Layer)
```
[ ] GET /api/redes/backbone
  - Query com filtros: cluster, mes, semana, mop_eps
  - Calcular métricas: TME médio, % Prazo, % Outlier
  - Retornar dados paginados
[ ] GET /api/redes/acesso (mesmos filtros)
[ ] GET /api/redes/combined (Backbone + Acesso)
[ ] GET /api/filters (retornar opções disponíveis)
[ ] Testes de integração
```
**Estimativa**: 8 horas

**1.2.4 - Processamento de Dados**
```
[ ] Normalizar dados de Excel:
  - Limpar NULL/vazios
  - Converter tipos (dates, floats)
  - Calcular cluster baseado em cidade (regra de negócio)
  - Validar TME (deve ser número)
[ ] Agregar por CIDADE, CLUSTER, MOP_EPS
[ ] Cache de dados processados
```
**Estimativa**: 4 horas

---

#### Frontend Tasks:

**1.2.5 - Componentes UI Básicos**
```
[ ] Layout principal (AppBar, Sidebar, Content)
[ ] Componente de Upload (Drag & Drop)
[ ] Card de Métricas (TME, % Prazo, % Outlier)
[ ] Filtros (CLUSTER, MÊS, SEMANA, MOP/EPS)
[ ] Tabela de dados (10 registros por página)
```
**Estimativa**: 6 horas

**1.2.6 - Gráficos & Visualizações**
```
[ ] Gráfico de distribuição por CIDADE (barras)
[ ] Gráfico de tendência de TME (linha)
[ ] Distribuição de PRAZO vs OUTLIER (pizza/doughnut)
[ ] Cards com top 8 cidades
[ ] Responsive design (mobile + tablet)
```
**Estimativa**: 6 horas

**1.2.7 - Integração API**
```
[ ] Axios client com base URL configurável
[ ] Service de chamadas à API
[ ] Loading states
[ ] Error handling
[ ] Testes com dados mock
```
**Estimativa**: 4 horas

---

### ✅ FASE 1 - Checklist de Conclusão

- [ ] Backend: Upload funcionando
- [ ] Backend: Queries com filtros retornando dados corretos
- [ ] Frontend: Componentes renderizando
- [ ] Frontend: Gráficos exibindo dados
- [ ] Frontend: Filtros atualizando dados em tempo real
- [ ] Docker: Tudo rodando com `docker-compose up`
- [ ] Testes: Cobertura > 80%
- [ ] Documentação: API documentada (Swagger)

**Estimativa Total FASE 1**: 40 horas

---

## 📦 FASE 2: Painel Frota & Combustível (SEGUNDA PRIORIDADE)

### 🚗 2.1 - Gestão de Veículos

**Backend**:
```
[ ] Model: FrotaVeiculo (placa, marca, modelo, motorista, saldo_alelo)
[ ] CRUD Endpoints: POST/GET/PUT/DELETE /api/frota/veiculos
[ ] Validação de placa (formato)
[ ] Testes
```
**Estimativa**: 6 horas

**Frontend**:
```
[ ] Tela de cadastro de veículos
[ ] Listagem com cards
[ ] Edição/Exclusão
[ ] Integração API
```
**Estimativa**: 6 horas

### ⛽ 2.2 - Gestão de Abastecimento

**Backend**:
```
[ ] Model: FrotaAbastecimento (veiculo_id, data, valor, observacoes)
[ ] POST /api/frota/abastecimento (registrar)
[ ] GET /api/frota/abastecimento (histórico)
[ ] Cálculo de saldo automático
```
**Estimativa**: 4 horas

**Frontend**:
```
[ ] Formulário de abastecimento
[ ] Histórico de transações
[ ] Gráfico de consumo por veículo
[ ] Cards de saldo (Geral, Solicitado, Aportes, Retiradas)
```
**Estimativa**: 8 horas

---

## 🔮 FASE 3: B2B & Produtividade (TERCEIRA PRIORIDADE)

### B2B Abertos + Encerrados
```
[ ] Models: TicketAberto, TicketEncerrado
[ ] Upload endpoints
[ ] Queries com filtros
[ ] Gráficos de status e segmento
[ ] Tabela com paginação
```
**Estimativa**: 20 horas

### Produtividade OFS
```
[ ] Model: ProdutividadeOFS
[ ] Upload e processamento
[ ] Análise por técnico
[ ] Cards de top técnicos
[ ] Gráfico de atividades
```
**Estimativa**: 12 horas

---

## 🚀 FASE 4: Melhorias & Deploy

```
[ ] Autenticação JWT
[ ] Real-time com WebSocket
[ ] LocalStorage para persistência
[ ] Export PDF/Excel
[ ] Alertas automáticos
[ ] CI/CD (GitHub Actions)
[ ] Deploy em staging
```
**Estimativa**: 30 horas

---

## 🗺️ Timeline Estimada

| Fase | Sprint | Duração | Status |
|------|--------|---------|--------|
| 1 | 1-2 | 2 semanas | 🟢 Em Progresso |
| 2 | 2-3 | 1.5 semana | ⏳ Planejado |
| 3 | 3-4 | 2 semanas | ⏳ Planejado |
| 4 | 4-5 | 2 semanas | ⏳ Planejado |

**Total Estimado**: 6-7 semanas até MVP em produção

---

## 👥 Assignments

| Componente | Responsável | Status |
|-----------|------------|--------|
| Database Setup | Orion | ✅ Done |
| Backend API (Redes) | Dev Team | ⏳ Next |
| Frontend Dashboard | UI Team | ⏳ Next |
| DevOps/Docker | DevOps | ✅ Done |
| QA/Testes | QA Team | ⏳ Next |

---

## 📊 Dependências

```
Frontend
  ↓ (depends on)
Backend API
  ↓ (depends on)
Database
  ↓ (depends on)
Excel Files (BASE_REDE.xlsx)
```

**Bloqueadores atuais**: Nenhum ✅

---

## 🎯 Próximos Passos (Imediatos)

1. **Hoje**: ✅ Setup completado
2. **Amanhã**: Começar 1.2.1 (Models de Dados)
3. **Dia 3**: 1.2.2 (API de Upload)
4. **Dia 4-5**: Testes + integração com Frontend

---

## 📝 Notas

- Usar TypeScript no frontend para type safety
- Testes unitários para backend (pytest)
- Validação de schema para upload Excel
- Considerar usar TimescaleDB para séries temporais (futuro)
- Documentar APIs com Swagger/OpenAPI

---

**Versão do Plano**: 1.0.0  
**Última Atualização**: 2026-06-25  
**Maintainer**: Orion (Orchestrator) 👑
