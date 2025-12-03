window.onload = () => {
  const POLYGON_API_KEY = 'demo'; // Troque pela tua em polygon.io

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
  let macdLine = chart.addLineSeries({ color: '#00ff9d' });
  let macdSignal = chart.addLineSeries({ color: '#ffaa00' });

  let symbol = 'BTCUSDT';
  let ws;
  let candles = [];
  let balance = 1000;
  let trades = [];
  let entryPrice = null;
  let entryTime = null;
  let expirationTime = null;
  let lastUpdateTime = 0;
  const UPDATE_THROTTLE = 500; // Otimização: atualiza a cada 500ms

  const buySound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
  const sellSound = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-losing-2052.mp3');

  // Funções de indicadores (otimizadas pra delta)
  function calculateRSI(closes, period = 14) {
    const rsi = [];
    const gains = [], losses = [];
    for (let i = 1; i < closes.length; i++) {
      const change = closes[i] - closes[i-1];
      gains.push(Math.max(change, 0));
      losses.push(Math.max(-change, 0));
    }
    for (let i = period; i < closes.length; i++) {
      const avgGain = gains.slice(i - period, i).reduce((a,b)=>a+b,0) / period;
      const avgLoss = losses.slice(i - period, i).reduce((a,b)=>a+b,0) / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
  }

  function calculateEMA(prices, period, prevEMA = []) {
    const k = 2 / (period + 1);
    if (prevEMA.length === 0) prevEMA = [prices[0]];
    for (let i = prevEMA.length; i < prices.length; i++) {
      prevEMA.push(prices[i] * k + prevEMA[i-1] * (1 - k));
    }
    return prevEMA;
  }

  function calculateMACD(closes) {
    const ema12 = calculateEMA(closes, 12);
    const ema26 = calculateEMA(closes, 26);
    const macd = ema12.map((e, i) => e - ema26[i]);
    const signal = calculateEMA(macd, 9);
    return { macd, signal };
  }

  function calculateBB(closes, period = 20, stdDev = 2) {
    const sma = calculateEMA(closes, period); // Use EMA pra suavidade
    const upper = [], lower = [];
    for (let i = 0; i < sma.length; i++) {
      const variance = closes.slice(i, i + period).reduce((a,b) => a + Math.pow(b - sma[i], 2), 0) / period;
      const deviation = Math.sqrt(variance);
      upper.push(sma[i] + stdDev * deviation);
      lower.push(sma[i] - stdDev * deviation);
    }
    return { middle: sma, upper, lower };
  }

  function calculateStochastic(highs, lows, closes, kPeriod = 14, kSmooth = 3, dSmooth = 3) {
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
  }

  function updateSMA() {
    const closes = candles.map(c => c.close);
    const len = closes.length;
    const data5 = [], data10 = [];
    for (let i = Math.max(0, len - 50); i < len; i++) { // Otimização: só últimas 50
      if (i >= 4) data5.push({ time: candles[i].time, value: closes.slice(i-4,i+1).reduce((a,b)=>a+b)/5 });
      if (i >= 9) data10.push({ time: candles[i].time, value: closes.slice(i-9,i+1).reduce((a,b)=>a+b)/10 });
    }
    sma5.setData(data5);
    sma10.setData(data10);
  }

  // Resto do código igual, mas com try/catch em loadCandles, connectTicker, trade, updateAllIndicators (chame updateSMA + outros).
  function updateAllIndicators() {
    try {
      const closes = candles.map(c => c.close);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      updateSMA();
      const rsi = calculateRSI(closes);
      rsiSeries.setData(closes.slice(-rsi.length).map((c,i) => ({ time: candles[candles.length - rsi.length + i].time, value: rsi[i] })));
      const macd = calculateMACD(closes);
      macdLine.setData(macd.macd.map((m,i) => ({ time: candles[i + closes.length - macd.macd.length].time, value: m })));
      macdSignal.setData(macd.signal.map((s,i) => ({ time: candles[i + closes.length - macd.signal.length].time, value: s })));
      const bb = calculateBB(closes);
      bbSeries.setData(bb.middle.map((m,i) => ({ time: candles[candles.length - bb.middle.length + i].time, value: m })));
      bbUpper.setData(bb.upper.map((u,i) => ({ time: candles[candles.length - bb.upper.length + i].time, value: u })));
      bbLower.setData(bb.lower.map((l,i) => ({ time: candles[candles.length - bb.lower.length + i].time, value: l })));
      const stoch = calculateStochastic(highs, lows, closes);
      stochK.setData(stoch.k.map((k,i) => ({ time: candles[candles.length - stoch.k.length + i].time, value
