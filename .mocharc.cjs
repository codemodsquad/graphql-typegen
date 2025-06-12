/* eslint-env node, es2018 */
const base = require('@jcoreio/toolchain-mocha/.mocharc.cjs')
const { getSpecs } = require('@jcoreio/toolchain-mocha')
module.exports = {
  ...base,
  require: [...base.require, 'test/configure.ts'],
  spec: getSpecs(['test']),
}
