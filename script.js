const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

// Sons que funcionam em celular e desktop
const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-negative-answer-lose-2032.mp3');

// Preço atual grande e bonito
const priceBox = document.createElement('div');
priceBox.style.cssText = `
  position: absolute;
  top: 70px; right: 20px;
  font-size: 36px; font-weight: bold;
  padding: 12px 24px;
  border-radius: 16px;
  background: rgba(0,0,0,0.7);
  backdrop-filter: blur(10px);
  border: 2px solid #333;
  z-index: 100;
  transition: all 0.3s;
`;
document.querySelector('.container').style.position = 'relative';
document.querySelector('.container').appendChild(priceBox);

let chart = new Chart(ctx, {
  type: 'candlestick',
  data: { datasets: [
    {
      label: 'Preço',
      data: [],
      borderColor: 'rgba(0,255,150,1)',
      backgroundColor: (context) => {
        const index = context.dataIndex;
        const value = context.dataset.data[index];
        return value?.o < value?.c ? 'rgba(0,255,150,0.8)' : 'rgba(255,0,110,0.8)';
      }
    },
    { type: 'line', label: 'SMA 5', data: [], borderColor: '#00ff9d', borderWidth: 3, fill: false, tension: 0.2 },
    { type: 'line', label: 'SMA 10', data: [], borderColor: '#ffaa00', borderWidth: 3, fill: false, tension: 0.2 }
  ]},
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
    scales: {
      x: { type: 'time', time: { unit: 'minute' }, grid: { color: '#334155' } },
      y: { grid: { color: '#334155' } }
    }
  }
});

let candles = [];
let currentSymbol = 'BTCUSDT';
let socketTicker, socketKline;
let balance = 1000;
let trades = [];

// Atualiza preço grande
function updatePrice(price) {
  const change = candles.length > 1 ? ((price - candles[candles.length-2].c) / candles[candles.length-2].c * 100).toFixed(2) : 0;
  priceBox.innerHTML = `
    <div style="font-size:48px">$${price.toFixed(2)}</div>
    <div style="font-size:20px; color:${change >= 0 ? '#00ff9d' : '#ff006e'}">
      ${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}%
    </div>
  `;
  priceBox.style.borderColor = change >= 0 ? '#00ff9d' : '#ff006e';
}

// Carrega histórico
async function loadData() {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol}&interval=1m&limit=100`);
  const data = await res.json();
  candles = data.map(d => ({ x: d[0], o: +d[1], h: +d[2], l: +d[3], c: +d[4] }));
  updateChart();
  updatePrice(candles[candles.length-1].c);
}

// Ticker em tempo real (segundo a segundo)
function startTicker() {
  if (socketTicker) socketTicker.close();
  socketTicker = new WebSocket(`wss://stream.binance.com:9443/ws/${currentSymbol.toLowerCase()}@ticker`);
  socketTicker.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const price = parseFloat(data.c);
    if (candles.length > 0) {
      const last = candles[candles.length-1];
      last.c = price;
      last.h = Math.max(last.h, price);
      last.l = Math.min(last.l, price);
      updateChart();
      updatePrice(price);
    }
  };
}

// Nova vela de 1 minuto
function startKline() {
  if (socketKline) socketKline.close();
  socketKline = new WebSocket(`wss://stream.binance.com:9443/ws/${currentSymbol.toLowerCase()}@kline_1m`);
  socketKline.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (!msg.k?.x) return;
    const k = msg.k;
    const nova = { x: k.t, o: +k.o, h: +k.h, l: +k.l, c: +k.c };
    const ultimo = candles[candles.length-1];
    if (ultimo && ultimo.x === nova.x) {
      candles[candles.length-1] = nova;
    } else {
      candles.push(nova);
      if (candles.length > 100) candles.shift();
    }
    updateChart();
    updatePrice(nova.c);
  };
}

function updateChart() {
  chart.data.datasets[0].data = candles;
  const closes = candles.map(c => c.c);
  const sma5 = closes.slice(-100).map((_, i, arr) => i >= 4 ? { x: candles[i].x, y: arr.slice(i-4, i+1).reduce((a,b)=>a+b)/5 } : null).filter(Boolean);
  const sma10 = closes.slice(-100).map((_, i, arr) => i >= 9 ? { x: candles[i].x, y: arr.slice(i-9, i+1).reduce((a,b)=>a+b)/10 } : null).filter(Boolean);
  chart.data.datasets[1].data = sma5;
  chart.data.datasets[2].data = sma10;
  chart.update('quiet');
}

// Trade com SOM GARANTIDO
function trade(tipo) {
  const valor = parseFloat(document.getElementById('amount').value || 0);
  if (valor < 10) return alert('Mínimo $10');
  const preco = candles[candles.length-1]?.c || 0;
  if (!preco) return alert('Aguarde o preço carregar');

  const qty = (valor / preco).toFixed(6);
  balance += tipo === 'buy' ? -valor : valor;

  // SOM GARANTIDO
  (tipo === 'buy' ? buySound : sellSound).play().catch(() => console.log("Som bloqueado (clique na tela primeiro)"));

  trades.push({ tipo: tipo.toUpperCase(), qty, preco: preco.toFixed(2), valor, time: new Date().toLocaleTimeString() });
  document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;
  updateTrades();
}

function updateTrades() {
  document.getElementById('trades').innerHTML = trades.slice(-10).reverse().map(t =>
    `<li style="color:${t.tipo==='BUY'?'#00ff9d':'#ff006e'};padding:10px 0">
      <strong>${t.tipo}</strong> ${t.qty} ${currentSymbol.replace('USDT','')} @ $${t.preco} → $${t.valor}
    </li>`
  ).join('');
}

document.getElementById('buy').onclick = () => trade('buy');
document.getElementById('sell').onclick = () => trade('sell');

document.getElementById('symbol').onchange = (e) => {
  currentSymbol = e.target.value;
  candles = [];
  loadData();
  startTicker();
  startKline();
};

// Primeiro clique libera o som (obrigatório em navegadores)
document.body.addEventListener('click', () => {}, { once: true });

// INICIA
loadData();
startTicker();
startKline();
