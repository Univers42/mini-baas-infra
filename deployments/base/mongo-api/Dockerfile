# syntax=docker/dockerfile:1

FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

EXPOSE 3010

CMD ["npm", "start"]
