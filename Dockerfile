# 網站總體健檢要截圖，需要 Chromium 和中文字型（11-25）
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 靜態頁在 build 時就會用到的變數（沒設就用程式裡的預設值）
ARG CHECKED_COUNT
ARG NEXT_PUBLIC_GA_ID
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates util-linux && rm -rf /var/lib/apt/lists/*
# Chromium 開的是別人的網站：用另一個沒權限的帳號跑，讀不到網站程式的環境變數（金鑰）
RUN useradd --system --create-home --home-dir /home/shot shot \
 && printf '#!/bin/sh\nexec setpriv --reuid=shot --regid=shot --clear-groups --no-new-privs env -i PATH=/usr/bin:/bin HOME=/home/shot LANG=C.UTF-8 /usr/bin/chromium --no-sandbox "$@"\n' > /usr/local/bin/shot-chromium \
 && chmod 755 /usr/local/bin/shot-chromium
WORKDIR /app
ENV NODE_ENV=production WCAG_CHROME_PATH=/usr/local/bin/shot-chromium WCAG_CHROME_DATA=/home/shot/profile
COPY --from=build /app ./
CMD ["npm", "run", "start"]
