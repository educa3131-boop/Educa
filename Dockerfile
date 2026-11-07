FROM node:22-bookworm-slim

WORKDIR /app

# Ferramentas para compilar better-sqlite3 caso não exista binário pré-compilado
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/data
RUN mkdir -p /data

EXPOSE 3000

CMD ["npm", "start"]
