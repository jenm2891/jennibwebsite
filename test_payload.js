const http = require('http');

const token = "eyJ1aWQiOiJmMzZkMDkyMWIzODg0MTgyMGRkYTJmNWU2YjQ1Y2U2OCIsImV4cCI6MTc4NzUwNjM5MjE1N30.wVaau4y6G4PX2iQbUYy97_Tfhs88c4SypX5BuBp-RD0";

// Construct a ~50KB base64 string (50 * 1024 = 51200 characters)
const base64Char = 'A';
const repeatCount = 51200 - 'data:image/png;base64,'.length;
const imageUrl = 'data:image/png;base64,' + base64Char.repeat(repeatCount);

const postData = JSON.stringify({
  title: "Test Security Post",
  category: "Security",
  summary: "This is a test of server limits",
  body: "Lorem ipsum dolor sit amet...",
  imageUrl: imageUrl
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/blog/admin/posts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log(`BODY: ${body}`);
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

req.write(postData);
req.end();
