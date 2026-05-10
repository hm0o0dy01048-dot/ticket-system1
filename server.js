require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security middleware ────────────────────────────────────
app.set('trust proxy', 1); // Required for rate limiting behind Render's proxy
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting for auth
const loginLimiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  message: { error: 'عدد محاولات تجاوز الحد المسموح. حاول بعد 15 دقيقة.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General rate limit
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 200,
  message: { error: 'طلبات كثيرة. حاول بعد قليل.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

initDB().then(db => {
  app.locals.db = db;
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/tickets', require('./routes/tickets'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/profile', require('./routes/profile'));
  app.use('/api/comments', require('./routes/comments'));
  app.use('/api/attachments', require('./routes/attachments'));

  // 404 handler for API
  app.use('/api/*', (req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

  // SPA fallback
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

  app.listen(PORT, () => {
    console.log(`✅ الخادم يعمل على: http://localhost:${PORT}`);
    console.log(`🔒 Rate limiting: ${process.env.MAX_LOGIN_ATTEMPTS||5} محاولات / ${process.env.RATE_LIMIT_WINDOW||15} دقيقة`);
  });
}).catch(err => console.error('❌ خطأ:', err));
