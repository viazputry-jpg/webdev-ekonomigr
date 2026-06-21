require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./supabase');

const { fetchAndSaveInflasi, fetchAndSaveEksporImpor } = require('./fetchers/bps');
const { fetchAndSavePDB } = require('./fetchers/worldbank');

const app = express();
app.use(cors());

app.get('/', (req, res) => {
  res.send('EKONOMI DASHBOARD API RUNNING');
});


// TESTING AMBIL PDB DARI BPS

const {
  listPdbVariables,
  inspectVar,
  fetchAndSavePdbFromBps,
} = require('./pdb-bps');

// (A) Cari ID variabel PDB / pertumbuhan ekonomi.
//     Buka: http://localhost:3001/api/list-var-pdb
app.get('/api/list-var-pdb', async (req, res) => {
  try {
    res.json(await listPdbVariables());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// (B) Lihat struktur 1 variabel (untuk pilih ID + cek tahun).
//     Buka: http://localhost:3001/api/inspect-pdb/ID_VARIABEL
app.get('/api/inspect-pdb/:varId', async (req, res) => {
  try {
    res.json(await inspectVar(req.params.varId));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// (C) Tarik PDB dari BPS lalu simpan ke Supabase (tabel pdb).
//     Buka: http://localhost:3001/api/fetch-pdb-bps
app.get('/api/fetch-pdb-bps', async (req, res) => {
  try {
    res.json(await fetchAndSavePdbFromBps());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});



// =====================
// DATA ROUTES (untuk frontend)
// =====================

app.get('/api/inflasi', async (req, res) => {
  const { data, error } = await supabase
    .from('inflasi')
    .select('*')
    .order('tahun', { ascending: true })
    .order('bulan', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/pdb', async (req, res) => {
  const { data, error } = await supabase
    .from('pdb')
    .select('*')
    .order('tahun', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/ekspor', async (req, res) => {
  const { data, error } = await supabase
    .from('ekspor')
    .select('*')
    .order('tahun', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/ekspor/:komoditas', async (req, res) => {
  const { data, error } = await supabase
    .from('ekspor')
    .select('*')
    .eq('nama_komoditas', req.params.komoditas)
    .order('tahun', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/impor', async (req, res) => {
  const { data, error } = await supabase
    .from('impor')
    .select('*')
    .order('tahun', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.get('/api/impor/:komoditas', async (req, res) => {
  const { data, error } = await supabase
    .from('impor')
    .select('*')
    .eq('nama_komoditas', req.params.komoditas)
    .order('tahun', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// =====================
// FETCH ROUTES (admin only, buat update data)
// =====================

app.get('/api/fetch-inflasi', async (req, res) => {
  await fetchAndSaveInflasi();
  res.json({ message: 'Fetch inflasi selesai' });
});

app.get('/api/fetch-pdb', async (req, res) => {
  await fetchAndSavePDB();
  res.json({ message: 'Fetch PDB selesai, cek terminal' });
});

app.get('/api/fetch-ekspor-impor', async (req, res) => {
  res.json({ message: 'Fetch ekspor impor dimulai, cek terminal...' });
  fetchAndSaveEksporImpor();
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
