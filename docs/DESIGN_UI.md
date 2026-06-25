# 🎨 Design UI/UX - Jarvis MCLL

**Versão**: 1.0.0  
**Data**: 2026-06-25  
**Status**: ✅ Implementado

---

## 📐 Layout Principal

```
┌─────────────────────────────────────────────────────────────┐
│ 👑 Jarvis MCLL          Notificações ⚙️ Settings 👤 Profile │
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│ 📊 Nav   │  [Painel de Redes - Conteúdo Principal]         │
│          │                                                   │
│ Home     │  Tabs: [Backbone] [Acesso] [Combinado]          │
│ ──────   │                                                   │
│          │  Upload Zone (Drag & Drop)                       │
│ 📡 Redes │  ┌──────────────────────────────────────┐       │
│          │  │  📤 Arraste BASE_REDE.xlsx aqui   │       │
│          │  └──────────────────────────────────────┘       │
│ 🔴 B2B   │                                                   │
│          │  Filtros:                                        │
│ 🚗 Frota │  [Cluster ▼] [Mês ▼] [Semana ▼] [MOP/EPS ▼]   │
│          │                    [Limpar] [Atualizar ↻]        │
│ ─────    │                                                   │
│          │  Métricas (Grid 2x2 or 4x1):                     │
│ 📁 Bases │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│          │  │Total OS  │ │TME Médio │ │% Prazo   │         │
│ ⚙️ Config│  │    126   │ │  5.2 h   │ │  87.3%   │         │
│          │  └──────────┘ └──────────┘ └──────────┘         │
│ ?  Ajuda │                                                   │
│          │  ┌──────────┐                                     │
│          │  │% Outlier │                                     │
│          │  │   2.1%   │                                     │
│          │  └──────────┘                                     │
│          │                                                   │
│          │  Gráficos (Grid 2x2):                            │
│          │  ┌─────────────────────┐ ┌──────────────────┐   │
│          │  │  📊 Cidades (Barras)│ │📈 TME (Linha)    │   │
│          │  │                     │ │                  │   │
│          │  │  ▄                  │ │  ╱ ╲ ╱           │   │
│          │  │  █ █ █ █ █          │ │ ╱   ╲╱            │   │
│          │  └─────────────────────┘ └──────────────────┘   │
│          │  ┌─────────────────────┐ ┌──────────────────┐   │
│          │  │⏱️  Prazo vs Fora    │ │⚠️  Outliers      │   │
│          │  │  No Prazo │ Fora   │ │  Normal │Outlier │   │
│          │  │   ◯ ─── ◯ ◯ ──     │ │   ◯ ───── ◯     │   │
│          │  │   87%     13%      │ │   98%    2%      │   │
│          │  └─────────────────────┘ └──────────────────┘   │
│          │                                                   │
│          │  Tabela (Últimos 10 registros):                  │
│          │  ┌─────────────────────────────────────────┐    │
│          │  │ OS  │ Cidade │ TME  │ Prazo│ Status   │    │
│          │  ├─────────────────────────────────────────┤    │
│          │  │ OS1 │ São Luís│ 4.5h │ ✓  │ Outlier  │    │
│          │  │ OS2 │ São Luís│ 5.2h │ ✓  │ Normal   │    │
│          │  └─────────────────────────────────────────┘    │
│          │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

---

## 🎯 Componentes Principais

### 1. AppBar (Top Navigation)
```
┌──────────────────────────────────────────────────────────────┐
│ ☰ 👑 Jarvis MCLL  ›  Painel de Redes    🔔 ⚙️ 👤           │
└──────────────────────────────────────────────────────────────┘
```

**Características**:
- Logo + Título do projeto
- Breadcrumb com página atual
- Ícones de notificações, settings, profile (à direita)
- Responsivo (menu hamburger em mobile)

---

### 2. Sidebar (Navigation)
```
┌──────────────┐
│ 📊 Jarvis    │
│ Acompanham.  │
├──────────────┤
│ NAVEGAÇÃO    │
│ 🏠 Dashboard │
├──────────────┤
│ ANÁLISES     │
│ 📡 Redes ✓   │
│ 🔴 B2B       │
│ 🚗 Frota     │
├──────────────┤
│ ADMIN        │
│ 📁 Bases     │
│ ⚙️ Config    │
├──────────────┤
│ ? Ajuda      │
└──────────────┘
```

**Características**:
- Seções agrupadas (Navegação, Análises, Admin)
- Item ativo destacado (azul)
- Ícones + labels
- Colapsível em mobile

---

### 3. MetricCards
```
┌─────────────────────────────┐
│ TOTAL OS              [🔵]  │
│                             │
│         126                 │
│                             │
│ ↗ +5.2%  vs semana anterior │
│                             │
│ Progresso: ▓▓▓░░░░░░ 87%    │
└─────────────────────────────┘
```

**Variantes de Cores**:
- 🔵 Primary (#378ADD) - Informação
- 🟢 Secondary (#1D9E75) - Sucesso
- 🟠 Warning (#FFA726) - Atenção
- 🔴 Error (#EF5350) - Crítico

---

### 4. UploadZone
```
┌────────────────────────────────┐
│        📤                       │
│  Arraste o arquivo ou clique    │
│                                │
│ BASE_REDE.xlsx (esperado)      │
│                                │
│    [Zona sensível ao drag]     │
└────────────────────────────────┘
```

**Estados**:
- **Padrão**: Cinza (aguardando upload)
- **Hover/Drag**: Azul (pronto para soltar)
- **Loading**: Barra de progresso
- **Success**: Verde + checkmark
- **Error**: Vermelho + mensagem

---

### 5. FilterBar
```
┌──────────────────────────────────────────────────────────────┐
│ [Cluster ▼] [Mês ▼] [Semana ▼] [MOP/EPS ▼]  [Limpar] [↻]   │
└──────────────────────────────────────────────────────────────┘
```

**Características**:
- 4 dropdowns principais
- Botão "Limpar" (desativado se sem filtros)
- Botão "Atualizar" (sempre ativo)
- Respons: empilhados em mobile

---

### 6. Gráficos (Recharts)

#### Bar Chart - Cidades
```
  OS por Cidade
  120 │
      │     ▁
   80 │ ▂▆ █▂ ▁
      │ █▆ ██▂ ▁
   40 │ ███▆▆█▂ ▁
      │ █████████
    0 └─────────────
      SL  MO  PM  IT...
