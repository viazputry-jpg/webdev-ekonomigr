const axios = require('axios');
const supabase = require('../supabase');

function normalizeWB(data) {
  if (!Array.isArray(data?.[1])) return [];
  return data[1]
    .filter(d => d.value !== null)
    .map(d => ({
      year: Number(d.date),
      value: Number(d.value)
    }))
    .reverse();
}

async function getInflation() {
  const url = 'https://api.worldbank.org/v2/country/IDN/indicator/FP.CPI.TOTL.ZG?format=json&per_page=50';
  const { data } = await axios.get(url);
  return normalizeWB(data);
}

async function getGDP() {
  const url = 'https://api.worldbank.org/v2/country/IDN/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=50';
  const { data } = await axios.get(url);
  return normalizeWB(data);
}

async function getGDPValue() {
  const url = 'https://api.worldbank.org/v2/country/IDN/indicator/NY.GDP.MKTP.CD?format=json&per_page=50';
  const { data } = await axios.get(url);
  return normalizeWB(data);
}

async function fetchAndSavePDB() {
  try {
    // Hapus data lama dulu
    await supabase.from('pdb').delete().neq('id', 0);

    const [growthRows, valueRows] = await Promise.all([getGDP(), getGDPValue()]);

    if (!growthRows.length) return console.log('Data PDB kosong');

    // Merge dua dataset berdasarkan tahun
    const valueMap = {};
    valueRows.forEach(r => { valueMap[r.year] = r.value; });

    const insert = growthRows
      .filter(r => r.year >= 2000)
      .map(r => ({
        tahun: r.year,
        pertumbuhan_yoy: parseFloat(r.value.toFixed(2)),
        nilai_usd: valueMap[r.year] ? parseFloat((valueMap[r.year] / 1e9).toFixed(2)) : null
        // nilai_usd dalam miliar USD
      }));

    const { error } = await supabase.from('pdb').insert(insert);
    if (error) console.log('Error insert PDB:', error.message);
    else console.log('PDB berhasil disimpan:', insert.length, 'rows');

  } catch (err) {
    console.log('Fetch PDB error:', err.message);
  }
}

module.exports = { getInflation, getGDP, fetchAndSavePDB };