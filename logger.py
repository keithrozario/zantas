import os
import csv
import time
from datetime import datetime

class SessionLogger:
    def __init__(self, output_dir="sessions"):
        self.output_dir = output_dir
        self.file_path = None
        self.file_handle = None
        self.writer = None
        self.start_time = None

    def start_session(self):
        if self.file_handle:
            self.stop_session()

        os.makedirs(self.output_dir, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.file_path = os.path.join(self.output_dir, f"session_{timestamp}.csv")
        
        self.file_handle = open(self.file_path, mode="w", newline="")
        self.writer = csv.writer(self.file_handle)
        self.writer.writerow(["timestamp", "elapsed_seconds", "heart_rate", "hrv_rmssd"])
        self.file_handle.flush()
        
        self.start_time = time.time()
        print(f"Session recording started. Saving to {self.file_path}")

    def log_data(self, heart_rate, hrv_rmssd):
        if not self.file_handle or not self.writer:
            return
        
        elapsed = int(time.time() - self.start_time)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        self.writer.writerow([timestamp, elapsed, heart_rate, hrv_rmssd])
        self.file_handle.flush()

    def stop_session(self):
        if self.file_handle:
            self.file_handle.close()
            print(f"Session recording stopped. Saved: {self.file_path}")
            self.file_handle = None
            self.writer = None
            self.file_path = None
            self.start_time = None
