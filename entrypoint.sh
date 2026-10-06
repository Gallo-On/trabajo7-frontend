#!/bin/sh
set -eu

mkdir -p /var/log/nginx /var/log/fail2ban /var/run/fail2ban
rm -f /var/log/nginx/access.log /var/log/nginx/error.log
touch /var/log/nginx/access.log /var/log/nginx/error.log /var/log/fail2ban.log
rm -f /var/run/fail2ban/fail2ban.sock /var/run/fail2ban/fail2ban.pid

/docker-entrypoint.sh nginx -g 'daemon off;' &
fail2ban-client -x start

exec tail -F /var/log/nginx/access.log /var/log/fail2ban.log