```

#### Line Chart - TME Trend
```
  TME ao longo do tempo
    6 │    ╱╲
      │   ╱  ╲    ╱
    4 │  ╱    ╲──╱
      │ ╱
    2 │
      └────────────────
      1º  2º  3º  4º semana
```

#### Pie Chart - Status
```
  Prazo vs Fora do Prazo
        ◯ ─────── ◯
       ╱  87% No   \
      │   Prazo     │
       \  13% Fora /
        ◯ ─────── ◯
```

---

## 🎨 Paleta de Cores

| Uso | Cor | Hex | RGB |
|-----|-----|-----|-----|
| Primary | Azul | #378ADD | rgb(55, 138, 221) |
| Secondary | Verde | #1D9E75 | rgb(29, 158, 117) |
| Warning | Laranja | #FFA726 | rgb(255, 167, 38) |
| Error | Vermelho | #EF5350 | rgb(239, 83, 80) |
| Success | Verde Claro | #66BB6A | rgb(102, 187, 106) |
| Background | Cinza Claro | #F5F7FA | rgb(245, 247, 250) |
| Surface | Branco | #FFFFFF | rgb(255, 255, 255) |
| Text | Escuro | #1F2937 | rgb(31, 41, 55) |
| Text Secondary | Cinza | #6B7280 | rgb(107, 114, 128) |

---

## 📐 Tipografia

| Uso | Font | Size | Weight |
|-----|------|------|--------|
| Heading 1 | Roboto | 2.5rem | 700 |
| Heading 2 | Roboto | 2rem | 700 |
| Heading 3 | Roboto | 1.5rem | 600 |
| Heading 4 | Roboto | 1.25rem | 600 |
| Heading 5 | Roboto | 1rem | 600 |
| Body 1 | Roboto | 1rem | 400 |
| Body 2 | Roboto | 0.875rem | 400 |
| Caption | Roboto | 0.75rem | 500 |

---

## 📱 Responsividade

### Desktop (lg: >1200px)
```
Sidebar (permanent) | Main Content (1fr)
Metrics: 4 colunas
Gráficos: 2x2 grid
Tabela: 100% width
```

### Tablet (md: 960px - 1200px)
```
Sidebar (temporary) | Main Content (1fr)
Metrics: 2 colunas (2x2)
Gráficos: 2x2 grid
Tabela: scroll horizontal
```

### Mobile (xs: <600px)
```
Sidebar (drawer) | Main Content (1fr)
Metrics: 1 coluna (4 cards empilhados)
Gráficos: 1x4 grid (scroll vertical)
Tabela: scroll horizontal (responsivo)
```

---

## 🎭 Estados & Interações

### Loading
- Spinner circular (60px)
- Skeleton loaders em cards
- Barra de progresso em upload

### Hover
- Cards: elevação aumenta (box-shadow)
- Botões: fundo mais escuro (10% mais escuro)
- Linhas de tabela: fundo cinza claro

### Active
- Tabs: underline azul
- Nav Items: fundo azul claro, texto azul
- Badges: fundo colorido, cor do texto branco

### Error
- Alert vermelha com ícone de erro
- Border vermelha em inputs
- Mensagem descritiva abaixo

### Success
- Toast verde ou inline alert
- Checkmark icon
- Mensagem de confirmação

---

## 🔌 Componentes Reutilizáveis

### MetricCard
```typescript
<MetricCard
  label="Total OS"
  value={126}
  unit="chamados"
  icon={<NetworkIcon />}
  color="primary"
  trend={5.2}
  trendLabel="vs semana anterior"
  progress={87}
