const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path'); // Necesario para path.join
const fs = require('fs'); // Necesario para manejo de archivos
const multer = require('multer');
const bcrypt = require('bcryptjs'); // Para hashear contraseñas

const app = express();
const port = 8080;

// --- Configuración de Multer ---
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });
// --- Fin Configuración de Multer ---

// --- Configuración de CORS Detallada ---
const corsOptions = {
  origin: 'http://localhost:4200', // Puerto de tu frontend Angular
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

// --- Conexión a Base de Datos (usando promesas y pool) ---
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'ecommerce',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};
const pool = mysql.createPool(dbConfig);

// (Opcional pero recomendado) Verificar conexión al inicio con una query de prueba
async function verificarConexionDB() {
  try {
    const connection = await pool.getConnection(); // Obtener una conexión del pool
    console.log('Conectado exitosamente a la base de datos MySQL (pool).');
    connection.release(); // Liberar la conexión de vuelta al pool
  } catch (error) {
    console.error('Error CRÍTICO al conectar con la base de datos MySQL (pool):', error.message || error);
    process.exit(1); // Salir si no se puede conectar
  }
}
verificarConexionDB(); // Llamar a la función para probar la conexión al inicio

// --- RUTAS API ---  //

// --- RUTAS DE AUTENTICACIÓN SIMPLIFICADAS ---
app.post('/api/auth/registro', async (req, res) => {
  console.log('POST /api/auth/registro - Recibido:', req.body);
  const { nombre, apellido, correo, contrasena } = req.body;

  if (!nombre || !apellido || !correo || !contrasena) {
    return res.status(400).json({ message: 'Todos los campos son requeridos.' });
  }
  if (contrasena.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ message: 'Formato de correo inválido.' });
  }

  try {
    const [usuariosExistentes] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
    if (usuariosExistentes.length > 0) {
      return res.status(409).json({ message: 'El correo electrónico ya está registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const contrasenaHasheada = await bcrypt.hash(contrasena, salt);

    const [resultado] = await pool.query(
      'INSERT INTO usuarios (nombre, apellido, correo, contrasena, rol) VALUES (?, ?, ?, ?, ?)',
      [nombre, apellido, correo, contrasenaHasheada, 'cliente']
    );

    res.status(201).json({ message: 'Usuario registrado exitosamente.', usuarioId: resultado.insertId });
  } catch (error) {
    console.error('Error en /api/auth/registro:', error);
    res.status(500).json({ message: 'Error interno del servidor al registrar.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  console.log('POST /api/auth/login - Recibido:', req.body);
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ message: 'Correo y contraseña son requeridos.' });
  }

  try {
    const [usuarios] = await pool.query('SELECT id, nombre, apellido, correo, contrasena, rol FROM usuarios WHERE correo = ?', [correo]);

    if (usuarios.length === 0) {
      return res.status(401).json({ message: 'Credenciales inválidas (usuario no encontrado).' });
    }

    const usuario = usuarios[0];
    const esContrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena);

    if (!esContrasenaValida) {
      return res.status(401).json({ message: 'Credenciales inválidas (contraseña incorrecta).' });
    }

    const { contrasena: _, ...usuarioParaEnviar } = usuario;
    res.json({
      message: 'Inicio de sesión exitoso.',
      usuario: usuarioParaEnviar
    });
  } catch (error) {
    console.error('Error en /api/auth/login:', error);
    res.status(500).json({ message: 'Error interno del servidor durante el login.' });
  }
});

