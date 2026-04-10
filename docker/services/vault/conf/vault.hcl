# File: docker/services/vault/conf/vault.hcl
# HashiCorp Vault — production-grade server configuration.
# Uses file-based storage (suitable for single-node deployments).

storage "file" {
  path = "/vault/data"
}

listener "tcp" {
  address     = "0.0.0.0:8200"
  # TLS disabled for internal Docker network.
  # In production, terminate TLS at the WAF/LB layer.
  tls_disable = 1
}

api_addr     = "http://0.0.0.0:8200"
cluster_addr = "https://0.0.0.0:8201"

ui = true

# Disable memory locking warning (we use cap_add: IPC_LOCK instead)
disable_mlock = false

# Telemetry for Prometheus scraping
telemetry {
  prometheus_retention_time = "30s"
  disable_hostname          = true
}

# Maximum lease TTL (secrets)
max_lease_ttl = "768h"

# Default lease TTL
default_lease_ttl = "168h"
