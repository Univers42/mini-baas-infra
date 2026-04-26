# syntax=docker/dockerfile:1
# Production Kong gateway image for Fly.io.
# Renders docker/services/kong/conf/kong.yml placeholders from runtime secrets.

FROM kong:3.8

USER root
RUN mkdir -p /etc/kong
COPY --link docker/services/kong/conf/kong.yml /etc/kong/kong.yml.tmpl
COPY --link deploy/fly/render-kong-config.sh /usr/local/bin/render-kong-config.sh
RUN chmod +x /usr/local/bin/render-kong-config.sh

ENV KONG_DATABASE=off \
  KONG_DECLARATIVE_CONFIG=/tmp/kong.yml \
  KONG_PROXY_ACCESS_LOG=/dev/stdout \
  KONG_ADMIN_ACCESS_LOG=/dev/stdout \
  KONG_PROXY_ERROR_LOG=/dev/stderr \
  KONG_ADMIN_ERROR_LOG=/dev/stderr \
  KONG_ADMIN_LISTEN=0.0.0.0:8001 \
  KONG_NGINX_WORKER_PROCESSES=1 \
  KONG_MEM_CACHE_SIZE=64m \
  KONG_UNTRUSTED_LUA_SANDBOX_REQUIRES=cjson.safe

EXPOSE 8000 8001
ENTRYPOINT ["/usr/local/bin/render-kong-config.sh"]
CMD ["kong", "docker-start"]
