# Stock Management Frontend

A brutalist-styled inventory management frontend for InvenTree backend, featuring barcode scanning, volunteer stock management, and checkout functionality.

> ℹ️ **For more general information, guides, and internal documentation, visit the [HighTechLab SharePoint Stock Management Info Page](https://maakleerplek.sharepoint.com/sites/HighTechLab/SitePages/Stock-management-info-page.aspx).**

## Where it runs

The live app for the High Tech Lab runs on `htl-server`, a Rocky Linux VM on the maakleerplek server.

| Address | Use |
|---|---|
| **https://stock.int.maakleerplek.be/** | Main address, with a valid certificate. Resolves inside the maakleerplek network only. |
| https://10.72.1.246:8086/ | The server directly (self-signed certificate). Used by the lab kiosk. |

`htl-tempserver` (10.72.3.68) is a test server with an old copy of the data. Don't use it for real sales.

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

Copy `.env.example` to `.env`. Two settings are secrets and only live on the
server; the proxy (nginx in Docker, Vite in development) uses them and the
browser never receives them:

```env
INVENTREE_TOKEN=...        # added by the proxy to every InvenTree API call
VOLUNTEER_PASSWORD=...     # checked by the proxy at volunteer login
```

Without a volunteer login the app can read the catalogue and run a checkout,
nothing else. The rules are in `src/lib/apiAccess.ts` and
`nginx.conf.template`. Use an InvenTree user with only the roles the app
needs for the token, not a superuser.

Checkout books every sale as an InvenTree sales order on the customer
"Walk-in customer". A volunteer login creates that customer the first time.

## Design System

The look follows [maakleerplek.be](https://maakleerplek.be/nl). See
[STYLING_GUIDE.md](./STYLING_GUIDE.md) for colours, type and components.

## Project Structure

```
src/
  App.tsx              # Main app component with routing
  ShoppingCart.tsx     # Cart with stock change preview
  ShoppingWindow.tsx   # Cart wrapper; checkout as a sales order
  ItemList.tsx         # Stock list with inline editing
  BarcodeScanner.tsx   # Camera scanner component
  DataRepairModal.tsx  # Bulk barcode and supplier data repair tool
  components/
    Header.tsx         # App header with mode toggle
    AdminToolsBar.tsx  # Quick action buttons
    Footer.tsx         # App footer
  api/
    inventreeClient.ts # API client for InvenTree
  lib/
    apiAccess.ts       # Which calls need a volunteer (mirrored in nginx)
    stockHistory.ts    # Stock levels and sales from the tracking log
  index.css            # Global styles and Tailwind config
```

## Roadmap & TODOs

See the [TODO.md](./TODO.md) file for upcoming features, access control upgrades (such as Microsoft authentication for volunteers), and development goals.

## Branch Information

- `main`: Production-ready code
- `remaking-design`: Active development branch for design migration

## License

MIT
