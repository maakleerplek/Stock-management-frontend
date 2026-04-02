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
ARG VITE_ORGANIZATION_NAME
ARG VITE_ORGANIZATION_URL
ARG VITE_INVENTREE_URL
ARG VITE_INVENTREE_TOKEN
ARG VITE_VOLUNTEER_PASSWORD
ARG VITE_LASER_PRICE_PER_MIN
ARG VITE_PRINT_PRICE_PER_GRAM
ARG VITE_CURRENCY
ARG VITE_PAYMENT_NAME
ARG VITE_PAYMENT_IBAN
ARG VITE_PAYCONIQ_MERCHANT_ID
ARG VITE_DOCS_URL
ARG VITE_FEEDBACK_URL
ARG VITE_GITHUB_URL

# Set environment variables for build
ENV VITE_ORGANIZATION_NAME=${VITE_ORGANIZATION_NAME}
ENV VITE_ORGANIZATION_URL=${VITE_ORGANIZATION_URL}
ENV VITE_INVENTREE_URL=${VITE_INVENTREE_URL}
ENV VITE_INVENTREE_TOKEN=${VITE_INVENTREE_TOKEN}
ENV VITE_VOLUNTEER_PASSWORD=${VITE_VOLUNTEER_PASSWORD}
ENV VITE_LASER_PRICE_PER_MIN=${VITE_LASER_PRICE_PER_MIN}
ENV VITE_PRINT_PRICE_PER_GRAM=${VITE_PRINT_PRICE_PER_GRAM}
ENV VITE_CURRENCY=${VITE_CURRENCY}
ENV VITE_PAYMENT_NAME=${VITE_PAYMENT_NAME}
ENV VITE_PAYMENT_IBAN=${VITE_PAYMENT_IBAN}
ENV VITE_PAYCONIQ_MERCHANT_ID=${VITE_PAYCONIQ_MERCHANT_ID}
ENV VITE_DOCS_URL=${VITE_DOCS_URL}
ENV VITE_FEEDBACK_URL=${VITE_FEEDBACK_URL}
ENV VITE_GITHUB_URL=${VITE_GITHUB_URL}

# Build the application
RUN npm run build

# ==================== PRODUCTION STAGE ====================
FROM nginx:alpine

# Install openssl for certificate generation
RUN apk add --no-cache openssl

# Set the working directory to nginx asset directory
WORKDIR /usr/share/nginx/html

# Remove default nginx static assets
RUN rm -rf ./*

# Copy built files from builder stage
COPY --from=builder /app/dist .

# Copy Nginx template and entrypoint
COPY nginx.conf.template /etc/nginx/templates/nginx.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports 80 and 443
EXPOSE 80 443

# Health check using curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
