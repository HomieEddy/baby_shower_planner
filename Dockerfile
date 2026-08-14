FROM node:22-alpine AS base

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 3025

FROM base AS dev
CMD ["npm", "run", "dev:docker"]

FROM base AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
EXPOSE 3025
CMD ["node", "dist/server.cjs"]
