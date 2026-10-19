
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

EXPOSE 3000

# Vite listens on 0.0.0.0:3000 inside the container.
CMD ["npm", "start"]
