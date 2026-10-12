#!/bin/bash
# ufw rules for the clubfinder production server, as recorded on 2026-10-12
# from `sudo ufw status verbose`. Run as root on a fresh server to recreate
# them. ufw matches rules in the order they were added, so keep the order:
# each set of ALLOW rules must come before the DENY that follows it.
#
# Not included: 3100/tcp from 172.20.0.0/16 (belongs to the ROH stack).
set -euo pipefail

ufw default deny incoming
ufw default allow outgoing
ufw default deny routed
ufw logging low

# SSH
ufw allow OpenSSH
ufw allow 22/tcp

# clubfindr (node) is open to the internet on 3000, bypassing nginx/TLS and
# the Cloudflare-only rule below. Recorded as-is; consider removing these and
# binding node to 127.0.0.1 instead.
ufw allow 3000/tcp
ufw allow 3000

# PostgreSQL: localhost and the Docker networks only
ufw allow from 127.0.0.1 to any port 5432
ufw allow from 172.17.0.0/16 to any port 5432
ufw allow from 172.30.0.0/16 to any port 5432
ufw deny 5432/tcp

# HTTP/HTTPS: Cloudflare only (https://www.cloudflare.com/ips/)
for net in \
	103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 104.16.0.0/13 104.24.0.0/14 \
	108.162.192.0/18 131.0.72.0/22 141.101.64.0/18 162.158.0.0/15 172.64.0.0/13 \
	173.245.48.0/20 188.114.96.0/20 190.93.240.0/20 197.234.240.0/22 198.41.128.0/17 \
	2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 \
	2a06:98c0::/29 2c0f:f248::/32; do
	ufw allow proto tcp from "$net" to any port 80,443
done
ufw deny 80/tcp
ufw deny 443/tcp

# Port 5000 (spotify_service Flask API) has no rule: blocked by the default
# deny; clubfindr calls it on 127.0.0.1.

ufw --force enable
