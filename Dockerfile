FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY proxy.js .
EXPOSE 8080
CMD ["node", "proxy.js"]