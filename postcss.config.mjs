const config = {
  plugins: {
    // 1. Tailwind gera o CSS (com oklch)
    "@tailwindcss/postcss": {},
    // 2. Converte oklch() → rgb() para compatibilidade com iOS < 15.4 e Android Chrome < 111
    "@csstools/postcss-oklab-function": { preserve: false },
    // 3. Adiciona prefixos -webkit- (backdrop-filter, etc.) para browsers antigos
    "autoprefixer": {},
  },
};

export default config;
