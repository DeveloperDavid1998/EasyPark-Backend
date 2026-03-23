const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

router.get('/', async (req, res) => {
  try {
    const espacios = await prisma.espacios.findMany();
    res.json({ ok: true, total: espacios.length, data: espacios });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

router.get('/disponibilidad', async (req, res) => {
  try {
    const total = await prisma.espacios.count();
    const ocupados = await prisma.espacios.count({ where: { estado: 'ocupado' } });
    const libres = total - ocupados;
    res.json({ ok: true, total, ocupados, libres, porcentaje_ocupacion: Math.round((ocupados / total) * 100) });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;