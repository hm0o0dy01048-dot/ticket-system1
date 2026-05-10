const router = require('express').Router();
const { auth } = require('./middleware');

router.get('/', auth, async (req, res) => {
  try {
    res.json(await req.app.locals.db.userNotifs(req.user.id));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.patch('/read-all', auth, async (req, res) => {
  try {
    await req.app.locals.db.markRead(req.user.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
