FROM node:20-alpine

# Install Chromium and dependencies
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    udev \
    dbus \
    font-noto \
    python3 \
    py3-pip \
    build-base

# upgrade python tooling so node-gyp can build better-sqlite3
RUN python3 -m pip install --break-system-packages --upgrade pip setuptools

# Tell Puppeteer to use installed Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /usr/kingbot

COPY . .

RUN npm install && npm run build

EXPOSE 3000

CMD ["npm", "start"]
