import time
import os
import subprocess
from pathlib import Path
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# 📍 Get the directory this script lives in
BASE_DIR = Path(__file__).resolve().parent

# ✅ Watch the folder this script is in
WATCHED_FOLDER = BASE_DIR
SCRIPT_TO_RUN = BASE_DIR / "generate_file_list.py"

class MDMAHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        if event.src_path.lower().endswith(".mdma"):
            print(f"📦 Detected new MDMA file: {event.src_path}")
            try:
                subprocess.run(["python", str(SCRIPT_TO_RUN)], check=True)
                print("✅ Script executed successfully.")
            except subprocess.CalledProcessError as e:
                print(f"❌ Error running script: {e}")

if __name__ == "__main__":
    print(f"👀 Watching folder: {WATCHED_FOLDER}")
    event_handler = MDMAHandler()
    observer = Observer()
    observer.schedule(event_handler, str(WATCHED_FOLDER), recursive=False)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        print("\n🛑 Stopped watching.")
    observer.join()
