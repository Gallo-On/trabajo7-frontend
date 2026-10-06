FROM nginx:alpine

RUN apk add --no-cache fail2ban iptables iproute2 bash

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
COPY index.css /usr/share/nginx/html/index.css
COPY app.js /usr/share/nginx/html/app.js
COPY jail.local /etc/fail2ban/jail.local
COPY filter-http-flood.conf /etc/fail2ban/filter.d/http-flood.conf
COPY entrypoint.sh /entrypoint.sh

# Crear script de arranque para inicializar env-config.js por defecto si no existe
RUN echo '#!/bin/sh' > /docker-entrypoint.d/40-init-env.sh && \
    echo 'mkdir -p /shared' >> /docker-entrypoint.d/40-init-env.sh && \
    echo 'if [ ! -f /shared/env-config.js ]; then' >> /docker-entrypoint.d/40-init-env.sh && \
    echo '  echo "window._env_ = { API_URL: \"${API_URL:-http://localhost:5000/api/data}\", API_KEY: \"${API_KEY:-INITIAL-SECRET-2026-KEY}\" };" > /shared/env-config.js;' >> /docker-entrypoint.d/40-init-env.sh && \
    echo 'fi' >> /docker-entrypoint.d/40-init-env.sh && \
    chmod +x /docker-entrypoint.d/40-init-env.sh

RUN chmod +x /entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
