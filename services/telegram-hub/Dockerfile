FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-package-lock && chown -R node:node /app
COPY --chown=node:node src ./src
USER node
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
