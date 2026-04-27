require('dotenv').config();
const express = require('express');

const completeRoute = require('./routes/complete');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/complete', completeRoute);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
