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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg','.jpeg','.png','.pdf','.doc','.docx','.xlsx','.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('نوع الملف غير مدعوم'));
  }
});

router.post('/:ticketId', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'لم يتم رفع أي ملف' });
  const db = req.app.locals.db;
  const t = db.getTicket(req.params.ticketId);
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const att = db.addAttachment(req.params.ticketId, {
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    uploadedBy: req.user.name,
    uploadedAt: new Date().toISOString().slice(0,10)
  });
  res.json(att);
});

router.get('/:ticketId', auth, (req, res) => {
  const db = req.app.locals.db;
  res.json(db.getAttachments(req.params.ticketId));
});

router.delete('/:ticketId/:fileId', auth, (req, res) => {
  const db = req.app.locals.db;
  const att = db.deleteAttachment(req.params.ticketId, req.params.fileId);
  if (att && att.filename) {
    const fp = path.join(__dirname, '../uploads', att.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  res.json({ ok: true });
});

module.exports = router;