/>
```

### UploadZone
```typescript
<UploadZone
  onFileSelect={handleFile}
  panel="redes"
  isLoading={uploading}
  error={error}
  success={success}
/>
```

### FilterBar
```typescript
<FilterBar
  onFilterChange={handleFilters}
  onRefresh={refresh}
  loading={loading}
/>
```

---

## 🎬 Animações

| Elemento | Efeito | Duração |
|----------|--------|---------|
| Cards | Fade + Slide up | 300ms |
| Tooltips | Fade | 200ms |
| Tab Change | Cross-fade | 150ms |
| Loading Spinner | Rotation | Contínuo |
| Transitions | Smooth | 300ms |

---

## ♿ Acessibilidade (A11y)

- ✅ Contrast ratio > 4.5:1 (WCAG AA)
- ✅ Elementos focáveis com keyboard
- ✅ ARIA labels em ícones
- ✅ Semantic HTML
- ✅ Color não é único indicador (+ ícones)
- ✅ Alt text em imagens (quando houver)

---

## 🎯 Painel de Redes - Vista Completa

```
┌─────────────────────────────────────────────────────────────┐
│ 👑 Jarvis MCLL › Painel de Redes          🔔 ⚙️ 👤          │
├─────┬───────────────────────────────────────────────────────┤
│ 📡  │ PAINEL DE REDES                                      │
│ Nav │ Análise de Backbone e Acesso                        │
│     │                                                      │
│     │ ┌────────────────────────────────────────────────┐  │
│     │ │  📤  Arraste BASE_REDE.xlsx aqui ou clique   │  │
│     │ │         [Upload Zone]                         │  │
│     │ └────────────────────────────────────────────────┘  │
│     │                                                      │
│     │ Filtros:                                            │
│     │ ┌────────────────────────────────────────────────┐  │
│     │ │[Cluster] [Mês] [Semana] [MOP] [Limpar] [↻]   │  │
│     │ └────────────────────────────────────────────────┘  │
│     │                                                      │
│     │ Tabs: [📡 Backbone] [🔗 Acesso] [📊 Combinado]     │
│     │                                                      │
│     │ MÉTRICAS                                            │
│     │ ┌──────────────┐ ┌──────────────┐                  │
│     │ │📡 Total OS   │ │⏱️  TME Médio │                  │
│     │ │     126      │ │     5.2 h    │                  │
│     │ └──────────────┘ └──────────────┘                  │
│     │                                                      │
│     │ ┌──────────────┐ ┌──────────────┐                  │
│     │ │✓ % Prazo     │ │⚠️ % Outlier  │                  │
│     │ │   87.3%      │ │    2.1%      │                  │
│     │ │ ▓▓▓▓░░░░░░   │ │ ░░░░░░░░░░  │                  │
│     │ └──────────────┘ └──────────────┘                  │
│     │                                                      │
│     │ GRÁFICOS                                            │
│     │ ┌─────────────────────────┐ ┌──────────────────┐   │
│     │ │  📍 Cidades (Barras)    │ │ 📈 TME (Linha)   │   │
│     │ │                         │ │                  │   │
│     │ │      ▁▂▃█▄█            │ │   ╱╲    ╱       │   │
│     │ │    ▂█████████▂         │ │  ╱  ╲╱╲╱        │   │
│     │ │   ▂██████████████▂     │ │                  │   │
│     │ │  ▂█████████████████▂   │ │ Semana 1→4       │   │
│     │ └─────────────────────────┘ └──────────────────┘   │
│     │                                                      │
│     │ ┌─────────────────────────┐ ┌──────────────────┐   │
│     │ │  ⏱️  Prazo vs Fora      │ │ ⚠️ Outliers      │   │
│     │ │                         │ │                  │   │
│     │ │    ╱─────╲              │ │    ╱───╲         │   │
│     │ │   ╱ 87%   ╲             │ │   ╱ 98% ╲        │   │
│     │ │  │ No Prazo│             │ │  │Normal│        │   │
│     │ │   ╲  13%  ╱             │ │   ╲ 2%╱         │   │
│     │ │    ╲─────╱              │ │    ╲───╱         │   │
│     │ │    Fora                 │ │  Outlier         │   │
│     │ └─────────────────────────┘ └──────────────────┘   │
│     │                                                      │
│     │ TABELA - Últimos 10 registros                       │
│     │ ┌───┬──────────┬─────┬───────┬──────────────────┐   │
│     │ │OS │ Cidade   │TME  │Prazo  │Status            │   │
│     │ ├───┼──────────┼─────┼───────┼──────────────────┤   │
│     │ │001│São Luís  │4.5h │✓ OK   │🟢 Normal         │   │
│     │ │002│Ribamar   │5.2h │✓ OK   │⚠️ Outlier        │   │
│     │ │003│Paço      │6.1h │✗ Fora │🔴 Crítico        │   │
│     │ └───┴──────────┴─────┴───────┴──────────────────┘   │
│     │                                                      │
│     │                            [←Anterior] [Próximo→]   │
│     │                                                      │
└─────┴───────────────────────────────────────────────────────┘
```

---

## 🚀 Performance Visual

- **First Contentful Paint**: < 2s
- **Time to Interactive**: < 3s
- **Largest Contentful Paint**: < 2.5s
- **Animations**: 60fps (smooth)
- **Bundle Size**: < 500KB (gzipped)

---

## 📋 Próximos Painéis (Design)

- **Painel B2B**: Cards de tickets, tabelas, gráficos de segmento
- **Painel Frota**: CRUD de veículos, cards de saldo, histórico
- **Central de Bases**: Status de uploads, última atualização

---

**Implementação**: ✅ React 18 + Material-UI + Recharts  
**Pronto para**: Testes de usabilidade + Feedback  
**Próximo**: Backend integration
