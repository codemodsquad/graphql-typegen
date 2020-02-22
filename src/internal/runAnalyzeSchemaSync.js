#! /usr/bin/env node

/* eslint-disable */

var flatted = require('flatted')
var options = JSON.parse(process.argv[2])
if (/\.ts$/.test(options.target)) {
  require('@babel/register')({ extensions: ['.js', '.ts'] })
}
require(options.target)
  .default(JSON.parse(process.argv[2]))
  .then(
    function(result) {
      process.stdout.write(flatted.stringify(result), function() {
        process.exit(0)
      })
    },
    function(error) {
      console.error(error.stack) // eslint-disable-line no-console
      process.exit(1)
    }
  )
