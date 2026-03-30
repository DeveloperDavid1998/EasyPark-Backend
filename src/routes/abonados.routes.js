const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');

// GET /api/abonados - Listar todos los abonados con sus vehiculos
router.get('/', async (req, res) => {
  try {
    const abonados = await prisma.abonados.findMany({
      include: {
        abonado_vehiculos: {
          include: { vehiculos: true }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    // Actualizar estado de los vencidos automaticamente
    const hoy = new Date();
    for (const ab of abonados) {
      for (const av of ab.abonado_vehiculos) {
        if (av.activo && new Date(av.fecha_fin) < hoy) {
          await prisma.abonado_vehiculos.update({
            where: { id: av.id },
            data: { activo: false }
          });
          av.activo = false;
        }
      }
      const todosVencidos = ab.abonado_vehiculos.length > 0 && ab.abonado_vehiculos.every(av => !av.activo);
      if (todosVencidos && ab.estado === 'activo') {
        await prisma.abonados.update({
          where: { id: ab.id },
          data: { estado: 'vencido' }
        });
        ab.estado = 'vencido';
      }
    }

    const data = abonados.map(ab => ({
      id: ab.id,
      nombre: ab.nombre,
      identificacion: ab.identificacion,
      telefono: ab.telefono,
      email: ab.email,
      estado: ab.estado,
      created_at: ab.created_at,
      vehiculos: ab.abonado_vehiculos.map(av => ({
        id: av.id,
        placa: av.vehiculos.placa,
        tipo: av.vehiculos.tipo,
        fecha_inicio: av.fecha_inicio,
        fecha_fin: av.fecha_fin,
        activo: av.activo
      }))
    }));

    res.json({ ok: true, total: data.length, data });
  } catch (error) {
    console.error('Error listando abonados:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// POST /api/abonados - Registrar nuevo abonado
router.post('/', async (req, res) => {
  try {
    const { nombre, telefono, placa, tipo } = req.body;

    if (!nombre || !telefono || !placa || !tipo) {
      return res.status(400).json({ ok: false, message: 'Nombre, telefono, placa y tipo son requeridos' });
    }

    let vehiculo = await prisma.vehiculos.findUnique({ where: { placa: placa.toUpperCase() } });
    if (!vehiculo) {
      vehiculo = await prisma.vehiculos.create({
        data: { placa: placa.toUpperCase(), tipo }
      });
    }

    const abonoExistente = await prisma.abonado_vehiculos.findFirst({
      where: { vehiculo_id: vehiculo.id, activo: true, fecha_fin: { gte: new Date() } }
    });
    if (abonoExistente) {
      return res.status(400).json({ ok: false, message: 'Este vehiculo ya tiene un abono activo vigente' });
    }

    const identificacion = `AB-${placa.toUpperCase()}-${Date.now().toString().slice(-4)}`;

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setMonth(fechaFin.getMonth() + 1);

    const abonado = await prisma.abonados.create({
      data: {
        nombre,
        identificacion,
        telefono,
        estado: 'activo',
        abonado_vehiculos: {
          create: {
            vehiculo_id: vehiculo.id,
            fecha_inicio: fechaInicio,
            fecha_fin: fechaFin,
            activo: true
          }
        }
      },
      include: {
        abonado_vehiculos: {
          include: { vehiculos: true }
        }
      }
    });

    res.status(201).json({
      ok: true,
      message: 'Abonado registrado exitosamente',
      data: {
        id: abonado.id,
        nombre: abonado.nombre,
        telefono: abonado.telefono,
        placa: vehiculo.placa,
        tipo: vehiculo.tipo,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin
      }
    });
  } catch (error) {
    console.error('Error registrando abonado:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// POST /api/abonados/:id/renovar - Renovar abono por 1 mes mas
router.post('/:id/renovar', async (req, res) => {
  try {
    const { id } = req.params;

    const abonado = await prisma.abonados.findUnique({
      where: { id: parseInt(id) },
      include: { abonado_vehiculos: { include: { vehiculos: true } } }
    });

    if (!abonado) {
      return res.status(404).json({ ok: false, message: 'Abonado no encontrado' });
    }

    const fechaInicio = new Date();
    const fechaFin = new Date();
    fechaFin.setMonth(fechaFin.getMonth() + 1);

    for (const av of abonado.abonado_vehiculos) {
      await prisma.abonado_vehiculos.update({
        where: { id: av.id },
        data: { fecha_inicio: fechaInicio, fecha_fin: fechaFin, activo: true }
      });
    }

    await prisma.abonados.update({
      where: { id: parseInt(id) },
      data: { estado: 'activo', updated_at: new Date() }
    });

    res.json({
      ok: true,
      message: 'Abono renovado por 1 mes',
      data: { fecha_inicio: fechaInicio, fecha_fin: fechaFin }
    });
  } catch (error) {
    console.error('Error renovando abono:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// DELETE /api/abonados/:id - Cancelar abono
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.abonado_vehiculos.updateMany({
      where: { abonado_id: parseInt(id) },
      data: { activo: false }
    });

    await prisma.abonados.update({
      where: { id: parseInt(id) },
      data: { estado: 'cancelado', updated_at: new Date() }
    });

    res.json({ ok: true, message: 'Abono cancelado exitosamente' });
  } catch (error) {
    console.error('Error cancelando abono:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;