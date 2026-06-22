import asyncio
from bleak import BleakScanner

async def main():
    print("Scanning for Bluetooth Low Energy (BLE) devices...")
    print("Please make sure your HRM, Power Meter, and Kickr are active (spin pedals / wear HRM).")
    print("-" * 80)
    print(f"{'Name':<30} | {'Address/UUID':<38} | {'RSSI':<5}")
    print("-" * 80)

    devices = await BleakScanner.discover(timeout=10.0, return_adv=True)
    for address, (device, adv_data) in devices.items():
        name = device.name or adv_data.local_name or "Unknown"
        rssi = adv_data.rssi
        print(f"{name:<30} | {address:<38} | {rssi:<5}")
        
        # Display advertised services if available
        uuids = adv_data.service_uuids
        if uuids:
            print(f"  └─ Advertised Service UUIDs: {', '.join(uuids)}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nScan stopped.")
