const http = require('http');

const data = JSON.stringify({
  tableId: 'T1',
  item: { id: 'test-dish', price: 10, name: 'Test Dish' }
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/orders/add-item',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(data);
req.end();
