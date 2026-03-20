# Example Dockerfile for dynamic-api (Go example)
# Uses multistage build - Go edition
# This produces a very small image (~10-15MB)

# Stage 1: Builder
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Install build dependencies
RUN apk add --no-cache git make

# Copy go mod files
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-w -s" -o dynamic-api .

# Stage 2: Runtime (minimal image using distroless)
FROM gcr.io/distroless/base-debian12

WORKDIR /app

# Copy binary from builder
COPY --from=builder /build/dynamic-api .

# Expose port
EXPOSE 8080

# Health check (distroless doesn't have curl, using wget is not available either)
# Consider implementing health endpoint in your Go app

# Run the application
ENTRYPOINT ["/app/dynamic-api"]
