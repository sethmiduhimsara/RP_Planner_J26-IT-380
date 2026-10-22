require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const os = require('os');
const supabase = require('./config/supabaseClient');

// Team member unique routes
const motorVibrationRoutes = require('./routes/motor-vibration-routes/motorVibrationRoutes');
// Placeholders for teammates:
// const waterLossRoutes = require('./routes/waterLossRoutes');
// const energyOptimizerRoutes = require('./routes/energyOptimizerRoutes');
// const resourceOrchestratorRoutes = require('./routes/resourceOrchestratorRoutes');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with permissive CORS for local development
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach Socket.io instance to request object for route controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Mount Routes
app.use('/api/motor-vibration', motorVibrationRoutes);
// app.use('/api/water-loss', waterLossRoutes);
// app.use('/api/energy-optimizer', energyOptimizerRoutes);
// app.use('/api/resource-orchestrator', resourceOrchestratorRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: supabase ? 'Supabase Connected' : 'In-Memory (Awaiting Supabase Key)',
    system: 'AquaEdge AI Research Platform (J26-IT-380)',
    time: new Date().toISOString(),
  });
});

// Socket.io connection logging
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Helper to display local IPv4 addresses (for flashing into ESP32)
function getLocalIPAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ interface: name, ip: iface.address });
      }
    }
  }
  return addresses;
}

const PORT = process.env.PORT || 5000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`AquaEdge AI Central Backend running on port: ${PORT}`);
  console.log(`Database: Supabase (${process.env.SUPABASE_URL || 'Configured'})`);
  console.log(`Local Access: http://localhost:${PORT}`);
  console.log(`Network IPs (use for your ESP32 Arduino sketch):`);
  const ips = getLocalIPAddresses();
  if (ips.length > 0) {
    ips.forEach((item) => {
      console.log(`  -> http://${item.ip}:${PORT}/api/motor-vibration/telemetry (${item.interface})`);
    });
  } else {
    console.log(`  -> Connect PC to Wi-Fi to view local network IP.`);
  }
  console.log(`=======================================================`);
});
