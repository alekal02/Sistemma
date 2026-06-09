const http = require('http');
const start = Date.now();
const req = http.get('http://localhost:3200/api/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Tempo:', Date.now() - start, 'ms');
    console.log('Resposta:', data.substring(0, 200));
    process.exit(0);
  });
});
req.on('error', (err) => {
  console.log('Erro:', err.message);
  console.log('Tempo:', Date.now() - start, 'ms');
  process.exit(1);
});
req.setTimeout(10000, () => {
  console.log('TIMEOUT apos 10s');
  req.destroy();
  process.exit(1);
});
