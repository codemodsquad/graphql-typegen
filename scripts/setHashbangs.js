const fs = require('fs')
const path = require('path')

function setHashbang(file, hashbang) {
  const data = fs.readFileSync(file, 'utf8')
  const updated = data.replace(/^#![^\r\n]*/, hashbang)
  fs.writeFileSync(file, updated, 'utf8')
}
setHashbang(
  path.resolve(__dirname, '..', 'analyzeSchema.js'),
  '#! /usr/bin/env node'
)
setHashbang(
  path.resolve(__dirname, '..', 'es', 'analyzeSchema.js'),
  '#! /usr/bin/env node'
)