// NUEVO ENDPOINT PARA RECUPERACIÓN SIMPLE (ya lo tenías, solo asegurando que esté)
app.post('/api/auth/recuperar-simple', async (req, res) => {
  console.log('POST /api/auth/recuperar-simple - Recibido:', req.body);
  const { correo, nuevaContrasena } = req.body;

  if (!correo || !nuevaContrasena) {
    return res.status(400).json({ message: 'Correo y nueva contraseña son requeridos.' });
  }
  if (nuevaContrasena.length < 6) {
    return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      return res.status(400).json({ message: 'Formato de correo inválido.' });
  }

  try {
    const [usuarios] = await pool.query('SELECT id FROM usuarios WHERE correo = ?', [correo]);
    if (usuarios.length === 0) {
      return res.status(404).json({ message: 'El correo electrónico no se encuentra registrado.' });
    }

    const salt = await bcrypt.genSalt(10);
    const contrasenaHasheada = await bcrypt.hash(nuevaContrasena, salt);

    const [resultadoUpdate] = await pool.query(
      'UPDATE usuarios SET contrasena = ? WHERE correo = ?',
      [contrasenaHasheada, correo]
    );

    if (resultadoUpdate.affectedRows > 0) {
      console.log('Contraseña actualizada exitosamente para el correo:', correo);
      res.status(200).json({ message: 'Contraseña actualizada exitosamente. Ya puedes iniciar sesión con tu nueva contraseña.' });
    } else {
      console.error('Error inesperado: Usuario encontrado pero no se pudo actualizar la contraseña para:', correo);
      res.status(500).json({ message: 'Error al actualizar la contraseña.' });
    }
  } catch (error) {
    console.error('Error en /api/auth/recuperar-simple:', error);
    res.status(500).json({ message: 'Error interno del servidor al recuperar la contraseña.' });
  }
});

// Endpoint "actualizar-contrasena-admin" (sin cambios respecto a tu versión, es conceptual)
app.put('/api/auth/actualizar-contrasena-admin/:idUsuarioAModificar', async (req, res) => {
    const { idUsuarioAModificar } = req.params;
    const { nuevaContrasena, correoAdmin /*, contrasenaAdmin */ } = req.body;
    if (correoAdmin !== 'admin@example.com') {
        return res.status(403).json({ message: 'No autorizado.' });
    }
    if (!nuevaContrasena || nuevaContrasena.length < 6) {
        return res.status(400).json({ message: 'Nueva contraseña inválida.' });
    }
    try {
        const salt = await bcrypt.genSalt(10);
        const contrasenaHasheada = await bcrypt.hash(nuevaContrasena, salt);
        const [resultado] = await pool.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [contrasenaHasheada, idUsuarioAModificar]);
        if (resultado.affectedRows === 0) return res.status(404).json({ message: 'Usuario a modificar no encontrado.' });
        res.json({ message: `Contraseña actualizada para usuario ID ${idUsuarioAModificar}` });
    } catch (error) {
        console.error('Error actualizando contraseña admin:', error);
        res.status(500).json({ message: 'Error actualizando contraseña.' });
    }
});


// --- RUTAS DE PRODUCTOS Y ARCHIVOS (como las tenías, usando pool.query) ---
app.post('/api/upload', upload.single('file'), (req, res) => {
  console.log('--- Petición a POST /api/upload recibida ---');
  if (req.file) {
    console.log('Archivo recibido:', req.file.filename);
    const filePath = `uploads/${req.file.filename}`;
    res.json({ path: filePath });
  } else {
    console.log('No se recibió ningún archivo en /api/upload.');
    res.status(400).json({ message: 'No se subió ningún archivo.' });
  }
});

app.delete('/api/files/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(uploadsDir, filename);
  fs.unlink(filePath, (err) => {
    if (err) {
      if (err.code === 'ENOENT') return res.status(404).json({ message: 'Archivo no encontrado.' });
      console.error('Error eliminando archivo:', err);
      return res.status(500).json({ message: 'Error al eliminar archivo.' });
    }
    res.status(200).json({ message: 'Archivo eliminado exitosamente.' });
  });
});

app.get('/api/productos', async (req, res) => {
  console.log('GET /api/productos - Solicitud recibida');
  try {
    const [results] = await pool.query('SELECT * FROM productos');
    console.log(`GET /api/productos - Enviando ${results.length} productos.`);
    res.json(results);
  } catch (err) {
    console.error('GET /api/productos - Error en DB:', err);
    res.status(500).json({ message: 'Error al obtener productos', error: err.message });
  }
});

