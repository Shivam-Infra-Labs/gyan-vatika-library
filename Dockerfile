FROM node:20-alpine
WORKDIR /app

ARG NEXT_PUBLIC_CENTER_LAT=22.820576
ARG NEXT_PUBLIC_CENTER_LNG=86.094174
ENV NEXT_PUBLIC_CENTER_LAT=$NEXT_PUBLIC_CENTER_LAT
ENV NEXT_PUBLIC_CENTER_LNG=$NEXT_PUBLIC_CENTER_LNG
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY . .
RUN NODE_ENV=production npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]