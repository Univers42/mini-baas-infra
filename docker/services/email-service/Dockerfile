# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Dockerfile                                         :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/09 23:34:18 by dlesieur          #+#    #+#              #
#    Updated: 2026/04/09 23:34:19 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

# syntax=docker/dockerfile:1
# File: docker/services/email-service/Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app
COPY --link package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup src/ ./src/
COPY --chown=appuser:appgroup package.json ./
USER appuser
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3030/health/live',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
EXPOSE 3030
CMD ["node", "src/server.js"]
