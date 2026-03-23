const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// POST /api/pagos - Procesar pago y completar salida
router.post('/', async (req, res) => {
  try {
    const { registro_id, tarifa_id, monto, metodo_pago, referencia, descuento, operador_id } = req.body;

    if (!registro_id || !monto || !metodo_pago || !operador_id) {
      return res.status(400).json({ ok: false, message: 'registro_id, monto, metodo_pago y operador_id son requeridos' });
    }

    // Verificar que el registro existe y esta activo
    const registro = await prisma.registros.findFirst({
      where: { id: registro_id, estado: 'activo' },
      include: { vehiculos: true, espacios: true }
    });

    if (!registro) {
      return res.status(404).json({ ok: false, message: 'Registro no encontrado o ya procesado' });
    }

    // Procesar pago, cerrar registro y liberar espacio en transaccion
    const [pago] = await prisma.$transaction([
      prisma.pagos.create({
        data: {
          registro_id,
          tarifa_id: tarifa_id || 1,
          monto: parseFloat(monto),
          metodo_pago,
          referencia: referencia || null,
          descuento: descuento || 0,
          operador_id
        }
      }),
      prisma.registros.update({
        where: { id: registro_id },
        data: { fecha_salida: new Date(), estado: 'cerrado', operador_salida_id: operador_id }
      }),
      prisma.espacios.update({
        where: { id: registro.espacio_id },
        data: { estado: 'libre' }
      })
    ]);

    res.json({
      ok: true,
      message: 'Pago procesado exitosamente',
      data: {
        pago_id: pago.id,
        monto: pago.monto,
        metodo: pago.metodo_pago,
        vehiculo: registro.vehiculos.placa,
        espacio_liberado: registro.espacios.numero,
        fecha: pago.created_at
      }
    });
  } catch (error) {
    console.error('Error en pago:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// GET /api/pagos/hoy - Pagos del dia
router.get('/hoy', async (req, res) => {
  try {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const pagos = await prisma.pagos.findMany({
      where: { created_at: { gte: hoy } },
      include: { registros: { include: { vehiculos: true } } },
      orderBy: { created_at: 'desc' }
    });

    const totalEfectivo = pagos.filter(p => p.metodo_pago === 'efectivo').reduce((sum, p) => sum + Number(p.monto), 0);
    const totalTarjeta = pagos.filter(p => p.metodo_pago === 'tarjeta').reduce((sum, p) => sum + Number(p.monto), 0);
    const totalDigital = pagos.filter(p => ['nequi', 'daviplata'].includes(p.metodo_pago)).reduce((sum, p) => sum + Number(p.monto), 0);

    res.json({
      ok: true,
      resumen: {
        total_pagos: pagos.length,
        total_efectivo: totalEfectivo,
        total_tarjeta: totalTarjeta,
        total_digital: totalDigital,
        total_general: totalEfectivo + totalTarjeta + totalDigital
      },
      data: pagos
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;