app.get('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`GET /api/productos/${id} - Solicitud recibida`);
  try {
    const [results] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
    if (results.length === 0) return res.status(404).json({ message: 'Producto no encontrado' });
    console.log(`GET /api/productos/${id} - Enviando producto.`);
    res.json(results[0]);
  } catch (err) {
    console.error(`GET /api/productos/${id} - Error en DB:`, err);
    return res.status(500).json({ message: 'Error al obtener el producto', error: err.message });
  }
});

app.post('/api/productos', async (req, res) => {
  const { nombre, cantidad, precio, imagen } = req.body;
  if (!nombre || cantidad === undefined || precio === undefined) {
    return res.status(400).json({ message: 'Nombre, cantidad y precio son requeridos.' });
  }
  console.log('POST /api/productos - Datos recibidos:', req.body);
  try {
    const [results] = await pool.query(
      'INSERT INTO productos (nombre, cantidad, precio, imagen) VALUES (?, ?, ?, ?)',
      [nombre, Number(cantidad), Number(precio), imagen || null]
    );
    console.log('POST /api/productos - Producto creado con ID:', results.insertId);
    res.status(201).json({ id: results.insertId, nombre, cantidad: Number(cantidad), precio: Number(precio), imagen });
  } catch (err) {
    console.error('POST /api/productos - Error en DB:', err);
    res.status(500).json({ message: 'Error al crear producto', error: err.message });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, cantidad, precio, imagen } = req.body;
  console.log(`PUT /api/productos/${id} - Datos recibidos:`, req.body);
  if (!nombre || cantidad === undefined || precio === undefined) {
    return res.status(400).json({ message: 'Nombre, cantidad y precio son requeridos para la actualización.' });
  }
  try {
    const [results] = await pool.query(
      'UPDATE productos SET nombre = ?, cantidad = ?, precio = ?, imagen = ? WHERE id = ?',
      [nombre, Number(cantidad), Number(precio), imagen, id]
    );
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado para actualizar' });
    }
    console.log(`PUT /api/productos/${id} - Producto actualizado.`);
    const [updatedProductRows] = await pool.query('SELECT * FROM productos WHERE id = ?', [id]);
    res.json(updatedProductRows[0] || { id: Number(id), nombre, cantidad: Number(cantidad), precio: Number(precio), imagen });
  } catch (err) {
    console.error(`PUT /api/productos/${id} - Error en DB:`, err);
    res.status(500).json({ message: 'Error al actualizar producto', error: err.message });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`DELETE /api/productos/${id} - Solicitud recibida`);
  try {
    const [results] = await pool.query('DELETE FROM productos WHERE id = ?', [id]);
    if (results.affectedRows === 0) {
      return res.status(404).json({ message: 'Producto no encontrado para eliminar' });
    }
    console.log(`DELETE /api/productos/${id} - Producto eliminado.`);
    res.json({ message: 'Producto eliminado exitosamente' });
  } catch (err) {
    console.error(`DELETE /api/productos/${id} - Error en DB:`, err);
    res.status(500).json({ message: 'Error al eliminar producto', error: err.message });
  }
});

// Manejador para rutas no encontradas (404)
app.use((req, res, next) => {
  console.log(`404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: `La ruta ${req.originalUrl} no fue encontrada en el servidor.` });
});

// Manejador de errores global
app.use((err, req, res, next) => {
  console.error("Error global en el servidor:", err); // Loguear el error completo puede ser útil
  res.status(500).json({ message: 'Ocurrió un error inesperado en el servidor.', error: err.message });
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
  console.log(`Directorio de subidas de imágenes: ${uploadsDir}`);
  console.log(`Imágenes servidas desde: http://localhost:${port}/uploads`);
});