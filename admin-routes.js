const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const fssync = require('fs');

// JWT secret from environment or default (CHANGE IN PRODUCTION!)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Admin credentials (in production, use a database)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || bcrypt.hashSync('admin123', 10);

// Determine media root (persistent disk on Render mounted at /data)
const MEDIA_ROOT = process.env.MEDIA_ROOT || (fssync.existsSync('/data') ? '/data' : __dirname);

// Ensure media directories exist
['audio', path.join('audio', 'stems'), 'uploads'].forEach(dir => {
  try { fssync.mkdirSync(path.join(MEDIA_ROOT, dir), { recursive: true }); } catch {}
});

// File upload configuration (supports mp3, wav, stems, cover)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let baseDir = 'uploads';
    if (file.fieldname === 'mp3' || file.fieldname === 'wav') baseDir = 'audio';
    if (file.fieldname === 'stems') baseDir = path.join('audio', 'stems');
    if (file.fieldname === 'cover') baseDir = 'uploads';
    cb(null, path.join(MEDIA_ROOT, baseDir));
  },
  filename: (req, file, cb) => {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + safeOriginal);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const BEATS_FILE = path.join(DATA_DIR, 'beats.json');
const LICENSE_TEMPLATES_FILE = path.join(DATA_DIR, 'license_templates.json');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const EMAIL_TEMPLATES_FILE = path.join(DATA_DIR, 'email_templates.json');

