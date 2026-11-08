# Backend dev image — hot reload via `tsx watch` (src is bind-mounted by compose).
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so they are cached independently of source changes.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the source (overridden at runtime by the ./backend/src bind mount).
COPY . .

EXPOSE 3001

CMD ["npm", "run", "dev"]
