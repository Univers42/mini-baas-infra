const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

app.get('/', (_req, res) => {
  res.status(200).send('api-gateway running');
});

app.listen(port, () => {
  console.log(`api-gateway listening on ${port}`);
});
