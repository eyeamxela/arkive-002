import { build, createServer } from 'vite';
import configuration from './vite.config.mjs';
// configFile:false avoids Vite writing a transient config bundle into the checkout.
const options = { ...configuration, configFile: false };
if (process.argv.includes('--build')) await build(options);
else { const server = await createServer(options); await server.listen(); server.printUrls(); }
