# API service for Railway — identical to `docker build --target prod .`.
# Railway dashboard: builder = Dockerfile, path = api.Dockerfile,
# public domain ON (Vercel's /api rewrite targets it), volume at /data,
# env UPLOAD_DIR=/data, healthcheck GET /api/health.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3025
CMD ["node", "dist/server.cjs"]
