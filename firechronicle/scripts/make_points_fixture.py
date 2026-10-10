import json, random
points = []
for _ in range(5000):
    points.append({
        "lat": random.uniform(20.7, 26.6),
        "lon": random.uniform(88.0, 92.6),
        "frp": random.uniform(5.0, 200.0),
        "sensor": random.choice(["MODIS", "VIIRS"]),
        "date": "2022-03-21"
    })
with open('app/public/fixtures/firms_points.json', 'w') as f:
    json.dump({"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": {"type": "Point", "coordinates": [p["lon"], p["lat"]]}, "properties": p} for p in points
    ]}, f)
