# **************************************************************************** #
#                                                                              #
#                                                         :::      ::::::::    #
#    Dockerfile                                         :+:      :+:    :+:    #
#                                                     +:+ +:+         +:+      #
#    By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+         #
#                                                 +#+#+#+#+#+   +#+            #
#    Created: 2026/04/09 23:37:26 by dlesieur          #+#    #+#              #
#    Updated: 2026/04/09 23:37:27 by dlesieur         ###   ########.fr        #
#                                                                              #
# **************************************************************************** #

# syntax=docker/dockerfile:1
# File: docker/services/trino/Dockerfile

FROM trinodb/trino:467
COPY --link conf/config.properties /etc/trino/config.properties
EXPOSE 8080
