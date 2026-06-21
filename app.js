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