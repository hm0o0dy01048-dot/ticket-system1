const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { auth } = require('./middleware');

function isAdmin(req, res, next) {
  if (req.user.role === 'sysadmin' || req.user.role === 'admin') return next();
  return res.status(403).json({ error: 'لا توجد صلاحية' });
}

router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const users = await req.app.locals.db.allUsers();
    res.json(users);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, password, role: r } = req.body;
    if (!name || !email || !password || !r) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (!['support','advanced','dev'].includes(r)) return res.status(400).json({ error: 'دور غير صحيح' });
    const db = req.app.locals.db;
    if (await db.userExists(email)) return res.status(409).json({ error: 'البريد مستخدم بالفعل' });
    const u = await db.addUser(name, email, bcrypt.hashSync(password, 10), r);
    res.status(201).json(u);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { name, email, phone, role: r } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'الاسم والبريد مطلوبان' });
    if (!['support','advanced','dev'].includes(r)) return res.status(400).json({ error: 'دور غير صحيح' });
    const db = req.app.locals.db;
    const user = await db.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (['sysadmin','admin'].includes(user.role)) return res.status(403).json({ error: 'لا يمكن تعديل المدير' });
    await db.updateUserInfo(req.params.id, name, email, phone||'', r);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/:id/reset-password', auth, isAdmin, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    const db = req.app.locals.db;
    const user = await db.findUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    await db.updatePassword(req.params.id, bcrypt.hashSync(new_password, 10));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const u = await db.findUserById(req.params.id);
    if (!u) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (['sysadmin','admin'].includes(u.role)) return res.status(403).json({ error: 'لا يمكن حذف المدير' });
    await db.deleteUser(req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
