import { FC } from "react";
import {
  Drawer,
  DrawerProps,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
} from "@mui/material";
import {
  SignalCellularAlt as NetworkIcon,
  CardGiftcard as B2BIcon,
  LocalGasStation as FrotaIcon,
  Storage as BaseIcon,
  Home as HomeIcon,
  Settings as SettingsIcon,
  Help as HelpIcon,
} from "@mui/icons-material";

interface NavItem {
  label: string;
  icon: React.ReactNode;
  id: string;
  badge?: number;
}

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onNavClick: (id: string) => void;
  activeNav: string;
  variant?: DrawerProps["variant"];
}

const navItems: NavItem[] = [
  { label: "Dashboard", icon: <HomeIcon />, id: "dashboard" },
];

const analysisItems: NavItem[] = [
  { label: "Painel de Redes", icon: <NetworkIcon />, id: "redes" },
  { label: "Painel B2B", icon: <B2BIcon />, id: "b2b" },
  { label: "Frota & Combustível", icon: <FrotaIcon />, id: "frota" },
];

const adminItems: NavItem[] = [
  { label: "Central de Bases", icon: <BaseIcon />, id: "bases" },
  { label: "Configurações", icon: <SettingsIcon />, id: "settings" },
];

export const Sidebar: FC<SidebarProps> = ({
  open,
  onClose,
  onNavClick,
  activeNav,
  variant = "temporary",
}) => {
  const drawerWidth = 280;

  const handleNavClick = (id: string) => {
    onNavClick(id);
    if (variant === "temporary") {
      onClose();
    }
  };

  const sidebarContent = (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        backgroundColor: "#F8FAFC",
      }}
    >
      {/* Logo */}
      <Box sx={{ p: 2, textAlign: "center" }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: "#378ADD" }}>
          📊 Jarvis
        </Typography>
        <Typography variant="caption" sx={{ color: "#6B7280" }}>
          Acompanhamento
        </Typography>
      </Box>

      <Divider />

      {/* Main Navigation */}
      <List sx={{ flex: 1, px: 1, py: 2 }}>
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: "#6B7280",
            px: 2,
            display: "block",
            mb: 1,
          }}
        >
          NAVEGAÇÃO
        </Typography>
        {navItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={activeNav === item.id}
              onClick={() => handleNavClick(item.id)}
              sx={{
                borderRadius: 1,
                "&.Mui-selected": {
                  backgroundColor: "#DDF4FF",
                  color: "#378ADD",
                  fontWeight: 600,
                  "&:hover": {
                    backgroundColor: "#DDF4FF",
                  },
                },
                "&:hover": {
                  backgroundColor: "#EFF6FB",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: activeNav === item.id ? "#378ADD" : "#6B7280",
                  minWidth: 40,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: activeNav === item.id ? 600 : 500,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}

        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: "#6B7280",
            px: 2,
            display: "block",
            mt: 3,
            mb: 1,
          }}
        >
          ANÁLISES
        </Typography>
        {analysisItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={activeNav === item.id}
              onClick={() => handleNavClick(item.id)}
              sx={{
                borderRadius: 1,
                "&.Mui-selected": {
                  backgroundColor: "#DDF4FF",
                  color: "#378ADD",
                  fontWeight: 600,
                  "&:hover": {
                    backgroundColor: "#DDF4FF",
                  },
                },
                "&:hover": {
                  backgroundColor: "#EFF6FB",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: activeNav === item.id ? "#378ADD" : "#6B7280",
                  minWidth: 40,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: activeNav === item.id ? 600 : 500,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}

        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: "#6B7280",
            px: 2,
            display: "block",
            mt: 3,
            mb: 1,
          }}
        >
          ADMINISTRAÇÃO
        </Typography>
        {adminItems.map((item) => (
          <ListItem key={item.id} disablePadding sx={{ mb: 0.5 }}>
            <ListItemButton
              selected={activeNav === item.id}
              onClick={() => handleNavClick(item.id)}
              sx={{
                borderRadius: 1,
                "&.Mui-selected": {
                  backgroundColor: "#DDF4FF",
                  color: "#378ADD",
                  fontWeight: 600,
                  "&:hover": {
                    backgroundColor: "#DDF4FF",
                  },
                },
                "&:hover": {
                  backgroundColor: "#EFF6FB",
                },
              }}
            >
              <ListItemIcon
                sx={{
                  color: activeNav === item.id ? "#378ADD" : "#6B7280",
                  minWidth: 40,
                }}
              >
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{
                  variant: "body2",
                  fontWeight: activeNav === item.id ? 600 : 500,
                }}
              />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      <Divider />

      {/* Help & Info */}
      <List sx={{ px: 1, py: 1 }}>
        <ListItem disablePadding>
          <ListItemButton
            sx={{
              borderRadius: 1,
              "&:hover": {
                backgroundColor: "#EFF6FB",
              },
            }}
          >
            <ListItemIcon sx={{ color: "#6B7280", minWidth: 40 }}>
              <HelpIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary="Ajuda"
              primaryTypographyProps={{ variant: "body2", fontSize: "0.875rem" }}
            />
          </ListItemButton>
        </ListItem>
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={variant}
      anchor="left"
      open={open}
      onClose={onClose}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
          top: { xs: 56, sm: 64 },
          height: { xs: "calc(100% - 56px)", sm: "calc(100% - 64px)" },
        },
      }}
    >
      {sidebarContent}
    </Drawer>
  );
};
