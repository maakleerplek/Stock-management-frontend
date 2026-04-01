import { Box, Container, Typography, Link, Divider } from '@mui/material';
import { GitHub, Info } from '@mui/icons-material';
import { ORGANIZATION } from './constants';

function Footer() {
  const currentYear = new Date().getFullYear();
  const docsUrl = import.meta.env.VITE_DOCS_URL;
  const feedbackUrl = import.meta.env.VITE_FEEDBACK_URL;
  const githubUrl = import.meta.env.VITE_GITHUB_URL;

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        mt: 'auto',
        py: { xs: 2, sm: 4 },
        marginTop: { xs: 3, sm: 6 },
      }}
    >
      <Container maxWidth="lg">
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            gap: { xs: 2, sm: 4 },
            mb: { xs: 2, sm: 3 },
          }}
        >
          {/* Product Info */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: { xs: 0.5, sm: 2 } }}>
              Stock Management
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' }, mb: 1 }}>
              Inventory management system with barcode scanning and checkout functionality.
            </Typography>
          </Box>

          {/* Version & Info */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: { xs: 0.5, sm: 2 } }}>
              System Info
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'row', sm: 'column' }, gap: { xs: 2, sm: 1 }, flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                <strong>Ver:</strong> 0.8.0
              </Typography>
              <Typography variant="caption" color="text.secondary">
                <strong>Status:</strong> Active
              </Typography>
            </Box>
          </Box>

          {/* Resources */}
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: { xs: 0.5, sm: 2 } }}>
              Resources
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'row', gap: 2, flexWrap: 'wrap' }}>
              {docsUrl && (
                <Link
                  href={docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="primary"
                  sx={{
                    textDecoration: 'none',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5
                  }}
                >
                  <Info sx={{ fontSize: '0.9rem' }} /> Docs
                </Link>
              )}
              {feedbackUrl && (
                <Link
                  href={feedbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="primary"
                  sx={{
                    textDecoration: 'none',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5
                  }}
                >
                  Feedback
                </Link>
              )}
              {githubUrl && (
                <Link
                  href={githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  color="primary"
                  sx={{
                    textDecoration: 'none',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5
                  }}
                >
                  <GitHub sx={{ fontSize: '0.9rem' }} /> GitHub
                </Link>
              )}
            </Box>
          </Box>
        </Box>

        <Divider sx={{ my: { xs: 1, sm: 2 } }} />

        {/* Copyright */}
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            &copy; {currentYear} Stock Management. Powered by {ORGANIZATION.NAME}
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}

export default Footer;
