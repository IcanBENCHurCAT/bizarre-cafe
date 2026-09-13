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

# Compile workspace packages prior to root application build
RUN npm --workspace=packages/sdk run build || npm --workspace=@bizarre-cafe/sdk run build
RUN npm run build

# Production stage
FROM node:22-alpine AS runtime

WORKDIR /app

# Install production dependencies only (no devDeps in runtime)
COPY package.json package-lock.json* ./
COPY packages/ ./packages/
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY .well-known/ ./.well-known/

# Create non-root user (UID 10001)
RUN addgroup -g 10001 -S appgroup && adduser -u 10001 -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/index.js"]
