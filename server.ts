import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { openDatabase } from './server/db';
import { createAttendanceApp } from './server/app';
import { PROJECT_ROOT, validateStartupEnvironment } from './server/envConfig';

function resolveServerPort(): number {
  const portFlagIdx = process.argv.indexOf('--port');
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const cliPort = Number(process.argv[portFlagIdx + 1]);
    if (Number.isInteger(cliPort) && cliPort > 0 && cliPort < 65536) {
      return cliPort;
    }
  }
  const eqPortArg = process.argv.find((arg) => arg.startsWith('--port='));
  if (eqPortArg) {
    const cliPort = Number(eqPortArg.slice('--port='.length));
    if (Number.isInteger(cliPort) && cliPort > 0 && cliPort < 65536) {
      return cliPort;
    }
  }

  const isProd = process.env.NODE_ENV === 'production';
  const nginxPort = process.env.NGINX_PORT?.trim();
  const envPortRaw = process.env.PORT?.trim();
  if (!isProd && nginxPort && envPortRaw === nginxPort) {
    const defaultAppPort = Number(process.env.DEFAULT_APP_PORT);
    if (Number.isInteger(defaultAppPort) && defaultAppPort > 0 && defaultAppPort < 65536) {
      return defaultAppPort;
    }
    return 3000;
  }

  const envPort = Number(envPortRaw);
  if (Number.isInteger(envPort) && envPort > 0 && envPort < 65536) {
    return envPort;
  }
  return 3000;
}

async function startServer() {
  const envConfig = validateStartupEnvironment();
  const db = openDatabase(envConfig.dbPath);
  const app = createAttendanceApp(db);

  const httpServer = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(PROJECT_ROOT, 'dist');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use('/api', (_req, res) => {
      res.status(404).json({ ok: false, error: 'Ruta API no encontrada.' });
    });
    app.use(vite.middlewares);
  } else {
    app.use('/api', (_req, res) => {
      res.status(404).json({ ok: false, error: 'Ruta API no encontrada.' });
    });
    app.use(express.static(distDir));
    app.use((req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = resolveServerPort();
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(
      `SGE Escolar Server activo en http://0.0.0.0:${port} (${isProd ? 'producción' : 'desarrollo'})`
    );
    console.log(
      `[Config] DB: ${envConfig.dbPath} (${
        envConfig.dbFromEnv
          ? envConfig.envFileLoaded
            ? 'ATTENDANCE_DB_PATH (.env/entorno)'
            : 'ATTENDANCE_DB_PATH (entorno)'
          : 'ruta persistente por defecto'
      }, directorio y permisos R/W verificados) | Sesión: ${
        envConfig.sessionSecretMode === 'env'
          ? 'SESSION_SECRET activo'
          : 'clave aleatoria efímera CSPRNG en memoria (configure SESSION_SECRET para persistir sesiones entre reinicios)'
      } | Passcode Admin: ${
        envConfig.adminPasscodeConfigured ? 'configurado en entorno' : 'no definido (alta inicial en pantalla)'
      }`
    );
  });
}

startServer().catch((err) => {
  console.error('Error fatal iniciando el servidor:', err);
  process.exit(1);
});
