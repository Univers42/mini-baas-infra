import express from 'express';

const app = express();
const port = Number(process.env.PORT || 3001);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'schema-service' });
});

app.get('/', (_req, res) => {
  res.status(200).send('schema-service running');
});

app.listen(port, () => {
  console.log(`schema-service listening on ${port}`);
});
