import axios, { AxiosInstance, AxiosError } from "axios";
import {
  RedeResponse,
  FilterOptions,
  FilterCriteria,
} from "../types";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Interceptor de erro
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        console.error("API Error:", error);
        return Promise.reject(error);
      }
    );
  }

  // ===== REDES =====
  async getRedeBackbone(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);
    if (filters?.mes) params.append("mes", filters.mes);
    if (filters?.semana) params.append("semana", filters.semana);
    if (filters?.mop_eps) params.append("mop_eps", filters.mop_eps);

    return this.client
      .get<RedeResponse>(`/redes/backbone?${params.toString()}`)
      .then((res) => res.data);
  }

  async getRedeAcesso(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);
    if (filters?.mes) params.append("mes", filters.mes);
    if (filters?.semana) params.append("semana", filters.semana);
    if (filters?.mop_eps) params.append("mop_eps", filters.mop_eps);

    return this.client
      .get<RedeResponse>(`/redes/acesso?${params.toString()}`)
      .then((res) => res.data);
  }

  async getRedeCombined(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);
    if (filters?.mes) params.append("mes", filters.mes);
    if (filters?.semana) params.append("semana", filters.semana);
    if (filters?.mop_eps) params.append("mop_eps", filters.mop_eps);

    return this.client
      .get<RedeResponse>(`/redes/combined?${params.toString()}`)
      .then((res) => res.data);
  }

  // ===== UPLOAD =====
  async uploadExcel(
    file: File,
    panel: string
  ): Promise<{ status: string; rows_processed: number; message: string }> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("panel", panel);

    return this.client
      .post<{ status: string; rows_processed: number; message: string }>(
        "/upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      )
      .then((res) => res.data);
  }

  // ===== FILTERS =====
  async getFilters(): Promise<FilterOptions> {
    return this.client
      .get<FilterOptions>("/filters")
      .then((res) => res.data);
  }

  // ===== B2B =====
  async getB2BAbertos(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);
    if (filters?.mes) params.append("mes", filters.mes);

    return this.client
      .get<RedeResponse>(`/b2b/abertos?${params.toString()}`)
      .then((res) => res.data);
  }

  async getB2BEncerrados(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);
    if (filters?.mes) params.append("mes", filters.mes);

    return this.client
      .get<RedeResponse>(`/b2b/encerrados?${params.toString()}`)
      .then((res) => res.data);
  }

  async getB2BRepetidos(filters?: FilterCriteria): Promise<RedeResponse> {
    const params = new URLSearchParams();
    if (filters?.cluster) params.append("cluster", filters.cluster);

    return this.client
      .get<RedeResponse>(`/b2b/repetidos?${params.toString()}`)
      .then((res) => res.data);
  }

  // ===== FROTA =====
  async getFrotaVeiculos(): Promise<RedeResponse> {
    return this.client
      .get<RedeResponse>("/frota/veiculos")
      .then((res) => res.data);
  }

  async registrarAbastecimento(data: {
    veiculo_id: number;
    data: string;
    valor: number;
    observacoes: string;
  }): Promise<{ status: string; message: string }> {
    return this.client
      .post<{ status: string; message: string }>("/frota/abastecimento", data)
      .then((res) => res.data);
  }

  // ===== HEALTH =====
  async healthCheck(): Promise<{
    status: string;
    message: string;
    version: string;
  }> {
    return this.client
      .get<{ status: string; message: string; version: string }>("/health")
      .then((res) => res.data);
  }
}

export default new ApiClient();
