require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Stripe = require('stripe');
const nodemailer = require('nodemailer');
const archiver = require('archiver');

const app = express();
app.use(cors());

// Use JSON parser for normal routes, raw for webhook
app.use(bodyParser.json());

// Serve index2.html at root (MUST come before static middleware)
const path = require('path');
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index2.html'));
});

// Serve frontend static files from project root (so index2.html is accessible)
app.use(express.static(path.join(__dirname)));

// Admin routes
const adminRoutes = require('./admin-routes');
app.use('/api/admin', adminRoutes);

// Public API routes (no auth required) - for storefront
app.get('/api/beats', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const beatsFile = path.join(__dirname, 'data', 'beats.json');
    const data = await fs.readFile(beatsFile, 'utf8');
    const beats = JSON.parse(data);
    // Only return active beats
    const activeBeats = beats.filter(b => b.status === 'active');
    res.json(activeBeats);
  } catch (err) {
    console.error('Failed to fetch public beats:', err);
    res.json([]);
  }
});

app.get('/api/licenses', async (req, res) => {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const licensesFile = path.join(__dirname, 'data', 'licenses.json');
    const data = await fs.readFile(licensesFile, 'utf8');
    const licenses = JSON.parse(data);
    res.json(licenses);
  } catch (err) {
    console.error('Failed to fetch public licenses:', err);
    res.json([]);
  }
});

const stripeSecret = process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here';
const stripe = Stripe(stripeSecret);

// CONFIG: same IDs as front-end
const BEAT_CONFIG = {
  trap_wave_001: {
    title: 'Trap Wave 001',
    files: {
      basic: 'https://yourdomain.com/downloads/trap_wave_001_basic.zip',
      premium: 'https://yourdomain.com/downloads/trap_wave_001_premium.zip',
      unlimited: 'https://yourdomain.com/downloads/trap_wave_001_unlimited.zip',
      exclusive: 'https://yourdomain.com/downloads/trap_wave_001_exclusive.zip'
    }
  },
  rnb_vibes_002: {
    title: 'R&B Vibes 002',
    files: {
      basic: 'https://yourdomain.com/downloads/rnb_vibes_002_basic.zip',
      premium: 'https://yourdomain.com/downloads/rnb_vibes_002_premium.zip',
      unlimited: 'https://yourdomain.com/downloads/rnb_vibes_002_unlimited.zip',
      exclusive: 'https://yourdomain.com/downloads/rnb_vibes_002_exclusive.zip'
    }
  },
  club_banger_003: {
    title: 'Club Banger 003',
    files: {
      basic: 'https://yourdomain.com/downloads/club_banger_003_basic.zip',
      premium: 'https://yourdomain.com/downloads/club_banger_003_premium.zip',
      unlimited: 'https://yourdomain.com/downloads/club_banger_003_unlimited.zip',
      exclusive: 'https://yourdomain.com/downloads/club_banger_003_exclusive.zip'
    }
  }
};

const LICENSE_CONFIG = {
  basic: { name: 'Basic Lease (MP3)', price: 29.99 },
  premium: { name: 'Premium Lease (MP3 + WAV)', price: 59.99 },
  unlimited: { name: 'Unlimited Lease', price: 129.99 },
  exclusive: { name: 'Exclusive Rights', price: 499.99 }
};

// Nodemailer transporter: prefer explicit SMTP settings via env, fall back to Ethereal test account for dev
async function createTransporter() {
  // Treat placeholder values as "not configured"
  const host = (process.env.EMAIL_HOST || '').trim();
  const user = (process.env.EMAIL_USER || '').trim();
  const pass = (process.env.EMAIL_PASS || '').trim();
  const isPlaceholderHost = host === '' || /yourmail\.com$/i.test(host);
  const isPlaceholderUser = user === '' || /@yourdomain\.com$/i.test(user) || /@example\.com$/i.test(user);

  if (!isPlaceholderHost && user && pass) {
    return nodemailer.createTransport({
      host,
      port: Number(process.env.EMAIL_PORT || 587),
      secure: process.env.EMAIL_SECURE === 'true',
      auth: { user, pass }
    });
  }

  // Dev fallback: Ethereal test account
  const testAccount = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
}

let transporterPromise = createTransporter();

