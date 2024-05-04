/* eslint-env node, es2018 */
module.exports = {
  extends: [require.resolve('@jcoreio/toolchain/eslintConfig.cjs')],
  env: {
    node: true,
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 0,
    '@typescript-eslint/no-use-before-define': 0,
  },
}
