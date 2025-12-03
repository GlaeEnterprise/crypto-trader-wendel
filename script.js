const chartElement = document.getElementById('chart');
const chart = LightweightCharts.createChart(chartElement, {
  width: chartElement.clientWidth,
  height: 500,
  layout: { backgroundColor: '#1e293b', textColor: '#ddd' },
  grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
  crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
  timeScale: { timeVisible: true, secondsVisible: true },
});

const candlestickSeries = chart.addCandlestickSeries({
  upColor: '#00ff9d', downColor: '#ff006e', borderVisible: false
});

const sma5Series = chart.addLineSeries({ color: '#00ff9d', lineWidth: 2 });
const sma10Series = chart.addLineSeries({ color: '#ffaa00', lineWidth: 2 });

let currentSymbol = 'btcusdt';
let socket;
let candles = [];
let balance = 1000;
let trades = [];

// Conecta ao WebSocket da Binance (100% ao vivo)
function connectWebSocket(symbol = 'btcusdt') {
  if (socket) socket.close();

  const wsUrl = `wss://stream.binance.com:9443/ws/${symbol}@kline_1m`;
  socket = new WebSocket(wsUrl);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (!data.k) return;

    const k = data.k;
    if (!k.x) return; // só processa vela fechada

    const candle = {
      time: k.t / 1000,      // timestamp em segundos
      open: parseFloat(k.o),
      high: parseFloat(k.h),
      low: parseFloat(k.l),
      close: parseFloat(k.c)
    };

    candles.push(candle);
    if (candles.length > 100) candles.shift(); // mantém só as últimas 100

    candlestickSeries.setData(candles);

    // Calcula e atualiza SMAs
    updateSMAs();
  };
}

// Calcula médias móveis
function updateSMAs() {
  if (candles.length < 10) return;
  
  const closes = candles.map(c => c.close);
  
  sma5Series.setData(candles.map((c,i) => ({
    time: c.time,
    value: i >= 4 ? closes.slice(i-4, i+1).reduce((a,b)=>a+b)/5 : null
  })).filter(d => d.value !== null));

  sma10Series.setData(candles.map((c,i) => ({
    time: c.time,
    value: i >= 9 ? closes.slice(i-9, i+1).reduce((a,b)=>a+b)/10 : null
  })).filter(d => d.value !== null));
}

// Botões Buy e Sell
document.getElementById('buy').onclick = () => makeTrade('buy');
document.getElementById('sell').onclick = () => makeTrade('sell');

function makeTrade(type) {
  const amount = parseFloat(document.getElementById('amount').value);
  if (!amount || amount < 10) return alert("Digite um valor válido (mínimo $10)");

  const price = candles[candles.length-1]?.close || 0;
  const qty = amount / price;

  balance += type === 'buy' ? -amount : +amount;

  trades.push({
    type: type.toUpperCase(),
    symbol: currentSymbol.toUpperCase(),
    price,
    qty: qty.toFixed(6),
    total: amount,
    time: new Date().toLocaleString()
  });

  updateHistory();
  document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;
}

// Atualiza histórico
function updateHistory() {
  const list = document.getElementById('trades');
  list.innerHTML = '';
  trades.slice(-10).reverse().forEach(t => {
    const li = document.createElement('li');
    li.style.color = t.type === 'BUY' ? '#00ff9d' : '#ff006e';
    li.innerHTML = `<strong>${t.type}</strong> ${t.qty} ${t.symbol.replace('USDT','')} a $${t.price.toFixed(2)} → $${t.total}`;
    list.appendChild(li);
  });
}

// Troca de cripto
document.getElementById('symbol').onchange = (e) => {
  currentSymbol = e.target.value;
  candles = [];
  candlestickSeries.setData([]);
  sma5Series.setData([]);
  sma10Series.setData([]);
  connectWebSocket(currentSymbol);
};

// Inicia tudo
connectWebSocket();
document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;

// Resize chart on window resize
window.addEventListener('resize', () => {
  chart.applyOptions({ width: chartElement.clientWidth });
});
