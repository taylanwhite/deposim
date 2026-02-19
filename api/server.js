// Local Express server for development (not used on Vercel).
const app = require('./app');
const betterstack = require('./betterstack');
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
  betterstack.info('API server started', { port: PORT, env: process.env.NODE_ENV || 'development' });
});
