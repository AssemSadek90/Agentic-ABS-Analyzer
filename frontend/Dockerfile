# Frontend dev image — Next.js 14 dev server with hot reload.
FROM node:20-alpine

WORKDIR /app

# Install dependencies first so they are cached independently of source changes.
COPY package.json package-lock.json* ./
RUN npm install

# Copy the rest of the app.
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
