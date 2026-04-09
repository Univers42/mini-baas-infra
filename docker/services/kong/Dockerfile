# syntax=docker/dockerfile:1
# File: docker/services/kong/Dockerfile

FROM kong:3.8
COPY --link conf/kong.yml /etc/kong/kong.yml
ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_ADMIN_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_LISTEN=0.0.0.0:8001
EXPOSE 8000 8001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["kong", "docker-start"]
