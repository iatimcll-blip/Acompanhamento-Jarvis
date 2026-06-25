# 🎯 Jarvis MCLL v3.0 - Guia de Módulos em Abas

## Visão Geral

O **Jarvis MCLL v3.0** é um painel com **7 módulos independentes** em formato de abas. Cada aba/módulo:
- ✅ Possui seu próprio upload de base
- ✅ Tem filtros e gráficos específicos
- ✅ Renderiza dados isoladamente
- ✅ Pode ser atualizado independentemente

---

## 🎛️ Os 7 Módulos

### 1️⃣ **Painel de Redes** 📡
**Base**: `BASE_REDE.xlsx`

**Dados**:
- BACKBONE: 468 registros (OS, Cidade, UF, TME, Prazo, Outlier)
- ACESSO: 1.651 registros

**Visualizações**:
- Métrica: Total OS, TME Médio, % No Prazo
- Gráfico: Distribuição por cidade (barras)
- Cards: Top 8 cidades
- Tabela: 10 últimos registros

**Filtros**:
- UF/Cluster
- Tipo de Rede (Backbone/Acesso)
- Status

---

### 2️⃣ **Painel B2B - Abertos** 🔴
**Base**: `BASE_ABERTOS.xlsx`

**Dados**:
- 21 tickets abertos
- Colunas: ID Ticket, Cliente, Departamento, Status, Abertura, Tempo (dias)

**Visualizações**:
- Métrica: Total Abertos, Tempo Médio (dias)
- Gráfico: Distribuição por status (doughnut)
- Cards: Status de cada ticket
- Tabela: 10 tickets

**Filtros**:
- Status (On Hold, Pendente, etc)

---

### 3️⃣ **Painel B2B - Encerrados** 🔧
**Base**: `BASE_B2B_ENCERRADOS.xlsx`

**Dados**:
- 1.984 tickets encerrados
- Colunas: Ticket ID, Cliente, Segmento, Valor, Data, Status

**Visualizações**:
- Métrica: Total Encerrado, Valor Total (R$)
- Gráfico: Distribuição por segmento (pizza)
- Cards: Segmentos (Corporativo, PME, etc)
- Tabela: 10 últimos encerrados

**Cálculos**:
- Valor em R$ mil
- % Prazo atingido
- Distribuição por segmento

---

### 4️⃣ **Painel Repetidos** 🔁
**Base**: Usa dados de B2B Encerrados (mesmo upload)

**Análise**:
- Cruzamento `numplan + cliente_id`
- Detecta chamados que se repetem
- Calcula taxa de repetição

**Visualizações**:
- Métrica: Total Chamados, Chamados Repetidos, Taxa (%)
- Gráfico: Com vs Sem repetição (doughnut)
- Tabela: Top chamados repetidos

**Requisito**:
- Carregar Base de Encerrados primeiro

---

### 5️⃣ **Painel OFS** 👥
**Base**: `BASE_PRODUTIVIDADE_OFS.xlsx`

**Dados**:
- 998+ atividades
- Colunas: Data, Técnico, Atividade, Tipo, Status, OS

**Visualizações**:
- Métrica: Total Atividades, Técnicos Ativos, % Concluído
- Gráfico: Tipo de atividade (barras horizontais)
- Cards: Top 10 técnicos
- Tabela: 10 últimas atividades

**Cálculos**:
- % Concluído (meta: ≥80%)
- Técnicos únicos
- Distribuição por tipo

---

### 6️⃣ **Painel Frota** 🚗
**Base**: A definir (nova base quando disponível)

**Estrutura Preparada para**:
- Gerenciamento de veículos
- Saldos Alelo
- Consumo de combustível
- Aportes e retiradas

**Funcionalidade**:
- Upload independent quando base estiver pronta
- Cards de veículos ativos
- Histórico de transações

---

### 7️⃣ **Central de Bases** 📁
**Tipo**: Dashboard de status

**Mostra**:
- Quantas linhas de cada base foram carregadas
- Data/hora da última atualização
- Status de cada módulo
- Instruções de uso

**Funcionalidades**:
- Visão centralizada
- Rastreamento de atualizações
- Links para upload de cada base

---

## 📊 Exemplo de Uso Completo

### Cenário: Análise Regional (MA - Maranhão)

**Passo 1**: Abrir painel
```
Arquivo → painel_modulos_v3.html
```

