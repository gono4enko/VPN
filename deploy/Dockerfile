FROM node:22-slim AS deps

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev


FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./package.json

COPY dist/ ./dist/
COPY db-schema/ ./db-schema/
COPY drizzle.config.ts ./drizzle.config.ts
COPY entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
