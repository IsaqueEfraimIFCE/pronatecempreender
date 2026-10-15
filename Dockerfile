# ============================================================
# STAGE 1 - BUILD DO FRONTEND
# ============================================================

FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/package.json
COPY backend/package.json backend/package.json
COPY shared/package.json shared/package.json

RUN npm ci

COPY frontend/ frontend/
COPY shared/ shared/
COPY backend/ backend/

RUN npm test

ARG VITE_FORM_URL

ENV VITE_FORM_URL=$VITE_FORM_URL

RUN npm run build && npm prune --omit=dev


# ============================================================
# STAGE 2 - SERVIDOR DE PRODUÇÃO
# ============================================================

FROM node:22-bookworm-slim AS production

ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules node_modules
COPY --from=build --chown=node:node /app/frontend/dist frontend/dist
COPY --chown=node:node package.json ./
COPY --chown=node:node backend backend
COPY --chown=node:node shared shared

USER node

EXPOSE 8080

CMD ["node", "backend/src/server.js"]
