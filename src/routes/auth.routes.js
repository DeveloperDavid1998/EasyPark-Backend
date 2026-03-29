const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { authMiddleware } = require('../middlewares/auth');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: 'Email y password son requeridos' });
    }

    const usuario = await prisma.usuarios.findUnique({ where: { email } });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ ok: false, message: 'Credenciales incorrectas' });
    }

    const passwordValido = await bcrypt.compare(password, usuario.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ ok: false, message: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol: usuario.rol, nombre: usuario.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    await prisma.usuarios.update({
      where: { id: usuario.id },
      data: { ultimo_acceso: new Date() }
    });

    res.json({
      ok: true,
      token,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ ok: false, message: 'Nombre, email y password son requeridos' });
    }

    const existente = await prisma.usuarios.findUnique({ where: { email } });
    if (existente) {
      return res.status(400).json({ ok: false, message: 'El email ya esta registrado' });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const usuario = await prisma.usuarios.create({
      data: { nombre, email, password_hash, rol: rol || 'operador' }
    });

    res.status(201).json({
      ok: true,
      usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// GET /api/auth/me - Obtener usuario actual
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const usuario = await prisma.usuarios.findUnique({
      where: { id: req.usuario.id },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, ultimo_acceso: true }
    });
    res.json({ ok: true, usuario });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});
router.get('/usuarios', authMiddleware, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para ver usuarios' });
    }

    const usuarios = await prisma.usuarios.findMany({
      select: { id: true, nombre: true, email: true, rol: true, activo: true, ultimo_acceso: true, created_at: true },
      orderBy: { created_at: 'asc' }
    });

    res.json({ ok: true, data: usuarios });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

// PUT /api/auth/usuarios/:id - Actualizar rol o estado (solo admin)
router.put('/usuarios/:id', authMiddleware, async (req, res) => {
  try {
    if (req.usuario.rol !== 'admin') {
      return res.status(403).json({ ok: false, message: 'No tienes permisos' });
    }

    const { id } = req.params;
    const { rol, activo } = req.body;

    const data = {};
    if (rol) data.rol = rol;
    if (activo !== undefined) data.activo = activo;

    const usuario = await prisma.usuarios.update({
      where: { id: parseInt(id) },
      select: { id: true, nombre: true, email: true, rol: true, activo: true }
    , data });

    res.json({ ok: true, usuario });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ ok: false, message: 'Error del servidor' });
  }
});

module.exports = router;