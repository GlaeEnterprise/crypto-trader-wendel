const POLYGON_API_KEY = 'demo'; // Troque pela tua chave Polygon em polygon.io (grátis pra start)

const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { type: 'solid', color: '#0e0e0e' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#2a2e39', visible: true }, horzLines: { color: '#2a2e39', visible: true } },
  width: document.getElementById('chart').clientWidth,
  height: document.getElementById('chart').clientHeight - 120,
  timeScale: { borderColor: '#2a2e39' },
  priceScale: { borderColor: '#2a2e39' },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#758fbd' } },
});

const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false });
const sma5 = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10 = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });
const stochK = chart.addLineSeries({ color: '#4b0082' });
const stochD = chart.addLineSeries({ color: '#9370db' });
const bbSeries = chart.addLineSeries({ color: '#ffd700' });
const bbUpper = chart.addLineSeries({ color: '#ff6b6b' });
const bbLower = chart.addLineSeries({ color: '#4ecdc4' });
const rsiSeries = chart.addLineSeries({ color: '#7b68ee' });
let macdLine, macdSignal;

let symbol = 'BTCUSDT';
let ws;
let candles = [];
let balance = 1000;
let trades = [];
let entryPrice = null;
let entryTime = null;
let expirationTime = null;
let markers = []; // Pra timers nas velas

const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-losing-2052.mp3');

// Funções de indicadores (completas e otimizadas)
function calculateRSI(closes, period = 14) {
  try {
    const rsi = [];
    for (let i = period; i < closes.length; i++) {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = closes[j] - closes[j-1];
        if (change > 0) gains += change;
        else losses -= change;
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
  } catch (e) { console.error('RSI error:', e); return []; }
}

function calculateEMA(prices, period) {
  try {
    const k = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i-1] * (1 - k));
    }
    return ema;
  } catch (e) { console.error('EMA error:', e); return []; }
}

function calculateMACD(closes) {
  try {
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macdLine = ema12.map((e, i) => e - ema26[i]);
    const signal = calculateEMA(macdLine, 9);
    return { macd: macdLine, signal };
  } catch (e) { console.error('MACD error:', e); return { macd: [], signal: [] }; }
}

function calculateBB(closes, period = 20, stdDev = 2) {
  try {
    const sma = [];
    for (let i = period - 1; i < closes.length; i++) {
      sma.push(closes.slice(i - period + 1, i + 1).reduce((a,b)=>a+b)/period);
    }
    const upper = [], lower = [];
    for (let i = 0; i < sma.length; i++) {
      const variance = closes.slice(i, i + period).reduce((a,b) => a + Math.pow(b - sma[i], 2), 0) / period;
      const deviation = Math.sqrt(variance);
      upper.push(sma[i] + stdDev * deviation);
      lower.push(sma[i] - stdDev * deviation);
    }
    return { middle: sma, upper, lower };
  } catch (e) { console.error('BB error:', e); return { middle: [], upper: [], lower: [] }; }
}

