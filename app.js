// Zantas Dashboard Client Script

// State
let socket = null;
let maxHr = 190;
let zonePct = { z1: 60, z2: 70, z3: 80, z4: 90, z5: 100 };
let isSessionActive = false;
let sessionStartTime = 0;
let sessionInterval = null;
let sessionSeconds = 0;
let hrHistory = [];
let hrvHistory = [];

// Canvas setup
const canvas = document.getElementById('rri-canvas');
const ctx = canvas.getContext('2d');
let lastRrIntervals = [];

// Mouse tracking for interactive canvas tooltip
let mouseX = -1;
let canvasRect = null;

// DOM Elements
const connStatus = document.getElementById('conn-status');
const bleStatus = document.getElementById('ble-status');
const simIndicator = document.getElementById('sim-indicator');
const hrVal = document.getElementById('hr-val');
const hrCircleBar = document.getElementById('hr-circle-bar');
const hrZone = document.getElementById('hr-zone');
const heartIcon = document.getElementById('heart-icon');
const hrvVal = document.getElementById('hrv-val');
const hrvStatusDesc = document.getElementById('hrv-status-desc');
const hrvProgressBar = document.getElementById('hrv-progress-bar');
const beatsCount = document.getElementById('beats-count');
const timerVal = document.getElementById('timer-val');
const avgHrVal = document.getElementById('avg-hr-val');
const avgHrvVal = document.getElementById('avg-hrv-val');
const sessionBtn = document.getElementById('session-btn');

// Settings Elements
const hrmSelect = document.getElementById('hrm-select');
const scanBtn = document.getElementById('scan-btn');
const scanIcon = document.getElementById('scan-icon');
const maxHrInput = document.getElementById('max-hr-input');
const z1Limit = document.getElementById('z1-limit');
const z2Limit = document.getElementById('z2-limit');
const z3Limit = document.getElementById('z3-limit');
const z4Limit = document.getElementById('z4-limit');
const z5Limit = document.getElementById('z5-limit');

// Modal Elements
const settingsBtn = document.getElementById('settings-btn');
const profileBtn = document.getElementById('profile-btn');
const settingsModal = document.getElementById('settings-modal');
const profileModal = document.getElementById('profile-modal');
const closeSettings = document.getElementById('close-settings');
const closeProfile = document.getElementById('close-profile');

// Load settings from localStorage
function loadSettings() {
    const savedMaxHr = localStorage.getItem('maxHr');
    if (savedMaxHr) {
        maxHr = parseInt(savedMaxHr);
        maxHrInput.value = maxHr;
    }
    
    const savedZones = localStorage.getItem('zonePct');
    if (savedZones) {
        zonePct = JSON.parse(savedZones);
        z1Limit.value = zonePct.z1;
        z2Limit.value = zonePct.z2;
        z3Limit.value = zonePct.z3;
        z4Limit.value = zonePct.z4;
        z5Limit.value = zonePct.z5 || 100;
    }
}

// Save settings to localStorage
function saveSettings() {
    maxHr = parseInt(maxHrInput.value) || 190;
    zonePct = {
        z1: parseInt(z1Limit.value) || 60,
        z2: parseInt(z2Limit.value) || 70,
        z3: parseInt(z3Limit.value) || 80,
        z4: parseInt(z4Limit.value) || 90,
        z5: parseInt(z5Limit.value) || 100
    };
    
    localStorage.setItem('maxHr', maxHr);
    localStorage.setItem('zonePct', JSON.stringify(zonePct));
}

