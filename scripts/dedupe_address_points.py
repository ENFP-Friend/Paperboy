import json

with open('../data/address_points_raw.json') as f:
    raw_points = json.load(f)

# Deduplicate using address only (string match)
seen_addresses = set()
unique_points = []

for point in raw_points:
    addr = point["address"].strip().lower()
    if addr not in seen_addresses:
        seen_addresses.add(addr)
        unique_points.append(point)

print(f"✅ Reduced from {len(raw_points)} ➝ {len(unique_points)} unique points.")

with open('../data/address_points_raw.json', 'w') as f:
    json.dump(unique_points, f, indent=2)
