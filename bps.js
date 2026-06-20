const axios = require('axios');
const supabase = require('../supabase');

const BASE = 'https://webapi.bps.go.id/v1/api';
const KEY = process.env.BPS_KEY;

const EKSPOR_TABLES = [
  { id: 1034, nama: 'Batu Bara' },
  { id: 1013, nama: 'Gas Alam' },
  { id: 1026, nama: 'Minyak Kelapa Sawit' },
  { id: 2030, nama: 'Karet Remah' },
  { id: 2033, nama: 'Besi dan Baja' },
  { id: 1014, nama: 'Kopi' },
  { id: 1032, nama: 'Bijih Tembaga' },
];

const IMPOR_TABLES = [
  { id: 1043, nama: 'Beras' },
  { id: 1046, nama: 'Minyak Bumi' },
  { id: 1047, nama: 'Besi dan Baja' },
  { id: 1044, nama: 'Pupuk' },
  { id: 2015, nama: 'Kedelai' },
];

async function fetchTableData(tableId) {
  try {
    const { data } = await axios.get(
      `${BASE}/view/model/statictable/domain/0000/lang/ind/id/${tableId}/key/${KEY}`,
      {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
        }
      }
    );

    if (data.status !== 'OK') return null;
    return data.data.table;
  } catch (err) {
    console.log(`Fetch error table ${tableId}:`, err.message);
    return null;
  }
}

async function fetchAndSaveEksporImpor() {
  // Ekspor
  for (const table of EKSPOR_TABLES) {
    console.log(`Fetching ekspor: ${table.nama}...`);
    const html = await fetchTableData(table.id);
    if (!html) { console.log(`Skip ${table.nama} - no HTML`); continue; }

    // Debug: lihat 500 karakter pertama
    if (table.id === 1034) {
      console.log('SAMPLE HTML Batu Bara:', html.substring(0, 500));
    }

    const rows = parseKomoditasTable(html, table.nama);
    if (rows.length === 0) { console.log(`Tidak ada data untuk ${table.nama}`); continue; }

    const { error } = await supabase.from('ekspor').insert(rows);
    if (error) console.log(`Error insert ekspor ${table.nama}:`, error.message);
    else console.log(`Ekspor ${table.nama} disimpan: ${rows.length} rows`);

    await new Promise(r => setTimeout(r, 1000));
  }

  // Impor
  for (const table of IMPOR_TABLES) {
    console.log(`Fetching impor: ${table.nama}...`);
    const html = await fetchTableData(table.id);
    if (!html) { console.log(`Skip ${table.nama} - no HTML`); continue; }

    const rows = parseKomoditasTable(html, table.nama);
    if (rows.length === 0) { console.log(`Tidak ada data untuk ${table.nama}`); continue; }

    const { error } = await supabase.from('impor').insert(rows);
    if (error) console.log(`Error insert impor ${table.nama}:`, error.message);
    else console.log(`Impor ${table.nama} disimpan: ${rows.length} rows`);

    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('Semua ekspor impor selesai!');
}

function parseKomoditasTable(html, nama) {
  const rows = [];

  // Ambil semua tahun dari header
  const tahunMatches = html.match(/(?:&gt;|>)(\d{4})(?:&lt;|<)/g);
  if (!tahunMatches) return rows;
  const tahunList = [...new Set(
    tahunMatches.map(t => parseInt(t.replace(/&gt;|&lt;|>|</g, '')))
  )].filter(t => t >= 2012 && t <= 2026);

  if (tahunList.length === 0) return rows;

  // Cari baris Total/Indonesia/Jumlah — biasanya baris pertama dengan data angka
  // Pattern: cari semua angka setelah tag td
  const angkaPattern = /(?:&gt;|>)([\d\s]+[,.][\d]+)(?:&lt;|<)/g;
  const semuaAngka = [];
  let match;
  while ((match = angkaPattern.exec(html)) !== null) {
    const raw = match[1].trim().replace(/\./g, '').replace(',', '.');
    const nilai = parseFloat(raw);
    if (!isNaN(nilai) && nilai > 0) {
      semuaAngka.push(nilai);
    }
  }

  // Pasangkan tahun dengan angka (ambil dari urutan pertama)
  tahunList.forEach((tahun, i) => {
    if (semuaAngka[i] !== undefined) {
      rows.push({
        tahun,
        nama_komoditas: nama,
        nilai_usd: semuaAngka[i]
      });
    }
  });

  return rows;
}

async function fetchAndSaveInflasi() {
  try {
    const { data } = await axios.get(
      `${BASE}/view/model/statictable/domain/0000/lang/ind/id/913/key/${KEY}`,
      {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json, text/plain, */*',
        }
      }
    );

    if (data.status !== 'OK') return console.log('BPS error:', data.message);

    const html = data.data.table;
    const rows = [];

    const tahunMatch = html.match(/&gt;(\d{4})&lt;/g);
    const tahunList = tahunMatch?.map(t => parseInt(t.replace(/&gt;|&lt;/g, ''))) || [];

    const bulanNames = ['Januari','Februari','Maret','April','Mei','Juni',
                        'Juli','Agustus','September','Oktober','November','Desember'];

    const rowMatches = html.match(/&gt;(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)&lt;.*?(?=&gt;(?:Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)&lt;|Catatan)/gs);

    if (!rowMatches) return console.log('Gagal parse HTML inflasi');

    rowMatches.forEach(rowHtml => {
      const bulanMatch = rowHtml.match(/&gt;(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)&lt;/);
      if (!bulanMatch) return;

      const bulan = bulanNames.indexOf(bulanMatch[1]) + 1;
      const nilaiMatches = rowHtml.match(/&gt;(-?\d+,\d+)&lt;/g) || [];

      nilaiMatches.forEach((nilaiStr, i) => {
        if (i >= tahunList.length) return;
        const nilai = parseFloat(nilaiStr.replace(/&gt;|&lt;/g, '').replace(',', '.'));
        const tahun = tahunList[i];
        if (tahun >= 2020) rows.push({ tahun, bulan, nilai });
      });
    });

    if (rows.length === 0) return console.log('Tidak ada data inflasi');
    const { error } = await supabase.from('inflasi').insert(rows);
    if (error) console.log('Error insert inflasi:', error.message);
    else console.log('Inflasi berhasil disimpan:', rows.length, 'rows');

  } catch (err) {
    console.log('Fetch inflasi error:', err.message);
  }
}

module.exports = { fetchAndSaveInflasi, fetchAndSaveEksporImpor };