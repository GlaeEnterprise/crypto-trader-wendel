const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

let chart = new Chart(ctx, {
  type: 'candlestick',
  data: {
    datasets: [
      {
        label: 'Preço',
        data: [],
        borderColor: '#00ff9d',
      },
      {
        type: 'line',
        label: 'SMA 5',
        data: [],
        borderColor: '#00ff9d',
        borderWidth: 2,
        fill: false,
        tension: 0
      },
      {
        type: 'line',
        label: 'SMA 10',
        data: [],
        borderColor: '#ffaa00',
        borderWidth: 2,
        fill: false,
        tension: 0
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'time', time: { unit: 'minute' } },
      y: { beginAtZero: false }
    }
  }
});

let candles = [];
let currentSymbol = 'BTCUSDT';
let socket;
let balance = 1000;
let trades = [];

// Carrega histórico
async function loadData() {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=1m&limit=100`);
  const data = await res.json();
  candles = data.map(d => ({
    x: new Date(d[0]),
    o: parseFloat(d[1]),
    h: parseFloat(d[2]),
    l: parseFloat(d[3]),
    c: parseFloat(d[4])
  }));
  updateChart();
}

// WebSocket ao vivo
function startWebSocket() {
  if (socket) socket.close();
  socket = new WebSocket(`wss://stream.binance.com:9443/ws/${currentSymbol.toLowerCase()}@kline_1m`);

  socket.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (!msg.k || !msg.k.x) return;
    const k = msg.k;
    const nova = {
      x: new Date(k.t),
      o: parseFloat(k.o),
      h: parseFloat(k.h),
      l: parseFloat(k.l),
      c: parseFloat(k.c)
    };

    const ultimo = candles[candles.length - 1];
    if (ultimo && ultimo.x.getTime() === nova.x.getTime()) {
      candles[candles.length - 1] = nova;
    } else {
      candles.push(nova);
      if (candles.length > 100) candles.shift();
    }
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

// Buy / Sell
document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');

function trade(tipo) {
  const valor = parseFloat(document.getElementById('amount').value);
  if (!valor || valor < 10) return alert('Digite pelo menos $10');
  if (candles.length === 0) return alert('Aguarde carregar...');

  const preco = candles[candles.length-1].c;
  const qty = (valor / preco).toFixed(6);
  balance += tipo === 'buy' ? -valor : valor;

  trades.push({ tipo: tipo.toUpperCase(), qty, preco: preco.toFixed(2), valor, time: new Date().toLocaleString() });
  document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;
  updateTrades();
}

function updateTrades() {
  document.getElementById('trades').innerHTML = trades.slice(-10).reverse().map(t => 
    `<li style="color:${t.tipo==='BUY'?'#00ff9d':'#ff006e'}"><strong>${t.tipo}</strong> ${qty} ${currentSymbol.replace('USDT','')} @ $${t.preco}</li>`
  ).join('');
}

// Troca de moeda
document.getElementById('symbol').onchange = (e) => {
  currentSymbol = e.target.value;
  candles = [];
  loadData();
  startWebSocket();
};

// Inicia tudo
loadData();
startWebSocket();
