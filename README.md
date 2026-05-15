# Stock Management Frontend

A brutalist-styled inventory management frontend for InvenTree backend, featuring barcode scanning, volunteer stock management, and checkout functionality.

## Features

- **Barcode Scanning**: USB scanner support and camera-based scanning
- **Dual Mode Operation**:
  - **Checkout Mode**: Customer-facing with shopping cart and payment QR codes
  - **Volunteer Mode**: Admin tools for stock management with add/remove/set operations
- **Real-time Stock Tracking**: See current stock, location, and category for each item
- **Supplier Management**: Items are linked to suppliers (e.g. Prik&Tik) with pack barcodes and pack quantities
- **Purchase Orders**: Track restocking via InvenTree purchase orders (internal tracking — does not notify suppliers automatically)
- **PWA Support**: Works offline with service worker caching
- **Mobile-First Design**: Optimized for touch devices with haptic feedback

## Purchase Order Workflow

Purchase orders are managed in InvenTree and are **internal tracking only** — placing a PO does not notify the supplier.

| Status | Meaning |
|---|---|
| **Pending** | Planned but not yet ordered |
| **Issued** | Order placed with supplier |
| **Received** | Delivery arrived — stock auto-updated |

When an item runs empty: create a PO in InvenTree → place the order with the supplier → Issue the PO → Receive when delivered.

## Tech Stack

- **React 18** with TypeScript
- **Tailwind CSS v4** for styling (brutalist design system)
- **Framer Motion** for animations
- **Lucide React** for icons
- **Vite** for development and building
- **Docker** for deployment with nginx

## Getting Started

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Production Build

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up --build
```

## Environment Variables

Create a `.env` file:

```env
VITE_INVENTREE_URL=https://your-inventree-server:8443
```

## Design System

This application uses a brutalist design aesthetic. See [STYLING_GUIDE.md](./STYLING_GUIDE.md) for detailed design principles and CSS conventions.

Key principles:
- 3px solid black borders
- Drop shadows only on clickable buttons
- Bold uppercase typography
- White/gray backgrounds in volunteer mode (no beige)
- Color-coded feedback (green=add, red=remove, blue=set)

## Project Structure

```
src/
  App.tsx              # Main app component with routing
  ShoppingCart.tsx     # Cart with stock change preview
  ShoppingWindow.tsx   # Cart wrapper with checkout logic
  ItemList.tsx         # Stock list with inline editing
  BarcodeScanner.tsx   # Camera scanner component
  DataRepairModal.tsx  # Bulk barcode and supplier data repair tool
  components/
    Header.tsx         # App header with mode toggle
    AdminToolsBar.tsx  # Quick action buttons
    Footer.tsx         # App footer
  api/
    inventreeClient.ts # API client for InvenTree
  index.css            # Global styles and Tailwind config
```

## Branch Information

- `main`: Production-ready code
- `remaking-design`: Active development branch for design migration

## License

MIT
