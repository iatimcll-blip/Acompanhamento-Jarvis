import { FC, useState, useCallback } from "react";
import {
  Box,
  Container,
  Grid,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
} from "@mui/material";
import { MetricCard } from "../common/MetricCard";
import { UploadZone } from "../common/UploadZone";
import { FilterBar } from "../common/FilterBar";
import {
  CidadesBarChart,
  TMELineChart,
  PrazoOutlierChart,
  OutlierAnalysisChart,
} from "../charts/RedeCharts";
import { FilterCriteria, RedeBackbone, RedeAcesso, RedeMetrics } from "../../types";
import api from "../../services/api";
import {
  SignalCellularAlt as NetworkIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
} from "@mui/icons-icons";

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = (props: TabPanelProps) => {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`redes-tabpanel-${index}`}
      aria-labelledby={`redes-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

export const RedePanel: FC = () => {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const [backboneData, setBackboneData] = useState<RedeBackbone[]>([]);
  const [backboneMetrics, setBackboneMetrics] = useState<RedeMetrics | null>(null);

  const [acessoData, setAcessoData] = useState<RedeAcesso[]>([]);
  const [acessoMetrics, setAcessoMetrics] = useState<RedeMetrics | null>(null);

  const [filters, setFilters] = useState<FilterCriteria>({});

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  const loadBackboneData = useCallback(async (filtersCriteria?: FilterCriteria) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getRedeBackbone(filtersCriteria);
      setBackboneData(response.dados as RedeBackbone[]);
      setBackboneMetrics(response.metrics);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados de Backbone");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAcessoData = useCallback(async (filtersCriteria?: FilterCriteria) => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getRedeAcesso(filtersCriteria);
      setAcessoData(response.dados as RedeAcesso[]);
      setAcessoMetrics(response.metrics);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar dados de Acesso");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    try {
      const result = await api.uploadExcel(file, "redes");
      setUploadSuccess(true);

      setTimeout(() => {
        setUploadSuccess(false);
        loadBackboneData(filters);
        loadAcessoData(filters);
      }, 1500);
    } catch (err: any) {
      setUploadError(err.message || "Erro ao fazer upload do arquivo");
    } finally {
      setUploading(false);
    }
  };

  const handleFilterChange = (newFilters: FilterCriteria) => {
    setFilters(newFilters);
    if (tabValue === 0) loadBackboneData(newFilters);
    if (tabValue === 1) loadAcessoData(newFilters);
  };

  const handleRefresh = () => {
    if (tabValue === 0) loadBackboneData(filters);
    if (tabValue === 1) loadAcessoData(filters);
  };

  const renderDataTable = (data: (RedeBackbone | RedeAcesso)[], limit = 10) => {
    return (
      <TableContainer component={Paper}>
        <Table>
          <TableHead sx={{ backgroundColor: "#F3F4F6" }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>OS</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Cidade</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>TME (h)</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Prazo</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.slice(0, limit).map((row, idx) => (
              <TableRow key={idx} sx={{ "&:hover": { backgroundColor: "#F9FAFB" } }}>
                <TableCell>{row.os}</TableCell>
                <TableCell>{row.cidade}</TableCell>
                <TableCell>{row.tme.toFixed(2)}</TableCell>
                <TableCell>
                  {row.prazo ? (
                    <Chip
                      icon={<CheckCircleIcon />}
                      label="No Prazo"
                      size="small"
                      color="success"
                      variant="outlined"
                    />
                  ) : (
                    <Chip
                      icon={<ErrorIcon />}
                      label="Fora do Prazo"
                      size="small"
                      color="error"
                      variant="outlined"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {row.outlier ? (
                    <Chip
                      icon={<WarningIcon />}
                      label="Outlier"
                      size="small"
                      color="warning"
                      variant="outlined"
                    />
                  ) : (
                    <Chip label="Normal" size="small" variant="outlined" />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          📡 Painel de Redes
        </Typography>
        <Typography variant="body2" sx={{ color: "#6B7280" }}>
          Análise detalhada de Backbone e Acesso com indicadores operacionais
        </Typography>
      </Box>

      {/* Upload Section */}
      <UploadZone
        onFileSelect={handleFileUpload}
        panel="rede"
        isLoading={uploading}
        error={uploadError}
        success={uploadSuccess}
      />

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <FilterBar
        onFilterChange={handleFilterChange}
        onRefresh={handleRefresh}
        loading={loading}
      />

      {/* Tabs */}
      <Paper sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="📡 Backbone" id="redes-tab-0" />
          <Tab label="🔗 Acesso" id="redes-tab-1" />
          <Tab label="📊 Combinado" id="redes-tab-2" />
        </Tabs>
      </Paper>

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* BACKBONE TAB */}
          <TabPanel value={tabValue} index={0}>
            {backboneMetrics && (
              <>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="Total OS"
                      value={backboneMetrics.total_os}
                      icon={<NetworkIcon />}
                      color="primary"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="TME Médio"
                      value={backboneMetrics.tme_medio.toFixed(2)}
                      unit="h"
                      color="secondary"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="% No Prazo"
                      value={backboneMetrics.percentual_prazo.toFixed(1)}
                      unit="%"
                      color="success"
                      progress={backboneMetrics.percentual_prazo}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="% Outlier"
                      value={backboneMetrics.percentual_outlier.toFixed(1)}
                      unit="%"
                      color="error"
                      progress={backboneMetrics.percentual_outlier}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={3}>
                  <Grid item xs={12} lg={6}>
                    <CidadesBarChart
                      title="📍 OS por Cidade"
                      data={[
                        { name: "Maior", value: 100 },
                        { name: "Segunda", value: 80 },
                      ]}
                    />
                  </Grid>
                  <Grid item xs={12} lg={6}>
                    <TMELineChart data={[]} />
                  </Grid>
                  <Grid item xs={12} lg={6}>
                    <PrazoOutlierChart
                      dataPrazo={{
                        prazoCount: Math.round(
                          backboneMetrics.total_os *
                            (backboneMetrics.percentual_prazo / 100)
                        ),
                        fooraCount: Math.round(
                          backboneMetrics.total_os *
                            (1 - backboneMetrics.percentual_prazo / 100)
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} lg={6}>
                    <OutlierAnalysisChart
                      dataOutlier={{
                        normalCount: Math.round(
                          backboneMetrics.total_os *
                            (1 - backboneMetrics.percentual_outlier / 100)
                        ),
                        outlierCount: Math.round(
                          backboneMetrics.total_os *
                            (backboneMetrics.percentual_outlier / 100)
                        ),
                      }}
                    />
                  </Grid>
                </Grid>

                <Box sx={{ mt: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    📋 Últimos 10 Registros
                  </Typography>
                  {renderDataTable(backboneData)}
                </Box>
              </>
            )}
          </TabPanel>

          {/* ACESSO TAB */}
          <TabPanel value={tabValue} index={1}>
            {acessoMetrics && (
              <>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="Total OS"
                      value={acessoMetrics.total_os}
                      icon={<NetworkIcon />}
                      color="primary"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="TME Médio"
                      value={acessoMetrics.tme_medio.toFixed(2)}
                      unit="h"
                      color="secondary"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="% No Prazo"
                      value={acessoMetrics.percentual_prazo.toFixed(1)}
                      unit="%"
                      color="success"
                      progress={acessoMetrics.percentual_prazo}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <MetricCard
                      label="% Outlier"
                      value={acessoMetrics.percentual_outlier.toFixed(1)}
                      unit="%"
                      color="error"
                      progress={acessoMetrics.percentual_outlier}
                    />
                  </Grid>
                </Grid>

                <Grid container spacing={3}>
                  <Grid item xs={12} lg={6}>
                    <CidadesBarChart
                      title="📍 OS por Cidade"
                      data={[
                        { name: "Maior", value: 100 },
                        { name: "Segunda", value: 80 },
                      ]}
                    />
                  </Grid>
                  <Grid item xs={12} lg={6}>
                    <TMELineChart data={[]} />
                  </Grid>
                </Grid>

                <Box sx={{ mt: 4 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    📋 Últimos 10 Registros
                  </Typography>
                  {renderDataTable(acessoData)}
                </Box>
              </>
            )}
          </TabPanel>

          {/* COMBINED TAB */}
          <TabPanel value={tabValue} index={2}>
            <Alert severity="info">
              Análise combinada de Backbone + Acesso em desenvolvimento
            </Alert>
          </TabPanel>
        </>
      )}
    </Container>
  );
};
