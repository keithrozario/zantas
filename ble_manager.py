import asyncio
import math
import random
import time
from bleak import BleakClient, BleakScanner
from pycycling.heart_rate_service import HeartRateService

class BLEManager:
    def __init__(self, hrm_address=None, simulate=False):
        # Default to simulator mode on startup if no address specified
        self.hrm_address = hrm_address
        self.simulate = simulate or (hrm_address is None)
        
        # Telemetry State
        self.hrm_bpm = 0
        self.hrm_connected = False
        self.hrv_rmssd = 0.0
        self.rr_data_supported = True
        self._empty_rr_count = 0
        
        # RR-intervals history: list of (timestamp, interval_ms)
        self.rr_history = []
        
        # Power / Cadence state (for future steps)
        self.power_watts = 0
        self.cadence_rpm = 0
        self.trainer_connected = False
        
        self._running = False
        self._task = None
        self._lock = asyncio.Lock()

    def start(self):
        self._running = True
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        self.hrm_connected = False
        self.hrm_bpm = 0

    async def set_device(self, target):
        """Switch device or simulator mode dynamically."""
        async with self._lock:
            print(f"Setting active device to: {target}")
            await self.stop()
            
            # Reset history
            self.rr_history = []
            self.hrv_rmssd = 0.0
            self.rr_data_supported = True
            self._empty_rr_count = 0
            
            if target == "simulator":
                self.simulate = True
                self.hrm_address = None
            else:
                self.simulate = False
                self.hrm_address = target
                
            self.start()

    async def scan_hrms(self):
        """Scan for nearby BLE Heart Rate Monitors."""
        print("Starting 4-second BLE scan for HRMs...")
        try:
            devices = await BleakScanner.discover(timeout=4.0, return_adv=True)
            hrm_devices = []
            for address, (device, adv_data) in devices.items():
                uuids = [u.lower() for u in adv_data.service_uuids]
                # Match heart rate service UUID (180d) or names containing "heart" or "hrm"
                is_hrm = "0000180d-0000-1000-8000-00805f9b34fb" in uuids or "180d" in uuids
                name = device.name or adv_data.local_name
                if not is_hrm and name:
                    name_lower = name.lower()
                    if "heart" in name_lower or "hrm" in name_lower or "polar" in name_lower or "wahoo" in name_lower:
                        is_hrm = True
                
                if is_hrm:
                    hrm_devices.append({
                        "name": name or "Unknown HRM",
                        "address": address
                    })
            print(f"Scan complete. Found {len(hrm_devices)} HRMs.")
            return hrm_devices
        except Exception as e:
            print(f"Scan failed: {e}")
            return []

    async def _run_loop(self):
        if self.simulate:
            await self._run_simulator()
        else:
            await self._run_ble()

    def _add_rr_intervals(self, intervals_ms):
        """Adds new RR-intervals in milliseconds, prunes old ones (>60s), and calculates RMSSD."""
        now = time.time()
        for interval in intervals_ms:
            if 300 <= interval <= 2000:
                self.rr_history.append((now, interval))
        
        self.rr_history = [(t, val) for t, val in self.rr_history if now - t <= 60.0]
        
        if len(self.rr_history) >= 2:
            intervals = [val for _, val in self.rr_history]
            diffs = [intervals[i] - intervals[i-1] for i in range(1, len(intervals))]
            squared_diffs = [d**2 for d in diffs]
            mean_squared = sum(squared_diffs) / len(squared_diffs)
            self.hrv_rmssd = math.sqrt(mean_squared)
        else:
            self.hrv_rmssd = 0.0

    async def _run_simulator(self):
        print("Starting BLE Manager in SIMULATOR mode...")
        self.hrm_connected = True
        self.trainer_connected = True
        
        time_elapsed = 0
        while self._running:
            base_hr = 130
            oscillation = 20 * math.sin(time_elapsed / 60.0)
            noise = random.randint(-2, 2)
            self.hrm_bpm = int(base_hr + oscillation + noise)
            
            self.power_watts = int(180 + 30 * math.sin(time_elapsed / 30.0) + random.randint(-5, 5))
            self.cadence_rpm = int(90 + 5 * math.sin(time_elapsed / 45.0) + random.randint(-2, 2))
            
            beats_per_sec = self.hrm_bpm / 60.0
            avg_interval_ms = 60000.0 / self.hrm_bpm
            
            sim_intervals = []
            accumulated_time = 0
            while accumulated_time < 1000:
                var = random.gauss(0, 45)
                interval = avg_interval_ms + var
                sim_intervals.append(interval)
                accumulated_time += interval
                
            self._add_rr_intervals(sim_intervals)
            
            time_elapsed += 1
            await asyncio.sleep(1)

    async def _run_ble(self):
        if not self.hrm_address:
            print("No HRM address specified. BLE manager idling.")
            self.hrm_connected = False
            return
            
        print(f"Starting BLE Manager, targeting HRM address: {self.hrm_address}")
        
        def hr_handler(measurement):
            self.hrm_bpm = measurement.bpm
            if measurement.rr_interval:
                self._empty_rr_count = 0
                self.rr_data_supported = True
                intervals_ms = [raw * 1000.0 / 1024.0 for raw in measurement.rr_interval]
                self._add_rr_intervals(intervals_ms)
            else:
                if self.hrm_bpm > 0:
                    self._empty_rr_count += 1
                    # If 5 consecutive updates have no RR data, flag it
                    if self._empty_rr_count >= 5:
                        self.rr_data_supported = False

        while self._running:
            self.hrm_connected = False
            try:
                print(f"Connecting to HRM: {self.hrm_address}...")
                async with BleakClient(self.hrm_address) as client:
                    self.hrm_connected = True
                    print(f"Connected to HRM: {self.hrm_address}")
                    
                    hr_service = HeartRateService(client)
                    hr_service.set_hr_measurement_handler(hr_handler)
                    await hr_service.enable_hr_measurement_notifications()
                    
                    while self._running and client.is_connected:
                        await asyncio.sleep(1)
                        
                    print("HRM disconnected.")
            except Exception as e:
                print(f"HRM connection error: {e}. Retrying in 5 seconds...")
                await asyncio.sleep(5)