function calculateStochastic(highs, lows, closes, kPeriod = 14, kSmooth = 3, dSmooth = 3) {
  try {
    const k = [];
    for (let i = kPeriod; i < closes.length; i++) {
      let highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
      let lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
      let currentK = ((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100;
      k.push(currentK);
    }
    const smoothK = calculateEMA(k, kSmooth);
    const smoothD = calculateEMA(smoothK, dSmooth);
    return { k: smoothK, d: smoothD };
  } catch (e) { console.error('Stochastic error:', e); return { k: [], d: [] }; }
}

function updateSMA() {
  try {
    const closes = candles.map(c => c.close);
    const len = closes.length;
    const data5 = [], data10 = [];
    for (let i = 0; i < len; i++) {
      if (i >= 4) data5.push({ time: candles[i].time, value: closes.slice(i-4,i+1).reduce((a,b)=>a+b)/5 });
      if (i >= 9) data10.push({ time: candles[i].time, value: closes.slice(i-9,i+1).reduce((a,b)=>a+b)/10 });
    }
    sma5.setData(data5);
    sma10.setData(data10);
  } catch (e) { console.error('SMA error:', e); }
}

function updateAllIndicators() {
  try {
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
  } catch (e) { console.error('Indicators update error:', e); }
}

// Contador de vela
let nextCandleTime = 0;
function startCountdown() {
  setInterval(() => {
    const secondsLeft = Math.max(0, Math.floor(nextCandleTime - Date.now() / 1000));
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    document.getElementById('countdown').textContent = `Vela fecha em ${m}:${s}`;
  }, 500);
}

// Carrega histórico
async function loadCandles() {
  try {
    let apiUrl;
    if (symbol === 'IBOV') {
      apiUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBOV&interval=1min&apikey=demo&outputsize=compact`;
    } else {
      apiUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`;
    }
    const res = await fetch(apiUrl);
    const data = await res.json();
    if (symbol === 'IBOV') {
      candles = Object.entries(data['Time Series (1min)']).map(([time, values]) => ({
        time: new Date(time).getTime() / 1000,
        open: +values['1. open'],
        high: +values['2. high'],
        low: +values['3. low'],
        close: +values['4. close']
      })).reverse();
    } else {
      candles = data.map(d => ({ time: d[0]/1000, open: +d[1], high: +d[2], low: +d[3], close: +d[4] }));
    }
    candleSeries.setData(candles);
    updateAllIndicators();
    nextCandleTime = candles[candles.length-1].time + 60;
    startCountdown();
    updatePrice(candles[candles.length-1].close);
  } catch (e) { console.error('Load candles error:', e); alert('Erro ao carregar dados. Verifique conexão.'); }
}

// Update preço
function updatePrice(price) {
  const prev = candles[candles.length-2]?.close || price;
  const change = ((price - prev)/prev*100).toFixed(2);
  document.getElementById('price').textContent = `$${price.toFixed(2)}`;
  const changeEl = document.getElementById('change');
  changeEl.textContent = `${change >= 0 ? '+' : ''}${change}%`;
  changeEl.style.color = change >= 0 ? '#00ff9d' : '#ff3366';
}

// WebSocket ticker
function connectTicker() {
  if (ws) ws.close();
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
  ws.onmessage = e => {
    try {
      const d = JSON.parse(e.data);
      const price = parseFloat(d.c);
      updatePrice(price);
      const last = candles[candles.length-1];
      if (last) {
        last.close = price;
        last.high = Math.max(last.high, price);
        last.low = Math.min(last.low, price);
        candleSeries.update(last);
        updateAllIndicators();
      }
    } catch (e) { console.error('Ticker error:', e); }
  };
  ws.onerror = () => setTimeout(connectTicker, 5000); // Reconecta
}

// Trade com markers nas velas
function trade(type) {
  try {
    const amount = parseFloat(document.getElementById('amount').value) || 100;
    const price = candles[candles.length-1].close;
    const qty = amount / price;
    const now = new Date().toLocaleTimeString();
    const candleTime = candles[candles.length-1].time;

    if (type === 'buy') {
      entryPrice = price;
      entryTime = now;
      expirationTime = new Date(Date.now() + 60000).toLocaleTimeString();
      balance -= amount;
      buySound.play().catch(() => {});
      // Marker na vela
      markers.push({
        time: candleTime,
        position: 'aboveBar',
        color: '#00ff9d',
        shape: 'arrowUp',
        text: `BUY ${now} | Exp: ${expirationTime}`
      });
    } else {
      if (entryPrice) {
        const pnl = (price - entryPrice) * qty;
        balance += amount + pnl;
        sellSound.play().catch(() => {});
        markers.push({
          time: candleTime,
          position: 'belowBar',
          color: '#ff3366',
          shape: 'arrowDown',
          text: `SELL ${now} | P&L: $${pnl.toFixed(2)}`
        });
      } else {
        balance += amount;
      }
      entryPrice = null;
      entryTime = null;
      expirationTime = null;
    }

    candleSeries.setMarkers(markers);
    trades.push({ type: type.toUpperCase(), price: price.toFixed(2), qty: qty.toFixed(6), entryTime, expirationTime, pnl: type==='sell' ? (price - entryPrice)*qty : 0, time: now });
    updateTrades();
    document.getElementById('balance').textContent = `$${balance.toFixed(2)}`;
  } catch (e) { console.error('Trade error:', e); alert('Erro na operação.'); }
}

function updateTrades() {
  const list = document.getElementById('trades');
  list.innerHTML = trades.slice(-10).reverse().map(t => `
    <li>
      <span>${t.type} ${t.qty} @ $${t.price}</span>
      ${t.entryTime ? `<span class="timer">Entrada: ${t.entryTime} | Expira: ${t.expirationTime}</span>` : ''}
      ${t.pnl ? `<span class="${t.pnl>=0?'pnl-positive':'pnl-negative'}">P&L: $${t.pnl.toFixed(2)}</span>` : ''}
    </li>
  `).join('');
  const totalPnl = trades.filter(t=>t.pnl).reduce((s,t)=>s+t.pnl,0);
  document.getElementById('totalPnl').innerHTML = `P&L Total: <span style="color:${totalPnl>=0?'#00ff9d':'#ff3366'}">$${totalPnl.toFixed(2)}</span>`;
}

// Eventos
document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');
document.getElementById('toggleIndicators').onclick = () => {
  const panel = document.querySelector('#chart .indicator-panel');
  panel.classList.toggle('active');
};
document.getElementById('symbol').onchange = e => { symbol = e.target.value; candles=[]; loadCandles(); connectTicker(); };

// Inicia
loadCandles();
connectTicker();
window.addEventListener('resize', () => chart.applyOptions({ width: document.getElementById('chart').clientWidth, height: document.getElementById('chart').clientHeight - 120 }));
