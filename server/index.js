require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { google } = require('googleapis');

// Setup multer for temporary local storage before uploading to Drive
const upload = multer({ storage: multer.memoryStorage() });

// Google Drive configuration
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
let driveClient = null;

try {
  let authClient;

  // Priority 1: Use GOOGLE_SERVICE_ACCOUNT_JSON environment variable (for Railway/cloud deployments)
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    authClient = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: SCOPES,
    });
    console.log('[Google Drive] Initialized Drive client from GOOGLE_SERVICE_ACCOUNT_JSON env variable.');
  } else {
    // Priority 2: Fall back to credentials.json file (for local development)
    const credentialsPath = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credentialsPath)) {
      authClient = new google.auth.GoogleAuth({
        keyFile: credentialsPath,
        scopes: SCOPES,
      });
      console.log('[Google Drive] Initialized Drive client from credentials.json file.');
    } else {
      console.warn('[Google Drive] No credentials found. Set GOOGLE_SERVICE_ACCOUNT_JSON env var or add credentials.json. Drive uploads will fail.');
    }
  }

  if (authClient) {
    driveClient = google.drive({ version: 'v3', auth: authClient });
    console.log('[Google Drive] Drive API client ready.');
  }
} catch (err) {
  console.error('[Google Drive ERROR] Failed to initialize Drive client:', err.message);
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_12345';

// Enable CORS for mobile device requests
app.use(cors());
app.use(express.json());

let transporter;

// Initialize the Nodemailer Transporter
async function initTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && port && user && pass) {
    console.log(`[SMTP] Using custom SMTP server: ${host}:${port}`);
    transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: parseInt(port) === 465,
      auth: { user, pass }
    });
  } else {
    console.log('[SMTP] No SMTP credentials in .env. Creating test account via Ethereal Email...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log('--------------------------------------------------');
      console.log('🚀 Ethereal Test SMTP Account Generated:');
      console.log(`- Username: ${testAccount.user}`);
      console.log(`- Password: ${testAccount.pass}`);
      console.log('--------------------------------------------------');
      
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.error('[SMTP ERROR] Failed to create Ethereal test account:', err.message);
      console.log('[SMTP] Fallback active: Emails will only be printed to the server terminal.');
    }
  }
}

// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOTPEmail(email, otp) {
  const from = process.env.SMTP_FROM || 'Widense Auth <noreply@widense.com>';
  const mailOptions = {
    from,
    to: email,
    subject: `Widense Verification Code: ${otp}`,
    text: `Hello,\n\nThank you for choosing Widense. Your one-time verification code is:\n\n${otp}\n\nThis code will expire in 10 minutes.\n\nBest regards,\nWidense Team`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 30px; max-width: 500px; margin: auto; border: 1px solid #FFEAEA; border-radius: 20px; background-color: #FFF;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #F35A5A; margin: 0; font-size: 26px; font-weight: bold;">Widense<span style="color: #1E1E4F;">.</span></h2>
        </div>
        <div style="border-top: 2px solid #FFEAEA; padding-top: 20px;">
          <p style="font-size: 16px; color: #333; line-height: 1.5;">Hello,</p>
          <p style="font-size: 16px; color: #555; line-height: 1.5;">Thank you for registering with <strong>Widense</strong>. To complete your account sign-up and verify your email, please use the following One-Time Passcode (OTP):</p>
          
          <div style="background-color: #FFEAEA; padding: 20px; border-radius: 16px; text-align: center; margin: 25px 0; border: 1px dashed #FE7F7F;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #F35A5A; font-family: Courier, monospace;">${otp}</span>
          </div>
          
          <p style="font-size: 14px; color: #888; text-align: center; margin-bottom: 20px;">This OTP is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
        </div>
        <div style="border-top: 1px solid #F0F0F0; padding-top: 20px; text-align: center; font-size: 12px; color: #AAA;">
          <p>If you did not request this email, please ignore it.</p>
          <p>© 2026 Widense App. All rights reserved.</p>
        </div>
      </div>
    `
  };

  console.log('\n==================================================');
  console.log(`📧 SENDING OTP EMAIL TO: ${email}`);
  console.log(`🔑 OTP CODE: ${otp}`);
  console.log('==================================================\n');

  if (transporter) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[SMTP] Email successfully sent. Message ID: ${info.messageId}`);
      
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) {
        console.log(`🔗 Ethereal Email Preview Link: ${previewUrl}`);
      }
    } catch (err) {
      console.error('[SMTP ERROR] Failed to deliver email via transporter:', err.message);
    }
  } else {
    console.log('[SMTP WARNING] No transporter active. Copied OTP above to use.');
  }
}