// Start WebSocket Connection
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    connStatus.className = 'badge disconnected';
    connStatus.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting Server';
    
    socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
        connStatus.className = 'badge connected';
        connStatus.innerHTML = '<i class="fa-solid fa-circle-check"></i> Server Online';
        console.log('Connected to Zantas Server');
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Check if message is scan results
        if (data.type === 'scan_results') {
            handleScanResults(data.devices);
            return;
        }
        
        // Otherwise, process telemetry packet
        updateDashboard(data);
    };
    
    socket.onclose = () => {
        connStatus.className = 'badge disconnected';
        connStatus.innerHTML = '<i class="fa-solid fa-circle-dot"></i> Server Offline';
        bleStatus.className = 'badge disconnected';
        bleStatus.innerHTML = '<i class="fa-solid fa-bluetooth"></i> HRM Offline';
        simIndicator.classList.add('hidden');
        
        console.log('Server connection closed. Reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
    };
    
    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

// Populate scan results in select dropdown
function handleScanResults(devices) {
    // Reset select except first option
    hrmSelect.innerHTML = '<option value="simulator">Simulated HRM (Built-in)</option>';
    
    devices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.address;
        option.textContent = `${device.name} (${device.address})`;
        hrmSelect.appendChild(option);
    });
    
    // Stop loading indicator
    scanIcon.classList.remove('fa-spin');
    scanBtn.disabled = false;
}

// Update dashboard with server metrics
function updateDashboard(data) {
    // 1. Update Connection Badges
    if (data.hrm_connected) {
        bleStatus.className = 'badge connected';
        bleStatus.innerHTML = '<i class="fa-solid fa-bluetooth"></i> HRM Connected';
    } else {
        bleStatus.className = 'badge disconnected';
        bleStatus.innerHTML = '<i class="fa-solid fa-bluetooth"></i> HRM Offline';
    }
    
    if (data.simulate) {
        simIndicator.classList.remove('hidden');
    } else {
        simIndicator.classList.add('hidden');
    }
    
    // 2. Update Heart Rate Display
    const bpm = data.hrm_bpm;
    if (bpm > 0) {
        hrVal.textContent = bpm;
        
        // Circular progress offset calculation (radius=45, circum=282.7)
        const circumference = 2 * Math.PI * 45;
        const progress = Math.min(bpm / maxHr, 1);
        const offset = circumference - (progress * circumference);
        hrCircleBar.style.strokeDashoffset = offset;
        
        // Dynamic heart beat animation speed based on current bpm
        const duration = 60 / bpm; // duration of 1 beat in seconds
        heartIcon.style.animation = `heart-pulse ${duration}s infinite alternate ease-in-out`;
        heartIcon.classList.add('pulse-animation');
        
        // HR Zones calculation based on user custom percentages
        const percentMax = (bpm / maxHr) * 100;
        let zoneText = '-';
        if (percentMax < zonePct.z1) {
            zoneText = 'Z1 (Recovery)';
            hrCircleBar.style.stroke = '#00d2ff'; // Cyan
        } else if (percentMax < zonePct.z2) {
            zoneText = 'Z2 (Endurance)';
            hrCircleBar.style.stroke = '#00e676'; // Green
        } else if (percentMax < zonePct.z3) {
            zoneText = 'Z3 (Tempo)';
            hrCircleBar.style.stroke = '#ffeb3b'; // Yellow
        } else if (percentMax < zonePct.z4) {
            zoneText = 'Z4 (Threshold)';
            hrCircleBar.style.stroke = '#ff9800'; // Orange
        } else if (percentMax < zonePct.z5) {
            zoneText = 'Z5 (Anaerobic)';
            hrCircleBar.style.stroke = '#ff3b69'; // Red
        } else {
            zoneText = 'Max Limit';
            hrCircleBar.style.stroke = '#ffffff'; // White/Glow
        }
        hrZone.textContent = zoneText;
        
        // Record for active session averages
        if (isSessionActive) {
            hrHistory.push(bpm);
            updateSessionStats();
        }
    } else {
        hrVal.textContent = '--';
        hrCircleBar.style.strokeDashoffset = 283;
        heartIcon.style.animation = 'none';
        heartIcon.classList.remove('pulse-animation');
        hrZone.textContent = '-';
    }
    
    // 3. Update HRV Display
    const hrv = data.hrv_rmssd;
    lastRrIntervals = data.rr_intervals || [];
    beatsCount.textContent = `${lastRrIntervals.length} beats in 60s window`;
    
    // Fill the 1-minute baseline progress bar
    const targetBeats = 50;
    const progressPercent = Math.min((lastRrIntervals.length / targetBeats) * 100, 100);
    hrvProgressBar.style.width = `${progressPercent}%`;
    
    if (data.rr_data_supported === false) {
        hrvVal.textContent = 'N/A';
        hrvStatusDesc.innerHTML = '<span class="warning-text"><i class="fa-solid fa-triangle-exclamation"></i> HRV Not Supported</span>';
        hrvProgressBar.style.width = '0%';
    } else if (lastRrIntervals.length < 5) {
        hrvVal.textContent = '--';
        hrvStatusDesc.textContent = 'Collecting initial beats...';
    } else if (lastRrIntervals.length < targetBeats) {
        hrvVal.textContent = Math.round(hrv);
        hrvStatusDesc.textContent = `Establishing baseline (${Math.round(progressPercent)}%)`;
    } else {
        hrvVal.textContent = Math.round(hrv);
        if (hrv < 30) {
            hrvStatusDesc.textContent = 'Low (High Stress / Fatigue)';
        } else if (hrv < 60) {
            hrvStatusDesc.textContent = 'Normal / Balanced';
        } else {
            hrvStatusDesc.textContent = 'Excellent (Well Recovered)';
        }
        
        if (isSessionActive) {
            hrvHistory.push(hrv);
            updateSessionStats();
        }
    }
    
    // Draw the timeline graph
    drawGraph();
}

