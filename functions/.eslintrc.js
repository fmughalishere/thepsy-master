module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: [
    "eslint:recommended",
    "google",
  ],
  rules: {
    "quotes": ["error", "double"],
    "indent": ["error", 2],
    "max-len": ["error", { "code": 120 }],
    "object-curly-spacing": ["error", "always"],
    "eol-last": ["error", "always"],
    "linebreak-style": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
  },
};
