# Stock Management Frontend

A brutalist-styled inventory management frontend for InvenTree backend, featuring barcode scanning, volunteer stock management, and checkout functionality.

> ℹ️ **For more general information, guides, and internal documentation, visit the [HighTechLab SharePoint Stock Management Info Page](https://maakleerplek.sharepoint.com/sites/HighTechLab/SitePages/Stock-management-info-page.aspx).**

## Screenshots

| Checkout / Visitor Mode | Volunteer / Admin Dashboard |
| :---: | :---: |
| ![Checkout Mode](https://github.com/maakleerplek/Stock-management-frontend/releases/download/v1.0.0/kiosk_scanner_view.png) | ![Admin Dashboard](https://github.com/maakleerplek/Stock-management-frontend/releases/download/v1.0.0/admin_dashboard_view.png) |

## What You Can Do (User Guide)

### 🛒 Visitor & Checkout Mode (Kiosk)
Designed as a self-service terminal for makerspace members and visitors:
- **Lookup & Scan Items**: Instantly fetch item details by scanning barcodes using a web-camera or a connected physical USB barcode scanner. (Manual barcode input is supported as a fallback).
- **Manage Shopping Cart**: Add parts to the cart, review items, and adjust quantities with automatic cost calculations.
- **Calculate Extra Services**: Log and calculate charges for machine usage during checkout:
  - **Laser Cutting**: Charge by duration (minutes).
  - **CNC Milling**: Charge by machine runtime (minutes).
  - **3D Printing**: Charge by filament weight consumed (grams).
- **EPC QR & Payconiq Payment**: Instantly generate EPC QR / Wero and Payconiq checkout QR codes for fast, scan-to-pay bank transfers.

### 🛡️ Volunteer & Administrator Mode
Access back-office tools (protected by volunteer authentication) to manage the makerspace inventory:
- **Register New Inventory**: Add parts, define categories, and map storage locations or suppliers.
- **Adjust Stock Levels**: Make direct stock changes (Add, Remove, or Set exact values) inline from the stock list with visual color-coded feedback (green for additions, red for removals, blue for sets).
- **Procure via Purchase Orders**: Automatically group low-stock items into supplier draft orders, review with visual part previews, and issue or cancel purchase orders to keep stock filled.
- **Bulk Data Repair**: Run audit checks to locate and patch missing barcodes, SKU mapping, or supplier part associations in bulk.
- **Real-time Analytics**: Track overall inventory health, out-of-stock items, and low-stock items from the dashboard.

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

## Roadmap & TODOs

See the [TODO.md](./TODO.md) file for upcoming features, access control upgrades (such as Microsoft authentication for volunteers), and development goals.

## Branch Information

- `main`: Production-ready code
- `remaking-design`: Active development branch for design migration

## License

MIT
