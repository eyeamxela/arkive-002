# Deployment preparation only. Pin NODE_IMAGE to a reviewed digest before release.
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS ui
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci --ignore-scripts
COPY app/local.html ./
COPY app/scripts/personal.mjs ./scripts/personal.mjs
COPY app/src/personal ./src/personal
RUN node scripts/personal.mjs build

FROM ${NODE_IMAGE}
ENV NODE_ENV=production ARKIVE_HOST=0.0.0.0 ARKIVE_PORT=4317 \
    ARKIVE_ALLOW_REMOTE=true ARKIVE_BRAIN_DIR=/data/brain ARKIVE_UI_DIR=/app/ui
WORKDIR /app
COPY --chown=node:node personal-node/*.mjs ./
COPY --from=ui --chown=node:node /build/dist-personal ./ui
RUN mkdir -p /data/brain && chown node:node /data/brain
USER node
EXPOSE 4317
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:4317/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
