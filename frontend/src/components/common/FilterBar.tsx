import { FC, useState, useEffect } from "react";
import {
  Box,
  Card,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Stack,
  Skeleton,
} from "@mui/material";
import { Refresh as RefreshIcon } from "@mui/icons-material";
import { FilterCriteria, FilterOptions } from "../../types";
import api from "../../services/api";

interface FilterBarProps {
  onFilterChange: (filters: FilterCriteria) => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export const FilterBar: FC<FilterBarProps> = ({
  onFilterChange,
  onRefresh,
  loading = false,
}) => {
  const [filters, setFilters] = useState<FilterCriteria>({});
  const [filterOptions, setFilterOptions] = useState<FilterOptions | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(true);

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const data = await api.getFilters();
        setFilterOptions(data);
      } catch (err) {
        console.error("Erro ao carregar filtros:", err);
      } finally {
        setLoadingOptions(false);
      }
    };

    loadFilterOptions();
  }, []);

  const handleFilterChange = (key: keyof FilterCriteria, value: string) => {
    const newFilters = { ...filters, [key]: value || undefined };
    setFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleReset = () => {
    setFilters({});
    onFilterChange({});
  };

  if (loadingOptions) {
    return (
      <Card sx={{ p: 2, mb: 3 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <Skeleton variant="rectangular" height={56} sx={{ flex: 1 }} />
          <Skeleton variant="rectangular" height={56} sx={{ flex: 1 }} />
          <Skeleton variant="rectangular" height={56} sx={{ flex: 1 }} />
          <Skeleton variant="rectangular" height={56} sx={{ flex: 1 }} />
        </Stack>
      </Card>
    );
  }

  return (
    <Card sx={{ p: 2, mb: 3 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems="flex-end"
      >
        {/* Cluster Filter */}
        <FormControl sx={{ minWidth: 200, flex: 1 }}>
          <InputLabel id="cluster-label">Cluster</InputLabel>
          <Select
            labelId="cluster-label"
            id="cluster-select"
            value={filters.cluster || ""}
            label="Cluster"
            onChange={(e) => handleFilterChange("cluster", e.target.value)}
            disabled={loading}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {filterOptions?.clusters.map((cluster) => (
              <MenuItem key={cluster.id} value={cluster.id}>
                {cluster.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Month Filter */}
        <FormControl sx={{ minWidth: 120, flex: 1 }}>
          <InputLabel id="mes-label">Mês</InputLabel>
          <Select
            labelId="mes-label"
            id="mes-select"
            value={filters.mes || ""}
            label="Mês"
            onChange={(e) => handleFilterChange("mes", e.target.value)}
            disabled={loading}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {filterOptions?.meses.map((mes) => (
              <MenuItem key={mes.id} value={mes.id}>
                {mes.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Week Filter */}
        <FormControl sx={{ minWidth: 120, flex: 1 }}>
          <InputLabel id="semana-label">Semana</InputLabel>
          <Select
            labelId="semana-label"
            id="semana-select"
            value={filters.semana || ""}
            label="Semana"
            onChange={(e) => handleFilterChange("semana", e.target.value)}
            disabled={loading}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {filterOptions?.semanas.map((semana) => (
              <MenuItem key={semana.id} value={semana.id}>
                {semana.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* MOP/EPS Filter */}
        <FormControl sx={{ minWidth: 150, flex: 1 }}>
          <InputLabel id="mop-label">MOP/EPS</InputLabel>
          <Select
            labelId="mop-label"
            id="mop-select"
            value={filters.mop_eps || ""}
            label="MOP/EPS"
            onChange={(e) => handleFilterChange("mop_eps", e.target.value)}
            disabled={loading}
          >
            <MenuItem value="">
              <em>Todos</em>
            </MenuItem>
            {filterOptions?.mop_eps.map((mop) => (
              <MenuItem key={mop.id} value={mop.id}>
                {mop.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Action Buttons */}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={handleReset}
            disabled={loading || Object.keys(filters).length === 0}
          >
            Limpar
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefresh}
            disabled={loading}
          >
            Atualizar
          </Button>
        </Box>
      </Stack>
    </Card>
  );
};
