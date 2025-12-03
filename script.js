const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

// Sons
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-coin-win-notification-1939.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-arcade-game-jump-coin-216.mp3');

// Elemento pra mostrar preço atual grande
const priceDisplay = document.createElement('div');
priceDisplay.style.position = 'absolute';
priceDisplay.style.top = '80px';
priceDisplay.style.right = '20px';
priceDisplay.style.fontSize = '32px';
priceDisplay.style.fontWeight = 'bold';
priceDisplay.style.color = '#00ff9d';
priceDisplay.style.background = 'rgba(0,0,0,0.6)';
priceDisplay.style.padding = '10px 20px';
priceDisplay.style.borderRadius = '12px';
priceDisplay.style.zIndex = '10';
document.querySelector('.container').style.position = 'relative';
document.querySelector('.container').appendChild(priceDisplay);

let chart = new Chart(ctx, {
  type: 'candlestick',
  data: { datasets: [
    { label: 'Preço', data: [] },
    { type: 'line', label: 'SMA 5', data: [], borderColor: '#00ff9d', borderWidth: 2, fill: false },
    { type: 'line', label: 'SMA 10', data: [], borderColor: '#ffaa00', borderWidth: 2, fill: false }
  ]},
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: { x: { type: 'time', time: { unit: 'minute' } } }
  }
});

let candles = [];
let currentSymbol = 'BTCUSDT';
let socket;
let balance = 1000;
let trades = [];
let currentPrice = 0;

// Atualiza preço grande na tela
function updatePriceDisplay() {
  if (currentPrice > 0) {
    const change = candles.length > 1 ? ((currentPrice - candles[candles.length-2].c) / candles[candles.length-2].c * 100) : 0;
    priceDisplay.style.color = change >= 0 ? '#00ff9d' : '#ff006e';
    priceDisplay.textContent = `$${currentPrice.toFixed(2)} ${change.toFixed(2)}%`;
  }
}

// HISTÓRICO + PREÇO EM SEGUNDO A SEGUNDO
async function loadData() {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=1m&limit=100`);
  const data = await res.json();
  candles = data.map(d => ({
    x: d[0],
    o: parseFloat(d[1]),
    h: parseFloat(d[2]),
    l: parseFloat(d[3]),
    c: parseFloat(d[4])
  }));
  currentPrice = candles[candles.length-1].c;
  updatePriceDisplay();
  updateChart();
}

// WEBSOCKET COM TICKER (atualiza preço a cada segundo!)
function startTickerWebSocket() {
  if (socket) socket.close();
  socket = new WebSocket(`wss://stream.binance.com:9443/ws/${currentSymbol.toLowerCase()}@ticker`);

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    currentPrice = parseFloat(data.c);
    updatePriceDisplay();

    // Atualiza a última vela com preço em tempo real
    if (candles.length > 0) {
      const last = candles[candles.length - 1];
      last.c = currentPrice;
      last.h = Math.max(last.h, currentPrice);
      last.l = Math.min(last.l, currentPrice);
      updateChart();
    }
  };
}

// WebSocket das velas de 1 minuto (mantém histórico)
function startKlineWebSocket() {
  const klineSocket = new WebSocket(`wss://stream.binance.com:9443/ws/${currentSymbol.toLowerCase()}@kline_1m`);
  klineSocket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.k || !msg.k.x) return;
    const k = msg.k;
    const nova = { x: k.t, o: parseFloat(k.o), h: parseFloat(k.h), l: parseFloat(k.l), c: parseFloat(k.c) };
    
    const ultimo = candles[candles.length - 1];
    if (ultimo && ultimo.x === nova.x) {
      candles[candles.length - 1] = nova;
    } else {
      candles.push(nova);
      if (candles.length > 100) candles.shift();
    }
    currentPrice = nova.c;
    updatePriceDisplay();
    updateChart();
  };
}

function updateChart() {
  chart.data.datasets[0].data = candles;
  const closes = candles.map(c => c.c);
  const sma5 = [], sma10 = [];
  for (let i = 0; i < closes.length; i++) {
    if (i >= 4) sma5.push({ x: candles[i].x, y: closes.slice(i-4, i+1).reduce((a,b)=>a+b)/5 });
    if (i >= 9) sma10.push({ x: candles[i].x, y: closes.slice(i-9, i+1).reduce((a,b)=>a+b)/10 });
  }
  chart.data.datasets[1].data = sma5;
  chart.data.datasets[2].data = sma10;
  chart.update('quiet');
}

// BUY / SELL COM SOM
document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');

function trade(tipo) {
  const valor = parseFloat(document.getElementById('amount').value || 0);
  if (valor < 10) return alert('Mínimo $10');
  if (!currentPrice) return alert('Aguarde carregar...');

  const qty = (valor / currentPrice).toFixed(6);
  balance += tipo === 'buy' ? -valor : valor;

  // TOCA O SOM!
  if (tipo === 'buy') buySound.play();
  else sellSound.play();

  trades.push({ 
    tipo: tipo.toUpperCase(), 
    qty, 
    preco: currentPrice.toFixed(2), 
    valor, 
    time: new Date().toLocaleTimeString() 
  });

  document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;
  updateTrades();
}

function updateTrades() {
  document.getElementById('trades').innerHTML = trades.slice(-10).reverse().map(t => 
    `<li style="color:${t.tipo==='BUY'?'#00ff9d':'#ff006e'}">
      <strong>${t.tipo}</strong> ${t.qty} ${currentSymbol.replace('USDT','')} @ $${t.preco}
    </li>`
  ).join('');
}

// TROCA DE CRIPTO
document.getElementById('symbol').onchange = (e) => {
  currentSymbol = e.target.value;
  candles = [];
  loadData();
  startTickerWebSocket();
  startKlineWebSocket();
};

// INICIA TUDO
loadData();
startTickerWebSocket();   // ← preço em segundo a segundo
startKlineWebSocket();    // ← velas novas
