import { FC } from "react";
import {
  Card,
  CardContent,
  Box,
  Typography,
  LinearProgress,
} from "@mui/material";
import { TrendingUp as TrendingIcon } from "@mui/icons-material";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  color?: "primary" | "secondary" | "error" | "warning" | "success";
  trend?: number;
  trendLabel?: string;
  progress?: number;
  compact?: boolean;
}

const colorMap = {
  primary: {
    bg: "#DDF4FF",
    text: "#378ADD",
    border: "rgba(55, 138, 221, 0.2)",
  },
  secondary: {
    bg: "#E8F5E9",
    text: "#1D9E75",
    border: "rgba(29, 158, 117, 0.2)",
  },
  error: {
    bg: "#FFEBEE",
    text: "#EF5350",
    border: "rgba(239, 83, 80, 0.2)",
  },
  warning: {
    bg: "#FFF3E0",
    text: "#FFA726",
    border: "rgba(255, 167, 38, 0.2)",
  },
  success: {
    bg: "#E8F5E9",
    text: "#66BB6A",
    border: "rgba(102, 187, 106, 0.2)",
  },
};

export const MetricCard: FC<MetricCardProps> = ({
  label,
  value,
  unit,
  icon,
  color = "primary",
  trend,
  trendLabel,
  progress,
  compact = false,
}) => {
  const colors = colorMap[color];

  return (
    <Card
      sx={{
        height: "100%",
        border: `1px solid ${colors.border}`,
        backgroundColor: compact ? "transparent" : "#FFF",
      }}
    >
      <CardContent
        sx={{
          p: compact ? 2 : 3,
          "&:last-child": { pb: compact ? 2 : 3 },
        }}
      >
        {/* Header com ícone */}
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            mb: 2,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: "#6B7280",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            {label}
          </Typography>
          {icon && (
            <Box
              sx={{
                p: 1,
                backgroundColor: colors.bg,
                borderRadius: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: colors.text,
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        {/* Valor */}
        <Box sx={{ mb: trend ? 1 : 0 }}>
          <Typography
            variant={compact ? "h6" : "h4"}
            sx={{
              fontWeight: 700,
              color: colors.text,
              lineHeight: 1,
            }}
          >
            {value}
            {unit && (
              <Typography
                component="span"
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: "#6B7280",
                  ml: 1,
                }}
              >
                {unit}
              </Typography>
            )}
          </Typography>
        </Box>

        {/* Trend */}
        {trend !== undefined && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              mb: progress ? 2 : 0,
            }}
          >
            <TrendingIcon
              sx={{
                fontSize: "1rem",
                color: trend >= 0 ? "#66BB6A" : "#EF5350",
              }}
            />
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: trend >= 0 ? "#66BB6A" : "#EF5350",
              }}
            >
              {trend >= 0 ? "+" : ""}{trend}%
            </Typography>
            {trendLabel && (
              <Typography variant="caption" sx={{ color: "#9CA3AF" }}>
                {trendLabel}
              </Typography>
            )}
          </Box>
        )}

        {/* Progress Bar */}
        {progress !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                mb: 1,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 500 }}>
                Progresso
              </Typography>
              <Typography variant="caption" sx={{ color: "#6B7280" }}>
                {progress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6,
                borderRadius: 3,
                backgroundColor: "#E5E7EB",
                "& .MuiLinearProgress-bar": {
                  backgroundColor: colors.text,
                },
              }}
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
};
