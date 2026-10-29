"""Read-only weather dashboard. Database timestamps are UTC DATETIME."""
import os
import json
import logging
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from contextlib import closing
from pathlib import Path

import pymysql
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger('tristar.weather')
ROOT = Path(__file__).parent
ZONE = ZoneInfo(os.getenv("STATION_TIMEZONE", "America/Chicago"))
app = FastAPI(title="TriStar Weather")
app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")

FIELDS = ("bme_temp_c", "dew_point_c", "humidity_pct", "pressure_hpa",
          "pressure_sealevel_hpa", "sky_temperature_c", "ground_temperature_c",
          "wind_speed_mps", "wind_dir_deg", "wind_gust_10min", "wind_gust_hour",
          "wind_gust_today", "rain_rate_mm_hr", "rain_hourly_mm", "rain_daily_mm")
SELECT = ", ".join(["obs_timestamp", *FIELDS])

def connection():
    return pymysql.connect(
        host=os.environ["MYSQL_HOST"], port=int(os.getenv("MYSQL_PORT", "3306")),
        user=os.environ["MYSQL_USER"], password=os.environ["MYSQL_PASSWORD"],
        database=os.environ["MYSQL_DATABASE"], cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5, read_timeout=15, autocommit=True, charset="utf8mb4"
    )

def serialize(row):
    if row is None:
        return None
    row = dict(row)
    row["timestamp"] = row.pop("obs_timestamp").replace(tzinfo=timezone.utc).isoformat()
    return row

@app.get("/")
def homepage():
    return FileResponse(ROOT / "static" / "index.html")

@app.get("/api/current")
def current():
    """Fetch fresh measurements from the Pi, never from MySQL."""
    try:
        request = Request(
            os.environ["WX_STATION_URL"],
            headers={"Accept": "application/json", "User-Agent": "TriStar-Weather/1.0"},
        )
        with urlopen(request, timeout=5) as response:
            payload = json.load(response)
        if not isinstance(payload, dict) or not payload.get("timestamp"):
            raise ValueError("Weather station returned an invalid observation")
        # Return only fields required by the dashboard; no system metrics or config.
        return {"timestamp": payload["timestamp"],
                **{field: payload.get(field) for field in FIELDS}}
    except (OSError, ValueError, KeyError, HTTPError, URLError) as exc:
        logger.exception("Live weather station request failed")
        raise HTTPException(status_code=503, detail=f"Live weather station error: {exc}") from exc

@app.get("/api/history")
def history(range: str = Query("today", pattern="^(today|24h|7d|30d)$")):
    now = datetime.now(timezone.utc)
    if range == "today":
        local = now.astimezone(ZONE)
        start = local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    else:
        start = now - timedelta(hours={"24h":24,"7d":168,"30d":720}[range])
    # Fixed time buckets keep chart payloads modest. Bucket by UTC epoch seconds.
    bucket = {"today":300, "24h":600, "7d":3600, "30d":10800}[range]
    try:
        with closing(connection()) as db, db.cursor() as cur:
            cur.execute("""
                SELECT MIN(obs_timestamp) AS obs_timestamp,
                       AVG(bme_temp_c) AS bme_temp_c,
                       AVG(dew_point_c) AS dew_point_c,
                       AVG(pressure_hpa) AS pressure_hpa,
                       AVG(pressure_sealevel_hpa) AS pressure_sealevel_hpa,
                       MAX(rain_daily_mm) AS rain_daily_mm
                FROM observations
                WHERE obs_timestamp >= %s AND obs_timestamp <= %s
                GROUP BY FLOOR(UNIX_TIMESTAMP(obs_timestamp)/%s)
                ORDER BY obs_timestamp
            """, (start.replace(tzinfo=None), now.replace(tzinfo=None), bucket))
            rows = [serialize(row) for row in cur.fetchall()]
        return {"range": range, "timezone": str(ZONE), "observations": rows}
    except (pymysql.MySQLError, KeyError) as exc:
        logger.exception("MySQL historical query failed")
        raise HTTPException(status_code=503, detail=f"MySQL history error: {exc}") from exc
