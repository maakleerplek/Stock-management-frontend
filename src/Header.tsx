import { useState } from 'react';
import { Box, Button, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Logo from './Logo';
import LightOrDarkButton from './LightOrDarkButton';
import { useVolunteer } from './VolunteerContext';
import { INVENTREE_CONFIG } from './constants';

interface HeaderProps {
  theme: string;
  toggleTheme: () => void;
  setVolunteerModalOpen: (open: boolean) => void;
  setAddPartFormModalOpen: (open: boolean) => void;
  setAddCategoryModalOpen: (open: boolean) => void;
  setAddLocationModalOpen: (open: boolean) => void;
  onOpenInvenTree?: () => void;
  onOpenInventory?: () => void;
  isInventoryOpen?: boolean;
}

function Header({ theme, toggleTheme, setVolunteerModalOpen, setAddPartFormModalOpen, setAddCategoryModalOpen, setAddLocationModalOpen, onOpenInvenTree, onOpenInventory, isInventoryOpen }: HeaderProps) {
  const { isVolunteerMode, setIsVolunteerMode } = useVolunteer();
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const handleVolunteerToggle = () => {
    if (isVolunteerMode) {
      setExitConfirmOpen(true);
    } else {
      setVolunteerModalOpen(true);
    }
  };

  const handleConfirmExit = () => {
    setExitConfirmOpen(false);
    setIsVolunteerMode(false);
    setAddPartFormModalOpen(false);
    if (onOpenInventory && isInventoryOpen) {
      onOpenInventory();
    }
  };

  return (
    <>
    <Box sx={{ 
      width: '100%', 
      backgroundColor: isVolunteerMode ? 'info.main' : 'background.paper', 
      borderBottom: '1px solid', 
      borderColor: 'divider', 
      pt: { xs: 0.5, sm: 2 },
      pb: { xs: isVolunteerMode ? 1 : 0.5, sm: 2 }
    }}>
      <Box sx={{ maxWidth: 'lg', mx: 'auto', px: { xs: 2, sm: 3 } }}>
        {/* Top Row: Logo and Primary Actions */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: isVolunteerMode ? 1.5 : 0 }}>
          <Logo />
          
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            {isVolunteerMode && (
              <Button
                variant="contained"
                color="info"
                onClick={onOpenInventory}
                size="small"
                sx={{ 
                  bgcolor: isInventoryOpen ? 'info.dark' : 'rgba(255,255,255,0.2)',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                  display: { xs: 'inline-flex', sm: 'none' }
                }}
              >
                {isInventoryOpen ? 'Back' : 'List'}
              </Button>
            )}
            <Button
              variant={isVolunteerMode ? 'contained' : 'outlined'}
              color={isVolunteerMode ? 'info' : 'inherit'}
              onClick={handleVolunteerToggle}
              size="small"
              sx={{ 
                fontSize: '0.75rem',
                fontWeight: 'bold',
                bgcolor: isVolunteerMode ? 'info.dark' : 'transparent',
                px: 2
              }}
            >
              {isVolunteerMode ? 'Exit' : 'Volunteer'}
            </Button>
            <LightOrDarkButton toggleTheme={toggleTheme} theme={theme} />
          </Box>
        </Box>

        {/* Bottom Row: Volunteer Navigation & Forms */}
        {isVolunteerMode && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button
                variant="contained"
                color="info"
                onClick={onOpenInventory}
                size="small"
                sx={{ 
                  bgcolor: isInventoryOpen ? 'info.dark' : 'info.main',
                  fontWeight: 'bold',
                  display: { xs: 'none', sm: 'inline-flex' }
                }}
              >
                {isInventoryOpen ? 'Back to Scan' : 'Inventory List'}
              </Button>
              <Button
                variant="contained"
                color="info"
                onClick={onOpenInvenTree || (() => window.open(INVENTREE_CONFIG.URL, '_blank'))}
                size="small"
                endIcon={<OpenInNewIcon sx={{ fontSize: '1rem!important' }} />}
                sx={{ bgcolor: 'info.main', fontWeight: 'bold' }}
              >
                InvenTree
              </Button>
            </Box>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                color="info"
                onClick={() => setAddCategoryModalOpen(true)}
                size="small"
                sx={{ 
                  flex: 1,
                  minWidth: '100px',
                  bgcolor: 'rgba(255,255,255,0.15)',
                  fontSize: '0.75rem',
                  py: 1,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                }}
              >
                + Category
              </Button>
              <Button
                variant="contained"
                color="info"
                onClick={() => setAddLocationModalOpen(true)}
                size="small"
                sx={{ 
                  flex: 1,
                  minWidth: '100px',
                  bgcolor: 'rgba(255,255,255,0.15)',
                  fontSize: '0.75rem',
                  py: 1,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                }}
              >
                + Location
              </Button>
              <Button
                variant="contained"
                color="info"
                onClick={() => setAddPartFormModalOpen(true)}
                size="small"
                sx={{ 
                  flex: 1,
                  minWidth: '100px',
                  bgcolor: 'rgba(255,255,255,0.15)',
                  fontSize: '0.75rem',
                  py: 1,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.25)' }
                }}
              >
                + Part
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>

    <Dialog open={exitConfirmOpen} onClose={() => setExitConfirmOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Exit Volunteer Mode</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to exit Volunteer Mode?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setExitConfirmOpen(false)}>Cancel</Button>
        <Button onClick={handleConfirmExit} variant="contained" color="error" autoFocus>
          Exit
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}

export default Header;
