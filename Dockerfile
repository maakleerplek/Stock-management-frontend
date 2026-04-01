# Multi-stage build for Stock Management Frontend
# Stage 1: Build the React application with Vite
# Stage 2: Serve with nginx

# ==================== BUILD STAGE ====================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build arguments for environment variables (passed at build time)
ARG VITE_INVENTREE_URL
ARG VITE_INVENTREE_TOKEN
ARG VITE_VOLUNTEER_PASSWORD
ARG VITE_LASER_PRICE_PER_MIN
ARG VITE_PRINT_PRICE_PER_GRAM
ARG VITE_CURRENCY
ARG VITE_PAYMENT_NAME
ARG VITE_PAYMENT_IBAN
ARG VITE_DOCS_URL
ARG VITE_FEEDBACK_URL
ARG VITE_GITHUB_URL

# Set environment variables for build
ENV VITE_INVENTREE_URL=${VITE_INVENTREE_URL}
ENV VITE_INVENTREE_TOKEN=${VITE_INVENTREE_TOKEN}
ENV VITE_VOLUNTEER_PASSWORD=${VITE_VOLUNTEER_PASSWORD}
ENV VITE_LASER_PRICE_PER_MIN=${VITE_LASER_PRICE_PER_MIN}
ENV VITE_PRINT_PRICE_PER_GRAM=${VITE_PRINT_PRICE_PER_GRAM}
ENV VITE_CURRENCY=${VITE_CURRENCY}
ENV VITE_PAYMENT_NAME=${VITE_PAYMENT_NAME}
ENV VITE_PAYMENT_IBAN=${VITE_PAYMENT_IBAN}
ENV VITE_DOCS_URL=${VITE_DOCS_URL}
ENV VITE_FEEDBACK_URL=${VITE_FEEDBACK_URL}
ENV VITE_GITHUB_URL=${VITE_GITHUB_URL}

# Build the application
RUN npm run build

# ==================== PRODUCTION STAGE ====================
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
