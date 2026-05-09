require('dotenv').config();
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'ticket-2026-secret';

function auth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'غير مصرح' });
  try { req.user = jwt.verify(h.split(' ')[1], SECRET); next(); }
  catch { res.status(401).json({ error: 'انتهت الجلسة' }); }
}

function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'لا توجد صلاحية' });
    next();
  };
}

module.exports = { auth, role, SECRET };