// Draw the RR-Interval Timeline on the Canvas
function drawGraph() {
    if (!canvas || !ctx) return;
    
    const rect = canvas.getBoundingClientRect();
    canvasRect = rect;
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (lastRrIntervals.length === 0) {
        ctx.fillStyle = '#8e95b3';
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('No intervals recorded yet. Waiting for HRM...', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    // Grid Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridRows = 5;
    for (let i = 0; i <= gridRows; i++) {
        const y = (canvas.height / gridRows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Min and Max RRI values for dynamic scaling
    let minRri = Math.min(...lastRrIntervals);
    let maxRri = Math.max(...lastRrIntervals);
    
    if (maxRri === minRri) {
        maxRri += 100;
        minRri -= 100;
    } else {
        const spread = maxRri - minRri;
        minRri = Math.max(300, minRri - spread * 0.1);
        maxRri = Math.min(2000, maxRri + spread * 0.1);
    }
    
    const count = lastRrIntervals.length;
    const points = lastRrIntervals.map((val, idx) => {
        const x = (canvas.width / (count - 1)) * idx;
        const y = canvas.height - ((val - minRri) / (maxRri - minRri)) * canvas.height;
        return { x, y, val };
    });
    
    // Draw Gradient Fill Area
    ctx.beginPath();
    ctx.moveTo(points[0].x, canvas.height);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, canvas.height);
    ctx.closePath();
    
    const fillGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    fillGradient.addColorStop(0, 'rgba(0, 210, 255, 0.2)');
    fillGradient.addColorStop(1, 'rgba(0, 210, 255, 0.0)');
    ctx.fillStyle = fillGradient;
    ctx.fill();
    
    // Draw Trend Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.strokeStyle = '#00d2ff';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0, 210, 255, 0.5)';
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Render Points
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#f0f2fa';
        ctx.strokeStyle = '#00d2ff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    });
    
    // Draw Interactive Tooltip on mouse hover
    if (mouseX >= 0 && points.length > 0) {
        let closestPoint = points[0];
        let minDist = Math.abs(points[0].x - mouseX);
        points.forEach(p => {
            const dist = Math.abs(p.x - mouseX);
            if (dist < minDist) {
                minDist = dist;
                closestPoint = p;
            }
        });
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(closestPoint.x, 0);
        ctx.lineTo(closestPoint.x, canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.beginPath();
        ctx.arc(closestPoint.x, closestPoint.y, 7, 0, 2 * Math.PI);
        ctx.fillStyle = '#ff3b69';
        ctx.strokeStyle = '#f0f2fa';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        
        const text = `${Math.round(closestPoint.val)} ms`;
        ctx.font = 'bold 12px Outfit';
        ctx.fillStyle = '#0b0d19';
        
        const textWidth = ctx.measureText(text).width;
        const rectWidth = textWidth + 16;
        const rectHeight = 24;
        let rectX = closestPoint.x - rectWidth / 2;
        let rectY = closestPoint.y - 35;
        
        if (rectX < 4) rectX = 4;
        if (rectX + rectWidth > canvas.width - 4) rectX = canvas.width - rectWidth - 4;
        if (rectY < 4) rectY = closestPoint.y + 15;
        
        ctx.fillStyle = 'rgba(240, 242, 250, 0.95)';
        ctx.beginPath();
        ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 6);
        ctx.fill();
        
        ctx.fillStyle = '#0b0d19';
        ctx.textAlign = 'center';
        ctx.fillText(text, rectX + rectWidth / 2, rectY + 16);
    }
}

// Session Timer and recording logic
function toggleSession() {
    if (isSessionActive) {
        // Stop Session
        isSessionActive = false;
        clearInterval(sessionInterval);
        sessionBtn.className = 'btn btn-primary';
        sessionBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Session';
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ command: 'stop_session' }));
        }
    } else {
        // Start Session
        isSessionActive = true;
        sessionSeconds = 0;
        hrHistory = [];
        hrvHistory = [];
        sessionStartTime = Date.now();
        
        sessionInterval = setInterval(() => {
            sessionSeconds++;
            const hours = String(Math.floor(sessionSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((sessionSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(sessionSeconds % 60).padStart(2, '0');
            timerVal.textContent = `${hours}:${minutes}:${seconds}`;
        }, 1000);
        
        sessionBtn.className = 'btn btn-primary recording';
        sessionBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Session';
        
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ command: 'start_session' }));
        }
    }
}

