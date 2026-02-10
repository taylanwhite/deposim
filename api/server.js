// Local Express server for development (not used on Vercel).
const app = require('./app');
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API running at http://localhost:${PORT}`));
