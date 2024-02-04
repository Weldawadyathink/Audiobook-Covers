FROM node:18 as builder
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY src/ .
RUN npm run build



FROM node:18-alpine
WORKDIR /usr/src/app

COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/app.js"]
