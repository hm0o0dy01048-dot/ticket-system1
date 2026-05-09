const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { auth } = require('./middleware');

// GET profile
router.get('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  res.json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone||'' });
});

// PATCH update profile
router.patch('/', auth, (req, res) => {
  const db = req.app.locals.db;
  const { name, phone } = req.body;
  if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
  db.updateProfile(req.user.id, name, phone||'');
  res.json({ ok: true });
});

// PATCH change password
router.patch('/password', auth, (req, res) => {
  const db = req.app.locals.db;
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  if (new_password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
  const user = db.findUserById(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password))
    return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  db.updatePassword(req.user.id, bcrypt.hashSync(new_password, 10));
  res.json({ ok: true });
});

module.exports = router;
