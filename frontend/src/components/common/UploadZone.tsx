import { FC, useCallback, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  LinearProgress,
  Alert,
} from "@mui/material";
import {
  CloudUpload as CloudUploadIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  panel: string;
  isLoading?: boolean;
  error?: string | null;
  success?: boolean;
}

export const UploadZone: FC<UploadZoneProps> = ({
  onFileSelect,
  panel,
  isLoading = false,
  error = null,
  success = false,
}) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        const file = files[0];
        if (file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
          onFileSelect(file);
        } else {
          alert("Por favor, selecione um arquivo Excel (.xlsx)");
        }
      }
    },
    [onFileSelect]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect]
  );

  return (
    <Card
      sx={{
        border: `2px dashed ${
          isDragActive
            ? "#378ADD"
            : error
            ? "#EF5350"
            : success
            ? "#66BB6A"
            : "#D1D5DB"
        }`,
        backgroundColor: isDragActive ? "#EFF6FB" : error ? "#FFEBEE" : success ? "#E8F5E9" : "#F9FAFB",
        cursor: "pointer",
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {isLoading && (
        <LinearProgress
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
          }}
        />
      )}

      <CardContent
        sx={{
          textAlign: "center",
          py: 5,
          px: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        {success ? (
          <CheckCircleIcon sx={{ fontSize: "3rem", color: "#66BB6A" }} />
        ) : (
          <CloudUploadIcon
            sx={{
              fontSize: "3rem",
              color: isDragActive ? "#378ADD" : "#9CA3AF",
              transition: "all 0.3s ease",
            }}
          />
        )}

        {success ? (
          <>
            <Typography variant="h6" sx={{ fontWeight: 600, color: "#66BB6A" }}>
              Arquivo carregado com sucesso!
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280" }}>
              Os dados estão sendo processados
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {isDragActive
                ? "Solte o arquivo aqui"
                : "Arraste o arquivo ou clique para selecionar"}
            </Typography>
            <Typography variant="body2" sx={{ color: "#6B7280", mb: 2 }}>
              Formato esperado: <strong>BASE_{panel.toUpperCase()}.xlsx</strong>
            </Typography>

            <input
              type="file"
              accept=".xlsx"
              onChange={handleInputChange}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                cursor: "pointer",
              }}
              disabled={isLoading}
            />
          </>
        )}
      </CardContent>

      {error && (
        <Alert severity="error" sx={{ m: 2, mt: 0 }}>
          {error}
        </Alert>
      )}
    </Card>
  );
};