// Ensure data directory and files exist
async function initDataFiles() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    
    // Initialize beats file (migrating to mp3Url/wavUrl/stemUrls schema)
    try {
      await fs.access(BEATS_FILE);
    } catch {
      await fs.writeFile(BEATS_FILE, JSON.stringify([
        { id: 'trap_wave_001', title: 'Trap Wave 001', bpm: 140, key: 'F Minor', mood: 'Dark & Hypnotic', mp3Url: '/audio/trap_wave_001.mp3', wavUrl: '', stemUrls: [], audioUrl: '/audio/trap_wave_001.mp3', sales: 45, status: 'active', tags: ['trap', 'dark', '808s'], createdAt: new Date().toISOString() },
        { id: 'rnb_vibes_002', title: 'R&B Vibes 002', bpm: 96, key: 'C# Minor', mood: 'Smooth & Melodic', mp3Url: '/audio/rnb_vibes_002.mp3', wavUrl: '', stemUrls: [], audioUrl: '/audio/rnb_vibes_002.mp3', sales: 38, status: 'active', tags: ['rnb', 'melodic', 'smooth'], createdAt: new Date().toISOString() },
        { id: 'club_banger_003', title: 'Club Banger 003', bpm: 150, key: 'G Minor', mood: 'Energetic & Heavy', mp3Url: '/audio/club_banger_003.mp3', wavUrl: '', stemUrls: [], audioUrl: '/audio/club_banger_003.mp3', sales: 32, status: 'active', tags: ['club', 'energetic', 'bass'], createdAt: new Date().toISOString() }
      ], null, 2));
    }

    // Initialize license contract templates (editable bodies)
    try { await fs.access(LICENSE_TEMPLATES_FILE); } catch {
      await fs.writeFile(LICENSE_TEMPLATES_FILE, JSON.stringify([
        { id: 'basic', name: 'Basic Lease', body: 'Basic Lease Agreement\nYou are granted non-exclusive rights to use the beat in one (1) music video and up to 50,000 streams.', updatedAt: new Date().toISOString() },
        { id: 'premium', name: 'Premium Lease', body: 'Premium Lease Agreement\nIncludes MP3 + WAV. Up to 250,000 streams and two (2) music videos.', updatedAt: new Date().toISOString() },
        { id: 'unlimited', name: 'Unlimited Lease', body: 'Unlimited Lease Agreement\nUnlimited streams, unlimited videos, includes stems.', updatedAt: new Date().toISOString() },
        { id: 'exclusive', name: 'Exclusive Rights', body: 'Exclusive Rights Agreement\nFull ownership transfer after purchase. Beat removed from store.', updatedAt: new Date().toISOString() }
      ], null, 2));
    }
    
    // Initialize licenses file
    try {
      await fs.access(LICENSES_FILE);
    } catch {
      await fs.writeFile(LICENSES_FILE, JSON.stringify([
        { id: 'basic', name: 'Basic Lease', price: 29.99, features: ['MP3 only', '50k streams', '1 music video'], filesIncluded: ['mp3'], streamLimit: 50000, usageTerms: 'Non-exclusive lease with standard distribution rights.' },
        { id: 'premium', name: 'Premium Lease', price: 59.99, features: ['MP3 + WAV', '250k streams', '2 music videos'], filesIncluded: ['mp3', 'wav'], streamLimit: 250000, usageTerms: 'Non-exclusive lease with extended distribution rights.' },
        { id: 'unlimited', name: 'Unlimited Lease', price: 129.99, features: ['MP3 + WAV + Stems', 'Unlimited streams', 'Unlimited videos'], filesIncluded: ['mp3', 'wav', 'stems'], streamLimit: -1, usageTerms: 'Non-exclusive lease with unlimited distribution rights.' },
        { id: 'exclusive', name: 'Exclusive Rights', price: 499.99, features: ['All files', 'Full ownership', 'Beat removed from store'], filesIncluded: ['mp3', 'wav', 'stems'], streamLimit: -1, usageTerms: 'Exclusive ownership. Beat will be removed from store after purchase.' }
      ], null, 2));
    }
    
    // Initialize coupons file
    try {
      await fs.access(COUPONS_FILE);
    } catch {
      await fs.writeFile(COUPONS_FILE, JSON.stringify([
        { id: 'SUMMER25', code: 'SUMMER25', type: 'percentage', value: 25, uses: 12, limit: 100, expiresAt: '2025-12-31', active: true, createdAt: new Date().toISOString() },
        { id: 'FIRSTBUY', code: 'FIRSTBUY', type: 'fixed', value: 10, uses: 45, limit: 500, expiresAt: '2025-12-31', active: true, createdAt: new Date().toISOString() }
      ], null, 2));
    }
    
    // Initialize sales file
    try {
      await fs.access(SALES_FILE);
    } catch {
      await fs.writeFile(SALES_FILE, JSON.stringify([
        { id: 'tx_1a2b3c', date: '2025-11-27T14:23:00Z', beatId: 'trap_wave_001', beatTitle: 'Trap Wave 001', licenseId: 'premium', licenseName: 'Premium', customer: 'john@example.com', amount: 59.99, status: 'completed' },
        { id: 'tx_4d5e6f', date: '2025-11-27T11:15:00Z', beatId: 'rnb_vibes_002', beatTitle: 'R&B Vibes 002', licenseId: 'basic', licenseName: 'Basic', customer: 'sarah@example.com', amount: 29.99, status: 'completed' },
        { id: 'tx_7g8h9i', date: '2025-11-26T19:42:00Z', beatId: 'club_banger_003', beatTitle: 'Club Banger 003', licenseId: 'unlimited', licenseName: 'Unlimited', customer: 'mike@example.com', amount: 129.99, status: 'completed' },
        { id: 'tx_0j1k2l', date: '2025-11-26T16:08:00Z', beatId: 'trap_wave_001', beatTitle: 'Trap Wave 001', licenseId: 'exclusive', licenseName: 'Exclusive', customer: 'artist@example.com', amount: 499.99, status: 'completed' }
      ], null, 2));
    }

    // Initialize settings file
    try {
      await fs.access(SETTINGS_FILE);
    } catch {
      await fs.writeFile(SETTINGS_FILE, JSON.stringify({
        payment: { stripeSecretKey: '', webhookSecret: '' },
        email: { host: '', user: '', password: '', port: 587, secure: false },
        store: { name: 'Beats By M.A.J.', url: '' },
        storage: { provider: 'Local Server', bucket: '' }
      }, null, 2));
    }

    // Initialize email templates
    try {
      await fs.access(EMAIL_TEMPLATES_FILE);
    } catch {
      await fs.writeFile(EMAIL_TEMPLATES_FILE, JSON.stringify({
        welcome: { key: 'welcome', name: 'Welcome Email', active: true, subject: 'Welcome to Beats By M.A.J.!', body: 'Thanks for your first purchase.' },
        purchase: { key: 'purchase', name: 'Purchase Confirmation', active: true, subject: 'Your Purchase Confirmation', body: 'Here are your downloads.' },
        new_beat: { key: 'new_beat', name: 'New Beat Alert', active: false, subject: 'New Beats Just Dropped', body: 'Check out the latest drops.' },
        abandoned: { key: 'abandoned', name: 'Abandoned Cart', active: false, subject: 'You left something behind', body: 'Complete your purchase.' }
      }, null, 2));
    }
  } catch (err) {
    console.error('Error initializing data files:', err);
  }
}

