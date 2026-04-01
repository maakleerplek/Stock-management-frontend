import { useState, useEffect } from 'react';
import { TextField, Typography, Box } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import { PRICING } from './constants';

interface ExtrasProps {
    onExtraCostChange: (cost: number) => void;
}

export default function Extras({ onExtraCostChange }: ExtrasProps) {
    const [lasertimeMinutes, setLasertimeMinutes] = useState(0);
    const [printingGrams, setPrintingGrams] = useState(0);

    const lasertimeCost = lasertimeMinutes * PRICING.LASER_PER_MINUTE;
    const printingCost = printingGrams * PRICING.PRINTING_PER_GRAM;
    const totalExtraCost = lasertimeCost + printingCost;

    useEffect(() => {
        onExtraCostChange(totalExtraCost);
    }, [lasertimeMinutes, printingGrams, onExtraCostChange, totalExtraCost]);

    return (
        <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, color: 'text.secondary', fontWeight: 'bold' }}>
                <SettingsIcon fontSize="small" /> Extra Services
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TextField
                        label={`Lasertime (min) - €${PRICING.LASER_PER_MINUTE.toFixed(2)}/min`}
                        type="number"
                        value={lasertimeMinutes}
                        onChange={(e) => setLasertimeMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                        fullWidth
                        size="small"
                        inputProps={{ min: "0" }}
                    />
                    <Typography variant="body2" sx={{ ml: 2, minWidth: '60px', textAlign: 'right' }}>€{lasertimeCost.toFixed(2)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <TextField
                        label={`3D Printing (g) - €${PRICING.PRINTING_PER_GRAM.toFixed(2)}/g`}
                        type="number"
                        value={printingGrams}
                        onChange={(e) => setPrintingGrams(Math.max(0, parseFloat(e.target.value) || 0))}
                        fullWidth
                        size="small"
                        inputProps={{ min: "0", step: "1" }}
                    />
                    <Typography variant="body2" sx={{ ml: 2, minWidth: '60px', textAlign: 'right' }}>€{printingCost.toFixed(2)}</Typography>
                </Box>
                <Typography variant="subtitle2" align="right" sx={{ mt: 1, fontWeight: 'bold' }}>
                    Total Extra Services: €{totalExtraCost.toFixed(2)}
                </Typography>
            </Box>
        </Box>
    );
}
