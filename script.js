const chart = LightweightCharts.createChart(document.getElementById('chart'), {
  layout: { background: { type: 'solid', color: '#0e0e0e' }, textColor: '#d1d4dc' },
  grid: { vertLines: { color: '#2a2e39', visible: true }, horzLines: { color: '#2a2e39', visible: true } },
  width: document.getElementById('chart').clientWidth,
  height: document.getElementById('chart').clientHeight - 120, // Espaço pra painel indicadores
  timeScale: { borderColor: '#2a2e39' },
  priceScale: { borderColor: '#2a2e39' },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal, vertLine: { color: '#758fbd' } },
});

// Séries principais
const candleSeries = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', wickUpColor: '#26a69a', wickDownColor: '#ef5350', borderVisible: false });
const sma5 = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10 = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });

// Indicadores adicionais (máximo pro trader: RSI, MACD, BB)
const bbSeries = chart.addLineSeries({ color: '#ffd700' }); // BB middle
const bbUpper = chart.addLineSeries({ color: '#ff6b6b' }); // BB upper
const bbLower = chart.addLineSeries({ color: '#4ecdc4' }); // BB lower
const rsiSeries = chart.addLineSeries({ color: '#7b68ee' }); // RSI linha

let symbol = 'BTCUSDT';
let ws, klineWs;
let candles = [];
let balance = 1000;
let trades = [];
let entryPrice = null;
let entryTime = null;
let expirationTime = null; // Expiração em 1min pra trade

// Sons
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-losing-2052.mp3');

// Função pra calcular RSI (14 períodos)
function calculateRSI(closes, period = 14) {
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
}

// Função pra MACD (12,26,9)
function calculateMACD(closes) {
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdLine = ema12.map((e, i) => e - ema26[i]);
  const signal = calculateEMA(macdLine, 9);
  return { macd: macdLine, signal };
}

function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  const ema = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[i-1] * (1 - k));
  }
  return ema;
}

// Função pra Bollinger Bands (20 períodos, 2 desvios)
function calculateBB(closes, period = 20, stdDev = 2) {
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

// Carrega histórico (suporte IBOV via Alpha Vantage free – insira sua chave se tiver)
async function loadCandles() {
  let apiUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=200`;
  if (symbol === 'IBOV') {
    apiUrl = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBOV&interval=1min&apikey=demo&outputsize=compact`; // Demo key; troque pela sua
  }
  const res = await fetch(apiUrl);
  const data = await res.json();
  if (symbol === 'IBOV') {
    // Converte Alpha Vantage pra candles
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
}

// Atualiza TODOS os indicadores
function updateAllIndicators() {
  const closes = candles.map(c => c.close);
  // SMA já tem
  updateSMA();
  // RSI
  const rsi = calculateRSI(closes);
  rsiSeries.setData(closes.slice(-rsi.length).map((c,i) => ({ time: candles[candles.length - rsi.length + i].time, value: rsi[i] })));
  // MACD
  const macd = calculateMACD(closes);
  // Adiciona séries MACD se não existir (linha, signal)
  if (!window.macdLine) window.macdLine = chart.addLineSeries({ color: '#00ff9d' });
  if (!window.macdSignal) window.macdSignal = chart.addLineSeries({ color: '#ffaa00' });
  window.macdLine.setData(macd.macd.map((m,i) => ({ time: candles[i + closes.length - macd.macd.length].time, value: m })));
  window.macdSignal.setData(macd.signal.map((s,i) => ({ time: candles[i + closes.length - macd.signal.length].time, value: s })));
  // BB
  const bb = calculateBB(closes);
  bbSeries.setData(bb.middle.map((m,i) => ({ time: candles[candles.length - bb.middle.length + i].time, value: m })));
  bbUpper.setData(bb.upper.map((u,i) => ({ time: candles[candles.length - bb.upper.length + i].time, value: u })));
  bbLower.setData(bb.lower.map((l,i) => ({ time: candles[candles.length - bb.lower.length + i].time, value: l })));
}

// WebSocket ticker
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

    const last = candles[candles.length-1];
    if (last) {
      last.close = price;
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      candleSeries.update(last);
      updateAllIndicators();
    }
  };
}

// Trade com timers (entrada, expiração 1min)
function trade(type) {
  const amount = parseFloat(document.getElementById('amount').value) || 100;
  const price = candles[candles.length-1].close;
  const qty = amount / price;
  const now = new Date().toLocaleTimeString();

  if (type === 'buy') {
    entryPrice = price;
    entryTime = now;
    expirationTime = new Date(Date.now() + 60000).toLocaleTimeString(); // 1min
    balance -= amount;
    buySound.play();
  } else {
    if (entryPrice) {
      const pnl = (price - entryPrice) * qty;
      balance += amount + pnl;
      sellSound.play();
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

// Atualiza trades com timers
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
document.getElementById('symbol').onchange = e => { symbol = e.target.value; candles=[]; loadCandles(); connectTicker(); };

// Inicia
loadCandles();
connectTicker();
window.addEventListener('resize', () => chart.applyOptions({ width: document.getElementById('chart').clientWidth, height: document.getElementById('chart').clientHeight - 120 }));
