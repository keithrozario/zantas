import argparse
import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from ble_manager import BLEManager
from logger import SessionLogger

# Setup command line arguments
parser = argparse.ArgumentParser(description="Zantas Cycling Trainer API Server")
parser.add_argument("--simulate", action="store_true", help="Run in simulator mode")
parser.add_argument("--hrm", type=str, help="Heart Rate Monitor BLE UUID/MAC address")
# We parse known args so it doesn't conflict with uvicorn's own args if run directly
args, unknown = parser.parse_known_args()

app = FastAPI(title="Zantas Cycling Trainer API")
ble_manager = BLEManager(hrm_address=args.hrm, simulate=args.simulate)
session_logger = SessionLogger()

@app.on_event("startup")
async def startup_event():
    ble_manager.start()

@app.on_event("shutdown")
async def shutdown_event():
    await ble_manager.stop()
    session_logger.stop_session()

@app.get("/")
async def get_index():
    # Return index.html from root folder
    return FileResponse("index.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket client connected.")
    
    # Task to receive commands from client
    async def receive_commands():
        try:
            while True:
                data = await websocket.receive_text()
                message = json.loads(data)
                command = message.get("command")
                if command == "start_session":
                    session_logger.start_session()
                elif command == "stop_session":
                    session_logger.stop_session()
                elif command == "scan_hrms":
                    # Run scan and reply
                    devices = await ble_manager.scan_hrms()
                    await websocket.send_text(json.dumps({
                        "type": "scan_results",
                        "devices": devices
                    }))
                elif command == "connect_hrm":
                    address = message.get("address")
                    await ble_manager.set_device(address)
        except WebSocketDisconnect:
            pass
        except Exception as e:
            print(f"Error in receive_commands: {e}")

    receive_task = asyncio.create_task(receive_commands())

    try:
        while True:
            # Broadcast telemetry state
            payload = {
                "hrm_bpm": ble_manager.hrm_bpm,
                "hrm_connected": ble_manager.hrm_connected,
                "hrv_rmssd": round(ble_manager.hrv_rmssd, 1),
                "rr_intervals": [round(val, 1) for _, val in ble_manager.rr_history],
                "power_watts": ble_manager.power_watts,
                "cadence_rpm": ble_manager.cadence_rpm,
                "trainer_connected": ble_manager.trainer_connected,
                "simulate": ble_manager.simulate
            }
            await websocket.send_text(json.dumps(payload))
            
            # Log data if session is active
            if session_logger.file_handle is not None and ble_manager.hrm_bpm > 0:
                session_logger.log_data(ble_manager.hrm_bpm, ble_manager.hrv_rmssd)
                
            await asyncio.sleep(1.0)
    except WebSocketDisconnect:
        print("WebSocket client disconnected.")
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        receive_task.cancel()
        session_logger.stop_session()

# Mount static files (like app.js, index.css) so they are served relative to root
# We mount everything except the script files to avoid publicizing source code.
# But for simplicity in a local app, mounting the root is perfectly fine.
# Note: we must do this after the root route (app.get("/")) so it doesn't shadow it.
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # If run directly, run on port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)