function updateSessionStats() {
    if (hrHistory.length > 0) {
        const sumHr = hrHistory.reduce((a, b) => a + b, 0);
        avgHrVal.textContent = `${Math.round(sumHr / hrHistory.length)} bpm`;
    }
    
    if (hrvHistory.length > 0) {
        const sumHrv = hrvHistory.reduce((a, b) => a + b, 0);
        avgHrvVal.textContent = `${Math.round(sumHrv / hrvHistory.length)} ms`;
    }
}

// Scan for BLE HRMs
function triggerDeviceScan() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    scanIcon.classList.add('fa-spin');
    scanBtn.disabled = true;
    
    socket.send(JSON.stringify({ command: 'scan_hrms' }));
}

// Connect to selected device/simulator
function handleDeviceSelectionChange() {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    
    const value = hrmSelect.value;
    socket.send(JSON.stringify({
        command: 'connect_hrm',
        address: value
    }));
}

// Event Listeners
canvas.addEventListener('mousemove', (e) => {
    if (!canvasRect) return;
    mouseX = e.clientX - canvasRect.left;
    drawGraph();
});

canvas.addEventListener('mouseleave', () => {
    mouseX = -1;
    drawGraph();
});

sessionBtn.addEventListener('click', toggleSession);
scanBtn.addEventListener('click', triggerDeviceScan);
hrmSelect.addEventListener('change', handleDeviceSelectionChange);

// Settings Change Listeners
maxHrInput.addEventListener('change', () => {
    saveSettings();
    // Update max HR label in HR card
    document.querySelector('.hr-card .max-hr-val').textContent = `${maxHr} bpm`;
});
[z1Limit, z2Limit, z3Limit, z4Limit, z5Limit].forEach(input => {
    input.addEventListener('change', saveSettings);
});

// Modal Event Listeners
settingsBtn.addEventListener('click', () => settingsModal.style.display = 'flex');
profileBtn.addEventListener('click', () => profileModal.style.display = 'flex');
closeSettings.addEventListener('click', () => settingsModal.style.display = 'none');
closeProfile.addEventListener('click', () => profileModal.style.display = 'none');

window.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
    if (e.target === profileModal) {
        profileModal.style.display = 'none';
    }
});

// Adjust canvas layout on resize
window.addEventListener('resize', () => {
    drawGraph();
});

// Initialization
loadSettings();
connectWebSocket();
