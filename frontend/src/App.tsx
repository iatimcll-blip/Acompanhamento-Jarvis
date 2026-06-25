import { FC, useState } from "react";
import { ThemeProvider } from "@mui/material/styles";
import { CssBaseline, Box } from "@mui/material";
import theme from "./theme";
import { AppBar } from "./components/layout/AppBar";
import { Sidebar } from "./components/layout/Sidebar";
import { RedePanel } from "./components/panels/RedePanel";

type NavId = "dashboard" | "redes" | "b2b" | "frota" | "bases" | "settings";

const App: FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeNav, setActiveNav] = useState<NavId>("dashboard");

  const handleSidebarOpen = () => {
    setSidebarOpen(true);
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
  };

  const handleNavClick = (id: string) => {
    setActiveNav(id as NavId);
  };

  const getTitleByNav = (): string => {
    const titles: Record<NavId, string> = {
      dashboard: "Dashboard Principal",
      redes: "Painel de Redes",
      b2b: "Painel B2B",
      frota: "Frota & Combustível",
      bases: "Central de Bases",
      settings: "Configurações",
    };
    return titles[activeNav] || "Jarvis MCLL";
  };

  const renderContent = () => {
    switch (activeNav) {
      case "redes":
        return <RedePanel />;
      case "b2b":
        return (
          <Box sx={{ p: 4 }}>
            <h2>Painel B2B - Em Desenvolvimento</h2>
          </Box>
        );
      case "frota":
        return (
          <Box sx={{ p: 4 }}>
            <h2>Painel Frota - Em Desenvolvimento</h2>
          </Box>
        );
      case "bases":
        return (
          <Box sx={{ p: 4 }}>
            <h2>Central de Bases - Em Desenvolvimento</h2>
          </Box>
        );
      case "settings":
        return (
          <Box sx={{ p: 4 }}>
            <h2>Configurações - Em Desenvolvimento</h2>
          </Box>
        );
      default:
        return (
          <Box sx={{ p: 4 }}>
            <h2>Dashboard Principal - Em Desenvolvimento</h2>
          </Box>
        );
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: "flex" }}>
        <AppBar onMenuClick={handleSidebarOpen} title={getTitleByNav()} />

        <Sidebar
          open={sidebarOpen}
          onClose={handleSidebarClose}
          onNavClick={handleNavClick}
          activeNav={activeNav}
          variant="temporary"
        />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            mt: { xs: 7, sm: 8 },
            backgroundColor: "#F5F7FA",
            minHeight: "100vh",
          }}
        >
          {renderContent()}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
