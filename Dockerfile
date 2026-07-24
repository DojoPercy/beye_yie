# ---- build stage: compiles TS → dist (needs devDependencies) ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage: runs compiled JS only, no compiler, no devDeps ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3005
# Run the pre-compiled entrypoint — NOT `nest start`.
CMD ["node", "dist/main.js"]
