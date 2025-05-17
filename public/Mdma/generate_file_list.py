import os
import json

# Only look for .txt and .mdma files
extensions = ['.txt', '.mdma']
files = [f for f in os.listdir('.') if os.path.isfile(f) and os.path.splitext(f)[1] in extensions]

with open('file-list.json', 'w') as json_file:
    json.dump(files, json_file, indent=2)

print("✅ file-list.json updated.")
