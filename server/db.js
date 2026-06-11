const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({ users: [], otps: [] }, null, 2));
}

function readData() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database file:', error);
    return { users: [], otps: [] };
  }
}

function writeData(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing to database file:', error);
  }
}

// User Helpers
function findUserByEmail(email) {
  const db = readData();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function createUser(name, email, passwordHash) {
  const db = readData();
  const newUser = {
    id: '_' + Math.random().toString(36).substr(2, 9),
    name,
    email: email.toLowerCase(),
    passwordHash,
    verified: false,
    createdAt: new Date().toISOString()
  };
  db.users.push(newUser);
  writeData(db);
  return newUser;
}

function verifyUser(email) {
  const db = readData();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) {
    user.verified = true;
    writeData(db);
    return true;
  }
  return false;
}

// OTP Helpers
function saveOTP(email, code) {
  const db = readData();
  
  // Remove any existing OTP for this email
  db.otps = db.otps.filter(o => o.email.toLowerCase() !== email.toLowerCase());
  
  // Set OTP to expire in 10 minutes
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  
  db.otps.push({
    email: email.toLowerCase(),
    code,
    expiresAt
  });
  
  writeData(db);
}

function getOTP(email) {
  const db = readData();
  const otpRecord = db.otps.find(o => o.email.toLowerCase() === email.toLowerCase());
  
  if (!otpRecord) return null;
  
  // Check if expired
  if (new Date() > new Date(otpRecord.expiresAt)) {
    // Delete expired OTP
    deleteOTP(email);
    return null;
  }
  
  return otpRecord.code;
}

function deleteOTP(email) {
  const db = readData();
  db.otps = db.otps.filter(o => o.email.toLowerCase() !== email.toLowerCase());
  writeData(db);
}

module.exports = {
  findUserByEmail,
  createUser,
  verifyUser,
  saveOTP,
  getOTP,
  deleteOTP
};
