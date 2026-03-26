const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'EasyPark API funcionando', timestamp: new Date().toISOString() });
});

app.use('/api/auth', require('./src/routes/auth.routes'));
app.use('/api/espacios', require('./src/routes/espacios.routes'));
app.use('/api/vehiculos', require('./src/routes/vehiculos.routes'));
app.use('/api/registros', require('./src/routes/registros.routes'));
app.use('/api/pagos', require('./src/routes/pagos.routes'));
app.use('/api/tarifas', require('./src/routes/tarifas.routes'));

app.listen(PORT, () => {
  console.log(`EasyPark API corriendo en http://localhost:${PORT}`);
});