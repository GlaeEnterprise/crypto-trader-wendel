// Canvas e contexto
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');

// Sons (arquivos públicos que funcionam)
const buySound = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+Dyvmwh'); // Som curto de coin
const sellSound = new Audio('data:audio/wav;base64,UklGRl0GAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+Dyvmwh'); // Som de alerta

// Preço grande
const priceBox = document.createElement('div');
priceBox.style.cssText = 'position:fixed;top:10px;right:10px;font-size:48px;font-weight:bold;padding:15px;border-radius:10px;background:rgba(0,0,0,0.8);color:#00ff9d;z-index:999;border:2px solid #00ff9d;';
document.body.appendChild(priceBox);

// Gráfico simples (linha + barras para velas)
let prices = [];
let currentPrice = 0;
let symbol = 'BTCUSDT';

// Carrega histórico
async function loadHistory() {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&limit=50`);
    const data = await res.json();
    prices = data.map(d => parseFloat(d[4])); // Closes
    drawChart();
    currentPrice = prices[prices.length - 1];
    updatePrice();
  } catch (e) { console.error(e); }
}

// WebSocket para ticks ao vivo (segundo a segundo)
let ws;
function connectLive() {
  ws = new WebSocket(`wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@ticker`);
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    currentPrice = parseFloat(data.c);
    prices.push(currentPrice);
    if (prices.length > 50) prices.shift();
    updatePrice();
    drawChart();
  };
  ws.onerror = () => setTimeout(connectLive, 3000);
}

// Desenha gráfico (velas simuladas com barras)
function drawChart() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const w = canvas.width / prices.length;
  prices.forEach((p, i) => {
    const x = i * w;
    const prev = prices[i-1] || p;
    const color = p >= prev ? '#00ff9d' : '#ff006e';
    
    // Vela (barra)
    ctx.fillStyle = color;
    ctx.fillRect(x, canvas.height - p * 0.001, w * 0.8, (p * 0.001) - canvas.height / 2); // Escala simples
    
    // Linha SMA 5
    if (i >= 4) {
      const sma5 = prices.slice(i-4, i+1).reduce((a,b)=>a+b)/5;
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo((i-1)*w, canvas.height - sma5 * 0.001);
      ctx.lineTo(x, canvas.height - sma5 * 0.001);
      ctx.stroke();
    }
  });
}

// Atualiza preço
function updatePrice() {
  const change = prices.length > 1 ? ((currentPrice - prices[prices.length-2]) / prices[prices.length-2] * 100).toFixed(2) : 0;
  priceBox.innerHTML = `$${currentPrice.toFixed(2)}<br><small style="color:${change >= 0 ? '#00ff9d' : '#ff006e'}">${change >= 0 ? '+' : ''}${change}%</small>`;
  priceBox.style.color = change >= 0 ? '#00ff9d' : '#ff006e';
  priceBox.style.borderColor = change >= 0 ? '#00ff9d' : '#ff006e';
}

// Trade com som
function doTrade(type) {
  const amount = parseFloat(document.getElementById('amount').value) || 100;
  if (amount < 10) return alert('Mínimo $10');
  if (!currentPrice) return alert('Aguarde preço...');

  balance += type === 'buy' ? -amount : +amount;
  const qty = amount / currentPrice;
  trades.push({type, qty: qty.toFixed(6), price: currentPrice.toFixed(2), amount, time: new Date().toLocaleString()});
  document.getElementById('balance').textContent = `Saldo: $${balance.toFixed(2)}`;
  updateHistory();

  // Som
  const sound = type === 'buy' ? buySound : sellSound;
  sound.volume = 0.5;
  sound.play().catch(() => { /* Ignora se bloqueado */ });
}

// Atualiza histórico
function updateHistory() {
  const list = document.getElementById('trades');
  list.innerHTML = trades.slice(-5).map(t => `<li style="color:${t.type==='buy'?'#00ff9d':'#ff006e'}">${t.type.toUpperCase()}: ${t.qty} ${symbol} @ $${t.price} ($${t.amount})</li>`).join('');
}

// Eventos
document.getElementById('buy').onclick = () => doTrade('buy');
document.getElementById('sell').onclick = () => doTrade('sell');
document.getElementById('symbol').onchange = (e) => {
  symbol = e.target.value;
  prices = [];
  loadHistory();
  if (ws) ws.close();
  connectLive();
};

// Inicia
let balance = 1000;
let trades = [];
loadHistory();
connectLive();

// Clique inicial para áudio
document.addEventListener('click', () => {}, {once: true});
