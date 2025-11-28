#!/usr/bin/env node
// rotate-secrets.js - Utility to rotate JWT secret and optionally admin password
// Usage examples:
//   npm run rotate-secrets                       (just rotates JWT secret)
//   node rotate-secrets.js --password NewPass123 (rotates secret + sets new admin password hash)
//   node rotate-secrets.js --show                (prints current values)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const ENV_PATH = path.join(__dirname, '.env');

function parseEnv(content) {
  const lines = content.split(/\r?\n/);
  const map = {};
  lines.forEach(l => {
    if (!l.trim() || l.trim().startsWith('#')) return;
    const idx = l.indexOf('=');
    if (idx === -1) return;
    const key = l.slice(0, idx).trim();
    const value = l.slice(idx + 1).trim();
    map[key] = value;
  });
  return { lines, map };
}

function updateEnv(lines, updates) {
  return lines.map(line => {
    if (!line.trim() || line.trim().startsWith('#')) return line;
    const idx = line.indexOf('=');
    if (idx === -1) return line;
    const key = line.slice(0, idx).trim();
    if (updates[key]) {
      return `${key}=${updates[key]}`;
    }
    return line;
  });
}

function backupEnv() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(__dirname, `.env.backup-${timestamp}`);
  fs.copyFileSync(ENV_PATH, backupPath);
  return backupPath;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.error('.env file not found. Create it first.');
    process.exit(1);
  }

  const raw = fs.readFileSync(ENV_PATH, 'utf8');
  const { lines, map } = parseEnv(raw);

  const args = process.argv.slice(2);
  const showOnly = args.includes('--show');
  const pwIdx = args.findIndex(a => a === '--password');
  const newPassword = pwIdx !== -1 ? args[pwIdx + 1] : null;

  if (showOnly) {
    console.log('Current JWT_SECRET:', map.JWT_SECRET);
    console.log('Current ADMIN_PASSWORD_HASH:', map.ADMIN_PASSWORD_HASH);
    return;
  }

  const updates = {};
  // Always rotate JWT secret
  updates.JWT_SECRET = crypto.randomBytes(32).toString('hex');

  if (newPassword) {
    if (newPassword.length < 12) {
      console.error('Password should be at least 12 characters for security.');
      process.exit(1);
    }
    updates.ADMIN_PASSWORD_HASH = bcrypt.hashSync(newPassword, 10);
  }

  const backupPath = backupEnv();

  const newContent = updateEnv(lines, updates).join('\n');
  fs.writeFileSync(ENV_PATH, newContent, 'utf8');

  console.log('Secrets rotated successfully.');
  console.log('Backup created at:', backupPath);
  console.log('New JWT_SECRET:', updates.JWT_SECRET);
  if (updates.ADMIN_PASSWORD_HASH) {
    console.log('New ADMIN_PASSWORD_HASH stored. Plain password was NOT saved.');
  }
  console.log('Restart the server for changes to take effect.');
}

main();
