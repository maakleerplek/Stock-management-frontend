import logo from './assets/HTL.png';
import { Typography, Box } from '@mui/material';

function Logo() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, p: { xs: 0.5, sm: 1 } }}>
      <Box
        component="a"
        href="https://maakleerplek.be/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="maakleerplek website"
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, textDecoration: 'none' }}
      >
        <Box
          component="img"
          src={logo}
          alt="maakleerplek logo"
          sx={{ 
            height: { xs: 40, sm: 60 }, 
            width: { xs: 40, sm: 60 }, 
            borderRadius: '50%', 
            objectFit: 'cover', 
            border: '2px solid', 
            borderColor: 'divider', 
            transition: 'transform 0.3s, box-shadow 0.3s', 
            '&:hover': { transform: 'scale(1.05)', boxShadow: '0 0 0 4px var(--mui-palette-primary-main)' } 
          }}
        />
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography variant="h6" sx={{ fontSize: { xs: '0.9rem', sm: '1.25rem' }, lineHeight: 1.2 }}>Inventree Assistant</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ fontSize: { xs: '0.7rem', sm: '0.875rem' } }}>by Maakleerplek</Typography>
      </Box>
    </Box>
  );
}

export default Logo;