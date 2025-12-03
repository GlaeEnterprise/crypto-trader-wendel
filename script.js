const POLYGON_API_KEY = '0_U9BxlbmtxpZEnSKaZ2XCTJM8AcLy5b'; // Cadastre em polygon.io

const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { type: 'solid', color: '#0e0e0e' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#2a2e39', visible: true }, horzLines: { color: '#2a2e39', visible: true } },
  width: document.getElementById('chart').clientWidth,
  height: document.getElementById('chart').clientHeight - 120,
  timeScale: { borderColor: '#2a2e39' },
  priceScale: { borderColor: '#2a2e39' },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#758fbd' } },
});

// Séries principais + Stochastic
const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false });
const sma5 = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10 = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });
const stochK = chart.addLineSeries({ color: '#4b0082' }); // Stochastic %K
const stochD = chart.addLineSeries({ color: '#9370db' }); // %D

// Indicadores adicionais (RSI, MACD, BB)
const bbSeries = chart.addLineSeries({ color: '#ffd700' });
const bbUpper = chart.addLineSeries({ color: '#ff6b6b' });
const bbLower = chart.addLineSeries({ color: '#4ecdc4' });
const rsiSeries = chart.addLineSeries({ color: '#7b68ee' });
let macdLine, macdSignal; // Criados dinamicamente

let symbol = 'BTCUSDT';
let ws, klineWs;
let candles = [];
let balance = 1000;
let trades = [];
let entryPrice = null;
let entryTime = null;
let expirationTime = null;

// Sons
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-losing-2052.mp3');

// Funções de indicadores (incluindo Stochastic)
function calculateRSI(closes, period = 14) { /* Código RSI anterior */ }
function calculateMACD(closes) { /* Código MACD anterior */ }
function calculateEMA(prices, period) { /* Código EMA anterior */ }
function calculateBB(closes, period = 20, stdDev = 2) { /* Código BB anterior */ }

// Stochastic Oscillator (14,3,3)
function calculateStochastic(highs, lows, closes, kPeriod = 14, kSmooth = 3, dSmooth = 3) {
  const k = [];
  const d = [];
  for (let i = kPeriod; i < closes.length; i++) {
    let highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    let lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    let currentK = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
    k.push(currentK);
  }
  // Smooth %K e %D
  const smoothK = calculateEMA(k, kSmooth);
  const smoothD = calculateEMA(smoothK, dSmooth);
  return { k: smoothK, d: smoothD };
}

// Contador de vela
let nextCandleTime = 0;
function startCountdown() {
  setInterval(() => {
    const secondsLeft = Math.max(0, Math.floor(nextCandleTime - Date.now() / 1000));
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    document.getElementById('countdown').textContent = `Vela fecha em ${m}:${s}`;
    if (secondsLeft <= 0) loadCandles();
  }, 500);
}

