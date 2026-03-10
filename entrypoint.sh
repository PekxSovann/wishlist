export PROTOCOL_HEADER=x-forwarded-proto 
export HOST_HEADER=x-forwarded-host
export PUBLIC_DEFAULT_CURRENCY=${DEFAULT_CURRENCY}
export BODY_SIZE_LIMIT=${MAX_IMAGE_SIZE:-5000000}

: "${DATABASE_URL:?DATABASE_URL is required}"

caddy start --config /usr/src/app/Caddyfile

pnpm prisma migrate deploy && \
pnpm prisma db seed && \
pnpm db:patch && \
pnpm start
