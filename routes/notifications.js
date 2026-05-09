const router = require('express').Router();
const { auth } = require('./middleware');

router.get('/', auth, (req, res) => {
  res.json(req.app.locals.db.userNotifs(req.user.id));
});

router.patch('/read-all', auth, (req, res) => {
  req.app.locals.db.markRead(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