// Carrega histórico (Polygon pra IBOV, Binance pra crypto)
async function loadCandles() {
  let apiUrl;
  if (symbol === 'IBOV') {
    const end = new Date();
    const start = new Date(end.getTime() - 200 * 60000); // 200 min atrás
    apiUrl = `https://api.polygon.io/v2/aggs/ticker/BVMF:IBOV/range/1/minute/${start.toISOString().slice(0,10)}/${end.toISOString().slice(0,10)}?apikey=${POLYGON_API_KEY}`;
  } else {
    apiUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`;
  }
  const res = await fetch(apiUrl);
  const data = await res.json();
  if (symbol === 'IBOV') {
    candles = data.results.map(d => ({
      time: d.t / 1000,
      open: d.o,
      high: d.h,
      low: d.l,
      close: d.c
    }));
  } else {
    candles = data.map(d => ({ time: d[0]/1000, open: +d[1], high: +d[2], low: +d[3], close: +d[4] }));
  }
  candleSeries.setData(candles);
  updateAllIndicators();
  nextCandleTime = candles[candles.length-1].time + 60;
  startCountdown();
}

// Atualiza TODOS os indicadores
function updateAllIndicators() {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  updateSMA();
  // RSI
  const rsi = calculateRSI(closes);
  rsiSeries.setData(closes.slice(-rsi.length).map((c,i) => ({ time: candles[candles.length - rsi.length + i].time, value: rsi[i] })));
  // MACD
  if (!macdLine) {
    macdLine = chart.addLineSeries({ color: '#00ff9d' });
    macdSignal = chart.addLineSeries({ color: '#ffaa00' });
  }
  const macd = calculateMACD(closes);
  macdLine.setData(macd.macd.map((m,i) => ({ time: candles[i + closes.length - macd.macd.length].time, value: m })));
  macdSignal.setData(macd.signal.map((s,i) => ({ time: candles[i + closes.length - macd.signal.length].time, value: s })));
  // BB
  const bb = calculateBB(closes);
  bbSeries.setData(bb.middle.map((m,i) => ({ time: candles[candles.length - bb.middle.length + i].time, value: m })));
  bbUpper.setData(bb.upper.map((u,i) => ({ time: candles[candles.length - bb.upper.length + i].time, value: u })));
  bbLower.setData(bb.lower.map((l,i) => ({ time: candles[candles.length - bb.lower.length + i].time, value: l })));
  // Stochastic
  const stoch = calculateStochastic(highs, lows, closes);
  stochK.setData(stoch.k.map((k,i) => ({ time: candles[candles.length - stoch.k.length + i].time, value: k })));
  stochD.setData(stoch.d.map((d,i) => ({ time: candles[candles.length - stoch.d.length + i].time, value: d })));
}

// WebSocket ticker (Polygon pra IBOV, Binance pra crypto)
function connectTicker() {
  if (ws) ws.close();
  if (symbol === 'IBOV') {
    ws = new WebSocket(`wss://socket.polygon.io/stocks/${POLYGON_API_KEY}`);
    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', params: POLYGON_API_KEY }));
    ws.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.ev === 'T' && d.sym === 'BVMF:IBOV') {
        const price = d.p;
        // Atualiza preço e vela como antes
        document.getElementById('price').textContent = `R$ ${price.toFixed(2)}`;
        // ... resto do código de update (change, last candle, etc.)
        const prev = candles[candles.length-1]?.close || price;
        const change = ((price - prev)/prev*100).toFixed(2);
        document.getElementById('change').textContent = `${change >= 0 ? '+' : ''}${change}%`;
        document.getElementById('change').style.color = change >= 0 ? '#00ff9d' : '#ff3366';
        const last = candles[candles.length-1];
        if (last) {
          last.close = price;
          last.high = Math.max(last.high, price);
          last.low = Math.min(last.low, price);
          candleSeries.update(last);
          updateAllIndicators();
        }
      }
    };
  } else {
    // Binance code como antes
    ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
    // ... resto como antes
  }
}

// Trade com markers nas velas (seta + timer)
function trade(type) {
  const amount = parseFloat(document.getElementById('amount').value) || 100;
  const price = candles[candles.length-1].close;
  const qty = amount / price;
  const now = new Date().toLocaleTimeString();
  const candleIndex = candles.length - 1;

  if (type === 'buy') {
    entryPrice = price;
    entryTime = now;
    expirationTime = new Date(Date.now() + 60000).toLocaleTimeString(); // 1min
    balance -= amount;
    buySound.play();
    // Marker na vela: seta verde com timer
    candleSeries.setMarkers([{
      time: candles[candleIndex].time,
      position: 'aboveBar',
      color: '#00ff9d',
      shape: 'arrowUp',
      text: `BUY ${now} | Exp: ${expirationTime}`
    }]);
  } else {
    if (entryPrice) {
      const pnl = (price - entryPrice) * qty;
      balance += amount + pnl;
      sellSound.play();
      // Marker na vela: seta vermelha com P&L
      candleSeries.setMarkers([{
        time: candles[candleIndex].time,
        position: 'belowBar',
        color: '#ff3366',
        shape: 'arrowDown',
        text: `SELL ${now} | P&L: $${pnl.toFixed(2)}`
      }]);
    } else {
      balance += amount;
    }
    entryPrice = null;
    entryTime = null;
    expirationTime = null;
  }

  trades.push({ 
    type: type.toUpperCase(), 
    price: price.toFixed(2), 
    qty: qty.toFixed(6), 
    entryTime, 
    expirationTime,
    pnl: type==='sell' ? (price - entryPrice)*qty : 0, 
    time: now 
  });
  updateTrades();
  document.getElementById('balance').textContent = `$${balance.toFixed(2)}`;
}

// Resto do código (updateTrades, eventos, init) como anterior, + toggle indicadores
document.getElementById('toggleIndicators').onclick = () => {
  const panel = document.querySelector('#chart .indicator-panel');
  panel.classList.toggle('active');
};

// Inicia
loadCandles();
connectTicker();
window.addEventListener('resize', () => chart.applyOptions({ width: document.getElementById('chart').clientWidth, height: document.getElementById('chart').clientHeight - 120 }));