// 1) Create checkout session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { beatId, licenseId, buyerEmail } = req.body;

    // Load beats and licenses from database
    const fs = require('fs').promises;
    const beatsFile = path.join(__dirname, 'data', 'beats.json');
    const licensesFile = path.join(__dirname, 'data', 'licenses.json');
    
    const beatsData = await fs.readFile(beatsFile, 'utf8');
    const licensesData = await fs.readFile(licensesFile, 'utf8');
    
    const beats = JSON.parse(beatsData);
    const licenses = JSON.parse(licensesData);
    
    const beat = beats.find(b => b.id === beatId);
    const license = licenses.find(l => l.id === licenseId);

    if (!beat || !license) {
      return res.status(400).json({ error: 'Invalid beat or license.' });
    }

    const successUrl = process.env.SUCCESS_URL || 'http://localhost:4242/thank-you?session_id={CHECKOUT_SESSION_ID}';
    const cancelUrl = process.env.CANCEL_URL || 'http://localhost:4242/cancelled';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: buyerEmail,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `${beat.title} – ${license.name}` },
            unit_amount: Math.round(license.price * 100)
          },
          quantity: 1
        }
      ],
      metadata: { beatId, licenseId },
      success_url: successUrl,
      cancel_url: cancelUrl
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// 2) Stripe webhook – triggered after successful payment
// Note: Stripe requires the raw body to verify the signature
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_your_secret_here';
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message);
    return res.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const beatId = session.metadata.beatId;
    const licenseId = session.metadata.licenseId;
    const email = session.customer_details && session.customer_details.email;

    handleSuccessfulPurchase({ beatId, licenseId, email })
      .then(() => console.log('Purchase handled.'))
      .catch((err) => console.error('Error handling purchase:', err));
  }

  res.json({ received: true });
});

