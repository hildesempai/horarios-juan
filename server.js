const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: `http://localhost:${PORT}`, credentials: true }));
app.use(session({
  secret: 'horarios-clinica-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 } // 8h
}));
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth',           require('./src/routes/auth'));
app.use('/api/employees',      require('./src/routes/employees'));
app.use('/api/employee-types', require('./src/routes/employee-types'));
app.use('/api/shift-types',    require('./src/routes/shift-types'));
app.use('/api/schedules',      require('./src/routes/schedules'));
app.use('/api/settings',       require('./src/routes/settings'));

// ── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏥 Sistema de Horarios corriendo en http://localhost:${PORT}`);
  console.log('   Usuario: admin | Contraseña: admin\n');
});
