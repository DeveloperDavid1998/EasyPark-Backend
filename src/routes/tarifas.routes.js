const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/tarifas - Listar tarifas activas
router.get('/', async (req, res) => {
  try {
    const tarifas = await prisma.tarifas.findMany({
      where: { activa: true },
      orderBy: [{ tipo_vehiculo: 'asc' }, { tipo_tarifa: 'asc' }]
    });
    res.json({ ok: true, total: tarifas.length, data: tarifas });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// PUT /api/tarifas/:id - Actualizar tarifa
router.put('/:id', async (req, res) => {
  try {
    const { valor } = req.body;
    const tarifa = await prisma.tarifas.update({
      where: { id: parseInt(req.params.id) },
      data: { valor: parseFloat(valor) }
    });
    res.json({ ok: true, data: tarifa });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;