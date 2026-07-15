FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/src ./apps/api/src
RUN npm run build:api

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --omit=dev --workspace @little-family/api
COPY --from=build /repo/apps/api/dist ./apps/api/dist
RUN mkdir -p /repo/apps/api/data && chown -R node:node /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 3000
VOLUME ["/repo/apps/api/data"]
CMD ["node", "dist/index.js"]
