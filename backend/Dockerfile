# node:sqlite (yerleşik SQLite) için Node 22.13+ gerekir; native derleme yok
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY seed ./seed
RUN mkdir -p /app/static/images /app/static/panoramas
EXPOSE 8000
CMD ["node", "dist/index.js"]
