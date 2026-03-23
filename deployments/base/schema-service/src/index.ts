import express from 'express';
import swaggerUi from 'swagger-ui-express';

const app = express();
const port = Number(process.env.PORT || 3001);

const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'schema-service API',
    version: '0.1.0',
    description: 'Schema service routes'
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
  res.status(200).json({ status: 'ok', service: 'schema-service' });
});

app.get('/', (_req, res) => {
  res.status(200).send('schema-service running');
});

app.listen(port, () => {
  console.log(`schema-service listening on ${port}`);
});
