import sys
import asyncio
from bleak import BleakScanner, BleakClient
from pycycling.cycling_power_service import CyclingPowerService

async def main(target_address=None):
    if not target_address:
        print("Scanning for Cycling Power Meters (advertising service 00001818)...")
        devices = await BleakScanner.discover(timeout=5.0, return_adv=True)
        
        power_devices = []
        for address, (device, adv_data) in devices.items():
            uuids = [u.lower() for u in adv_data.service_uuids]
            if "00001818-0000-1000-8000-00805f9b34fb" in uuids or "1818" in uuids:
                power_devices.append((device, adv_data))
        
        if not power_devices:
            print("No Cycling Power Meters found. Make sure you spin the cranks to wake it up.")
            return
        
        # Pick the first one
        device, adv_data = power_devices[0]
        target_address = device.address
        print(f"Found Power Meter: {device.name or adv_data.local_name} ({target_address})")

    print(f"Connecting to device: {target_address}...")
    
    # Track crank revolutions to calculate cadence
    last_crank_revs = None
    last_crank_time = None
    
    def power_measurement_handler(measurement):
        nonlocal last_crank_revs, last_crank_time
        cadence_str = "N/A"
        
        # Calculate cadence if crank revolution data is present
        if measurement.cumulative_crank_revs is not None and measurement.last_crank_event_time is not None:
            if last_crank_revs is not None and last_crank_time is not None:
                revs_diff = (measurement.cumulative_crank_revs - last_crank_revs) & 0xFFFF
                time_diff = (measurement.last_crank_event_time - last_crank_time) & 0xFFFF
                
                if time_diff > 0 and revs_diff >= 0:
                    # last_crank_event_time is in 1/1024 seconds
                    time_secs = time_diff / 1024.0
                    cadence = (revs_diff / time_secs) * 60.0
                    if cadence < 200: # filter out spikes
                        cadence_str = f"{cadence:.1f} RPM"
            
            last_crank_revs = measurement.cumulative_crank_revs
            last_crank_time = measurement.last_crank_event_time
            
        print(f"Telemetry -> Power: {measurement.instantaneous_power} W | Cadence: {cadence_str}")

    async with BleakClient(target_address) as client:
        print("Connected!")
        power_service = CyclingPowerService(client)
        power_service.set_cycling_power_measurement_handler(power_measurement_handler)
        
        print("Enabling cycling power measurement notifications...")
        await power_service.enable_cycling_power_measurement_notifications()
        
        print("Streaming power data. Press Ctrl+C to stop.")
        while True:
            await asyncio.sleep(1)

if __name__ == "__main__":
    addr = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        asyncio.run(main(addr))
    except KeyboardInterrupt:
        print("\nDisconnected.")
