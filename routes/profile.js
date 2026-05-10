require('dotenv').config();
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { auth } = require('./middleware');

router.get('/', auth, async (req, res) => {
  try {
    const user = await req.app.locals.db.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone||'' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name) return res.status(400).json({ error: 'الاسم مطلوب' });
    await req.app.locals.db.updateProfile(req.user.id, name, phone||'');
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/password', auth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
    if (new_password.length < 6) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    const db = req.app.locals.db;
    const user = await db.findUserById(req.user.id);
    if (!bcrypt.compareSync(current_password, user.password))
      return res.status(400).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    await db.updatePassword(req.user.id, bcrypt.hashSync(new_password, 10));
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
