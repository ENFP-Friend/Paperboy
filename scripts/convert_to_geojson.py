import json

# Takes the raw .json access points and converts them to .geojson

with open('../data/address_points_raw.json', 'r') as infile:
    raw = json.load(infile)

geojson = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": [point["lng"], point["lat"]]
            },
            "properties": {
                "address": point["address"]
            }
        }
        for point in raw
    ]
}

with open('../data/address_points.geojson', 'w') as outfile:
    json.dump(geojson, outfile, indent=2)

print(f"Converted {len(geojson['features'])} points to GeoJSON.")
