const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/vehiculos - Listar vehiculos
router.get('/', async (req, res) => {
  try {
    const { placa, tipo } = req.query;
    const where = {};
    if (placa) where.placa = { contains: placa, mode: 'insensitive' };
    if (tipo) where.tipo = tipo;

    const vehiculos = await prisma.vehiculos.findMany({ where, orderBy: { created_at: 'desc' }, take: 50 });
    res.json({ ok: true, total: vehiculos.length, data: vehiculos });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// GET /api/vehiculos/placa/:placa - Buscar por placa
router.get('/placa/:placa', async (req, res) => {
  try {
    const vehiculo = await prisma.vehiculos.findUnique({ where: { placa: req.params.placa.toUpperCase() } });
    if (!vehiculo) return res.status(404).json({ ok: false, message: 'Vehiculo no encontrado' });
    res.json({ ok: true, data: vehiculo });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// POST /api/vehiculos - Crear vehiculo
router.post('/', async (req, res) => {
  try {
    const { placa, tipo, observaciones } = req.body;
    if (!placa || !tipo) return res.status(400).json({ ok: false, message: 'Placa y tipo son requeridos' });

    const existente = await prisma.vehiculos.findUnique({ where: { placa: placa.toUpperCase() } });
    if (existente) return res.json({ ok: true, data: existente, message: 'Vehiculo ya existia' });

    const vehiculo = await prisma.vehiculos.create({
      data: { placa: placa.toUpperCase(), tipo, observaciones }
    });
    res.status(201).json({ ok: true, data: vehiculo });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;