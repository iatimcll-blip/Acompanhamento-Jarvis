// ===== REDES =====
export interface RedeBackbone {
  id?: number;
  os: string;
  titulo: string;
  falha: string;
  data_fechamento: string;
  cidade: string;
  uf: string;
  tme: number;
  prazo: boolean;
  outlier: boolean;
  cluster: string;
  mop_eps: string;
}

export interface RedeAcesso {
  id?: number;
  os: string;
  cidade: string;
  uf: string;
  data_abertura: string;
  data_fechamento: string;
  tme: number;
  causa: string;
  prazo: boolean;
  outlier: boolean;
  cluster: string;
  mop_eps: string;
}

export interface RedeMetrics {
  total_os: number;
  tme_medio: number;
  percentual_prazo: number;
  percentual_outlier: number;
}

export interface RedeResponse {
  status: string;
  panel: string;
  metrics: RedeMetrics;
  dados: RedeBackbone[] | RedeAcesso[];
  total_records: number;
  page: number;
  filters_applied: FilterCriteria;
}

// ===== B2B =====
export interface TicketAberto {
  id?: number;
  ticket: string;
  cliente: string;
  departamento: string;
  status: string;
  abertura: string;
  tempo_dias: number;
  uf: string;
  cidade: string;
}

export interface TicketEncerrado {
  id?: number;
  ticket_id: string;
  cliente: string;
  segmento: string;
  valor: number;
  data_fechamento: string;
  status: string;
}

// ===== FROTA =====
export interface FrotaVeiculo {
  id?: number;
  placa: string;
  marca: string;
  modelo: string;
  motorista: string;
  saldo_alelo: number;
  data_cadastro: string;
}

export interface FrotaAbastecimento {
  id?: number;
  veiculo_id: number;
  data: string;
  valor: number;
  observacoes: string;
}

// ===== FILTERS =====
export interface FilterCriteria {
  cluster?: string;
  mes?: string;
  semana?: string;
  mop_eps?: string;
}

export interface FilterOption {
  id: string;
  label: string;
}

export interface FilterOptions {
  clusters: { id: string; label: string; cidades: string[] }[];
  meses: FilterOption[];
  semanas: FilterOption[];
  mop_eps: FilterOption[];
}

// ===== UI STATES =====
export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface PaginationState {
  page: number;
  limit: number;
  total: number;
}

// ===== DADOS PARA GRÁFICOS =====
export interface ChartDataPoint {
  name: string;
  value: number;
  percentage?: number;
  color?: string;
}

export interface CidadeStats {
  cidade: string;
  total_os: number;
  tme_medio: number;
  prazo_pct: number;
  outlier_pct: number;
}
