# TriStar Weather Station dashboard

Initial read-only dashboard for MouseNAS. Runs independently of TSOLive and nginx.

## Start locally on MouseNAS

1. Check out branch `initial-dev`.
2. Copy `.env.example` to `.env`, then set real MySQL connection values. Use a database account granted **SELECT only** on `weather_station_v2.observations`.
3. Ensure MySQL accepts connections from the Docker network. If it listens only on localhost, use a reachable host address or configure a host-gateway mapping.
4. Run `docker compose up -d --build`.
5. Browse to `http://Mousenas-LAN-IP:8088/` (or `http://localhost:8088/` on MouseNAS).

Logs: `docker compose logs -f weather-web`.
Stop: `docker compose down`.

The browser receives only selected weather metrics through `/api/current` and aggregated `/api/history`. No database credentials reach the browser.

History supports Today (midnight in `STATION_TIMEZONE` through now), rolling 24h, 7d and 30d. Database timestamps are interpreted as UTC. Rainfall is plotted from the station's local-day accumulation; the series may reset at midnight in multi-day views. No public reverse proxy is configured.

**Note:** Graphs are aggregated into time buckets. The current values may lag by the station's MySQL sync interval. No demo readings are substituted for missing data.
