FROM node:18-alpine

WORKDIR /app

# Install dependencies (use package-lock if present)
COPY package.json package-lock.json* ./
RUN npm ci --only=production || npm install --only=production

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 4242

CMD ["node", "server.js"]
