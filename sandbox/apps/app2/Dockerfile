# Savanna Park Zoo — production image
# Serves the pre-built Vite React app via nginx.
FROM nginx:1.27-alpine
COPY front/dist/ /usr/share/nginx/html/
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