**Passo 2**: Aba "Painel de Redes"
```
1. Upload: BASE_REDE.xlsx
2. Aguardar carregamento
3. Ver: 126 OS em MA
4. TME Médio: 5.2h
5. % Prazo: 87%
```

**Passo 3**: Aba "B2B - Abertos"
```
1. Upload: BASE_ABERTOS.xlsx
2. Ver: 3 tickets abertos em MA
3. Status: On Hold, Pendente
4. Tempo médio: 15 dias
```

**Passo 4**: Aba "B2B - Encerrados"
```
1. Upload: BASE_B2B_ENCERRADOS.xlsx
2. Ver: 156 tickets encerrados
3. Valor: R$ 78.500
4. Segmentos: Corporativo 67%, PME 33%
```

**Passo 5**: Aba "Repetidos"
```
1. (Usa mesmos dados de Encerrados)
2. Ver: 12 chamados repetidos
3. Taxa: 7.7%
4. Top: Cliente X (4 vezes), Cliente Y (3 vezes)
```

**Passo 6**: Aba "OFS"
```
1. Upload: BASE_PRODUTIVIDADE_OFS.xlsx
2. Ver: 245 atividades
3. Técnicos: 8 ativos
4. % Concluído: 84%
5. Top: João (45 ativ), Maria (42 ativ)
```

**Passo 7**: Central de Bases
```
1. Visualizar todas as bases carregadas
2. Confirmar data de atualização
3. Imprimir ou compartilhar status
```

---

## 🔧 Como Usar - Passo a Passo

### **Para Cada Módulo**:

1. **Clique na aba** (ex: "📡 Redes")
2. **Procure seção "Carregar BASE"**
3. **Clique para upload** ou **arraste arquivo**
4. **Aguarde mensagem de sucesso** ✓
5. **Visualize os dados renderizados**

### **Estrutura de Cada Aba**:

```
┌─────────────────────────────────┐
│ 📡 TÍTULO DO MÓDULO             │
│ Descrição breve                 │
├─────────────────────────────────┤
│ 📂 UPLOAD SECTION               │ ← Arraste aqui
│ [Zona de Upload]                │
├─────────────────────────────────┤
│ [MÉTRICAS] [CARDS] [GRÁFICO]   │ ← Dados renderizados
├─────────────────────────────────┤
│ [TABELA COM 10 REGISTROS]       │
└─────────────────────────────────┘
```

---

## 📋 Mapeamento: Módulo ↔ Base

| Módulo | Base | Aba Excel | Linhas |
|--------|------|-----------|--------|
| **Redes** | BASE_REDE.xlsx | BACKBONE + ACESSO | 468 + 1.651 |
| **B2B Abertos** | BASE_ABERTOS.xlsx | Planilha1 | 21 |
| **B2B Encerrados** | BASE_B2B_ENCERRADOS.xlsx | BASE ENCERRADO | 1.984 |
| **Repetidos** | *(Usa Encerrados)* | *(BASE ENCERRADO)* | *(1.984)* |
| **OFS** | BASE_PRODUTIVIDADE_OFS.xlsx | Base_Organizada | 998+ |
| **Frota** | *(Preparado)* | *(A definir)* | *(A definir)* |
| **Central de Bases** | *(Dashboard)* | *(N/A)* | *(N/A)* |

---

## 🎨 Componentes Renderizados

### **Métricas**
- Valores principais com cores (verde/amarelo/vermelho)
- TME, % Prazo, Total, etc

### **Cards de Dados**
- Grid de 8 elementos
- Cidade, Segmento, Técnico, Status
- Clicável (para futuros drill-downs)

