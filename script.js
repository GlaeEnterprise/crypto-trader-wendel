const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { backgroundColor: '#0e0e0e', textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#2a2e39' }, horzLines: { color: '#2a2e39' } },
  width: document.getElementById('chart').clientWidth,
  height: document.getElementById('chart').clientHeight,
  timeScale: { borderColor: '#2a2e39' },
});

const candleSeries = chart.addCandlestickSeries({ upColor: '#00ff9d', downColor: '#ff3366', wickUpColor: '#00ff9d', wickDownColor: '#ff3366' });
const sma5 = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10 = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });

let symbol = 'BTCUSDT';
let ws, klineWs;
let candles = [];
let balance = 1000;
let trades = [];
let entryPrice = null;

// Sons
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-losing-2052.mp3');

// Contador da vela atual
let nextCandleTime = 0;
function startCountdown() {
  const interval = setInterval(() => {
    const secondsLeft = Math.max(0, Math.floor((nextCandleTime - Date.now() / 1000)));
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    document.getElementById('countdown').textContent = `${m}:${s}`;
    if (secondsLeft <= 0) loadCandles();
  }, 500);
}

// Carrega histórico + define próxima vela
async function loadCandles() {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`);
  const data = await res.json();
  candles = data.map(d => ({ time: d[0]/1000, open: +d[1], high: +d[2], low: +d[3], close: +d[4] }));
  candleSeries.setData(candles);
  updateSMA();
  nextCandleTime = candles[candles.length-1].time + 60;
  startCountdown();
}

// WebSocket ticker (preço ao vivo)
function connectTicker() {
  if (ws) ws.close();
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
  ws.onmessage = e => {
    const d = JSON.parse(e.data);
    const price = parseFloat(d.c);
    document.getElementById('price').textContent = `$${price.toFixed(2)}`;
    
    const prev = candles[candles.length-1]?.close || price;
    const change = ((price - prev)/prev*100).toFixed(2);
    const changeEl = document.getElementById('change');
    changeEl.textContent = `${change >= 0 ? '+' : ''}${change}%`;
    changeEl.style.color = change >= 0 ? '#00ff9d' : '#ff3366';

    // Atualiza vela atual
    const last = candles[candles.length-1];
    if (last) {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      candleSeries.update(last);
      updateSMA();
    }
  };
}

// SMA
function updateSMA() {
  const closes = candles.map(c => c.close);
  const len = closes.length;
  const data5 = [], data10 = [];
  for (let i = 0; i < len; i++) {
    if (i >= 4) data5.push({ time: candles[i].time, value: closes.slice(i-4,i+1).reduce((a,b)=>a+b)/5 });
    if (i >= 9) data10.push({ time: candles[i].time, value: closes.slice(i-9,i+1).reduce((a,b)=>a+b)/10 });
  }
  sma5.setData(data5);
  sma10.setData(data10);
}

// Trade com P&L
function trade(type) {
  const amount = parseFloat(document.getElementById('amount').value) || 100;
  const price = candles[candles.length-1].close;
  const qty = amount / price;

  if (type === 'buy') {
    entryPrice = price;
    balance -= amount;
  } else {
    if (entryPrice) {
      const pnl = (price - entryPrice) * qty;
      balance += amount + pnl;
    } else {
      balance += amount;
    }
    entryPrice = null;
  }

  trades.push({ type: type.toUpperCase(), price, qty: qty.toFixed(6), pnl: type==='sell' ? (price - entryPrice)*qty : 0, time: new Date().toLocaleTimeString() });
  updateTrades();
  document.getElementById('balance').textContent = `$${balance.toFixed(2)}`;
  (type==='buy' ? buySound : sellSound).play();
}

function updateTrades() {
  const list = document.getElementById('trades');
  list.innerHTML = trades.slice(-10).reverse().map(t => `
    <li>
      <span>${t.type} ${t.qty} @ $${t.price.toFixed(2)}</span>
      ${t.type==='SELL' ? `<span class="${t.pnl>=0?'pnl-positive':'pnl-negative'}">P&L: $${t.pnl.toFixed(2)}</span>` : ''}
    </li>
  `).join('');
  const totalPnl = trades.filter(t=>t.type==='SELL').reduce((s,t)=>s+t.pnl,0);
  const pnlEl = document.getElementById('totalPnl');
  pnlEl.innerHTML = `P&L Total: <span style="color:${totalPnl>=0?'#00ff9d':'#ff3366'}">$${totalPnl.toFixed(2)}</span>`;
}

// Eventos
document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');
document.getElementById('symbol').onchange = e => { symbol = e.target.value; candles=[]; loadCandles(); connectTicker(); };

// Inicia
loadCandles();
connectTicker();
window.addEventListener('resize', () => chart.applyOptions({ width: document.getElementById('chart').clientWidth, height: document.getElementById('chart').clientHeight }));
