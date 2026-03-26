FROM kong:3.8

# Copy Kong configuration file
COPY kong.yml /etc/kong/kong.yml

# Set Kong environment variables for declarative configuration
ENV KONG_DATABASE=off \
    KONG_DECLARATIVE_CONFIG=/etc/kong/kong.yml \
    KONG_PROXY_ACCESS_LOG=/dev/stdout \
    KONG_ADMIN_ACCESS_LOG=/dev/stdout \
    KONG_PROXY_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_ERROR_LOG=/dev/stderr \
    KONG_ADMIN_LISTEN=0.0.0.0:8001

# Expose Kong ports
EXPOSE 8000 8001

# Use Kong's default entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["kong", "docker-start"]
