# API + web app in one image (URS-NF-006). Node runs the TypeScript sources directly (type stripping).
# AI generation is enabled by passing credentials at run time: docker run -e ANTHROPIC_API_KEY=... (never baked in).
FROM node:22-slim AS web
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @jtd/web build

FROM node:22-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core packages/core
COPY packages/api packages/api
COPY packages/ai packages/ai
COPY packages/web/package.json packages/web/package.json
COPY --from=web /app/packages/web/dist packages/web/dist
RUN pnpm install --frozen-lockfile --prod --filter "@jtd/api..." && pnpm store prune
USER node
EXPOSE 8080
HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "packages/api/src/server.ts"]
