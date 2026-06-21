// pdb-bps.js
// =====================================================================
// Mengambil data PDB / pertumbuhan ekonomi dari WebAPI BPS
// (model data dinamis), lalu menyimpan ke tabel `pdb` di Supabase.
//
// Dibuat SE-POLA dengan bps.js temanmu:
//   - pakai axios
//   - pakai require('../supabase')  (client yang sama)
//   - pakai process.env.BPS_KEY
//   - simpan via supabase.from('pdb').insert(...)
//
// PENTING: taruh file ini di FOLDER YANG SAMA dengan bps.js, supaya
// require('../supabase') resolve persis seperti di bps.js.
//
// ENV opsional (set setelah tahu ID variabel via /api/list-var-pdb):
//   VAR_PDB_NILAI   -> ID variabel nilai PDB (mis. ADHK/ADHB)
//   VAR_PDB_GROWTH  -> ID variabel laju pertumbuhan PDB (%); boleh kosong
//   NILAI_DIVISOR   -> pembagi satuan ke triliun (default 1000)
//   PDB_REPLACE     -> 'true' (default) = hapus baris pdb dulu (anti-duplikat)
// =====================================================================

const axios = require('axios');
const supabase = require('../supabase');

const BASE = 'https://webapi.bps.go.id/v1/api';
const KEY = process.env.BPS_KEY;

const VAR_PDB_NILAI = process.env.VAR_PDB_NILAI || '';
const VAR_PDB_GROWTH = process.env.VAR_PDB_GROWTH || '';
const NILAI_DIVISOR = Number(process.env.NILAI_DIVISOR || 1000);
const REPLACE = String(process.env.PDB_REPLACE || 'true') === 'true';

