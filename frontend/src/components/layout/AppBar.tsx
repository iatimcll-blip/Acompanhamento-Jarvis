import { FC } from "react";
import {
  AppBar as MuiAppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Menu,
  MenuItem,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Settings as SettingsIcon,
  Notifications as NotificationsIcon,
  AccountCircle as AccountCircleIcon,
} from "@mui/icons-material";
import { useState } from "react";

interface AppBarProps {
  onMenuClick: () => void;
  title: string;
}

export const AppBar: FC<AppBarProps> = ({ onMenuClick, title }) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <MuiAppBar position="sticky" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar sx={{ display: "flex", justifyContent: "space-between" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            onClick={onMenuClick}
            edge="start"
            sx={{ display: { xs: "block", sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h5" component="div" sx={{ fontWeight: 700 }}>
            👑 Jarvis MCLL
          </Typography>
          <Typography
            variant="subtitle2"
            sx={{
              display: { xs: "none", sm: "block" },
              color: "rgba(255,255,255,0.7)",
            }}
          >
            {title}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            color="inherit"
            aria-label="notifications"
            sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" } }}
          >
            <NotificationsIcon />
          </IconButton>

          <IconButton
            color="inherit"
            aria-label="settings"
            sx={{ "&:hover": { backgroundColor: "rgba(255,255,255,0.1)" } }}
          >
            <SettingsIcon />
          </IconButton>

          <IconButton
            aria-label="account of current user"
            aria-controls="menu-appbar"
            aria-haspopup="true"
            onClick={handleMenu}
            color="inherit"
          >
            <AccountCircleIcon />
          </IconButton>

          <Menu
            id="menu-appbar"
            anchorEl={anchorEl}
            anchorOrigin={{
              vertical: "bottom",
              horizontal: "right",
            }}
            keepMounted
            transformOrigin={{
              vertical: "top",
              horizontal: "right",
            }}
            open={Boolean(anchorEl)}
            onClose={handleClose}
          >
            <MenuItem onClick={handleClose}>Perfil</MenuItem>
            <MenuItem onClick={handleClose}>Configurações</MenuItem>
            <MenuItem onClick={handleClose}>Sair</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </MuiAppBar>
  );
};
