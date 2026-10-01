FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* değişkenleri build sırasında koda gömülür; çalışma anında verilirse etkisizdir
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=build /app ./
USER node
EXPOSE 3001
CMD ["npm", "start"]
