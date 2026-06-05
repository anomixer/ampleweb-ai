import os
import requests
import plistlib
import argparse
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

class RomManagerCLI:
    def __init__(self, plist_path, roms_dir, threads=50, sources=None):
        self.plist_path = plist_path
        self.roms_dir = roms_dir
        self.threads = threads
        if sources:
            self.base_urls = [s.strip() for s in sources.split(',')]
            if not all(s.endswith('/') for s in self.base_urls):
                self.base_urls = [s if s.endswith('/') else s + '/' for s in self.base_urls]
        else:
            self.base_urls = [
                "https://mdk.cab/download/split/",
                "https://www.callapple.org/roms/"
            ]
        self.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        self.rom_list = self.load_rom_list()
        self.lock = threading.Lock()
        self.completed_count = 0

    def load_rom_list(self):
        if not os.path.exists(self.plist_path):
            print(f"Error: {self.plist_path} not found.")
            return []
        with open(self.plist_path, 'rb') as f:
            return plistlib.load(f)

    def download_rom(self, value):
        dest_path = os.path.join(self.roms_dir, f"{value}.zip")
        
        # Check if zip version already exists
        if os.path.exists(dest_path):
            return "Exists", value

        for base_url in self.base_urls:
            url = f"{base_url}{value}.zip"
            try:
                response = requests.get(url, headers=self.headers, timeout=20)
                if response.status_code == 200:
                    os.makedirs(self.roms_dir, exist_ok=True)
                    with open(dest_path, 'wb') as f:
                        f.write(response.content)
                    return f"OK (zip from {base_url.split('/')[2]})", value
            except Exception:
                continue
        
        return "Failed", value

    def run(self):
        total = len(self.rom_list)
        print(f"AmpleWeb Multi-threaded ROM Downloader")
        print(f"Source: {self.plist_path}")
        print(f"Destination: {self.roms_dir}")
        print(f"Threads: {self.threads}")
        print(f"Total entries: {total}")
        print("----------------------------------")
        
        new_downloads = 0
        
        with ThreadPoolExecutor(max_workers=self.threads) as executor:
            future_to_rom = {executor.submit(self.download_rom, rom['value']): rom['value'] for rom in self.rom_list}
            
            for future in as_completed(future_to_rom):
                status, value = future.result()
                with self.lock:
                    self.completed_count += 1
                    if "OK" in status:
                        new_downloads += 1
                        print(f"[{self.completed_count}/{total}] {value}: {status}")
                    elif status == "Failed":
                        print(f"[{self.completed_count}/{total}] {value}: {status}")
        
        print("----------------------------------")
        print(f"Done. Downloaded {new_downloads} new ROMs.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ample ROM Downloader CLI (Multi-threaded)")
    parser.add_argument("--plist", required=True, help="Path to roms.plist")
    parser.add_argument("--dest", required=True, help="Destination directory for ROMs")
    parser.add_argument("--threads", type=int, default=50, help="Number of download threads (default: 50)")
    parser.add_argument("--sources", help="Comma-separated list of base URLs for ROMs")
    
    args = parser.parse_args()
    
    manager = RomManagerCLI(args.plist, args.dest, args.threads, args.sources)
    manager.run()
