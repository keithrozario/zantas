import sys
import asyncio
from bleak import BleakScanner, BleakClient
from pycycling.heart_rate_service import HeartRateService

async def main(target_address=None):
    if not target_address:
        print("Scanning for Heart Rate Monitors (advertising service 0000180d)...")
        devices = await BleakScanner.discover(timeout=5.0, return_adv=True)
        
        hrm_devices = []
        for address, (device, adv_data) in devices.items():
            uuids = [u.lower() for u in adv_data.service_uuids]
            if "0000180d-0000-1000-8000-00805f9b34fb" in uuids or "180d" in uuids:
                hrm_devices.append((device, adv_data))
        
        if not hrm_devices:
            print("No Heart Rate Monitors found. Please make sure your HRM is turned on and advertising.")
            return
        
        # Pick the first one
        device, adv_data = hrm_devices[0]
        target_address = device.address
        print(f"Found HRM: {device.name or adv_data.local_name} ({target_address})")

    print(f"Connecting to device: {target_address}...")
    
    def hr_measurement_handler(measurement):
        print(f"Telemetry -> Heart Rate: {measurement.bpm} bpm")

    async with BleakClient(target_address) as client:
        print("Connected!")
        hr_service = HeartRateService(client)
        hr_service.set_hr_measurement_handler(hr_measurement_handler)
        
        print("Enabling heart rate notifications...")
        await hr_service.enable_hr_measurement_notifications()
        
        print("Streaming heart rate data. Press Ctrl+C to stop.")
        while True:
            await asyncio.sleep(1)

if __name__ == "__main__":
    addr = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        asyncio.run(main(addr))
    except KeyboardInterrupt:
        print("\nDisconnected.")