// ROUTE: Sign Up / Register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Please provide name, email, and password.' });
  }

  try {
    const existingUser = db.findUserByEmail(email);

    if (existingUser) {
      if (existingUser.verified) {
        return res.status(400).json({ error: 'A user with this email address already exists.' });
      }
      // If user exists but is unverified, we can update their password and name and send a new OTP
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);
      existingUser.name = name;
      existingUser.passwordHash = passwordHash;
      
      const otp = generateOTP();
      db.saveOTP(email, otp);
      await sendOTPEmail(email, otp);

      return res.json({
        success: true,
        message: 'Email already registered but unverified. A new verification OTP has been sent.',
        email
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user (verified: false)
    db.createUser(name, email, passwordHash);

    // Generate and send OTP
    const otp = generateOTP();
    db.saveOTP(email, otp);
    await sendOTPEmail(email, otp);

    return res.json({
      success: true,
      message: 'Registration successful! Verification OTP sent to your email.',
      email
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// ROUTE: Verify OTP
app.post('/api/auth/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Please provide email and verification OTP.' });
  }

  try {
    const storedOtp = db.getOTP(email);

    if (!storedOtp) {
      return res.status(400).json({ error: 'Verification code expired or not found. Please request a new one.' });
    }

    if (storedOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect verification code. Please check and try again.' });
    }

    // Mark user as verified
    const userVerified = db.verifyUser(email);
    if (!userVerified) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    // Delete used OTP
    db.deleteOTP(email);

    const user = db.findUserByEmail(email);

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' } // Session lasts 7 days
    );

    return res.json({
      success: true,
      message: 'Email verification successful!',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('OTP Verification error:', error);
    return res.status(500).json({ error: 'Internal server error during verification.' });
  }
});

// ROUTE: Resend OTP
app.post('/api/auth/resend-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Please provide an email address.' });
  }

  try {
    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No user account found with this email.' });
    }

    const otp = generateOTP();
    db.saveOTP(email, otp);
    await sendOTPEmail(email, otp);

    return res.json({
      success: true,
      message: 'A new verification OTP has been sent to your email.'
    });

  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ error: 'Internal server error while resending verification code.' });
  }
});

// ROUTE: Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Please provide email and password.' });
  }

  try {
    const user = db.findUserByEmail(email);

    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Check if verified
    if (!user.verified) {
      // Send OTP
      const otp = generateOTP();
      db.saveOTP(email, otp);
      await sendOTPEmail(email, otp);

      return res.json({
        success: true,
        requiresVerification: true,
        message: 'Your email is not verified yet. A verification OTP has been sent.',
        email
      });
    }

    // Generate JWT
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// ROUTE: Forgot Password (Send Reset OTP)
app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Please provide email.' });
  }

  try {
    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'No user account found with this email.' });
    }

    const otp = generateOTP();
    db.saveOTP(email, otp);
    await sendOTPEmail(email, otp);

    return res.json({
      success: true,
      message: 'Password reset OTP has been sent to your email.'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error processing forgot password request.' });
  }
});

// ROUTE: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Please fill in all fields (email, OTP, new password).' });
  }

  try {
    const storedOtp = db.getOTP(email);
    if (!storedOtp || storedOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Invalid or expired OTP code.' });
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Reset password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);
    user.passwordHash = passwordHash;
    user.verified = true; // Mark verified as well

    // Delete OTP
    db.deleteOTP(email);

    // Save changes (done inside db.js structure as read/write)
    const fs = require('fs');
    const path = require('path');
    const DB_PATH = path.join(__dirname, 'database.json');
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const userInDb = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (userInDb) {
      userInDb.passwordHash = passwordHash;
      userInDb.verified = true;
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    }

    return res.json({
      success: true,
      message: 'Your password has been successfully reset! You can now log in.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error resetting password.' });
  }
});

// ROUTE: Get Profile (Token Verification)
app.get('/api/auth/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization token required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.findUserByEmail(decoded.email);

    if (!user) {
      return res.status(404).json({ error: 'User session no longer exists.' });
    }

    return res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });

  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired authorization token.' });
  }
});

// ROUTE: Upload Media to Google Drive
app.post('/api/upload-media', upload.single('file'), async (req, res) => {
  console.log('[Backend] Received request on /api/upload-media');
  if (!req.file) {
    console.error('[Backend] No file provided in the request');
    return res.status(400).json({ error: 'No file provided.' });
  }

  if (!driveClient) {
    return res.status(500).json({ error: 'Google Drive client is not initialized on the server.' });
  }

  const { Readable } = require('stream');

  try {
    // Use the original filename if provided, otherwise generate one with timestamp
    const uploadedName = req.file.originalname && req.file.originalname !== 'blob'
      ? req.file.originalname
      : `upload_${Date.now()}.${req.file.mimetype.split('/')[1] || 'jpg'}`;

    const fileMetadata = {
      name: uploadedName,
      // Upload to the specific "Widense App Uploads" folder
      parents: ['1abp-uYpAxoKud0O8tYU9ZiZzyu1NRl8k']
    };

    // Use in-memory buffer stream (memoryStorage) instead of disk temp files
    const bufferStream = new Readable();
    bufferStream.push(req.file.buffer);
    bufferStream.push(null);

    const media = {
      mimeType: req.file.mimetype || 'image/jpeg',
      body: bufferStream,
    };

    // 1. Upload the file to Google Drive
    const driveRes = await driveClient.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, webViewLink, webContentLink',
    });

    const fileId = driveRes.data.id;

    // 2. Make the file accessible to "Anyone with the link"
    await driveClient.permissions.create({
      fileId: fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    // Provide the direct export link for embedding
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;

    return res.json({
      success: true,
      fileId: fileId,
      webViewLink: driveRes.data.webViewLink,
      webContentLink: driveRes.data.webContentLink,
      directUrl: directUrl
    });

  } catch (error) {
    console.error('Google Drive upload error:', error);
    return res.status(500).json({ error: 'Failed to upload file to Google Drive.' });
  }
});

// Start Server and Init Transporter
app.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n==================================================`);
  console.log(`🔒 Widense Auth Server running on http://localhost:${PORT}`);
  console.log(`⚡ Testing on mobile devices? Make sure to connect to http://YOUR_COMPUTER_IP:${PORT}`);
  console.log(`==================================================\n`);
  
  await initTransporter();
});
