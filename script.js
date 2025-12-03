const chartElement = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartElement, {
  width: chartElement.clientWidth,
  height: 580,
  layout: { backgroundColor: '#0f1620', textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  timeScale: { borderColor: '#334155' },
});

const candleSeries = chart.addCandlestickSeries({
  upColor: '#00ff9d', downColor: '#ff006e',
  borderUpColor: '#00ff9d', borderDownColor: '#ff006e',
  wickUpColor: '#00ff9d', wickDownColor: '#ff006e',
});

const sma5 = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10 = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });

let symbol = 'BTCUSDT';
let ws;
let candles = [];
let balance = 1000;
let trades = [];

// Sons profissionais
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-negative-answer-lose-2032.mp3');

// Preço ao vivo
function updatePrice(price) {
  const prev = candles[candles.length-2]?.close || price;
  const change = ((price - prev) / prev * 100).toFixed(2);
  document.getElementById('priceLive').innerHTML = `$${price.toFixed(2)} <span style="color:${change>=0?'#00ff9d':'#ff006e'}">${change>=0?'↑':'↓'} ${Math.abs(change)}%</span>`;
}

// Carrega histórico
async function load() {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`);
  const data = await res.json();
  candles = data.map(d => ({
    time: d[0] / 1000,
    open: +d[1], high: +d[2], low: +d[3], close: +d[4]
  }));
  candleSeries.setData(candles);
  updateSMA();
  updatePrice(candles[candles.length-1].close);
}

// WebSocket ao vivo
function connect() {
  if (ws) ws.close();
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    const price = parseFloat(d.c);
    updatePrice(price);
    if (candles.length > 0) {
      const last = candles[candles.length-1];
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      candleSeries.update(last);
      updateSMA();
    }
  };
}

function updateSMA() {
  const closes = candles.map(c => c.close);
  const s5 = closes.slice(-50).map((c,i,a) => i>=4 ? {time: candles[i+150].time, value: a.slice(i-4,i+1).reduce((x,y)=>x+y)/5} : null).filter(Boolean);
  const s10 = closes.slice(-50).map((c,i,a) => i>=9 ? {time: candles[i+150].time, value: a.slice(i-9,i+1).reduce((x,y)=>x+y)/10} : null).filter(Boolean);
  sma5.setData(s5);
  sma10.setData(s10);
}

// Trade
function trade(type) {
  const amount = parseFloat(document.getElementById('amount').value) || 100;
  if (amount < 10) return alert("Mínimo $10");
  const price = candles[candles.length-1].close;
  balance += type === 'buy' ? -amount : amount;
  trades.push({type: type.toUpperCase(), qty: (amount/price).toFixed(6), price: price.toFixed(2), time: new Date().toLocaleTimeString()});
  document.getElementById('balance').textContent = `$${balance.toFixed(2)}`;
  document.getElementById('tradesList').innerHTML = trades.slice(-8).reverse().map(t => 
    `<li style="color:${t.type==='BUY'?'#00ff9d':'#ff006e'}"><strong>${t.type}</strong> ${t.qty} @ $${t.price}</li>`
  ).join('');
  (type === 'buy' ? buySound : sellSound).play();
}

document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');
document.getElementById('symbol').onchange = (e) => {
  symbol = e.target.value;
  candles = [];
  load();
  connect();
};

// Responsivo
window.addEventListener('resize', () => chart.applyOptions({ width: chartElement.clientWidth }));

// Inicia
load();
connect();
document.body.onclick = () => {}, {once: true}; // Libera som
