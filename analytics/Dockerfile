# Build context: the repo root (the server reuses src/api and src/lib).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:analytics

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist-analytics/server.js .
USER node
EXPOSE 8080
CMD ["node", "--max-old-space-size=192", "server.js"]
