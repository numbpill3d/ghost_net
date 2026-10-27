const loopbackHosts = ['127.0.0.1', 'localhost', '::1'];
const configuredHosts = (process.env.NO_PROXY || process.env.no_proxy || '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

process.env.NO_PROXY = [...new Set([...configuredHosts, ...loopbackHosts])].join(',');
