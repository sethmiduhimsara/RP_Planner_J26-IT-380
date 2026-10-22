const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/rp_planner_db';
  try {
    const conn = await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 2000,
    });
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.warn(`[Database] MongoDB not available (${error.message}). Server running in in-memory mode.`);
  }
};

module.exports = connectDB;


