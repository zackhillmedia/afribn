FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV AFRIBN_DB_PATH=/app/data/afribn.sqlite
ENV AFRIBN_UPLOAD_DIR=/app/uploads

COPY package.json ./
COPY server.js ./
COPY src ./src
COPY docs ./docs
COPY AFRIBN_design ./AFRIBN_design
COPY index.html styles.css app.js frontend-api.js ./
COPY robots.txt sitemap.xml ./

RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

CMD ["node", "server.js"]