// 3) After payment: send beat + license
async function handleSuccessfulPurchase({ beatId, licenseId, email }) {
  const fs = require('fs').promises;
  const fssync = require('fs');
  
  // Load beat and license data
  const beatsFile = path.join(__dirname, 'data', 'beats.json');
  const licensesFile = path.join(__dirname, 'data', 'licenses.json');
  const templatesFile = path.join(__dirname, 'data', 'license_templates.json');
  const salesFile = path.join(__dirname, 'data', 'sales.json');
  
  const beatsData = await fs.readFile(beatsFile, 'utf8');
  const licensesData = await fs.readFile(licensesFile, 'utf8');
  let templates = [];
  try { const templatesData = await fs.readFile(templatesFile, 'utf8'); templates = JSON.parse(templatesData); } catch {}
  
  const beats = JSON.parse(beatsData);
  const licenses = JSON.parse(licensesData);
  
  const beat = beats.find(b => b.id === beatId);
  const license = licenses.find(l => l.id === licenseId);
  const contractTemplate = templates.find(t => t.id === licenseId);
  
  if (!beat || !license || !email) return;

  // Determine included file types (fallback by licenseId)
  const included = (license.filesIncluded && license.filesIncluded.length)
    ? license.filesIncluded
    : (licenseId === 'basic' ? ['mp3']
      : licenseId === 'premium' ? ['mp3','wav']
      : licenseId === 'unlimited' ? ['mp3','wav','stems']
      : licenseId === 'exclusive' ? ['mp3','wav','stems'] : []);

  // Build file paths
  const filePaths = [];
  if (included.includes('mp3')) {
    if (beat.mp3Url) filePaths.push({ type: 'mp3', url: beat.mp3Url });
    else if (beat.audioUrl && /\.mp3$/i.test(beat.audioUrl)) filePaths.push({ type: 'mp3', url: beat.audioUrl });
  }
  if (included.includes('wav')) {
    if (beat.wavUrl) filePaths.push({ type: 'wav', url: beat.wavUrl });
    else if (beat.audioUrl && /\.wav$/i.test(beat.audioUrl)) filePaths.push({ type: 'wav', url: beat.audioUrl });
  }
  if (included.includes('stems') && Array.isArray(beat.stemUrls)) beat.stemUrls.forEach(u => filePaths.push({ type: 'stem', url: u }));

  // Generate base download URLs (these assume static serving of audio path)
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
  const downloadUrls = filePaths.map(fp => `${baseUrl}${fp.url}`);

  const licenseText = `Beats By M.A.J. – ${license.name}\n\nBeat Title: ${beat.title}\nBuyer Email: ${email}\nLicense ID: ${license.id}\n\nUsage Terms:\n${license.usageTerms || 'Standard licensing terms apply.'}\n\nFiles Included: ${included.join(', ')}\nStream Limit: ${license.streamLimit === -1 ? 'Unlimited' : license.streamLimit}\n\nDownload Links:\n${downloadUrls.join('\n')}`;

  const contractBody = contractTemplate ? `License Contract – ${contractTemplate.name}\nBeat: ${beat.title}\nLicense: ${license.name}\nDate: ${new Date().toISOString()}\n\n${contractTemplate.body}` : 'No contract template available.';

  const transporter = await transporterPromise;

  // Prepare attachments (license summary + contract + media files/zip)
  const attachments = [
    { filename: 'license.txt', content: licenseText },
    { filename: 'contract.txt', content: contractBody }
  ];
  const filesDelivered = ['license.txt','contract.txt'];

  // Resolve local file system paths and collect for possible zipping
  const resolvedMedia = [];
  for (const fp of filePaths) {
    const diskPath = path.join(__dirname, fp.url.startsWith('/') ? fp.url : `/${fp.url}`);
    try {
      await fs.access(diskPath);
      resolvedMedia.push({ ...fp, diskPath });
    } catch (e) {
      console.warn('Missing file for delivery:', diskPath);
    }
  }

  // If stems are included or more than 2 files, create a zip bundle
  if (resolvedMedia.length && (included.includes('stems') || resolvedMedia.length > 2)) {
    try {
      const zipsDir = path.join(__dirname, 'temp_zips');
      if (!fssync.existsSync(zipsDir)) fssync.mkdirSync(zipsDir);
      const zipName = `delivery_${beat.id}_${license.id}_${Date.now()}.zip`;
      const zipPath = path.join(zipsDir, zipName);
      await new Promise((resolve, reject) => {
        const output = fssync.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);
        resolvedMedia.forEach(m => {
          archive.file(m.diskPath, { name: path.basename(m.diskPath) });
        });
        archive.finalize();
      });
      attachments.push({ filename: zipName, path: zipPath });
      filesDelivered.push(zipName);
    } catch (zipErr) {
      console.warn('Zip creation failed, attaching individual files.', zipErr.message);
      // Fallback: attach individual media files
      resolvedMedia.forEach(m => {
        attachments.push({ filename: path.basename(m.diskPath), path: m.diskPath });
        filesDelivered.push(path.basename(m.diskPath));
      });
    }
  } else {
    // Attach individual files directly
    resolvedMedia.forEach(m => {
      attachments.push({ filename: path.basename(m.diskPath), path: m.diskPath });
      filesDelivered.push(path.basename(m.diskPath));
    });
  }

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'Beats By M.A.J. <no-reply@yourdomain.com>',
    to: email,
    subject: `Your Beat Delivery – ${beat.title} (${license.name})`,
    text: `Thank you for your purchase!\n\nBeat: ${beat.title}\nLicense: ${license.name}\nIncluded: ${included.join(', ')}\n\nFiles Attached (or download links if large):\n${filesDelivered.map(f => '- ' + f).join('\n')}\n\nContract included as contract.txt.\nIf links are needed directly:\n${downloadUrls.join('\n')}\n\nSupport: Reply to this email.`,
    attachments
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('Sent purchase email to', email, 'info:', info.messageId);
  console.log('Files delivered:', filesDelivered.join(', '));

  // If using Ethereal dev account, print preview URL
  if (nodemailer.getTestMessageUrl) {
    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log('Preview email at:', preview);
  }
  
  // Save sale record
  try {
    let sales = [];
    try {
      const salesData = await fs.readFile(salesFile, 'utf8');
      sales = JSON.parse(salesData);
    } catch (err) {
      // File doesn't exist yet
    }
    
    const saleRecord = {
      id: 'sale_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      beatId: beat.id,
      beatTitle: beat.title,
      licenseId: license.id,
      licenseName: license.name,
      customer: email,
      amount: license.price,
      date: new Date().toISOString(),
      status: 'completed',
      filesDelivered: filesDelivered,
      downloadUrls: downloadUrls
    };
    
    sales.push(saleRecord);
    await fs.writeFile(salesFile, JSON.stringify(sales, null, 2));
    
    // Update beat sales count
    const beatIndex = beats.findIndex(b => b.id === beatId);
    if (beatIndex !== -1) {
      beats[beatIndex].sales = (beats[beatIndex].sales || 0) + 1;
      await fs.writeFile(beatsFile, JSON.stringify(beats, null, 2));
    }
    
    console.log('Sale recorded:', saleRecord.id);
  } catch (err) {
    console.error('Failed to save sale record:', err);
  }
}

// Basic health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// DEV: simulate a successful purchase without Stripe (only enabled outside production)
if (process.env.NODE_ENV !== 'production') {
  app.post('/dev/simulate-purchase', async (req, res) => {
    const { beatId, licenseId, email, devKey } = req.body || {};

    // Optional simple auth: set DEV_API_KEY in .env to require a key for this endpoint
    if (process.env.DEV_API_KEY && devKey !== process.env.DEV_API_KEY) {
      return res.status(403).json({ error: 'Forbidden: invalid devKey' });
    }

    if (!beatId || !licenseId || !email) {
      return res.status(400).json({ error: 'beatId, licenseId and email are required' });
    }

    try {
      await handleSuccessfulPurchase({ beatId, licenseId, email });
      return res.json({ ok: true, message: 'Simulated purchase processed' });
    } catch (err) {
      console.error('simulate-purchase error', err);
      return res.status(500).json({ error: 'Failed to process simulated purchase' });
    }
  });
}

// Serve admin dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

const PORT = process.env.PORT || 4242;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
