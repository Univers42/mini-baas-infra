const express = require('express');
const swaggerUi = require('swagger-ui-express');

const app = express();
const port = process.env.PORT || 3000;

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'api-gateway API',
    version: '0.1.0',
    description: 'API Gateway service routes'
  },
  servers: [{ url: '/' }],
  paths: {
    '/': {
      get: {
        summary: 'Root endpoint',
        responses: {
          200: { description: 'Service status message' }
        }
      }
    },
    '/health': {
      get: {
        summary: 'Health check',
        responses: {
          200: { description: 'Healthy service' }
        }
      }
    }
  }
};

app.get('/openapi.json', (_req, res) => {
  res.status(200).json(openapiSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'api-gateway' });
});

app.get('/', (_req, res) => {
  res.status(200).send('api-gateway running');
});

app.listen(port, () => {
  console.log(`api-gateway listening on ${port}`);
});