const AXIOS_OPTS = {
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json, text/plain, */*',
  },
};

async function bpsGet(path) {
  const { data } = await axios.get(`${BASE}/${path}/key/${KEY}`, AXIOS_OPTS);
  return data;
}

// 1) Cari variabel terkait PDB / pertumbuhan ekonomi.
async function listPdbVariables() {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    const data = await bpsGet(`list/model/var/lang/ind/domain/0000/page/${page}`);
    const arr = Array.isArray(data.data) ? data.data[1] || [] : [];
    for (const v of arr) {
      const title = v.title || v.label || '';
      if (/domestik bruto|pertumbuhan ekonomi|\bpdb\b/i.test(title)) {
        out.push({ val: v.var_id || v.val, title });
      }
    }
    if (data.data && data.data[0] && data.data[0].pages) totalPages = data.data[0].pages;
    page++;
  } while (page <= totalPages && page <= 25);
  return out;
}

// 2) Lihat struktur 1 variabel (untuk pilih ID & cek tahun).
async function inspectVar(varId) {
  const data = await bpsGet(`list/model/data/lang/ind/domain/0000/var/${varId}`);
  const pick = (arr) => (arr || []).map((x) => ({ val: x.val, label: x.label }));
  const dc = data.datacontent || {};
  return {
    status: data.status,
    availability: data['data-availability'],
    var: pick(data.var),
    turvar: pick(data.turvar),
    vervar: pick(data.vervar),
    tahun: pick(data.tahun),
    turtahun: pick(data.turtahun),
    sampleKeys: Object.keys(dc).slice(0, 8),
    totalKeys: Object.keys(dc).length,
  };
}

// Ubah datacontent menjadi seri tahunan nasional.
function buildAnnualSeries(data, vervarHint) {
  const dc = data.datacontent || {};
  const tahun = data.tahun || [];
  const turtahun = data.turtahun || [];
  const vervar = data.vervar || [];
  const varArr = data.var || [];
  const turvar = data.turvar || [];

  const varVal = String((varArr[0] || {}).val != null ? varArr[0].val : '');
  const tv = turvar.find((t) => String(t.val) === '0') || turvar[0] || { val: '' };
  const turvarVal = String(tv.val);

  let tt = turtahun.find(
    (t) => /tahun/i.test(t.label || '') && !/triwulan|kuartal/i.test(t.label || '')
  );
  if (!tt) tt = turtahun.find((t) => String(t.val) === '0') || turtahun[0] || { val: '' };
  const turtahunVal = String(tt.val);

  let vv =
    (vervarHint ? vervar.find((v) => new RegExp(vervarHint, 'i').test(v.label || '')) : null) ||
    vervar.find((v) => /produk domestik bruto/i.test(v.label || '')) ||
    (vervar.length === 1 ? vervar[0] : null);

  const out = [];
  for (const th of tahun) {
    const year = parseInt(String(th.label || '').slice(0, 4), 10);
    if (!year) continue;
    let val;
    if (vv) val = dc[`${vv.val}${varVal}${turvarVal}${th.val}${turtahunVal}`];
    if (val === undefined) {
      const suffix = `${th.val}${turtahunVal}`;
      const cand = Object.entries(dc).filter(([k]) => k.endsWith(suffix) && k.includes(varVal));
      if (cand.length === 1) val = cand[0][1];
    }
    if (val !== undefined && val !== null && val !== '') out.push({ tahun: year, nilai: Number(val) });
  }
  const map = new Map();
  out.forEach((r) => map.set(r.tahun, r.nilai));
  return [...map.entries()].map(([t, n]) => ({ tahun: t, nilai: n })).sort((a, b) => a.tahun - b.tahun);
}

async function deleteAllPdb() {
  const { error } = await supabase.from('pdb').delete().gte('tahun', 0);
  if (error) throw new Error('Supabase delete pdb: ' + error.message);
}

async function insertPdb(rows) {
  if (!rows.length) return;
  const { error } = await supabase.from('pdb').insert(rows);
  if (error) throw new Error('Supabase insert pdb: ' + error.message);
}

// 3) Fungsi utama: tarik PDB dari BPS lalu simpan ke Supabase.
async function fetchAndSavePdbFromBps() {
  if (!KEY) throw new Error('BPS_KEY belum di-set di .env');
  if (!VAR_PDB_NILAI && !VAR_PDB_GROWTH) {
    throw new Error(
      'Set dulu VAR_PDB_NILAI dan/atau VAR_PDB_GROWTH. Jalankan /api/list-var-pdb untuk cari ID-nya.'
    );
  }

  let nilai = [];
  let growth = [];

  if (VAR_PDB_NILAI) {
    const data = await bpsGet(`list/model/data/lang/ind/domain/0000/var/${VAR_PDB_NILAI}`);
    nilai = buildAnnualSeries(data).map((r) => ({
      tahun: r.tahun,
      nilai_triliun: +(r.nilai / NILAI_DIVISOR).toFixed(2),
    }));
  }
  if (VAR_PDB_GROWTH) {
    const data = await bpsGet(`list/model/data/lang/ind/domain/0000/var/${VAR_PDB_GROWTH}`);
    growth = buildAnnualSeries(data).map((r) => ({
      tahun: r.tahun,
      pertumbuhan_yoy: +Number(r.nilai).toFixed(2),
    }));
  }

  const byYear = new Map();
  for (const r of nilai) byYear.set(r.tahun, Object.assign({ tahun: r.tahun }, byYear.get(r.tahun), r));
  for (const r of growth) byYear.set(r.tahun, Object.assign({ tahun: r.tahun }, byYear.get(r.tahun), r));
  const rows = [...byYear.values()].sort((a, b) => a.tahun - b.tahun);

  // Kalau tidak ada variabel growth, hitung pertumbuhan dari selisih nilai.
  if (!growth.length && nilai.length) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].nilai_triliun;
      if (prev) rows[i].pertumbuhan_yoy = +(((rows[i].nilai_triliun - prev) / prev) * 100).toFixed(2);
    }
  }

  if (REPLACE) await deleteAllPdb();
  await insertPdb(rows);
  console.log(`PDB (BPS) disimpan: ${rows.length} rows`);
  return { inserted: rows.length, rows };
}

module.exports = { listPdbVariables, inspectVar, fetchAndSavePdbFromBps };
