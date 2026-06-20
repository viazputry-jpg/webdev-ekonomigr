const axios = require('axios');

// helper normalize
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

// INFLASI INDONESIA
async function getInflation() {
  const url =
    'https://api.worldbank.org/v2/country/IDN/indicator/FP.CPI.TOTL.ZG?format=json';

  const { data } = await axios.get(url);
  return normalizeWB(data);
}

// GDP GROWTH
async function getGDP() {
  const url =
    'https://api.worldbank.org/v2/country/IDN/indicator/NY.GDP.MKTP.KD.ZG?format=json';

  const { data } = await axios.get(url);
  return normalizeWB(data);
}

module.exports = {
  getInflation,
  getGDP
};