// Helper functions to read/write data
async function readData(filePath) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function writeData(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// ========== AUTH ROUTES ==========

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  if (username !== ADMIN_USERNAME) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
  
  res.json({ 
    success: true, 
    token,
    user: { username }
  });
});

// Verify token
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

// ========== ANALYTICS ROUTES ==========

router.get('/analytics', authenticateToken, async (req, res) => {
  try {
    const sales = await readData(SALES_FILE);
    const beats = await readData(BEATS_FILE);
    
    const totalRevenue = sales.reduce((sum, sale) => sum + sale.amount, 0);
    const totalSales = sales.length;
    const activeBeats = beats.filter(b => b.status === 'active').length;
    
    // Calculate revenue by day (last 7 days)
    const revenueByDay = {};
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    days.forEach(day => revenueByDay[day] = 0);
    
    sales.forEach(sale => {
      const date = new Date(sale.date);
      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      revenueByDay[dayName] = (revenueByDay[dayName] || 0) + sale.amount;
    });

    // Top selling beats
    const beatSales = {};
    sales.forEach(sale => {
      beatSales[sale.beatTitle] = (beatSales[sale.beatTitle] || 0) + 1;
    });
    
    const topBeats = Object.entries(beatSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([title, count]) => ({ title, sales: count }));

    res.json({
      totalRevenue,
      totalSales,
      activeBeats,
      newCustomers: Math.floor(totalSales * 0.6), // Estimate
      revenueByDay: days.map(day => revenueByDay[day] || 0),
      topBeats
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ========== BEAT ROUTES ==========

router.get('/beats', authenticateToken, async (req, res) => {
  try {
    let beats = await readData(BEATS_FILE);
    // Backward compatibility: if legacy audioUrl exists without mp3Url/wavUrl, map it
    beats = beats.map(b => {
      if (!b.mp3Url && !b.wavUrl && b.audioUrl) {
        if (b.audioUrl.endsWith('.mp3')) b.mp3Url = b.audioUrl;
        else if (b.audioUrl.endsWith('.wav')) b.wavUrl = b.audioUrl;
      }
      // Ensure audioUrl always points to preview (prefer mp3)
      b.audioUrl = b.mp3Url || b.wavUrl || b.audioUrl || '';
      b.stemUrls = b.stemUrls || [];
      return b;
    });
    res.json(beats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch beats' });
  }
});

router.post('/beats', authenticateToken, upload.fields([
  { name: 'mp3', maxCount: 1 },
  { name: 'wav', maxCount: 1 },
  { name: 'stems', maxCount: 30 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    console.log('Beat upload request received');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    
    const { title, bpm, key, mood, tags } = req.body;
    
    if (!title || !bpm) {
      return res.status(400).json({ error: 'Title and BPM are required' });
    }

    const mp3File = req.files.mp3 && req.files.mp3[0];
    const wavFile = req.files.wav && req.files.wav[0];
    const stemFiles = (req.files.stems || []);

    if (!mp3File && !wavFile) {
      return res.status(400).json({ error: 'At least a main MP3 or WAV file is required' });
    }

    // Validate types
    const invalidMp3 = mp3File && !/\.mp3$/i.test(mp3File.originalname);
    const invalidWav = wavFile && !/\.wav$/i.test(wavFile.originalname);
    const invalidStem = stemFiles.find(f => !/\.wav$/i.test(f.originalname));
    if (invalidMp3) return res.status(400).json({ error: 'Main MP3 must have .mp3 extension' });
    if (invalidWav) return res.status(400).json({ error: 'Main WAV must have .wav extension' });
    if (invalidStem) return res.status(400).json({ error: 'All stem files must be .wav' });
    
    const beats = await readData(BEATS_FILE);
    
    const id = title.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') + '_' + Date.now();
    const mp3Url = mp3File ? `/audio/${mp3File.filename}` : '';
    const wavUrl = wavFile ? `/audio/${wavFile.filename}` : '';
    const stemUrls = stemFiles.map(f => `/audio/stems/${f.filename}`);
    const coverUrl = req.files.cover && req.files.cover[0] ? `/uploads/${req.files.cover[0].filename}` : '';
    
    const newBeat = {
      id,
      title,
      bpm: parseInt(bpm),
      key: key || '',
      mood: mood || '',
      mp3Url,
      wavUrl,
      stemUrls,
      audioUrl: mp3Url || wavUrl, // preview source
      coverUrl,
      sales: 0,
      status: 'active',
      tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      createdAt: new Date().toISOString()
    };
    
    console.log('Creating new beat:', newBeat);
    
    beats.push(newBeat);
    await writeData(BEATS_FILE, beats);
    
    console.log('Beat saved successfully');
    res.json({ success: true, beat: newBeat });
  } catch (err) {
    console.error('Beat upload error:', err);
    res.status(500).json({ error: 'Failed to create beat', details: err.message });
  }
});

router.put('/beats/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const beats = await readData(BEATS_FILE);
    
    const index = beats.findIndex(b => b.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Beat not found' });
    }
    
    beats[index] = { ...beats[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(BEATS_FILE, beats);
    
    res.json({ success: true, beat: beats[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update beat' });
  }
});

// Replace audio/cover files for existing beat
router.put('/beats/:id/files', authenticateToken, upload.fields([
  { name: 'mp3', maxCount: 1 },
  { name: 'wav', maxCount: 1 },
  { name: 'stems', maxCount: 30 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    const { id } = req.params;
    const beats = await readData(BEATS_FILE);
    
    const index = beats.findIndex(b => b.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Beat not found' });
    }
    
    const updates = { updatedAt: new Date().toISOString() };
    const mp3File = req.files.mp3 && req.files.mp3[0];
    const wavFile = req.files.wav && req.files.wav[0];
    const stemFiles = req.files.stems || [];

    if (mp3File) {
      if (!/\.mp3$/i.test(mp3File.originalname)) return res.status(400).json({ error: 'MP3 file must have .mp3 extension' });
      updates.mp3Url = `/audio/${mp3File.filename}`;
      updates.audioUrl = updates.mp3Url; // preview preference
      console.log('Updated MP3:', updates.mp3Url);
    }
    if (wavFile) {
      if (!/\.wav$/i.test(wavFile.originalname)) return res.status(400).json({ error: 'WAV file must have .wav extension' });
      updates.wavUrl = `/audio/${wavFile.filename}`;
      if (!updates.audioUrl && !beats[index].mp3Url) updates.audioUrl = updates.wavUrl; // fallback preview
      console.log('Updated WAV:', updates.wavUrl);
    }
    if (stemFiles.length > 0) {
      const invalid = stemFiles.find(f => !/\.wav$/i.test(f.originalname));
      if (invalid) return res.status(400).json({ error: 'All stems must be .wav files' });
      updates.stemUrls = stemFiles.map(f => `/audio/stems/${f.filename}`);
      console.log('Replaced stems:', updates.stemUrls.length);
    }
    // Update cover file if provided
    if (req.files && req.files.cover && req.files.cover.length > 0) {
      updates.coverUrl = `/uploads/${req.files.cover[0].filename}`;
      console.log('Updated cover:', updates.coverUrl);
    }
    
    beats[index] = { ...beats[index], ...updates };
    await writeData(BEATS_FILE, beats);
    
    res.json({ success: true, beat: beats[index] });
  } catch (err) {
    console.error('File update error:', err);
    res.status(500).json({ error: 'Failed to update files', details: err.message });
  }
});

router.delete('/beats/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const beats = await readData(BEATS_FILE);
    
    const filtered = beats.filter(b => b.id !== id);
    if (filtered.length === beats.length) {
      return res.status(404).json({ error: 'Beat not found' });
    }
    
    await writeData(BEATS_FILE, filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete beat' });
  }
});

// ========== LICENSE CONTRACT TEMPLATE ROUTES ==========

router.get('/license-templates', authenticateToken, async (req, res) => {
  try {
    const templates = await readData(LICENSE_TEMPLATES_FILE);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch license templates' });
  }
});

router.post('/license-templates', authenticateToken, async (req, res) => {
  try {
    const { id, name, body } = req.body;
    if (!name || !body) return res.status(400).json({ error: 'Name and body required' });
    const templates = await readData(LICENSE_TEMPLATES_FILE);
    const templateId = (id || name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,''));
    if (templates.find(t => t.id === templateId)) return res.status(409).json({ error: 'Template ID already exists' });
    const newTpl = { id: templateId, name, body, updatedAt: new Date().toISOString() };
    templates.push(newTpl);
    await writeData(LICENSE_TEMPLATES_FILE, templates);
    res.json({ success: true, template: newTpl });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/license-templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, body } = req.body;
    const templates = await readData(LICENSE_TEMPLATES_FILE);
    const index = templates.findIndex(t => t.id === id);
    if (index === -1) return res.status(404).json({ error: 'Template not found' });
    if (name) templates[index].name = name;
    if (body) templates[index].body = body;
    templates[index].updatedAt = new Date().toISOString();
    await writeData(LICENSE_TEMPLATES_FILE, templates);
    res.json({ success: true, template: templates[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/license-templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const templates = await readData(LICENSE_TEMPLATES_FILE);
    const filtered = templates.filter(t => t.id !== id);
    if (filtered.length === templates.length) return res.status(404).json({ error: 'Template not found' });
    await writeData(LICENSE_TEMPLATES_FILE, filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ========== LICENSE ROUTES ==========

router.get('/licenses', authenticateToken, async (req, res) => {
  try {
    const licenses = await readData(LICENSES_FILE);
    res.json(licenses);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch licenses' });
  }
});

router.post('/licenses', authenticateToken, async (req, res) => {
  try {
    const { name, price, filesIncluded, streamLimit, usageTerms, tier, contractBody } = req.body;
    const licenses = await readData(LICENSES_FILE);
    
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    
    const newLicense = {
      id,
      name,
      price: parseFloat(price),
      filesIncluded: filesIncluded || [],
      streamLimit: parseInt(streamLimit) || -1,
      usageTerms: usageTerms || '',
      tier: tier || 'basic',
      features: [], // Can be derived from filesIncluded and streamLimit
      createdAt: new Date().toISOString()
    };
    
    licenses.push(newLicense);
    await writeData(LICENSES_FILE, licenses);
    
    // Sync with license templates if contract body provided
    if (contractBody && tier) {
      const templates = await readData(LICENSE_TEMPLATES_FILE);
      const existingIndex = templates.findIndex(t => t.id === tier);
      
      const template = {
        id: tier,
        name: `${name} Contract`,
        contractBody: contractBody,
        updatedAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        templates[existingIndex] = { ...templates[existingIndex], ...template };
      } else {
        templates.push({ ...template, createdAt: new Date().toISOString() });
      }
      
      await writeData(LICENSE_TEMPLATES_FILE, templates);
    }
    
    res.json({ success: true, license: newLicense });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create license' });
  }
});

router.put('/licenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const licenses = await readData(LICENSES_FILE);
    
    const index = licenses.findIndex(l => l.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    licenses[index] = { ...licenses[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(LICENSES_FILE, licenses);
    
    // Sync with license templates if contract body provided
    if (updates.contractBody && updates.tier) {
      const templates = await readData(LICENSE_TEMPLATES_FILE);
      const existingIndex = templates.findIndex(t => t.id === updates.tier);
      
      const template = {
        id: updates.tier,
        name: `${licenses[index].name} Contract`,
        contractBody: updates.contractBody,
        updatedAt: new Date().toISOString()
      };
      
      if (existingIndex >= 0) {
        templates[existingIndex] = { ...templates[existingIndex], ...template };
      } else {
        templates.push({ ...template, createdAt: new Date().toISOString() });
      }
      
      await writeData(LICENSE_TEMPLATES_FILE, templates);
    }
    
    res.json({ success: true, license: licenses[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update license' });
  }
});

router.delete('/licenses/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const licenses = await readData(LICENSES_FILE);
    
    const filtered = licenses.filter(l => l.id !== id);
    if (filtered.length === licenses.length) {
      return res.status(404).json({ error: 'License not found' });
    }
    
    await writeData(LICENSES_FILE, filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete license' });
  }
});

// ========== COUPON ROUTES ==========

router.get('/coupons', authenticateToken, async (req, res) => {
  try {
    const coupons = await readData(COUPONS_FILE);
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

router.post('/coupons', authenticateToken, async (req, res) => {
  try {
    const { code, type, value, limit, expiresAt } = req.body;
    const coupons = await readData(COUPONS_FILE);
    
    const newCoupon = {
      id: code.toUpperCase(),
      code: code.toUpperCase(),
      type, // 'percentage' or 'fixed'
      value: parseFloat(value),
      uses: 0,
      limit: parseInt(limit) || 9999,
      expiresAt: expiresAt || null,
      active: true,
      createdAt: new Date().toISOString()
    };
    
    coupons.push(newCoupon);
    await writeData(COUPONS_FILE, coupons);
    
    res.json({ success: true, coupon: newCoupon });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

router.put('/coupons/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const coupons = await readData(COUPONS_FILE);
    
    const index = coupons.findIndex(c => c.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    
    coupons[index] = { ...coupons[index], ...updates, updatedAt: new Date().toISOString() };
    await writeData(COUPONS_FILE, coupons);
    
    res.json({ success: true, coupon: coupons[index] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

router.delete('/coupons/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const coupons = await readData(COUPONS_FILE);
    
    const filtered = coupons.filter(c => c.id !== id);
    if (filtered.length === coupons.length) {
      return res.status(404).json({ error: 'Coupon not found' });
    }
    
    await writeData(COUPONS_FILE, filtered);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

// ========== SALES ROUTES ==========

router.get('/sales', authenticateToken, async (req, res) => {
  try {
    const sales = await readData(SALES_FILE);
    res.json(sales);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sales' });
  }
});

// ========== SETTINGS ROUTES ==========

router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await readData(SETTINGS_FILE);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', authenticateToken, async (req, res) => {
  try {
    // Overwrite with provided settings object
    const settings = req.body || {};
    await writeData(SETTINGS_FILE, settings);
    res.json({ success: true, settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ========== EMAIL TEMPLATES & BROADCAST ==========

router.get('/email-templates', authenticateToken, async (req, res) => {
  try {
    const templates = await readData(EMAIL_TEMPLATES_FILE);
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email templates' });
  }
});

router.put('/email-templates', authenticateToken, async (req, res) => {
  try {
    // Accept full object or partial update of a key
    const current = await readData(EMAIL_TEMPLATES_FILE);
    const update = req.body || {};
    const merged = { ...current, ...update };
    await writeData(EMAIL_TEMPLATES_FILE, merged);
    res.json({ success: true, templates: merged });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update email templates' });
  }
});

router.post('/emails/broadcast', authenticateToken, async (req, res) => {
  try {
    const { subject, message } = req.body || {};
    if (!subject || !message) {
      return res.status(400).json({ error: 'subject and message required' });
    }
    // For now, just log to a file for audit; real send needs recipients list
    const logPath = path.join(DATA_DIR, 'email_broadcasts.json');
    let logs = [];
    try { logs = JSON.parse(await fs.readFile(logPath, 'utf8')); } catch {}
    const entry = { id: 'br_' + Date.now(), date: new Date().toISOString(), subject, message, count: 0 };
    logs.push(entry);
    await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
    res.json({ success: true, info: 'Broadcast recorded (no recipients configured)', entry });
  } catch (err) {
    res.status(500).json({ error: 'Failed to process broadcast' });
  }
});

// Initialize data files on module load
initDataFiles();

module.exports = router;
