FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV VITE_API_URL=https://mumak.noroo.kr
RUN npm test && npm run build
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
