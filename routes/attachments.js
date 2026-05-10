const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { auth } = require('./middleware');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.pdf','.doc','.docx','.xlsx','.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('نوع الملف غير مدعوم'));
  }
});

router.post('/:ticketId', auth, upload.single('file'), async (req, res) => {
  try {
    const id = parseInt(req.params.ticketId);
    if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صحيح' });
    if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
    const db = req.app.locals.db;
    const t = await db.getTicket(id);
    if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
    const att = await db.addAttachment(id, {
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      uploadedBy: req.user.name,
      uploadedAt: new Date().toISOString().slice(0,10)
    });
    res.json(att);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:ticketId', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.ticketId);
    if (isNaN(id)) return res.status(400).json({ error: 'معرف غير صحيح' });
    res.json(await req.app.locals.db.getAttachments(id));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:ticketId/:fileId', auth, async (req, res) => {
  try {
    const db = req.app.locals.db;
    const att = await db.deleteAttachment(req.params.ticketId, req.params.fileId);
    if (att?.filename) {
      const fp = path.join(__dirname, '../uploads', att.filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
