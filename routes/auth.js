require('dotenv').config();
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'ticket-2026-secret';

router.post('/login', (req, res) => {
  const db = req.app.locals.db;
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'أدخل البريد وكلمة المرور' });
  const user = db.findUser(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'البريد أو كلمة المرور غير صحيحة' });
  const token = jwt.sign({ id: user.id, name: user.name, role: user.role }, SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
