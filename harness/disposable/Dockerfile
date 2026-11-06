FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205
WORKDIR /opt/doom
COPY harness/disposable/package.json harness/disposable/package-lock.json ./
# Keep Debian retrieval on HTTPS; retain certificate and package-signature checks.
# The slim base lacks system CAs: bootstrap from the pinned Node's public roots.
RUN npm ci --ignore-scripts --omit=dev \
    && node -e 'const fs = require("node:fs"); const path = "/etc/apt/sources.list.d/debian.sources"; fs.writeFileSync(path, fs.readFileSync(path, "utf8").replaceAll("http://deb.debian.org", "https://deb.debian.org"));' \
    && node -e 'const fs = require("node:fs"); fs.mkdirSync("/etc/ssl/certs", { recursive: true }); fs.writeFileSync("/etc/ssl/certs/ca-certificates.crt", require("node:tls").rootCertificates.join("\n") + "\n");' \
    && apt-get update && apt-get install -y --no-install-recommends ca-certificates git python3 build-essential ripgrep fd-find \
    && ln -s /usr/bin/fdfind /usr/local/bin/fd && rm -rf /var/lib/apt/lists/*
# Bootstrap only the locked native helper; all generic npm lifecycle scripts stay off.
# The installer verifies archive + binary digests but creates root-private modes.
RUN node --input-type=module -e 'import { installGentleAi } from "./node_modules/gentle-pi/scripts/gentle-ai-installer.mjs"; await installGentleAi();' \
    && chmod 0755 node_modules/gentle-pi/.gentle-ai node_modules/gentle-pi/.gentle-ai/v4.3.1 \
    && chmod 0555 node_modules/gentle-pi/.gentle-ai/v4.3.1/gentle-ai \
    && chmod 0444 node_modules/gentle-pi/.gentle-ai/v4.3.1/integrity.json
COPY harness/disposable/entrypoint.sh harness/disposable/model-proxy.mjs ./
COPY harness/disposable/config ./config
COPY harness/disposable/guidance.md ./guidance.md
COPY harness/disposable/skills ./skills
COPY harness/disposable/prompts ./prompts
COPY harness/themes/dr-doom.json ./themes/dr-doom.json
COPY harness/ui.js ./extensions/ui.js
RUN chmod 0555 entrypoint.sh
ENTRYPOINT ["/opt/doom/entrypoint.sh"]
