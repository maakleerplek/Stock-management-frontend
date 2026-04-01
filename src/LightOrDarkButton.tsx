import React from 'react';
import { IconButton } from '@mui/material';
import { Brightness4, Brightness7 } from '@mui/icons-material';

interface LightOrDarkButtonProps {
  toggleTheme: () => void;
  theme: string;
}

const LightOrDarkButton: React.FC<LightOrDarkButtonProps> = ({ toggleTheme, theme }) => {
  return (
    <IconButton onClick={toggleTheme} color="inherit">
      {theme === 'dark' ? <Brightness7 /> : <Brightness4 />}
    </IconButton>
  );
};

export default LightOrDarkButton;