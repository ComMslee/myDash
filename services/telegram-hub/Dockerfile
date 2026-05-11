FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-package-lock
COPY src ./src
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
