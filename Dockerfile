# Production Dockerfile for GCP Cloud Run
FROM node:22-alpine AS builder

WORKDIR /app

# Install ALL dependencies (devDeps needed for tsc build)
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
RUN npm ci 2>/dev/null || npm install

# Copy source and build
COPY tsconfig.json .
COPY src/ ./src/

RUN npm run build

# Production stage
FROM node:22-alpine AS runtime

WORKDIR /app

# Install production dependencies only (no devDeps in runtime)
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY .well-known/ ./.well-known/

# Create non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
