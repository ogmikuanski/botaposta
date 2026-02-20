module.exports = {
  apps: [
    {
      name: 'slapostadofree',
      script: 'src/index.js',
      watch: false,
      max_memory_restart: '1G',
      exec_mode: 'fork',
    },
  ],
};