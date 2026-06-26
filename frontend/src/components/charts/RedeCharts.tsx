import { FC } from "react";
import {
  BarChart,
  Bar,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { ChartDataPoint } from "../../types";

interface ChartProps {
  data: ChartDataPoint[];
  title: string;
  height?: number;
}


const COLORS = {
  primary: "#378ADD",
  secondary: "#1D9E75",
  warning: "#FFA726",
  error: "#EF5350",
  success: "#66BB6A",
};

const CustomTooltip = (props: any) => {
  const { active, payload } = props;
  if (active && payload && payload.length) {
    return (
      <Box
        sx={{
          backgroundColor: "rgba(255,255,255,0.95)",
          border: `1px solid ${COLORS.primary}`,
          borderRadius: 1,
          p: 1,
        }}
      >
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {payload[0].payload.name || payload[0].payload.date}
        </Typography>
        <Typography variant="caption" display="block">
          Valor: {payload[0].value.toFixed(2)}
        </Typography>
      </Box>
    );
  }
  return null;
};

export const CidadesBarChart: FC<ChartProps> = ({
  data,
  title,
  height = 300,
}) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          {title}
        </Typography>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart
            data={data}
            margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={80}
              tick={{ fontSize: 12 }}
            />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" fill={COLORS.primary} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export const TMELineChart: FC<{
  data: { date: string; tme: number; outlier: number }[];
}> = ({ data }) => {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          📈 Tendência de TME (Tempo Médio de Execução)
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="tme"
              stroke={COLORS.primary}
              strokeWidth={2}
              dot={false}
              name="TME (horas)"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="outlier"
              stroke={COLORS.error}
              strokeWidth={2}
              dot={false}
              name="Outliers"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export const StatusPieChart: FC<{
  data: { name: string; value: number }[];
}> = ({ data }) => {
  const chartColors = [
    COLORS.success,
    COLORS.warning,
    COLORS.error,
    COLORS.primary,
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          🎯 Distribuição de Status
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, value, percent }) =>
                `${name}: ${value} (${(percent * 100).toFixed(0)}%)`
              }
              outerRadius={80}
              fill={COLORS.primary}
              dataKey="value"
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export const PrazoOutlierChart: FC<{
  dataPrazo: { prazoCount: number; fooraCount: number };
}> = ({ dataPrazo }) => {
  const data = [
    { name: "Dentro do Prazo", value: dataPrazo.prazoCount },
    { name: "Fora do Prazo", value: dataPrazo.fooraCount },
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          ⏱️ Prazo vs Fora do Prazo
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              <Cell fill={COLORS.success} />
              <Cell fill={COLORS.error} />
            </Pie>
            <Tooltip formatter={(value) => `${value} chamados`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export const OutlierAnalysisChart: FC<{
  dataOutlier: { normalCount: number; outlierCount: number };
}> = ({ dataOutlier }) => {
  const data = [
    { name: "Normal", value: dataOutlier.normalCount },
    { name: "Outlier (>24h)", value: dataOutlier.outlierCount },
  ];

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          ⚠️ Análise de Outliers
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
            >
              <Cell fill={COLORS.primary} />
              <Cell fill={COLORS.error} />
            </Pie>
            <Tooltip formatter={(value) => `${value} chamados`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
