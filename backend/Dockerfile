FROM node:20-alpine AS builder
RUN apk add --no-cache python3 py3-setuptools make g++ sqlite sqlite-dev
WORKDIR /build
RUN npm install n8n-nodes-sqlite --build-from-source

FROM n8nio/n8n:latest
COPY --from=builder /build/node_modules /home/node/.n8n/nodes/node_modules
