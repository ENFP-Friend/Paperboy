import json
import requests

OSRM_HOST = 'http://localhost:5000'
INPUT_FILE = '../data/address_points.geojson'
OUTPUT_FILE = '../data/snapped_address_points.geojson'

def snap_to_road(lon, lat):
    url = f'{OSRM_HOST}/nearest/v1/foot/{lon},{lat}'
    try:
        res = requests.get(url)
        res.raise_for_status()
        data = res.json()
        if data['code'] == 'Ok' and data['waypoints']:
            return data['waypoints'][0]['location']  # [lon, lat]
    except Exception as e:
        print(f'❌ Failed to snap [{lon}, {lat}]: {e}')
    return None

def main():
    with open(INPUT_FILE, 'r') as f:
        geojson = json.load(f)

    snapped_features = []
    for feature in geojson['features']:
        lon, lat = feature['geometry']['coordinates']
        snapped = snap_to_road(lon, lat)
        if snapped:
            feature['geometry']['coordinates'] = snapped
            snapped_features.append(feature)
        else:
            print(f'⚠️ Skipped unsnappable point: [{lon}, {lat}]')

    output = {
        "type": "FeatureCollection",
        "features": snapped_features
    }

    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'✅ Snapped {len(snapped_features)} points ➝ saved to {OUTPUT_FILE}')

if __name__ == '__main__':
    main()
