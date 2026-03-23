const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const generateCode = require('../utils/generateCode');

// POST /api/registros/entrada - Registrar entrada
router.post('/entrada', async (req, res) => {
  try {
    const { placa, tipo, operador_id } = req.body;

    if (!placa || !tipo || !operador_id) {
      return res.status(400).json({ ok: false, message: 'Placa, tipo y operador_id son requeridos' });
    }

    // Buscar o crear vehiculo
    let vehiculo = await prisma.vehiculos.findUnique({ where: { placa: placa.toUpperCase() } });
    if (!vehiculo) {
      vehiculo = await prisma.vehiculos.create({ data: { placa: placa.toUpperCase(), tipo } });
    }

    // Verificar si ya esta estacionado
    const yaEstacionado = await prisma.registros.findFirst({
      where: { vehiculo_id: vehiculo.id, estado: 'activo' }
    });
    if (yaEstacionado) {
      return res.status(400).json({ ok: false, message: 'Este vehiculo ya esta estacionado' });
    }

    // Buscar espacio libre
    const espacio = await prisma.espacios.findFirst({
      where: { tipo_vehiculo: tipo, estado: 'libre' }
    });
    if (!espacio) {
      return res.status(400).json({ ok: false, message: 'No hay espacios disponibles para ' + tipo });
    }

    // Verificar si es abonado
    const abonado = await prisma.abonado_vehiculos.findFirst({
      where: { vehiculo_id: vehiculo.id, activo: true, fecha_fin: { gte: new Date() } }
    });

    // Crear registro y ocupar espacio en una transaccion
    const tiquete_codigo = generateCode('EPK');

    const [registro] = await prisma.$transaction([
      prisma.registros.create({
        data: {
          vehiculo_id: vehiculo.id,
          espacio_id: espacio.id,
          tiquete_codigo,
          operador_entrada_id: operador_id
        }
      }),
      prisma.espacios.update({
        where: { id: espacio.id },
        data: { estado: 'ocupado' }
      })
    ]);

    res.status(201).json({
      ok: true,
      data: {
        registro_id: registro.id,
        tiquete: tiquete_codigo,
        vehiculo: { placa: vehiculo.placa, tipo: vehiculo.tipo },
        espacio: { numero: espacio.numero, zona: espacio.zona },
        entrada: registro.fecha_entrada,
        es_abonado: !!abonado
      }
    });
  } catch (error) {
    console.error('Error en entrada:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// POST /api/registros/salida - Registrar salida y calcular cobro
router.post('/salida', async (req, res) => {
  try {
    const { tiquete_codigo, operador_id } = req.body;

    if (!tiquete_codigo || !operador_id) {
      return res.status(400).json({ ok: false, message: 'Tiquete y operador_id son requeridos' });
    }

    // Buscar registro activo
    const registro = await prisma.registros.findFirst({
      where: { tiquete_codigo, estado: 'activo' },
      include: { vehiculos: true, espacios: true }
    });

    if (!registro) {
      return res.status(404).json({ ok: false, message: 'Tiquete no encontrado o ya fue procesado' });
    }

    // Calcular tiempo
    const entrada = new Date(registro.fecha_entrada);
    const salida = new Date();
    const diffMs = salida - entrada;
    const diffMinutos = Math.ceil(diffMs / 60000);
    const diffHoras = Math.ceil(diffMinutos / 60);

    // Verificar si es abonado
    const abonado = await prisma.abonado_vehiculos.findFirst({
      where: { vehiculo_id: registro.vehiculo_id, activo: true, fecha_fin: { gte: new Date() } }
    });

    let monto = 0;
    let tarifa = null;

    if (!abonado) {
      // Buscar tarifa por fraccion
      tarifa = await prisma.tarifas.findFirst({
        where: { tipo_vehiculo: registro.vehiculos.tipo, tipo_tarifa: 'fraccion', activa: true }
      });

      // Buscar tarifa plena
      const tarifaPlena = await prisma.tarifas.findFirst({
        where: { tipo_vehiculo: registro.vehiculos.tipo, tipo_tarifa: 'plena', activa: true }
      });

      if (tarifa) {
        monto = diffHoras * Number(tarifa.valor);
      }

      // Si la tarifa plena es mas barata, usar esa
      if (tarifaPlena && Number(tarifaPlena.valor) < monto) {
        monto = Number(tarifaPlena.valor);
        tarifa = tarifaPlena;
      }
    }

    const horas = Math.floor(diffMinutos / 60);
    const minutos = diffMinutos % 60;

    res.json({
      ok: true,
      data: {
        registro_id: registro.id,
        tiquete: registro.tiquete_codigo,
        vehiculo: { placa: registro.vehiculos.placa, tipo: registro.vehiculos.tipo },
        espacio: { numero: registro.espacios.numero, zona: registro.espacios.zona },
        entrada: registro.fecha_entrada,
        salida: salida.toISOString(),
        tiempo: `${horas}h ${minutos}m`,
        tiempo_minutos: diffMinutos,
        es_abonado: !!abonado,
        tarifa_aplicada: tarifa ? { id: tarifa.id, tipo: tarifa.tipo_tarifa, valor: Number(tarifa.valor) } : null,
        monto
      }
    });
  } catch (error) {
    console.error('Error en salida:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// GET /api/registros/activos - Vehiculos actualmente estacionados
router.get('/activos', async (req, res) => {
  try {
    const registros = await prisma.registros.findMany({
      where: { estado: 'activo' },
      include: { vehiculos: true, espacios: true },
      orderBy: { fecha_entrada: 'desc' }
    });

    const data = registros.map(r => {
      const diffMs = new Date() - new Date(r.fecha_entrada);
      const mins = Math.ceil(diffMs / 60000);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return {
        registro_id: r.id,
        tiquete: r.tiquete_codigo,
        placa: r.vehiculos.placa,
        tipo: r.vehiculos.tipo,
        espacio: r.espacios.numero,
        zona: r.espacios.zona,
        entrada: r.fecha_entrada,
        tiempo: `${h}h ${m}m`
      };
    });

    res.json({ ok: true, total: data.length, data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;