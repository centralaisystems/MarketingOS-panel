# Marketing OS operator panel — honest Node HTTP deploy.
# Does not enable live publish/ads. Default ops store is file.
FROM node:20-bookworm-slim
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
COPY brands ./brands
COPY reports ./reports
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

ENV HOST=0.0.0.0
ENV PORT=8787
ENV MOS_OPS_STORE=file
ENV MOS_EMAIL_MODE=dry_run
ENV MOS_ASSETS_SEED=true

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "--filter", "@marketing-os/panel", "start"]