### **Gráficos**
- Chart.js 3.9.1
- Tipos: Barras, Pizza, Doughnut, Barras Horizontais
- Cores padrão: Azul (#378ADD), Verde (#1D9E75), Amarelo, Vermelho

### **Tabelas**
- 10 últimos registros por padrão
- Scroll horizontal para mobile
- Badges de status (success, warning, danger)

---

## 💾 Persistência de Dados

- ✅ Dados persistem enquanto aba está aberta
- ✅ Cada aba mantém seus dados
- ❌ Recarregar página = limpa tudo
- 💡 Próxima versão: LocalStorage ou API

---

## 🚀 Fluxo de Atualização

### Cenário 1: Primeira Vez
```
1. Abrir painel
2. Clicar aba "Redes"
3. Upload BASE_REDE.xlsx
4. ✓ Renderizado em tempo real
```

### Cenário 2: Atualização Parcial
```
1. Aba "Redes" já tem dados antigos
2. Novo arquivo disponível
3. Upload novo arquivo
4. ✓ Sobrescreve e renderiza novos dados
```

### Cenário 3: Atualizar Todos os Módulos
```
1. Central de Bases → Ver qual desatualizado
2. Ir para aba específica
3. Upload novo arquivo
4. Repetir para cada módulo
5. ✓ Tudo sincronizado
```

---

## ⚙️ Campos Esperados por Aba

### **BASE_REDE.xlsx → BACKBONE**
```
A: OS
B: TÍTULO
D: FALHA (motivo)
H: DATA_FECHAMENTO
K: CIDADE
L: UF
R: TME (float, horas)
S: PRAZO (1 ou 0)
T: OUTLIER (1 ou 0)
```

### **BASE_REDE.xlsx → ACESSO**
```
A: OS
B: CIDADE_SIMPLES
C: UF
E: DATA_ABERTURA
F: DATA_FECHAMENTO
H: TME
M: CAUSA_SIMPLES
N: PRAZO (1 ou 0)
O: OUTLIER (1 ou 0)
```

### **BASE_ABERTOS.xlsx → Planilha1**
```
A: ID Ticket / Protocolo
B: Cliente
C: Departamento
F: Abertura do Ticket
G: Tempo (dias)
H: Status
K: Cidade
L: UF
```

### **BASE_B2B_ENCERRADOS.xlsx → BASE ENCERRADO**
```
A: ticket_id
F: numplan (para repetidos)
J: cliente_id (para repetidos)
K: Cliente
H: valorservico (R$)
N: data_fechamento
E: segmento_cliente
```

### **BASE_PRODUTIVIDADE_OFS.xlsx → Base_Organizada**
```
A: Data (YYYY-MM-DD)
B: Dia da Semana
C: Recurso (técnico)
D: Nome da Posição SAP
E: Atividade
F: Ordem de Serviço
G: Tipo de Atividade
H: Status da Atividade
```

---

## 🐛 Troubleshooting

### Problema: "Aguardando carregamento..."
**Solução**:
- Verificar se arquivo está em .xlsx
- Arquivo pode estar corrompido
- Tentar novamente

### Problema: Dados não aparecem
**Solução**:
- Verificar nome das abas (deve ser exato)
- Abrir arquivo no Excel e copiar nome exato
- Exemplo: "BASE ENCERRADO" (espaço, maiúscula)

### Problema: Apenas alguns campos aparecem
**Solução**:
- Verificar se coluna existe no arquivo
- Nomes de coluna devem ser exatos
- Consultar mapeamento acima

### Problema: Gráfico em branco
**Solução**:
- Dados podem estar vazios
- Tentar novo upload
- Abrir console (F12) para erros

---

## 📞 Suporte

**Dúvidas sobre**:
- Estrutura: Verificar "Mapeamento: Módulo ↔ Base" acima
- Upload: Confirmar nome exato da aba
- Renderização: Abrir DevTools (F12) → Console
- Novas bases: Documentar estrutura para próxima versão

---

## 🎯 Status da Implementação

| Módulo | Status | Upload | Renderização | Gráficos |
|--------|--------|--------|--------------|----------|
| Redes | ✅ Pronto | ✅ | ✅ | ✅ |
| B2B Abertos | ✅ Pronto | ✅ | ✅ | ✅ |
| B2B Encerrados | ✅ Pronto | ✅ | ✅ | ✅ |
| Repetidos | ✅ Pronto | - | ✅ | ✅ |
| OFS | ✅ Pronto | ✅ | ✅ | ✅ |
| Frota | ⏳ Estrutura | ✅ | ⏳ | ⏳ |
| Central de Bases | ✅ Pronto | - | ✅ | - |

---

**Versão**: 3.0 (Módulos em Abas)  
**Data**: 25/06/2026  
**Arquivo**: `painel_modulos_v3.html`  
**Tamanho**: ~45 KB  
**Status**: ✅ Pronto para Produção

---

## 🚀 Próximas Melhorias

- [ ] LocalStorage para persistência entre sessões
- [ ] Export de dados filtrados para Excel
- [ ] Export de gráficos como imagem
- [ ] Filtros avançados (data range, multi-select)
- [ ] Drill-down nos gráficos
- [ ] API de backend para real-time
- [ ] Relatório executivo em PDF
- [ ] Alertas automáticos

---

**Pronto para usar!** 🎉 Abra `painel_modulos_v3.html` e comece a fazer upload das bases.
