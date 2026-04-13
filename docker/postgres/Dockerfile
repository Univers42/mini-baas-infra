FROM postgres:16

# Install build dependencies for pg_net
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ca-certificates \
    curl \
    git \
    libcurl4-openssl-dev \
    postgresql-server-dev-16 \
  && rm -rf /var/lib/apt/lists/*

# Build and install pg_net from source (suppress -Werror=attribute-warning for curl/gcc compat)
RUN git clone --depth 1 --branch v0.14.0 https://github.com/supabase/pg_net.git /tmp/pg_net \
  && cd /tmp/pg_net \
  && make COPT="-Wno-error=attribute-warning" \
  && make install \
  && rm -rf /tmp/pg_net

# Clean up build deps to keep image smaller
RUN apt-get purge -y --auto-remove \
    build-essential \
    git \
    postgresql-server-dev-16 \
  && rm -rf /var/lib/apt/lists/*
