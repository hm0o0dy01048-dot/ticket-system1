const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { auth } = require('./middleware');

// Accept both 'admin' and 'sysadmin' roles
function isAdmin(req, res, next) {
  if (req.user.role === 'sysadmin' || req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'لا توجد صلاحية' });
}

router.get('/', auth, isAdmin, (req, res) => {
  const users = req.app.locals.db.allUsers().map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role }));
  res.json(users);
});

router.post('/', auth, isAdmin, (req, res) => {
  const { name, email, password, role: r } = req.body;
  if (!name || !email || !password || !r) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  if (!['support','advanced','dev'].includes(r)) return res.status(400).json({ error: 'دور غير صحيح' });
  const db = req.app.locals.db;
  if (db.userExists(email)) return res.status(409).json({ error: 'البريد مستخدم بالفعل' });
  const u = db.addUser(name, email, bcrypt.hashSync(password, 10), r);
  res.status(201).json({ id: u.id, name: u.name, email: u.email, role: u.role });
});

router.delete('/:id', auth, isAdmin, (req, res) => {
  const db = req.app.locals.db;
  const u = db.findUserById(req.params.id);
  if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (u.role === 'sysadmin' || u.role === 'admin') return res.status(403).json({ error: 'لا يمكن حذف المدير' });
  db.deleteUser(req.params.id);
  res.json({ ok: true });
});


// PATCH update user info (admin only)
router.patch('/:id', auth, isAdmin, (req, res) => {
  const db = req.app.locals.db;
  const { name, email, phone, role: r } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'الاسم والبريد مطلوبان' });
  if (!['support','advanced','dev'].includes(r)) return res.status(400).json({ error: 'دور غير صحيح' });
  const user = db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (user.role === 'sysadmin' || user.role === 'admin') return res.status(403).json({ error: 'لا يمكن تعديل المدير' });
  // Check email not taken by another user
  const existing = db.findUser(email);
  if (existing && existing.id !== parseInt(req.params.id)) return res.status(409).json({ error: 'البريد مستخدم بالفعل' });
  db.updateUserInfo(req.params.id, name, email, phone||'', r);
  res.json({ ok: true });
});

// PATCH reset password (admin only)
router.patch('/:id/reset-password', auth, isAdmin, (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  const db = req.app.locals.db;
  const user = db.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  db.updatePassword(req.params.id, bcrypt.hashSync(new_password, 10));
  res.json({ ok: true });
});

module.exports = router;
